import type { AppModule } from '../../router/types';
import HrOverviewPage from './HrOverviewPage';
import AttendancesPage from './AttendancesPage';
import PayrollsPage from './PayrollsPage';
import LeavesPage from './LeavesPage';
import DepartmentsPage from './DepartmentsPage';

const mod: AppModule = {
  group: { key: 'hr', label: '人力资源', icon: 'TeamOutlined', order: 70 },
  routes: [
    { path: '/hr/overview', label: '人事总览', icon: 'DashboardOutlined', element: <HrOverviewPage />, perm: 'hr.view' },
    { path: '/hr/attendances', label: '考勤管理', icon: 'CalendarOutlined', element: <AttendancesPage />, perm: 'hr.view' },
    { path: '/hr/payrolls', label: '薪资管理', icon: 'MoneyCollectOutlined', element: <PayrollsPage />, perm: 'hr.view' },
    { path: '/hr/leaves', label: '请假管理', icon: 'ScheduleOutlined', element: <LeavesPage />, perm: 'hr.view' },
    { path: '/hr/departments', label: '部门与编制', icon: 'ApartmentOutlined', element: <DepartmentsPage />, perm: 'hr.view' },
  ],
};

export default mod;
