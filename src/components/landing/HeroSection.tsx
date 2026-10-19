import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative pt-32 pb-24 px-4 sm:px-6 overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-info/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-warning/5 rounded-full blur-3xl" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-5 py-2 mb-8">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-primary">Trusted by 500+ schools worldwide</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
            className="font-heading text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.1] mb-8 tracking-tight"
          >
            <span className="text-foreground">Run Your School</span>
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(135deg, hsl(var(--primary)), hsl(var(--info)))`,
              }}
            >
              Like a Business
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            The all-in-one platform that automates administration, empowers educators,
            and delivers real-time insights — built for schools that demand excellence.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              size="lg"
              className="h-14 px-10 text-base rounded-xl shadow-prominent hover:shadow-elevated transition-all"
              onClick={() => navigate("/login")}
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-10 text-base rounded-xl group"
            >
              <Play className="w-4 h-4 mr-2 group-hover:text-primary transition-colors" />
              Watch Demo
            </Button>
          </motion.div>

          {/* Social proof avatars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-14 flex items-center justify-center gap-3"
          >
            <div className="flex -space-x-3">
              {["S", "A", "M", "J", "K"].map((letter, i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold text-primary-foreground"
                  style={{
                    background: `hsl(${174 + i * 30}, ${50 + i * 5}%, ${35 + i * 5}%)`,
                  }}
                >
                  {letter}
                </div>
              ))}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4 text-warning fill-warning" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">4.9/5</span> from 200+ reviews
              </p>
            </div>
          </motion.div>
        </div>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5, ease: "easeOut" }}
          className="mt-20 max-w-5xl mx-auto"
        >
          <div className="relative rounded-2xl border border-border bg-card p-2 shadow-prominent">
            <div className="absolute -inset-1 bg-gradient-to-b from-primary/20 via-transparent to-transparent rounded-2xl -z-10 blur-sm" />
            <div className="rounded-xl bg-muted/50 overflow-hidden">
              {/* Fake browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-muted rounded-md px-4 py-1 text-xs text-muted-foreground w-64 text-center">
                    app.techoasis-sms.com/dashboard
                  </div>
                </div>
              </div>
              {/* Dashboard mockup content */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Total Students", value: "2,847", color: "primary" },
                    { label: "Fee Collection", value: "$128K", color: "success" },
                    { label: "Attendance", value: "94.2%", color: "info" },
                    { label: "Staff Active", value: "156", color: "warning" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-card rounded-lg p-4 border border-border">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-heading font-bold text-foreground mt-1">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 bg-card rounded-lg p-4 border border-border h-40">
                    <p className="text-sm font-medium text-foreground mb-3">Enrollment Trends</p>
                    <div className="flex items-end gap-2 h-24">
                      {[40, 65, 45, 80, 60, 90, 75, 95, 85, 70, 88, 92].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-primary/20 relative overflow-hidden">
                          <div
                            className="absolute bottom-0 w-full bg-primary rounded-sm transition-all"
                            style={{ height: `${h}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-card rounded-lg p-4 border border-border h-40">
                    <p className="text-sm font-medium text-foreground mb-3">Quick Actions</p>
                    <div className="space-y-2">
                      {["New Student", "Mark Attendance", "Collect Fee"].map((a) => (
                        <div key={a} className="bg-muted rounded-md px-3 py-2 text-xs text-muted-foreground">{a}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
