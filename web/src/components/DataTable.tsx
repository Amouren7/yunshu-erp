import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, DatePicker, Input, Select, Space, Table, Tooltip, App } from 'antd';
import { DownloadOutlined, RedoOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { exportCsv } from '../utils/format';

export interface FilterDef {
  key: string;
  label: string;
  type?: 'select' | 'input' | 'dateRange';
  /** 支持两种写法：{label,value} 数组，或字符串/数字数组（自动转换） */
  options?: ({ label: string; value: any } | string | number)[];
  width?: number;
  placeholder?: string;
}

/** 统一筛选下拉选项格式：字符串数组（如 ['A','B']）也要能正常显示，避免出现空白选项 */
function normalizeFilterOptions(options?: FilterDef['options']): { label: string; value: any }[] {
  return (options || []).map((o: any) =>
    o !== null && typeof o === 'object'
      ? { label: String(o.label ?? o.name ?? o.value ?? ''), value: o.value ?? o.id }
      : { label: String(o), value: o }
  );
}

export interface DataTableProps<T = any> {
  columns: ColumnsType<T>;
  load: (params: Record<string, any>) => Promise<{ rows: T[]; total: number }>;
  rowKey?: string;
  search?: boolean | { placeholder?: string };
  filters?: FilterDef[];
  extraParams?: Record<string, any>;
  toolbar?: ReactNode;
  actions?: ReactNode;
  exportFilename?: string;
  rowActions?: (record: T) => ReactNode;
  onRow?: (record: T) => any;
  selection?: boolean | { onChange?: (keys: any[], rows: T[]) => void };
  defaultPageSize?: number;
  scrollX?: number;
  reloadKey?: any;
  size?: 'small' | 'middle';
  showIndex?: boolean;
  summary?: (data: T[]) => ReactNode;
  tableProps?: Record<string, any>;
  onDataLoaded?: (rows: T[], total: number) => void;
}

export default function DataTable<T extends Record<string, any> = any>(props: DataTableProps<T>) {
  const {
    columns, load, rowKey = 'id', search = true, filters = [], extraParams = {}, toolbar, actions,
    exportFilename, rowActions, onRow, selection, defaultPageSize = 20, scrollX, reloadKey,
    size = 'middle', showIndex = true, summary, tableProps, onDataLoaded,
  } = props;
  const { message } = App.useApp();
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [keyword, setKeyword] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [selectedKeys, setSelectedKeys] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const params = useMemo(() => {
    const p: Record<string, any> = { page, pageSize, ...extraParams };
    if (keyword) p.keyword = keyword;
    for (const [k, v] of Object.entries(filterValues)) {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      if (k === 'dateRange') {
        if (!v?.[0] || !v?.[1]) continue;
        p.startDate = dayjs(v[0]).format('YYYY-MM-DD');
        p.endDate = dayjs(v[1]).format('YYYY-MM-DD');
      } else if (Array.isArray(v)) {
        p[k] = v.join(',');
      } else {
        p[k] = v;
      }
    }
    return p;
  }, [page, pageSize, keyword, filterValues, JSON.stringify(extraParams)]);

  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRef.current(params)
      .then((res) => {
        if (!alive) return;
        setRows(res?.rows || []);
        setTotal(res?.total || 0);
        onDataLoaded?.(res?.rows || [], res?.total || 0);
      })
      .catch((e) => {
        if (!alive) return;
        message.error(e?.message || '数据加载失败');
        setRows([]); setTotal(0);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, tick, reloadKey]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const doExport = async () => {
    try {
      const res = await loadRef.current({ ...params, page: 1, pageSize: 5000 });
      if (!res?.rows?.length) { message.warning('没有可导出的数据'); return; }
      exportCsv(exportFilename || `导出_${dayjs().format('YYYYMMDD_HHmmss')}`, columns as any, res.rows);
      message.success(`已导出 ${res.rows.length} 条记录`);
    } catch (e: any) {
      message.error(e?.message || '导出失败');
    }
  };

  const resetFilters = () => {
    setFilterValues({});
    setKeyword('');
    setPage(1);
    setSelectedKeys([]);
  };

  const hasFilters = filters.length > 0 || search;

  const finalColumns = useMemo(() => {
    const cols: ColumnsType<any> = [];
    if (showIndex) {
      cols.push({
        title: '#', key: '__idx', width: 48, align: 'center', fixed: 'left' as any,
        render: (_: any, __: any, i: number) => <span className="text-muted num">{(page - 1) * pageSize + i + 1}</span>,
      });
    }
    cols.push(...(columns as any));
    if (rowActions) {
      cols.push({
        title: '操作', key: '__actions', width: 140, fixed: 'right' as any, align: 'center',
        render: (_: any, record: T) => <Space size={0}>{rowActions(record)}</Space>,
      });
    }
    return cols;
  }, [columns, rowActions, page, pageSize, showIndex]);

  return (
    <div className="card">
      {hasFilters && (
        <div className="filter-bar">
          {search && (
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#8b98ab' }} />}
              placeholder={typeof search === 'object' ? search.placeholder : '输入关键字搜索'}
              style={{ width: 240 }}
              onPressEnter={(e) => { setKeyword((e.target as HTMLInputElement).value); setPage(1); }}
              onChange={(e) => { if (!e.target.value) { setKeyword(''); setPage(1); } }}
            />
          )}
          {filters.map((f) => {
            if (f.type === 'dateRange') {
              return (
                <DatePicker.RangePicker
                  key={f.key}
                  style={{ width: 240 }}
                  value={filterValues[f.key] as any}
                  onChange={(v) => { setFilterValues((s) => ({ ...s, [f.key]: v })); setPage(1); }}
                />
              );
            }
            if (f.type === 'input') {
              return (
                <Input key={f.key} allowClear placeholder={f.placeholder || f.label} style={{ width: f.width || 150 }}
                  onChange={(e) => { setFilterValues((s) => ({ ...s, [f.key]: e.target.value })); setPage(1); }} />
              );
            }
            return (
              <Select
                key={f.key}
                allowClear
                placeholder={f.label}
                style={{ width: f.width || 150 }}
                value={filterValues[f.key]}
                onChange={(v) => { setFilterValues((s) => ({ ...s, [f.key]: v })); setPage(1); }}
                options={normalizeFilterOptions(f.options)}
              />
            );
          })}
          <Button icon={<RedoOutlined />} onClick={resetFilters}>重置</Button>
          <div className="toolbar-spacer" />
          {actions}
        </div>
      )}
      <div className="toolbar">
        <Space size={8} wrap>
          {toolbar}
        </Space>
        <div className="toolbar-spacer" />
        <Space size={6}>
          <Tooltip title="刷新"><Button size="small" icon={<ReloadOutlined />} onClick={refresh} /></Tooltip>
          {exportFilename !== '' && (
            <Button size="small" icon={<DownloadOutlined />} onClick={doExport}>导出</Button>
          )}
        </Space>
      </div>
      <Table
        rowKey={rowKey}
        columns={finalColumns as any}
        dataSource={rows}
        loading={loading}
        size={size}
        scroll={scrollX ? { x: scrollX } : undefined}
        onRow={onRow ? (record) => onRow(record) : undefined}
        rowSelection={selection ? {
          selectedRowKeys: selectedKeys,
          onChange: (keys, selRows) => {
            setSelectedKeys(keys as any[]);
            const cfg = typeof selection === 'object' ? selection : null;
            cfg?.onChange?.(keys as any[], selRows as T[]);
          },
        } : undefined}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100, 200],
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          size: 'default',
        }}
        summary={summary as any}
        {...tableProps}
      />
    </div>
  );
}
