import { motion } from "framer-motion";

const LOGOS = [
  "Springfield Academy", "Greenfield Schools", "Horizon Int'l",
  "Maple Leaf Academy", "Sunrise School", "Oak Valley Prep",
];

const LogoCloud = () => (
  <section className="py-14 px-4 border-y border-border bg-muted/30">
    <div className="max-w-6xl mx-auto">
      <p className="text-center text-sm text-muted-foreground mb-8 uppercase tracking-widest font-medium">
        Trusted by leading educational institutions
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
        {LOGOS.map((name, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="text-lg font-heading font-bold text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors select-none"
          >
            {name}
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default LogoCloud;
