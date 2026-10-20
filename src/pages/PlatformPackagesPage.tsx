import { useState } from "react";
import { Eye, EyeOff, History, Loader2, Plus, Settings, Tags } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FEATURES } from "@/hooks/usePlatformConsole";
import { priceText, stamp, useBillingActions, useBillingChanges, useBillingSettings, usePlatformPlans, type BillingSettings, type PlanFull } from "@/hooks/useBilling";

const blankPlan = (): PlanFull => ({
  id: "", code: "", name: "", description: "", monthly_price: 0, annual_price: null, currency: "GHS", trial_days: 0, student_limit: null, staff_limit: null,
  storage_limit_mb: null, entitlements: {}, highlights: [], is_public: false, is_recommended: false, is_active: true, sort_order: 100,
});
const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

const PlanDialog = ({ plan, onClose }: { plan: PlanFull | null; onClose: () => void }) => {
  const { toast } = useToast();
  const { savePlan } = useBillingActions();
  const [p, setP] = useState<PlanFull>(plan ?? blankPlan());
  const [hl, setHl] = useState((plan?.highlights ?? []).join("\n"));
  const [reason, setReason] = useState("");
  const isNew = !plan?.id;
  const set = <K extends keyof PlanFull>(k: K, v: PlanFull[K]) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      await savePlan.mutateAsync({ ...p, highlights: hl.split("\n").map((s) => s.trim()).filter(Boolean), reason: reason.trim() });
      toast({ title: "Package saved", description: "New prices apply to new orders only. Existing payments and subscriptions keep what they were sold at." });
      onClose();
    } catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">{isNew ? "New package" : `Edit ${plan!.name}`}</DialogTitle>
          <DialogDescription>Prices are in whole currency units. A price change never rewrites an earlier order, receipt or subscription period.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="pk-code">Code</Label><Input id="pk-code" value={p.code} disabled={!isNew} onChange={(e) => set("code", e.target.value.toLowerCase())} placeholder="e.g. school" /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-name">Name</Label><Input id="pk-name" value={p.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pk-desc">Description</Label><Input id="pk-desc" value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-m">Monthly price</Label><Input id="pk-m" inputMode="decimal" value={String(p.monthly_price)} onChange={(e) => set("monthly_price", Number(e.target.value) || 0)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-y">Yearly price (blank = not offered)</Label><Input id="pk-y" inputMode="decimal" value={p.annual_price == null ? "" : String(p.annual_price)} onChange={(e) => set("annual_price", num(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-c">Currency</Label><Input id="pk-c" maxLength={3} value={p.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-t">Free trial days (0 = none)</Label><Input id="pk-t" inputMode="numeric" value={String(p.trial_days)} onChange={(e) => set("trial_days", Number(e.target.value) || 0)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-s">Max students (blank = unlimited)</Label><Input id="pk-s" inputMode="numeric" value={p.student_limit == null ? "" : String(p.student_limit)} onChange={(e) => set("student_limit", num(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-f">Max teachers and staff (blank = unlimited)</Label><Input id="pk-f" inputMode="numeric" value={p.staff_limit == null ? "" : String(p.staff_limit)} onChange={(e) => set("staff_limit", num(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor="pk-st">Storage limit, MB (blank = none set)</Label><Input id="pk-st" inputMode="numeric" value={p.storage_limit_mb == null ? "" : String(p.storage_limit_mb)} onChange={(e) => set("storage_limit_mb", num(e.target.value))} /></div>
        </div>
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Modules and features</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.key} className="flex items-center gap-2"><Switch id={`ft-${f.key}`} checked={!!p.entitlements[f.key]} onCheckedChange={(v) => set("entitlements", { ...p.entitlements, [f.key]: v })} /><Label htmlFor={`ft-${f.key}`} className="text-sm font-normal">{f.label}</Label></div>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5"><Label htmlFor="pk-h">Bullet points on the pricing card (one per line)</Label><Textarea id="pk-h" rows={4} value={hl} onChange={(e) => setHl(e.target.value)} /></div>
        <div className="flex flex-wrap gap-5">
          <div className="flex items-center gap-2"><Switch id="pk-pub" checked={p.is_public} onCheckedChange={(v) => set("is_public", v)} /><Label htmlFor="pk-pub">Show on the public pricing page</Label></div>
          <div className="flex items-center gap-2"><Switch id="pk-rec" checked={p.is_recommended} onCheckedChange={(v) => set("is_recommended", v)} /><Label htmlFor="pk-rec">Recommended</Label></div>
          <div className="flex items-center gap-2"><Switch id="pk-act" checked={p.is_active} onCheckedChange={(v) => set("is_active", v)} /><Label htmlFor="pk-act">Active (can be bought)</Label></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="pk-why">Reason for this change (kept in the billing history)</Label><Input id="pk-why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={savePlan.isPending || reason.trim().length < 5 || !p.name.trim() || !/^[a-z0-9_]{2,30}$/.test(p.code)} onClick={save}>{savePlan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save package</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Packages = () => {
  const plans = usePlatformPlans();
  const changes = useBillingChanges();
  const [editing, setEditing] = useState<PlanFull | "new" | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-heading text-2xl font-bold">Pricing and packages</h1>
          <p className="text-sm text-muted-foreground">What customers can buy. The checkout always uses the price saved here, read on the server at the moment of purchase.</p></div>
        <Button onClick={() => setEditing("new")}><Plus className="mr-2 h-4 w-4" aria-hidden /> New package</Button>
      </div>
      {plans.isLoading && <LoadingRows rows={3} />}
      {plans.isError && <ErrorBox message={errMsg(plans.error)} onRetry={() => plans.refetch()} />}
      <div className="grid gap-4 md:grid-cols-2">
        {(plans.data ?? []).map((p) => (
          <Panel key={p.id} title={p.name} icon={Tags}>
            <p className="text-sm text-muted-foreground">{p.description}</p>
            <p className="mt-2 font-heading text-xl font-bold">{priceText(p.monthly_price, p.currency)}<span className="text-xs font-normal text-muted-foreground"> / month</span>
              {p.annual_price != null && <span className="ml-3 text-base">{priceText(p.annual_price, p.currency)}<span className="text-xs font-normal text-muted-foreground"> / year</span></span>}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{p.student_limit ? `${p.student_limit} students` : "Unlimited students"}</span><span>{p.staff_limit ? `${p.staff_limit} staff` : "Unlimited staff"}</span>
              {p.trial_days > 0 && <span>{p.trial_days}-day trial</span>}
              <span className="inline-flex items-center gap-1">{p.is_public ? <><Eye className="h-3.5 w-3.5" aria-hidden /> Public</> : <><EyeOff className="h-3.5 w-3.5" aria-hidden /> Not on the pricing page</>}</span>
              <span className={p.is_active ? "text-success" : "text-destructive"}>{p.is_active ? "Active" : "Inactive"}</span>{p.is_recommended && <span className="text-primary">Recommended</span>}
            </p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
          </Panel>
        ))}
      </div>
      <Panel title="Billing change history" icon={History}>
        {(changes.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
        <ol className="space-y-2 text-sm">
          {(changes.data ?? []).map((c) => (
            <li key={c.id} className="border-b border-border pb-2 last:border-0">
              <div className="flex flex-wrap justify-between gap-2"><span className="font-medium capitalize">{c.kind.replace("_", " ")}{c.subject ? ` · ${c.subject}` : ""}</span><span className="text-xs text-muted-foreground">{stamp(c.at)} · {c.actor_label}</span></div>
              {c.reason && <p className="text-muted-foreground">{c.reason}</p>}
            </li>
          ))}
        </ol>
      </Panel>
      {editing && <PlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
};

const SettingsForm = ({ initial }: { initial: BillingSettings }) => {
  const { toast } = useToast();
  const { saveSettings } = useBillingActions();
  const [s, setS] = useState({ ...initial, reminders: initial.reminder_days.join(", ") });
  const [reason, setReason] = useState("");
  const set = (k: keyof BillingSettings | "reminders", v: string | number) => setS((x) => ({ ...x, [k]: v }));
  const days = s.reminders.split(",").map((x) => x.trim()).filter(Boolean).map(Number);
  const daysOk = days.length > 0 && days.length <= 8 && days.every((d) => Number.isInteger(d) && d >= -30 && d <= 90);
  const save = async () => {
    try {
      await saveSettings.mutateAsync({ ...s, reminder_days: days, tax_rate_percent: Number(s.tax_rate_percent), grace_days: Number(s.grace_days), reason: reason.trim() });
      toast({ title: "Settings saved" }); setReason("");
    } catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
  };
  return (
    <Panel title="Billing and business settings" icon={Settings}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="bs-name">Business name</Label><Input id="bs-name" value={s.business_name} onChange={(e) => set("business_name", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="bs-mail">Support email</Label><Input id="bs-mail" type="email" value={s.support_email ?? ""} onChange={(e) => set("support_email", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="bs-phone">Support phone</Label><Input id="bs-phone" value={s.support_phone ?? ""} onChange={(e) => set("support_phone", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="bs-terms">Terms and Conditions link</Label><Input id="bs-terms" value={s.terms_url ?? ""} onChange={(e) => set("terms_url", e.target.value)} placeholder="https://" /></div>
        <div className="space-y-1.5"><Label htmlFor="bs-priv">Privacy Policy link</Label><Input id="bs-priv" value={s.privacy_url ?? ""} onChange={(e) => set("privacy_url", e.target.value)} placeholder="https://" /></div>
        <div className="space-y-1.5"><Label htmlFor="bs-tax">Tax rate, % (0 = none)</Label><Input id="bs-tax" inputMode="decimal" value={String(s.tax_rate_percent)} onChange={(e) => set("tax_rate_percent", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="bs-taxl">Tax label</Label><Input id="bs-taxl" value={s.tax_label} onChange={(e) => set("tax_label", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="bs-grace">Grace period, days after expiry</Label><Input id="bs-grace" inputMode="numeric" value={String(s.grace_days)} onChange={(e) => set("grace_days", e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="bs-rem">Reminder days relative to expiry (comma separated; 7 = a week before, 0 = on the day, -3 = three days after)</Label>
          <Input id="bs-rem" value={s.reminders} onChange={(e) => set("reminders", e.target.value)} aria-invalid={!daysOk} />{!daysOk && <p role="alert" className="text-xs text-destructive">Use up to 8 whole numbers between -30 and 90.</p>}</div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="bs-canc">Cancellation and renewal text (shown at checkout)</Label><Textarea id="bs-canc" rows={3} value={s.cancellation_text} onChange={(e) => set("cancellation_text", e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="bs-ref">Refund policy text</Label><Textarea id="bs-ref" rows={2} value={s.refund_text} onChange={(e) => set("refund_text", e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="bs-why">Reason for the change</Label><Input id="bs-why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></div>
      </div>
      <Button className="mt-4" disabled={saveSettings.isPending || reason.trim().length < 5 || !daysOk} onClick={save}>{saveSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save settings</Button>
    </Panel>
  );
};

const PlatformPackagesPage = ({ view }: { view: "packages" | "settings" }) => {
  const settings = useBillingSettings();
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        {view === "packages" ? <Packages /> : (
          <>
            <div><h1 className="font-heading text-2xl font-bold">Platform settings</h1>
              <p className="text-sm text-muted-foreground">Business details, tax, grace period and reminder timing. Every change is recorded with your reason.</p></div>
            {settings.isLoading && <LoadingRows rows={3} />}
            {settings.isError && <ErrorBox message={errMsg(settings.error)} onRetry={() => settings.refetch()} />}
            {settings.data && <SettingsForm key={JSON.stringify(settings.data)} initial={settings.data} />}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PlatformPackagesPage;
