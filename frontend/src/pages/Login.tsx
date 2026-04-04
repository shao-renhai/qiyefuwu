import { useState } from 'react';
import { Form, Input, Button, Typography, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { login, register } from '../services/api';

const { Title, Text } = Typography;

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      onSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      message.error(error.response?.data?.detail || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: {
    username: string;
    password: string;
    confirm: string;
    displayName: string;
  }) => {
    if (values.password !== values.confirm) {
      message.error('两次密码不一致');
      return;
    }
    setLoading(true);
    try {
      await register(values.username, values.password, values.displayName);
      message.success('注册成功');
      onSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      message.error(error.response?.data?.detail || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F5F7',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle grid pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          pointerEvents: 'none',
        }}
      />

      {/* Decorative gradient orbs */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,122,255,0.06) 0%, transparent 70%)',
          top: '-20%',
          right: '-10%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,199,89,0.05) 0%, transparent 70%)',
          bottom: '-10%',
          left: '-5%',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', gap: 80, alignItems: 'center', position: 'relative', zIndex: 1 }}>
        {/* Left: Brand card */}
        <div
          style={{
            width: 380,
            height: 240,
            borderRadius: 24,
            background: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)',
            boxShadow:
              '0 30px 60px rgba(0,0,0,0.08), 0 10px 20px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)',
            padding: '36px 32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            animation: 'float 8s ease-in-out infinite',
          }}
        >
          {/* Shine effect */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '60%',
              height: '100%',
              background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div>
            <div
              style={{
                fontSize: 28,
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
                fontWeight: 600,
                color: '#86868B',
                letterSpacing: '0.15em',
                marginTop: 4,
                textTransform: 'uppercase',
              }}
            >
              YunShangRong
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#AEAEB2',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Smart Finance Platform
              </div>
              <div
                style={{
                  fontFamily: "'SF Mono', 'Courier New', monospace",
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#1D1D1F',
                  letterSpacing: '3px',
                }}
              >
                科技赋能金融
              </div>
            </div>

            {/* Chip */}
            <div
              style={{
                width: 46,
                height: 34,
                borderRadius: 7,
                background: 'linear-gradient(135deg, #d0d0d0 0%, #e8e8e8 50%, #c0c0c0 100%)',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), 0 1px 3px rgba(0,0,0,0.08)',
              }}
            />
          </div>
        </div>

        {/* Right: Login form */}
        <div
          style={{
            width: 400,
            padding: '40px 36px',
            background: 'rgba(255,255,255,0.65)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.8)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          {/* Logo text */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Title
              level={3}
              style={{
                color: '#1D1D1F',
                margin: 0,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              欢迎回来
            </Title>
            <Text style={{ color: '#86868B', fontSize: 14 }}>
              登录云上融 · 开启智能融资分析
            </Text>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            centered
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <Form onFinish={handleLogin} size="large" autoComplete="off">
                    <Form.Item
                      name="username"
                      rules={[{ required: true, message: '请输入用户名' }]}
                    >
                      <Input
                        prefix={<UserOutlined style={{ color: '#AEAEB2' }} />}
                        placeholder="用户名"
                        style={{
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#AEAEB2' }} />}
                        placeholder="密码"
                        style={{
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={loading}
                        style={{
                          height: 46,
                          borderRadius: 14,
                          fontWeight: 600,
                          fontSize: 15,
                          background: '#1D1D1F',
                          border: 'none',
                        }}
                      >
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: (
                  <Form onFinish={handleRegister} size="large" autoComplete="off">
                    <Form.Item
                      name="username"
                      rules={[
                        { required: true, message: '请输入用户名' },
                        { min: 3, message: '用户名至少3个字符' },
                      ]}
                    >
                      <Input
                        prefix={<UserOutlined style={{ color: '#AEAEB2' }} />}
                        placeholder="用户名"
                        style={{
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="displayName">
                      <Input
                        prefix={<IdcardOutlined style={{ color: '#AEAEB2' }} />}
                        placeholder="姓名（选填）"
                        style={{
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[
                        { required: true, message: '请输入密码' },
                        { min: 6, message: '密码至少6个字符' },
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#AEAEB2' }} />}
                        placeholder="密码"
                        style={{
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="confirm"
                      rules={[{ required: true, message: '请再次输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#AEAEB2' }} />}
                        placeholder="确认密码"
                        style={{
                          borderRadius: 12,
                          background: 'rgba(0,0,0,0.03)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={loading}
                        style={{
                          height: 46,
                          borderRadius: 14,
                          fontWeight: 600,
                          fontSize: 15,
                          background: '#1D1D1F',
                          border: 'none',
                        }}
                      >
                        注册
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Float animation */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: perspective(1000px) rotateY(-6deg) rotateX(4deg) translateY(0); }
          50% { transform: perspective(1000px) rotateY(4deg) rotateX(-3deg) translateY(-16px); }
        }
        @media (max-width: 900px) {
          .login-container { flex-direction: column !important; gap: 32px !important; }
        }
      `}</style>
    </div>
  );
}
