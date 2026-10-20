import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { priceText, usePricing, type Interval, type PublicPlan } from "@/hooks/useBilling";
import { cn } from "@/lib/utils";

export const limitText = (p: PublicPlan) => (p.student_limit ? `Up to ${p.student_limit.toLocaleString()} students` : "Unlimited students");

export const IntervalToggle = ({ value, onChange, saving }: { value: Interval; onChange: (v: Interval) => void; saving?: boolean }) => (
  <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
    {(["monthly", "yearly"] as const).map((v) => (
      <button
        key={v}
        type="button"
        role="radio"
        aria-checked={value === v}
        onClick={() => onChange(v)}
        className={cn("rounded-full px-5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
          value === v ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}
      >
        {v === "monthly" ? "Monthly" : "Yearly"}
        {v === "yearly" && saving && <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">Save</span>}
      </button>
    ))}
  </div>
);

export const priceFor = (p: PublicPlan, interval: Interval) => (interval === "yearly" ? p.annual_price : p.monthly_price);

/** Package cards built from the configured packages. Nothing here is hard-coded. */
const PricingCards = ({ cta = "Choose" }: { cta?: string }) => {
  const q = usePricing();
  const [interval, setInterval] = useState<Interval>("monthly");
  if (q.isLoading) return <LoadingRows rows={3} />;
  if (q.isError) return <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const plans = q.data?.plans ?? [];
  if (plans.length === 0) return <p className="text-center text-sm text-muted-foreground">Packages are being set up. Please check back soon or contact us.</p>;
  const yearlyOffered = plans.some((p) => p.annual_price);
  const tax = q.data?.settings;

  return (
    <div>
      {yearlyOffered && <div className="mb-8 flex justify-center"><IntervalToggle value={interval} onChange={setInterval} saving /></div>}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const price = priceFor(p, interval) ?? p.monthly_price;
          const effective: Interval = priceFor(p, interval) == null ? "monthly" : interval;
          return (
            <article key={p.code} className={cn("relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md sm:p-7",
              p.recommended ? "border-primary ring-2 ring-primary/20 lg:-mt-3 lg:pb-9" : "border-border")}>
              {p.recommended && <Badge className="absolute -top-3 left-6">Most chosen</Badge>}
              <h3 className="font-heading text-xl font-bold text-card-foreground">{p.name}</h3>
              <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">{p.description}</p>
              <p className="mt-5 flex flex-wrap items-baseline gap-x-1">
                <span className="font-heading text-4xl font-bold text-card-foreground" data-testid={`price-${p.code}`}>{priceText(price, p.currency)}</span>
                <span className="text-sm text-muted-foreground">/ {effective === "yearly" ? "year" : "month"}</span>
              </p>
              <p className="mt-1 min-h-[1.25rem] text-xs text-muted-foreground">
                {effective === "yearly" && p.annual_price != null && p.annual_price < p.monthly_price * 12 ? `Save ${priceText(p.monthly_price * 12 - p.annual_price, p.currency)} a year. ` : ""}
                {tax && tax.tax_rate_percent > 0 ? `${tax.tax_label} of ${tax.tax_rate_percent}% added at checkout. ` : ""}
                {p.trial_days > 0 ? `${p.trial_days}-day free trial for new schools.` : ""}
              </p>
              <p className="mt-4 text-sm font-medium text-card-foreground">{limitText(p)}{p.staff_limit ? ` · ${p.staff_limit} staff` : ""}</p>
              <ul className="mt-3 flex-1 space-y-2.5 text-sm text-muted-foreground">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{h}</li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-7 h-12 w-full" variant={p.recommended ? "default" : "outline"}>
                <Link to={`/signup?plan=${p.code}&interval=${effective}`}>{cta} {p.name}</Link>
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default PricingCards;
