import type { AppModule } from '../../router/types';
import {
  PurchaseOrdersPage, PurchaseOrderEditor, ReceiptsPage, ReceiptEditor, PurchaseReturnsPage, PurchaseReturnEditor,
} from './PurchasePages';

const mod: AppModule = {
  group: { key: 'purchase', label: '采购管理', icon: 'ShoppingOutlined', order: 30 },
  routes: [
    { path: '/purchase/orders', label: '采购订单', icon: 'FileTextOutlined', element: <PurchaseOrdersPage />, perm: 'purchase.view' },
    { path: '/purchase/orders/new', label: '新建采购订单', element: <PurchaseOrderEditor />, hidden: true, perm: 'purchase.create' },
    { path: '/purchase/orders/:id', label: '采购订单详情', element: <PurchaseOrderEditor />, hidden: true, perm: 'purchase.view' },
    { path: '/purchase/receipts', label: '采购入库单', icon: 'InboxOutlined', element: <ReceiptsPage />, perm: 'purchase.view' },
    { path: '/purchase/receipts/new', label: '新建采购入库单', element: <ReceiptEditor />, hidden: true, perm: 'purchase.create' },
    { path: '/purchase/receipts/:id', label: '采购入库单详情', element: <ReceiptEditor />, hidden: true, perm: 'purchase.view' },
    { path: '/purchase/returns', label: '采购退货单', icon: 'SwapOutlined', element: <PurchaseReturnsPage />, perm: 'purchase.view' },
    { path: '/purchase/returns/new', label: '新建采购退货单', element: <PurchaseReturnEditor />, hidden: true, perm: 'purchase.create' },
    { path: '/purchase/returns/:id', label: '采购退货单详情', element: <PurchaseReturnEditor />, hidden: true, perm: 'purchase.view' },
  ],
};

export default mod;
