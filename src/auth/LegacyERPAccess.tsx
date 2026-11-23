import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "./AuthProvider"

function AccessMessage({ title, message, action }: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {action && <div className="mt-5">{action}</div>}
      </section>
    </main>
  )
}

export default function LegacyERPAccess() {
  const {
    configured,
    user,
    loading,
    memberships,
    membershipError,
    membershipLoading,
    activeCompany,
    activeCompanyLoading,
    activeCompanyError,
    activateCompany,
    refreshMemberships,
  } = useAuth()
  const location = useLocation()
  const activationAttempt = useRef<string | null>(null)
  const [selectedCompany, setSelectedCompany] = useState("")

  useEffect(() => {
    if (
      !loading &&
      user &&
      !membershipLoading &&
      memberships.length === 1 &&
      !activeCompany &&
      !activeCompanyLoading
    ) {
      const companyId = memberships[0].companyId
      if (activationAttempt.current !== companyId) {
        activationAttempt.current = companyId
        void activateCompany(companyId)
      }
    }
  }, [
    loading,
    user?.id,
    membershipLoading,
    memberships,
    activeCompany,
    activeCompanyLoading,
    activateCompany,
  ])

  if (loading) {
    return <AccessMessage title="Zaki Pharmacy ERP" message="Checking secure sign-in…" />
  }
  if (!configured) {
    return <AccessMessage title="ERP sign-in is not configured" message="The secure database connection is not configured for this deployment. The pharmacy data has not been loaded." />
  }
  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  }
  if (membershipLoading || activeCompanyLoading) {
    return <AccessMessage title="Opening Zaki Pharmacy ERP" message="Verifying pharmacy access and loading the saved company data…" />
  }
  if (membershipError) {
    return (
      <AccessMessage
        title="Could not verify pharmacy access"
        message={membershipError}
        action={<button type="button" onClick={() => void refreshMemberships()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Retry</button>}
      />
    )
  }
  if (!memberships.length) {
    return <AccessMessage title="No pharmacy access" message="This signed-in account does not have an active Zaki Pharmacy owner membership. Ask the account administrator to restore access." />
  }
  if (memberships.length > 1 && !activeCompany) {
    const current = selectedCompany || memberships[0].companyId
    return (
      <AccessMessage
        title="Select the pharmacy"
        message="Choose the company whose pharmacy records should open on this workstation."
        action={
          <div className="space-y-3">
            <select value={current} onChange={(event) => setSelectedCompany(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
              {memberships.map((membership) => (
                <option key={membership.companyId} value={membership.companyId}>{membership.companyName}</option>
              ))}
            </select>
            <button type="button" onClick={() => void activateCompany(current)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Continue</button>
          </div>
        }
      />
    )
  }
  if (!activeCompany) {
    return <AccessMessage title="Pharmacy access unavailable" message={activeCompanyError || "The active pharmacy could not be selected. Refresh the page and try again."} />
  }

  return <Outlet />
}
