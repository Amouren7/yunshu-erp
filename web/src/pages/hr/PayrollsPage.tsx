import { useCallback, useMemo, useState } from 'react';
import { App, Button, DatePicker, Modal, Popconfirm, Space, Tag } from 'antd';
import { CheckCircleOutlined, MoneyCollectOutlined, PercentageOutlined, SafetyCertificateOutlined, ThunderboltOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatCard from '../../components/StatCard';
import { SimpleStatus } from '../../components/StatusTag';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtMoney, fmtNumber } from '../../utils/format';

export default function PayrollsPage() {
  const { hasPerm } = useAuth();
  const { enumOf, dict } = useMeta();
  const { message, modal } = App.useApp();
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<any>({});
  const [reloadKey, setReloadKey] = useState(0);

  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(() => dayjs());
  const [generating, setGenerating] = useState(false);

  const canCreate = hasPerm('hr.create');
  const canApprove = hasPerm('hr.approve');

  const statusOptions = useMemo(
    () => (enumOf('payrollStatus') as string[]).map((v) => ({ label: v, value: v })),
    [enumOf],
  );
  const departmentOptions = useMemo(
    () => (dict('departments') || []).map((d: any) => ({ label: d.name, value: d.id })),
    [dict],
  );
  const employeeOptions = useRequest(
    () => api.get('/api/meta/options', { type: 'employee', limit: 500 }).then((rows: any[]) => (rows || []).map((r) => ({ label: `${r.label}（${r.code}）`, value: r.value }))),
    [],
  );

  const load = useCallback((params: Record<string, any>) => api.get('/api/hr/payrolls', params).then((res: any) => {
    setSummary(res?.summary || {});
    return res;
  }), []);

  const doGenerate = async () => {
    if (!genMonth) { message.warning('请选择薪资期间'); return; }
    const p = genMonth.format('YYYY-MM');
    setGenerating(true);
    try {
      const res: any = await api.post('/api/hr/payrolls/generate', { period: p });
      message.success(`生成完成：${p} 新增 ${res.generated} 条（跳过已存在 ${res.skipped} 条），实发合计 ¥${fmtMoney(res.totalNet, 0)}`);
      setGenOpen(false);
      setPeriod(p);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const doBatchConfirm = () => {
    if (!period) { message.warning('请先在工具栏选择要确认的薪资期间'); return; }
    modal.confirm({
      title: `批量确认 ${period} 薪资`,
      content: '将该期间全部「草稿」状态的薪资记录确认为「已确认」。确认后金额不可再修改，请核对无误后操作。',
      okText: '确认无误',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res: any = await api.post('/api/hr/payrolls/batch-confirm', { period });
          message.success(`已确认 ${res.confirmed} 条薪资，实发合计 ¥${fmtMoney(res.totalNet, 0)}`);
          setReloadKey((k) => k + 1);
        } catch (e: any) {
          message.error(e?.message || '批量确认失败');
        }
      },
    });
  };

  const confirmOne = async (row: any) => {
    try {
      await api.post(`/api/hr/payrolls/${row.id}/confirm`);
      message.success(`已确认 ${row.employee_name}（${row.period}）薪资`);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '确认失败');
    }
  };

  return (
    <div>
      <PageHeader
        title="薪资管理"
        subtitle="按月生成员工薪资（基本工资 + 绩效 + 加班 + 补贴 − 社保公积金 − 个税），确认后归档"
        extra={(
          <Space>
            {canCreate && (
              <Button icon={<ThunderboltOutlined />} onClick={() => { setGenMonth(dayjs()); setGenOpen(true); }}>
                生成本月薪资
              </Button>
            )}
            {canApprove && (
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={doBatchConfirm}>
                批量确认
              </Button>
            )}
          </Space>
        )}
      />

      <div className="kpi-grid">
        <StatCard
          title="实发薪资合计" value={summary.total_net || 0} prefix="¥" icon={<WalletOutlined />}
          foot={`${period || '全部期间'} · ${fmtNumber(summary.count, 0)} 条薪资记录`}
        />
        <StatCard
          title="代扣个税" value={summary.total_tax || 0} prefix="¥" icon={<PercentageOutlined />}
          foot="按简化规则代扣代缴"
        />
        <StatCard
          title="社保 + 公积金" value={summary.total_insurance || 0} prefix="¥" icon={<SafetyCertificateOutlined />}
          foot="企业与个人缴纳合计（按基本工资比例）"
        />
        <StatCard
          title="人均实发" value={summary.count ? Number(summary.total_net) / Number(summary.count) : 0} prefix="¥" icon={<MoneyCollectOutlined />}
          foot={`覆盖 ${fmtNumber(summary.count, 0)} 名员工`}
        />
      </div>

      <div className="mt-14">
        <DataTable
          columns={[
            { title: '期间', dataIndex: 'period', width: 90, fixed: 'left' },
            { title: '工号', dataIndex: 'employee_code', width: 86 },
            {
              title: '姓名', dataIndex: 'employee_name', width: 100,
              render: (v: string, r: any) => (
                <div>
                  <b>{v}</b>
                  <div className="text-muted" style={{ fontSize: 11 }}>{r.position || '-'}</div>
                </div>
              ),
            },
            { title: '部门', dataIndex: 'department_name', width: 110, render: (v: string) => v || '-' },
            { title: '基本工资', dataIndex: 'base_salary', width: 110, align: 'right', render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
            { title: '绩效', dataIndex: 'performance_bonus', width: 100, align: 'right', render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
            { title: '加班', dataIndex: 'overtime_pay', width: 100, align: 'right', render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
            { title: '补贴', dataIndex: 'allowance', width: 90, align: 'right', render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
            { title: '社保', dataIndex: 'social_insurance', width: 100, align: 'right', render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
            { title: '公积金', dataIndex: 'housing_fund', width: 100, align: 'right', render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
            { title: '个税', dataIndex: 'tax', width: 100, align: 'right', render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
            {
              title: '实发工资', dataIndex: 'net_pay', width: 120, align: 'right',
              render: (v: any) => <b className="num" style={{ color: 'var(--primary)' }}>{fmtMoney(v)}</b>,
            },
            {
              title: '状态', dataIndex: 'status', width: 96, align: 'center',
              render: (v: string) => <SimpleStatus value={v} />,
            },
          ]}
          load={load}
          rowKey="id"
          exportFilename="薪资明细"
          scrollX={1490}
          reloadKey={reloadKey}
          extraParams={{ period }}
          search={{ placeholder: '搜索工号 / 姓名' }}
          filters={[
            { key: 'employeeId', label: '员工', type: 'select', options: employeeOptions.data || [], width: 180 },
            { key: 'departmentId', label: '部门', type: 'select', options: departmentOptions, width: 140 },
            { key: 'status', label: '薪资状态', type: 'select', options: statusOptions, width: 120 },
          ]}
          toolbar={(
            <Space size={8} wrap>
              <span className="text-muted" style={{ fontSize: 12 }}>薪资期间</span>
              <DatePicker
                picker="month"
                allowClear
                placeholder="全部期间"
                style={{ width: 140 }}
                value={period ? dayjs(period) : null}
                onChange={(v) => setPeriod(v ? dayjs(v).format('YYYY-MM') : undefined)}
              />
              {period && <Tag color="blue">{period}（{fmtNumber(summary.count, 0)} 条）</Tag>}
              {!period && <span className="text-muted" style={{ fontSize: 12 }}>不选则汇总全部期间</span>}
            </Space>
          )}
          rowActions={(record) => (
            record.status === '草稿' && canApprove ? (
              <Popconfirm
                title={`确认 ${record.employee_name} 的薪资？`}
                description={`${record.period} 实发 ¥${fmtMoney(record.net_pay)}，确认后不可修改`}
                onConfirm={() => confirmOne(record)}
              >
                <Button type="link" size="small" icon={<CheckCircleOutlined />}>确认</Button>
              </Popconfirm>
            ) : null
          )}
        />
      </div>

      <Modal
        title="生成薪资"
        open={genOpen}
        onCancel={() => setGenOpen(false)}
        onOk={doGenerate}
        okText="开始生成"
        confirmLoading={generating}
        destroyOnClose
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 10 }}>选择薪资期间，系统将按在职员工生成薪资单（已存在的员工自动跳过）：</div>
          <DatePicker
            picker="month"
            style={{ width: '100%' }}
            value={genMonth}
            onChange={(v) => setGenMonth(v as any)}
            disabledDate={(d) => d && d.isAfter(dayjs(), 'month')}
          />
          <div className="text-muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.8 }}>
            · 基本工资：取员工档案中的基本工资<br />
            · 绩效：基本工资的 5% ~ 15%（模拟核算）<br />
            · 加班：本月考勤加班工时 × 1.5 倍加班费<br />
            · 社保 10.5%、公积金 5%、个税按超额 3% 简化计算<br />
            · 生成后状态为「草稿」，需逐条或批量确认
          </div>
        </div>
      </Modal>
    </div>
  );
}
