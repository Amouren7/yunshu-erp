/**
 * 财务管理模块路由（菜单分组 finance，order 60）
 */
import type { AppModule } from '../../router/types';
import OverviewPage from './OverviewPage';
import { ReceivablesPage, PayablesPage, InvoicesPage } from './InvoicePages';
import { ReceiptsPage, ReceiptEditor, PaymentsPage, PaymentEditor } from './PaymentDocPages';
import { VouchersPage, VoucherNewPage, VoucherDetailPage } from './VoucherPages';
import StatementsPage from './StatementPage';
import TrialBalancePage from './TrialBalancePage';
import LedgerPage from './LedgerPage';
import AgingPage from './AgingPage';
import GlMappingsPage from './GlMappingsPage';

const mod: AppModule = {
  group: { key: 'finance', label: '财务管理', icon: 'BankOutlined', order: 60 },
  routes: [
    { path: '/finance/overview', label: '财务总览', icon: 'DashboardOutlined', element: <OverviewPage />, perm: 'finance.view' },
    { path: '/finance/receivables', label: '应收台账', icon: 'WalletOutlined', element: <ReceivablesPage />, perm: 'finance.view' },
    { path: '/finance/payables', label: '应付台账', icon: 'BankOutlined', element: <PayablesPage />, perm: 'finance.view' },
    { path: '/finance/invoices', label: '发票管理', icon: 'FileTextOutlined', element: <InvoicesPage />, perm: 'finance.view' },

    { path: '/finance/receipts', label: '收款单', icon: 'MoneyCollectOutlined', element: <ReceiptsPage />, perm: 'finance.view' },
    { path: '/finance/receipts/new', label: '新建收款单', element: <ReceiptEditor />, hidden: true, perm: 'finance.create' },
    { path: '/finance/receipts/:id', label: '收款单详情', element: <ReceiptEditor />, hidden: true, perm: 'finance.view' },
    { path: '/finance/payments', label: '付款单', icon: 'PayCircleOutlined', element: <PaymentsPage />, perm: 'finance.view' },
    { path: '/finance/payments/new', label: '新建付款单', element: <PaymentEditor />, hidden: true, perm: 'finance.create' },
    { path: '/finance/payments/:id', label: '付款单详情', element: <PaymentEditor />, hidden: true, perm: 'finance.view' },

    { path: '/finance/vouchers', label: '会计凭证', icon: 'AccountBookOutlined', element: <VouchersPage />, perm: 'finance.view' },
    { path: '/finance/vouchers/new', label: '手工凭证录入', element: <VoucherNewPage />, hidden: true, perm: 'finance.create' },
    { path: '/finance/vouchers/:id', label: '凭证详情', element: <VoucherDetailPage />, hidden: true, perm: 'finance.view' },

    { path: '/finance/statements', label: '财务报表', icon: 'BarChartOutlined', element: <StatementsPage />, perm: 'finance.view' },
    { path: '/finance/trial-balance', label: '科目余额表', icon: 'TableOutlined', element: <TrialBalancePage />, perm: 'finance.view' },
    { path: '/finance/ledger', label: '明细账', icon: 'UnorderedListOutlined', element: <LedgerPage />, perm: 'finance.view' },
    { path: '/finance/aging', label: '账龄分析', icon: 'PieChartOutlined', element: <AgingPage />, perm: 'finance.view' },
    { path: '/finance/gl-mappings', label: '科目映射', icon: 'ReconciliationOutlined', element: <GlMappingsPage />, perm: 'finance.view' },
  ],
};

export default mod;
