import { Progress, Tag } from 'antd';
import StatusTag from '../../components/StatusTag';
import { fmtNumber } from '../../utils/format';

/** 工单状态字典（与后端 WO_STATUS 一致） */
export const WO_STATUS_LIST = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'RELEASED', label: '已下达', color: 'processing' },
  { value: 'IN_PROGRESS', label: '生产中', color: 'warning' },
  { value: 'COMPLETED', label: '已完工', color: 'success' },
  { value: 'CLOSED', label: '已关闭', color: 'default' },
  { value: 'VOID', label: '已作废', color: 'error' },
];

export const WO_STATUS_MAP: Record<string, { label: string; color: string }> = Object.fromEntries(
  WO_STATUS_LIST.map((s) => [s.value, { label: s.label, color: s.color }])
);

export const WO_STATUS_OPTIONS = WO_STATUS_LIST.map((s) => ({ label: s.label, value: s.value }));

/** 工单状态标签 */
export function WoStatusTag({ status }: { status?: string }) {
  const info = WO_STATUS_MAP[status || ''] || { label: status || '-', color: 'default' };
  return <StatusTag status={status || ''} label={info.label} color={info.color} />;
}

/** 优先级（低/普通/高/紧急） */
export const WO_PRIORITIES = ['低', '普通', '高', '紧急'];

const PRIORITY_COLORS: Record<string, string> = { 低: 'default', 普通: 'blue', 高: 'orange', 紧急: 'red' };

export function PriorityTag({ value }: { value?: string }) {
  if (!value) return <span className="text-muted">-</span>;
  return (
    <Tag color={PRIORITY_COLORS[value] || 'default'} style={{ marginInlineEnd: 0 }}>
      {value}
    </Tag>
  );
}

export interface WoActionDef {
  action: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  icon?: string;
  /** 需要弹窗录入：领料 = issue，完工 = complete */
  input?: 'issue' | 'complete';
}

/** 各状态可执行的工单动作（与后端 /action 校验一致） */
export const WO_ACTIONS_BY_STATUS: Record<string, WoActionDef[]> = {
  DRAFT: [
    { action: 'release', label: '下达', primary: true },
    { action: 'void', label: '作废', danger: true },
  ],
  RELEASED: [
    { action: 'start', label: '开工', primary: true },
    { action: 'issue', label: '领料', input: 'issue' },
    { action: 'void', label: '作废', danger: true },
  ],
  IN_PROGRESS: [
    { action: 'issue', label: '领料', input: 'issue' },
    { action: 'complete', label: '完工', primary: true, input: 'complete' },
  ],
  COMPLETED: [{ action: 'close', label: '关闭' }],
  CLOSED: [],
  VOID: [],
};

export function woActionsOf(status?: string): WoActionDef[] {
  return WO_ACTIONS_BY_STATUS[status || ''] || [];
}

/** 每个动作执行成功后的提示语 */
export const ACTION_SUCCESS_TEXT: Record<string, string> = {
  release: '工单已下达，可开始开工与领料',
  start: '工单已开工',
  issue: '领料成功，已生成库存流水与会计凭证',
  complete: '完工成功，已生成库存流水与会计凭证',
  close: '工单已关闭',
  void: '工单已作废',
};

export function actionSuccessText(action: string) {
  return ACTION_SUCCESS_TEXT[action] || '操作成功';
}

/** 工单进度（0-100） */
export function woProgress(qty: any, completed: any): number {
  const q = Number(qty) || 0;
  const c = Number(completed) || 0;
  if (q <= 0) return 0;
  return Math.round(Math.min(1, c / q) * 10000) / 100;
}

/** 表格内进度条 */
export function WoProgress({ qty, completed, width = 120 }: { qty: any; completed: any; width?: number }) {
  const p = woProgress(qty, completed);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width }}>
      <Progress
        percent={p}
        size="small"
        showInfo={false}
        strokeColor={p >= 100 ? 'var(--success)' : p > 0 ? 'var(--primary)' : 'var(--border-strong)'}
        style={{ marginBottom: 0, flex: 1, minWidth: 50 }}
      />
      <span className="num text-muted" style={{ fontSize: 11, width: 38, textAlign: 'right' }}>
        {fmtNumber(p, 0)}%
      </span>
    </div>
  );
}

/** 交接班/进度颜色：负荷率超 100% 用红色 */
export function loadColor(rate: number) {
  if (rate > 100) return 'var(--danger)';
  if (rate >= 85) return 'var(--warning)';
  return 'var(--success)';
}

/** 计划日期距今天数（正数=剩余，负数=逾期） */
export function daysFromToday(date?: string): number | null {
  if (!date) return null;
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
