import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#1BAEE5',
    fontSize: 14,
    borderRadius: 2,
    colorText: '#212121',
    colorTextSecondary: '#666666',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Button: {
      borderRadius: 4,
    },
    Input: {
      borderRadius: 4,
    },
    Select: {
      borderRadius: 4,
    },
    Table: {
      borderRadius: 4,
    },
    Card: {
      borderRadius: 8,
    },
    Menu: {
      itemBorderRadius: 4,
    },
  },
};
