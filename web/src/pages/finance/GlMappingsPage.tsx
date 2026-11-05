/**
 * /finance/gl-mappings 科目映射
 * ------------------------------------------------------------
 * 维护各业务凭证（应收/应付/收入/成本/税额/资金等）对应的会计科目。
 * 表格内直接切换科目并保存（PUT /api/finance/gl-mappings），
 * 保存后后端清空过账与报表缓存，立即生效。
 */
import { useEffect, useState } from 'react';
import { Alert, App, Button, Empty, Space, Spin, Table, Tag, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined, SyncOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import EntitySelect from '../../components/EntitySelect';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { ACCOUNT_CATEGORY_LABEL, DIRECTION_LABEL, GL_KEY_DESC } from './common';

export default function GlMappingsPage() {
  const { message } = App.useApp();
  const { hasPerm } = useAuth();
  const req = useRequest(() => api.get('/api/finance/gl-mappings'), []);
  const [rows, setRows] = useState<any[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCode, setEditCode] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (req.data?.rows) setRows(req.data.rows);
  }, [req.data]);

  const canEdit = hasPerm('finance.edit');

  const startEdit = (r: any) => {
    setEditingKey(r.key);
    setEditCode(r.account_code);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditCode(undefined);
  };

  const save = async (key: string) => {
    if (!editCode) { message.warning('请选择目标会计科目'); return; }
    setSaving(true);
    try {
      await api.put('/api/finance/gl-mappings', { key, account_code: editCode });
      message.success('科目映射已保存，过账与报表缓存已刷新');
      setEditingKey(null);
      setEditCode(undefined);
      req.refresh();
    } catch (e: any) {
      message.error(e?.message || '科目映射保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<any> = [
    {
      title: '业务类型', dataIndex: 'label', width: 165,
      render: (v: string, r: any) => (
        <div>
          <b>{v || r.key}</b>
          <div className="text-muted" style={{ fontSize: 11 }}>{r.key}</div>
        </div>
      ),
    },
    {
      title: '对应业务说明', dataIndex: 'key', width: 235,
      render: (v: string) => <span className="text-muted">{GL_KEY_DESC[v] || '-'}</span>,
    },
    {
      title: '科目编码', dataIndex: 'account_code', width: 255,
      render: (v: string, r: any) => {
        if (editingKey === r.key) {
          return (
            <EntitySelect
              type="account"
              size="small"
              style={{ width: '100%' }}
              value={editCode}
              onChange={(val: any) => setEditCode(val)}
              placeholder="选择末级会计科目"
            />
          );
        }
        return <b className="num">{v || '-'}</b>;
      },
    },
    {
      title: '科目名称', dataIndex: 'account_name', width: 165,
      render: (v: string, r: any) => (
        <span>
          {v || <span className="text-danger">科目不存在</span>}
          {editingKey === r.key && <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>（保存后更新）</span>}
        </span>
      ),
    },
    {
      title: '科目类别', dataIndex: 'category', width: 100, align: 'center',
      render: (v: string) => (v ? <Tag>{ACCOUNT_CATEGORY_LABEL[v] || v}</Tag> : '-'),
    },
    {
      title: '余额方向', dataIndex: 'direction', width: 90, align: 'center',
      render: (v: string) => (v ? <Tag color={v === 'DEBIT' ? 'blue' : 'orange'}>{DIRECTION_LABEL[v] || v}</Tag> : '-'),
    },
    {
      title: '明细科目', dataIndex: 'is_leaf', width: 90, align: 'center',
      render: (v: any) => (Number(v) ? <Tag color="green">末级</Tag> : <Tag color="red">非末级</Tag>),
    },
    {
      title: '科目状态', dataIndex: 'status', width: 90, align: 'center',
      render: (v: string) => (v === '启用' ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
    },
  ];

  if (canEdit) {
    columns.push({
      title: '操作', key: 'op', width: 130, align: 'center', fixed: 'right',
      render: (_: any, r: any) => {
        if (editingKey === r.key) {
          return (
            <Space size={4}>
              <Button type="link" size="small" icon={<CheckOutlined />} loading={saving} onClick={() => save(r.key)}>保存</Button>
              <Button type="link" size="small" icon={<CloseOutlined />} onClick={cancelEdit}>取消</Button>
            </Space>
          );
        }
        return <Button type="link" size="small" icon={<EditOutlined />} onClick={() => startEdit(r)}>修改</Button>;
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="科目映射"
        subtitle="业务单据自动生成会计凭证时使用的科目配置；修改后对后续过账与财务报表立即生效"
        extra={<Button icon={<SyncOutlined />} onClick={() => { req.refresh(); cancelEdit(); }}>刷新</Button>}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        message="科目映射说明"
        description={
          <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
            销售发货 / 退货、采购入库 / 退货、收付款、盘点、费用计提等业务审核时，系统按此表映射生成会计凭证。
            只能选择<b>启用状态</b>且<b>末级（明细）科目</b>；修改保存后会自动清空过账与报表缓存。
          </div>
        }
      />

      <div className="card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />业务凭证科目映射</div>
          <span className="text-muted" style={{ fontSize: 12 }}>
            共 {rows.length} 项映射 · {canEdit ? '可编辑' : '只读（缺少 finance.edit 权限）'}
          </span>
        </div>
        {req.loading && rows.length === 0 ? (
          <div style={{ padding: 70, textAlign: 'center' }}><Spin tip="加载中…" /></div>
        ) : rows.length === 0 ? (
          <div className="empty-hint"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无科目映射配置" /></div>
        ) : (
          <Table
            rowKey="key"
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="small"
            bordered
            scroll={{ x: 1340 }}
          />
        )}
        <div className="card-pad" style={{ borderTop: '1px solid var(--border)' }}>
          <Space size={6} wrap>
            <Tooltip title="映射修改后仅影响之后生成的凭证，历史凭证不会重算">
              <Tag color="orange">注意</Tag>
            </Tooltip>
            <span className="text-muted" style={{ fontSize: 12 }}>
              变更前建议先与财务负责人确认；如需重算历史凭证，请通过「会计凭证」模块查询后由财务手工调整。
            </span>
          </Space>
        </div>
      </div>
    </div>
  );
}
