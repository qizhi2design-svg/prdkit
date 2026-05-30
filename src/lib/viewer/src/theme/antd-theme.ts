import type { ThemeConfig } from 'antd';

export const antdTheme: ThemeConfig = {
  token: {
    // ========== 品牌色 ==========
    colorPrimary: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorInfo: '#1677ff',

    // ========== 文本色 ==========
    colorText: '#262626',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    colorTextQuaternary: '#bfbfbf',

    // ========== 边框 ==========
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#e8e8e8',

    // ========== 背景色 ==========
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorBgSpotlight: '#fafafa',

    // ========== 字体 ==========
    fontFamily: "'Noto Sans SC Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
    fontFamilyCode: "'Monaco', 'Menlo', 'Consolas', 'Courier New', 'Noto Sans SC Variable', monospace",
    fontSize: 13,
    fontSizeHeading1: 28,
    fontSizeHeading2: 24,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,

    // ========== 圆角 ==========
    borderRadius: 6,
    borderRadiusLG: 12,
    borderRadiusSM: 4,
    borderRadiusXS: 2,

    // ========== 间距 ==========
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    paddingXS: 8,
    paddingXXS: 4,

    margin: 16,
    marginLG: 24,
    marginSM: 12,
    marginXS: 8,
    marginXXS: 4,

    // ========== 控件高度 ==========
    controlHeight: 32,
    controlHeightLG: 40,
    controlHeightSM: 24,

    // ========== 阴影 ==========
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    boxShadowSecondary: '0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',

    // ========== 动画 ==========
    motionDurationFast: '0.16s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.3s',
  },

  components: {
    // ========== Button ==========
    Button: {
      primaryShadow: '0 8px 18px rgba(34, 195, 238, 0.24)',
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 28,
      borderRadius: 6,
      borderRadiusLG: 12,
      borderRadiusSM: 4,
    },

    // ========== Input ==========
    Input: {
      controlHeight: 32,
      controlHeightLG: 40,
      borderRadius: 6,
      paddingBlock: 4,
      paddingInline: 12,
    },

    // ========== Select ==========
    Select: {
      controlHeight: 32,
      borderRadius: 6,
    },

    // ========== Tree ==========
    Tree: {
      fontSize: 13,
      nodeSelectedBg: '#e6f7ff',
      nodeHoverBg: '#f5f5f5',
      titleHeight: 28,
    },

    // ========== Drawer ==========
    Drawer: {
      paddingLG: 18,
      borderRadiusLG: 0,
    },

    // ========== Modal ==========
    Modal: {
      borderRadiusLG: 8,
      paddingContentHorizontalLG: 28,
      paddingMD: 20,
    },

    // ========== Badge ==========
    Badge: {
      dotSize: 6,
    },

    // ========== Tag ==========
    Tag: {
      borderRadiusSM: 4,
      fontSize: 12,
    },

    // ========== Segmented ==========
    Segmented: {
      borderRadius: 6,
      itemSelectedBg: '#ffffff',
    },

    // ========== Tooltip ==========
    Tooltip: {
      borderRadius: 6,
      fontSize: 13,
      colorBgSpotlight: 'rgba(0, 0, 0, 0.85)',
    },
  },
};
