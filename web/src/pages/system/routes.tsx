import type { AppModule } from '../../router/types';
import UsersPage from './UsersPage';
import RolesPage from './RolesPage';
import SettingsPage from './SettingsPage';
import ProfilePage from './ProfilePage';
import AuditLogsPage from './AuditLogsPage';
import NumberSeriesPage from './NumberSeriesPage';
import NoticesPage from './NoticesPage';
import SystemInfoPage from './SystemInfoPage';

const mod: AppModule = {
  group: { key: 'system', label: '系统管理', icon: 'SettingOutlined', order: 100 },
  routes: [
    { path: '/system/users', label: '用户管理', icon: 'UserOutlined', element: <UsersPage />, perm: 'system.view' },
    { path: '/system/roles', label: '角色权限', icon: 'SafetyCertificateOutlined', element: <RolesPage />, perm: 'system.view' },
    { path: '/system/settings', label: '系统参数', icon: 'ToolOutlined', element: <SettingsPage />, perm: 'system.view' },
    { path: '/system/profile', label: '个人信息', icon: 'IdcardOutlined', element: <ProfilePage /> },
    { path: '/system/audit-logs', label: '操作日志', icon: 'AuditOutlined', element: <AuditLogsPage />, perm: 'system.view' },
    { path: '/system/number-series', label: '单据号规则', icon: 'BarcodeOutlined', element: <NumberSeriesPage />, perm: 'system.view' },
    { path: '/system/notices', label: '通知公告', icon: 'BellOutlined', element: <NoticesPage />, perm: 'system.view' },
    { path: '/system/info', label: '系统信息', icon: 'CloudServerOutlined', element: <SystemInfoPage />, perm: 'system.view' },
  ],
};

export default mod;
