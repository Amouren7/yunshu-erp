import { useMemo } from 'react';
import { useMeta } from '../store/meta';
import { fmtMoney, toChineseMoney } from '../utils/format';

interface Props {
  doc: any;
  lines: any[];
  docTypeName: string;
  statusLabel: string;
  isPurchase?: boolean;
}

/** 单据打印视图（A4 风格） */
export default function DocPrint({ doc, lines, docTypeName, statusLabel }: Props) {
  const { meta } = useMeta();
  const company = meta?.settings?.company_name || '云枢科技（深圳）有限公司';
  const tel = meta?.settings?.company_tel || '';
  const address = meta?.settings?.company_address || '';

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const tax = lines.reduce((s, l) => s + (Number(l.tax_amount) || 0), 0);
    const total = lines.reduce((s, l) => s + (Number(l.total_amount) || Number(l.amount) || 0), 0);
    return { subtotal, tax, total };
  }, [lines]);

  const partnerLabel = doc.partner_type === 'supplier' ? '供应商' : doc.partner_type === 'customer' ? '客户' : '往来单位';

  return (
    <div className="print-sheet">
      <div className="print-head">
        <div className="print-company">{company}</div>
        <div className="print-docname">{docTypeName}</div>
      </div>
      <div className="print-meta">
        <div><span>单据编号：</span>{doc.doc_no}</div>
        <div><span>单据日期：</span>{doc.doc_date}</div>
        <div><span>{partnerLabel}：</span>{doc.partner_name || '-'}</div>
        <div><span>联系人：</span>{doc.contact || '-'} {doc.phone ? ` / ${doc.phone}` : ''}</div>
        <div><span>状态：</span>{statusLabel}</div>
        <div><span>仓库：</span>{doc.warehouse_name || doc.to_warehouse_name || '-'}</div>
        <div><span>制单：</span>{doc.created_by_name || '-'}</div>
        <div><span>打印时间：</span>{new Date().toLocaleString('zh-CN')}</div>
      </div>
      <table className="print-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>序号</th>
            <th style={{ width: 90 }}>物料编码</th>
            <th>物料名称</th>
            <th style={{ width: 140 }}>规格型号</th>
            <th style={{ width: 50 }}>单位</th>
            <th className="num" style={{ width: 70 }}>数量</th>
            <th className="num" style={{ width: 80 }}>单价</th>
            <th className="num" style={{ width: 80 }}>金额</th>
            <th className="num" style={{ width: 60 }}>税率</th>
            <th className="num" style={{ width: 80 }}>税额</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id || i}>
              <td>{i + 1}</td>
              <td>{l.item_code || '-'}</td>
              <td>{l.item_name || l.invoice_no || '-'}</td>
              <td>{l.spec || '-'}</td>
              <td>{l.uom || '-'}</td>
              <td className="num">{Number(l.qty) || 0}</td>
              <td className="num">{fmtMoney(l.price)}</td>
              <td className="num">{fmtMoney(l.amount ?? l.total_amount)}</td>
              <td className="num">{l.tax_rate ? `${l.tax_rate}%` : '-'}</td>
              <td className="num">{fmtMoney(l.tax_amount)}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#8b98ab', padding: 24 }}>无明细</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} style={{ textAlign: 'right' }}>合计</td>
            <td className="num" />
            <td className="num" />
            <td className="num">{fmtMoney(totals.subtotal)}</td>
            <td className="num" />
            <td className="num">{fmtMoney(totals.tax)}</td>
          </tr>
          <tr>
            <td colSpan={6} style={{ textAlign: 'right' }}>价税合计（大写）</td>
            <td colSpan={4}>{toChineseMoney(totals.total)}　【￥{fmtMoney(totals.total)}】</td>
          </tr>
        </tfoot>
      </table>
      <div style={{ marginTop: 14, fontSize: 12, color: '#5b6b82', minHeight: 40 }}>
        <div>备注：{doc.remark || '-'}</div>
        {address && <div style={{ marginTop: 4 }}>地址：{address}　电话：{tel}</div>}
      </div>
      <div className="print-sign">
        <div>制单人：{doc.created_by_name || ''}</div>
        <div>审核人：</div>
        <div>仓库：</div>
        <div>客户签收：</div>
      </div>
    </div>
  );
}
