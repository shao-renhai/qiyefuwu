"""Credit report image gallery routes — upload / list / delete."""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from db.database import get_db, Client, CreditImage, User
from services.auth import get_current_user

router = APIRouter(prefix="/api/credit-image", tags=["credit-image"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "credit_images")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_IMAGES_PER_CLIENT = 100


class ImageResponse(BaseModel):
    id: int
    client_id: int
    filename: str
    original_name: str | None
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/upload", response_model=ImageResponse)
async def upload_image(
    file: UploadFile = File(...),
    client_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify client
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Check limit
    count = db.query(CreditImage).filter(CreditImage.client_id == client_id).count()
    if count >= MAX_IMAGES_PER_CLIENT:
        raise HTTPException(status_code=400, detail=f"最多上传 {MAX_IMAGES_PER_CLIENT} 张图片")

    # Validate type
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"):
        raise HTTPException(status_code=400, detail=f"不支持的图片格式: {ext}")

    # Save
    saved_name = f"{uuid.uuid4().hex}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_name)
    content = await file.read()
    with open(saved_path, "wb") as f:
        f.write(content)

    # Next sort order
    max_order = db.query(CreditImage.sort_order).filter(
        CreditImage.client_id == client_id
    ).order_by(CreditImage.sort_order.desc()).first()
    next_order = (max_order[0] + 1) if max_order else 0

    img = CreditImage(
        client_id=client_id,
        filename=saved_name,
        original_name=filename,
        sort_order=next_order,
    )
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.get("/{client_id}", response_model=list[ImageResponse])
def list_images(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = db.query(Client).filter(Client.id == client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return db.query(CreditImage).filter(
        CreditImage.client_id == client_id
    ).order_by(CreditImage.sort_order).all()


@router.get("/file/{filename}")
def get_image_file(filename: str):
    """Serve image file (no auth — images are accessed by unique UUID filenames)."""
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@router.delete("/{image_id}")
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = db.query(CreditImage).filter(CreditImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    # Verify ownership
    client = db.query(Client).filter(Client.id == img.client_id, Client.user_id == current_user.id).first()
    if not client:
        raise HTTPException(status_code=403, detail="Permission denied")
    # Delete file
    path = os.path.join(UPLOAD_DIR, img.filename)
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass
    db.delete(img)
    db.commit()
    return {"status": "ok"}
