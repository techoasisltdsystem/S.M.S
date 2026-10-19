import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Copy, GraduationCap, HeartPulse, Loader2, Plus, School, ShieldCheck, Users } from "lucide-react";
import { db } from "@/lib/db";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import { Panel, EmptyState } from "@/components/kit/Panel";
import BarChart from "@/components/kit/BarChart";
import Donut from "@/components/kit/Donut";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { relative } from "@/hooks/useSchoolData";

interface Overview {
  schools: number; schools_active: number; schools_suspended: number; schools_new_30d: number;
  people: Record<string, number>; invited: number; signins_7d: number;
  schools_by_month: { month: string; count: number }[];
}
interface SchoolRow {
  id: string; name: string; slug: string; status: "active" | "suspended"; created_at: string;
  admins: number; teachers: number; students: number; parents: number; invited: number; last_activity: string | null;
}

const inviteLink = (token: string) => `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Tech Oasis staff manage schools and their access here. Only counts are
// shown: the database gives platform administrators no view of pupils' records.
const PlatformPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<SchoolRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ link: string; school: string } | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", slugEdited: false, adminName: "", adminEmail: "" });

  const overview = useQuery({
    queryKey: ["platform-overview"],
    queryFn: async () => {
      const { data, error } = await db.rpc("platform_overview");
      if (error) throw new Error(error.message);
      return data as unknown as Overview;
    },
  });
  const schools = useQuery({
    queryKey: ["platform-schools"],
    queryFn: async () => {
      const { data, error } = await db.rpc("platform_schools");
      if (error) throw new Error(error.message);
      return (data ?? []) as SchoolRow[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["platform-overview"] }).then(() => qc.invalidateQueries({ queryKey: ["platform-schools"] }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await db.rpc("platform_create_school", {
      _name: form.name, _slug: form.slug, _admin_name: form.adminName, _admin_email: form.adminEmail,
    });
    setBusy(false);
    if (error) return toast({ title: "Could not create the school", description: error.message, variant: "destructive" });
    setCreating(false);
    setIssued({ link: inviteLink((data as unknown as { token: string }).token), school: form.name });
    setForm({ name: "", slug: "", slugEdited: false, adminName: "", adminEmail: "" });
    void refresh();
  };

  const changeStatus = async () => {
    if (!target) return;
    setBusy(true);
    const next = target.status === "active" ? "suspended" : "active";
    const { error } = await db.rpc("set_school_status", { _school: target.id, _status: next, _reason: reason });
    setBusy(false);
    if (error) return toast({ title: "Could not change the school's status", description: error.message, variant: "destructive" });
    toast({ title: next === "suspended" ? `${target.name} suspended` : `${target.name} restored`, description: "The reason is kept in the audit log." });
    setTarget(null);
    setReason("");
    void refresh();
  };

  const o = overview.data;
  const err = overview.error || schools.error;
  const roleTotal = (o ? Object.values(o.people).reduce((a, b) => a + b, 0) : 0);

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Platform Console</h1>
          <p className="text-sm text-muted-foreground">Registered schools and who can use them. Pupil records are not visible here.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> Register a school</Button>
      </div>

      {err ? (
        <Panel title="Platform" icon={AlertTriangle}>
          <EmptyState icon={AlertTriangle} title="Could not load the platform figures" text={(err as Error).message} />
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {overview.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[108px]" />) : (
              <>
                <KitStat icon={School} label="Schools" value={o!.schools} sub={`${o!.schools_new_30d} new in the last 30 days`} />
                <KitStat icon={ShieldCheck} tone="success" label="Active" value={o!.schools_active} sub={`${o!.schools_suspended} suspended`} meter={o!.schools ? (o!.schools_active / o!.schools) * 100 : 0} />
                <KitStat icon={GraduationCap} tone="info" label="Students" value={o!.people.student ?? 0} sub="Across all schools" />
                <KitStat icon={Users} tone="warning" label="Sign-ins (7 days)" value={o!.signins_7d} sub={`${o!.invited} people invited, not yet joined`} />
              </>
            )}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="New schools by month" icon={Building2} className="lg:col-span-2">
              {overview.isLoading ? <Skeleton className="h-40" /> : (
                <BarChart height={150} bars={o!.schools_by_month.map((m) => ({ label: m.month, values: [m.count] }))} series={[{ name: "Schools registered", color: "hsl(var(--primary))" }]} />
              )}
            </Panel>
            <Panel title="People on the platform" icon={Users}>
              {roleTotal === 0 ? <EmptyState icon={Users} title="No active people yet" /> : (
                <Donut size={120} segments={[
                  { label: "Administrators", value: o!.people.school_admin ?? 0, color: "hsl(var(--primary))" },
                  { label: "Teachers", value: o!.people.teacher ?? 0, color: "hsl(var(--info))" },
                  { label: "Students", value: o!.people.student ?? 0, color: "hsl(var(--success))" },
                  { label: "Parents", value: o!.people.parent ?? 0, color: "hsl(var(--warning))" },
                  { label: "Finance and audit", value: (o!.people.finance_officer ?? 0) + (o!.people.auditor ?? 0), color: "hsl(var(--muted-foreground) / 0.5)" },
                ]} />
              )}
            </Panel>
          </div>

          <Panel title="Schools" icon={School} className="mb-6">
            {schools.isLoading ? <Skeleton className="h-32" /> : (schools.data ?? []).length === 0 ? (
              <EmptyState icon={School} title="No schools registered" text="Register the first school to send its administrator an invitation." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2">School</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Admins</th><th className="px-3 py-2">Teachers</th>
                    <th className="px-3 py-2">Students</th><th className="px-3 py-2">Parents</th><th className="px-3 py-2">Invited</th><th className="px-3 py-2">Last activity</th><th className="px-3 py-2" />
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {schools.data!.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2.5"><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.slug}</p></td>
                        <td className="px-3 py-2.5"><span className={s.status === "active" ? "rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success" : "rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"}>{s.status === "active" ? "Active" : "Suspended"}</span></td>
                        <td className="px-3 py-2.5">{s.admins}</td><td className="px-3 py-2.5">{s.teachers}</td><td className="px-3 py-2.5">{s.students}</td>
                        <td className="px-3 py-2.5">{s.parents}</td><td className="px-3 py-2.5">{s.invited}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{s.last_activity ? relative(s.last_activity) : "None yet"}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="outline" onClick={() => { setTarget(s); setReason(""); }}>{s.status === "active" ? "Suspend" : "Restore"}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Not built yet" icon={HeartPulse}>
            <p className="text-sm text-muted-foreground">
              Service health, subscriptions and plan entitlements, school approval documents and support tickets are not part of this phase. This console shows only what the database can prove today; nothing here is a placeholder figure.
            </p>
          </Panel>
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Register a school</DialogTitle>
              <DialogDescription>Creates the school and an invitation for its first administrator.</DialogDescription>
            </DialogHeader>
            <div className="my-4 grid gap-3">
              <div><Label htmlFor="sn">School name</Label>
                <Input id="sn" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slugEdited ? form.slug : slugify(e.target.value) })} /></div>
              <div><Label htmlFor="ss">Short name (used in the school's address)</Label>
                <Input id="ss" required value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value), slugEdited: true })} /></div>
              <div><Label htmlFor="an">Administrator's name</Label>
                <Input id="an" required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} /></div>
              <div><Label htmlFor="ae">Administrator's email</Label>
                <Input id="ae" type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create school</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.status === "active" ? "Suspend" : "Restore"} {target?.name}?</DialogTitle>
            <DialogDescription>
              {target?.status === "active"
                ? "People can still sign in and read their records, but nobody can change anything until the school is restored. Nothing is deleted."
                : "The school returns to normal use."}
            </DialogDescription>
          </DialogHeader>
          <div className="my-3"><Label htmlFor="why">Reason (kept in the audit log)</Label>
            <Input id="why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: subscription unpaid since 1 October" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant={target?.status === "active" ? "destructive" : "default"} disabled={busy || !reason.trim()} onClick={changeStatus}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{target?.status === "active" ? "Suspend school" : "Restore school"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{issued?.school} is registered</DialogTitle>
            <DialogDescription>Send this single-use link to the administrator. It is shown once and expires in 7 days.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={issued?.link ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
            <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(issued!.link); toast({ title: "Link copied" }); }} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PlatformPage;
