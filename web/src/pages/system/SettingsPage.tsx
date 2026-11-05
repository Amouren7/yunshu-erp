import { useMemo, useState } from 'react';
import { Alert, App, Button, Form, Space, Table, Tag } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import SchemaForm, { formValues, type FieldDef } from '../../components/SchemaForm';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { fmtDateTime } from '../../utils/format';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const v = String(i + 1).padStart(2, '0');
  return { label: `${i + 1} 月`, value: v };
});

export default function SettingsPage() {
  const { message } = App.useApp();
  const { hasPerm } = useAuth();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const settings = useRequest(() => api.get('/api/system/settings'), []);
  const rows: any[] = settings.data?.rows || [];
  const raw = settings.data?.settings || {};

  const canEdit = hasPerm('system.edit');

  const initialValues = useMemo(() => {
    const s = raw || {};
    return {
      company_name: s.company_name || '',
      company_tel: s.company_tel || '',
      company_tax_no: s.company_tax_no || '',
      company_address: s.company_address || '',
      company_bank: s.company_bank || '',
      company_bank_account: s.company_bank_account || '',
      fiscal_year_start: s.fiscal_year_start || '01',
      default_tax_rate: s.default_tax_rate === undefined || s.default_tax_rate === '' ? 13 : Number(s.default_tax_rate),
      allow_negative_stock: s.allow_negative_stock === '1' || s.allow_negative_stock === 'true' || s.allow_negative_stock === 1,
    };
  }, [raw]);

  const fields: FieldDef[] = useMemo(() => [
    { key: 'g1', type: 'divider', label: '公司信息（用于单据打印、抬头与对外信息展示）' },
    { key: 'company_name', label: '公司名称', span: 12, required: true, placeholder: '如：云枢科技（深圳）有限公司' },
    { key: 'company_tel', label: '联系电话', span: 6 },
    { key: 'company_tax_no', label: '纳税人识别号', span: 6 },
    { key: 'company_address', label: '公司地址', type: 'textarea', rows: 2, span: 18 },
    { key: 'company_bank', label: '开户银行', span: 9 },
    { key: 'company_bank_account', label: '银行账号', span: 9 },
    { key: 'g2', type: 'divider', label: '财务与业务参数' },
    {
      key: 'fiscal_year_start', label: '会计年度起始月', type: 'select', span: 6,
      options: MONTH_OPTIONS, help: '会计年度从该月开始，影响报表年度口径',
    },
    {
      key: 'default_tax_rate', label: '默认税率(%)', type: 'number', span: 6,
      min: 0, max: 100, precision: 2, help: '新建单据时的默认税率（如 13 表示 13%）',
    },
    {
      key: 'allow_negative_stock', label: '允许负库存', type: 'switch', span: 6,
      help: '开启后库存不足仍可出库，适合先出后入场景',
    },
  ], []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data = formValues(fields, values);
      setSaving(true);
      await api.put('/api/system/settings', { settings: data });
      message.success('系统参数已保存');
      settings.refresh();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="系统参数"
        subtitle="公司信息、财务参数与业务开关；保存后立即生效（单据打印抬头与默认值同步更新）"
        extra={
          <Space>
            <Button onClick={() => settings.refresh()}>刷新</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!canEdit} onClick={handleSave}>
              保存设置
            </Button>
          </Space>
        }
      />

      {!canEdit && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="当前账号没有「系统管理-编辑」权限，参数仅可查看。" />
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />参数配置</div>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {rows.length > 0 && `共 ${rows.length} 项参数`}
          </span>
        </div>
        <div className="card-pad">
          <SchemaForm fields={fields} form={form} initialValues={initialValues} disabled={!canEdit} />
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            提示：允许负库存开启后，库存不足时发货/出库单仍可审核通过，系统将记录负库存流水；关闭时库存不足会阻止审核。
          </div>
        </div>
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />参数明细</div>
          <Button size="small" onClick={() => settings.refresh()}>刷新</Button>
        </div>
        <Table
          size="small"
          rowKey="key"
          loading={settings.loading}
          pagination={false}
          dataSource={rows}
          columns={[
            { title: '参数键', dataIndex: 'key', width: 220, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
            { title: '名称', dataIndex: 'label', width: 180 },
            { title: '当前值', dataIndex: 'value', ellipsis: true, render: (v: any) => (v === '' || v === null ? <span className="text-muted">（空）</span> : String(v)) },
            {
              title: '类型', dataIndex: 'value', key: 'type', width: 90, align: 'center' as const,
              render: (v: any) => (/^-?\d+(\.\d+)?$/.test(String(v)) ? <Tag>数值</Tag> : <Tag color="blue">文本</Tag>),
            },
            { title: '更新时间', dataIndex: 'updated_at', width: 160, render: (v: string) => fmtDateTime(v) },
          ]}
        />
      </div>
    </div>
  );
}
