import { Check, Minus, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Panel } from "@/components/kit/Panel";
import { PERMISSIONS, ROLE_LABEL, ROLE_PRESET, ROLE_TEXT, type PlatformRole } from "@/lib/platformRoles";

const ROLES = Object.keys(ROLE_LABEL) as PlatformRole[];

/** What each role can do by default. Individual administrators can be given a different set on the administrators page. */
const PlatformRolesPage = () => (
  <DashboardLayout>
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">Roles and permissions</h1>
        <p className="text-sm text-muted-foreground">The starting permissions for each role. The database checks every one of these on every request. To give one person a different set, open Access on the Platform administrators page.</p>
      </div>
      <Panel title="Role overview" icon={ShieldCheck}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((r) => <li key={r} className="rounded-lg bg-muted/40 p-3 text-sm"><p className="font-medium">{ROLE_LABEL[r]}</p><p className="text-xs text-muted-foreground">{ROLE_TEXT[r]}</p></li>)}
        </ul>
      </Panel>
      <Panel title="Permission matrix" icon={ShieldCheck}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="py-2 pr-3">Permission</th>{ROLES.map((r) => <th key={r} className="px-2 text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {PERMISSIONS.map((p) => (
                <tr key={p.key}>
                  <td className="py-2 pr-3"><span className="font-medium">{p.label}</span><span className="block text-xs text-muted-foreground">{p.text}</span></td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-2 text-center">
                      {ROLE_PRESET[r].includes(p.key) ? <Check className="mx-auto h-4 w-4 text-success" aria-label="Allowed" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Not allowed" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  </DashboardLayout>
);

export default PlatformRolesPage;
