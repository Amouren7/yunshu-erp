/**
 * 收付款单：通用单据列表 + 单据编辑器（docType RC / PY）
 * 业务逻辑（核销发票、过账、生成凭证）复用 DocListPage / DocEditorPage。
 */
import DocListPage from '../../components/DocListPage';
import DocEditorPage from '../../components/DocEditor';

export function ReceiptsPage() {
  return (
    <DocListPage
      docType="RC"
      title="收款单"
      subtitle="登记客户回款，审核后自动核销应收发票并生成收款会计凭证"
      basePath="/finance/receipts"
      permModule="finance"
    />
  );
}

export function ReceiptEditor() {
  return <DocEditorPage docType="RC" basePath="/finance/receipts" listPath="/finance/receipts" />;
}

export function PaymentsPage() {
  return (
    <DocListPage
      docType="PY"
      title="付款单"
      subtitle="登记供应商付款，审核后自动核销应付发票并生成付款会计凭证"
      basePath="/finance/payments"
      permModule="finance"
    />
  );
}

export function PaymentEditor() {
  return <DocEditorPage docType="PY" basePath="/finance/payments" listPath="/finance/payments" />;
}
