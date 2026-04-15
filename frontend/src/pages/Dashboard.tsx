import { Typography } from 'antd';
import {
  FileSearchOutlined,
  BankOutlined,
  CalculatorOutlined,
  MedicineBoxOutlined,
  RightOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface DashboardProps {
  onNavigate: (page: 'credit' | 'bank' | 'calculator' | 'diagnostic') => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const actionCards = [
    {
      key: 'credit' as const,
      icon: <FileSearchOutlined style={{ fontSize: 24, color: '#C9A962' }} />,
      title: '征信报告分析',
      desc: '上传征信报告 PDF，自动提取负债、逾期、查询记录等关键数据',
    },
    {
      key: 'bank' as const,
      icon: <BankOutlined style={{ fontSize: 24, color: '#C9A962' }} />,
      title: '银行流水分析',
      desc: '上传银行流水 Excel/PDF，智能汇总收支、识别异常交易',
    },
    {
      key: 'calculator' as const,
      icon: <CalculatorOutlined style={{ fontSize: 24, color: '#C9A962' }} />,
      title: '贷款计算器',
      desc: '快速评估融资额度，精确计算等额本息/本金月供明细',
    },
    {
      key: 'diagnostic' as const,
      icon: <MedicineBoxOutlined style={{ fontSize: 24, color: '#C9A962' }} />,
      title: '融资诊断',
      desc: '五维度评估客户融资健康度，智能生成诊断报告和产品推荐',
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <Title
          level={3}
          style={{
            color: '#1A1A2E',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          工作台
        </Title>
        <Text style={{ color: '#6B7280', fontSize: 14 }}>
          欢迎使用云上融智能融资分析平台
        </Text>
      </div>

      {/* Bento grid */}
      <div className="bento-grid">
        {/* Quick action cards */}
        {actionCards.map((card) => (
          <div
            key={card.key}
            className="span-2"
            onClick={() => onNavigate(card.key)}
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 20,
              padding: 32,
              cursor: 'pointer',
              transition: 'all 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)',
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.06), 0 0 20px rgba(201,169,98,0.04)';
              e.currentTarget.style.borderColor = 'rgba(201,169,98,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
            }}
          >
            {/* Gold shimmer top line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                background: 'linear-gradient(90deg, transparent, rgba(201,169,98,0.15), transparent)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(201,169,98,0.12), rgba(201,169,98,0.04))',
                border: '1px solid rgba(201,169,98,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {card.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: '#1A1A2E',
                  marginBottom: 4,
                }}
              >
                {card.title}
              </div>
              <div style={{ fontSize: 13, color: '#6B7280' }}>
                {card.desc}
              </div>
            </div>
            <RightOutlined style={{ color: '#9CA3AF', fontSize: 14 }} />
          </div>
        ))}

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
