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
  CalculatorOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
  ContactsOutlined,
  BookOutlined,
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
  | 'calculator'
  | 'diagnostic'
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
  if (hash === '#/calculator') return { page: 'calculator' };
  if (hash === '#/diagnostic') return { page: 'diagnostic' };
  return { page: 'dashboard' };
}

type AppMenuItem = NonNullable<MenuProps['items']>[number] & {
  roles?: string[];
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleLoginSuccess = useCallback(() => {
    setLoggedIn(true);
    setLoginModalOpen(false);
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
      calculator: '#/calculator',
      diagnostic: '#/diagnostic',
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
      { key: 'calculator', icon: <CalculatorOutlined />, label: '贷款计算器' },
      { key: 'diagnostic', icon: <MedicineBoxOutlined />, label: '融资诊断' },
    ];
    return all.filter((it) => !it.roles || it.roles.includes(role));
  }, [role]);

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
            selectedKeys={[selectedKey]}
            onClick={({ key }) => navigate(key as PageKey)}
            className="sidebar-menu"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '16px 0',
              flex: 1,
            }}
            items={menuItems}
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
                  <Text style={{ fontSize: 11, color: '#555B6E' }}>
                    {roleLabel}
                  </Text>
                </div>
              </Space>
            </Dropdown>
          </div>
        </Sider>

        <Layout style={{ marginLeft: 240, background: '#F0F1F5' }}>
          <Content style={{ padding: '32px 36px', maxWidth: 1400, width: '100%' }}>
            {route.page === 'dashboard' && (
              <Dashboard onNavigate={(p) => navigate(p as PageKey)} />
            )}
            {route.page === 'credit' && <CreditAnalysis />}
            {route.page === 'bank' && <BankAnalysis />}
            {route.page === 'calculator' && <LoanCalculator />}
            {route.page === 'diagnostic' && <DiagnosticWizard />}
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
