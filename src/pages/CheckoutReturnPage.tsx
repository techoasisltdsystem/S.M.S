import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Download, Loader2, XCircle } from "lucide-react";
import PublicShell from "@/components/billing/PublicShell";
import { Button } from "@/components/ui/button";
import { billingReceiptPdf } from "@/lib/billingReceipt";
import { claimInvite, confirmPayment, day, loadDraft, money, orderStatus, saveDraft, usePricing, type OrderStatus } from "@/hooks/useBilling";
import { errMsg } from "@/components/students/QueryState";

type Phase = "checking" | "paid" | "failed" | "cancelled" | "pending" | "mismatch" | "unknown";

/**
 * Where Paystack (or the demo checkout) sends the buyer back to. The URL is never trusted:
 * the server confirms the payment with Paystack and this page shows what the database says.
 */
const CheckoutReturnPage = () => {
  const [params] = useSearchParams();
  const settings = usePricing().data?.settings;
  const reference = params.get("reference") || params.get("trxref") || loadDraft()?.reference || "";
  const [phase, setPhase] = useState<Phase>("checking");
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const draft = loadDraft();
    if (!reference || !draft || draft.reference !== reference) { setPhase("unknown"); return; }
    let cancelled = false;
    (async () => {
      try {
        let status: string = "pending";
        try { status = (await confirmPayment(reference, draft.claim)).status; } catch (e) { setNote(errMsg(e)); }
        // The webhook can arrive a moment after the redirect, so look a few times before saying "pending".
        for (let i = 0; i < 6 && status !== "paid" && status !== "failed" && status !== "abandoned" && status !== "mismatch" && !cancelled; i++) {
          const s = await orderStatus(reference, draft.claim);
          status = s.status;
          if (status === "pending" || status === "created") await new Promise((r) => setTimeout(r, 2000));
        }
        const s = await orderStatus(reference, draft.claim);
        if (cancelled) return;
        setOrder(s);
        if (s.status === "paid") {
          setPhase("paid");
          if (s.purpose === "new_school") setInvite(await claimInvite(reference, draft.claim));
        } else if (s.status === "failed") setPhase("failed");
        else if (s.status === "abandoned") setPhase("cancelled");
        else if (s.status === "mismatch") setPhase("mismatch");
        else setPhase("pending");
      } catch (e) {
        if (!cancelled) { setNote(errMsg(e)); setPhase("unknown"); }
      }
    })();
    return () => { cancelled = true; };
  }, [reference]);

  const retry = () => { saveDraft(null); };

  return (
    <PublicShell narrow>
      {phase === "checking" && (
        <div className="py-20 text-center" role="status">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
          <h1 className="mt-4 font-heading text-xl font-semibold">Confirming your payment…</h1>
          <p className="mt-1 text-sm text-muted-foreground">Please do not close this page. We are checking with the payment provider.</p>
        </div>
      )}

      {phase === "paid" && order && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8" aria-labelledby="done">
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
            <h1 id="done" className="mt-3 font-heading text-2xl font-bold">{order.demo ? "Demo payment complete" : "Payment confirmed"}</h1>
            {order.demo && <p className="mt-1 text-sm font-semibold text-destructive">This was a demo checkout. No real money moved.</p>}
          </div>
          <dl className="mx-auto mt-6 grid max-w-md gap-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">School</dt><dd className="font-medium">{order.school}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Package</dt><dd className="font-medium">{order.plan} ({order.interval})</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Amount paid</dt><dd className="font-medium">{money(order.total_minor, order.currency)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Payment status</dt><dd className="font-medium text-success">Verified</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Reference</dt><dd className="font-mono text-xs">{order.reference}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Starts</dt><dd className="font-medium">{day(order.period_start)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Next renewal / expiry</dt><dd className="font-medium">{day(order.period_end)}</dd></div>
          </dl>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {order.purpose === "new_school" ? (
              invite
                ? <Button asChild size="lg" className="h-12"><Link to={`/accept-invite?token=${invite}`}>Create your administrator password</Link></Button>
                : <p className="text-center text-sm text-muted-foreground">Your one-time sign-up link has already been used or opened on another device. If you did not finish creating your password, contact support with your reference.</p>
            ) : (
              <Button asChild size="lg" className="h-12"><Link to="/subscription">Back to your subscription</Link></Button>
            )}
            <Button variant="outline" size="lg" className="h-12" onClick={() => { try { billingReceiptPdf(order, settings?.business_name ?? "Tech Oasis", settings?.support_email); } catch (e) { setNote(errMsg(e)); } }}>
              <Download className="mr-2 h-4 w-4" aria-hidden /> Download receipt
            </Button>
          </div>
          {order.purpose === "new_school" && invite && <p className="mt-4 text-center text-xs text-muted-foreground">This link works once and is shown only here. Use it now to set your password, then sign in at the school login.</p>}
          {note && <p role="alert" className="mt-4 text-center text-sm text-destructive">{note}</p>}
        </section>
      )}

      {phase === "failed" && <Result icon={XCircle} tone="bad" title="Payment failed" text={order?.gateway_response ? `The payment provider said: ${order.gateway_response}. You have not been charged for a subscription.` : "The payment did not go through, so nothing was activated."} reference={reference} retry={retry} />}
      {phase === "cancelled" && <Result icon={XCircle} tone="warn" title="Payment cancelled" text="You left the payment page before paying. Nothing was charged and nothing was activated." reference={reference} retry={retry} />}
      {phase === "mismatch" && <Result icon={AlertTriangle} tone="bad" title="We could not match the amount" text="The amount reported did not match your order, so nothing was activated. Please contact support with your reference; if you were charged we will put it right." reference={reference} support={settings?.support_email} />}
      {phase === "pending" && (
        <Result icon={Clock} tone="warn" title="Payment not confirmed yet" text="We have not received confirmation from the payment provider. If you completed the payment, it can take a few minutes. Your plan is activated automatically as soon as it is confirmed. You do not need to pay again." reference={reference} support={settings?.support_email} check />
      )}
      {phase === "unknown" && (
        <Result icon={AlertTriangle} tone="warn" title="We could not find this checkout in your browser"
          text={note ?? "Open this page in the same browser you used to pay, or contact support with your payment reference. If your payment was confirmed, your plan is already active."} reference={reference} support={settings?.support_email} />
      )}
    </PublicShell>
  );
};

const Result = ({ icon: Icon, tone, title, text, reference, retry, support, check }: {
  icon: typeof XCircle; tone: "bad" | "warn"; title: string; text: string; reference: string; retry?: () => void; support?: string | null; check?: boolean;
}) => (
  <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8" role="status">
    <Icon className={`mx-auto h-14 w-14 ${tone === "bad" ? "text-destructive" : "text-warning"}`} aria-hidden />
    <h1 className="mt-3 font-heading text-2xl font-bold">{title}</h1>
    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{text}</p>
    {reference && <p className="mt-3 font-mono text-xs text-muted-foreground">Reference {reference}</p>}
    <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
      {check && <Button size="lg" className="h-12" onClick={() => window.location.reload()}>Check again</Button>}
      {retry && <Button asChild size="lg" className="h-12" onClick={retry}><Link to="/pricing">Choose a package and try again</Link></Button>}
      {support && <Button asChild variant="outline" size="lg" className="h-12"><a href={`mailto:${support}?subject=Payment ${reference}`}>Contact support</a></Button>}
    </div>
  </section>
);

export default CheckoutReturnPage;
