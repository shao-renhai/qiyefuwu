import { useState, useCallback } from 'react';
import { ConfigProvider, Layout, Button, Space, Typography } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import StepNav from './components/StepNav';
import UploadCredit from './pages/UploadCredit';
import UploadBank from './pages/UploadBank';
import Report from './pages/Report';
import Login from './pages/Login';
import { isLoggedIn, getStoredUser, logout } from './services/api';

const { Header, Content } = Layout;
const { Text } = Typography;

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [currentStep, setCurrentStep] = useState(0);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');

  const handleLoginSuccess = useCallback(() => {
    setLoggedIn(true);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
  }, []);

  if (!loggedIn) {
    return (
      <ConfigProvider locale={zhCN}>
        <Login onSuccess={handleLoginSuccess} />
      </ConfigProvider>
    );
  }

  const user = getStoredUser();

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
        <Header
          style={{
            background: 'linear-gradient(90deg, #0a1628, #1a3a5c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          <Text
            strong
            style={{ color: '#fff', fontSize: 18, letterSpacing: 1 }}
          >
            融资分析系统
          </Text>
          <Space>
            <UserOutlined style={{ color: 'rgba(255,255,255,0.85)' }} />
            <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
              {user?.display_name || user?.username || '用户'}
            </Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{ color: 'rgba(255,255,255,0.65)' }}
            >
              退出
            </Button>
          </Space>
        </Header>

        <Content
          style={{
            maxWidth: 1200,
            margin: '24px auto',
            padding: '0 24px',
            width: '100%',
          }}
        >
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
