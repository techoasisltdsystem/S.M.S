import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Landmark, Plus, Trash2 } from "lucide-react";
import { Panel } from "@/components/kit/Panel";
import { TableCard, td, th } from "@/components/kit/Dash";
import { LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { money } from "@/hooks/useFees";
import { rpc } from "@/lib/rpc";

interface Band { upto: number | null; rate: number }
interface Settings { enabled: boolean; ssnit_employee_pct: number; ssnit_employer_pct: number; bands: Band[]; updated_at: string | null }
interface Summary { period: string; paye: number; ssnit_employee: number; ssnit_employer: number; staff: number; gross: number; net: number }
interface RunOpt { id: string; period: string; staff: number }

/** Mirrors payroll_paye in the database so the preview matches what payroll will charge. */
const paye = (taxable: number, bands: Band[]) => {
  let lower = 0, tax = 0;
  for (const b of bands) {
    if (b.upto == null || taxable <= b.upto) return Math.round((tax + Math.max(taxable - lower, 0) * b.rate / 100) * 100) / 100;
    tax += (b.upto - lower) * b.rate / 100;
    lower = b.upto;
  }
  return Math.round(tax * 100) / 100;
};

/** PAYE bands and SSNIT rates for the school, a calculator to check them, and the statutory totals for a payroll month. */
const TaxSettings = ({ schoolId, canEdit, runs }: { schoolId: string; canEdit: boolean; runs: RunOpt[] }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pay-tax", schoolId], queryFn: () => rpc<Settings>("payroll_tax_settings_get", { _school: schoolId }) });
  const [f, setF] = useState<{ enabled: boolean; ee: string; er: string; bands: { upto: string; rate: string }[] } | null>(null);
  const [probe, setProbe] = useState("3000");
  const [runId, setRunId] = useState("");
  const sum = useQuery({ queryKey: ["pay-stat", runId], enabled: !!runId, queryFn: () => rpc<Summary>("payroll_statutory_summary", { _run: runId }) });

  useEffect(() => {
    if (q.data && !f) setF({ enabled: q.data.enabled, ee: String(q.data.ssnit_employee_pct), er: String(q.data.ssnit_employer_pct), bands: q.data.bands.map((b) => ({ upto: b.upto == null ? "" : String(b.upto), rate: String(b.rate) })) });
  }, [q.data, f]);

  const save = useMutation({
    mutationFn: () => rpc("payroll_tax_settings_save", { _school: schoolId, _enabled: f!.enabled, _ssnit_employee: Number(f!.ee), _ssnit_employer: Number(f!.er),
      _bands: f!.bands.map((b, i) => ({ upto: i === f!.bands.length - 1 || b.upto.trim() === "" ? null : Number(b.upto), rate: Number(b.rate) })) }),
    onSuccess: () => { toast({ title: "Tax settings saved", description: "They apply the next time a payroll is calculated." }); void qc.invalidateQueries({ queryKey: ["pay-tax"] }); },
    onError: (e) => toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }),
  });

  if (q.isLoading || !f) return <LoadingRows rows={4} />;
  const bands: Band[] = f.bands.map((b, i) => ({ upto: i === f.bands.length - 1 || b.upto.trim() === "" ? null : Number(b.upto), rate: Number(b.rate) }));
  const basic = Number(probe) || 0;
  const ssnit = Math.round(basic * Number(f.ee)) / 100;
  const tax = paye(basic - ssnit, bands);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="PAYE and SSNIT" icon={Landmark} className="xl:col-span-2">
          <label className="-mt-1 mb-4 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={f.enabled} disabled={!canEdit} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
            Deduct PAYE and SSNIT automatically when payroll is calculated
          </label>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="space-y-1.5"><Label htmlFor="t-ee">SSNIT employee %</Label><Input id="t-ee" inputMode="decimal" disabled={!canEdit} value={f.ee} onChange={(e) => setF({ ...f, ee: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-er">SSNIT employer %</Label><Input id="t-er" inputMode="decimal" disabled={!canEdit} value={f.er} onChange={(e) => setF({ ...f, er: e.target.value })} /></div>
          </div>
          <p className="mb-2 text-sm font-medium">Monthly PAYE bands</p>
          <table className="w-full max-w-lg"><thead><tr><th className={th}>Income up to</th><th className={th}>Rate %</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-border">{f.bands.map((b, i) => {
              const last = i === f.bands.length - 1;
              return (
                <tr key={i}>
                  <td className={td}>{last ? <span className="text-sm text-muted-foreground">Everything above</span> : <Input aria-label={`Band ${i + 1} upper limit`} inputMode="decimal" className="h-9" disabled={!canEdit} value={b.upto} onChange={(e) => setF({ ...f, bands: f.bands.map((x, j) => j === i ? { ...x, upto: e.target.value } : x) })} />}</td>
                  <td className={td}><Input aria-label={`Band ${i + 1} rate`} inputMode="decimal" className="h-9 w-24" disabled={!canEdit} value={b.rate} onChange={(e) => setF({ ...f, bands: f.bands.map((x, j) => j === i ? { ...x, rate: e.target.value } : x) })} /></td>
                  <td className={`${td} text-right`}>{canEdit && !last && f.bands.length > 2 && <Button size="sm" variant="ghost" aria-label={`Remove band ${i + 1}`} onClick={() => setF({ ...f, bands: f.bands.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}</td>
                </tr>
              );
            })}</tbody></table>
          {canEdit && <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setF({ ...f, bands: [...f.bands.slice(0, -1), { upto: "", rate: "" }, f.bands[f.bands.length - 1]] })}><Plus className="mr-1 h-4 w-4" aria-hidden /> Add band</Button>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>Save tax settings</Button>
          </div>}
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The bands start as the GRA resident monthly rates. GRA revises them from time to time; check the current rates with GRA or your accountant and update them here. PAYE is charged on basic salary plus allowances, less the employee SSNIT contribution.</p>
        </Panel>
        <Panel title="Check a salary" icon={Landmark}>
          <div className="space-y-1.5"><Label htmlFor="t-probe">Basic salary (no allowances)</Label><Input id="t-probe" inputMode="decimal" value={probe} onChange={(e) => setProbe(e.target.value)} /></div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">SSNIT ({f.ee}%)</dt><dd>{money(ssnit)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Taxable income</dt><dd>{money(basic - ssnit)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">PAYE</dt><dd>{money(tax)}</dd></div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Take-home</dt><dd>{money(basic - ssnit - tax)}</dd></div>
          </dl>
        </Panel>
      </div>
      <TableCard title="Statutory returns" subtitle="PAYE to remit to GRA and SSNIT contributions for a payroll month" action={
        <select aria-label="Payroll month" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={runId} onChange={(e) => setRunId(e.target.value)}>
          <option value="">Choose a month…</option>{runs.filter((r) => r.staff > 0).map((r) => <option key={r.id} value={r.id}>{r.period}</option>)}
        </select>}>
        {!runId ? <p className="px-5 pb-4 text-sm text-muted-foreground">Choose a calculated payroll month to see its totals.</p> : sum.isLoading || !sum.data ? <div className="p-5"><LoadingRows rows={2} /></div> : (
          <table className="w-full"><thead><tr><th className={th}>Staff</th><th className={th}>Gross</th><th className={th}>PAYE</th><th className={th}>SSNIT employee</th><th className={th}>SSNIT employer</th><th className={th}>SSNIT total</th></tr></thead>
            <tbody><tr><td className={td}>{sum.data.staff}</td><td className={td}>{money(sum.data.gross)}</td><td className={`${td} font-semibold`}>{money(sum.data.paye)}</td><td className={td}>{money(sum.data.ssnit_employee)}</td><td className={td}>{money(sum.data.ssnit_employer)}</td><td className={`${td} font-semibold`}>{money(Number(sum.data.ssnit_employee) + Number(sum.data.ssnit_employer))}</td></tr></tbody></table>
        )}
      </TableCard>
    </div>
  );
};

export default TaxSettings;
