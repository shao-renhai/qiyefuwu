import { Upload, type UploadFile } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const { Dragger } = Upload;

interface FileUploaderProps {
  accept: string;
  hint: string;
  onFileSelected: (file: File) => void;
  fileList?: UploadFile[];
  loading?: boolean;
}

export default function FileUploader({
  accept,
  hint,
  onFileSelected,
  fileList,
  loading,
}: FileUploaderProps) {
  return (
    <Dragger
      accept={accept}
      fileList={fileList}
      multiple={false}
      disabled={loading}
      beforeUpload={(file) => {
        onFileSelected(file);
        return false;
      }}
      showUploadList={!!fileList}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
      <p className="ant-upload-hint">{hint}</p>
    </Dragger>
  );
}
