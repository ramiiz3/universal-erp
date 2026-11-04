import { Link, Navigate } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"

export default function AI() {
  const { configured, configurationError, loading, user, activeCompany } = useAuth()

  if (!configured) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-white p-6 text-slate-900">
        <h1 className="text-xl font-semibold">Zaki AI requires the cloud workspace</h1>
        <p role="alert" className="mt-3 text-sm text-amber-900">{configurationError}</p>
        <p className="mt-3 text-sm text-slate-600">Configure the hosted Supabase URL and publishable key to use company-scoped AI search.</p>
      </section>
    )
  }

  if (loading) {
    return <main className="grid min-h-64 place-items-center text-sm text-slate-600">Checking your company workspace…</main>
  }

  if (!user) {
    return <Navigate to="/auth/login" replace state={{ from: "/workspace" }} />
  }

  if (!activeCompany) {
    return <Navigate to="/workspace" replace />
  }

  // Do not send the legacy localStorage snapshot to an external AI provider.
  // All Zaki AI questions now use the authenticated company-scoped cloud endpoint.
  return <Navigate to="/workspace/ai" replace />
}
