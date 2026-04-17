import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ConfigProvider,
  Layout,
  Menu,
  Typography,
  Avatar,
  Dropdown,
  Space,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  FileSearchOutlined,
  BankOutlined,
  HomeOutlined,
  TeamOutlined,
  ContactsOutlined,
  BookOutlined,
} from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import theme from './theme';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreditAnalysis from './pages/CreditAnalysis';
import BankAnalysis from './pages/BankAnalysis';
import LeadsPage from './pages/Leads';
import CustomersPage from './pages/Customers';
import CustomerDetailPage from './pages/CustomerDetail';
import CasesPage from './pages/Cases';
import CaseFormPage from './pages/CaseForm';
import { isLoggedIn, getStoredUser, logout } from './services/api';

const { Sider, Content } = Layout;
const { Text } = Typography;

type PageKey =
  | 'dashboard'
  | 'credit'
  | 'bank'
  | 'leads'
  | 'customers'
  | 'customer-detail'
  | 'cases'
  | 'case-new'
  | 'case-edit';

function parseHash(): { page: PageKey; id?: number } {
  const hash = window.location.hash || '';
  const mCustomerDetail = hash.match(/^#\/customers\/(\d+)$/);
  if (mCustomerDetail) return { page: 'customer-detail', id: Number(mCustomerDetail[1]) };
  const mCaseEdit = hash.match(/^#\/cases\/(\d+)\/edit$/);
  if (mCaseEdit) return { page: 'case-edit', id: Number(mCaseEdit[1]) };
  if (hash === '#/leads') return { page: 'leads' };
  if (hash === '#/customers') return { page: 'customers' };
  if (hash === '#/cases') return { page: 'cases' };
  if (hash === '#/cases/new') return { page: 'case-new' };
  if (hash === '#/credit') return { page: 'credit' };
  if (hash === '#/bank') return { page: 'bank' };
  return { page: 'dashboard' };
}

type AppMenuItem = NonNullable<MenuProps['items']>[number] & {
  roles?: string[];
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setLoggedIn(true);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
  }, []);

  const navigate = useCallback((page: PageKey) => {
    const hashMap: Record<PageKey, string> = {
      dashboard: '#/',
      credit: '#/credit',
      bank: '#/bank',
      leads: '#/leads',
      customers: '#/customers',
      'customer-detail': '#/customers',
      cases: '#/cases',
      'case-new': '#/cases/new',
      'case-edit': '#/cases',
    };
    window.location.hash = hashMap[page];
  }, []);

  const user = getStoredUser();
  const role = (user?.role || 'consultant').toLowerCase();

  const menuItems: AppMenuItem[] = useMemo(() => {
    const all: AppMenuItem[] = [
      { key: 'dashboard', icon: <HomeOutlined />, label: '工作台' },
      {
        key: 'leads',
        icon: <TeamOutlined />,
        label: '意向池',
        roles: ['founder', 'telesales'],
      },
      {
        key: 'customers',
        icon: <ContactsOutlined />,
        label: '客户',
        roles: ['founder', 'consultant'],
      },
      {
        key: 'cases',
        icon: <BookOutlined />,
        label: '案例库',
        roles: ['founder', 'consultant'],
      },
      { key: 'credit', icon: <FileSearchOutlined />, label: '征信分析' },
      { key: 'bank', icon: <BankOutlined />, label: '流水分析' },
    ];
    return all.filter((it) => !it.roles || it.roles.includes(role));
  }, [role]);

  if (!loggedIn) {
    return (
      <ConfigProvider locale={zhCN} theme={theme}>
        <Login onSuccess={handleLoginSuccess} />
      </ConfigProvider>
    );
  }

  // Keep menu selection in sync with the routed page.
  // customer-detail highlights customers; case-new / case-edit highlight cases.
  const selectedKey: string =
    route.page === 'customer-detail'
      ? 'customers'
      : route.page === 'case-new' || route.page === 'case-edit'
        ? 'cases'
        : route.page;

  const roleLabel =
    role === 'founder' ? '创始人' : role === 'telesales' ? '电销' : '融资顾问';

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
            selectedKeys={[selectedKey]}
            onClick={({ key }) => navigate(key as PageKey)}
            className="sidebar-menu"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '12px 0',
              flex: 1,
            }}
            items={menuItems}
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
                    {roleLabel}
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
            {route.page === 'dashboard' && (
              <Dashboard onNavigate={(p) => navigate(p as PageKey)} />
            )}
            {route.page === 'credit' && <CreditAnalysis />}
            {route.page === 'bank' && <BankAnalysis />}
            {route.page === 'leads' && <LeadsPage />}
            {route.page === 'customers' && <CustomersPage />}
            {route.page === 'customer-detail' &&
              (route.id ? (
                <CustomerDetailPage customerId={route.id} />
              ) : (
                <div>客户 ID 无效</div>
              ))}
            {route.page === 'cases' && <CasesPage role={role} />}
            {route.page === 'case-new' && <CaseFormPage />}
            {route.page === 'case-edit' &&
              (route.id ? (
                <CaseFormPage caseId={route.id} />
              ) : (
                <div>案例 ID 无效</div>
              ))}
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
