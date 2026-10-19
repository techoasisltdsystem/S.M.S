import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

const Forbidden = () => (
  <DashboardLayout>
    <section className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-card">
      <ShieldOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
      <h1 className="font-heading text-xl font-bold text-card-foreground">You do not have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role in this school does not include it. Ask your school administrator if you need access.
      </p>
      <Link to="/dashboard" className="mt-5 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">
        Back to your dashboard
      </Link>
    </section>
  </DashboardLayout>
);

export default Forbidden;
