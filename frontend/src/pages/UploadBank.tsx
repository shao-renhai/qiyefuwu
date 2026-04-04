import { useState } from 'react';
import { Button, Input, List, message, Space, Spin } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, BankOutlined, CheckCircleOutlined } from '@ant-design/icons';
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
      message.success(`${file.name} 解析完成`);
    } catch (err: unknown) {
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
          <BankOutlined style={{ fontSize: 20, color: '#3b82f6' }} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>上传银行流水</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>— {clientName}</span>
        </Space>

        <Input
          placeholder="银行名称（可选）"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          style={{ maxWidth: 400, marginBottom: 20 }}
        />

        <Spin spinning={loading} tip="正在解析银行流水...">
          <FileUploader
            accept=".xlsx,.xls,.csv,.pdf"
            hint="支持 Excel（.xlsx/.xls）、CSV 和 PDF 格式"
            onFileSelected={handleFile}
            loading={loading}
          />
        </Spin>

        {uploaded.length > 0 && (
          <List
            size="small"
            style={{ marginTop: 16 }}
            bordered={false}
            dataSource={uploaded}
            renderItem={(item) => (
              <List.Item style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '8px 0' }}>
                <CheckCircleOutlined style={{ color: '#22c55e', marginRight: 8 }} />
                <span>{item.filename}</span>
                {item.bankName && (
                  <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>({item.bankName})</span>
                )}
              </List.Item>
            )}
          />
        )}
      </div>

      {latestAnalysis && (
        <div style={{ marginBottom: 20 }}>
          <BankSummary data={latestAnalysis} />
        </div>
      )}

      <Space>
        <Button size="large" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ borderRadius: 10 }}>
          上一步
        </Button>
        <Button
          type="primary"
          size="large"
          disabled={uploaded.length === 0}
          onClick={onDone}
          icon={<ArrowRightOutlined />}
          style={{ borderRadius: 10 }}
        >
          查看分析报告
        </Button>
      </Space>
    </div>
  );
}
