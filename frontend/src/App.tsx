import { useState, useCallback } from 'react';
import { ConfigProvider, Layout, Button, Space, Typography, Avatar, Dropdown } from 'antd';
import { LogoutOutlined, UserOutlined, DashboardOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import theme from './theme';
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
      <ConfigProvider locale={zhCN} theme={theme}>
        <Login onSuccess={handleLoginSuccess} />
      </ConfigProvider>
    );
  }

  const user = getStoredUser();

  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <Layout style={{ minHeight: '100vh', background: '#0b1120' }}>
        {/* ─── Header ─── */}
        <Header
          style={{
            background: 'rgba(11,17,32,0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Space size="middle">
            <DashboardOutlined style={{ color: '#3b82f6', fontSize: 22 }} />
            <Text
              strong
              style={{ color: '#fff', fontSize: 18, letterSpacing: 2 }}
            >
              融资分析系统
            </Text>
            <Text
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: 12,
                marginLeft: 8,
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                paddingLeft: 12,
              }}
            >
              FINTECH ANALYTICS
            </Text>
          </Space>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                size="small"
                icon={<UserOutlined />}
                style={{ background: 'rgba(59,130,246,0.3)', color: '#3b82f6' }}
              />
              <Text style={{ color: 'rgba(255,255,255,0.75)' }}>
                {user?.display_name || user?.username || '用户'}
              </Text>
            </Space>
          </Dropdown>
        </Header>

        {/* ─── Content ─── */}
        <Content
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '28px 24px',
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

        {/* ─── Footer ─── */}
        <div
          style={{
            textAlign: 'center',
            padding: '16px 0 24px',
            color: 'rgba(255,255,255,0.2)',
            fontSize: 12,
          }}
        >
          Powered by AI · 科技赋能金融
        </div>
      </Layout>
    </ConfigProvider>
  );
}
