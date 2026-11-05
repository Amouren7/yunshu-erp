import { useMemo } from 'react';
import { Button, Dropdown, Popconfirm, Space, App, type MenuProps } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, MoreOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import DataTable, { type FilterDef } from './DataTable';
import PageHeader from './PageHeader';
import StatusTag from './StatusTag';
import { useAuth } from '../store/auth';
import { useMeta } from '../store/meta';
import { fmtMoney } from '../utils/format';

export interface DocListPageProps {
  docType: string;
  title: string;
  subtitle?: React.ReactNode;
  basePath: string;
  permModule?: string;
  extraFilters?: FilterDef[];
  extraColumns?: ColumnsType<any>;
  helpText?: string;
  hideCreate?: boolean;
}

const MODULE_LABEL: Record<string, string> = {
  customer: '客户', supplier: '供应商', employee: '员工', none: '',
};

/** 通用单据列表页（销售/采购/库存/资金 全单据类型） */
export default function DocListPage(props: DocListPageProps) {
  const { docType, title, subtitle, basePath, extraFilters = [], extraColumns = [], hideCreate } = props;
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { hasPerm } = useAuth();
  const { meta } = useMeta();
  const docMeta = meta?.docTypes?.[docType];
  const permModule = props.permModule || docMeta?.module || 'sales';

  const filters = useMemo<FilterDef[]>(() => ([
    {
      key: 'status', label: '单据状态', type: 'select', width: 150,
      options: (docMeta?.statuses || []).map((s: any) => ({ label: s.label, value: s.value })),
    },
    { key: 'dateRange', label: '日期范围', type: 'dateRange' },
    ...extraFilters,
  ]), [docMeta, extraFilters]);

  const runAction = async (record: any, action: string, label: string) => {
    try {
      await api.post(`/api/documents/${record.id}/action`, { action });
      message.success(`${label}成功`);
      navigate(0);
    } catch (e: any) {
      message.error(e?.message || `${label}失败`);
    }
  };

  const confirmAction = (record: any, action: string, label: string) => {
    modal.confirm({
      title: `确认${label}单据 ${record.doc_no}？`,
      content: action === 'approve' ? '审核后将生成库存、应收应付与会计凭证，且不可修改。' : undefined,
      okText: '确认', cancelText: '取消',
      onOk: () => runAction(record, action, label),
    });
  };

  const moreItems = (record: any): MenuProps['items'] => {
    const items: MenuProps['items'] = [{ key: 'view', icon: <EyeOutlined />, label: '查看详情' }];
    if (record.status === 'DRAFT' && hasPerm(`${permModule}.edit`)) {
      items.push({ key: 'edit', icon: <EditOutlined />, label: '编辑单据' });
    }
    items.push({ key: 'print', icon: <PrinterOutlined />, label: '打印单据' });
    const transitions = (docMeta?.transitions || []).filter((t: any) => t.from.includes(record.status));
    for (const t of transitions) {
      const allowed = hasPerm(`${permModule}.${t.perm}`) || hasPerm(`${permModule}.edit`);
      if (!allowed) continue;
      if (['submit', 'approve', 'void', 'close'].includes(t.action)) {
        items.push({ type: 'divider' });
        items.push({ key: `action:${t.action}`, label: t.label, danger: t.action === 'void' });
      }
    }
    if (['DRAFT', 'VOID'].includes(record.status) && hasPerm(`${permModule}.delete`)) {
      items.push({ type: 'divider' }, { key: 'delete', icon: <DeleteOutlined />, label: '删除单据', danger: true });
    }
    return items;
  };

  const onMoreClick = (record: any): MenuProps['onClick'] => ({ key }) => {
    if (key === 'view') return navigate(`${basePath}/${record.id}`);
    if (key === 'edit') return navigate(`${basePath}/${record.id}?edit=1`);
    if (key === 'print') return navigate(`${basePath}/${record.id}?print=1`);
    if (key === 'delete') {
      modal.confirm({
        title: `确认删除单据 ${record.doc_no}？`,
        okText: '删除', okButtonProps: { danger: true }, cancelText: '取消',
        onOk: async () => {
          try { await api.del(`/api/documents/${record.id}`); message.success('删除成功'); navigate(0); }
          catch (e: any) { message.error(e?.message || '删除失败'); }
        },
      });
      return;
    }
    if (key.startsWith('action:')) {
      const action = key.slice(7);
      const t = docMeta?.transitions?.find((x: any) => x.action === action);
      if (t?.confirm) confirmAction(record, action, t.label);
      else runAction(record, action, t?.label || action);
    }
  };

  const columns: ColumnsType<any> = [
    {
      title: docMeta?.docNoLabel || '单据编号', dataIndex: 'doc_no', width: 170, fixed: 'left',
      render: (v: string, r: any) => <a onClick={() => navigate(`${basePath}/${r.id}`)} style={{ fontWeight: 500 }}>{v}</a>,
    },
    { title: '单据日期', dataIndex: 'doc_date', width: 108 },
    {
      title: MODULE_LABEL[docMeta?.partnerType] || '往来单位', dataIndex: 'partner_name', width: 220,
      ellipsis: true, render: (v: string) => v || '-',
    },
    ...(docMeta?.partnerType === 'customer'
      ? [{ title: '业务员', dataIndex: 'salesperson_name', width: 90, render: (v: string) => v || '-' }]
      : []),
    { title: '仓库', dataIndex: 'warehouse_name', width: 110, render: (v: any, r: any) => v || r.to_warehouse_name || '-' },
    {
      title: '金额', dataIndex: 'total_amount', width: 130, align: 'right' as const,
      render: (v: number) => <span className="money">{fmtMoney(v)}</span>,
    },
    ...(docType === 'TR' || docType === 'ADJ' || docType === 'OI' || docType === 'OO' || docType === 'RC' || docType === 'PY' ? [] : []),
    {
      title: '状态', dataIndex: 'status', width: 110, align: 'center' as const,
      render: (v: string) => <StatusTag status={v} docType={docType} />,
    },
    { title: '制单人', dataIndex: 'created_by_name', width: 90, render: (v: string) => v || '-' },
    { title: '备注', dataIndex: 'remark', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    ...extraColumns,
  ];

  const toolbar = (
    <>
      {!hideCreate && hasPerm(`${permModule}.create`) && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`${basePath}/new`)}>
          新建{docMeta?.name || title}
        </Button>
      )}
      <span className="text-muted" style={{ fontSize: 12 }}>
        共 {docMeta?.statuses?.length || 0} 种状态 · 审核后自动过账
      </span>
    </>
  );

  const rowActions = (record: any) => (
    <>
      <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`${basePath}/${record.id}`)}>查看</Button>
      <Dropdown menu={{ items: moreItems(record), onClick: onMoreClick(record) }} trigger={['click']}>
        <Button type="link" size="small"><MoreOutlined /></Button>
      </Dropdown>
    </>
  );

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle || `管理${docMeta?.name || ''}的创建、审核与执行`} />
      <DataTable
        columns={columns}
        load={(params) => api.get('/api/documents', { docType, ...params })}
        filters={filters}
        rowActions={rowActions}
        toolbar={toolbar}
        exportFilename={`${title}_${new Date().toISOString().slice(0, 10)}`}
        scrollX={1200}
      />
    </div>
  );
}
