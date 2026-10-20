import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Shield, BookOpen, Bell, Database, Users,
  ChevronRight, Lock, Key, Mail, MessageSquare,
  Building2, GraduationCap, DollarSign, Clock, RefreshCw
} from 'lucide-react'
import { useSchool } from '@/contexts/SchoolContext'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ─── Settings Card Component ──────────────────────────────────────────────────

interface SettingsCardProps {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
  action?: React.ReactNode
}

const SettingsCard = ({ icon: Icon, title, description, children, action }: SettingsCardProps) => (
  <Card>
    <CardHeader className="pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
        {action}
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
)

// ─── Settings Row ─────────────────────────────────────────────────────────────

interface SettingsRowProps {
  label: string
  description?: string
  children: React.ReactNode
}

const SettingsRow = ({ label, description, children }: SettingsRowProps) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-border last:border-0">
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
    <div className="sm:ml-4">{children}</div>
  </div>
)

// ─── Quick Link ───────────────────────────────────────────────────────────────

interface QuickLinkProps {
  icon: React.ElementType
  title: string
  description: string
  onClick: () => void
}

const QuickLink = ({ icon: Icon, title, description, onClick }: QuickLinkProps) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
  >
    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      <Icon className="w-5 h-5 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
  </button>
)

// ─── Main Page ────────────────────────────────────────────────────────────────

const AdminSettingsPage = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { schoolConfig, refetch: refetchSchool } = useSchool()
  const [activeTab, setActiveTab] = useState('general')

  // Settings state
  const [settings, setSettings] = useState({
    // Security
    require2FA: false,
    sessionTimeout: '60',
    maxLoginAttempts: '5',
    passwordMinLength: '8',
    requireSpecialChars: true,
    // Communication
    enableEmailNotifications: true,
    enableSMSNotifications: false,
    smsGateway: '',
    smsApiKey: '',
    emailFromAddress: '',
    // System
    maintenanceMode: false,
    autoBackup: true,
    backupFrequency: 'daily',
    dataRetentionDays: '365',
  })

  return (
    <DashboardLayout>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Administrator Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure system settings, security, and preferences</p>
          </div>
          <p className="max-w-sm rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" role="note">
            The security, communication and system options below are not saved yet. School details, calendar
            and grading are saved in School Setup.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <QuickLink
            icon={Building2}
            title="School Setup"
            description="Configure school info & branding"
            onClick={() => navigate('/setup')}
          />
          <QuickLink
            icon={Users}
            title="User Management"
            description="Manage staff, students & parents"
            onClick={() => navigate('/user-management')}
          />
          <QuickLink
            icon={Shield}
            title="Audit Logs"
            description="View system activity logs"
            onClick={() => navigate('/audit-logs')}
          />
          <QuickLink
            icon={Database}
            title="Data Export"
            description="Results, class and fee reports"
            onClick={() => navigate('/exams')}
          />
        </div>

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="academic">Academic</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="communication">Communication</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4">
            <SettingsCard
              icon={Building2}
              title="School Information"
              description="Basic school details and branding"
              action={
                <Button variant="outline" size="sm" onClick={() => navigate('/setup')}>
                  Edit in Setup Wizard
                </Button>
              }
            >
              <div className="space-y-3">
                <SettingsRow label="School Name">
                  <span className="text-sm font-medium">{schoolConfig?.school_name || 'Not configured'}</span>
                </SettingsRow>
                <SettingsRow label="School Type">
                  <span className="text-sm capitalize">{schoolConfig?.school_type?.replace('_', ' ') || '—'}</span>
                </SettingsRow>
                <SettingsRow label="Country">
                  <span className="text-sm">{schoolConfig?.country || '—'}</span>
                </SettingsRow>
                <SettingsRow label="Currency">
                  <span className="text-sm">{schoolConfig?.currency || 'USD'}</span>
                </SettingsRow>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Academic Settings */}
          <TabsContent value="academic" className="space-y-4">
            <SettingsCard
              icon={GraduationCap}
              title="Academic Configuration"
              description="Grading system and academic year settings"
            >
              <div className="space-y-3">
                <SettingsRow label="Academic Year Format" description="How your school year is divided">
                  <span className="text-sm capitalize">{schoolConfig?.academic_year_format || 'Semester'}</span>
                </SettingsRow>
                <SettingsRow label="Grading System" description="How student performance is scored">
                  <span className="text-sm capitalize">{schoolConfig?.grading_system?.replace('_', ' ') || 'Percentage'}</span>
                </SettingsRow>
              </div>
            </SettingsCard>

            <SettingsCard
              icon={Clock}
              title="Class Schedule"
              description="Default class timing and periods"
            >
              <div className="space-y-3">
                <SettingsRow label="School Start Time">
                  <Input type="time" defaultValue="08:00" className="w-32 h-9" />
                </SettingsRow>
                <SettingsRow label="School End Time">
                  <Input type="time" defaultValue="15:30" className="w-32 h-9" />
                </SettingsRow>
                <SettingsRow label="Period Duration">
                  <Select defaultValue="45">
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-4">
            <SettingsCard
              icon={Lock}
              title="Authentication"
              description="Login security and password policies"
            >
              <div className="space-y-3">
                <SettingsRow label="Require Two-Factor Authentication" description="Require 2FA for admin accounts">
                  <Switch
                    checked={settings.require2FA}
                    onCheckedChange={(v) => setSettings({ ...settings, require2FA: v })}
                  />
                </SettingsRow>
                <SettingsRow label="Session Timeout" description="Auto-logout after inactivity">
                  <Select
                    value={settings.sessionTimeout}
                    onValueChange={(v) => setSettings({ ...settings, sessionTimeout: v })}
                  >
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
                <SettingsRow label="Max Login Attempts" description="Lock account after failed attempts">
                  <Select
                    value={settings.maxLoginAttempts}
                    onValueChange={(v) => setSettings({ ...settings, maxLoginAttempts: v })}
                  >
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 attempts</SelectItem>
                      <SelectItem value="5">5 attempts</SelectItem>
                      <SelectItem value="10">10 attempts</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
              </div>
            </SettingsCard>

            <SettingsCard
              icon={Key}
              title="Password Policy"
              description="Requirements for user passwords"
            >
              <div className="space-y-3">
                <SettingsRow label="Minimum Password Length">
                  <Select
                    value={settings.passwordMinLength}
                    onValueChange={(v) => setSettings({ ...settings, passwordMinLength: v })}
                  >
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 characters</SelectItem>
                      <SelectItem value="8">8 characters</SelectItem>
                      <SelectItem value="10">10 characters</SelectItem>
                      <SelectItem value="12">12 characters</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
                <SettingsRow label="Require Special Characters" description="@, #, $, etc.">
                  <Switch
                    checked={settings.requireSpecialChars}
                    onCheckedChange={(v) => setSettings({ ...settings, requireSpecialChars: v })}
                  />
                </SettingsRow>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Communication Settings */}
          <TabsContent value="communication" className="space-y-4">
            <SettingsCard
              icon={Mail}
              title="Email Notifications"
              description="Configure email alerts and notifications"
            >
              <div className="space-y-3">
                <SettingsRow label="Enable Email Notifications">
                  <Switch
                    checked={settings.enableEmailNotifications}
                    onCheckedChange={(v) => setSettings({ ...settings, enableEmailNotifications: v })}
                  />
                </SettingsRow>
                <SettingsRow label="From Email Address" description="Sender address for system emails">
                  <Input
                    value={settings.emailFromAddress}
                    onChange={(e) => setSettings({ ...settings, emailFromAddress: e.target.value })}
                    placeholder="noreply@school.edu"
                    className="w-56 h-9"
                  />
                </SettingsRow>
              </div>
            </SettingsCard>

            <SettingsCard
              icon={MessageSquare}
              title="SMS Gateway"
              description="Configure SMS notifications for parents"
            >
              <div className="space-y-3">
                <SettingsRow label="Enable SMS Notifications">
                  <Switch
                    checked={settings.enableSMSNotifications}
                    onCheckedChange={(v) => setSettings({ ...settings, enableSMSNotifications: v })}
                  />
                </SettingsRow>
                <SettingsRow label="SMS Provider">
                  <Select
                    value={settings.smsGateway}
                    onValueChange={(v) => setSettings({ ...settings, smsGateway: v })}
                  >
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="africastalking">Africa's Talking</SelectItem>
                      <SelectItem value="nexmo">Vonage (Nexmo)</SelectItem>
                      <SelectItem value="custom">Custom API</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* System Settings */}
          <TabsContent value="system" className="space-y-4">
            <SettingsCard
              icon={Database}
              title="Data & Backup"
              description="Backup and data retention settings"
            >
              <div className="space-y-3">
                <SettingsRow label="Automatic Backups" description="Regularly backup system data">
                  <Switch
                    checked={settings.autoBackup}
                    onCheckedChange={(v) => setSettings({ ...settings, autoBackup: v })}
                  />
                </SettingsRow>
                <SettingsRow label="Backup Frequency">
                  <Select
                    value={settings.backupFrequency}
                    onValueChange={(v) => setSettings({ ...settings, backupFrequency: v })}
                  >
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
                <SettingsRow label="Data Retention" description="How long to keep old records">
                  <Select
                    value={settings.dataRetentionDays}
                    onValueChange={(v) => setSettings({ ...settings, dataRetentionDays: v })}
                  >
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                      <SelectItem value="730">2 years</SelectItem>
                      <SelectItem value="1825">5 years</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingsRow>
              </div>
            </SettingsCard>

            <SettingsCard
              icon={RefreshCw}
              title="Maintenance Mode"
              description="Take the system offline for maintenance"
            >
              <div className="space-y-3">
                <SettingsRow label="Enable Maintenance Mode" description="Only admins can access the system">
                  <Switch
                    checked={settings.maintenanceMode}
                    onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
                  />
                </SettingsRow>
              </div>
            </SettingsCard>
          </TabsContent>
        </Tabs>
      </motion.div>
    </DashboardLayout>
  )
}

export default AdminSettingsPage
