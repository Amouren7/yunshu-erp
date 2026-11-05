import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#2f6bff',
    colorInfo: '#2f6bff',
    colorSuccess: '#16a34a',
    colorWarning: '#f59e0b',
    colorError: '#e5484d',
    colorText: '#1f2b3d',
    colorTextSecondary: '#5b6b82',
    colorBorder: '#e4e9f2',
    colorBgLayout: '#f4f6fb',
    borderRadius: 8,
    fontFamily: '"Inter","PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif',
    fontSize: 13,
    controlHeight: 34,
    wireframe: false,
  },
  components: {
    Table: {
      headerBg: '#f7f9fd',
      headerColor: '#5b6b82',
      rowHoverBg: '#f6f9ff',
      cellPaddingBlock: 9,
      borderColor: '#eef1f7',
      headerSplitColor: '#eef1f7',
    },
    Card: { paddingLG: 18 },
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
    Menu: { itemBorderRadius: 7 },
    Tabs: { titleFontSize: 13 },
    Drawer: { footerPaddingBlock: 12 },
    Form: { verticalLabelPadding: '0 0 6px' },
    Descriptions: { itemPaddingBottom: 8 },
    Segmented: { itemSelectedBg: '#eaf1ff' },
  },
};
