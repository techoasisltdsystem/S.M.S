import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth, MEMBER_ROLE_LABEL } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { changeMyPassword, signIn } from "@/lib/db";
import { rpc } from "@/lib/rpc";

interface Details {
  name: string; email: string; phone: string | null; address: string | null; date_of_birth: string | null; emergency_contact: string | null;
  gender: string | null; admission_number: string | null; status: string; member_since: string; roles: string[]; school: string;
  class: string | null; teaches: { class: string; subject: string }[]; children: { name: string; relationship: string | null; verified: boolean }[];
}

const day = (d: string | null) => (d ? new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not given");
const initials = (n: string) => n.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex flex-wrap justify-between gap-2 border-b border-border py-2.5 text-sm last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
);

const PasswordForm = () => {
  const { toast } = useToast();
  const { clearMustChangePassword } = useAuth();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (f.next.length < 8) return setErr("Use at least 8 characters for the new password.");
    if (f.next !== f.confirm) return setErr("The two new passwords do not match.");
    setBusy(true);
    try { await changeMyPassword(f.current, f.next); toast({ title: "Password changed", description: "Other devices have been signed out." }); clearMustChangePassword(); setF({ current: "", next: "", confirm: "" }); }
    catch (e2) { setErr(errMsg(e2)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {(["current", "next", "confirm"] as const).map((k) => (
        <div key={k} className="space-y-1.5">
          <Label htmlFor={`pw-${k}`}>{k === "current" ? "Current password" : k === "next" ? "New password" : "Confirm new password"}</Label>
          <Input id={`pw-${k}`} type={show ? "text" : "password"} autoComplete={k === "current" ? "current-password" : "new-password"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <button type="button" onClick={() => setShow(!show)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? "Hide" : "Show"} passwords</button>
      {err && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={busy || !f.current || !f.next}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Change password</Button>
    </form>
  );
};

/** Super Admin only: their own name and the email they sign in with. The password is re-checked before the email changes. */
const PlatformAccount = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["platform-me"], queryFn: () => rpc<{ user_id: string; email: string; full_name: string | null }[]>("platform_admin_me").then((r) => r[0]) });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me.data) { setName(me.data.full_name ?? ""); setEmail(me.data.email); } }, [me.data]);
  if (!me.data) return me.isError ? <ErrorBox message={errMsg(me.error)} onRetry={() => me.refetch()} /> : <LoadingRows rows={2} />;
  const nameDirty = name.trim() !== (me.data.full_name ?? "");
  const emailDirty = email.trim().toLowerCase() !== me.data.email.toLowerCase();
  const saveName = async () => {
    try { await rpc("platform_admin_set_my_name", { _name: name }); toast({ title: "Name saved" }); void qc.invalidateQueries({ queryKey: ["platform-me"] }); }
    catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
  };
  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      try { await signIn(me.data!.email, pw); } catch { throw new Error("That password is not correct."); }
      await rpc("platform_admin_change_my_email", { _email: email });
      toast({ title: "Sign-in email changed", description: "Use " + email.trim().toLowerCase() + " next time you sign in." });
      setPw(""); void qc.invalidateQueries({ queryKey: ["platform-me"] });
    } catch (e2) { setErr(errMsg(e2)); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5"><Label htmlFor="pa-me-name">Your name</Label><Input id="pa-me-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="button" variant="outline" disabled={!nameDirty || name.trim().length < 2} onClick={saveName}>Save name</Button>
      </div>
      <form onSubmit={changeEmail} className="space-y-3" noValidate>
        <div className="space-y-1.5"><Label htmlFor="pa-me-email">Sign-in email</Label><Input id="pa-me-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {emailDirty && (
          <div className="space-y-1.5"><Label htmlFor="pa-me-pw">Current password (to confirm it is you)</Label><Input id="pa-me-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        )}
        {err && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
        <Button type="submit" disabled={busy || !emailDirty || !pw || !/^[^@s]+@[^@s]+.[^@s]+$/.test(email.trim())}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Change sign-in email</Button>
      </form>
    </div>
  );
};

/** Everything about the signed-in person, and the parts they may change. */
const ProfilePage = () => {
  const { user, isPlatform, logout, mustChangePassword } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sid = user && !isPlatform ? user.schoolId : "";
  const q = useQuery({ queryKey: ["my-profile", sid], enabled: !!sid, queryFn: () => rpc<Details>("my_profile_details", { _school: sid }) });
  const d = q.data;
  const [f, setF] = useState({ name: "", phone: "", address: "", dob: "", emergency: "" });
  useEffect(() => { if (d) setF({ name: d.name, phone: d.phone ?? "", address: d.address ?? "", dob: d.date_of_birth?.slice(0, 10) ?? "", emergency: d.emergency_contact ?? "" }); }, [d]);
  const save = useMutation({
    mutationFn: () => rpc("update_my_profile", { _school: sid, _full_name: f.name, _phone: f.phone, _address: f.address, _date_of_birth: f.dob || null, _emergency_contact: f.emergency }),
    onSuccess: () => { toast({ title: "Profile saved" }); void qc.invalidateQueries({ queryKey: ["my-profile"] }); },
    onError: (e) => toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }),
  });
  const dirty = !!d && (f.name !== d.name || f.phone !== (d.phone ?? "") || f.address !== (d.address ?? "") || f.dob !== (d.date_of_birth?.slice(0, 10) ?? "") || f.emergency !== (d.emergency_contact ?? ""));
  const roleLabel = user ? MEMBER_ROLE_LABEL[user.memberRole] : "";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-5">
        {mustChangePassword && (
          <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">You are using a temporary password. Choose your own below to continue; the rest of the site opens once you have.</p>
        )}
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-card">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground" aria-hidden>{initials(d?.name ?? user?.name ?? "?")}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-2xl font-bold">{d?.name ?? user?.name}</h1>
            <p className="text-sm text-muted-foreground">{roleLabel}{d ? ` · ${d.school}` : ""}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Mail className="h-4 w-4" aria-hidden /> {d?.email ?? user?.email}</p>
          </div>
          <Button variant="outline" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out</Button>
        </section>

        {q.isLoading && <LoadingRows rows={4} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}

        {d && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Your details" icon={UserRound} className="lg:col-span-2">
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4 sm:grid-cols-2" noValidate>
                <div className="space-y-1.5"><Label htmlFor="pf-name">Full name</Label><Input id="pf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></div>
                <div className="space-y-1.5"><Label htmlFor="pf-email">Email (set by your school)</Label><Input id="pf-email" value={d.email} disabled /></div>
                <div className="space-y-1.5"><Label htmlFor="pf-phone">Phone</Label><Input id="pf-phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></div>
                <div className="space-y-1.5"><Label htmlFor="pf-dob">Date of birth</Label><Input id="pf-dob" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pf-addr">Address</Label><Input id="pf-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pf-emg">Emergency contact</Label><Input id="pf-emg" value={f.emergency} onChange={(e) => setF({ ...f, emergency: e.target.value })} maxLength={200} placeholder="Name and phone number" /></div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={!dirty || save.isPending || f.name.trim().length < 2}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save changes</Button>
                  <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setF({ name: d.name, phone: d.phone ?? "", address: d.address ?? "", dob: d.date_of_birth?.slice(0, 10) ?? "", emergency: d.emergency_contact ?? "" })}>Undo</Button>
                </div>
              </form>
            </Panel>

            <Panel title="Your account" icon={ShieldCheck}>
              <dl>
                <Row k="Role" v={roleLabel} /><Row k="School" v={d.school} /><Row k="Status" v={<span className="capitalize">{d.status}</span>} />
                <Row k="Member since" v={day(d.member_since)} />
                {d.gender && <Row k="Gender" v={<span className="capitalize">{d.gender}</span>} />}
                {d.admission_number && <Row k="Admission number" v={d.admission_number} />}
                {d.class && <Row k="Class" v={d.class} />}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">Your email, role and status are managed by your school administrator.</p>
            </Panel>

            <Panel title="Change password" icon={KeyRound}><PasswordForm /></Panel>

            {d.teaches.length > 0 && (
              <Panel title="What you teach" className="lg:col-span-2">
                <ul className="grid gap-2 sm:grid-cols-2">{d.teaches.map((t, i) => <li key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-sm"><span className="font-medium">{t.subject}</span> <span className="text-muted-foreground">· {t.class}</span></li>)}</ul>
              </Panel>
            )}
            {d.children.length > 0 && (
              <Panel title="Your children" className="lg:col-span-2">
                <ul className="divide-y divide-border">{d.children.map((c, i) => <li key={i} className="flex justify-between gap-2 py-2 text-sm"><span className="font-medium">{c.name}</span><span className="text-muted-foreground">{c.relationship ?? "Guardian"}{c.verified ? "" : " · awaiting verification"}</span></li>)}</ul>
              </Panel>
            )}
          </div>
        )}

        {isPlatform && (
<>
          <Panel title="Platform administrator" icon={ShieldCheck}>
            <p className="mb-4 text-sm text-muted-foreground">Platform accounts have no school profile. Changing your password signs your other devices out.</p>
            <PlatformAccount />
          </Panel>
          <Panel title="Change password" icon={KeyRound} className="mt-5">
            <PasswordForm />
          </Panel>
</>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
