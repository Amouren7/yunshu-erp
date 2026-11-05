import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  tag?: ReactNode;
  back?: ReactNode;
}

export default function PageHeader({ title, subtitle, extra, tag, back }: Props) {
  return (
    <div className="page-head">
      <div>
        <div className="page-title">
          {back}
          {title}
          {tag}
        </div>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {extra && <div className="page-actions">{extra}</div>}
    </div>
  );
}
