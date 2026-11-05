import type { AppModule } from '../../router/types';
import CrmOverviewPage from './CrmOverviewPage';
import LeadsPage from './LeadsPage';
import OpportunitiesPage from './OpportunitiesPage';
import ActivitiesPage from './ActivitiesPage';
import ContractsPage from './ContractsPage';
import CustomerRankPage from './CustomerRankPage';

const mod: AppModule = {
  group: { key: 'crm', label: '客户关系', icon: 'ContactsOutlined', order: 80 },
  routes: [
    { path: '/crm/overview', label: '销售漏斗总览', icon: 'FundOutlined', element: <CrmOverviewPage />, perm: 'crm.view' },
    { path: '/crm/leads', label: '线索管理', icon: 'SolutionOutlined', element: <LeadsPage />, perm: 'crm.view' },
    { path: '/crm/opportunities', label: '商机管理', icon: 'RiseOutlined', element: <OpportunitiesPage />, perm: 'crm.view' },
    { path: '/crm/activities', label: '跟进记录', icon: 'HistoryOutlined', element: <ActivitiesPage />, perm: 'crm.view' },
    { path: '/crm/contracts', label: '合同管理', icon: 'FileDoneOutlined', element: <ContractsPage />, perm: 'crm.view' },
    { path: '/crm/customer-rank', label: '客户贡献排行', icon: 'BarChartOutlined', element: <CustomerRankPage />, perm: 'crm.view' },
  ],
};

export default mod;
