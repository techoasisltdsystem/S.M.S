import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { authHeader } from "@/lib/db";
import { money } from "@/hooks/useFees";

interface Status { reference: string; status: "created" | "pending" | "paid" | "failed" | "abandoned" | "mismatch"; amount: number; currency: string; excess: number; invoice: string; student: string; receipt: string | null; gateway_response: string | null }

/** Where Paystack sends the payer back. The URL proves nothing: this page asks the server, which asks Paystack. */
const FeeReturnPage = () => {
  const [params] = useSearchParams();
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const auth = await authHeader();
        const res = await fetch("/api/billing/fee-verify", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ reference }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "We could not confirm this payment yet.");
        if (!live) return;
        setS(j as Status);
        if ((j.status === "pending" || j.status === "created") && tries < 6) setTimeout(() => live && setTries(tries + 1), 4000);
      } catch (e) { if (live) setError(e instanceof Error ? e.message : "We could not confirm this payment."); }
    })();
    return () => { live = false; };
  }, [reference, tries]);

  const waiting = !s && !error;
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        {waiting && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Confirming your payment with Paystack…</p>}
        {error && (
          <>
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden /> {error}</p>
            <p className="text-xs text-muted-foreground">If money left your account, do not pay again. It will show on the invoice once confirmed, or the school can look it up with reference {reference || "(none)"}.</p>
          </>
        )}
        {s?.status === "paid" && (
          <>
            <p className="flex items-center gap-2 font-heading text-lg font-bold text-success"><CheckCircle2 className="h-5 w-5" aria-hidden /> Payment confirmed</p>
            <p className="text-sm">{money(s.amount, s.currency)} for {s.student} ({s.invoice}).{s.receipt ? ` Receipt ${s.receipt}.` : ""}</p>
            {s.excess > 0 && <p className="rounded-md bg-warning/10 px-3 py-2 text-sm">{money(s.excess, s.currency)} of this was more than the balance. The school has been told and will refund or credit it.</p>}
          </>
        )}
        {(s?.status === "pending" || s?.status === "created") && <p className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4" aria-hidden /> Paystack has not confirmed this payment yet. This page checks again shortly; your balance is unchanged until it does.</p>}
        {(s?.status === "failed" || s?.status === "abandoned") && <p className="flex items-center gap-2 text-sm text-destructive"><XCircle className="h-4 w-4" aria-hidden /> The payment did not go through{s.gateway_response ? `: ${s.gateway_response}` : ""}. Nothing was applied to the invoice. You can try again.</p>}
        {s?.status === "mismatch" && <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden /> We could not match this payment to the invoice, so it was not applied. The school has been alerted. Quote reference {s.reference}.</p>}
        <Button asChild><Link to="/fees">Back to fees and payments</Link></Button>
      </div>
    </DashboardLayout>
  );
};

export default FeeReturnPage;
