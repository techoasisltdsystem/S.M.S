import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { db } from '@/lib/db'

export interface SchoolConfig {
  id: string
  school_name: string
  school_address: string
  phone_number: string
  email: string
  country: string
  currency: string
  tagline: string
  school_type: string
  academic_year_format: string
  grading_system: string
  logo_url: string
  banner_url: string
  primary_color: string
  setup_completed: boolean
}

interface SchoolContextType {
  schoolConfig: SchoolConfig | null
  loading: boolean
  refetch: () => Promise<void>
  isSetupComplete: boolean
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined)

export const SchoolProvider = ({ children }: { children: ReactNode }) => {
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const { data } = await db
        .from('school_config')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) setSchoolConfig(data as SchoolConfig)
      else setSchoolConfig(null)
    } catch {
      // Supabase not configured yet — graceful fallback
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchConfig() }, [])

  return (
    <SchoolContext.Provider
      value={{
        schoolConfig,
        loading,
        refetch: fetchConfig,
        isSetupComplete: !!schoolConfig?.setup_completed,
      }}
    >
      {children}
    </SchoolContext.Provider>
  )
}

export const useSchool = () => {
  const ctx = useContext(SchoolContext)
  if (!ctx) throw new Error('useSchool must be used within SchoolProvider')
  return ctx
}
