import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase, supabaseConfigError } from "../lib/supabase"
import {
  activeCompanyReducer,
  initialActiveCompanyState,
  resolveActiveCompany,
  type ActiveCompany,
  type CompanyMembership,
} from "./activeCompany"

export type { ActiveCompany, CompanyMembership } from "./activeCompany"

type AuthContextValue = {
  configured: boolean
  configurationError: string
  session: Session | null
  user: User | null
  memberships: CompanyMembership[]
  activeCompany: ActiveCompany | null
  activeCompanyLoading: boolean
  activeCompanyError: string
  activeCompanyRevision: number
  loading: boolean
  authError: string
  membershipError: string
  refreshMemberships: () => Promise<void>
  activateCompany: (companyId: string) => Promise<boolean>
  clearActiveCompany: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type MembershipQueryRow = {
  company_id: string
  branch_id: string | null
  status: string
  companies: {
    id: string
    name: string
    legal_name: string
    address: string
    phone: string
    email: string
    tax_registration_number: string
    tax_rate: number
    currency: string
    country: string
    invoice_prefix: string
    invoice_footer: string
    logo_path: string | null
  }
  roles: {
    role_key: string
    display_name: string
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState("")
  const [memberships, setMemberships] = useState<CompanyMembership[]>([])
  const [membershipError, setMembershipError] = useState("")
  const [companyState, dispatchCompany] = useReducer(
    activeCompanyReducer,
    initialActiveCompanyState,
  )
  const companyStateRef = useRef(companyState)
  companyStateRef.current = companyState
  const membershipRequestRef = useRef(0)
  const authUserIdRef = useRef<string | null>(null)

  const clearActiveCompany = useCallback(() => {
    membershipRequestRef.current += 1
    dispatchCompany({ type: "clear" })
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setAuthError("")
        const nextUserId = nextSession?.user.id ?? null
        if (authUserIdRef.current !== nextUserId) {
          authUserIdRef.current = nextUserId
          membershipRequestRef.current += 1
          dispatchCompany({ type: "clear" })
          setMemberships([])
          setMembershipError("")
        }
        setSession(nextSession)
      }
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setAuthError(`Could not restore the sign-in session. ${error.message}`)
      }
      authUserIdRef.current = data.session?.user.id ?? null
      setSession(data.session)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const refreshMemberships = useCallback(async () => {
    if (!supabase || !session?.user) {
      setMemberships([])
      setMembershipError("")
      clearActiveCompany()
      return
    }

    const requestId = ++membershipRequestRef.current
    const selectedCompanyId = companyStateRef.current.activeCompany?.companyId ?? null
    const selectedRevision = companyStateRef.current.revision
    const { data, error } = await supabase
      .from("company_memberships")
      .select("company_id, branch_id, status, companies!inner(id, name, legal_name, address, phone, email, tax_registration_number, tax_rate, currency, country, invoice_prefix, invoice_footer, logo_path), roles!inner(role_key, display_name)")
      .eq("user_id", session.user.id)
      .eq("status", "active")

    if (error) {
      if (requestId !== membershipRequestRef.current) return
      setMembershipError(`Could not load active company memberships. ${error.message}`)
      setMemberships([])
      dispatchCompany({
        type: "deny",
        error: "Company access could not be verified. Select a company again after reconnecting.",
      })
      return
    }

    if (requestId !== membershipRequestRef.current) return
    const rows = (data ?? []) as unknown as MembershipQueryRow[]
    const mappedMemberships = rows.map((row) => ({
      companyId: row.company_id,
      companyName: row.companies.name,
      legalName: row.companies.legal_name,
      address: row.companies.address,
      phone: row.companies.phone,
      email: row.companies.email,
      taxRegistrationNumber: row.companies.tax_registration_number,
      taxRate: row.companies.tax_rate,
      currency: row.companies.currency,
      country: row.companies.country,
      invoicePrefix: row.companies.invoice_prefix,
      invoiceFooter: row.companies.invoice_footer,
      logoPath: row.companies.logo_path,
      roleKey: row.roles.role_key,
      roleName: row.roles.display_name,
      branchId: row.branch_id,
      status: row.status,
    }))
    setMembershipError("")
    setMemberships(mappedMemberships)
    if (
      selectedCompanyId &&
      companyStateRef.current.revision === selectedRevision
    ) {
      const verified = resolveActiveCompany(mappedMemberships, selectedCompanyId)
      if (verified) dispatchCompany({ type: "activate", company: verified })
      else dispatchCompany({
        type: "deny",
        error: "Your active company membership is no longer available.",
      })
    }
  }, [clearActiveCompany, session?.user?.id])

  const activateCompany = useCallback(async (companyId: string) => {
    const requestId = ++membershipRequestRef.current
    dispatchCompany({ type: "begin" })
    if (!companyId || !supabase || !session?.user) {
      dispatchCompany({
        type: "deny",
        error: "Sign in and select a company with an active membership.",
      })
      return false
    }

    const { data, error } = await supabase
      .from("company_memberships")
      .select("company_id, branch_id, status, companies!inner(id, name, legal_name, address, phone, email, tax_registration_number, tax_rate, currency, country, invoice_prefix, invoice_footer, logo_path), roles!inner(role_key, display_name)")
      .eq("company_id", companyId)
      .eq("user_id", session.user.id)
      .eq("status", "active")

    if (requestId !== membershipRequestRef.current) return false
    if (error) {
      dispatchCompany({
        type: "deny",
        error: `Company access could not be verified. ${error.message}`,
      })
      return false
    }

    const rows = (data ?? []) as unknown as MembershipQueryRow[]
    const access = resolveActiveCompany(rows.map((row) => ({
      companyId: row.company_id,
      companyName: row.companies.name,
      legalName: row.companies.legal_name,
      address: row.companies.address,
      phone: row.companies.phone,
      email: row.companies.email,
      taxRegistrationNumber: row.companies.tax_registration_number,
      taxRate: row.companies.tax_rate,
      currency: row.companies.currency,
      country: row.companies.country,
      invoicePrefix: row.companies.invoice_prefix,
      invoiceFooter: row.companies.invoice_footer,
      logoPath: row.companies.logo_path,
      roleKey: row.roles.role_key,
      roleName: row.roles.display_name,
      branchId: row.branch_id,
      status: row.status,
    })), companyId)

    if (!access) {
      dispatchCompany({
        type: "deny",
        error: "No active membership grants access to the selected company.",
      })
      return false
    }

    dispatchCompany({ type: "activate", company: access })
    return true
  }, [session?.user?.id])

  useEffect(() => {
    if (loading) return
    void refreshMemberships()
  }, [loading, refreshMemberships])

  useEffect(() => {
    if (loading || !session?.user) return
    const revalidate = () => {
      if (document.visibilityState !== "visible") return
      const activeId = companyStateRef.current.activeCompany?.companyId
      if (activeId) void activateCompany(activeId)
      else void refreshMemberships()
    }
    window.addEventListener("focus", revalidate)
    document.addEventListener("visibilitychange", revalidate)
    return () => {
      window.removeEventListener("focus", revalidate)
      document.removeEventListener("visibilitychange", revalidate)
    }
  }, [activateCompany, loading, refreshMemberships, session?.user?.id])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    configured: !supabaseConfigError,
    configurationError: supabaseConfigError,
    session,
    user: session?.user ?? null,
    memberships,
    activeCompany: companyState.activeCompany,
    activeCompanyLoading: companyState.loading,
    activeCompanyError: companyState.error,
    activeCompanyRevision: companyState.revision,
    loading,
    authError,
    membershipError,
    refreshMemberships,
    activateCompany,
    clearActiveCompany,
    signOut,
  }), [
    activateCompany,
    clearActiveCompany,
    companyState,
    loading,
    authError,
    membershipError,
    memberships,
    refreshMemberships,
    session,
    signOut,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
