import { useState } from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { GraduationCap, ShieldCheck, BookOpen, Users, Eye, EyeOff } from "lucide-react";
import schoolHero from "@/assets/school-hero.jpg";
import Logo from "@/components/ui/logo";
import AdminLogin from "./AdminLogin";

const ROLES: { value: UserRole; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "admin", label: "Administrator", icon: ShieldCheck, desc: "Full system access" },
  { value: "teacher", label: "Teacher", icon: BookOpen, desc: "Classes & grading" },
  { value: "student", label: "Student", icon: GraduationCap, desc: "Portal access" },
  { value: "parent", label: "Parent", icon: Users, desc: "Monitor progress" },
];

const Login = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("admin");
  // Student keeps this screen; the other roles switch to their own themed panel.
  const [panelMode, setPanelMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password, role);
    } finally {
      setLoading(false);
    }
  };

  const pick = (r: UserRole) => { setRole(r); setPanelMode(r !== "student"); };

  if (panelMode && role !== "student") {
    return <AdminLogin key={role} role={role} onSwitchRole={pick} />;
  }

  return (
    <div className="flex min-h-screen">
      {/* Left - Hero Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img src={schoolHero} alt="School campus" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar/90 to-sidebar/70" />
        <div className="relative z-10 flex flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <Logo className="w-10 h-10" />
            <span className="font-heading text-xl font-bold text-sidebar-primary-foreground">
              Tech Oasis <span className="text-sidebar-primary">SMS</span>
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h1 className="font-heading text-4xl font-bold text-sidebar-primary-foreground leading-tight mb-4">
              Empowering Education <br />
              <span className="text-sidebar-primary">Through Technology</span>
            </h1>
            <p className="text-sidebar-foreground text-lg max-w-md">
              Streamline your school's administration with our comprehensive management platform.
            </p>
          </motion.div>
          <p className="text-sidebar-foreground/60 text-sm">
            © 2026 Tech Oasis Web Solutions. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-background">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <Logo className="w-9 h-9" />
            <span className="font-heading text-lg font-bold text-foreground">
              Tech Oasis <span className="text-primary">SMS</span>
            </span>
          </div>

          <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Welcome back</h2>
          <p className="text-muted-foreground mb-8">Sign in to your account to continue</p>

          {/* Role Selection */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {ROLES.map((r) => (
              <Card
                key={r.value}
                className={`cursor-pointer transition-all duration-200 border-2 ${
                  role === r.value
                    ? "border-primary bg-accent shadow-elevated"
                    : "border-transparent bg-muted/50 hover:bg-muted"
                }`}
                onClick={() => pick(r.value)}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <r.icon className={`w-5 h-5 shrink-0 ${role === r.value ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${role === r.value ? "text-accent-foreground" : "text-foreground"}`}>
                      {r.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{r.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" className="text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
              {loading ? (
                <motion.div
                  className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                />
              ) : (
                `Sign in as ${ROLES.find((r) => r.value === role)?.label}`
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Demo mode — select a role and click sign in
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            <Link to="/admin" className="text-primary hover:underline">Administrator sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
