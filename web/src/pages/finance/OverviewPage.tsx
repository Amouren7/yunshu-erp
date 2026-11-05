/**
 * /finance/overview 财务总览
 * ------------------------------------------------------------
 * 应收 / 应付 / 收付款 / 现金 / 损益 KPI + 近 6 个月收付款趋势 +
 * 应收账龄分布 + 待办快捷入口 + 发票与总账口径对账提示。
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Space, Tag } from 'antd';
import {
  AccountBookOutlined, AlertOutlined, BankOutlined, BarChartOutlined, CalculatorOutlined,
  DashboardOutlined, DeploymentUnitOutlined, LineChartOutlined, MoneyCollectOutlined,
  PayCircleOutlined, PlusOutlined, ReloadOutlined, SwapOutlined, TableOutlined, WalletOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { fmtMoney } from '../../utils/format';

export default function OverviewPage() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const overview = useRequest(() => api.get('/api/finance/overview'), []);
  const cashflow = useRequest(() => api.get('/api/dashboard/cashflow'), []);
  const aging = useRequest(() => api.get('/api/finance/ar-aging'), []);

  const o = overview.data || {};
  const receivable = o.receivable || {};
  const payable = o.payable || {};
  const cash = o.cash || {};
  const month = o.month || {};

  const refreshAll = () => { overview.refresh(); cashflow.refresh(); aging.refresh(); };

  /* ---------- 近 6 个月收付款趋势 ---------- */
  const cashRows = cashflow.data || [];
  const trendOption = useMemo(() => ({
    color: ['#16a34a', '#e5484d', '#2f6bff'],
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
    legend: { data: ['收款', '付款', '净流量'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: cashRows.map((x: any) => x.period?.slice(2)), ...axisStyle() },
    yAxis: {
      type: 'value', ...axisStyle(),
      axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(0)}万` : v) },
    },
    series: [
      { name: '收款', type: 'bar', barWidth: 11, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: cashRows.map((x: any) => x.inflow) },
      { name: '付款', type: 'bar', barWidth: 11, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: cashRows.map((x: any) => x.outflow) },
      { name: '净流量', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 }, data: cashRows.map((x: any) => x.net) },
    ],
  }), [cashRows]);

  /* ---------- 应收账龄分布 ---------- */
  const buckets = aging.data?.summary?.buckets || [];
  const agingTotal = aging.data?.summary?.total?.amount || 0;
  const agingOption = useMemo(() => ({
    color: ['#16a34a', '#2f6bff', '#f59e0b', '#e5484d'],
    tooltip: { trigger: 'item', valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
    legend: { orient: 'vertical', right: 6, top: 'center', itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    series: [{
      type: 'pie',
      radius: ['48%', '70%'],
      center: ['36%', '50%'],
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      label: {
        show: true, position: 'center',
        formatter: () => `{a|¥${(agingTotal / 10000).toFixed(1)}万}\n{b|应收未收合计}`,
        rich: { a: { fontSize: 17, fontWeight: 700, color: '#1f2b3d' }, b: { fontSize: 11, color: '#8b98ab', padding: [4, 0, 0, 0] } },
      },
      emphasis: { label: { show: true } },
      data: buckets.map((b: any) => ({ name: b.label, value: b.amount })),
    }],
  }), [buckets, agingTotal]);

  /* ---------- 待办快捷入口 ---------- */
  const quickLinks = [
    { label: '登记收款', desc: '客户回款 · 核销应收', path: '/finance/receipts/new', icon: <MoneyCollectOutlined />, perm: 'finance.create', color: '#16a34a' },
    { label: '登记付款', desc: '供应商付款 · 核销应付', path: '/finance/payments/new', icon: <PayCircleOutlined />, perm: 'finance.create', color: '#d97706' },
    { label: '手工凭证', desc: '借贷分录 · 手工记账', path: '/finance/vouchers/new', icon: <AccountBookOutlined />, perm: 'finance.create', color: '#7c3aed' },
    { label: '应收台账', desc: '发票回收 · 逾期跟踪', path: '/finance/receivables', icon: <WalletOutlined />, perm: 'finance.view', color: '#2f6bff' },
    { label: '应付台账', desc: '发票付款 · 到期提醒', path: '/finance/payables', icon: <BankOutlined />, perm: 'finance.view', color: '#0891b2' },
    { label: '账龄分析', desc: '应收应付 · 账龄分档', path: '/finance/aging', icon: <LineChartOutlined />, perm: 'finance.view', color: '#be185d' },
    { label: '科目余额表', desc: '期初 · 发生额 · 期末', path: '/finance/trial-balance', icon: <TableOutlined />, perm: 'finance.view', color: '#2f6bff' },
    { label: '财务报表', desc: '利润表 / 资产负债表 / 现金流量表', path: '/finance/statements', icon: <BarChartOutlined />, perm: 'finance.view', color: '#0891b2' },
    { label: '科目映射', desc: '业务凭证 · 会计科目对应', path: '/finance/gl-mappings', icon: <DeploymentUnitOutlined />, perm: 'finance.view', color: '#64748b' },
  ].filter((x) => hasPerm(x.perm));

  const arDiff = Number(receivable.diff) || 0;
  const apDiff = Number(payable.diff) || 0;
  const reconciled = Math.abs(arDiff) <= 1 && Math.abs(apDiff) <= 1;

  return (
    <div>
      <PageHeader
        title="财务总览"
        subtitle={`${o.period || ''} 账期财务快照 · 截至 ${o.asOfDate || ''} · 应收应付、资金、损益实时同步自业务单据`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
            <Button icon={<DashboardOutlined />} onClick={() => navigate('/finance/statements')}>财务报表</Button>
            {hasPerm('finance.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/receipts/new')}>登记收款</Button>
            )}
          </Space>
        }
      />

      <div className="kpi-grid">
        <StatCard title="应收余额" value={o.ar_balance || 0} prefix="¥" icon={<WalletOutlined />}
          foot={`${receivable.count || 0} 张未结清 · 逾期 ￥${fmtMoney(receivable.overdue_amount)}`} onClick={() => navigate('/finance/receivables')} />
        <StatCard title="应付余额" value={o.ap_balance || 0} prefix="¥" icon={<BankOutlined />}
          foot={`${payable.count || 0} 张未结清 · 逾期 ￥${fmtMoney(payable.overdue_amount)}`} onClick={() => navigate('/finance/payables')} />
        <StatCard title="本月收款" value={o.month_receipt || 0} prefix="¥" icon={<MoneyCollectOutlined />}
          foot={`${month.receipt_count || 0} 笔收款单`} onClick={() => navigate('/finance/receipts')} />
        <StatCard title="本月付款" value={o.month_payment || 0} prefix="¥" icon={<PayCircleOutlined />}
          foot={`${month.payment_count || 0} 笔付款单`} onClick={() => navigate('/finance/payments')} />
        <StatCard title="现金 + 银行存款" value={o.cash_total || 0} prefix="¥" icon={<BankOutlined />}
          foot={`现金 ￥${fmtMoney(cash.cash_balance)} · 银行 ￥${fmtMoney(cash.bank_balance)}`} onClick={() => navigate('/finance/ledger')} />
        <StatCard title="本月收入" value={o.month_income || 0} prefix="¥" icon={<BarChartOutlined />} foot="主营业务收入（不含税）"
          onClick={() => navigate('/finance/statements')} />
        <StatCard title="本月成本费用" value={o.month_cost || 0} prefix="¥" icon={<CalculatorOutlined />} foot="营业成本 + 税金 + 期间费用"
          onClick={() => navigate('/finance/statements')} />
        <StatCard title="本月利润" value={o.month_profit || 0} prefix="¥" icon={<LineChartOutlined />}
          color={Number(o.month_profit) >= 0 ? 'var(--success)' : 'var(--danger)'}
          foot={`净利润 ￥${fmtMoney(o.month_net_profit)}`} onClick={() => navigate('/finance/statements')} />
        <StatCard title="逾期应收" value={o.overdue_ar_amount || 0} prefix="¥" color="var(--danger)" icon={<AlertOutlined />}
          foot={`${o.overdue_ar_count || 0} 张发票已过到期日`} onClick={() => navigate('/finance/receivables')} />
      </div>

      <div className="grid-2 mt-14">
        <ChartCard
          title="收付款趋势（近 6 个月）"
          option={trendOption}
          height={320}
          extra={<Button size="small" type="link" onClick={() => navigate('/finance/receipts')}>收款单明细</Button>}
        />
        <ChartCard
          title="应收账龄分布"
          option={agingOption}
          height={320}
          extra={<Button size="small" type="link" onClick={() => navigate('/finance/aging')}>账龄分析</Button>}
        />
      </div>

      <div className="grid-2 mt-14">
        <div className="card">
          <div className="card-head">
            <div className="card-title"><span className="dot" />待办事项与快捷入口</div>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>{quickLinks.length} 项可用</Tag>
          </div>
          <div className="card-pad">
            {quickLinks.length === 0 && <div className="empty-hint">当前账号没有财务操作权限</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {quickLinks.map((l) => (
                <div
                  key={l.path + l.label}
                  onClick={() => navigate(l.path)}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 8, padding: '12px 12px', cursor: 'pointer',
                    display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', transition: 'all .15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <span style={{ color: l.color, fontSize: 17, lineHeight: '20px' }}>{l.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.label}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title"><span className="dot" />发票口径与总账对账</div>
            <Button size="small" type="link" icon={<ReloadOutlined />} onClick={() => overview.refresh()}>刷新</Button>
          </div>
          <div className="card-pad">
            <Alert
              type={reconciled ? 'success' : 'warning'}
              showIcon
              message={reconciled ? '应收应付发票余额与总账科目余额一致' : '发票口径与总账口径存在差异，建议核查未过账单据'}
              style={{ marginBottom: 12 }}
            />
            <div className="flex-between" style={{ padding: '10px 2px', borderBottom: '1px solid #f4f6fa' }}>
              <span><WalletOutlined style={{ color: '#2f6bff', marginRight: 6 }} />应收账款</span>
              <Space size={18}>
                <span className="text-muted">发票口径 <b className="num" style={{ color: 'var(--text)' }}>￥{fmtMoney(receivable.balance)}</b></span>
                <span className="text-muted">总账口径 <b className="num" style={{ color: 'var(--text)' }}>￥{fmtMoney(receivable.gl_balance)}</b></span>
                <Tag color={Math.abs(arDiff) <= 1 ? 'green' : 'orange'}>差异 {fmtMoney(arDiff)}</Tag>
              </Space>
            </div>
            <div className="flex-between" style={{ padding: '10px 2px', borderBottom: '1px solid #f4f6fa' }}>
              <span><BankOutlined style={{ color: '#f59e0b', marginRight: 6 }} />应付账款</span>
              <Space size={18}>
                <span className="text-muted">发票口径 <b className="num" style={{ color: 'var(--text)' }}>￥{fmtMoney(payable.balance)}</b></span>
                <span className="text-muted">总账口径 <b className="num" style={{ color: 'var(--text)' }}>￥{fmtMoney(payable.gl_balance)}</b></span>
                <Tag color={Math.abs(apDiff) <= 1 ? 'green' : 'orange'}>差异 {fmtMoney(apDiff)}</Tag>
              </Space>
            </div>
            <div className="flex-between" style={{ padding: '10px 2px', borderBottom: '1px solid #f4f6fa' }}>
              <span><SwapOutlined style={{ color: '#0891b2', marginRight: 6 }} />本月收付净流量</span>
              <b className={`num ${(o.month_receipt || 0) - (o.month_payment || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                ￥{fmtMoney((o.month_receipt || 0) - (o.month_payment || 0))}
              </b>
            </div>
            <div className="flex-between" style={{ padding: '10px 2px' }}>
              <span><AccountBookOutlined style={{ color: '#7c3aed', marginRight: 6 }} />本月凭证</span>
              <Button size="small" type="link" onClick={() => navigate('/finance/vouchers')}>查看凭证列表 →</Button>
            </div>
            {(o.overdue_ap_count || 0) > 0 && (
              <Alert
                type="warning" showIcon style={{ marginTop: 10 }}
                message={`有 ${o.overdue_ap_count} 张应付发票逾期未付，金额 ￥${fmtMoney(o.overdue_ap_amount)}，请及时安排资金。`}
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-14 card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />财务月度摘要</div>
          <Button size="small" type="link" onClick={() => navigate('/finance/statements')}>阅读完整报表</Button>
        </div>
        <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
          {[
            { label: '本月收入', value: o.month_income, foot: '主营业务收入' },
            { label: '本月成本费用', value: o.month_cost, foot: '成本 + 费用' },
            { label: '本月利润', value: o.month_profit, foot: '营业利润' },
            { label: '本月净利润', value: o.month_net_profit, foot: '扣除所得税' },
          ].map((x) => (
            <div key={x.label} style={{ borderLeft: '3px solid var(--primary-soft)', paddingLeft: 12 }}>
              <div className="text-muted" style={{ fontSize: 12 }}>{x.label}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                ￥{fmtMoney(x.value)}
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>{x.foot}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
