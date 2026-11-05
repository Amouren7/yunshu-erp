import type { AppModule } from '../../router/types';
import {
  StockBalancesPage, StockLedgerPage, StockAlertsPage,
  TransfersPage, TransferEditor, StocktakePage, StocktakeEditor,
  OtherInPage, OtherInEditor, OtherOutPage, OtherOutEditor,
} from './InventoryPages';

const mod: AppModule = {
  group: { key: 'inventory', label: '库存管理', icon: 'InboxOutlined', order: 40 },
  routes: [
    { path: '/inventory/balances', label: '库存余额', icon: 'TableOutlined', element: <StockBalancesPage />, perm: 'inventory.view' },
    { path: '/inventory/ledger', label: '库存流水', icon: 'UnorderedListOutlined', element: <StockLedgerPage />, perm: 'inventory.view' },
    { path: '/inventory/alerts', label: '库存预警', icon: 'AlertOutlined', element: <StockAlertsPage />, perm: 'inventory.view' },
    { path: '/inventory/transfers', label: '库存调拨单', icon: 'SwapOutlined', element: <TransfersPage />, perm: 'inventory.view' },
    { path: '/inventory/transfers/new', label: '新建库存调拨单', element: <TransferEditor />, hidden: true, perm: 'inventory.create' },
    { path: '/inventory/transfers/:id', label: '库存调拨单详情', element: <TransferEditor />, hidden: true, perm: 'inventory.view' },
    { path: '/inventory/stocktake', label: '库存盘点单', icon: 'ReconciliationOutlined', element: <StocktakePage />, perm: 'inventory.view' },
    { path: '/inventory/stocktake/new', label: '新建库存盘点单', element: <StocktakeEditor />, hidden: true, perm: 'inventory.create' },
    { path: '/inventory/stocktake/:id', label: '库存盘点单详情', element: <StocktakeEditor />, hidden: true, perm: 'inventory.view' },
    { path: '/inventory/other-in', label: '其他入库单', icon: 'ImportOutlined', element: <OtherInPage />, perm: 'inventory.view' },
    { path: '/inventory/other-in/new', label: '新建其他入库单', element: <OtherInEditor />, hidden: true, perm: 'inventory.create' },
    { path: '/inventory/other-in/:id', label: '其他入库单详情', element: <OtherInEditor />, hidden: true, perm: 'inventory.view' },
    { path: '/inventory/other-out', label: '其他出库单', icon: 'ExportOutlined', element: <OtherOutPage />, perm: 'inventory.view' },
    { path: '/inventory/other-out/new', label: '新建其他出库单', element: <OtherOutEditor />, hidden: true, perm: 'inventory.create' },
    { path: '/inventory/other-out/:id', label: '其他出库单详情', element: <OtherOutEditor />, hidden: true, perm: 'inventory.view' },
  ],
};

export default mod;
