import type { AppModule } from '../../router/types';
import {
  ItemsPage, CategoriesPage, CustomersPage, SuppliersPage, WarehousesPage,
  DepartmentsPage, EmployeesPage, UomsPage, TaxRatesPage, AccountsPage,
} from './BasedataPages';

const mod: AppModule = {
  group: { key: 'basedata', label: '基础资料', icon: 'DatabaseOutlined', order: 10 },
  routes: [
    { path: '/basedata/items', label: '物料管理', icon: 'BarcodeOutlined', element: <ItemsPage />, perm: 'basedata.view' },
    { path: '/basedata/categories', label: '物料分类', icon: 'TagOutlined', element: <CategoriesPage />, perm: 'basedata.view' },
    { path: '/basedata/customers', label: '客户管理', icon: 'TeamOutlined', element: <CustomersPage />, perm: 'basedata.view' },
    { path: '/basedata/suppliers', label: '供应商管理', icon: 'ShopOutlined', element: <SuppliersPage />, perm: 'basedata.view' },
    { path: '/basedata/warehouses', label: '仓库管理', icon: 'InboxOutlined', element: <WarehousesPage />, perm: 'basedata.view' },
    { path: '/basedata/departments', label: '部门管理', icon: 'ApartmentOutlined', element: <DepartmentsPage />, perm: 'basedata.view' },
    { path: '/basedata/employees', label: '员工档案', icon: 'IdcardOutlined', element: <EmployeesPage />, perm: 'basedata.view' },
    { path: '/basedata/uoms', label: '计量单位', icon: 'UnorderedListOutlined', element: <UomsPage />, perm: 'basedata.view' },
    { path: '/basedata/tax-rates', label: '税率设置', icon: 'PercentageOutlined', element: <TaxRatesPage />, perm: 'basedata.view' },
    { path: '/basedata/accounts', label: '会计科目', icon: 'AccountBookOutlined', element: <AccountsPage />, perm: 'finance.view' },
  ],
};

export default mod;
