import { useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom"
import { Building2, LockKeyhole, Mail, Moon, ShieldCheck, Sun } from "lucide-react"
import { useAuth } from "./AuthProvider"
import { supabase } from "../lib/supabase"
import { useTheme } from "../context/ThemeContext"

function AuthFrame({ children }: { children: ReactNode }) {
  const { configured, configurationError, authError } = useAuth()
  const { theme, toggleTheme } = useTheme()
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">UniversalERP</h1>
              <p className="text-sm text-slate-500">Secure company workspace</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-100"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        {!configured && (
          <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            {configurationError}
          </div>
        )}
        {authError && (
          <div role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            {authError}
          </div>
        )}
        {children}
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
          Legacy local ERP data remains separate and is not used as company workspace data.
        </p>
      </div>
    </main>
  )
}

export function LoginPage() {
  const { configured, user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const requestedReturnTo = (location.state as { from?: string } | null)?.from
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
    ? requestedReturnTo
    : "/workspace"

  if (loading) return <AuthFrame><p className="text-sm text-slate-600">Checking sign-in session…</p></AuthFrame>
  if (user) return <Navigate to={returnTo} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError("")
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    navigate(returnTo, { replace: true })
  }

  return (
    <AuthFrame>
      <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
      <p className="mt-1 text-sm text-slate-500">Sign in to a company workspace. Local ERP records remain separate.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <span className="relative mt-1 block">
            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 outline-none focus:border-emerald-600" />
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <span className="relative mt-1 block">
            <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 outline-none focus:border-emerald-600" />
          </span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={!configured || busy} className="h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
        <Link className="text-emerald-700 hover:underline" to="/auth/recover">Forgot password?</Link>
        <Link className="text-emerald-700 hover:underline" to="/auth/register">Register an account</Link>
      </div>
    </AuthFrame>
  )
}

export function RegistrationPage() {
  const { configured, user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const stateInvitation = (location.state as { invitation?: string } | null)?.invitation
  const queryInvitation = new URLSearchParams(location.search).get("returnTo")
  const requestedInvitation = stateInvitation ?? queryInvitation
  const invitationPath = requestedInvitation?.startsWith("/auth/invite/")
    ? requestedInvitation
    : undefined
  const signInState = invitationPath ? { from: invitationPath } : null

  if (loading) return <AuthFrame><p className="text-sm text-slate-600">Checking sign-in session…</p></AuthFrame>
  if (user) return <Navigate to={invitationPath ?? "/workspace"} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError("")
    setMessage("")
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: invitationPath
          ? `${window.location.origin}/auth/register?returnTo=${encodeURIComponent(invitationPath)}`
          : `${window.location.origin}/auth/login`,
      },
    })
    setBusy(false)
    if (signUpError) {
      setError(signUpError.message)
      return
    }
    if (data.session) {
      navigate(invitationPath ?? "/workspace", { replace: true })
    } else {
      setMessage("Account created. Confirm your email, then sign in to continue. No role or company privilege is accepted from registration metadata.")
    }
  }

  return (
    <AuthFrame>
      <h2 className="text-lg font-semibold text-slate-900">Create an account</h2>
      <p className="mt-1 text-sm text-slate-500">Public registration creates a user account only. Company ownership is assigned only by the protected company-registration transaction.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">Full name
          <input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-600" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Email
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-600" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Password
          <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-600" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <button disabled={!configured || busy} className="h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">Already registered? <Link className="text-emerald-700 hover:underline" to="/auth/login" state={signInState}>Sign in</Link></p>
      {message && invitationPath && (
        <p className="mt-2 text-sm text-slate-600">
          After confirming your email, <Link className="text-emerald-700 hover:underline" to="/auth/login" state={signInState}>sign in to accept the invitation</Link>.
        </p>
      )}
    </AuthFrame>
  )
}

export function RecoveryPage() {
  const { configured } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const isRecovery = new URLSearchParams(location.search).get("type") === "recovery"

  async function requestReset(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError("")
    setMessage("")
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/recover?type=recovery`,
    })
    setBusy(false)
    if (resetError) setError(resetError.message)
    else setMessage("If the account exists, a password recovery link has been sent.")
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError("")
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) setError(updateError.message)
    else setMessage("Password updated. You can now sign in to your company workspace.")
  }

  return (
    <AuthFrame>
      <h2 className="text-lg font-semibold text-slate-900">{isRecovery ? "Choose a new password" : "Password recovery"}</h2>
      <p className="mt-1 text-sm text-slate-500">Recovery is handled through the configured Supabase Auth project.</p>
      <form onSubmit={isRecovery ? updatePassword : requestReset} className="mt-5 space-y-4">
        {isRecovery ? (
          <label className="block text-sm font-medium text-slate-700">New password
            <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-600" />
          </label>
        ) : (
          <label className="block text-sm font-medium text-slate-700">Email
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-600" />
          </label>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <button disabled={!configured || busy} className="h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Please wait…" : isRecovery ? "Update password" : "Send recovery link"}
        </button>
      </form>
      <Link className="mt-4 inline-block text-sm text-emerald-700 hover:underline" to="/auth/login">Back to sign in</Link>
    </AuthFrame>
  )
}

export function InvitationPage() {
  const { token = "" } = useParams()
  const { configured, user, loading, refreshMemberships } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function accept() {
    if (!supabase || !token) return
    setBusy(true)
    setError("")
    const { error: acceptError } = await supabase.rpc("accept_company_invitation", {
      p_token: token,
    })
    setBusy(false)
    if (acceptError) {
      setError(acceptError.message)
      return
    }
    await refreshMemberships()
    setMessage("Invitation accepted. Your company membership is active.")
    navigate("/workspace", { replace: true })
  }

  return (
    <AuthFrame>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <ShieldCheck className="h-5 w-5 text-emerald-700" />
        Accept company invitation
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        The invitation is validated by the server, including its company, intended email, expiry,
        and single-use status.
      </p>
      {!user && !loading && (
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/auth/login" state={{ from: location.pathname }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Sign in</Link>
          <Link to="/auth/register" state={{ invitation: location.pathname }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Create account</Link>
        </div>
      )}
      {user && (
        <>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            Signed in as <strong>{user.email}</strong>. The server only accepts an invitation
            addressed to this verified account.
          </p>
          <button type="button" disabled={!configured || busy} onClick={() => void accept()} className="mt-4 h-11 w-full rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Validating invitation…" : "Accept invitation"}
          </button>
        </>
      )}
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </AuthFrame>
  )
}
