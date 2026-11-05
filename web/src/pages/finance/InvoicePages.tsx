/**
 * 应收台账 / 应付台账 / 发票管理
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tabs } from 'antd';
import { PlusOutlined, PieChartOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { useAuth } from '../../store/auth';
import { InvoiceListBlock } from './InvoiceList';

export function ReceivablesPage() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  return (
    <div>
      <PageHeader
        title="应收台账"
        subtitle="按发票跟踪应收账款回收情况：已收 / 未收 / 逾期一目了然，登记收款后自动核销并生成会计凭证"
        extra={
          <>
            <Button icon={<PieChartOutlined />} onClick={() => navigate('/finance/aging')}>账龄分析</Button>
            {hasPerm('finance.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/receipts/new')}>登记收款</Button>
            )}
          </>
        }
      />
      <InvoiceListBlock invoiceType="AR" mode="ledger" showKpis />
    </div>
  );
}

export function PayablesPage() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  return (
    <div>
      <PageHeader
        title="应付台账"
        subtitle="按发票跟踪应付账款支付情况：已付 / 未付 / 逾期一目了然，登记付款后自动核销并生成会计凭证"
        extra={
          <>
            <Button icon={<PieChartOutlined />} onClick={() => navigate('/finance/aging')}>账龄分析</Button>
            {hasPerm('finance.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/payments/new')}>登记付款</Button>
            )}
          </>
        }
      />
      <InvoiceListBlock invoiceType="AP" mode="ledger" showKpis />
    </div>
  );
}

export function InvoicesPage() {
  const [tab, setTab] = useState<'AR' | 'AP'>('AR');
  return (
    <div>
      <PageHeader
        title="发票管理"
        subtitle="应收 / 应付发票统一管理：查看核销明细与关联凭证，维护到期日与备注（金额由来源单据控制）"
      />
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'AR' | 'AP')}
        items={[
          { key: 'AR', label: '应收发票', children: <InvoiceListBlock invoiceType="AR" mode="manage" /> },
          { key: 'AP', label: '应付发票', children: <InvoiceListBlock invoiceType="AP" mode="manage" /> },
        ]}
      />
    </div>
  );
}
