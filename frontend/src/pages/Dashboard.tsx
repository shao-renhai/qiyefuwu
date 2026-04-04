import { Typography } from 'antd';
import {
  FileSearchOutlined,
  BankOutlined,
  RightOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface DashboardProps {
  onNavigate: (page: 'credit' | 'bank') => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <Title
          level={3}
          style={{
            color: '#1D1D1F',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          工作台
        </Title>
        <Text style={{ color: '#86868B', fontSize: 14 }}>
          欢迎使用云上融智能融资分析平台
        </Text>
      </div>

      {/* Bento grid */}
      <div className="bento-grid">
        {/* Quick action: Credit Analysis */}
        <div
          className="span-2"
          onClick={() => onNavigate('credit')}
          style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.8)',
            borderRadius: 20,
            padding: 32,
            cursor: 'pointer',
            transition: 'all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #f5f5f5, #ebebeb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FileSearchOutlined style={{ fontSize: 24, color: '#1D1D1F' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: '#1D1D1F',
                marginBottom: 4,
              }}
            >
              征信报告分析
            </div>
            <div style={{ fontSize: 13, color: '#86868B' }}>
              上传征信报告 PDF，自动提取负债、逾期、查询记录等关键数据
            </div>
          </div>
          <RightOutlined style={{ color: '#AEAEB2', fontSize: 14 }} />
        </div>

        {/* Quick action: Bank Analysis */}
        <div
          className="span-2"
          onClick={() => onNavigate('bank')}
          style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.8)',
            borderRadius: 20,
            padding: 32,
            cursor: 'pointer',
            transition: 'all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #f5f5f5, #ebebeb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BankOutlined style={{ fontSize: 24, color: '#1D1D1F' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: '#1D1D1F',
                marginBottom: 4,
              }}
            >
              银行流水分析
            </div>
            <div style={{ fontSize: 13, color: '#86868B' }}>
              上传银行流水 Excel/PDF，智能汇总收支、识别异常交易
            </div>
          </div>
          <RightOutlined style={{ color: '#AEAEB2', fontSize: 14 }} />
        </div>

        {/* Stats overview */}
        <div className="stat-card">
          <div className="stat-label">支持格式</div>
          <div className="stat-value">6+</div>
          <div className="stat-sub">PDF / Excel / CSV / 图片</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">解析引擎</div>
          <div className="stat-value primary">AI</div>
          <div className="stat-sub">OCR + 智能文本提取</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">数据安全</div>
          <div className="stat-value success">100%</div>
          <div className="stat-sub">数据隔离 · 加密传输</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">分析维度</div>
          <div className="stat-value">12+</div>
          <div className="stat-sub">负债 · 逾期 · 查询 · 流水</div>
        </div>
      </div>
    </div>
  );
}
