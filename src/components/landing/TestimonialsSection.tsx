import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";

const TESTIMONIALS = [
  {
    quote: "TOSMS transformed how we manage our entire school network. From admissions to report cards, everything is seamless. Our admin workload dropped by 60%.",
    name: "Dr. Sarah Mitchell",
    role: "Principal",
    org: "Springfield Academy",
    avatar: "SM",
  },
  {
    quote: "The multi-school support was a game-changer. We manage 5 campuses from a single dashboard with real-time data sync. Implementation was surprisingly smooth.",
    name: "James Wilson",
    role: "Head of IT",
    org: "Greenfield Schools",
    avatar: "JW",
  },
  {
    quote: "As a parent, I love being able to track my child's attendance, grades, and fees in real-time. The push notifications keep me informed without overwhelming me.",
    name: "Maria Garcia",
    role: "Parent",
    org: "Horizon International",
    avatar: "MG",
  },
  {
    quote: "The analytics module alone is worth the investment. We can now make data-driven decisions about curriculum, staffing, and resource allocation with confidence.",
    name: "Prof. David Chen",
    role: "Academic Director",
    org: "Maple Leaf Academy",
    avatar: "DC",
  },
];

const TestimonialsSection = () => {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setCurrent((c) => (c + 1) % TESTIMONIALS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const go = (dir: number) => {
    setDirection(dir);
    setCurrent((c) => (c + dir + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  const t = TESTIMONIALS[current];

  return (
    <section id="testimonials" className="py-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm font-medium text-primary uppercase tracking-widest">Testimonials</span>
          <h2 className="font-heading text-3xl sm:text-5xl font-bold text-foreground mt-3 mb-5">
            Loved by Educators Worldwide
          </h2>
        </motion.div>

        <div className="relative bg-card rounded-3xl border border-border p-8 sm:p-12 shadow-elevated overflow-hidden">
          <Quote className="absolute top-8 left-8 w-16 h-16 text-primary/10" />

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              initial={{ opacity: 0, x: direction * 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -direction * 50 }}
              transition={{ duration: 0.4 }}
              className="relative z-10"
            >
              <blockquote className="text-lg sm:text-xl text-card-foreground leading-relaxed max-w-3xl mx-auto text-center mb-8">
                "{t.quote}"
              </blockquote>
              <div className="flex items-center justify-center gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm text-primary-foreground"
                  style={{ background: `linear-gradient(135deg, hsl(var(--primary)), hsl(var(--info)))` }}
                >
                  {t.avatar}
                </div>
                <div className="text-left">
                  <p className="font-heading font-semibold text-card-foreground">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.role}, {t.org}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mt-10">
            <Button variant="outline" size="icon" className="rounded-full w-10 h-10" onClick={() => go(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDirection(i > current ? 1 : -1); setCurrent(i); }}
                  className={`h-2 rounded-full transition-all ${
                    i === current ? "w-8 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <Button variant="outline" size="icon" className="rounded-full w-10 h-10" onClick={() => go(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
