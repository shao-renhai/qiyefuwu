import { useState } from 'react';
import { ConfigProvider, Layout } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import StepNav from './components/StepNav';
import UploadCredit from './pages/UploadCredit';
import UploadBank from './pages/UploadBank';
import Report from './pages/Report';

const { Content } = Layout;

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Content style={{ maxWidth: 1200, margin: '24px auto', padding: '0 24px', width: '100%' }}>
          <h1 style={{ textAlign: 'center', marginBottom: 24 }}>融资分析系统</h1>
          <StepNav current={currentStep} />

          {currentStep === 0 && (
            <UploadCredit
              onDone={(id, name) => {
                setClientId(id);
                setClientName(name);
                setCurrentStep(1);
              }}
            />
          )}

          {currentStep === 1 && clientId && (
            <UploadBank
              clientId={clientId}
              clientName={clientName}
              onDone={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
            />
          )}

          {currentStep === 2 && clientId && (
            <Report
              clientId={clientId}
              onBack={() => setCurrentStep(1)}
            />
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
