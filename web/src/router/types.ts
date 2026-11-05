import type { ReactNode } from 'react';

export interface AppRoute {
  /** 路由路径，例：/sales/orders */
  path: string;
  /** 菜单/标签名称 */
  label: string;
  /** 图标名称，见 src/layout/icons.tsx 的 ICONS（如 FileTextOutlined） */
  icon?: string;
  /** 页面组件 */
  element: ReactNode;
  /** 不在菜单中显示（如详情页） */
  hidden?: boolean;
  /** 访问所需权限，例：sales.view */
  perm?: string;
  /** 标签页是否可关闭，默认 true */
  closable?: boolean;
}

export interface AppModule {
  group: {
    key: string;
    label: string;
    icon: string;
    /** 越大越靠后 */
    order: number;
  };
  routes: AppRoute[];
}
