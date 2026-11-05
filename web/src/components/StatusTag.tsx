import { Tag } from 'antd';
import { useMeta } from '../store/meta';
import { statusColor } from '../utils/format';

const TEXT_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  default: { bg: '#f2f4f8', fg: '#5b6b82', border: '#e4e9f2' },
  processing: { bg: '#eef4ff', fg: '#2f6bff', border: '#c9dbff' },
  success: { bg: '#eaf8ef', fg: '#16a34a', border: '#bfe8cc' },
  warning: { bg: '#fff7e8', fg: '#d97706', border: '#fbe0b0' },
  error: { bg: '#fdeeee', fg: '#e5484d', border: '#f7c9ca' },
  cyan: { bg: '#e8f8fb', fg: '#0891b2', border: '#b9e8f1' },
  purple: { bg: '#f3eeff', fg: '#7c3aed', border: '#ddd0fb' },
};

export default function StatusTag({ status, docType, color, label }: { status: string; docType?: string; color?: string; label?: string }) {
  const { meta } = useMeta();
  const metaStatus = docType ? meta?.docTypes?.[docType]?.statuses?.find((s: any) => s.value === status) : null;
  const resolvedColor = color || metaStatus?.color || statusColor(status, docType);
  const text = label || metaStatus?.label || status;
  const c = TEXT_COLORS[resolvedColor] || TEXT_COLORS.default;
  return (
    <span className="status-tag" style={{ background: c.bg, color: c.fg, borderColor: c.border }}>
      <span className="dot" />
      {text}
    </span>
  );
}

/** 通用业务状态标签（如 在职/启用/正常） */
export function SimpleStatus({ value }: { value: string }) {
  const map: Record<string, [string, string]> = {
    正常: ['#eaf8ef', '#16a34a'], 启用: ['#eaf8ef', '#16a34a'], 在职: ['#eaf8ef', '#16a34a'],
    停用: ['#f2f4f8', '#5b6b82'], 离职: ['#f2f4f8', '#5b6b82'],
    已确认: ['#eef4ff', '#2f6bff'], 已发放: ['#eaf8ef', '#16a34a'], 草稿: ['#f2f4f8', '#5b6b82'],
    已批准: ['#eaf8ef', '#16a34a'], 待审批: ['#fff7e8', '#d97706'], 已驳回: ['#fdeeee', '#e5484d'],
    已核销: ['#f2f4f8', '#5b6b82'], 未收: ['#fff7e8', '#d97706'], 部分收款: ['#eef4ff', '#2f6bff'],
    已收: ['#eaf8ef', '#16a34a'], 未付: ['#fff7e8', '#d97706'], 部分付款: ['#eef4ff', '#2f6bff'],
    已付: ['#eaf8ef', '#16a34a'], 执行中: ['#eef4ff', '#2f6bff'], 已完成: ['#eaf8ef', '#16a34a'],
    已终止: ['#fdeeee', '#e5484d'], 流失: ['#f2f4f8', '#5b6b82'],
  };
  const [bg, fg] = map[value] || ['#f2f4f8', '#5b6b82'];
  return <Tag style={{ background: bg, color: fg, border: 'none', borderRadius: 999, paddingInline: 10 }}>{value}</Tag>;
}
