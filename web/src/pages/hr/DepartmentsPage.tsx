import { Space, Tag } from 'antd';
import CrudPage from '../../components/CrudPage';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney } from '../../utils/format';

/** 部门与编制：复用主数据部门 CRUD，并展示在职人数 / 负责人等编制信息 */
export default function DepartmentsPage() {
  const stats = useRequest(() => api.get('/api/hr/departments/stats'), []);
  const totals = stats.data?.totals || {};

  return (
    <CrudPage
      title="部门与编制"
      subtitle="组织架构、部门负责人与编制人数；在职人数、基本工资与本期薪资支出按人事数据实时统计"
      base="/api/masterdata/departments"
      entity="部门"
      permModule="basedata"
      drawerWidth={680}
      scrollX={1240}
      headerExtra={(
        <Space size={6} style={{ marginInlineEnd: 8 }}>
          <Tag color="blue">部门 {totals.departmentCount || 0} 个</Tag>
          <Tag color="green">在职 {totals.employeeCount || 0} 人</Tag>
          <Tag color="gold">基本工资 ¥{fmtMoney(totals.totalBaseSalary, 0)}</Tag>
          <Tag color="purple">本期薪资支出 ¥{fmtMoney(totals.payrollNet, 0)}</Tag>
        </Space>
      )}
      columns={[
        { title: '部门编码', dataIndex: 'code', width: 110 },
        { title: '部门名称', dataIndex: 'name', width: 180, render: (v: string) => <b>{v}</b> },
        { title: '上级部门', dataIndex: 'parent_name', width: 140, render: (v: string) => v || '-' },
        { title: '负责人', dataIndex: 'manager_name', width: 110, render: (v: string) => v || <span className="text-muted">未设置</span> },
        { title: '成本中心', dataIndex: 'cost_center', width: 120, render: (v: string) => v || '-' },
        {
          title: '在职人数', dataIndex: 'employee_count', width: 100, align: 'center',
          render: (v: number) => <b className="num">{Number(v) || 0}</b>,
        },
        { title: '排序', dataIndex: 'sort', width: 70, align: 'center' },
        {
          title: '状态', dataIndex: 'status', width: 90, align: 'center',
          render: (v: string) => <Tag color={v === 'ENABLED' ? 'green' : 'default'}>{v === 'ENABLED' ? '启用' : '停用'}</Tag>,
        },
      ]}
      fields={[
        { key: 'code', label: '部门编码', required: true, span: 12 },
        { key: 'name', label: '部门名称', required: true, span: 12 },
        { key: 'parent_id', label: '上级部门', type: 'select', dict: 'departments', span: 12 },
        { key: 'manager_id', label: '部门负责人', type: 'employee', span: 12 },
        { key: 'cost_center', label: '成本中心', span: 12 },
        { key: 'sort', label: '排序', type: 'number', precision: 0, span: 12 },
        { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ENABLED' }, { label: '停用', value: 'DISABLED' }], span: 12 },
      ]}
      exportFilename="部门编制"
    />
  );
}
