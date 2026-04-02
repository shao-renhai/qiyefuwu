"""
OCR service for credit report images and scanned PDFs.

Uses Tesseract OCR to extract text from images and scanned PDF files,
then feeds the extracted text into the credit report parser.
"""

import os
import shutil
from typing import Optional

from services.credit_parser import extract_credit_data

# Ensure Homebrew binaries (tesseract, poppler) are discoverable
_EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"]
for p in _EXTRA_PATHS:
    if p not in os.environ.get("PATH", "") and os.path.isdir(p):
        os.environ["PATH"] = p + ":" + os.environ.get("PATH", "")

# Auto-detect tesseract path if not already set
_tesseract_path = shutil.which("tesseract")
if _tesseract_path:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = _tesseract_path


def ocr_image(filepath: str) -> str:
    """Run Tesseract OCR on an image file.

    Args:
        filepath: path to an image file (PNG, JPG, TIFF, etc.)

    Returns:
        Extracted text from the image.

    Raises:
        ValueError: if no text could be extracted.
    """
    import pytesseract
    from PIL import Image

    image = Image.open(filepath)
    text = pytesseract.image_to_string(image, lang="chi_sim+eng")
    return text


def ocr_pdf(filepath: str) -> str:
    """Convert a scanned PDF to images and OCR each page.

    Uses pdf2image to convert PDF pages to images at 300 DPI,
    then runs Tesseract OCR on each page image.

    Args:
        filepath: path to a scanned PDF file.

    Returns:
        Combined extracted text from all pages.

    Raises:
        ValueError: if no text could be extracted from any page.
    """
    import pytesseract
    from pdf2image import convert_from_path

    images = convert_from_path(filepath, dpi=200)
    all_text = []
    for image in images:
        page_text = pytesseract.image_to_string(image, lang="chi_sim+eng")
        if page_text and page_text.strip():
            all_text.append(page_text)

    return "\n".join(all_text)


def parse_credit_report_image(
    filepath: str, reference_date: Optional[str] = None
) -> dict:
    """OCR an image of a credit report and extract structured data.

    Args:
        filepath: path to credit report image file.
        reference_date: optional reference date (YYYY-MM-DD).

    Returns:
        Dict with extracted credit data.

    Raises:
        ValueError: if no text could be extracted from the image.
    """
    text = ocr_image(filepath)
    if not text or not text.strip():
        raise ValueError(
            "无法从图片中提取文本，请确保图片清晰且包含征信报告内容。"
        )
    return extract_credit_data(text, reference_date)


def parse_credit_report_scanned_pdf(
    filepath: str, reference_date: Optional[str] = None
) -> dict:
    """OCR a scanned PDF credit report and extract structured data.

    Args:
        filepath: path to scanned PDF credit report file.
        reference_date: optional reference date (YYYY-MM-DD).

    Returns:
        Dict with extracted credit data.

    Raises:
        ValueError: if no text could be extracted from the PDF.
    """
    text = ocr_pdf(filepath)
    if not text or not text.strip():
        raise ValueError(
            "无法从扫描PDF中提取文本，请确保PDF清晰且包含征信报告内容。"
        )
    return extract_credit_data(text, reference_date)
