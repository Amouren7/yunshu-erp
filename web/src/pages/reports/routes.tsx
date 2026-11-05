import type { AppModule } from '../../router/types';
import KpiReportPage from './KpiPage';
import SalesSummaryPage from './SalesSummaryPage';
import SalesTrendPage from './SalesTrendPage';
import PurchaseSummaryPage from './PurchaseSummaryPage';
import InventoryReportPage from './InventoryReportPage';
import GrossProfitPage from './GrossProfitPage';
import CustomerContributionPage from './CustomerContributionPage';
import ProductRankingPage from './ProductRankingPage';

const mod: AppModule = {
  group: { key: 'reports', label: '报表中心', icon: 'BarChartOutlined', order: 90 },
  routes: [
    { path: '/reports/kpi', label: '经营驾驶舱', icon: 'DashboardOutlined', element: <KpiReportPage />, perm: 'reports.view' },
    { path: '/reports/sales-summary', label: '销售汇总表', icon: 'TableOutlined', element: <SalesSummaryPage />, perm: 'reports.view' },
    { path: '/reports/sales-trend', label: '销售趋势分析', icon: 'LineChartOutlined', element: <SalesTrendPage />, perm: 'reports.view' },
    { path: '/reports/purchase-summary', label: '采购汇总表', icon: 'ShoppingOutlined', element: <PurchaseSummaryPage />, perm: 'reports.view' },
    { path: '/reports/inventory', label: '库存分析', icon: 'InboxOutlined', element: <InventoryReportPage />, perm: 'reports.view' },
    { path: '/reports/gross-profit', label: '毛利分析', icon: 'PercentageOutlined', element: <GrossProfitPage />, perm: 'reports.view' },
    { path: '/reports/customer-contribution', label: '客户贡献分析', icon: 'PieChartOutlined', element: <CustomerContributionPage />, perm: 'reports.view' },
    { path: '/reports/product-ranking', label: '产品畅销榜', icon: 'FundOutlined', element: <ProductRankingPage />, perm: 'reports.view' },
  ],
};

export default mod;
