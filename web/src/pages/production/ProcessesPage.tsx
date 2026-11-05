import { Tabs, Tag } from 'antd';
import CrudPage from '../../components/CrudPage';
import { SimpleStatus } from '../../components/StatusTag';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney, fmtNumber } from '../../utils/format';

const STATUS_OPTIONS = [
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
];

const WC_TYPES = ['加工中心', '装配线', '测试中心', '包装线', '外协单位'];

/** 工序与工作中心基础数据（Tabs：工作中心 / 工序） */
export default function ProcessesPage() {
  const centers = useRequest<any>(() => api.get('/api/masterdata/work-centers', { pageSize: 200 }), []);
  const centerRows: any[] = centers.data?.rows || [];
  const centerOptions = centerRows.map((w: any) => ({ label: `${w.code} ${w.name}`, value: w.id }));
  const centerNameOf = (id: any) => {
    const w = centerRows.find((x) => x.id === id);
    return w ? `${w.code} ${w.name}` : id ? String(id) : '-';
  };

  return (
    <Tabs
      defaultActiveKey="work-centers"
      items={[
        {
          key: 'work-centers',
          label: '工作中心',
          children: (
            <CrudPage
              title="工作中心"
              subtitle="生产资源与产能定义：日可用工时、小时费率，用于工单工序排程与产能负荷测算"
              base="/api/masterdata/work-centers"
              entity="工作中心"
              permModule="basedata"
              exportFilename="工作中心"
              drawerWidth={640}
              scrollX={1200}
              columns={[
                { title: '编码', dataIndex: 'code', width: 100, fixed: 'left', render: (v: string) => <b>{v}</b> },
                { title: '工作中心名称', dataIndex: 'name', width: 200 },
                { title: '类型', dataIndex: 'type', width: 120, render: (v: string) => <Tag>{v || '-'}</Tag> },
                {
                  title: '日产能(工时)',
                  dataIndex: 'capacity',
                  width: 120,
                  align: 'right',
                  render: (v: any) => <span className="num">{fmtNumber(v, 2)} h</span>,
                },
                {
                  title: '小时费率',
                  dataIndex: 'cost_rate',
                  width: 120,
                  align: 'right',
                  render: (v: any) => `¥${fmtMoney(v)}`,
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 90,
                  align: 'center',
                  render: (v: string) => <SimpleStatus value={v === 'ENABLED' ? '启用' : '停用'} />,
                },
              ]}
              filters={[{ key: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS }]}
              fields={[
                { key: 'code', label: '工作中心编码', required: true, span: 12, placeholder: '如 WC05' },
                { key: 'name', label: '工作中心名称', required: true, span: 12 },
                { key: 'type', label: '类型', type: 'select', options: WC_TYPES, span: 12 },
                { key: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS, span: 12 },
                { key: 'capacity', label: '日产能(小时)', type: 'number', precision: 2, span: 12, help: '每日可用工时，用于产能负荷测算' },
                { key: 'cost_rate', label: '小时费率', type: 'money', span: 12, help: '每小时人工/制造费用' },
              ]}
              detailFields={[
                { key: 'code', label: '编码' },
                { key: 'name', label: '名称' },
                { key: 'type', label: '类型' },
                { key: 'capacity', label: '日产能(工时)', render: (v) => `${fmtNumber(v, 2)} h` },
                { key: 'cost_rate', label: '小时费率', render: (v) => `¥${fmtMoney(v)}` },
                { key: 'status', label: '状态', render: (v) => (v === 'ENABLED' ? '启用' : '停用') },
              ]}
            />
          ),
        },
        {
          key: 'processes',
          label: '工序',
          children: (
            <CrudPage
              title="工序"
              subtitle="工艺路线基础数据：工序名称、所属工作中心与标准工时，BOM 关联工序后自动生成工单工序计划"
              base="/api/masterdata/processes"
              entity="工序"
              permModule="basedata"
              exportFilename="工序档案"
              drawerWidth={640}
              scrollX={1200}
              columns={[
                { title: '工序编码', dataIndex: 'code', width: 110, fixed: 'left', render: (v: string) => <b>{v}</b> },
                { title: '工序名称', dataIndex: 'name', width: 180 },
                {
                  title: '所属工作中心',
                  dataIndex: 'work_center_id',
                  width: 190,
                  render: (v: any) => centerNameOf(v),
                },
                {
                  title: '标准工时',
                  dataIndex: 'standard_hours',
                  width: 120,
                  align: 'right',
                  render: (v: any) => <span className="num">{fmtNumber(v, 3)} h</span>,
                },
                { title: '说明', dataIndex: 'description', ellipsis: true, render: (v: string) => v || '-' },
              ]}
              fields={[
                { key: 'code', label: '工序编码', required: true, span: 12, placeholder: '如 P06' },
                { key: 'name', label: '工序名称', required: true, span: 12 },
                {
                  key: 'work_center_id',
                  label: '所属工作中心',
                  type: 'select',
                  options: () => centerOptions,
                  span: 12,
                },
                { key: 'standard_hours', label: '标准工时(小时)', type: 'number', precision: 3, span: 12 },
                { key: 'description', label: '说明', type: 'textarea', span: 24, rows: 3 },
              ]}
              detailFields={[
                { key: 'code', label: '工序编码' },
                { key: 'name', label: '工序名称' },
                { key: 'work_center_id', label: '所属工作中心', render: (v) => centerNameOf(v) },
                { key: 'standard_hours', label: '标准工时', render: (v) => `${fmtNumber(v, 3)} h` },
                { key: 'description', label: '说明', render: (v) => v || '-' },
              ]}
            />
          ),
        },
      ]}
    />
  );
}
