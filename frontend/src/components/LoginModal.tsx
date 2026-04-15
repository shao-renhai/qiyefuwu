import { useState } from 'react';
import { Modal, Form, Input, Button, Tabs, message } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined } from '@ant-design/icons';
import { login, register } from '../services/api';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LoginModal({ open, onClose, onSuccess }: LoginModalProps) {
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
    background: '#F7F8FA',
    border: '1px solid #E5E7EB',
    color: '#1A1A2E',
  };

  const iconColor = '#9CA3AF';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={440}
      styles={{
        body: {
          padding: '40px 36px',
        },
        mask: {
          backdropFilter: 'blur(8px)',
          background: 'rgba(0,0,0,0.45)',
        },
      }}
      className="login-modal-light"
      closable
      closeIcon={
        <span style={{ color: '#9CA3AF', fontSize: 18 }}>×</span>
      }
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #C9A962, #B8941F)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 8,
          }}
        >
          云上融
        </div>
        <div style={{ color: '#6B7280', fontSize: 14 }}>
          {activeTab === 'login' ? '欢迎回来，登录开启智能分析' : '创建账户，开始免费使用'}
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        centered
        items={[
          {
            key: 'login',
            label: <span style={{ color: activeTab === 'login' ? '#C9A962' : '#9CA3AF', fontWeight: 500 }}>登录</span>,
            children: (
              <Form onFinish={handleLogin} size="large" autoComplete="off">
                <Form.Item
                  name="username"
                  rules={[{ required: true, message: '请输入用户名' }]}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: iconColor }} />}
                    placeholder="用户名"
                    style={inputStyle}
                  />
                </Form.Item>
                <Form.Item
                  name="password"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: iconColor }} />}
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
                      height: 48,
                      borderRadius: 14,
                      fontWeight: 600,
                      fontSize: 15,
                      background: 'linear-gradient(135deg, #C9A962, #B8941F)',
                      border: 'none',
                      color: '#fff',
                      boxShadow: '0 4px 16px rgba(201,169,98,0.35)',
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
            label: <span style={{ color: activeTab === 'register' ? '#C9A962' : '#9CA3AF', fontWeight: 500 }}>注册</span>,
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
                    prefix={<UserOutlined style={{ color: iconColor }} />}
                    placeholder="用户名"
                    style={inputStyle}
                  />
                </Form.Item>
                <Form.Item name="displayName">
                  <Input
                    prefix={<IdcardOutlined style={{ color: iconColor }} />}
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
                    prefix={<LockOutlined style={{ color: iconColor }} />}
                    placeholder="密码"
                    style={inputStyle}
                  />
                </Form.Item>
                <Form.Item
                  name="confirm"
                  rules={[{ required: true, message: '请再次输入密码' }]}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: iconColor }} />}
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
                      height: 48,
                      borderRadius: 14,
                      fontWeight: 600,
                      fontSize: 15,
                      background: 'linear-gradient(135deg, #C9A962, #B8941F)',
                      border: 'none',
                      color: '#fff',
                      boxShadow: '0 4px 16px rgba(201,169,98,0.35)',
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
    </Modal>
  );
}
