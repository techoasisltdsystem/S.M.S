import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";

const STATS = [
  { end: 500, suffix: "+", label: "Schools Worldwide", desc: "Across 15 countries" },
  { end: 1.2, suffix: "M+", label: "Students Managed", desc: "And growing daily", decimals: 1 },
  { end: 99.9, suffix: "%", label: "System Uptime", desc: "Enterprise-grade reliability", decimals: 1 },
  { end: 24, suffix: "/7", label: "Support Available", desc: "Dedicated success team" },
];

const AnimatedCounter = ({ end, suffix, decimals = 0 }: { end: number; suffix: string; decimals?: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1500;
    const startTime = performance.now();
    const step = (t: number) => {
      const progress = Math.min((t - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * end);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, end]);

  return <span ref={ref}>{value.toFixed(decimals)}{suffix}</span>;
};

const StatsSection = () => (
  <section className="py-20 px-4 relative overflow-hidden">
    <div
      className="absolute inset-0 -z-10"
      style={{
        background: `linear-gradient(135deg, hsl(var(--primary) / 0.03), hsl(var(--info) / 0.03))`,
      }}
    />
    <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
      {STATS.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1 }}
          className="text-center"
        >
          <p className="font-heading text-4xl sm:text-5xl font-extrabold text-foreground">
            <AnimatedCounter end={stat.end} suffix={stat.suffix} decimals={stat.decimals} />
          </p>
          <p className="text-sm font-semibold text-foreground mt-2">{stat.label}</p>
          <p className="text-xs text-muted-foreground mt-1">{stat.desc}</p>
        </motion.div>
      ))}
    </div>
  </section>
);

export default StatsSection;
