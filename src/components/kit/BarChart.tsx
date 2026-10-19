export interface Bar {
  label: string;
  /** One or two values per bar; the second is drawn beside the first. */
  values: number[];
}

interface BarChartProps {
  bars: Bar[];
  /** Legend text for each value index. */
  series: { name: string; color: string }[];
  /** Axis maximum; defaults to the largest value. */
  max?: number;
  height?: number;
  format?: (n: number) => string;
}

/** Plain bar chart from real numbers. No data means the caller shows an empty state instead. */
const BarChart = ({ bars, series, max, height = 180, format = (n) => String(Math.round(n * 10) / 10) }: BarChartProps) => {
  const top = max ?? Math.max(1, ...bars.flatMap((b) => b.values));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden /> {s.name}
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-3 overflow-x-auto border-b border-border pb-1" style={{ height }} role="img"
        aria-label={bars.map((b) => `${b.label}: ${b.values.map(format).join(" and ")}`).join("; ")}>
        {bars.map((b) => (
          <div key={b.label} className="flex h-full min-w-[3rem] flex-1 items-end justify-center gap-1">
            {b.values.map((v, i) => (
              <div key={i} className="flex h-full w-full max-w-[1.75rem] flex-col items-center justify-end">
                <span className="mb-1 text-[10px] font-medium text-muted-foreground">{format(v)}</span>
                <div className="w-full rounded-t-md" style={{ height: `${(v / top) * 100}%`, background: series[i]?.color, minHeight: v > 0 ? 3 : 0 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3 overflow-x-auto">
        {bars.map((b) => (
          <span key={b.label} className="min-w-[3rem] flex-1 truncate text-center text-xs text-muted-foreground">{b.label}</span>
        ))}
      </div>
    </div>
  );
};

export default BarChart;
