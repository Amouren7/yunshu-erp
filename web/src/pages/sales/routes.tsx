import type { AppModule } from '../../router/types';
import {
  SalesOrdersPage, SalesOrderEditor, DeliveriesPage, DeliveryEditor, SalesReturnsPage, SalesReturnEditor,
} from './SalesPages';

const mod: AppModule = {
  group: { key: 'sales', label: '销售管理', icon: 'ShoppingCartOutlined', order: 20 },
  routes: [
    { path: '/sales/orders', label: '销售订单', icon: 'FileTextOutlined', element: <SalesOrdersPage />, perm: 'sales.view' },
    { path: '/sales/orders/new', label: '新建销售订单', element: <SalesOrderEditor />, hidden: true, perm: 'sales.create' },
    { path: '/sales/orders/:id', label: '销售订单详情', element: <SalesOrderEditor />, hidden: true, perm: 'sales.view' },
    { path: '/sales/deliveries', label: '销售发货单', icon: 'TruckOutlined', element: <DeliveriesPage />, perm: 'sales.view' },
    { path: '/sales/deliveries/new', label: '新建销售发货单', element: <DeliveryEditor />, hidden: true, perm: 'sales.create' },
    { path: '/sales/deliveries/:id', label: '销售发货单详情', element: <DeliveryEditor />, hidden: true, perm: 'sales.view' },
    { path: '/sales/returns', label: '销售退货单', icon: 'SwapOutlined', element: <SalesReturnsPage />, perm: 'sales.view' },
    { path: '/sales/returns/new', label: '新建销售退货单', element: <SalesReturnEditor />, hidden: true, perm: 'sales.create' },
    { path: '/sales/returns/:id', label: '销售退货单详情', element: <SalesReturnEditor />, hidden: true, perm: 'sales.view' },
  ],
};

export default mod;
