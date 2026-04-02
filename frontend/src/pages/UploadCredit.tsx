import { useState } from 'react';
import { Button, Card, Input, message, Space, Spin } from 'antd';
import type { UploadFile } from 'antd';
import FileUploader from '../components/FileUploader';
import CreditSummary from '../components/CreditSummary';
import { createClient, uploadCreditReport, type CreditReportData } from '../services/api';

interface UploadCreditProps {
  onDone: (clientId: number, clientName: string) => void;
}

export default function UploadCredit({ onDone }: UploadCreditProps) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [preview, setPreview] = useState<CreditReportData | null>(null);

  const handleFile = async (file: File) => {
    if (!name.trim()) {
      message.warning('请先输入客户名称');
      return;
    }

    setLoading(true);
    setFileList([{ uid: '-1', name: file.name, status: 'uploading' }]);

    try {
      let cid = clientId;
      if (!cid) {
        const client = await createClient(name.trim());
        cid = client.id;
        setClientId(cid);
      }

      const report = await uploadCreditReport(cid, file);
      setFileList([{ uid: '-1', name: file.name, status: 'done' }]);
      setPreview(report.parsed_data);
      message.success('征信报告上传成功');
    } catch (err: unknown) {
      setFileList([{ uid: '-1', name: file.name, status: 'error' }]);
      const msg = err instanceof Error ? err.message : '上传失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="第一步：上传征信报告">
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Input
          placeholder="请输入客户名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!clientId}
          style={{ maxWidth: 400 }}
        />

        <Spin spinning={loading}>
          <FileUploader
            accept=".pdf,.jpg,.jpeg,.png"
            hint="支持 PDF、JPG、PNG 格式的征信报告"
            onFileSelected={handleFile}
            fileList={fileList}
            loading={loading}
          />
        </Spin>

        {preview && <CreditSummary data={preview} />}

        <Button
          type="primary"
          disabled={!clientId}
          onClick={() => onDone(clientId!, name)}
        >
          下一步：上传银行流水 &rarr;
        </Button>
      </Space>
    </Card>
  );
}
