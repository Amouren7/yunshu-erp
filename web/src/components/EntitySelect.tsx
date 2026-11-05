import { useEffect, useMemo, useRef, useState } from 'react';
import { Select, Spin } from 'antd';
import { api } from '../api/client';

export type EntityType = 'customer' | 'supplier' | 'item' | 'employee' | 'warehouse' | 'department' | 'account' | 'invoice' | 'user';

interface Props {
  type: EntityType;
  value?: any;
  onChange?: (v: any, option?: any) => void;
  placeholder?: string;
  mode?: 'multiple';
  disabled?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  partnerId?: any;
  invoiceType?: 'AR' | 'AP';
  /** 编辑态用于回显外部传入的名称 */
  fallbackLabel?: string;
  onPick?: (option: any) => void;
  size?: 'small' | 'middle' | 'large';
  className?: string;
  /** antd Form 注入的 id */
  id?: string;
}

const DICT_SOURCES: Record<string, string> = {
  warehouse: 'warehouses',
  department: 'departments',
  account: 'accounts',
};

export default function EntitySelect(props: Props) {
  const { type, value, onChange, placeholder, mode, disabled, allowClear = true, style, partnerId, invoiceType, fallbackLabel, onPick, size = 'middle', id } = props;
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);
  const loaded = useRef(false);

  const fetchOptions = (keyword = '') => {
    setLoading(true);
    api.get<any[]>('/api/meta/options', { type, keyword, limit: 60, partnerId, invoiceType })
      .then((rows) => {
        const mapped = (rows || []).map((r: any) => ({
          ...r,
          label: r.label,
          title: r.label,
        }));
        setOptions((prev) => {
          const merged = [...mapped];
          // 保留已选但不在结果内的项
          for (const p of prev) {
            if (!merged.some((m) => String(m.value) === String(p.value))) merged.push(p);
          }
          return merged;
        });
        loaded.current = true;
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOptions('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, partnerId, invoiceType]);

  const mergedOptions = useMemo(() => {
    const list = [...options];
    if (value !== undefined && value !== null && value !== '' && !list.some((o) => String(o.value) === String(value))) {
      if (Array.isArray(value)) return list;
      list.unshift({ value, label: fallbackLabel || String(value) });
    }
    return list;
  }, [options, value, fallbackLabel]);

  return (
    <Select
      showSearch
      id={id}
      size={size}
      mode={mode}
      value={value ?? undefined}
      placeholder={placeholder || '请选择'}
      allowClear={allowClear}
      disabled={disabled}
      style={style}
      filterOption={false}
      notFoundContent={loading ? <Spin size="small" /> : '无匹配数据'}
      onSearch={(kw) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fetchOptions(kw), 260);
      }}
      onFocus={() => { if (!loaded.current) fetchOptions(''); }}
      onChange={(v, opt: any) => {
        onChange?.(v, opt);
        if (opt && onPick) onPick(opt);
      }}
      options={mergedOptions}
      optionRender={(opt: any) => {
        const raw = opt.data || {};
        if (raw.code && raw.code !== raw.label) {
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{raw.label}</span>
              <span style={{ color: '#8b98ab', fontSize: 11 }}>{raw.code}</span>
            </div>
          );
        }
        return <span>{opt.label}</span>;
      }}
    />
  );
}
