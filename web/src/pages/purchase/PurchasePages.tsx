import DocListPage from '../../components/DocListPage';
import DocEditorPage from '../../components/DocEditor';

export function PurchaseOrdersPage() {
  return <DocListPage docType="PO" title="采购订单" subtitle="采购订单的创建与审批；审核后可生成入库单，跟踪到货进度" basePath="/purchase/orders" permModule="purchase" />;
}
export function PurchaseOrderEditor() {
  return <DocEditorPage docType="PO" basePath="/purchase/orders" listPath="/purchase/orders" />;
}
export function ReceiptsPage() {
  return <DocListPage docType="GRN" title="采购入库单" subtitle="采购到货入库，审核后自动增加库存、生成应付发票与会计凭证" basePath="/purchase/receipts" permModule="purchase" />;
}
export function ReceiptEditor() {
  return <DocEditorPage docType="GRN" basePath="/purchase/receipts" listPath="/purchase/receipts" />;
}
export function PurchaseReturnsPage() {
  return <DocListPage docType="PR" title="采购退货单" subtitle="向供应商退货出库，自动红冲应付与存货成本" basePath="/purchase/returns" permModule="purchase" />;
}
export function PurchaseReturnEditor() {
  return <DocEditorPage docType="PR" basePath="/purchase/returns" listPath="/purchase/returns" />;
}
