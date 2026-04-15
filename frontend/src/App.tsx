import { useState, useCallback } from 'react';
import { ConfigProvider, Layout, Menu, Typography, Avatar, Dropdown, Space } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  FileSearchOutlined,
  BankOutlined,
  HomeOutlined,
  CalculatorOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import theme from './theme';
import LandingPage from './pages/LandingPage';
import LoginModal from './components/LoginModal';
import Dashboard from './pages/Dashboard';
import CreditAnalysis from './pages/CreditAnalysis';
import BankAnalysis from './pages/BankAnalysis';
import LoanCalculator from './pages/LoanCalculator';
import DiagnosticWizard from './components/diagnostic/DiagnosticWizard';
import { isLoggedIn, getStoredUser, logout } from './services/api';

const { Sider, Content } = Layout;
const { Text } = Typography;

type PageKey = 'dashboard' | 'credit' | 'bank' | 'calculator' | 'diagnostic';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const handleLoginSuccess = useCallback(() => {
    setLoggedIn(true);
    setLoginModalOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
  }, []);

  // ─── 未登录：着陆页 + 登录弹窗 ───
  if (!loggedIn) {
    return (
      <ConfigProvider locale={zhCN} theme={theme}>
        <LandingPage onOpenLogin={() => setLoginModalOpen(true)} />
        <LoginModal
          open={loginModalOpen}
          onClose={() => setLoginModalOpen(false)}
          onSuccess={handleLoginSuccess}
        />
      </ConfigProvider>
    );
  }

  // ─── 已登录：后台工作台 ───
  const user = getStoredUser();

  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <Layout style={{ minHeight: '100vh', background: '#F0F1F5' }}>
        {/* Sidebar (dark) */}
        <Sider
          width={240}
          style={{
            background: '#060A14',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            position: 'fixed',
            height: '100vh',
            left: 0,
            top: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '32px 24px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              云上融
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#555B6E',
                letterSpacing: '0.08em',
                marginTop: 4,
              }}
            >
              智能融资分析平台
            </div>
          </div>

          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            onClick={({ key }) => setCurrentPage(key as PageKey)}
            className="sidebar-menu"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '16px 0',
              flex: 1,
            }}
            items={[
              { key: 'dashboard', icon: <HomeOutlined />, label: '工作台' },
              { key: 'credit', icon: <FileSearchOutlined />, label: '征信分析' },
              { key: 'bank', icon: <BankOutlined />, label: '流水分析' },
              { key: 'calculator', icon: <CalculatorOutlined />, label: '贷款计算器' },
              { key: 'diagnostic', icon: <MedicineBoxOutlined />, label: '融资诊断' },
            ]}
          />

          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}
          >
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
              placement="topLeft"
            >
              <Space style={{ cursor: 'pointer', width: '100%' }}>
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{
                    background: 'linear-gradient(135deg, rgba(201,169,98,0.2), rgba(201,169,98,0.1))',
                    color: '#C9A962',
                    border: '1px solid rgba(201,169,98,0.3)',
                  }}
                />
                <div>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#F0F0F5',
                      display: 'block',
                      lineHeight: 1.3,
                    }}
                  >
                    {user?.display_name || user?.username || '用户'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#555B6E' }}>融资顾问</Text>
                </div>
              </Space>
            </Dropdown>
          </div>
        </Sider>

        <Layout style={{ marginLeft: 240, background: '#F0F1F5' }}>
          <Content style={{ padding: '32px 36px', maxWidth: 1400, width: '100%' }}>
            {currentPage === 'dashboard' && (
              <Dashboard onNavigate={(page: PageKey) => setCurrentPage(page)} />
            )}
            {currentPage === 'credit' && <CreditAnalysis />}
            {currentPage === 'bank' && <BankAnalysis />}
            {currentPage === 'calculator' && <LoanCalculator />}
            {currentPage === 'diagnostic' && <DiagnosticWizard />}
          </Content>
          <div
            style={{
              textAlign: 'center',
              padding: '12px 0 24px',
              color: '#A0A5B5',
              fontSize: 11,
              letterSpacing: '0.08em',
            }}
          >
            <span
              style={{
                background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              云上融
            </span>
            <span style={{ margin: '0 8px', opacity: 0.3 }}>·</span>
            科技赋能金融
          </div>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
