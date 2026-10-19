import React, { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'

export interface SchoolConfig {
  id: string
  school_id: string
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

// Settings of the school the signed-in user is working in. Signed-out
// visitors get none: the database only shows a school's settings to its members.
export const SchoolProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const schoolId = user?.schoolId ?? null
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    if (!schoolId) {
      setSchoolConfig(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data } = await db.from('school_config').select('*').eq('school_id', schoolId).maybeSingle()
      setSchoolConfig((data as SchoolConfig | null) ?? null)
    } catch {
      setSchoolConfig(null)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { fetchConfig() }, [fetchConfig])

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
