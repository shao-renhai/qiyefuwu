/**
 * 云上融 — Apple-inspired light fintech theme
 * Base: #F5F5F7 gray background, white glass cards
 * Accent: refined blue + semantic colors
 */
import type { ThemeConfig } from 'antd';

const theme: ThemeConfig = {
  token: {
    // Brand
    colorPrimary: '#1D1D1F',
    colorSuccess: '#34C759',
    colorWarning: '#FF9F0A',
    colorError: '#FF3B30',
    colorInfo: '#007AFF',

    // Background
    colorBgBase: '#F5F5F7',
    colorBgContainer: 'rgba(255,255,255,0.72)',
    colorBgElevated: '#FFFFFF',
    colorBgLayout: '#F5F5F7',

    // Text
    colorText: '#1D1D1F',
    colorTextSecondary: '#86868B',
    colorTextTertiary: '#AEAEB2',

    // Border
    colorBorder: 'rgba(0,0,0,0.08)',
    colorBorderSecondary: 'rgba(0,0,0,0.04)',

    // Shape
    borderRadius: 14,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif',
    fontSize: 14,

    // Misc
    controlHeight: 42,
    wireframe: false,
  },
  components: {
    Card: {
      borderRadiusLG: 20,
    },
    Table: {
      headerBg: 'rgba(0,0,0,0.02)',
      headerColor: '#86868B',
      rowHoverBg: 'rgba(0,0,0,0.02)',
      borderColor: 'rgba(0,0,0,0.06)',
    },
    Input: {
      activeBorderColor: '#1D1D1F',
    },
    Tabs: {
      itemColor: '#86868B',
      itemSelectedColor: '#1D1D1F',
      inkBarColor: '#1D1D1F',
    },
    Button: {
      primaryShadow: '0 2px 8px rgba(0,0,0,0.12)',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(0,0,0,0.04)',
      itemSelectedColor: '#1D1D1F',
      itemColor: '#86868B',
      itemHoverColor: '#1D1D1F',
      itemHoverBg: 'rgba(0,0,0,0.03)',
    },
    Statistic: {
      titleColor: '#86868B',
      contentColor: '#1D1D1F',
    },
  },
};

export default theme;
