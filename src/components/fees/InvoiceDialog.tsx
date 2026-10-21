import { useState } from "react";
import { Download, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PayOnline from "@/components/fees/PayOnline";
import { useQueryClient } from "@tanstack/react-query";
import { authHeader } from "@/lib/db";
import { rpc } from "@/lib/rpc";
import { useFeeSettings } from "@/hooks/useFeeAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { useToast } from "@/hooks/use-toast";
import { METHODS, methodLabel, money, useFeeActions, useInvoice, type InvoiceStatus } from "@/hooks/useFees";
import { invoicePdf, receiptPdf } from "@/lib/reports";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<InvoiceStatus, string> = { unpaid: "Unpaid", part_paid: "Part paid", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled" };
export const StatusChip = ({ status }: { status: InvoiceStatus }) => (
  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium",
    status === "paid" ? "bg-success/10 text-success" : status === "overdue" ? "bg-destructive/10 text-destructive" : status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-warning/15 text-warning")}>
    {STATUS_LABEL[status]}
  </span>
);
const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);

/** One invoice with its payments. Staff actions appear only if the database says the caller may do them. */
const InvoiceDialog = ({ schoolId, id, onClose }: { schoolId: string; id: string | null; onClose: () => void }) => {
  const { toast } = useToast();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const settings = useFeeSettings(user?.schoolId);
  const q = useInvoice(id);
  const { recordPayment, voidPayment, cancelInvoice } = useFeeActions(schoolId);
  const [pay, setPay] = useState({ amount: "", method: "cash", reference: "", paidOn: today(), note: "" });
  const [voiding, setVoiding] = useState<{ id: string; receipt: string } | null>(null);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [refunding, setRefunding] = useState<{ id: string; receipt: string } | null>(null);
  const [adj, setAdj] = useState({ kind: "discount", amount: "", reason: "" });
  const [working, setWorking] = useState(false);
  const refresh = () => { ["invoice", "invoices", "fee-summary", "fee-orders", "fee-refunds", "fee-report"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const act = async (fn: () => Promise<unknown>, ok: string, done?: () => void) => {
    setWorking(true);
    try { await fn(); toast({ title: ok }); refresh(); done?.(); }
    catch (e) { toast({ title: "Not done", description: errMsg(e), variant: "destructive" }); }
    finally { setWorking(false); }
  };
  const refund = async () => {
    const auth = await authHeader();
    const res = await fetch("/api/billing/fee-refund", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ payment: refunding!.id, reason }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "The refund could not be started.");
    if (j.status === "failed") throw new Error(j.error ?? "Paystack could not refund it. It is recorded and can be retried from Online payments.");
    return j;
  };
  const d = q.data;
  const cur = d?.school.currency ?? "GHS";

  const record = async () => {
    try {
      const r = await recordPayment.mutateAsync({ invoice: id!, amount: Number(pay.amount), method: pay.method, reference: pay.reference.trim(), paidOn: pay.paidOn, note: pay.note.trim() });
      toast({ title: "Payment recorded", description: `Receipt ${r.receipt}. Balance ${money(r.balance, cur)}.` });
      setPay({ amount: "", method: "cash", reference: "", paidOn: today(), note: "" });
    } catch (e) {
      toast({ title: "Payment not recorded", description: errMsg(e), variant: "destructive" });
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ title: ok }); setVoiding(null); setCancelling(false); setReason(""); } catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
  };

  const amountOk = Number(pay.amount) > 0 && d && Number(pay.amount) <= d.invoice.balance + 0.0001;

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {q.isLoading && <LoadingRows rows={4} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {d && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-heading">{d.invoice.number} <StatusChip status={d.invoice.status} /></DialogTitle>
              <DialogDescription>{d.invoice.title} · {d.student.name}{d.student.class ? ` · ${d.student.class}` : ""} · due {day(d.invoice.due_on)}</DialogDescription>
            </DialogHeader>

            <table className="w-full text-sm">
              <tbody>
                {d.lines.map((l, i) => <tr key={i} className="border-b border-border"><td className="py-1.5">{l.description}</td><td className="py-1.5 text-right">{money(l.amount, cur)}</td></tr>)}
                <tr><td className="py-1.5 font-semibold">Total</td><td className="py-1.5 text-right font-semibold">{money(d.invoice.total, cur)}</td></tr>
                <tr><td className="py-1 text-muted-foreground">Paid</td><td className="py-1 text-right text-muted-foreground">{money(d.invoice.paid, cur)}</td></tr>
                <tr><td className="py-1 font-semibold">Balance</td><td className="py-1 text-right font-semibold">{money(d.invoice.balance, cur)}</td></tr>
              </tbody>
            </table>
            {d.invoice.cancel_reason && <p className="text-xs text-muted-foreground">Cancelled: {d.invoice.cancel_reason}</p>}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments</p>
              {d.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet.</p> : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {d.payments.map((p) => (
                    <li key={p.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-sm", p.status === "voided" && "opacity-60")}>
                      <span className="min-w-0 flex-1">
                        <span className={cn("font-medium", p.status === "voided" && "line-through")}>{p.receipt}</span> · {money(p.amount, cur)} · {methodLabel(p.method)}{p.reference ? ` (${p.reference})` : ""}
                        <span className="block text-xs text-muted-foreground">{day(p.paid_on)}{p.recorded_by ? ` · recorded by ${p.recorded_by}` : ""}{p.status === "voided" ? ` · voided: ${p.void_reason}` : ""}{p.status === "pending" ? " · waiting for approval, not counted as paid" : ""}</span>
                      </span>
                      {p.status === "recorded" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => { try { receiptPdf(d, p.receipt); } catch (e) { toast({ title: "Could not create the receipt", description: errMsg(e), variant: "destructive" }); } }}>
                            <Receipt className="mr-1 h-3.5 w-3.5" /> Receipt
                          </Button>
                          {d.can_void && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setReason(""); setRefunding(null); setVoiding({ id: p.id, receipt: p.receipt }); }}>Void</Button>}
                          {can("payments.refund") && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setReason(""); setVoiding(null); setRefunding({ id: p.id, receipt: p.receipt }); }}>Refund</Button>}
                        </>
                      )}
                      {p.status === "pending" && can("payments.approve") && (
                        <>
                          <Button size="sm" disabled={working} onClick={() => void act(() => rpc("review_payment", { _payment: p.id, _approve: true, _reason: null }), "Payment approved")}>Approve</Button>
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={working} onClick={() => { const why = window.prompt("Why is this payment being rejected? (at least 5 characters)"); if (why) void act(() => rpc("review_payment", { _payment: p.id, _approve: false, _reason: why }), "Payment rejected"); }}>Reject</Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(user?.role === "parent" || (user?.role === "student" && settings.data?.student_pay)) && d.invoice.status !== "cancelled" && d.invoice.balance > 0 && <PayOnline invoiceId={d.invoice.id} balance={d.invoice.balance} currency={cur} />}

            {d.can_record && d.invoice.status !== "cancelled" && d.invoice.balance > 0 && (
              <form className="space-y-3 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); void record(); }}>
                <p className="text-sm font-semibold">Record a payment</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="pay-amt">Amount</Label><Input id="pay-amt" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} aria-invalid={!!pay.amount && !amountOk} /></div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pay-method">Method</Label>
                    <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
                      <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                      <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="pay-date">Date paid</Label><Input id="pay-date" type="date" max={today()} value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pay-ref">Reference (optional)</Label><Input id="pay-ref" maxLength={80} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
                </div>
                {pay.amount && !amountOk && <p role="alert" className="text-xs text-destructive">Enter an amount up to the balance of {money(d.invoice.balance, cur)}.</p>}
                <Button type="submit" disabled={!amountOk || recordPayment.isPending}>{recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Record payment</Button>
              </form>
            )}

            {user?.role === "student" && !settings.data?.student_pay && d.invoice.balance > 0 && d.invoice.status !== "cancelled" && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Ask your parent or guardian to pay this invoice from their account, or pay at the school office. The school records every payment here.</p>
            )}

            {can("fees.adjust") && d.invoice.status !== "cancelled" && (
              <form className="space-y-3 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); void act(() => rpc("apply_fee_adjustment", { _invoice: id, _kind: adj.kind, _amount: Number(adj.amount), _reason: adj.reason }), "Adjustment applied", () => setAdj({ kind: "discount", amount: "", reason: "" })); }}>
                <p className="text-sm font-semibold">Adjust this invoice</p>
                <p className="text-xs text-muted-foreground">Discounts, scholarships and waivers lower the total; a charge raises it. Each is kept as its own record with your name and reason, and payments already made are never changed.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="adj-kind">Type</Label>
                    <select id="adj-kind" value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="discount">Discount</option><option value="scholarship">Scholarship</option><option value="waiver">Waiver</option><option value="charge">Extra charge</option></select></div>
                  <div className="space-y-1.5"><Label htmlFor="adj-amt">Amount</Label><Input id="adj-amt" inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="adj-why">Reason</Label><Input id="adj-why" maxLength={140} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></div>
                <Button type="submit" variant="outline" disabled={working || !(Number(adj.amount) > 0) || adj.reason.trim().length < 5}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Apply adjustment</Button>
              </form>
            )}

            {refunding && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <Label htmlFor="refund-reason">Refund {refunding.receipt}? The payment is reversed on the invoice at once. Online payments are returned to the payer through Paystack. Why? (at least 5 characters)</Label>
                <Textarea id="refund-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={working || reason.trim().length < 5} onClick={() => void act(refund, "Refund recorded", () => { setRefunding(null); setReason(""); })}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Refund payment</Button>
                  <Button size="sm" variant="outline" onClick={() => setRefunding(null)}>Back</Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => invoicePdf(d)}><Download className="mr-1 h-4 w-4" /> Download invoice (PDF)</Button>
              {d.can_cancel && d.invoice.status !== "cancelled" && !d.payments.some((p) => p.status === "recorded") && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setReason(""); setCancelling(true); }}>Cancel invoice</Button>
              )}
            </div>

            {(voiding || cancelling) && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <Label htmlFor="fee-reason">{voiding ? `Why is ${voiding.receipt} being voided? (at least 10 characters)` : "Why is this invoice being cancelled?"}</Label>
                <Textarea id="fee-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" disabled={reason.trim().length < (voiding ? 10 : 5)}
                    onClick={() => voiding ? run(() => voidPayment.mutateAsync({ id: voiding.id, reason: reason.trim() }), "Payment voided") : run(() => cancelInvoice.mutateAsync({ id: id!, reason: reason.trim() }), "Invoice cancelled")}>
                    {voiding ? "Void payment" : "Cancel invoice"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setVoiding(null); setCancelling(false); }}>Keep it</Button>
                </div>
                <p className="text-xs text-muted-foreground">Recorded in the audit log. Nothing is deleted.</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceDialog;
