import { useEffect, useMemo } from 'react';
import { Col, DatePicker, Form, Input, InputNumber, Row, Select, Switch } from 'antd';
import dayjs from 'dayjs';
import { useMeta } from '../store/meta';
import EntitySelect from './EntitySelect';

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'percent' | 'date' | 'select' | 'multiSelect' | 'switch'
  | 'customer' | 'supplier' | 'item' | 'employee' | 'warehouse' | 'department' | 'account' | 'invoice' | 'password' | 'divider' | 'custom';

export interface FieldDef {
  key: string;
  label?: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  /** select 选项：字符串数组或 {label,value} */
  options?: any[] | (() => any[]);
  /** 下拉选项来自字典 */
  dict?: string;
  /** 字典取值字段：id | name | code */
  dictValue?: 'id' | 'name' | 'code';
  /** 下拉选项来自 enums */
  enumKey?: string;
  /** 远程实体类型 */
  remote?: 'customer' | 'supplier' | 'item' | 'employee' | 'warehouse' | 'department' | 'account' | 'invoice' | 'user';
  remotePartnerId?: any;
  invoiceType?: 'AR' | 'AP';
  span?: number;              // 24 栅格，默认 8
  rows?: number;
  min?: number;
  max?: number;
  precision?: number;
  disabled?: boolean;
  help?: string;
  defaultValue?: any;
  /** 自定义渲染 */
  render?: (ctx: { form: any; getValue: (k: string) => any }) => React.ReactNode;
  /** 保存时的转换 */
  transform?: (v: any) => any;
}

interface Props {
  fields: FieldDef[];
  form?: any;
  initialValues?: Record<string, any>;
  disabled?: boolean;
  layout?: 'vertical' | 'horizontal';
  onValuesChange?: (changed: any, all: any) => void;
}

function normalizeOptions(opt: any[]): { label: string; value: any }[] {
  return (opt || []).map((o) => (typeof o === 'object' && o !== null ? { label: o.label ?? o.name ?? String(o.value), value: o.value ?? o.id } : { label: String(o), value: o }));
}

/** 由字段配置生成表单（用于新增/编辑抽屉、单据表头） */
export default function SchemaForm({ fields, form: externalForm, initialValues, disabled, layout = 'vertical', onValuesChange }: Props) {
  const { meta, enumOf, dict } = useMeta();
  const [innerForm] = Form.useForm();
  const form = externalForm || innerForm;

  useEffect(() => {
    if (initialValues) {
      const vals: Record<string, any> = {};
      for (const f of fields) {
        let v = initialValues[f.key];
        if (f.type === 'date' && v) v = dayjs(v);
        if (v !== undefined) vals[f.key] = v;
      }
      form.setFieldsValue(vals);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialValues)]);

  const getOptions = (f: FieldDef) => {
    if (f.options) return normalizeOptions(typeof f.options === 'function' ? f.options() : f.options);
    if (f.enumKey) return normalizeOptions(enumOf(f.enumKey));
    if (f.dict) {
      return normalizeOptions(dict(f.dict).map((d: any) => ({
        label: d.name,
        value: f.dictValue === 'name' ? d.name : f.dictValue === 'code' ? d.code : d.id,
      })));
    }
    return [];
  };

  return (
    <Form form={form} layout={layout} initialValues={initialValues} onValuesChange={onValuesChange} disabled={disabled}>
      <Row gutter={16}>
        {fields.filter(Boolean).map((f) => {
          if (f.type === 'divider') {
            return (
              <Col span={24} key={f.key}>
                <div style={{ borderTop: '1px solid #eef1f7', margin: '4px 0 14px', paddingTop: 10, fontWeight: 600, color: 'var(--text-2)', fontSize: 12 }}>
                  {f.label}
                </div>
              </Col>
            );
          }
          const span = f.span || 8;
          return (
            <Col span={span} key={f.key}>
              <Form.Item
                name={f.key}
                label={f.label}
                rules={f.required ? [{ required: true, message: `请填写${f.label}` }] : undefined}
                help={f.help}
                valuePropName={f.type === 'switch' ? 'checked' : 'value'}
              >
                {renderControl(f, getOptions(f), meta, disabled)}
              </Form.Item>
            </Col>
          );
        })}
      </Row>
    </Form>
  );
}

function renderControl(f: FieldDef, options: any[], meta: any, disabled?: boolean) {
  const common = { placeholder: f.placeholder || `请输入${f.label || ''}`, disabled: f.disabled || disabled };
  switch (f.type) {
    case 'textarea':
      return <Input.TextArea rows={f.rows || 3} placeholder={common.placeholder} disabled={common.disabled} />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} min={f.min} max={f.max} precision={f.precision ?? 2} placeholder={common.placeholder} disabled={common.disabled} />;
    case 'money':
      return <InputNumber style={{ width: '100%' }} min={f.min ?? 0} max={f.max} precision={f.precision ?? 2} prefix="¥" placeholder={common.placeholder} disabled={common.disabled} />;
    case 'percent':
      return <InputNumber style={{ width: '100%' }} min={0} max={100} precision={2} suffix="%" placeholder={common.placeholder} disabled={common.disabled} />;
    case 'date':
      return <DatePicker style={{ width: '100%' }} placeholder={common.placeholder} disabled={common.disabled} />;
    case 'select':
      return <Select options={options} allowClear showSearch optionFilterProp="label" placeholder={common.placeholder} disabled={common.disabled} />;
    case 'multiSelect':
      return <Select mode="multiple" options={options} allowClear showSearch optionFilterProp="label" placeholder={common.placeholder} disabled={common.disabled} />;
    case 'switch':
      return <Switch disabled={common.disabled} />;
    case 'customer': case 'supplier': case 'item': case 'employee': case 'warehouse': case 'department':
    case 'account': case 'invoice': case 'user': {
      const remoteType = f.remote || (f.type as any);
      if (remoteType === 'invoice') {
        return <EntitySelect type="invoice" invoiceType={f.invoiceType} partnerId={f.remotePartnerId} placeholder={common.placeholder} disabled={common.disabled} />;
      }
      return <EntitySelect type={remoteType} placeholder={common.placeholder} disabled={common.disabled} />;
    }
    case 'password':
      return <Input.Password placeholder={common.placeholder} disabled={common.disabled} />;
    default:
      return <Input placeholder={common.placeholder} disabled={common.disabled} />;
  }
}

/** 表单值 -> 提交给接口的对象（dayjs 转字符串） */
export function formValues(fields: FieldDef[], values: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) {
    let v = values[f.key];
    if (f.type === 'date' && v) v = dayjs(v).format('YYYY-MM-DD');
    if (f.transform) v = f.transform(v);
    if (f.type === 'switch') v = v ? 1 : 0;
    out[f.key] = v;
  }
  return out;
}
