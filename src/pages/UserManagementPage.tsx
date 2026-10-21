import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Plus, Eye, MoreHorizontal, Users, UserCheck,
  Ban, KeyRound, UserMinus, Pencil, Shield, GraduationCap, UserCog, Loader2, Copy, Mail, Wallet, ClipboardCheck, BookOpen,
} from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth, MEMBER_ROLE_LABEL, type MemberRole } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import StatCard from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import LoginAccessDialog, { directLoginManagement } from '@/components/users/LoginAccessDialog'
import { cn } from '@/lib/utils'
import type { Database } from '@/integrations/supabase/types'

// Types
type UserStatus = Database['public']['Enums']['user_status']
type MembershipStatus = Database['public']['Enums']['membership_status']
type Profile = Database['public']['Tables']['profiles']['Row']

interface Membership {
  id: string
  role: MemberRole
  status: MembershipStatus
}

interface SchoolPerson extends Profile {
  memberships: Membership[]
}

const ROLES: MemberRole[] = ['school_admin', 'headteacher', 'academic_coordinator', 'teacher', 'finance_officer', 'librarian', 'receptionist', 'auditor', 'student', 'parent']

const STATUS_COLORS: Record<UserStatus | 'invited', string> = {
  active: 'bg-success/10 text-success border-success/20',
  invited: 'bg-info/10 text-info border-info/20',
  suspended: 'bg-warning/10 text-warning border-warning/20',
  banned: 'bg-destructive/10 text-destructive border-destructive/20',
  inactive: 'bg-muted text-muted-foreground border-border',
}

const ROLE_ICONS: Record<MemberRole, React.ElementType> = {
  school_admin: Shield,
  teacher: UserCog,
  student: GraduationCap,
  parent: Users,
  finance_officer: Wallet,
  auditor: ClipboardCheck,
  headteacher: Shield,
  academic_coordinator: ClipboardCheck,
  librarian: BookOpen,
  receptionist: Users,
}

// Shown in the table: "invited" until the person accepts, otherwise the account status.
const displayStatus = (p: SchoolPerson): UserStatus | 'invited' =>
  p.status === 'active' && p.memberships.length > 0 && p.memberships.every((m) => m.status === 'invited')
    ? 'invited'
    : p.status

const errorText = (err: unknown, fallback: string) =>
  err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : fallback

const inviteLink = (token: string) => `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`

// ─── Invite Form ──────────────────────────────────────────────────────────────

interface InviteFormProps {
  schoolId: string
  defaultRole: MemberRole
  onInvited: (link: string, name: string) => void
  onCancel: () => void
}

const InviteForm = ({ schoolId, defaultRole, onInvited, onCancel }: InviteFormProps) => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: defaultRole })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) {
      toast({ title: 'Name and email are required', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const { data, error } = await db.rpc('invite_member', {
        _school: schoolId,
        _full_name: form.full_name.trim(),
        _email: form.email.trim(),
        _role: form.role,
      })
      if (error) throw error
      onInvited(inviteLink((data as { token: string }).token), form.full_name.trim())
    } catch (err) {
      toast({ title: 'Could not add this person', description: errorText(err, 'Try again.'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invite_name">Full name <span className="text-destructive">*</span></Label>
        <Input id="invite_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="invite_email">Email <span className="text-destructive">*</span></Label>
          <Input id="invite_email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite_role">Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as MemberRole })}>
            <SelectTrigger id="invite_role"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{MEMBER_ROLE_LABEL[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        You get a single-use invitation link, valid for 7 days, to send to this person. Emailing it for you is not set up yet.
      </p>
      <DialogFooter className="gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Create invitation
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Edit Form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  person: SchoolPerson
  onSave: () => void
  onCancel: () => void
}

const EditForm = ({ person, onSave, onCancel }: EditFormProps) => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const primary = person.memberships[0]
  const [form, setForm] = useState({
    full_name: person.full_name,
    phone: person.phone || '',
    date_of_birth: person.date_of_birth || '',
    address: person.address || '',
    emergency_contact: person.emergency_contact || '',
    notes: person.notes || '',
    role: primary?.role,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      // Changes are written to the audit log by the database.
      const { error } = await db
        .from('profiles')
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          date_of_birth: form.date_of_birth || null,
          address: form.address.trim() || null,
          emergency_contact: form.emergency_contact.trim() || null,
          notes: form.notes.trim() || null,
        })
        .eq('id', person.id)
      if (error) throw error

      if (primary && form.role && form.role !== primary.role) {
        const { data, error: roleError } = await db
          .from('school_memberships')
          .update({ role: form.role })
          .eq('id', primary.id)
          .select('id')
        if (roleError) throw roleError
        if (!data?.length) throw new Error('You cannot change this role.')
      }
      toast({ title: 'Saved' })
      onSave()
    } catch (err) {
      toast({ title: 'Could not save', description: errorText(err, 'Try again.'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Full name <span className="text-destructive">*</span></Label>
          <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        {primary && (
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as MemberRole })}>
              <SelectTrigger id="role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{MEMBER_ROLE_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+233 20 000 0000" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="emergency">Emergency contact</Label>
          <Input id="emergency" value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <DialogFooter className="gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── User Table ───────────────────────────────────────────────────────────────

interface UserTableProps {
  people: SchoolPerson[]
  loading: boolean
  error: string | null
  selfId: string
  onView: (p: SchoolPerson) => void
  onEdit: (p: SchoolPerson) => void
  onStatusChange: (p: SchoolPerson, status: UserStatus) => void
  onResend: (p: SchoolPerson) => void
  onLogin: (p: SchoolPerson, mode: "password" | "email") => void
}

const UserTable = ({ people, loading, error, selfId, onView, onEdit, onStatusChange, onResend, onLogin }: UserTableProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }
  if (error) {
    return <p role="alert" className="px-5 py-10 text-center text-sm text-destructive">{error}</p>
  }
  if (people.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-40" aria-hidden />
        <p className="text-sm">No people found. Use Add person to invite someone.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Person</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden md:table-cell">Phone</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Role</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Status</th>
            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => {
            const role = p.memberships[0]?.role
            const RoleIcon = role ? ROLE_ICONS[role] : Users
            const status = displayStatus(p)
            const isSelf = p.id === selfId
            return (
              <motion.tr
                key={p.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-bold text-sm shrink-0" aria-hidden>
                      {p.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{p.full_name}{isSelf && ' (you)'}</p>
                      <p className="text-xs text-muted-foreground">{p.email || 'No email'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">{p.phone || '—'}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <RoleIcon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-sm">{p.memberships.map((m) => MEMBER_ROLE_LABEL[m.role]).join(', ') || 'No role'}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <Badge variant="outline" className={cn('text-xs capitalize', STATUS_COLORS[status])}>{status}</Badge>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(p)} aria-label={`View ${p.full_name}`}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${p.full_name}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(p)}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {status === 'invited' && (
                            <DropdownMenuItem onClick={() => onResend(p)}>
                              <Mail className="w-4 h-4 mr-2" /> New invitation link
                            </DropdownMenuItem>
                          )}
                          {directLoginManagement && p.user_id && !p.memberships.some((m) => m.role === 'school_admin') && (
                            <>
                              <DropdownMenuItem onClick={() => onLogin(p, 'password')}><KeyRound className="w-4 h-4 mr-2" /> Set temporary password</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onLogin(p, 'email')}><Mail className="w-4 h-4 mr-2" /> Change login email</DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          {p.status !== 'active' && (
                            <DropdownMenuItem onClick={() => onStatusChange(p, 'active')}>
                              <UserCheck className="w-4 h-4 mr-2" /> Reactivate
                            </DropdownMenuItem>
                          )}
                          {p.status !== 'suspended' && (
                            <DropdownMenuItem onClick={() => onStatusChange(p, 'suspended')}>
                              <UserMinus className="w-4 h-4 mr-2" /> Suspend
                            </DropdownMenuItem>
                          )}
                          {p.status !== 'banned' && (
                            <DropdownMenuItem onClick={() => onStatusChange(p, 'banned')} className="text-destructive">
                              <Ban className="w-4 h-4 mr-2" /> Ban
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </td>
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'all' | 'staff' | 'student' | 'parent'
const STAFF_ROLES: MemberRole[] = ['school_admin', 'headteacher', 'academic_coordinator', 'teacher', 'finance_officer', 'librarian', 'receptionist', 'auditor']

const UserManagementPage = () => {
  const { toast } = useToast()
  const { user } = useAuth()
  const schoolId = user!.schoolId
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [loginFor, setLoginFor] = useState<SchoolPerson | null>(null)
  const [loginMode, setLoginMode] = useState<"password" | "email">('password')
  const [people, setPeople] = useState<SchoolPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all')

  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<SchoolPerson | null>(null)
  const [viewing, setViewing] = useState<SchoolPerson | null>(null)
  const [issued, setIssued] = useState<{ link: string; name: string } | null>(null)

  const fetchPeople = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [profiles, memberships] = await Promise.all([
      db.from('profiles').select('*').eq('school_id', schoolId).order('created_at', { ascending: false }),
      db.from('school_memberships').select('id, profile_id, role, status').eq('school_id', schoolId),
    ])
    if (profiles.error || memberships.error) {
      setError('We could not load the people in this school. Try again.')
    } else {
      setPeople(
        (profiles.data ?? []).map((p) => ({
          ...p,
          memberships: (memberships.data ?? [])
            .filter((m) => m.profile_id === p.id)
            .map(({ id, role, status }) => ({ id, role, status })),
        })),
      )
    }
    setLoading(false)
  }, [schoolId])

  useEffect(() => { fetchPeople() }, [fetchPeople])

  const filtered = people.filter((p) => {
    const matchesSearch = `${p.full_name} ${p.email || ''} ${p.phone || ''}`.toLowerCase().includes(search.toLowerCase())
    const roles = p.memberships.map((m) => m.role)
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'staff' ? roles.some((r) => STAFF_ROLES.includes(r)) : roles.includes(activeTab))
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesTab && matchesStatus
  })

  const handleStatusChange = async (p: SchoolPerson, status: UserStatus) => {
    const { data, error: err } = await db.from('profiles').update({ status }).eq('id', p.id).select('id')
    if (err || !data?.length) {
      toast({ title: 'Could not change status', description: errorText(err, 'You cannot change this account.'), variant: 'destructive' })
      return
    }
    toast({ title: 'Status changed', description: `${p.full_name} is now ${status}.` })
    fetchPeople()
  }

  const handleResend = async (p: SchoolPerson) => {
    const m = p.memberships.find((x) => x.status === 'invited')
    if (!m || !p.email) return
    const { data, error: err } = await db.rpc('invite_member', {
      _school: schoolId, _full_name: p.full_name, _email: p.email, _role: m.role,
    })
    if (err) {
      toast({ title: 'Could not create a new link', description: err.message, variant: 'destructive' })
      return
    }
    setIssued({ link: inviteLink((data as { token: string }).token), name: p.full_name })
  }

  const copyLink = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.link)
      toast({ title: 'Link copied' })
    } catch {
      toast({ title: 'Copy the link by selecting it', variant: 'destructive' })
    }
  }

  const count = (pred: (p: SchoolPerson) => boolean) => people.filter(pred).length
  const has = (roles: MemberRole[]) => (p: SchoolPerson) => p.memberships.some((m) => roles.includes(m.role))
  const stats = {
    total: people.length,
    active: count((p) => displayStatus(p) === 'active'),
    staff: count(has(STAFF_ROLES)),
    students: count(has(['student'])),
    parents: count(has(['parent'])),
  }

  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="People" value={stats.total} icon={Users} color="primary" change={`${stats.active} active`} changeType="neutral" />
        <StatCard title="Staff" value={stats.staff} icon={UserCog} color="info" change="Admins, teachers and office staff" changeType="neutral" delay={0.08} />
        <StatCard title="Students" value={stats.students} icon={GraduationCap} color="success" change="With a student login" changeType="neutral" delay={0.16} />
        <StatCard title="Parents" value={stats.parents} icon={Users} color="warning" change="With a parent login" changeType="neutral" delay={0.24} />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b border-border">
          <div>
            <h1 className="font-heading text-xl font-bold text-card-foreground">People and access</h1>
            <p className="text-sm text-muted-foreground">Invite staff, students and parents to {user?.schoolName} and manage their access.</p>
          </div>
          <Button size="sm" onClick={() => setInviting(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add person
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <TabsList>
                <TabsTrigger value="all">Everyone</TabsTrigger>
                <TabsTrigger value="staff">Staff</TabsTrigger>
                <TabsTrigger value="student">Students</TabsTrigger>
                <TabsTrigger value="parent">Parents</TabsTrigger>
              </TabsList>
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
                  <Input placeholder="Search people…" aria-label="Search people" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UserStatus | 'all')}>
                  <SelectTrigger className="w-[130px] h-9" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            <UserTable
              people={filtered}
              loading={loading}
              error={error}
              selfId={user!.id}
              onView={setViewing}
              onEdit={setEditing}
              onStatusChange={handleStatusChange}
              onResend={handleResend}
              onLogin={(p, mode) => { setLoginMode(mode); setLoginFor(p) }}
            />
          </TabsContent>
        </Tabs>
      </motion.div>

      <LoginAccessDialog mode={loginMode} onClose={() => setLoginFor(null)}
        target={loginFor ? { schoolId, profileId: loginFor.id, name: loginFor.full_name, email: loginFor.email ?? '' } : null} />

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Add a person</DialogTitle>
            <DialogDescription>They get access once they open the invitation link and choose a password.</DialogDescription>
          </DialogHeader>
          <InviteForm
            schoolId={schoolId}
            defaultRole={activeTab === 'student' || activeTab === 'parent' ? activeTab : 'teacher'}
            onInvited={(link, name) => { setInviting(false); setIssued({ link, name }); fetchPeople() }}
            onCancel={() => setInviting(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={() => setIssued(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Invitation link for {issued?.name}</DialogTitle>
            <DialogDescription>
              Send this link to them privately. It works once and expires in 7 days. It is shown only now.
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={issued?.link ?? ''} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
          <DialogFooter>
            <Button onClick={copyLink}><Copy className="w-4 h-4 mr-2" /> Copy link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit {editing?.full_name}</DialogTitle>
            <DialogDescription>Every change is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          {editing && <EditForm person={editing} onSave={() => { setEditing(null); fetchPeople() }} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{viewing?.full_name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="grid gap-3 text-sm">
              {[
                ['Status', displayStatus(viewing)],
                ['Email', viewing.email || '—'],
                ['Phone', viewing.phone || '—'],
                ['Roles', viewing.memberships.map((m) => `${MEMBER_ROLE_LABEL[m.role]} (${m.status})`).join(', ') || 'None'],
                ['Date of birth', viewing.date_of_birth || '—'],
                ['Address', viewing.address || '—'],
                ['Emergency contact', viewing.emergency_contact || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-right">{value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

export default UserManagementPage
