import { ReactNode } from "react";
import { motion } from "framer-motion";

interface WelcomeProps {
  name: string;
  sub?: string;
  aside?: ReactNode;
}

const Welcome = ({ name, sub, aside }: WelcomeProps) => (
  <motion.section
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
  >
    <div className="min-w-0">
      <h1 className="font-heading text-xl font-bold text-card-foreground sm:text-2xl">
        Welcome back, {name}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        {sub ? ` · ${sub}` : ""}
      </p>
    </div>
    {aside && <div className="shrink-0 sm:max-w-xs">{aside}</div>}
  </motion.section>
);

export default Welcome;
