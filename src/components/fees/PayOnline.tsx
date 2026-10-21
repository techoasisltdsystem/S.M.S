import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authHeader } from "@/lib/db";
import { money } from "@/hooks/useFees";

/**
 * Pay an invoice online. The browser names an invoice and an amount; the server checks the amount against the
 * balance in the fee ledger, starts the Paystack checkout, and only a verified result ever reduces the balance.
 */
const PayOnline = ({ invoiceId, balance, currency }: { invoiceId: string; balance: number; currency: string }) => {
  const [amount, setAmount] = useState(String(balance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Math.round(Number(amount) * 100) / 100;
  const valid = Number.isFinite(value) && value > 0 && value <= balance;

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const auth = await authHeader();
      const res = await fetch("/api/billing/fee-initialize", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ invoice: invoiceId, amount: value }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j.error ?? "We could not start the payment. Please try again.");
      window.location.assign(j.url);
    } catch (e2) { setError(e2 instanceof Error ? e2.message : "We could not start the payment."); setBusy(false); }
  };

  return (
    <form onSubmit={pay} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3" noValidate>
      <p className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-4 w-4 text-primary" aria-hidden /> Pay online</p>
      <div className="space-y-1.5">
        <Label htmlFor="pay-amount">Amount to pay now ({currency})</Label>
        <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <p className="text-xs text-muted-foreground">You can pay all of {money(balance, currency)} or part of it. You confirm the amount on Paystack&apos;s secure page. Your balance changes only after Paystack confirms the payment to us.</p>
      </div>
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!valid || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Pay {valid ? money(value, currency) : ""} with Paystack</Button>
    </form>
  );
};

export default PayOnline;
