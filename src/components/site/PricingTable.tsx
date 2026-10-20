import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { CURRENCIES, PLANS, PRICING_IS_PLACEHOLDER, formatPrice, priceFor, yearlySaving, type Billing, type Currency } from "@/lib/pricing";

const Choice = <T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (v: T) => void; items: { value: T; text: string }[] }) => (
  <ToggleGroup
    type="single"
    value={value}
    onValueChange={(v) => v && onChange(v as T)}
    aria-label={label}
    className="rounded-lg border border-border bg-card p-1"
  >
    {items.map((i) => (
      <ToggleGroupItem key={i.value} value={i.value} className="px-3 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
        {i.text}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

const PricingTable = () => {
  const [currency, setCurrency] = useState<Currency>("GHS");
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <div>
      <div className="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Choice<Currency> label="Currency" value={currency} onChange={setCurrency} items={CURRENCIES.map((c) => ({ value: c.code, text: `${c.symbol} ${c.label}` }))} />
        <Choice<Billing> label="Billing period" value={billing} onChange={setBilling} items={[{ value: "monthly", text: "Monthly" }, { value: "yearly", text: "Yearly" }]} />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => {
          const price = priceFor(p, currency, billing);
          return (
            <div key={p.id} className={`flex flex-col rounded-xl border bg-card p-6 ${p.featured ? "border-primary shadow-md" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-lg font-bold text-card-foreground">{p.name}</h3>
                {p.featured && <Badge>Most chosen</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
              <p className="mt-5 font-heading text-3xl font-bold text-card-foreground" data-testid={`price-${p.id}`}>{price.amount}</p>
              <p className="text-xs text-muted-foreground">
                {price.unit}
                {billing === "yearly" && <span className="text-primary"> · save {formatPrice(yearlySaving(p, currency), currency)}</span>}
              </p>
              <p className="mt-4 text-sm font-medium text-card-foreground">{p.students}</p>
              <ul className="mt-3 flex-1 space-y-2 text-sm text-muted-foreground">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{f}</li>
                ))}
              </ul>
              <Button asChild className="mt-6" variant={p.featured ? "default" : "outline"}>
                <a href="#contact">Ask about {p.name}</a>
              </Button>
            </div>
          );
        })}
      </div>
      {PRICING_IS_PLACEHOLDER && (
        <p className="mt-6 text-center text-xs text-muted-foreground">Sample prices while packages are being finalised. Contact us for a confirmed quote.</p>
      )}
    </div>
  );
};

export default PricingTable;
