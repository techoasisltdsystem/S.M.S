import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, Lock, RefreshCw } from "lucide-react";
import { Panel } from "@/components/kit/Panel";
import OrderSummary from "@/components/billing/OrderSummary";
import { IntervalToggle, priceFor } from "@/components/billing/PricingCards";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  beginPayment, day, money, priceText, saveDraft, startOrder, stamp, useMyBilling, usePricing,
  type Interval, type MyOrder, type OrderStart,
} from "@/hooks/useBilling";
import { billingReceiptPdf } from "@/lib/billingReceipt";
import { cn } from "@/lib/utils";

export const STATE_TEXT: Record<string, { label: string; tone: string }> = {
  trial: { label: "Free trial", tone: "bg-primary/10 text-primary" },
  active: { label: "Active", tone: "bg-success/10 text-success" },
  renewal_due: { label: "Renewal due", tone: "bg-warning/15 text-warning" },
  past_due: { label: "Past due", tone: "bg-destructive/10 text-destructive" },
  expired: { label: "Expired", tone: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
  suspended: { label: "Suspended", tone: "bg-destructive/10 text-destructive" },
  none: { label: "No subscription", tone: "bg-muted text-muted-foreground" },
};
export const StatePill = ({ label }: { label: string }) => {
  const s = STATE_TEXT[label] ?? { label, tone: "bg-muted text-muted-foreground" };
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium", s.tone)}>{s.label}</span>;
};

const ORDER_TEXT: Record<string, string> = { created: "Not paid", pending: "Awaiting payment", paid: "Paid", failed: "Failed", abandoned: "Cancelled", mismatch: "Under review", refunded: "Refunded" };

/** Renew or change the package, and see every payment. Prices come from the server; the amount shown here is read back from the order. */
const BillingPanel = ({ schoolId, currentPlan }: { schoolId: string; currentPlan?: string }) => {
  const { toast } = useToast();
  const nav = useNavigate();
  const pricing = usePricing();
  const billing = useMyBilling(schoolId, true);
  const [interval, setInterval] = useState<Interval>("monthly");
  const [target, setTarget] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderStart | null>(null);
  const [busy, setBusy] = useState(false);
  const plans = pricing.data?.plans ?? [];
  const settings = billing.data?.settings ?? pricing.data?.settings;

  const prepare = async (code: string) => {
    if (busy) return;
    setBusy(true); setTarget(code); setOrder(null);
    try { setOrder(await startOrder({ school: schoolId, plan: code, interval })); }
    catch (e) { toast({ title: "Could not prepare the order", description: errMsg(e), variant: "destructive" }); setTarget(null); }
    finally { setBusy(false); }
  };

  const pay = async () => {
    if (!order || busy) return;
    setBusy(true);
    try {
      saveDraft({ reference: order.reference, claim: order.claim });
      const r = await beginPayment(order.reference, order.claim);
      if (r.mode === "demo") return nav(`/checkout/demo?reference=${order.reference}`);
      if (!r.url) throw new Error("The payment page could not be opened.");
      window.location.assign(r.url);
    } catch (e) {
      toast({ title: "Could not start the payment", description: errMsg(e), variant: "destructive" });
      setBusy(false);
    }
  };

  const receipt = (o: MyOrder) => {
    try { billingReceiptPdf({ ...o, school: billing.data?.school ?? null, interval: o.interval }, settings?.business_name ?? "Tech Oasis", settings?.support_email); }
    catch (e) { toast({ title: "No receipt", description: errMsg(e), variant: "destructive" }); }
  };

  return (
    <>
      <Panel title="Renew or change package" icon={RefreshCw}>
        {pricing.isLoading && <LoadingRows rows={2} />}
        {pricing.isError && <ErrorBox message={errMsg(pricing.error)} onRetry={() => pricing.refetch()} />}
        {plans.length > 0 && (
          <>
            <div className="mb-4"><IntervalToggle value={interval} onChange={setInterval} /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((p) => {
                const price = priceFor(p, interval);
                const mine = p.code === currentPlan;
                return (
                  <div key={p.code} className={cn("flex flex-col rounded-xl border p-4", mine ? "border-primary bg-primary/5" : "border-border")}>
                    <p className="font-heading font-semibold">{p.name}{mine && <span className="ml-2 text-[11px] font-medium text-primary">Your package</span>}</p>
                    <p className="mt-1 text-lg font-bold">{price != null ? priceText(price, p.currency) : "Not offered"}<span className="text-xs font-normal text-muted-foreground"> / {interval === "yearly" ? "year" : "month"}</span></p>
                    <Button className="mt-3" variant={mine ? "default" : "outline"} disabled={price == null || busy} onClick={() => prepare(p.code)}>
                      {busy && target === p.code && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                      {mine ? "Renew" : "Switch to this"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">A renewal extends your current period. A different package starts from your payment and keeps all your records. You are never charged automatically.</p>
          </>
        )}
      </Panel>

      <Dialog open={!!order} onOpenChange={(o) => { if (!o && !busy) { setOrder(null); setTarget(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Confirm and pay</DialogTitle>
            <DialogDescription>Check the order, then continue to the secure payment page.</DialogDescription>
          </DialogHeader>
          {order && <OrderSummary line={order} settings={settings} />}
          <Button size="lg" className="h-12" onClick={pay} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Lock className="mr-2 h-4 w-4" aria-hidden />} Pay securely
          </Button>
        </DialogContent>
      </Dialog>

      <Panel title="Billing history" icon={Download}>
        {billing.isLoading && <LoadingRows rows={3} />}
        {billing.isError && <ErrorBox message={errMsg(billing.error)} onRetry={() => billing.refetch()} />}
        {billing.data && billing.data.orders.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
        {billing.data && billing.data.orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3">Reference</th><th scope="col" className="py-2 pr-3">Package</th><th scope="col" className="py-2 pr-3">Amount</th>
                <th scope="col" className="py-2 pr-3">Status</th><th scope="col" className="py-2 pr-3">Date</th><th scope="col" className="py-2"><span className="sr-only">Receipt</span></th></tr></thead>
              <tbody>
                {billing.data.orders.map((o) => (
                  <tr key={o.reference} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{o.reference}{o.demo && <span className="ml-1 rounded bg-destructive/10 px-1 text-[10px] font-bold text-destructive">DEMO</span>}</td>
                    <td className="py-2 pr-3">{o.plan} <span className="text-xs text-muted-foreground">{o.interval}</span></td>
                    <td className="py-2 pr-3">{money(o.total_minor, o.currency)}</td>
                    <td className="py-2 pr-3">{ORDER_TEXT[o.status] ?? o.status}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{o.paid_at ? stamp(o.paid_at) : stamp(o.created_at)}{o.period_end ? ` · to ${day(o.period_end)}` : ""}</td>
                    <td className="py-2 text-right">{o.status === "paid" && <Button size="sm" variant="outline" onClick={() => receipt(o)}><Download className="mr-1 h-3.5 w-3.5" aria-hidden /> Receipt</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {settings && <p className="mt-3 text-xs text-muted-foreground">{settings.refund_text}{settings.support_email ? ` Questions: ${settings.support_email}.` : ""}</p>}
      </Panel>
    </>
  );
};

export default BillingPanel;
