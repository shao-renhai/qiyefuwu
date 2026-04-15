/**
 * 云上融 — Dark sidebar + Light content theme
 * Sidebar: deep navy-black with gold accents
 * Content: warm light background with professional dark text
 */
import type { ThemeConfig } from 'antd';

const theme: ThemeConfig = {
  token: {
    // Brand — matte gold
    colorPrimary: '#C9A962',
    colorSuccess: '#36B37E',
    colorWarning: '#FFAB00',
    colorError: '#FF5630',
    colorInfo: '#4C9AFF',

    // Background — light warm gray
    colorBgBase: '#F0F1F5',
    colorBgContainer: 'rgba(255,255,255,0.92)',
    colorBgElevated: '#FFFFFF',
    colorBgLayout: '#F0F1F5',

    // Text — dark professional
    colorText: '#1A1A2E',
    colorTextSecondary: '#6B7280',
    colorTextTertiary: '#9CA3AF',

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
      headerColor: '#6B7280',
      rowHoverBg: 'rgba(201,169,98,0.04)',
      borderColor: 'rgba(0,0,0,0.06)',
    },
    Input: {
      activeBorderColor: '#C9A962',
      hoverBorderColor: 'rgba(201,169,98,0.4)',
    },
    Tabs: {
      itemColor: '#6B7280',
      itemSelectedColor: '#C9A962',
      inkBarColor: '#C9A962',
    },
    Button: {
      primaryShadow: '0 2px 12px rgba(201,169,98,0.25)',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(201,169,98,0.10)',
      itemSelectedColor: '#C9A962',
      itemColor: '#8B8FA3',
      itemHoverColor: '#F0F0F5',
      itemHoverBg: 'rgba(255,255,255,0.04)',
    },
    Statistic: {
      colorTextDescription: '#6B7280',
    },
    Select: {
      optionSelectedBg: 'rgba(201,169,98,0.08)',
    },
    Steps: {
      colorPrimary: '#C9A962',
    },
    Segmented: {
      itemSelectedBg: '#FFFFFF',
      itemSelectedColor: '#C9A962',
    },
  },
};

export default theme;
