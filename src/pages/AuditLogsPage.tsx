import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  Shield, Search, Filter, Download, RefreshCw, User, Settings,
  UserPlus, UserMinus, Ban, Key, LogIn, LogOut, AlertTriangle,
  ChevronLeft, ChevronRight, Eye, Loader2
} from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import StatCard from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// Types - use database types
import type { Tables, Enums } from '@/integrations/supabase/types'

type AuditAction = Enums<'audit_action'>
type AuditLog = Tables<'audit_logs'>

// Action metadata
const ACTION_META: Record<AuditAction, { label: string; icon: React.ElementType; color: string }> = {
  user_created: { label: 'User Created', icon: UserPlus, color: 'text-success' },
  user_updated: { label: 'User Updated', icon: User, color: 'text-info' },
  user_deleted: { label: 'User Deleted', icon: UserMinus, color: 'text-destructive' },
  user_banned: { label: 'User Banned', icon: Ban, color: 'text-destructive' },
  user_suspended: { label: 'User Suspended', icon: AlertTriangle, color: 'text-warning' },
  user_activated: { label: 'User Activated', icon: User, color: 'text-success' },
  role_changed: { label: 'Role Changed', icon: Shield, color: 'text-primary' },
  config_updated: { label: 'Config Updated', icon: Settings, color: 'text-info' },
  login: { label: 'Login', icon: LogIn, color: 'text-success' },
  logout: { label: 'Logout', icon: LogOut, color: 'text-muted-foreground' },
  password_reset: { label: 'Password Reset', icon: Key, color: 'text-warning' },
  permission_changed: { label: 'Permission Changed', icon: Shield, color: 'text-primary' },
  school_created: { label: 'School Created', icon: Settings, color: 'text-success' },
  school_updated: { label: 'School Updated', icon: Settings, color: 'text-info' },
  member_invited: { label: 'Person Invited', icon: UserPlus, color: 'text-success' },
  invitation_accepted: { label: 'Invitation Accepted', icon: LogIn, color: 'text-success' },
  student_enrolled: { label: 'Student Enrolled', icon: UserPlus, color: 'text-success' },
  enrollment_changed: { label: 'Enrolment Changed', icon: User, color: 'text-info' },
  guardian_linked: { label: 'Guardian Link Changed', icon: Shield, color: 'text-primary' },
  attendance_corrected: { label: 'Attendance Corrected', icon: AlertTriangle, color: 'text-warning' },
  results_submitted: { label: 'Results Submitted', icon: Eye, color: 'text-info' },
  results_approved: { label: 'Results Approved', icon: Shield, color: 'text-success' },
  results_published: { label: 'Results Published', icon: Eye, color: 'text-success' },
  results_reopened: { label: 'Results Reopened', icon: AlertTriangle, color: 'text-warning' },
  record_created: { label: 'Record Added', icon: UserPlus, color: 'text-success' },
  record_updated: { label: 'Record Changed', icon: Settings, color: 'text-info' },
  record_deleted: { label: 'Record Removed', icon: UserMinus, color: 'text-destructive' },
  message_hidden: { label: 'Message Hidden', icon: Ban, color: 'text-warning' },
  conversation_started: { label: 'Conversation Started', icon: User, color: 'text-info' },
  result_correction_requested: { label: 'Correction Requested', icon: Settings, color: 'text-warning' },
  results_corrected: { label: 'Result Corrected', icon: Settings, color: 'text-info' },
  correction_rejected: { label: 'Correction Rejected', icon: Ban, color: 'text-destructive' },
  report_exported: { label: 'Report Exported', icon: Download, color: 'text-muted-foreground' },
  grading_scale_changed: { label: 'Grading Scale Changed', icon: Settings, color: 'text-info' },
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const AuditLogsPage = () => {
  const { toast } = useToast()
  const schoolId = useAuth().user!.schoolId
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all')
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 20

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = db
        .from('audit_logs')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })

      // Date filter
      if (dateFilter !== 'all') {
        const now = new Date()
        let startDate: Date
        if (dateFilter === 'today') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        } else if (dateFilter === 'week') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        } else {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        }
        query = query.gte('created_at', startDate.toISOString())
      }

      // Action filter
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter)
      }

      const { data, error } = await query

      if (error) throw error
      setLogs((data || []) as AuditLog[])
    } catch (err) {
      console.error('Error fetching audit logs:', err)
      toast({ title: 'Error', description: 'Failed to load audit logs', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [dateFilter, actionFilter, toast, schoolId])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Search filter (client-side)
  const filteredLogs = logs.filter((log) => {
    const searchStr = `${log.actor_name || ''} ${log.target_name || ''} ${log.action}`.toLowerCase()
    return searchStr.includes(search.toLowerCase())
  })

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / perPage)
  const paginatedLogs = filteredLogs.slice((page - 1) * perPage, page * perPage)

  // Stats
  const todayLogs = logs.filter((l) => {
    const logDate = new Date(l.created_at)
    const today = new Date()
    return logDate.toDateString() === today.toDateString()
  })

  const userActions = logs.filter((l) => l.action.startsWith('user_')).length
  const configActions = logs.filter((l) => l.action === 'config_updated').length
  const securityActions = logs.filter((l) => ['login', 'logout', 'password_reset', 'user_banned'].includes(l.action)).length

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Action', 'Actor', 'Target', 'Details'].join(','),
      ...filteredLogs.map((log) =>
        [
          format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
          log.action,
          log.actor_name || '',
          log.target_name || '',
          JSON.stringify(log.details),
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast({ title: 'Export complete', description: `Exported ${filteredLogs.length} records.` })
  }

  return (
    <DashboardLayout>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Logs" value={logs.length} icon={Shield} color="primary" change="All time" changeType="neutral" />
        <StatCard title="Today's Activity" value={todayLogs.length} icon={Shield} color="info" change="Last 24 hours" changeType="neutral" delay={0.08} />
        <StatCard title="User Actions" value={userActions} icon={User} color="success" change="Create, update, delete" changeType="neutral" delay={0.16} />
        <StatCard title="Security Events" value={securityActions} icon={AlertTriangle} color="warning" change="Login, ban, etc." changeType="neutral" delay={0.24} />
      </div>

      {/* Main Card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b border-border">
          <div>
            <h1 className="font-heading text-xl font-bold text-card-foreground">Audit Logs</h1>
            <p className="text-sm text-muted-foreground">Track all administrator actions and system events</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1.5" /> Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-border bg-muted/30">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by actor or target..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 h-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v as AuditAction | 'all'); setPage(1) }}>
            <SelectTrigger className="w-[160px] h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {Object.entries(ACTION_META).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v as typeof dateFilter); setPage(1) }}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : paginatedLogs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No audit logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Timestamp</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Action</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden md:table-cell">Actor</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden lg:table-cell">Target</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log, i) => {
                  const meta = ACTION_META[log.action] || { label: log.action, icon: Shield, color: 'text-muted-foreground' }
                  const Icon = meta.icon
                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm text-card-foreground">{format(new Date(log.created_at), 'MMM d, yyyy')}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(log.created_at), 'HH:mm:ss')}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('w-4 h-4', meta.color)} />
                          <span className="text-sm font-medium">{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
                        {log.actor_name || 'System'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground hidden lg:table-cell">
                        {log.target_name || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedLog(log)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, filteredLogs.length)} of {filteredLogs.length}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Timestamp</span>
                  <span>{format(new Date(selectedLog.created_at), 'MMM d, yyyy HH:mm:ss')}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Action</span>
                  <Badge variant="outline">{ACTION_META[selectedLog.action]?.label || selectedLog.action}</Badge>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Actor</span>
                  <span>{selectedLog.actor_name || 'System'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Target Type</span>
                  <span className="capitalize">{selectedLog.target_type}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Target</span>
                  <span>{selectedLog.target_name || '—'}</span>
                </div>
                {selectedLog.ip_address && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">IP Address</span>
                    <span className="font-mono text-xs">{selectedLog.ip_address}</span>
                  </div>
                )}
              </div>

              {Object.keys(selectedLog.details || {}).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Additional Details</p>
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

export default AuditLogsPage
