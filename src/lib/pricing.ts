export type Currency = "USD" | "GHS" | "NGN";
export type Billing = "monthly" | "yearly";

export const CURRENCIES: { code: Currency; label: string; symbol: string; locale: string }[] = [
  { code: "USD", label: "US Dollars", symbol: "$", locale: "en-US" },
  { code: "GHS", label: "Ghana Cedis", symbol: "GH₵", locale: "en-GH" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦", locale: "en-NG" },
];

export interface Plan {
  id: string;
  name: string;
  blurb: string;
  students: string;
  features: string[];
  /** Price per month, in whole units of each currency, when billed monthly. */
  monthly: Record<Currency, number>;
  /** Price for a full year, in whole units of each currency, when billed yearly. */
  yearly: Record<Currency, number>;
  featured?: boolean;
}

/**
 * PLACEHOLDER AMOUNTS. The real packages and prices have not been confirmed by Tech Oasis yet.
 * Replace the numbers below (and nothing else) when they are; the page updates by itself.
 * Yearly is ten months of the monthly price as a stand-in for "two months free".
 */
export const PRICING_IS_PLACEHOLDER = true;

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    blurb: "For small schools getting records off paper.",
    students: "Up to 200 students",
    features: ["Student and staff records", "Attendance", "Notices and calendar", "Email support"],
    monthly: { USD: 29, GHS: 450, NGN: 45000 },
    yearly: { USD: 290, GHS: 4500, NGN: 450000 },
  },
  {
    id: "school",
    name: "School",
    blurb: "Everything a growing school runs on.",
    students: "Up to 800 students",
    features: ["Everything in Starter", "Exams and report cards", "Timetables", "Fees and payments", "Parent and student sign-in"],
    monthly: { USD: 79, GHS: 1200, NGN: 120000 },
    yearly: { USD: 790, GHS: 12000, NGN: 1200000 },
    featured: true,
  },
  {
    id: "campus",
    name: "Campus",
    blurb: "For large or multi-site schools.",
    students: "More than 800 students",
    features: ["Everything in School", "Audit log and roles", "Priority support", "Onboarding help"],
    monthly: { USD: 149, GHS: 2300, NGN: 230000 },
    yearly: { USD: 1490, GHS: 23000, NGN: 2300000 },
  },
];

export const formatPrice = (amount: number, currency: Currency) => {
  const c = CURRENCIES.find((x) => x.code === currency)!;
  return `${c.symbol}${amount.toLocaleString(c.locale)}`;
};

/** The headline price and its unit for a plan in the chosen currency and billing period. */
export const priceFor = (plan: Plan, currency: Currency, billing: Billing) =>
  billing === "monthly"
    ? { amount: formatPrice(plan.monthly[currency], currency), unit: "per month" }
    : { amount: formatPrice(plan.yearly[currency], currency), unit: "per year" };

/** What yearly billing saves against twelve months, in the chosen currency. */
export const yearlySaving = (plan: Plan, currency: Currency) => plan.monthly[currency] * 12 - plan.yearly[currency];
