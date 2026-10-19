import { motion } from "framer-motion";
import { Check, ArrowRight, Zap, Building2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const PLANS = [
  {
    icon: Rocket,
    name: "Starter",
    price: "$49",
    period: "/mo",
    desc: "For small schools up to 500 students",
    features: [
      "Student & staff management",
      "Basic timetable",
      "Fee tracking & invoices",
      "Email support",
      "Up to 5 admin users",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    icon: Zap,
    name: "Professional",
    price: "$149",
    period: "/mo",
    desc: "For growing schools up to 2,000 students",
    features: [
      "Everything in Starter",
      "Advanced analytics & KPIs",
      "Exam & grading module",
      "Parent & student portal",
      "SMS & push notifications",
      "Priority support",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    icon: Building2,
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For multi-school networks & districts",
    features: [
      "Everything in Professional",
      "Multi-school management",
      "Custom branding & white-label",
      "API access & integrations",
      "Dedicated account manager",
      "On-premise deployment option",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

const PricingSection = () => {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `linear-gradient(180deg, hsl(var(--background)), hsl(var(--muted) / 0.4), hsl(var(--background)))`,
        }}
      />

      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm font-medium text-primary uppercase tracking-widest">Pricing</span>
          <h2 className="font-heading text-3xl sm:text-5xl font-bold text-foreground mt-3 mb-5">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            No hidden fees. No surprises. Start free and scale as you grow.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className={`relative rounded-2xl border-2 p-8 transition-shadow hover:shadow-elevated ${
                plan.popular
                  ? "border-primary bg-card shadow-prominent scale-[1.03]"
                  : "border-border bg-card"
              }`}
            >
              {plan.popular && (
                <div
                  className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 rounded-full text-xs font-bold text-primary-foreground"
                  style={{ background: `linear-gradient(135deg, hsl(var(--primary)), hsl(var(--info)))` }}
                >
                  Most Popular
                </div>
              )}

              <plan.icon className={`w-8 h-8 mb-4 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
              <h3 className="font-heading text-xl font-bold text-card-foreground">{plan.name}</h3>
              <div className="mt-4 mb-2 flex items-baseline gap-1">
                <span className="font-heading text-5xl font-extrabold text-foreground">{plan.price}</span>
                {plan.period && <span className="text-muted-foreground text-lg">{plan.period}</span>}
              </div>
              <p className="text-sm text-muted-foreground mb-8">{plan.desc}</p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-card-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full h-12 rounded-xl ${plan.popular ? "" : ""}`}
                variant={plan.popular ? "default" : "outline"}
                onClick={() => navigate("/login")}
              >
                {plan.cta}
                {plan.cta !== "Contact Sales" && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
