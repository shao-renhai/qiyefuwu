import { useState } from 'react';
import { Button, Card, Input, List, message, Space, Spin } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import FileUploader from '../components/FileUploader';
import BankSummary from '../components/BankSummary';
import { uploadBankStatement, type BankAnalysis } from '../services/api';

interface UploadBankProps {
  clientId: number;
  clientName: string;
  onDone: () => void;
  onBack: () => void;
}

interface UploadedItem {
  filename: string;
  bankName: string;
}

export default function UploadBank({ clientId, clientName, onDone, onBack }: UploadBankProps) {
  const [bankName, setBankName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedItem[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<BankAnalysis | null>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const result = await uploadBankStatement(clientId, file, clientName, bankName.trim() || undefined);
      setUploaded((prev) => [...prev, { filename: file.name, bankName: result.bank_name ?? '' }]);
      setLatestAnalysis(result.analysis);
      message.success(`${file.name} 上传成功`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '上传失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={`第二步：上传银行流水 — ${clientName}`}>
      <Space orientation="vertical" style={{ width: '100%' }} size="large">
        <Input
          placeholder="银行名称（可选）"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          style={{ maxWidth: 400 }}
        />

        <Spin spinning={loading}>
          <FileUploader
            accept=".xlsx,.xls,.csv,.pdf"
            hint="支持 Excel（.xlsx/.xls）、CSV 和 PDF 格式的银行流水"
            onFileSelected={handleFile}
            loading={loading}
          />
        </Spin>

        {uploaded.length > 0 && (
          <List
            size="small"
            header={<strong>已上传文件</strong>}
            bordered
            dataSource={uploaded}
            renderItem={(item) => (
              <List.Item>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                {item.filename}
                {item.bankName && <span style={{ color: '#888', marginLeft: 8 }}>({item.bankName})</span>}
              </List.Item>
            )}
          />
        )}

        {latestAnalysis && <BankSummary data={latestAnalysis} />}

        <Space>
          <Button onClick={onBack}>&larr; 上一步</Button>
          <Button type="primary" disabled={uploaded.length === 0} onClick={onDone}>
            下一步：查看分析报告 &rarr;
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
