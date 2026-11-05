import { useCallback, useMemo, useState } from 'react';
import { App, Button, DatePicker, Form, Modal, Select, Space, Tag } from 'antd';
import { EditOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import SchemaForm, { formValues, type FieldDef } from '../../components/SchemaForm';
import { SimpleStatus } from '../../components/StatusTag';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtDate, fmtNumber } from '../../utils/format';

const STATUS_COLORS: Record<string, string> = {
  正常: 'green', 迟到: 'orange', 早退: 'gold', 缺勤: 'red', 请假: 'blue', 出差: 'cyan', 加班: 'purple',
};

const EDIT_FIELDS: FieldDef[] = [
  { key: 'status', label: '考勤状态', type: 'select', enumKey: 'attendanceStatus', required: true, span: 12 },
  { key: 'check_in', label: '上班时间', span: 12, placeholder: '如 09:00' },
  { key: 'check_out', label: '下班时间', span: 12, placeholder: '如 18:00' },
  { key: 'work_hours', label: '工作时长（小时）', type: 'number', precision: 1, span: 12 },
  { key: 'overtime_hours', label: '加班时长（小时）', type: 'number', precision: 1, span: 12 },
  { key: 'remark', label: '备注', type: 'textarea', rows: 2, span: 24 },
];

export default function AttendancesPage() {
  const { hasPerm } = useAuth();
  const { enumOf, dict } = useMeta();
  const { message } = App.useApp();
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(() => dayjs());
  const [generating, setGenerating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [editForm] = Form.useForm();

  const canEdit = hasPerm('hr.edit');
  const canCreate = hasPerm('hr.create');
  const statusOptions = useMemo(
    () => (enumOf('attendanceStatus') as string[]).map((v) => ({ label: v, value: v })),
    [enumOf],
  );
  const employeeOptions = useRequest(
    () => api.get('/api/meta/options', { type: 'employee', limit: 500 }).then((rows: any[]) => (rows || []).map((r) => ({ label: `${r.label}（${r.code}）`, value: r.value }))),
    [],
  );
  const departmentOptions = useMemo(
    () => (dict('departments') || []).map((d: any) => ({ label: d.name, value: d.id })),
    [dict],
  );

  const load = useCallback((params: Record<string, any>) => api.get('/api/hr/attendances', params).then((res: any) => {
    setSummary(res?.summary || {});
    return res;
  }), []);

  const changeStatus = async (row: any, status: string) => {
    try {
      await api.put(`/api/hr/attendances/${row.id}`, { status });
      message.success(`${row.employee_name} ${row.work_date} 状态已更新为「${status}」`);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    }
  };

  const doGenerate = async () => {
    if (!genMonth) { message.warning('请选择考勤月份'); return; }
    setGenerating(true);
    try {
      const res: any = await api.post('/api/hr/attendances/generate', { year: genMonth.year(), month: genMonth.month() + 1 });
      message.success(`生成完成：${res.generated} 条（${res.workdays} 个工作日 × ${res.employees} 名在职员工，跳过已存在 ${res.skipped} 条）`);
      setGenOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const openEdit = (row: any) => {
    setEditing(row);
    editForm.resetFields();
    editForm.setFieldsValue({
      status: row.status,
      check_in: row.check_in,
      check_out: row.check_out,
      work_hours: Number(row.work_hours) || 0,
      overtime_hours: Number(row.overtime_hours) || 0,
      remark: row.remark,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      await api.put(`/api/hr/attendances/${editing.id}`, formValues(EDIT_FIELDS, values));
      message.success('考勤记录已保存');
      setEditOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const statuses = enumOf('attendanceStatus') as string[];
  const summaryTags = statuses
    .filter((s) => Number(summary[s] || 0) > 0)
    .map((s) => (
      <Tag key={s} color={STATUS_COLORS[s] || 'default'} style={{ marginInlineEnd: 4 }}>
        {s} {fmtNumber(summary[s], 0)}
      </Tag>
    ));

  return (
    <div>
      <PageHeader
        title="考勤管理"
        subtitle="按员工 + 日期记录出勤状态、上下班时间与工时；支持批量生成当月考勤后逐条修正"
        extra={canCreate ? (
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => { setGenMonth(dayjs()); setGenOpen(true); }}>
            生成当月考勤
          </Button>
        ) : undefined}
      />

      <DataTable
        columns={[
          { title: '工号', dataIndex: 'employee_code', width: 90, fixed: 'left' },
          {
            title: '姓名', dataIndex: 'employee_name', width: 110,
            render: (v: string, r: any) => (
              <div>
                <b>{v}</b>
                <div className="text-muted" style={{ fontSize: 11 }}>{r.position || '-'}</div>
              </div>
            ),
          },
          { title: '部门', dataIndex: 'department_name', width: 120, render: (v: string) => v || '-' },
          { title: '日期', dataIndex: 'work_date', width: 110, render: (v: string) => fmtDate(v) },
          {
            title: '状态', dataIndex: 'status', width: 132,
            render: (v: string, r: any) => (canEdit ? (
              <Select
                size="small"
                value={v}
                style={{ width: 104 }}
                options={statusOptions}
                onChange={(nv) => changeStatus(r, nv)}
              />
            ) : <SimpleStatus value={v} />),
          },
          { title: '上班', dataIndex: 'check_in', width: 80, align: 'center', render: (v: string) => v || '-' },
          { title: '下班', dataIndex: 'check_out', width: 80, align: 'center', render: (v: string) => v || '-' },
          {
            title: '工时', dataIndex: 'work_hours', width: 80, align: 'right',
            render: (v: any) => <span className="num">{fmtNumber(v, 1)}</span>,
          },
          {
            title: '加班', dataIndex: 'overtime_hours', width: 80, align: 'right',
            render: (v: any) => Number(v) > 0
              ? <span className="num" style={{ color: '#d97706', fontWeight: 600 }}>+{fmtNumber(v, 1)}</span>
              : <span className="text-muted">-</span>,
          },
          { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string) => v || '-' },
        ]}
        load={load}
        rowKey="id"
        exportFilename="考勤明细"
        scrollX={1180}
        reloadKey={reloadKey}
        onDataLoaded={(_rows, t) => setTotal(t)}
        search={{ placeholder: '搜索工号 / 姓名' }}
        filters={[
          { key: 'employeeId', label: '员工', type: 'select', options: employeeOptions.data || [], width: 180 },
          { key: 'departmentId', label: '部门', type: 'select', options: departmentOptions, width: 140 },
          { key: 'status', label: '考勤状态', type: 'select', options: statusOptions, width: 120 },
          { key: 'dateRange', label: '日期范围', type: 'dateRange' },
        ]}
        toolbar={(
          <Space size={4} wrap>
            <span className="text-muted" style={{ fontSize: 12 }}>当前筛选合计 <b style={{ color: '#1f2b3d' }}>{fmtNumber(total, 0)}</b> 条</span>
            {summaryTags}
          </Space>
        )}
        rowActions={canEdit ? (record) => (
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
        ) : undefined}
      />

      <Modal
        title="生成当月考勤"
        open={genOpen}
        onCancel={() => setGenOpen(false)}
        onOk={doGenerate}
        okText="开始生成"
        confirmLoading={generating}
        destroyOnClose
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 10 }}>选择月份，系统将按 <b>周一至周五</b> 为全部在职员工生成考勤记录（已存在的日期自动跳过）：</div>
          <DatePicker
            picker="month"
            style={{ width: '100%' }}
            value={genMonth}
            onChange={(v) => setGenMonth(v as any)}
            disabledDate={(d) => d && d.isAfter(dayjs(), 'month')}
          />
          <div className="text-muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>
            · 员工：当前全部「在职」员工<br />
            · 规则：工作日生成，状态按常规出勤模拟，可在列表中逐条修正<br />
            · 当月仅生成到今日，不会生成未来日期
          </div>
        </div>
      </Modal>

      <Modal
        title={`编辑考勤 · ${editing?.employee_name || ''} ${editing?.work_date || ''}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={saveEdit}
        okText="保存"
        confirmLoading={saving}
        width={620}
        destroyOnClose
      >
        <SchemaForm fields={EDIT_FIELDS} form={editForm} />
      </Modal>
    </div>
  );
}
