import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Download, Eye, MoreHorizontal, Users, UserCheck, UserX,
  Ban, UserMinus, Pencil, Trash2, Shield, GraduationCap, UserCog, Loader2
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// Types
type AppRole = 'admin' | 'teacher' | 'student' | 'parent'
type UserStatus = 'active' | 'suspended' | 'banned' | 'inactive'

interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  status: UserStatus
  date_of_birth: string | null
  address: string | null
  emergency_contact: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface UserWithRole extends Profile {
  roles: AppRole[]
}

const STATUS_COLORS: Record<UserStatus, string> = {
  active: 'bg-success/10 text-success border-success/20',
  suspended: 'bg-warning/10 text-warning border-warning/20',
  banned: 'bg-destructive/10 text-destructive border-destructive/20',
  inactive: 'bg-muted text-muted-foreground border-border',
}

const ROLE_ICONS: Record<AppRole, React.ElementType> = {
  admin: Shield,
  teacher: UserCog,
  student: GraduationCap,
  parent: Users,
}

// ─── User Form ────────────────────────────────────────────────────────────────

interface UserFormProps {
  user?: UserWithRole | null
  defaultRole?: AppRole
  onSave: () => void
  onCancel: () => void
}

const UserForm = ({ user, defaultRole = 'student', onSave, onCancel }: UserFormProps) => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    date_of_birth: user?.date_of_birth || '',
    address: user?.address || '',
    emergency_contact: user?.emergency_contact || '',
    notes: user?.notes || '',
    role: user?.roles?.[0] || defaultRole,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      if (user) {
        // Update existing user
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: form.full_name.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            date_of_birth: form.date_of_birth || null,
            address: form.address.trim() || null,
            emergency_contact: form.emergency_contact.trim() || null,
            notes: form.notes.trim() || null,
          })
          .eq('id', user.id)

        if (profileError) throw profileError

        // Update role if changed
        if (form.role !== user.roles?.[0]) {
          await supabase.from('user_roles').delete().eq('user_id', user.id)
          await supabase.from('user_roles').insert({ user_id: user.id, role: form.role })
          
          // Log the action
          await supabase.from('audit_logs').insert({
            action: 'role_changed',
            target_type: 'user',
            target_id: user.id,
            target_name: form.full_name,
            details: { old_role: user.roles?.[0], new_role: form.role },
          })
        }

        await supabase.from('audit_logs').insert({
          action: 'user_updated',
          target_type: 'user',
          target_id: user.id,
          target_name: form.full_name,
        })

        toast({ title: 'User updated successfully' })
      } else {
        // Create new user
        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            full_name: form.full_name.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            date_of_birth: form.date_of_birth || null,
            address: form.address.trim() || null,
            emergency_contact: form.emergency_contact.trim() || null,
            notes: form.notes.trim() || null,
            status: 'active',
          })
          .select()
          .single()

        if (profileError) throw profileError

        // Assign role
        await supabase.from('user_roles').insert({ user_id: newProfile.id, role: form.role })

        // Log the action
        await supabase.from('audit_logs').insert({
          action: 'user_created',
          target_type: 'user',
          target_id: newProfile.id,
          target_name: form.full_name,
          details: { role: form.role },
        })

        toast({ title: 'User created successfully' })
      }
      onSave()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save user'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name <span className="text-destructive">*</span></Label>
          <Input
            id="full_name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="John Doe"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="teacher">Teacher / Staff</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="parent">Parent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="john@school.edu"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+1 234 567 8900"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dob">Date of Birth</Label>
          <Input
            id="dob"
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emergency">Emergency Contact</Label>
          <Input
            id="emergency"
            value={form.emergency_contact}
            onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
            placeholder="Parent/Guardian phone"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Street, City, Country"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Any additional information..."
        />
      </div>

      <DialogFooter className="gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {user ? 'Update User' : 'Create User'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── User Table ───────────────────────────────────────────────────────────────

interface UserTableProps {
  users: UserWithRole[]
  loading: boolean
  onView: (user: UserWithRole) => void
  onEdit: (user: UserWithRole) => void
  onStatusChange: (user: UserWithRole, status: UserStatus) => void
  onDelete: (user: UserWithRole) => void
}

const UserTable = ({ users, loading, onView, onEdit, onStatusChange, onDelete }: UserTableProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No users found</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">User</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden md:table-cell">Contact</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Role</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Status</th>
            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, i) => {
            const RoleIcon = ROLE_ICONS[user.roles?.[0] || 'student']
            return (
              <motion.tr
                key={user.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-bold text-sm shrink-0">
                      {user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email || 'No email'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
                  {user.phone || '—'}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <RoleIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm capitalize">{user.roles?.[0] || 'None'}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <Badge variant="outline" className={cn('text-xs capitalize', STATUS_COLORS[user.status])}>
                    {user.status}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(user)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(user)}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status !== 'active' && (
                          <DropdownMenuItem onClick={() => onStatusChange(user, 'active')}>
                            <UserCheck className="w-4 h-4 mr-2" /> Activate
                          </DropdownMenuItem>
                        )}
                        {user.status !== 'suspended' && (
                          <DropdownMenuItem onClick={() => onStatusChange(user, 'suspended')}>
                            <UserMinus className="w-4 h-4 mr-2" /> Suspend
                          </DropdownMenuItem>
                        )}
                        {user.status !== 'banned' && (
                          <DropdownMenuItem onClick={() => onStatusChange(user, 'banned')} className="text-destructive">
                            <Ban className="w-4 h-4 mr-2" /> Ban
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(user)} className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

const UserManagementPage = () => {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<AppRole | 'all'>('all')
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all')

  // Dialog states
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null)
  const [viewingUser, setViewingUser] = useState<UserWithRole | null>(null)
  const [deletingUser, setDeletingUser] = useState<UserWithRole | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      const { data: roles } = await supabase.from('user_roles').select('*')

      const usersWithRoles: UserWithRole[] = (profiles || []).map((p) => ({
        ...p,
        roles: (roles || []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }))

      setUsers(usersWithRoles)
    } catch (err) {
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const filteredUsers = users.filter((u) => {
    const matchesSearch = `${u.full_name} ${u.email || ''} ${u.phone || ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesTab = activeTab === 'all' || u.roles?.includes(activeTab)
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter
    return matchesSearch && matchesTab && matchesStatus
  })

  const handleStatusChange = async (user: UserWithRole, newStatus: UserStatus) => {
    try {
      await supabase.from('profiles').update({ status: newStatus }).eq('id', user.id)

      const actionMap: Record<UserStatus, string> = {
        active: 'user_activated',
        suspended: 'user_suspended',
        banned: 'user_banned',
        inactive: 'user_updated',
      }

      await supabase.from('audit_logs').insert({
        action: actionMap[newStatus] as 'user_banned' | 'user_suspended' | 'user_activated' | 'user_updated',
        target_type: 'user',
        target_id: user.id,
        target_name: user.full_name,
        details: { old_status: user.status, new_status: newStatus },
      })

      toast({ title: `User ${newStatus}`, description: `${user.full_name} has been ${newStatus}.` })
      fetchUsers()
    } catch {
      toast({ title: 'Error', description: 'Failed to update user status', variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    try {
      await supabase.from('audit_logs').insert({
        action: 'user_deleted',
        target_type: 'user',
        target_id: deletingUser.id,
        target_name: deletingUser.full_name,
      })

      await supabase.from('profiles').delete().eq('id', deletingUser.id)

      toast({ title: 'User deleted', description: `${deletingUser.full_name} has been removed.` })
      setDeletingUser(null)
      fetchUsers()
    } catch {
      toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' })
    }
  }

  // Stats
  const stats = {
    total: users.length,
    staff: users.filter((u) => u.roles?.includes('teacher') || u.roles?.includes('admin')).length,
    students: users.filter((u) => u.roles?.includes('student')).length,
    parents: users.filter((u) => u.roles?.includes('parent')).length,
    active: users.filter((u) => u.status === 'active').length,
  }

  return (
    <DashboardLayout>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Users" value={stats.total} icon={Users} color="primary" change={`${stats.active} active`} changeType="positive" />
        <StatCard title="Staff Members" value={stats.staff} icon={UserCog} color="info" change="Teachers & Admins" changeType="neutral" delay={0.08} />
        <StatCard title="Students" value={stats.students} icon={GraduationCap} color="success" change="Enrolled" changeType="neutral" delay={0.16} />
        <StatCard title="Parents" value={stats.parents} icon={Users} color="warning" change="Registered" changeType="neutral" delay={0.24} />
      </div>

      {/* Main Card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b border-border">
          <div>
            <h1 className="font-heading text-xl font-bold text-card-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground">Manage staff, students, and parent accounts</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1.5" /> Export
            </Button>
            <Button size="sm" onClick={() => { setEditingUser(null); setShowForm(true) }}>
              <Plus className="w-4 h-4 mr-1.5" /> Add User
            </Button>
          </div>
        </div>

        {/* Tabs & Filters */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AppRole | 'all')}>
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <TabsList>
                <TabsTrigger value="all">All Users</TabsTrigger>
                <TabsTrigger value="teacher">Staff</TabsTrigger>
                <TabsTrigger value="student">Students</TabsTrigger>
                <TabsTrigger value="parent">Parents</TabsTrigger>
              </TabsList>
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UserStatus | 'all')}>
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="banned">Banned</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Table */}
          <TabsContent value={activeTab} className="mt-0">
            <UserTable
              users={filteredUsers}
              loading={loading}
              onView={setViewingUser}
              onEdit={(u) => { setEditingUser(u); setShowForm(true) }}
              onStatusChange={handleStatusChange}
              onDelete={setDeletingUser}
            />
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Add/Edit User Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update user information and role.' : 'Create a new user account.'}
            </DialogDescription>
          </DialogHeader>
          <UserForm
            user={editingUser}
            defaultRole={activeTab !== 'all' ? activeTab : 'student'}
            onSave={() => { setShowForm(false); fetchUsers() }}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={!!viewingUser} onOpenChange={() => setViewingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">User Details</DialogTitle>
          </DialogHeader>
          {viewingUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-heading font-bold text-xl">
                  {viewingUser.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-lg">{viewingUser.full_name}</p>
                  <Badge variant="outline" className={cn('text-xs capitalize', STATUS_COLORS[viewingUser.status])}>
                    {viewingUser.status}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Email</span>
                  <span>{viewingUser.email || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{viewingUser.phone || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Role</span>
                  <span className="capitalize">{viewingUser.roles?.join(', ') || 'None'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Date of Birth</span>
                  <span>{viewingUser.date_of_birth || '—'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Address</span>
                  <span className="text-right max-w-[200px]">{viewingUser.address || '—'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Emergency Contact</span>
                  <span>{viewingUser.emergency_contact || '—'}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setViewingUser(null); setEditingUser(viewingUser); setShowForm(true) }}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit User
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingUser?.full_name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}

export default UserManagementPage
