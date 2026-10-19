export interface Segment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  segments: Segment[];
  centerLabel?: string;
  size?: number;
}

const Donut = ({ segments, centerLabel, size = 132 }: DonutProps) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-foreground font-heading text-xl font-bold">
          {total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-card-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label} <span className="text-muted-foreground">({s.value})</span>
          </li>
        ))}
        {centerLabel && <li className="pt-1 text-xs text-muted-foreground">{centerLabel}</li>}
      </ul>
    </div>
  );
};

export default Donut;
