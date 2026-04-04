/**
 * Ant Design dark fintech theme tokens.
 * Color palette inspired by Bloomberg Terminal / digital finance dashboards.
 */
import type { ThemeConfig } from 'antd';

const theme: ThemeConfig = {
  token: {
    // Brand
    colorPrimary: '#3b82f6',        // vibrant blue
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',

    // Background
    colorBgBase: '#0b1120',
    colorBgContainer: '#111827',
    colorBgElevated: '#1a2332',
    colorBgLayout: '#0b1120',

    // Text
    colorText: 'rgba(255,255,255,0.88)',
    colorTextSecondary: 'rgba(255,255,255,0.55)',
    colorTextTertiary: 'rgba(255,255,255,0.35)',

    // Border
    colorBorder: 'rgba(255,255,255,0.08)',
    colorBorderSecondary: 'rgba(255,255,255,0.05)',

    // Shape
    borderRadius: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif',
    fontSize: 14,

    // Misc
    controlHeight: 40,
    wireframe: false,
  },
  components: {
    Card: {
      colorBgContainer: '#111827',
      colorBorderSecondary: 'rgba(255,255,255,0.06)',
    },
    Table: {
      colorBgContainer: '#111827',
      headerBg: '#1a2332',
      headerColor: 'rgba(255,255,255,0.65)',
      rowHoverBg: 'rgba(59,130,246,0.08)',
      borderColor: 'rgba(255,255,255,0.06)',
    },
    Input: {
      colorBgContainer: '#1a2332',
      activeBorderColor: '#3b82f6',
    },
    Tabs: {
      itemColor: 'rgba(255,255,255,0.55)',
      itemSelectedColor: '#3b82f6',
      inkBarColor: '#3b82f6',
    },
    Steps: {
      colorPrimary: '#3b82f6',
    },
    Button: {
      primaryShadow: '0 2px 8px rgba(59,130,246,0.35)',
    },
    Upload: {
      colorBgContainer: '#1a2332',
    },
    Statistic: {
      titleColor: 'rgba(255,255,255,0.55)',
      contentColor: 'rgba(255,255,255,0.88)',
    },
    Descriptions: {
      colorBgContainer: '#111827',
      labelBg: '#1a2332',
    },
    Tag: {
      defaultBg: 'rgba(59,130,246,0.12)',
    },
  },
};

export default theme;
