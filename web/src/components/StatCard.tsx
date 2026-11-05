import type { ReactNode } from 'react';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { fmtMoney, fmtNumber } from '../utils/format';

interface Props {
  title: ReactNode;
  value: number | string;
  /** 前缀符号，如 ¥ */
  prefix?: string;
  suffix?: ReactNode;
  digits?: number;
  /** 环比增长百分比（数字，如 12.5） */
  growth?: number | null;
  /** 是否显示为金额 */
  money?: boolean;
  icon?: ReactNode;
  foot?: ReactNode;
  color?: string;
  onClick?: () => void;
}

export default function StatCard({ title, value, prefix, suffix, digits = 2, growth, money = true, icon, foot, color, onClick }: Props) {
  const display = typeof value === 'number'
    ? (money ? fmtMoney(value, digits) : fmtNumber(value, digits))
    : value;
  const up = (growth ?? 0) >= 0;
  return (
    <div className="kpi-card" style={onClick ? { cursor: 'pointer' } : undefined} onClick={onClick}>
      <div className="kpi-label">
        {icon && <span style={{ color: color || 'var(--primary)', fontSize: 14 }}>{icon}</span>}
        {title}
      </div>
      <div className="kpi-value" style={color ? { color } : undefined}>
        {prefix && <small style={{ marginRight: 2 }}>{prefix}</small>}
        {display}
        {suffix && <span className="kpi-suffix">{suffix}</span>}
      </div>
      <div className="kpi-foot">
        {growth !== undefined && growth !== null && (
          <span className={up ? 'kpi-up' : 'kpi-down'}>
            {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(growth)}%
          </span>
        )}
        {foot}
      </div>
    </div>
  );
}
