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

  const inputStyle = {
    borderRadius: 12,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#F0F0F5',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0E1A',
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
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          pointerEvents: 'none',
        }}
      />

      {/* Decorative gradient orbs */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,169,98,0.08) 0%, transparent 70%)',
          top: '-25%',
          right: '-15%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(76,154,255,0.05) 0%, transparent 70%)',
          bottom: '-15%',
          left: '-8%',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', gap: 80, alignItems: 'center', position: 'relative', zIndex: 1 }}>
        {/* Left: Brand card — dark luxury */}
        <div
          style={{
            width: 380,
            height: 240,
            borderRadius: 24,
            background: 'linear-gradient(135deg, #111827 0%, #0A0E1A 100%)',
            boxShadow:
              '0 30px 60px rgba(0,0,0,0.5), 0 0 60px rgba(201,169,98,0.06), inset 0 1px 0 rgba(255,255,255,0.05)',
            padding: '36px 32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid rgba(201,169,98,0.15)',
            animation: 'float 8s ease-in-out infinite',
          }}
        >
          {/* Gold shimmer line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(201,169,98,0.5), transparent)',
            }}
          />
          {/* Light sweep effect */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '60%',
              height: '100%',
              background: 'linear-gradient(115deg, transparent 30%, rgba(201,169,98,0.04) 50%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div>
            <div
              style={{
                fontSize: 28,
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
                fontWeight: 600,
                color: '#555B6E',
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
                  color: '#555B6E',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Smart Finance Platform
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#8B8FA3',
                  letterSpacing: '3px',
                }}
              >
                科技赋能金融
              </div>
            </div>

            {/* Chip — gold accent */}
            <div
              style={{
                width: 46,
                height: 34,
                borderRadius: 7,
                background: 'linear-gradient(135deg, #C9A962 0%, #E8D5A3 50%, #C9A962 100%)',
                boxShadow: '0 0 15px rgba(201,169,98,0.2), inset 0 1px 2px rgba(255,255,255,0.3)',
              }}
            />
          </div>
        </div>

        {/* Right: Login form */}
        <div
          style={{
            width: 400,
            padding: '40px 36px',
            background: 'rgba(17,24,39,0.80)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          }}
        >
          {/* Logo text */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Title
              level={3}
              style={{
                color: '#F0F0F5',
                margin: 0,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              欢迎回来
            </Title>
            <Text style={{ color: '#8B8FA3', fontSize: 14 }}>
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
                        prefix={<UserOutlined style={{ color: '#555B6E' }} />}
                        placeholder="用户名"
                        style={inputStyle}
                      />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#555B6E' }} />}
                        placeholder="密码"
                        style={inputStyle}
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
                          background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                          border: 'none',
                          color: '#0A0E1A',
                          boxShadow: '0 4px 20px rgba(201,169,98,0.3)',
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
                        prefix={<UserOutlined style={{ color: '#555B6E' }} />}
                        placeholder="用户名"
                        style={inputStyle}
                      />
                    </Form.Item>
                    <Form.Item name="displayName">
                      <Input
                        prefix={<IdcardOutlined style={{ color: '#555B6E' }} />}
                        placeholder="姓名（选填）"
                        style={inputStyle}
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
                        prefix={<LockOutlined style={{ color: '#555B6E' }} />}
                        placeholder="密码"
                        style={inputStyle}
                      />
                    </Form.Item>
                    <Form.Item
                      name="confirm"
                      rules={[{ required: true, message: '请再次输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: '#555B6E' }} />}
                        placeholder="确认密码"
                        style={inputStyle}
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
                          background: 'linear-gradient(135deg, #C9A962, #E8D5A3)',
                          border: 'none',
                          color: '#0A0E1A',
                          boxShadow: '0 4px 20px rgba(201,169,98,0.3)',
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
