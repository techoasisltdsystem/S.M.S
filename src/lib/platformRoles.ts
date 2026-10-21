/** Platform roles and permissions. The database holds the same lists and enforces them; this only drives the forms. */
export type PlatformRole = "super_admin" | "platform_admin" | "billing_admin" | "support_admin";

export const ROLE_LABEL: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  billing_admin: "Billing Admin",
  support_admin: "Support Admin",
};

export const ROLE_TEXT: Record<PlatformRole, string> = {
  super_admin: "Full authority over the platform, including other administrators.",
  platform_admin: "Runs clients and schools, support and audit review. Can see billing but not change it.",
  billing_admin: "Payments, packages and subscription changes. Can see clients.",
  support_admin: "Support requests and permitted help for schools. Can see clients.",
};

export const PERMISSIONS: { key: string; label: string; text: string }[] = [
  { key: "clients.view", label: "View clients and schools", text: "Clients, subscriptions, renewals, school profiles" },
  { key: "clients.manage", label: "Manage clients and schools", text: "Create, suspend and restore schools; reset school administrator logins" },
  { key: "billing.view", label: "View billing", text: "Payments, reconciliation, packages and billing settings" },
  { key: "billing.manage", label: "Manage billing", text: "Edit packages and billing settings, extend subscriptions" },
  { key: "support.view", label: "View support", text: "Support requests and support access" },
  { key: "support.manage", label: "Manage support", text: "Reply, change status, end support access" },
  { key: "audit.view", label: "View audit and security", text: "Audit incidents, alerts and administrative activity" },
  { key: "audit.manage", label: "Manage audit incidents", text: "Acknowledge and resolve incidents, run health checks" },
  { key: "settings.manage", label: "Manage monitoring settings", text: "Audit thresholds and monitoring settings" },
  { key: "health.view", label: "View system health", text: "Platform health counts and scheduled-check status" },
  { key: "admins.manage", label: "Manage platform administrators", text: "Invite, change roles, switch off. Only grantable by a Super Admin" },
];

export const ROLE_PRESET: Record<PlatformRole, string[]> = {
  super_admin: PERMISSIONS.map((p) => p.key),
  platform_admin: ["clients.view", "clients.manage", "billing.view", "support.view", "support.manage", "audit.view", "health.view"],
  billing_admin: ["clients.view", "billing.view", "billing.manage"],
  support_admin: ["clients.view", "support.view", "support.manage"],
};
