import { useState } from 'react';
import { Button, Input, message, Space, Spin } from 'antd';
import { ArrowRightOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
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
      message.success('征信报告解析完成');
    } catch (err: unknown) {
      setFileList([{ uid: '-1', name: file.name, status: 'error' }]);
      const msg = err instanceof Error ? err.message : '上传失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="glass-card" style={{ padding: 28, marginBottom: 20 }}>
        <Space size="middle" style={{ marginBottom: 20 }}>
          <SafetyCertificateOutlined style={{ fontSize: 20, color: '#3b82f6' }} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>上传征信报告</span>
        </Space>

        <Input
          placeholder="请输入客户名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!clientId}
          style={{ maxWidth: 400, marginBottom: 20 }}
        />

        <Spin spinning={loading} tip="正在解析征信报告，扫描件可能需要2-3分钟...">
          <FileUploader
            accept=".pdf,.jpg,.jpeg,.png"
            hint="支持 PDF（电子版/扫描件）、JPG、PNG 格式"
            onFileSelected={handleFile}
            fileList={fileList}
            loading={loading}
          />
        </Spin>
      </div>

      {preview && (
        <div style={{ marginBottom: 20 }}>
          <CreditSummary data={preview} />
        </div>
      )}

      <Button
        type="primary"
        size="large"
        disabled={!clientId}
        onClick={() => onDone(clientId!, name)}
        icon={<ArrowRightOutlined />}
        style={{ borderRadius: 10 }}
      >
        下一步：上传银行流水
      </Button>
    </div>
  );
}
