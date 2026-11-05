import type { AppModule } from '../../router/types';
import ProductionOverviewPage from './OverviewPage';
import WorkOrderListPage from './WorkOrderListPage';
import WorkOrderCreatePage from './WorkOrderCreatePage';
import WorkOrderDetailPage from './WorkOrderDetailPage';
import BomPage from './BomPage';
import MrpPage from './MrpPage';
import WorkCenterLoadPage from './WorkCenterLoadPage';
import SchedulePage from './SchedulePage';
import ProcessesPage from './ProcessesPage';

const mod: AppModule = {
  group: { key: 'production', label: '生产管理', icon: 'BuildOutlined', order: 50 },
  routes: [
    { path: '/production/overview', label: '生产总览', icon: 'DashboardOutlined', element: <ProductionOverviewPage />, perm: 'production.view' },
    { path: '/production/work-orders', label: '生产工单', icon: 'FileTextOutlined', element: <WorkOrderListPage />, perm: 'production.view' },
    { path: '/production/work-orders/new', label: '新建生产工单', element: <WorkOrderCreatePage />, hidden: true, perm: 'production.create' },
    { path: '/production/work-orders/:id', label: '生产工单详情', element: <WorkOrderDetailPage />, hidden: true, perm: 'production.view' },
    { path: '/production/boms', label: 'BOM 管理', icon: 'ApartmentOutlined', element: <BomPage />, perm: 'production.view' },
    { path: '/production/mrp', label: '物料需求计划', icon: 'CalculatorOutlined', element: <MrpPage />, perm: 'production.view' },
    { path: '/production/work-centers', label: '工作中心负荷', icon: 'BarChartOutlined', element: <WorkCenterLoadPage />, perm: 'production.view' },
    { path: '/production/schedule', label: '排产看板', icon: 'CalendarOutlined', element: <SchedulePage />, perm: 'production.view' },
    { path: '/production/processes', label: '工序与工作中心', icon: 'ToolOutlined', element: <ProcessesPage />, perm: 'production.view' },
  ],
};

export default mod;
