import { CalendarClock, Lock } from "lucide-react";
import { money, type Interval, type PublicSettings } from "@/hooks/useBilling";

export interface SummaryLine { plan: string; interval: Interval; currency: string; base_minor: number; tax_minor: number; total_minor: number; tax_label: string | null }

/** The order exactly as the server priced it. */
const OrderSummary = ({ line, settings }: { line: SummaryLine; settings?: Partial<PublicSettings> }) => (
  <aside aria-label="Order summary" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
    <h2 className="font-heading text-lg font-semibold text-card-foreground">Order summary</h2>
    <dl className="mt-4 space-y-2 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Package</dt><dd className="font-medium">{line.plan}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Billing</dt><dd className="font-medium">{line.interval === "yearly" ? "Yearly" : "Monthly"}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Price</dt><dd>{money(line.base_minor, line.currency)}</dd></div>
      {line.tax_minor > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{line.tax_label ?? "Tax"}</dt><dd>{money(line.tax_minor, line.currency)}</dd></div>}
      <div className="flex justify-between gap-4 border-t border-border pt-3 text-base font-semibold"><dt>Total today</dt><dd data-testid="order-total">{money(line.total_minor, line.currency)}</dd></div>
    </dl>
    <ul className="mt-5 space-y-3 text-xs text-muted-foreground">
      <li className="flex gap-2"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>Covers one {line.interval === "yearly" ? "year" : "month"} from the day your payment is confirmed. We do not charge again automatically; we remind you before it ends.</span></li>
      {settings?.cancellation_text && <li>{settings.cancellation_text}</li>}
      {settings?.refund_text && <li>{settings.refund_text}</li>}
      <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span>Paid on Paystack&apos;s secure page. We never see or store your card details.</span></li>
    </ul>
  </aside>
);

export default OrderSummary;
