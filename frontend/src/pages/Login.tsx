import { useState } from 'react';
import { Form, Input, Button, Typography, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined, DashboardOutlined } from '@ant-design/icons';
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
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(34,197,94,0.08) 0%, transparent 50%), #0b1120',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: 420,
          padding: '48px 36px 36px',
          background: 'rgba(17,24,39,0.75)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <DashboardOutlined
            style={{
              fontSize: 42,
              color: '#3b82f6',
              display: 'block',
              marginBottom: 16,
              filter: 'drop-shadow(0 0 12px rgba(59,130,246,0.4))',
            }}
          />
          <Title level={3} style={{ color: '#fff', margin: 0, letterSpacing: 3 }}>
            融资分析系统
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, letterSpacing: 4 }}>
            FINTECH ANALYTICS PLATFORM
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
                      prefix={<UserOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                      placeholder="用户名"
                      style={inputStyle}
                    />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
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
                        borderRadius: 10,
                        fontWeight: 600,
                        fontSize: 15,
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
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
                      prefix={<UserOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                      placeholder="用户名"
                      style={inputStyle}
                    />
                  </Form.Item>
                  <Form.Item name="displayName">
                    <Input
                      prefix={<IdcardOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
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
                      prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
                      placeholder="密码"
                      style={inputStyle}
                    />
                  </Form.Item>
                  <Form.Item
                    name="confirm"
                    rules={[{ required: true, message: '请再次输入密码' }]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.3)' }} />}
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
                        borderRadius: 10,
                        fontWeight: 600,
                        fontSize: 15,
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
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
  );
}
