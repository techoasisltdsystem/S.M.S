import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Lock } from "lucide-react";
import PublicShell from "@/components/billing/PublicShell";
import OrderSummary from "@/components/billing/OrderSummary";
import { IntervalToggle, limitText, priceFor } from "@/components/billing/PricingCards";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { beginPayment, priceText, saveDraft, startSignup, usePricing, type Interval, type OrderStart } from "@/hooks/useBilling";
import { cn } from "@/lib/utils";

const STEPS = ["Package", "Your school", "Review and pay"];

const Stepper = ({ step }: { step: number }) => (
  <ol className="mb-8 flex items-center gap-2 text-sm" aria-label="Checkout progress">
    {STEPS.map((s, i) => (
      <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          i < step ? "bg-primary text-primary-foreground" : i === step ? "border-2 border-primary text-primary" : "border border-border text-muted-foreground")}>
          {i < step ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
        </span>
        <span className={cn("hidden sm:inline", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{s}</span>
        {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
      </li>
    ))}
  </ol>
);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** New school: choose a package, enter details, review the server-priced order, pay on Paystack. */
const CheckoutPage = () => {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const pricing = usePricing();
  const plans = useMemo(() => pricing.data?.plans ?? [], [pricing.data]);
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState(params.get("plan") ?? "");
  const [interval, setInterval] = useState<Interval>(params.get("interval") === "yearly" ? "yearly" : "monthly");
  const [form, setForm] = useState({ school: "", admin: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<OrderStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = plans.find((p) => p.code === plan);
  useEffect(() => {
    if (!plan && plans.length) setPlan((plans.find((p) => p.recommended) ?? plans[0]).code);
  }, [plans, plan]);
  // Keep the address in step with the choice so a refresh or a returning cancelled payment keeps it.
  useEffect(() => {
    if (plan && (params.get("plan") !== plan || params.get("interval") !== interval)) setParams({ plan, interval }, { replace: true });
  }, [plan, interval, params, setParams]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, [k]: e.target.value }); setOrder(null); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.school.trim().length < 3) e.school = "Enter the school's name (at least 3 characters).";
    if (form.admin.trim().length < 2) e.admin = "Enter the administrator's full name.";
    if (!EMAIL.test(form.email.trim())) e.email = "Enter a valid email address.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const toReview = async () => {
    if (!validate() || busy) return;
    setBusy(true); setError(null);
    try {
      // The server prices the order. What you see next is what you pay.
      setOrder(await startSignup({ plan, interval, school: form.school.trim(), admin: form.admin.trim(), email: form.email.trim(), phone: form.phone.trim() }));
      setStep(2);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  const pay = async () => {
    if (!order || busy) return;
    setBusy(true); setError(null);
    try {
      saveDraft({ reference: order.reference, claim: order.claim });
      const r = await beginPayment(order.reference, order.claim);
      if (r.status === "paid") return nav(`/checkout/return?reference=${order.reference}`);
      if (!r.url) throw new Error("The payment page could not be opened.");
      if (r.mode === "demo") nav(`/checkout/demo?reference=${order.reference}`);
      else window.location.assign(r.url);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  };

  return (
    <PublicShell>
      <Link to="/pricing" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to pricing</Link>
      <h1 className="font-heading text-2xl font-bold sm:text-3xl">Get started</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Already have a school here? <Link to="/login" className="font-medium text-primary hover:underline">Sign in to renew or change your package.</Link></p>
      <Stepper step={step} />
      {pricing.isLoading && <LoadingRows rows={3} />}
      {pricing.isError && <ErrorBox message={errMsg(pricing.error)} onRetry={() => pricing.refetch()} />}

      {pricing.data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div>
            {step === 0 && (
              <section aria-label="Choose a package" className="space-y-4">
                <div className="flex justify-center sm:justify-start"><IntervalToggle value={interval} onChange={setInterval} /></div>
                <div role="radiogroup" aria-label="Package" className="space-y-3">
                  {plans.map((p) => {
                    const price = priceFor(p, interval);
                    const unavailable = price == null;
                    return (
                      <button key={p.code} type="button" role="radio" aria-checked={plan === p.code} disabled={unavailable} onClick={() => { setPlan(p.code); setOrder(null); }}
                        className={cn("flex w-full flex-col gap-1 rounded-xl border bg-card p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:flex-row sm:items-center sm:justify-between",
                          plan === p.code ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50")}>
                        <span>
                          <span className="font-heading font-semibold">{p.name}{p.recommended && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Most chosen</span>}</span>
                          <span className="block text-sm text-muted-foreground">{limitText(p)}{p.staff_limit ? ` · ${p.staff_limit} staff` : ""}</span>
                        </span>
                        <span className="font-heading text-lg font-bold">{unavailable ? "Not offered" : `${priceText(price, p.currency)} / ${interval === "yearly" ? "year" : "month"}`}</span>
                      </button>
                    );
                  })}
                </div>
                {chosen && (
                  <ul className="grid gap-2 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-2">
                    {chosen.highlights.map((h) => <li key={h} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{h}</li>)}
                  </ul>
                )}
                <Button size="lg" className="h-12 w-full sm:w-auto" disabled={!chosen || priceFor(chosen, interval) == null} onClick={() => setStep(1)}>Continue</Button>
              </section>
            )}

            {step === 1 && (
              <form aria-label="School and administrator details" className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void toReview(); }}>
                <div className="space-y-1.5">
                  <Label htmlFor="co-school">School name</Label>
                  <Input id="co-school" value={form.school} onChange={set("school")} autoComplete="organization" aria-invalid={!!errors.school} aria-describedby={errors.school ? "e-school" : undefined} className="h-12" />
                  {errors.school && <p id="e-school" role="alert" className="text-xs text-destructive">{errors.school}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-admin">Administrator&apos;s full name</Label>
                  <Input id="co-admin" value={form.admin} onChange={set("admin")} autoComplete="name" aria-invalid={!!errors.admin} aria-describedby={errors.admin ? "e-admin" : undefined} className="h-12" />
                  {errors.admin && <p id="e-admin" role="alert" className="text-xs text-destructive">{errors.admin}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="co-email">Email</Label>
                    <Input id="co-email" type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? "e-email" : undefined} className="h-12" />
                    {errors.email && <p id="e-email" role="alert" className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="co-phone">Phone (optional)</Label>
                    <Input id="co-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" className="h-12" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Your sign-up link is shown on the confirmation page once payment is confirmed. The administrator chooses a password there.</p>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => setStep(0)}>Back</Button>
                  <Button type="submit" size="lg" className="h-12 flex-1 sm:flex-none" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Review order</Button>
                </div>
              </form>
            )}

            {step === 2 && order && (
              <section aria-label="Review and pay" className="space-y-5">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="font-heading text-lg font-semibold">Your details</h2>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">School</dt><dd className="font-medium">{form.school}</dd></div>
                    <div><dt className="text-muted-foreground">Administrator</dt><dd className="font-medium">{form.admin}</dd></div>
                    <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{form.email}</dd></div>
                    {form.phone && <div><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{form.phone}</dd></div>}
                  </dl>
                  <button type="button" className="mt-3 text-sm font-medium text-primary hover:underline" onClick={() => setStep(1)}>Change details</button>
                </div>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                <Button size="lg" className="h-14 w-full text-base" onClick={pay} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> : <Lock className="mr-2 h-5 w-5" aria-hidden />}
                  Pay securely
                </Button>
                <p className="text-center text-xs text-muted-foreground">You will choose how to pay on the next page. Your plan starts only after the payment is confirmed.</p>
              </section>
            )}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            {order
              ? <OrderSummary line={{ plan: order.plan, interval: order.interval, currency: order.currency, base_minor: order.base_minor, tax_minor: order.tax_minor, total_minor: order.total_minor, tax_label: order.tax_label }} settings={pricing.data.settings} />
              : chosen && (
                <aside aria-label="Selected package" className="rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
                  <h2 className="font-heading text-lg font-semibold">{chosen.name}</h2>
                  <p className="mt-1 text-muted-foreground">{priceFor(chosen, interval) != null ? `${priceText(priceFor(chosen, interval)!, chosen.currency)} per ${interval === "yearly" ? "year" : "month"}` : "Not offered with this billing period"}</p>
                  <p className="mt-3 text-xs text-muted-foreground">The final amount, including any {pricing.data.settings.tax_rate_percent > 0 ? pricing.data.settings.tax_label : "tax"}, is shown on the review step before you pay.</p>
                </aside>
              )}
          </div>
        </div>
      )}
    </PublicShell>
  );
};

export default CheckoutPage;
