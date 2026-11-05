import type { AppModule } from '../../router/types';
import DashboardPage from './DashboardPage';

const mod: AppModule = {
  group: { key: 'dashboard', label: '工作台', icon: 'HomeOutlined', order: 0 },
  routes: [
    { path: '/dashboard', label: '经营概览', icon: 'DashboardOutlined', element: <DashboardPage />, perm: 'dashboard.view', closable: false },
  ],
};

export default mod;
