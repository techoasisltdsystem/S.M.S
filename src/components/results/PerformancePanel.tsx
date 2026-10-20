import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Table, TrendingUp } from "lucide-react";
import { Panel, EmptyState } from "@/components/kit/Panel";
import BarChart from "@/components/kit/BarChart";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/db";
import { exportPerformance, exportStudentReport, type Format, type PerformanceData, type StudentReport } from "@/lib/reports";

export interface PerformanceInput {
  studentId: string;
  studentName: string;
  className: string | null;
  average: number | null;
  rank: number | null;
  classSize: number | null;
  attendancePct: number | null;
  attendanceDays: number;
  results: { subject: string; title: string; kind: string; at: string; score: number; max: number; p: number }[];
  schoolName: string;
  logoUrl: string | null;
}

/** Marks over time, drawn from the published results. */
const TrendChart = ({ points }: { points: { label: string; p: number }[] }) => {
  const w = 360, h = 150, padL = 30, padR = 10, padT = 10, padB = 22;
  const x = (i: number) => padL + (points.length === 1 ? (w - padL - padR) / 2 : (i * (w - padL - padR)) / (points.length - 1));
  const y = (p: number) => padT + (1 - Math.min(100, Math.max(0, p)) / 100) * (h - padT - padB);
  const path = points.map((pt, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" className="w-full" aria-label={`Results over time: ${points.map((p) => `${p.label} ${Math.round(p.p)}%`).join(", ")}`}>
      {[0, 50, 100].map((g) => (
        <g key={g}><line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} stroke="hsl(var(--border))" strokeDasharray={g === 50 ? "4 3" : undefined} /><text x={padL - 5} y={y(g) + 3} textAnchor="end" fontSize="9" className="fill-muted-foreground">{g}</text></g>
      ))}
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" />
      {points.map((pt, i) => <circle key={i} cx={x(i)} cy={y(pt.p)} r="3.5" fill="hsl(var(--primary))"><title>{`${pt.label}: ${Math.round(pt.p)}%`}</title></circle>)}
      <text x={padL} y={h - 6} fontSize="9" className="fill-muted-foreground">{points[0]?.label}</text>
      {points.length > 1 && <text x={w - padR} y={h - 6} textAnchor="end" fontSize="9" className="fill-muted-foreground">{points[points.length - 1]?.label}</text>}
    </svg>
  );
};

const short = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Subject averages and a results trend for one student, with PDF, Excel and CSV downloads. Used by students and parents. */
const PerformancePanel = ({ data }: { data: PerformanceInput }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const bySubject = new Map<string, number[]>();
  data.results.forEach((r) => bySubject.set(r.subject, [...(bySubject.get(r.subject) ?? []), r.p]));
  const subjects = [...bySubject.entries()].map(([subject, ps]) => ({ subject, average: ps.reduce((a, b) => a + b, 0) / ps.length, count: ps.length })).sort((a, b) => a.subject.localeCompare(b.subject));
  const trend = [...data.results].sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ label: short(r.at), p: r.p }));

  const run = async (kind: "summary" | "card", format: Format) => {
    setBusy(true);
    try {
      if (kind === "card") {
        // The report card is requested at the moment of the click, so the database re-checks who is asking.
        const { data: rep, error } = await db.rpc("student_report", { _student: data.studentId });
        if (error) throw new Error(error.message);
        await exportStudentReport(rep as unknown as StudentReport, format);
      } else {
        const d: PerformanceData = {
          school: { name: data.schoolName, logo_url: data.logoUrl },
          student: { name: data.studentName, class: data.className },
          average: data.average, rank: data.rank, classSize: data.classSize, attendancePct: data.attendancePct, attendanceDays: data.attendanceDays,
          subjects, issued_at: new Date().toISOString(),
          results: [...data.results].sort((a, b) => a.subject.localeCompare(b.subject) || a.at.localeCompare(b.at)).map((r) => ({ subject: r.subject, title: r.title, kind: r.kind, date: r.at, score: r.score, max: r.max, percent: r.p })),
        };
        await exportPerformance(d, format);
      }
      toast({ title: "Download ready", description: `Your ${format.toUpperCase()} file has been saved.` });
    } catch (e) {
      toast({ title: "Could not create the file", description: e instanceof Error ? e.message : "Try again in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const item = (kind: "summary" | "card", format: Format, label: string, Icon: typeof FileText) => (
    <DropdownMenuItem key={`${kind}-${format}`} onSelect={() => void run(kind, format)}><Icon className="mr-2 h-4 w-4" aria-hidden /> {label}</DropdownMenuItem>
  );

  return (
    <Panel title="Performance" icon={TrendingUp}>
      <div className="mb-3 flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy || data.results.length === 0} aria-label="Download performance">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Download className="mr-2 h-4 w-4" aria-hidden />} {busy ? "Preparing…" : "Download"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Performance summary</DropdownMenuLabel>
            {item("summary", "pdf", "PDF (with chart)", FileText)}{item("summary", "xlsx", "Excel (.xlsx)", FileSpreadsheet)}{item("summary", "csv", "CSV", Table)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Report card</DropdownMenuLabel>
            {item("card", "pdf", "PDF (printable)", FileText)}{item("card", "xlsx", "Excel (.xlsx)", FileSpreadsheet)}{item("card", "csv", "CSV", Table)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {data.results.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No published results yet" text="The charts and downloads appear once the school has published results." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Average by subject (%)</p>
            <BarChart max={100} height={160} format={(n) => `${Math.round(n)}`} bars={subjects.map((s) => ({ label: s.subject, values: [s.average] }))} series={[{ name: "Average %", color: "hsl(var(--primary))" }]} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Results over time (%)</p>
            <TrendChart points={trend} />
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Based on published results only. Downloads are checked by the school&apos;s system each time.</p>
    </Panel>
  );
};

export default PerformancePanel;
