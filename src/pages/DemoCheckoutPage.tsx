import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FlaskConical, Loader2 } from "lucide-react";
import PublicShell from "@/components/billing/PublicShell";
import { Button } from "@/components/ui/button";
import { demoPay, loadDraft } from "@/hooks/useBilling";
import { errMsg } from "@/components/students/QueryState";

/**
 * Development-only stand-in for Paystack's page. It exists only when the server is run with
 * BILLING_DEMO=on outside production, every order it settles is stored as a demo, and demo orders
 * never count as revenue.
 */
const DemoCheckoutPage = () => {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const reference = params.get("reference") ?? "";
  const draft = loadDraft();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (outcome: "success" | "failed" | "abandoned") => {
    if (!draft || draft.reference !== reference || busy) return;
    setBusy(outcome); setError(null);
    try {
      await demoPay(reference, draft.claim, outcome);
      nav(`/checkout/return?reference=${reference}`);
    } catch (e) { setError(errMsg(e)); setBusy(null); }
  };

  return (
    <PublicShell narrow>
      <div className="rounded-2xl border-2 border-dashed border-destructive/60 bg-destructive/5 p-6 sm:p-8" role="region" aria-label="Demo checkout">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-destructive"><FlaskConical className="h-5 w-5" aria-hidden /> Demo checkout, not a real payment</p>
        <h1 className="mt-3 font-heading text-2xl font-bold">Simulated payment page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page replaces Paystack while the site is in development. No money moves. The result is stored as a demo transaction, is excluded from revenue, and its receipt says so.
        </p>
        <p className="mt-3 font-mono text-xs">Reference {reference || "—"}</p>
        {(!draft || draft.reference !== reference) && <p role="alert" className="mt-4 text-sm text-destructive">Open this page in the browser where you started the checkout.</p>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Button size="lg" className="h-12" disabled={!!busy} onClick={() => choose("success")}>{busy === "success" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Simulate success</Button>
          <Button size="lg" variant="outline" className="h-12" disabled={!!busy} onClick={() => choose("failed")}>Simulate failure</Button>
          <Button size="lg" variant="outline" className="h-12" disabled={!!busy} onClick={() => choose("abandoned")}>Cancel payment</Button>
        </div>
      </div>
    </PublicShell>
  );
};

export default DemoCheckoutPage;
