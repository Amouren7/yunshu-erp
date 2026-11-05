import DocListPage from '../../components/DocListPage';
import DocEditorPage from '../../components/DocEditor';

const SO = { docType: 'SO', basePath: '/sales/orders' };
const DN = { docType: 'DN', basePath: '/sales/deliveries' };
const SR = { docType: 'SR', basePath: '/sales/returns' };

export function SalesOrdersPage() {
  return <DocListPage {...SO} title="销售订单" subtitle="销售订单的创建、审批与执行跟踪；审核后可生成发货单" />;
}
export function SalesOrderEditor() {
  return <DocEditorPage docType="SO" basePath="/sales/orders" listPath="/sales/orders" />;
}
export function DeliveriesPage() {
  return <DocListPage {...DN} title="销售发货单" subtitle="销售出库发货，审核后自动扣减库存、生成应收发票与会计凭证" />;
}
export function DeliveryEditor() {
  return <DocEditorPage docType="DN" basePath="/sales/deliveries" listPath="/sales/deliveries" />;
}
export function SalesReturnsPage() {
  return <DocListPage {...SR} title="销售退货单" subtitle="客户退货入库，自动红冲收入与应收" />;
}
export function SalesReturnEditor() {
  return <DocEditorPage docType="SR" basePath="/sales/returns" listPath="/sales/returns" />;
}
