import { useState, useCallback } from 'react';
import { ConfigProvider, Layout, Menu, Typography, Avatar, Dropdown, Space } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  FileSearchOutlined,
  BankOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import theme from './theme';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreditAnalysis from './pages/CreditAnalysis';
import BankAnalysis from './pages/BankAnalysis';
import { isLoggedIn, getStoredUser, logout } from './services/api';

const { Sider, Content } = Layout;
const { Text } = Typography;

type PageKey = 'dashboard' | 'credit' | 'bank';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');

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
      <Layout style={{ minHeight: '100vh', background: '#F5F5F7' }}>
        {/* ─── Sidebar ─── */}
        <Sider
          width={240}
          style={{
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(0,0,0,0.06)',
            position: 'fixed',
            height: '100vh',
            left: 0,
            top: 0,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Logo */}
          <div
            style={{
              padding: '28px 24px 20px',
              borderBottom: '1px solid rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#1D1D1F',
                letterSpacing: '-0.02em',
              }}
            >
              云上融
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#AEAEB2',
                letterSpacing: '0.08em',
                marginTop: 2,
              }}
            >
              智能融资分析平台
            </div>
          </div>

          {/* Navigation */}
          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            onClick={({ key }) => setCurrentPage(key as PageKey)}
            className="sidebar-menu"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '12px 0',
              flex: 1,
            }}
            items={[
              {
                key: 'dashboard',
                icon: <HomeOutlined />,
                label: '工作台',
              },
              {
                key: 'credit',
                icon: <FileSearchOutlined />,
                label: '征信分析',
              },
              {
                key: 'bank',
                icon: <BankOutlined />,
                label: '流水分析',
              },
            ]}
          />

          {/* User info at bottom */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(0,0,0,0.04)',
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
                    background: 'rgba(0,0,0,0.06)',
                    color: '#86868B',
                  }}
                />
                <div>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1D1D1F',
                      display: 'block',
                      lineHeight: 1.3,
                    }}
                  >
                    {user?.display_name || user?.username || '用户'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#AEAEB2' }}>
                    融资顾问
                  </Text>
                </div>
              </Space>
            </Dropdown>
          </div>
        </Sider>

        {/* ─── Main Content ─── */}
        <Layout style={{ marginLeft: 240, background: '#F5F5F7' }}>
          <Content
            style={{
              padding: '28px 32px',
              maxWidth: 1400,
              width: '100%',
            }}
          >
            {currentPage === 'dashboard' && (
              <Dashboard
                onNavigate={(page: PageKey) => setCurrentPage(page)}
              />
            )}
            {currentPage === 'credit' && <CreditAnalysis />}
            {currentPage === 'bank' && <BankAnalysis />}
          </Content>

          {/* Footer */}
          <div
            style={{
              textAlign: 'center',
              padding: '12px 0 20px',
              color: '#AEAEB2',
              fontSize: 11,
              letterSpacing: '0.05em',
            }}
          >
            云上融 · 科技赋能金融
          </div>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
