import { useEffect, useRef, type ReactNode } from 'react';
import * as echarts from 'echarts';

interface Props {
  title?: ReactNode;
  option: any;
  height?: number;
  extra?: ReactNode;
  className?: string;
  onEvents?: Record<string, (params: any) => void>;
}

export default function ChartCard({ title, option, height = 300, extra, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => { window.removeEventListener('resize', onResize); ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return (
    <div className={`card ${className || ''}`}>
      {title && (
        <div className="card-head">
          <div className="card-title"><span className="dot" />{title}</div>
          {extra}
        </div>
      )}
      <div ref={ref} style={{ height, width: '100%' }} />
    </div>
  );
}

/** echarts 常用配色 */
export const CHART_COLORS = ['#2f6bff', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b', '#ec4899'];

export function axisStyle() {
  return {
    axisLine: { lineStyle: { color: '#e4e9f2' } },
    axisTick: { show: false },
    axisLabel: { color: '#8b98ab', fontSize: 11 },
    splitLine: { lineStyle: { color: '#f0f3f9' } },
  };
}
