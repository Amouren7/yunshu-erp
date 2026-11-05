import { Space, Tag } from 'antd';
import CrudPage from '../../components/CrudPage';
import PageHeader from '../../components/PageHeader';
import SimpleStatusTag from '../../components/StatusTag';
import { fmtMoney } from '../../utils/format';
import { useMeta } from '../../store/meta';

const STATUS = [{ label: '正常', value: '正常' }, { label: '停用', value: '停用' }];
const ENABLED = [{ label: '启用', value: '启用' }, { label: '停用', value: '停用' }];

export function ItemsPage() {
  const { enumOf, dict } = useMeta();
  const categoryOptions = (dict('itemCategories') || []).map((c: any) => ({ label: c.name, value: c.id }));
  return (
    <CrudPage
      title="物料管理"
      subtitle="物料主数据：成品、半成品、原材料、包装物等，支持分类、价格、安全库存与批次管理"
      base="/api/masterdata/items"
      entity="物料"
      permModule="basedata"
      exportFilename="物料档案"
      drawerWidth={860}
      columns={[
        { title: '物料编码', dataIndex: 'code', width: 130, fixed: 'left', render: (v) => <b>{v}</b> },
        { title: '物料名称', dataIndex: 'name', width: 180, ellipsis: true },
        { title: '规格型号', dataIndex: 'spec', width: 200, ellipsis: true },
        { title: '分类', dataIndex: 'category_name', width: 110, render: (v) => v || '-' },
        { title: '类型', dataIndex: 'item_type', width: 90, render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag> },
        { title: '单位', dataIndex: 'uom', width: 60, align: 'center' },
        { title: '采购价', dataIndex: 'price_purchase', width: 100, align: 'right', render: (v) => fmtMoney(v) },
        { title: '销售价', dataIndex: 'price_sale', width: 100, align: 'right', render: (v) => fmtMoney(v) },
        { title: '库存数量', dataIndex: 'stock_qty', width: 100, align: 'right', render: (v) => <span className="num">{Number(v || 0)}</span> },
        { title: '安全库存', dataIndex: 'safety_stock', width: 90, align: 'right' },
        { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: (v) => <SimpleStatusTag value={v} /> },
      ]}
      filters={[
        { key: 'category_id', label: '物料分类', type: 'select', options: categoryOptions },
        { key: 'item_type', label: '物料类型', type: 'select', options: (enumOf('itemTypes') || []).map((x: any) => ({ label: x, value: x })) },
        { key: 'status', label: '状态', type: 'select', options: ENABLED },
      ]}
      fields={[
        { key: 'code', label: '物料编码', required: true, span: 8 },
        { key: 'name', label: '物料名称', required: true, span: 8 },
        { key: 'spec', label: '规格型号', span: 8 },
        { key: 'category_id', label: '物料分类', type: 'select', dict: 'itemCategories', span: 8 },
        { key: 'item_type', label: '物料类型', type: 'select', enumKey: 'itemTypes', span: 8 },
        { key: 'uom', label: '计量单位', span: 8, placeholder: '如：台 / 个 / 张' },
        { key: 'brand', label: '品牌', span: 8 },
        { key: 'barcode', label: '条码', span: 8 },
        { key: 'origin', label: '产地', span: 8 },
        { key: 'price_purchase', label: '参考采购价', type: 'money', span: 8 },
        { key: 'price_sale', label: '参考销售价', type: 'money', span: 8 },
        { key: 'cost', label: '标准成本', type: 'money', span: 8 },
        { key: 'tax_rate', label: '税率%', type: 'number', span: 8 },
        { key: 'safety_stock', label: '安全库存', type: 'number', span: 8 },
        { key: 'max_stock', label: '最高库存', type: 'number', span: 8 },
        { key: 'batch_control', label: '批次管理', type: 'switch', span: 8 },
        { key: 'shelf_life_days', label: '保质期(天)', type: 'number', span: 8 },
        { key: 'status', label: '状态', type: 'select', enumKey: 'itemStatus', span: 8 },
        { key: 'remark', label: '备注', type: 'textarea', span: 24 },
      ]}
      detailFields={[
        { key: 'code', label: '物料编码' }, { key: 'name', label: '物料名称' },
        { key: 'spec', label: '规格型号' }, { key: 'category_name', label: '分类' },
        { key: 'item_type', label: '类型' }, { key: 'uom', label: '单位' },
        { key: 'price_purchase', label: '采购价', render: (v) => fmtMoney(v) },
        { key: 'price_sale', label: '销售价', render: (v) => fmtMoney(v) },
        { key: 'stock_qty', label: '库存数量' }, { key: 'stock_amount', label: '库存金额', render: (v) => fmtMoney(v) },
        { key: 'safety_stock', label: '安全库存' }, { key: 'status', label: '状态' },
        { key: 'remark', label: '备注', render: (v) => v || '-' },
      ]}
    />
  );
}

export function CategoriesPage() {
  return (
    <CrudPage
      title="物料分类"
      subtitle="维护物料分类树，用于统计分析、库存汇总与报表分类"
      base="/api/masterdata/item-categories"
      entity="分类"
      permModule="basedata"
      columns={[
        { title: '分类编码', dataIndex: 'code', width: 120 },
        { title: '分类名称', dataIndex: 'name', width: 200 },
        { title: '上级分类', dataIndex: 'parent_id', width: 160, render: (v, r: any) => r.parent_name || (v ? v : '-') },
        { title: '排序', dataIndex: 'sort', width: 80, align: 'center' },
        { title: '状态', dataIndex: 'status', width: 90, align: 'center', render: (v) => <SimpleStatusTag value={v === 'ENABLED' ? '启用' : v} /> },
      ]}
      fields={[
        { key: 'code', label: '分类编码', required: true, span: 12 },
        { key: 'name', label: '分类名称', required: true, span: 12 },
        { key: 'parent_id', label: '上级分类', type: 'select', dict: 'itemCategories', span: 12 },
        { key: 'sort', label: '排序', type: 'number', precision: 0, span: 12 },
        { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ENABLED' }, { label: '停用', value: 'DISABLED' }], span: 12 },
      ]}
      toFormValues={(r: any) => ({ ...r, status: r.status === 'ENABLED' ? '启用' : r.status })}
    />
  );
}

export function CustomersPage() {
  return (
    <CrudPage
      title="客户管理"
      subtitle="客户档案、信用额度、应收账龄与业务员归属"
      base="/api/masterdata/customers"
      entity="客户"
      permModule="basedata"
      exportFilename="客户档案"
      drawerWidth={860}
      columns={[
        { title: '客户编码', dataIndex: 'code', width: 110, fixed: 'left' },
        { title: '客户名称', dataIndex: 'name', width: 230, ellipsis: true, render: (v) => <b>{v}</b> },
        { title: '等级', dataIndex: 'level', width: 70, align: 'center', render: (v) => <Tag color={v === 'A' ? 'green' : v === 'B' ? 'blue' : 'default'}>{v}</Tag> },
        { title: '类型', dataIndex: 'category', width: 100 },
        { title: '区域', dataIndex: 'region', width: 90 },
        { title: '联系人', dataIndex: 'contact', width: 90 },
        { title: '电话', dataIndex: 'phone', width: 130 },
        { title: '业务员', dataIndex: 'salesman_name', width: 90 },
        { title: '信用额度', dataIndex: 'credit_limit', width: 110, align: 'right', render: (v) => fmtMoney(v, 0) },
        { title: '应收余额', dataIndex: 'ar_balance', width: 110, align: 'right', render: (v) => <span className="num text-danger">{fmtMoney(v)}</span> },
        { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: (v) => <SimpleStatusTag value={v} /> },
      ]}
      filters={[
        { key: 'category', label: '客户类型', type: 'select', options: ['普通客户', '重点客户', '经销商', '终端客户', 'VIP客户'] },
        { key: 'level', label: '客户等级', type: 'select', options: ['A', 'B', 'C', 'D'] },
        { key: 'region', label: '区域', type: 'select', options: ['华南', '华东', '华北', '华中', '西南', '西北', '东北', '海外'] },
      ]}
      fields={[
        { key: 'code', label: '客户编码', required: true, span: 8 },
        { key: 'name', label: '客户名称', required: true, span: 16 },
        { key: 'short_name', label: '简称', span: 8 },
        { key: 'category', label: '客户类型', type: 'select', enumKey: 'customerCategories', span: 8 },
        { key: 'level', label: '客户等级', type: 'select', enumKey: 'customerLevels', span: 8 },
        { key: 'region', label: '区域', type: 'select', enumKey: 'regions', span: 8 },
        { key: 'industry', label: '所属行业', span: 8 },
        { key: 'contact', label: '联系人', span: 8 },
        { key: 'phone', label: '联系电话', span: 8 },
        { key: 'email', label: '邮箱', span: 8 },
        { key: 'address', label: '地址', span: 16 },
        { key: 'tax_no', label: '纳税人识别号', span: 8 },
        { key: 'bank_name', label: '开户银行', span: 8 },
        { key: 'bank_account', label: '银行账号', span: 8 },
        { key: 'credit_limit', label: '信用额度', type: 'money', span: 8 },
        { key: 'credit_days', label: '信用账期(天)', type: 'number', precision: 0, span: 8 },
        { key: 'salesman_id', label: '所属业务员', type: 'employee', span: 8 },
        { key: 'status', label: '状态', type: 'select', options: STATUS, span: 8 },
        { key: 'remark', label: '备注', type: 'textarea', span: 24 },
      ]}
      detailFields={[
        { key: 'code', label: '客户编码' }, { key: 'name', label: '客户名称' },
        { key: 'category', label: '类型' }, { key: 'level', label: '等级' },
        { key: 'contact', label: '联系人' }, { key: 'phone', label: '电话' },
        { key: 'address', label: '地址', render: (v) => v || '-' }, { key: 'tax_no', label: '税号' },
        { key: 'credit_limit', label: '信用额度', render: (v) => fmtMoney(v, 0) },
        { key: 'ar_balance', label: '应收余额', render: (v) => fmtMoney(v) },
      ]}
    />
  );
}

export function SuppliersPage() {
  return (
    <CrudPage
      title="供应商管理"
      subtitle="供应商档案、结算条件、评级与应付余额"
      base="/api/masterdata/suppliers"
      entity="供应商"
      permModule="basedata"
      exportFilename="供应商档案"
      drawerWidth={860}
      columns={[
        { title: '供应商编码', dataIndex: 'code', width: 110, fixed: 'left' },
        { title: '供应商名称', dataIndex: 'name', width: 240, ellipsis: true, render: (v) => <b>{v}</b> },
        { title: '分类', dataIndex: 'category', width: 120 },
        { title: '区域', dataIndex: 'region', width: 90 },
        { title: '联系人', dataIndex: 'contact', width: 90 },
        { title: '电话', dataIndex: 'phone', width: 130 },
        { title: '结算方式', dataIndex: 'payment_terms', width: 120 },
        { title: '评级', dataIndex: 'rating', width: 70, align: 'center', render: (v) => <Tag color={v === 'A' ? 'green' : v === 'B' ? 'blue' : 'default'}>{v}</Tag> },
        { title: '应付余额', dataIndex: 'ap_balance', width: 110, align: 'right', render: (v) => <span className="num text-danger">{fmtMoney(v)}</span> },
        { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: (v) => <SimpleStatusTag value={v} /> },
      ]}
      filters={[
        { key: 'category', label: '供应商分类', type: 'select', options: ['原材料供应商', '包装材料', '外协加工', '物流服务', '设备供应商', '办公用品', '其他'] },
        { key: 'rating', label: '评级', type: 'select', options: ['A', 'B', 'C', 'D'] },
      ]}
      fields={[
        { key: 'code', label: '供应商编码', required: true, span: 8 },
        { key: 'name', label: '供应商名称', required: true, span: 16 },
        { key: 'short_name', label: '简称', span: 8 },
        { key: 'category', label: '分类', type: 'select', enumKey: 'supplierCategories', span: 8 },
        { key: 'region', label: '区域', type: 'select', enumKey: 'regions', span: 8 },
        { key: 'contact', label: '联系人', span: 8 },
        { key: 'phone', label: '联系电话', span: 8 },
        { key: 'email', label: '邮箱', span: 8 },
        { key: 'address', label: '地址', span: 16 },
        { key: 'tax_no', label: '纳税人识别号', span: 8 },
        { key: 'bank_name', label: '开户银行', span: 8 },
        { key: 'bank_account', label: '银行账号', span: 8 },
        { key: 'payment_terms', label: '结算方式', type: 'select', enumKey: 'paymentTerms', span: 8 },
        { key: 'credit_days', label: '信用账期(天)', type: 'number', precision: 0, span: 8 },
        { key: 'rating', label: '评级', type: 'select', options: ['A', 'B', 'C', 'D'], span: 8 },
        { key: 'status', label: '状态', type: 'select', options: STATUS, span: 8 },
        { key: 'remark', label: '备注', type: 'textarea', span: 24 },
      ]}
    />
  );
}

export function WarehousesPage() {
  return (
    <CrudPage
      title="仓库管理"
      subtitle="多仓库管理：原料仓、成品仓、半成品仓、不良品仓"
      base="/api/masterdata/warehouses"
      entity="仓库"
      permModule="basedata"
      columns={[
        { title: '仓库编码', dataIndex: 'code', width: 110 },
        { title: '仓库名称', dataIndex: 'name', width: 180, render: (v) => <b>{v}</b> },
        { title: '仓库类型', dataIndex: 'type', width: 120, render: (v) => <Tag>{v}</Tag> },
        { title: '地址', dataIndex: 'address', ellipsis: true },
        { title: '负责人', dataIndex: 'manager_name', width: 100 },
        { title: '电话', dataIndex: 'phone', width: 130 },
        { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: (v) => <SimpleStatusTag value={v === 'ENABLED' ? '启用' : '停用'} /> },
      ]}
      fields={[
        { key: 'code', label: '仓库编码', required: true, span: 8 },
        { key: 'name', label: '仓库名称', required: true, span: 8 },
        { key: 'type', label: '仓库类型', type: 'select', enumKey: 'warehouseTypes', span: 8 },
        { key: 'address', label: '地址', span: 16 },
        { key: 'manager_id', label: '负责人', type: 'employee', span: 8 },
        { key: 'phone', label: '电话', span: 8 },
        { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ENABLED' }, { label: '停用', value: 'DISABLED' }], span: 8 },
        { key: 'remark', label: '备注', type: 'textarea', span: 24 },
      ]}
    />
  );
}

export function DepartmentsPage() {
  return (
    <CrudPage
      title="部门管理"
      subtitle="组织架构与部门负责人、成本中心"
      base="/api/masterdata/departments"
      entity="部门"
      permModule="basedata"
      columns={[
        { title: '部门编码', dataIndex: 'code', width: 110 },
        { title: '部门名称', dataIndex: 'name', width: 180, render: (v) => <b>{v}</b> },
        { title: '上级部门', dataIndex: 'parent_name', width: 150, render: (v) => v || '-' },
        { title: '负责人', dataIndex: 'manager_name', width: 100, render: (v) => v || '-' },
        { title: '成本中心', dataIndex: 'cost_center', width: 120 },
        { title: '在职人数', dataIndex: 'employee_count', width: 90, align: 'center' },
        { title: '排序', dataIndex: 'sort', width: 70, align: 'center' },
        { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: (v) => <SimpleStatusTag value={v === 'ENABLED' ? '启用' : '停用'} /> },
      ]}
      fields={[
        { key: 'code', label: '部门编码', required: true, span: 8 },
        { key: 'name', label: '部门名称', required: true, span: 8 },
        { key: 'parent_id', label: '上级部门', type: 'select', dict: 'departments', span: 8 },
        { key: 'manager_id', label: '部门负责人', type: 'employee', span: 8 },
        { key: 'cost_center', label: '成本中心', span: 8 },
        { key: 'sort', label: '排序', type: 'number', precision: 0, span: 8 },
        { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: 'ENABLED' }, { label: '停用', value: 'DISABLED' }], span: 8 },
      ]}
    />
  );
}

export function EmployeesPage() {
  return (
    <CrudPage
      title="员工档案"
      subtitle="员工基本信息、部门、岗位、薪资与在职状态"
      base="/api/masterdata/employees"
      entity="员工"
      permModule="basedata"
      exportFilename="员工档案"
      drawerWidth={860}
      columns={[
        { title: '工号', dataIndex: 'code', width: 90 },
        { title: '姓名', dataIndex: 'name', width: 100, render: (v) => <b>{v}</b> },
        { title: '部门', dataIndex: 'department_name', width: 120 },
        { title: '岗位', dataIndex: 'position', width: 120 },
        { title: '员工类型', dataIndex: 'employee_type', width: 100 },
        { title: '性别', dataIndex: 'gender', width: 60, align: 'center' },
        { title: '电话', dataIndex: 'phone', width: 130 },
        { title: '入职日期', dataIndex: 'hire_date', width: 110 },
        { title: '基本工资', dataIndex: 'base_salary', width: 110, align: 'right', render: (v) => fmtMoney(v, 0) },
        { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: (v) => <SimpleStatusTag value={v} /> },
      ]}
      filters={[
        { key: 'employee_type', label: '员工类型', type: 'select', options: ['正式员工', '试用期', '实习生', '外包人员'] },
        { key: 'status', label: '状态', type: 'select', options: ['在职', '离职', '停薪留职'] },
      ]}
      fields={[
        { key: 'code', label: '工号', required: true, span: 8 },
        { key: 'name', label: '姓名', required: true, span: 8 },
        { key: 'department_id', label: '所属部门', type: 'select', dict: 'departments', span: 8 },
        { key: 'position', label: '岗位', span: 8 },
        { key: 'employee_type', label: '员工类型', type: 'select', enumKey: 'employeeTypes', span: 8 },
        { key: 'gender', label: '性别', type: 'select', options: ['男', '女'], span: 8 },
        { key: 'birthday', label: '出生日期', type: 'date', span: 8 },
        { key: 'id_card', label: '身份证号', span: 8 },
        { key: 'phone', label: '联系电话', span: 8 },
        { key: 'email', label: '邮箱', span: 8 },
        { key: 'address', label: '住址', span: 16 },
        { key: 'hire_date', label: '入职日期', type: 'date', span: 8 },
        { key: 'base_salary', label: '基本工资', type: 'money', span: 8 },
        { key: 'education', label: '学历', type: 'select', enumKey: 'education', span: 8 },
        { key: 'bank_name', label: '开户银行', span: 8 },
        { key: 'bank_account', label: '银行账号', span: 8 },
        { key: 'status', label: '在职状态', type: 'select', enumKey: 'employeeStatus', span: 8 },
        { key: 'remark', label: '备注', type: 'textarea', span: 24 },
      ]}
    />
  );
}

export function UomsPage() {
  return (
    <CrudPage
      title="计量单位"
      subtitle="物料计量单位及换算率"
      base="/api/masterdata/uoms"
      entity="计量单位"
      permModule="basedata"
      columns={[
        { title: '单位编码', dataIndex: 'code', width: 140 },
        { title: '单位名称', dataIndex: 'name', width: 200 },
        { title: '换算率', dataIndex: 'rate', width: 120, align: 'right' },
      ]}
      fields={[
        { key: 'code', label: '单位编码', required: true, span: 8 },
        { key: 'name', label: '单位名称', required: true, span: 8 },
        { key: 'rate', label: '换算率', type: 'number', span: 8 },
      ]}
    />
  );
}

export function TaxRatesPage() {
  return (
    <CrudPage
      title="税率设置"
      subtitle="增值税税率等税务基础数据"
      base="/api/masterdata/tax-rates"
      entity="税率"
      permModule="basedata"
      columns={[
        { title: '编码', dataIndex: 'code', width: 140 },
        { title: '名称', dataIndex: 'name', width: 220 },
        { title: '税率%', dataIndex: 'rate', width: 120, align: 'right' },
      ]}
      fields={[
        { key: 'code', label: '编码', required: true, span: 8 },
        { key: 'name', label: '名称', required: true, span: 8 },
        { key: 'rate', label: '税率%', type: 'number', required: true, span: 8 },
      ]}
    />
  );
}

export function AccountsPage() {
  return (
    <CrudPage
      title="会计科目"
      subtitle="小企业会计准则科目表，业务单据审核后自动生成凭证"
      base="/api/masterdata/accounts"
      entity="会计科目"
      permModule="finance"
      columns={[
        { title: '科目编码', dataIndex: 'code', width: 110 },
        { title: '科目名称', dataIndex: 'name', width: 240 },
        { title: '类别', dataIndex: 'category', width: 110, render: (v: string) => ({ ASSET: '资产', LIABILITY: '负债', EQUITY: '所有者权益', COST: '成本', INCOME: '收入', EXPENSE: '费用' } as any)[v] || v },
        { title: '余额方向', dataIndex: 'direction', width: 90, render: (v: string) => (v === 'DEBIT' ? '借方' : '贷方') },
        { title: '上级科目', dataIndex: 'parent_code', width: 110, render: (v) => v || '-' },
        { title: '末级', dataIndex: 'is_leaf', width: 70, align: 'center', render: (v) => (v ? '是' : '否') },
        { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: (v) => <SimpleStatusTag value={v} /> },
      ]}
      filters={[
        { key: 'category', label: '科目类别', type: 'select', options: [
          { label: '资产', value: 'ASSET' }, { label: '负债', value: 'LIABILITY' }, { label: '所有者权益', value: 'EQUITY' },
          { label: '成本', value: 'COST' }, { label: '收入', value: 'INCOME' }, { label: '费用', value: 'EXPENSE' },
        ] },
      ]}
      fields={[
        { key: 'code', label: '科目编码', required: true, span: 8 },
        { key: 'name', label: '科目名称', required: true, span: 8 },
        { key: 'category', label: '科目类别', type: 'select', enumKey: 'accountCategories', span: 8 },
        { key: 'direction', label: '余额方向', type: 'select', options: [{ label: '借方', value: 'DEBIT' }, { label: '贷方', value: 'CREDIT' }], span: 8 },
        { key: 'parent_code', label: '上级科目编码', span: 8 },
        { key: 'level', label: '科目级次', type: 'number', precision: 0, span: 8 },
        { key: 'is_leaf', label: '末级科目', type: 'switch', span: 8 },
        { key: 'status', label: '状态', type: 'select', options: [{ label: '启用', value: '启用' }, { label: '停用', value: '停用' }], span: 8 },
      ]}
    />
  );
}

export function CompanyProfilePage() {
  return (
    <div>
      <PageHeader title="企业信息" subtitle="用于单据打印、报表表头与系统展示" />
      <div className="card card-pad">
        <Space direction="vertical" size={12}>
          <span className="text-muted">企业信息可在「系统管理 → 系统参数」中维护。</span>
        </Space>
      </div>
    </div>
  );
}
