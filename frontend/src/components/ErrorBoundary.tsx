import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Button, Typography } from 'antd';

const { Text } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染错误:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1A1A2E', marginBottom: 8 }}>
            页面渲染出错
          </div>
          <Text style={{ color: '#6B7280', display: 'block', marginBottom: 24 }}>
            {this.state.error}
          </Text>
          <Button
            type="primary"
            onClick={() => {
              this.setState({ hasError: false, error: '' });
              window.location.reload();
            }}
            style={{
              background: 'linear-gradient(135deg, #C9A962, #B8941F)',
              border: 'none',
              borderRadius: 12,
              height: 40,
            }}
          >
            刷新页面
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
