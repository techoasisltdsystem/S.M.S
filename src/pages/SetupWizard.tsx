import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Check, ChevronRight, ChevronLeft, Upload, Building2,
  MapPin, BookOpen, DollarSign, Palette, Rocket,
  Loader2, X, Camera,
} from 'lucide-react'
import { db, uploadSchoolAsset } from '@/lib/db'
import { useSchool } from '@/contexts/SchoolContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import Logo from '@/components/ui/logo'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type SchoolType = 'primary' | 'junior_high' | 'senior_high' | 'college' | 'university' | 'mixed'
type AcademicYearFormat = 'semester' | 'trimester' | 'quarter' | 'annual'
type GradingSystem = 'percentage' | 'gpa_4' | 'gpa_5' | 'letter' | 'custom'

interface WizardData {
  schoolName: string
  schoolType: SchoolType
  tagline: string
  address: string
  phoneNumber: string
  email: string
  country: string
  academicYearFormat: AcademicYearFormat
  gradingSystem: GradingSystem
  currency: string
  logoFile: File | null
  logoPreview: string
  bannerFile: File | null
  bannerPreview: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: 'School Identity', icon: Building2 },
  { id: 2, title: 'Contact Info', icon: MapPin },
  { id: 3, title: 'Academic Setup', icon: BookOpen },
  { id: 4, title: 'Financial', icon: DollarSign },
  { id: 5, title: 'Branding', icon: Palette },
  { id: 6, title: 'Review & Launch', icon: Rocket },
]

const SCHOOL_TYPES: { value: SchoolType; label: string; emoji: string; desc: string }[] = [
  { value: 'primary', label: 'Primary School', emoji: '🏫', desc: 'Grades 1–6' },
  { value: 'junior_high', label: 'Junior High', emoji: '📗', desc: 'Grades 7–9' },
  { value: 'senior_high', label: 'Senior High', emoji: '📘', desc: 'Grades 10–12' },
  { value: 'college', label: 'College', emoji: '📙', desc: 'Diploma programs' },
  { value: 'university', label: 'University', emoji: '🎓', desc: 'Degree programs' },
  { value: 'mixed', label: 'Mixed Institution', emoji: '🏛️', desc: 'Multiple levels' },
]

const ACADEMIC_FORMATS: { value: AcademicYearFormat; label: string; desc: string }[] = [
  { value: 'semester', label: 'Semester', desc: '2 terms per year' },
  { value: 'trimester', label: 'Trimester', desc: '3 terms per year' },
  { value: 'quarter', label: 'Quarter', desc: '4 quarters per year' },
  { value: 'annual', label: 'Annual', desc: '1 full year' },
]

const GRADING_SYSTEMS: { value: GradingSystem; label: string; desc: string }[] = [
  { value: 'percentage', label: 'Percentage', desc: '0–100%' },
  { value: 'gpa_4', label: 'GPA 4.0', desc: '0.0 – 4.0 scale' },
  { value: 'gpa_5', label: 'GPA 5.0', desc: '0.0 – 5.0 scale' },
  { value: 'letter', label: 'Letter Grade', desc: 'A, B, C, D, F' },
  { value: 'custom', label: 'Custom', desc: 'Define your own' },
]

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA' },
  { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
]

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Australia',
  'Austria', 'Bangladesh', 'Belgium', 'Benin', 'Botswana', 'Brazil',
  'Burkina Faso', 'Cameroon', 'Canada', 'Chile', 'China', 'Colombia',
  'Congo', "Côte d'Ivoire", 'Cuba', 'Denmark', 'Egypt', 'Ethiopia',
  'Finland', 'France', 'Gambia', 'Germany', 'Ghana', 'Greece', 'Guinea',
  'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan', 'Kenya', 'Lebanon', 'Liberia', 'Libya',
  'Madagascar', 'Malawi', 'Malaysia', 'Mali', 'Mauritius', 'Mexico',
  'Morocco', 'Mozambique', 'Namibia', 'Netherlands', 'New Zealand',
  'Niger', 'Nigeria', 'Norway', 'Pakistan', 'Peru', 'Philippines',
  'Poland', 'Portugal', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia',
  'Senegal', 'Sierra Leone', 'Singapore', 'Somalia', 'South Africa',
  'South Korea', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland',
  'Tanzania', 'Thailand', 'Togo', 'Tunisia', 'Turkey', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Venezuela', 'Vietnam', 'Zambia', 'Zimbabwe',
]

const STEP_TITLES: Record<number, { heading: string; subtitle: string }> = {
  1: { heading: 'School Identity', subtitle: "Let's start with the basics about your institution" },
  2: { heading: 'Contact Information', subtitle: 'Help people reach you and find your school' },
  3: { heading: 'Academic Configuration', subtitle: "How does your school's academic system work?" },
  4: { heading: 'Financial Settings', subtitle: 'Configure your default currency for fees and invoices' },
  5: { heading: 'School Branding', subtitle: 'Upload your logo and banner for a professional touch' },
  6: { heading: 'Review & Launch', subtitle: "You're almost there! Review everything before launching" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SelectionCard = ({
  selected, onClick, children, className,
}: {
  selected: boolean; onClick: () => void; children: React.ReactNode; className?: string
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 text-center transition-all duration-200 cursor-pointer',
      selected
        ? 'border-primary bg-primary/5 shadow-sm'
        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50',
      className,
    )}
  >
    {selected && (
      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
        <Check className="w-3 h-3 text-primary-foreground" />
      </span>
    )}
    {children}
  </button>
)

// ─── Step Components ──────────────────────────────────────────────────────────

const StepIdentity = ({ data, onChange }: { data: WizardData; onChange: (k: keyof WizardData, v: string) => void }) => (
  <div className="space-y-6">
    <div className="space-y-2">
      <Label htmlFor="schoolName" className="text-sm font-medium">
        School Name <span className="text-destructive">*</span>
      </Label>
      <Input
        id="schoolName"
        value={data.schoolName}
        onChange={(e) => onChange('schoolName', e.target.value)}
        placeholder="e.g. Greenfield Academy"
        className="h-11 text-base"
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="tagline" className="text-sm font-medium">
        School Tagline / Motto <span className="text-muted-foreground text-xs">(optional)</span>
      </Label>
      <Input
        id="tagline"
        value={data.tagline}
        onChange={(e) => onChange('tagline', e.target.value)}
        placeholder="e.g. Excellence Through Knowledge"
        className="h-11"
      />
    </div>
    <div className="space-y-3">
      <Label className="text-sm font-medium">School Type</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SCHOOL_TYPES.map((type) => (
          <SelectionCard key={type.value} selected={data.schoolType === type.value} onClick={() => onChange('schoolType', type.value)}>
            <span className="text-2xl">{type.emoji}</span>
            <span className="text-xs font-semibold text-foreground leading-tight">{type.label}</span>
            <span className="text-[10px] text-muted-foreground">{type.desc}</span>
          </SelectionCard>
        ))}
      </div>
    </div>
  </div>
)

const StepContact = ({ data, onChange }: { data: WizardData; onChange: (k: keyof WizardData, v: string) => void }) => (
  <div className="space-y-5">
    <div className="space-y-2">
      <Label htmlFor="address">Street Address / Location</Label>
      <Textarea
        id="address"
        value={data.address}
        onChange={(e) => onChange('address', e.target.value)}
        placeholder="e.g. 45 Academy Road, Accra, Ghana"
        rows={2}
        className="resize-none"
      />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input id="phone" type="tel" value={data.phoneNumber} onChange={(e) => onChange('phoneNumber', e.target.value)} placeholder="+233 20 000 0000" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Official Email</Label>
        <Input id="email" type="email" value={data.email} onChange={(e) => onChange('email', e.target.value)} placeholder="admin@yourschool.edu" />
      </div>
    </div>
    <div className="space-y-2">
      <Label htmlFor="country">Country</Label>
      <Select value={data.country} onValueChange={(v) => onChange('country', v)}>
        <SelectTrigger id="country" className="h-10">
          <SelectValue placeholder="Select your country" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {COUNTRIES.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
)

const StepAcademic = ({ data, onChange }: { data: WizardData; onChange: (k: keyof WizardData, v: string) => void }) => (
  <div className="space-y-7">
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Academic Year Format</Label>
        <p className="text-xs text-muted-foreground mt-0.5">How is your school year divided?</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ACADEMIC_FORMATS.map((fmt) => (
          <SelectionCard key={fmt.value} selected={data.academicYearFormat === fmt.value} onClick={() => onChange('academicYearFormat', fmt.value)}>
            <span className="text-sm font-semibold text-foreground">{fmt.label}</span>
            <span className="text-[11px] text-muted-foreground">{fmt.desc}</span>
          </SelectionCard>
        ))}
      </div>
    </div>
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Grading System</Label>
        <p className="text-xs text-muted-foreground mt-0.5">How do you score student performance?</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {GRADING_SYSTEMS.map((sys) => (
          <SelectionCard key={sys.value} selected={data.gradingSystem === sys.value} onClick={() => onChange('gradingSystem', sys.value)}>
            <span className="text-sm font-semibold text-foreground">{sys.label}</span>
            <span className="text-[11px] text-muted-foreground">{sys.desc}</span>
          </SelectionCard>
        ))}
      </div>
    </div>
  </div>
)

const StepFinancial = ({ data, onChange }: { data: WizardData; onChange: (k: keyof WizardData, v: string) => void }) => {
  const selected = CURRENCIES.find((c) => c.code === data.currency)
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="currency">Default Currency</Label>
        <p className="text-xs text-muted-foreground">Used in fee invoices, receipts, and all financial documents.</p>
        <Select value={data.currency} onValueChange={(v) => onChange('currency', v)}>
          <SelectTrigger id="currency" className="h-10">
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                <span className="font-mono font-semibold mr-2 text-muted-foreground">{c.symbol}</span>
                {c.name} ({c.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected && (
        <div className="rounded-lg bg-muted/50 border border-border p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary font-mono">
            {selected.symbol}
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{selected.name}</p>
            <p className="text-xs text-muted-foreground">Currency code: {selected.code}</p>
          </div>
        </div>
      )}
    </div>
  )
}

const StepBranding = ({
  data,
  onFileChange,
  onRemoveFile,
}: {
  data: WizardData
  onFileChange: (type: 'logo' | 'banner', file: File, preview: string) => void
  onRemoveFile: (type: 'logo' | 'banner') => void
}) => {
  const logoRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => onFileChange(type, file, reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-6">
      {/* Logo */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">School Logo <span className="text-muted-foreground text-xs">(recommended)</span></Label>
        <p className="text-xs text-muted-foreground">Appears on the dashboard, reports, and official documents. PNG or SVG, max 5 MB.</p>
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e, 'logo')} />
        {data.logoPreview ? (
          <div className="relative inline-block">
            <div className="w-28 h-28 rounded-xl border-2 border-border overflow-hidden bg-muted flex items-center justify-center">
              <img src={data.logoPreview} alt="Logo preview" className="w-full h-full object-contain p-2" />
            </div>
            <button type="button" onClick={() => onRemoveFile('logo')} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive flex items-center justify-center shadow-md">
              <X className="w-3 h-3 text-destructive-foreground" />
            </button>
            <button type="button" onClick={() => logoRef.current?.click()} className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md">
              <Camera className="w-3.5 h-3.5 text-primary-foreground" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => logoRef.current?.click()} className="flex flex-col items-center gap-3 w-full max-w-xs border-2 border-dashed border-border rounded-xl p-8 hover:border-primary/50 hover:bg-muted/30 transition-all">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Click to upload logo</p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG or SVG · Max 5 MB</p>
            </div>
          </button>
        )}
      </div>

      {/* Banner */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">School Banner <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <p className="text-xs text-muted-foreground">Wide header image for dashboards and printed reports. Recommended 1200×300 px.</p>
        <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e, 'banner')} />
        {data.bannerPreview ? (
          <div className="relative">
            <div className="w-full h-28 rounded-xl border-2 border-border overflow-hidden bg-muted">
              <img src={data.bannerPreview} alt="Banner preview" className="w-full h-full object-cover" />
            </div>
            <button type="button" onClick={() => onRemoveFile('banner')} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-destructive flex items-center justify-center shadow-md">
              <X className="w-3.5 h-3.5 text-destructive-foreground" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => bannerRef.current?.click()} className="flex flex-col items-center gap-3 w-full border-2 border-dashed border-border rounded-xl p-6 hover:border-primary/50 hover:bg-muted/30 transition-all">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Upload className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Click to upload banner image</p>
              <p className="text-xs text-muted-foreground mt-0.5">Recommended 1200×300 px · PNG or JPG</p>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

const ReviewRow = ({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) => (
  <div className="flex items-start justify-between py-3 border-b border-border last:border-0">
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value || '—'}</p>
    </div>
    <button type="button" onClick={onEdit} className="text-xs text-primary hover:underline shrink-0 ml-4">Edit</button>
  </div>
)

const StepReview = ({ data, goToStep }: { data: WizardData; goToStep: (s: number) => void }) => {
  const currency = CURRENCIES.find((c) => c.code === data.currency)
  const schoolType = SCHOOL_TYPES.find((t) => t.value === data.schoolType)
  const academicFmt = ACADEMIC_FORMATS.find((f) => f.value === data.academicYearFormat)
  const gradingSys = GRADING_SYSTEMS.find((g) => g.value === data.gradingSystem)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Review your configuration before launching. Everything can be changed later in Settings.</p>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">School Identity</p>
        <ReviewRow label="School Name" value={data.schoolName} onEdit={() => goToStep(1)} />
        <ReviewRow label="School Type" value={schoolType?.label ?? ''} onEdit={() => goToStep(1)} />
        <ReviewRow label="Tagline / Motto" value={data.tagline} onEdit={() => goToStep(1)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact Information</p>
        <ReviewRow label="Address" value={data.address} onEdit={() => goToStep(2)} />
        <ReviewRow label="Phone" value={data.phoneNumber} onEdit={() => goToStep(2)} />
        <ReviewRow label="Email" value={data.email} onEdit={() => goToStep(2)} />
        <ReviewRow label="Country" value={data.country} onEdit={() => goToStep(2)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Academic & Financial</p>
        <ReviewRow label="Academic Format" value={academicFmt?.label ?? ''} onEdit={() => goToStep(3)} />
        <ReviewRow label="Grading System" value={gradingSys?.label ?? ''} onEdit={() => goToStep(3)} />
        <ReviewRow label="Currency" value={currency ? `${currency.name} (${currency.code})` : ''} onEdit={() => goToStep(4)} />
      </div>

      {(data.logoPreview || data.bannerPreview) && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Branding</p>
          <div className="flex items-center gap-4">
            {data.logoPreview && (
              <div className="w-16 h-16 rounded-lg border border-border overflow-hidden bg-muted">
                <img src={data.logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
              </div>
            )}
            {data.bannerPreview && (
              <div className="flex-1 h-16 rounded-lg border border-border overflow-hidden bg-muted">
                <img src={data.bannerPreview} alt="Banner" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Progress Sidebar ─────────────────────────────────────────────────────────

const WizardSidebar = ({
  currentStep, data, onStepClick,
}: {
  currentStep: number; data: WizardData; onStepClick: (s: number) => void
}) => (
  <div className="hidden lg:flex flex-col w-72 xl:w-80 bg-primary text-primary-foreground min-h-screen p-6 shrink-0">
    {/* School preview */}
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 flex items-center justify-center overflow-hidden">
          {data.logoPreview ? (
            <img src={data.logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
          ) : (
            <Logo className="w-7 h-7" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-bold text-sm text-primary-foreground truncate">
            {data.schoolName || 'Your School'}
          </p>
          {data.tagline && <p className="text-xs text-primary-foreground/60 truncate">{data.tagline}</p>}
        </div>
      </div>
      <div className="h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary-foreground rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <p className="text-xs text-primary-foreground/60 mt-1.5">Step {currentStep} of {STEPS.length}</p>
    </div>

    {/* Step list */}
    <nav className="space-y-1 flex-1">
      {STEPS.map((step) => {
        const isCompleted = step.id < currentStep
        const isCurrent = step.id === currentStep
        const isClickable = step.id < currentStep
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => isClickable && onStepClick(step.id)}
            disabled={!isClickable && !isCurrent}
            className={cn(
              'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors text-left',
              isCurrent && 'bg-primary-foreground/15 text-primary-foreground font-medium',
              isCompleted && 'text-primary-foreground/70 hover:bg-primary-foreground/10 cursor-pointer',
              !isCompleted && !isCurrent && 'text-primary-foreground/40 cursor-default',
            )}
          >
            <span
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                isCurrent && 'bg-primary-foreground text-primary',
                isCompleted && 'bg-primary-foreground/20 text-primary-foreground',
                !isCompleted && !isCurrent && 'bg-primary-foreground/10 text-primary-foreground/40',
              )}
            >
              {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.id}
            </span>
            <span>{step.title}</span>
          </button>
        )
      })}
    </nav>

    <div className="mt-6 pt-6 border-t border-primary-foreground/20">
      <p className="text-xs text-primary-foreground/50 leading-relaxed">
        All settings can be changed later from the Administrator Settings panel.
      </p>
    </div>
  </div>
)

// ─── Main Wizard ──────────────────────────────────────────────────────────────

const DEFAULT_DATA: WizardData = {
  schoolName: '',
  schoolType: 'mixed',
  tagline: '',
  address: '',
  phoneNumber: '',
  email: '',
  country: '',
  academicYearFormat: 'semester',
  gradingSystem: 'percentage',
  currency: 'USD',
  logoFile: null,
  logoPreview: '',
  bannerFile: null,
  bannerPreview: '',
}

const SetupWizard = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { schoolConfig, refetch } = useSchool()
  const [currentStep, setCurrentStep] = useState(1)
  const [saving, setSaving] = useState(false)

  const [data, setData] = useState<WizardData>(() => {
    if (schoolConfig) {
      return {
        schoolName: schoolConfig.school_name || '',
        schoolType: (schoolConfig.school_type as SchoolType) || 'mixed',
        tagline: schoolConfig.tagline || '',
        address: schoolConfig.school_address || '',
        phoneNumber: schoolConfig.phone_number || '',
        email: schoolConfig.email || '',
        country: schoolConfig.country || '',
        academicYearFormat: (schoolConfig.academic_year_format as AcademicYearFormat) || 'semester',
        gradingSystem: (schoolConfig.grading_system as GradingSystem) || 'percentage',
        currency: schoolConfig.currency || 'USD',
        logoFile: null,
        logoPreview: schoolConfig.logo_url || '',
        bannerFile: null,
        bannerPreview: schoolConfig.banner_url || '',
      }
    }
    return DEFAULT_DATA
  })

  const updateField = useCallback((key: keyof WizardData, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleFileChange = useCallback((type: 'logo' | 'banner', file: File, preview: string) => {
    if (type === 'logo') {
      setData((prev) => ({ ...prev, logoFile: file, logoPreview: preview }))
    } else {
      setData((prev) => ({ ...prev, bannerFile: file, bannerPreview: preview }))
    }
  }, [])

  const handleRemoveFile = useCallback((type: 'logo' | 'banner') => {
    if (type === 'logo') {
      setData((prev) => ({ ...prev, logoFile: null, logoPreview: '' }))
    } else {
      setData((prev) => ({ ...prev, bannerFile: null, bannerPreview: '' }))
    }
  }, [])

  const canProceed = () => {
    if (currentStep === 1 && !data.schoolName.trim()) return false
    return true
  }

  const handleNext = () => {
    if (!canProceed()) {
      toast({ title: 'Required field missing', description: 'Please enter the school name.', variant: 'destructive' })
      return
    }
    if (currentStep < STEPS.length) setCurrentStep((s) => s + 1)
  }

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1)
  }

  const handleSave = async () => {
    if (!data.schoolName.trim()) {
      toast({ title: 'School name is required', variant: 'destructive' })
      setCurrentStep(1)
      return
    }

    setSaving(true)
    try {
      let logoUrl = data.logoPreview
      let bannerUrl = data.bannerPreview

      if (data.logoFile) logoUrl = await uploadSchoolAsset(data.logoFile, 'logo')
      if (data.bannerFile) bannerUrl = await uploadSchoolAsset(data.bannerFile, 'banner')

      const payload = {
        school_name: data.schoolName.trim(),
        school_address: data.address.trim(),
        phone_number: data.phoneNumber.trim(),
        email: data.email.trim(),
        country: data.country,
        currency: data.currency,
        tagline: data.tagline.trim(),
        school_type: data.schoolType,
        academic_year_format: data.academicYearFormat,
        grading_system: data.gradingSystem,
        logo_url: logoUrl,
        banner_url: bannerUrl,
        setup_completed: true,
      }

      if (schoolConfig?.id) {
        const { error } = await db.from('school_config').update(payload).eq('id', schoolConfig.id)
        if (error) throw error
      } else {
        const { error } = await db.from('school_config').insert(payload)
        if (error) throw error
      }

      await refetch()
      toast({
        title: '🎉 School setup complete!',
        description: `${data.schoolName} is now configured and ready.`,
      })
      navigate('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration'
      toast({ title: 'Error saving configuration', description: message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const { heading, subtitle } = STEP_TITLES[currentStep]

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <StepIdentity data={data} onChange={updateField} />
      case 2: return <StepContact data={data} onChange={updateField} />
      case 3: return <StepAcademic data={data} onChange={updateField} />
      case 4: return <StepFinancial data={data} onChange={updateField} />
      case 5: return <StepBranding data={data} onFileChange={handleFileChange} onRemoveFile={handleRemoveFile} />
      case 6: return <StepReview data={data} goToStep={setCurrentStep} />
      default: return null
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <WizardSidebar currentStep={currentStep} data={data} onStepClick={setCurrentStep} />

      <div className="flex-1 flex flex-col">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 p-4 border-b border-border bg-card">
          <Logo className="w-7 h-7" />
          <div>
            <p className="font-heading font-bold text-sm">School Setup</p>
            <p className="text-xs text-muted-foreground">Step {currentStep} of {STEPS.length}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-10">
            {/* Step header */}
            <div className="mb-8">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                Step {currentStep} of {STEPS.length}
              </span>
              <h1 className="font-heading text-2xl font-bold text-foreground mt-3">{heading}</h1>
              <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
            </div>

            {/* Step content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
              <Button variant="outline" onClick={handleBack} disabled={currentStep === 1} className="gap-2">
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>

              {currentStep < STEPS.length ? (
                <Button onClick={handleNext} className="gap-2">
                  Continue <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving} className="gap-2 px-6">
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Launching...</>
                  ) : (
                    <><Rocket className="w-4 h-4" /> Launch School System</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SetupWizard
