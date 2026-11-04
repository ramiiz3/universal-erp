import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom"
import {
  Building2,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Upload,
  Users,
} from "lucide-react"
import { useAuth } from "./AuthProvider"
import { LoginPage } from "./AuthPages"
import { supabase } from "../lib/supabase"
import type { CompanyMembership } from "./AuthProvider"
import { useTheme } from "../context/ThemeContext"
import WorkspaceShell from "../inventory-cloud/WorkspaceShell"
import ProductsPage from "../inventory-cloud/ProductsPage"
import WarehousesPage from "../inventory-cloud/WarehousesPage"
import InventoryPage from "../inventory-cloud/InventoryPage"
import MovementsPage from "../inventory-cloud/MovementsPage"
import {
  createBranchOnce,
  mapCompanyMembers,
  type CompanyMember,
} from "./workspaceManagement"

const EMPTY_COMPANY = {
  name: "",
  legalName: "",
  country: "",
  currency: "USD",
  taxRate: "0",
  address: "",
  phone: "",
  email: "",
  taxRegistrationNumber: "",
  invoicePrefix: "INV",
  invoiceFooter: "",
  defaultBranchName: "Main",
}

function SetupNotice() {
  const { configurationError } = useAuth()
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-white p-6">
        <h1 className="text-xl font-semibold text-slate-900">Company workspace setup required</h1>
        <p role="alert" className="mt-3 text-sm text-amber-900">{configurationError}</p>
        <p className="mt-3 text-sm text-slate-600">
          The legacy local ERP remains available separately. No company workspace data is read
          from its localStorage store.
        </p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-emerald-700">Open legacy local ERP</Link>
      </div>
    </main>
  )
}

function WorkspaceGuard() {
  const { configured, loading, user } = useAuth()
  if (!configured) return <SetupNotice />
  if (loading) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-600">Checking authenticated session…</main>
  }
  if (!user) return <Navigate to="/auth/login" replace state={{ from: "/workspace" }} />
  return <WorkspaceHome />
}

function InventoryWorkspaceGuard() {
  const { configured, loading, user } = useAuth()
  if (!configured) return <SetupNotice />
  if (loading) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-200">Checking authenticated session…</main>
  }
  if (!user) return <Navigate to="/auth/login" replace state={{ from: "/workspace/products" }} />
  return <Outlet />
}

function CreateCompanyForm({ onCreated }: { onCreated: (companyId: string) => void }) {
  const { refreshMemberships } = useAuth()
  const [values, setValues] = useState(EMPTY_COMPANY)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  function update(field: keyof typeof EMPTY_COMPANY, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError("")
    const { data, error: createError } = await supabase.rpc("create_company_with_owner", {
      p_name: values.name.trim(),
      p_legal_name: values.legalName.trim(),
      p_country: values.country.trim(),
      p_currency: values.currency.trim().toUpperCase(),
      p_tax_rate: Number(values.taxRate),
      p_address: values.address.trim(),
      p_phone: values.phone.trim(),
      p_email: values.email.trim(),
      p_tax_registration_number: values.taxRegistrationNumber.trim(),
      p_invoice_prefix: values.invoicePrefix.trim(),
      p_invoice_footer: values.invoiceFooter.trim(),
      p_default_branch_name: values.defaultBranchName.trim(),
    })
    setBusy(false)
    if (createError) {
      setError(createError.message)
      return
    }
    if (typeof data !== "string") {
      setError("The company was not returned by the registration operation.")
      return
    }
    await refreshMemberships()
    onCreated(data)
  }

  const fields: {
    key: keyof typeof EMPTY_COMPANY
    label: string
    required?: boolean
    type?: string
  }[] = [
    { key: "name", label: "Company name", required: true },
    { key: "legalName", label: "Legal name", required: true },
    { key: "country", label: "Country", required: true },
    { key: "currency", label: "Currency (ISO code)", required: true },
    { key: "taxRate", label: "Tax rate (%)", type: "number", required: true },
    { key: "defaultBranchName", label: "First branch name", required: true },
    { key: "address", label: "Address" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Company email", type: "email" },
    { key: "taxRegistrationNumber", label: "Tax registration number" },
    { key: "invoicePrefix", label: "Invoice prefix", required: true },
    { key: "invoiceFooter", label: "Invoice footer" },
  ]

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Register a company</h2>
      <p className="mt-1 text-sm text-slate-500">
        The database creates the company, first branch, and your owner membership atomically.
        Role assignment is not accepted from browser metadata.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="text-sm font-medium text-slate-700">
            {field.label}
            <input
              type={field.type ?? "text"}
              required={field.required}
              min={field.key === "taxRate" ? "0" : undefined}
              max={field.key === "taxRate" ? "100" : undefined}
              step={field.key === "taxRate" ? "0.01" : undefined}
              value={values[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-600"
            />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
        <Plus className="h-4 w-4" />
        {busy ? "Creating company…" : "Create company"}
      </button>
    </form>
  )
}

function WorkspaceHome() {
  const {
    user,
    memberships,
    activeCompany,
    activeCompanyLoading,
    activeCompanyError,
    activateCompany,
    clearActiveCompany,
    membershipError,
    refreshMemberships,
    signOut,
  } = useAuth()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [creating, setCreating] = useState(false)
  const [signOutError, setSignOutError] = useState("")
  const companies = useMemo(() => {
    const byId = new Map<string, { company: CompanyMembership; assignments: CompanyMembership[] }>()
    for (const membership of memberships) {
      const current = byId.get(membership.companyId)
      if (current) current.assignments.push(membership)
      else byId.set(membership.companyId, { company: membership, assignments: [membership] })
    }
    return [...byId.values()]
  }, [memberships])

  async function logout() {
    setSignOutError("")
    try {
      await signOut()
      navigate("/auth/login", { replace: true })
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Building2 className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Authenticated company workspace</p>
              <h1 className="text-xl font-semibold">Your companies</h1>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button type="button" onClick={() => void refreshMemberships()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button type="button" onClick={() => void logout()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Only active server-verified company memberships appear here. This workspace is separate
            from legacy local ERP records.
          </p>
          <button type="button" onClick={() => setCreating((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Register company
          </button>
          {activeCompany && <Link to="/workspace/products" className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Open company inventory</Link>}
        </div>

        <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <label className="block max-w-xl text-sm font-semibold text-emerald-950">
            Active company
            <select
              value={activeCompany?.companyId ?? ""}
              disabled={activeCompanyLoading || memberships.length === 0}
              onChange={(event) => {
                if (!event.target.value) {
                  clearActiveCompany()
                  return
                }
                void activateCompany(event.target.value)
              }}
              className="mt-2 h-11 w-full rounded-lg border border-emerald-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-emerald-700 disabled:opacity-60"
            >
              <option value="">
                {activeCompanyLoading ? "Verifying company access…" : "Select a company"}
              </option>
              {companies.map(({ company }) => (
                <option key={company.companyId} value={company.companyId}>
                  {company.companyName}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-emerald-900">
            Company access is checked against your current server-side membership each time you
            select or revalidate a company. Legacy local ERP data is not loaded into this selection.
          </p>
        </section>

        {membershipError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{membershipError}</p>}
        {activeCompanyError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{activeCompanyError}</p>}
        {signOutError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{signOutError}</p>}
        {creating && (
          <div className="mt-5">
            <CreateCompanyForm onCreated={() => {
              setCreating(false)
              void refreshMemberships()
            }} />
          </div>
        )}

        {companies.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {companies.map(({ company, assignments }) => (
              <CompanyCard
                key={company.companyId}
                company={company}
                assignments={assignments}
                isActive={activeCompany?.companyId === company.companyId}
              />
            ))}
          </div>
        ) : !creating ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-3 font-semibold">No active company memberships</h2>
            <p className="mt-1 text-sm text-slate-500">Register a new company or accept a valid company invitation.</p>
          </div>
        ) : null}
      </div>
    </main>
  )
}

function CompanyCard({
  company,
  assignments,
  isActive,
}: {
  company: CompanyMembership
  assignments: CompanyMembership[]
  isActive: boolean
}) {
  const { user, refreshMemberships } = useAuth()
  const [editing, setEditing] = useState(false)
  const [members, setMembers] = useState<CompanyMember[]>([])
  const [branches, setBranches] = useState<Record<string, unknown>[]>([])
  const [logoUrl, setLogoUrl] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const canManageCompany = assignments.some((membership) =>
    ["owner", "admin"].includes(membership.roleKey) && membership.branchId === null,
  )
  const canManageMembers = assignments.some((membership) =>
    ["owner", "admin"].includes(membership.roleKey),
  )

  useEffect(() => {
    if (!supabase) return
    let active = true
    void (async () => {
      if (canManageMembers) {
        const { data, error: memberError } = await supabase.rpc("list_company_members", {
          p_company_id: company.companyId,
        })
        if (!active) return
        if (memberError) setError(`Could not load company members. ${memberError.message}`)
        else setMembers(mapCompanyMembers(data ?? []))
      } else {
        setMembers([])
      }

      const { data, error: branchError } = await supabase
        .from("branches")
        .select("id, name, address, phone, is_default")
        .eq("company_id", company.companyId)
      if (!active) return
      if (branchError) setError(`Could not load company branches. ${branchError.message}`)
      else setBranches((data ?? []) as unknown as Record<string, unknown>[])
    })()
    return () => { active = false }
  }, [company.companyId, canManageMembers])

  useEffect(() => {
    if (!supabase || !company.logoPath) {
      setLogoUrl("")
      return
    }
    let active = true
    void supabase.storage
      .from("company-files")
      .createSignedUrl(company.logoPath, 60 * 60)
      .then(({ data, error: signedUrlError }) => {
        if (!active) return
        if (signedUrlError) setError(`Could not load the private company logo. ${signedUrlError.message}`)
        else setLogoUrl(data.signedUrl)
      })
    return () => { active = false }
  }, [company.logoPath])

  async function updateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const formData = new FormData(event.currentTarget)
    setError("")
    setMessage("")
    const { error: updateError } = await supabase
      .from("companies")
      .update({
        name: String(formData.get("name") ?? "").trim(),
        legal_name: String(formData.get("legal_name") ?? "").trim(),
        address: String(formData.get("address") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        tax_registration_number: String(formData.get("tax_registration_number") ?? "").trim(),
        country: String(formData.get("country") ?? "").trim(),
        currency: String(formData.get("currency") ?? "").trim().toUpperCase(),
        tax_rate: Number(formData.get("tax_rate")),
        invoice_prefix: String(formData.get("invoice_prefix") ?? "").trim(),
        invoice_footer: String(formData.get("invoice_footer") ?? "").trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", company.companyId)
    if (updateError) setError(updateError.message)
    else {
      setMessage("Company settings updated.")
      await refreshMemberships()
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!supabase || !file || !user) return
    setError("")
    setMessage("")
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setError("Choose a PNG, JPEG, WebP, or SVG image.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Company logo must be 10 MB or smaller.")
      return
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-")
    const path = `${company.companyId}/logos/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage
      .from("company-files")
      .upload(path, file, { upsert: false, contentType: file.type })
    if (uploadError) {
      setError(uploadError.message)
      return
    }
    const { error: updateError } = await supabase
      .from("companies")
      .update({ logo_path: path, updated_at: new Date().toISOString() })
      .eq("id", company.companyId)
    if (updateError) {
      setError(`Logo uploaded but its company record could not be updated. ${updateError.message}`)
      return
    }
    setMessage("Company logo uploaded to private company storage.")
    await refreshMemberships()
  }

  const showManagement = canManageCompany || canManageMembers
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          {logoUrl && <img src={logoUrl} alt={`${company.companyName} logo`} className="mb-3 max-h-14 max-w-48 object-contain" />}
          <h2 className="text-lg font-semibold text-slate-900">{company.companyName}</h2>
          {isActive && <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Active company</span>}
          <p className="text-sm text-slate-600">{company.legalName}</p>
          <p className="mt-1 text-xs text-slate-500">{company.country} · {company.currency}</p>
          <p className="mt-2 text-xs text-emerald-700">
            {assignments.map((membership) => `${membership.roleName}${membership.branchId ? " (branch)" : " (company)"}`).join(" · ")}
          </p>
        </div>
        {showManagement && (
          <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
            {editing ? "Close" : "Manage"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      {editing && showManagement && (
        <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
          {canManageCompany && <form onSubmit={(event) => void updateCompany(event)} className="grid gap-3 sm:grid-cols-2">
            {([
              ["name", "Company name", company.companyName],
              ["legal_name", "Legal name", company.legalName],
              ["country", "Country", company.country],
              ["currency", "Currency", company.currency],
              ["address", "Address", company.address],
              ["phone", "Phone", company.phone],
              ["email", "Email", company.email],
              ["tax_registration_number", "Tax registration", company.taxRegistrationNumber],
              ["tax_rate", "Tax rate", String(company.taxRate)],
              ["invoice_prefix", "Invoice prefix", company.invoicePrefix],
              ["invoice_footer", "Invoice footer", company.invoiceFooter],
            ] as const).map(([field, label, value]) => (
              <label key={field} className="text-xs font-medium text-slate-600">
                {label}
                <input name={field} defaultValue={value} required={["name", "legal_name", "country", "currency", "invoice_prefix"].includes(field)} type={field === "tax_rate" ? "number" : "text"} min={field === "tax_rate" ? "0" : undefined} max={field === "tax_rate" ? "100" : undefined} step={field === "tax_rate" ? "0.01" : undefined} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
              </label>
            ))}
            <button className="h-9 self-end rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Save company settings</button>
          </form>}

          {canManageCompany && <label className="block text-sm font-medium text-slate-700">
            Company logo (private storage)
            <span className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-600">
              <Upload className="h-4 w-4" /> Select an image
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(event) => {
                void uploadLogo(event.target.files?.[0])
                event.target.value = ""
              }} />
            </span>
          </label>}

          {canManageCompany && <BranchManager companyId={company.companyId} branches={branches} onChanged={setBranches} />}
          <MemberManager company={company} assignments={assignments} members={members} branches={branches} />
        </div>
      )}
    </article>
  )
}

function BranchManager({
  companyId,
  branches,
  onChanged,
}: {
  companyId: string
  branches: Record<string, unknown>[]
  onChanged: (branches: Record<string, unknown>[]) => void
}) {
  const { user } = useAuth()
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user || submitting.current) return
    const client = supabase
    const form = event.currentTarget
    const formData = new FormData(form)
    const name = String(formData.get("branch_name") ?? "").trim()
    if (!name) {
      setError("Enter a branch name.")
      return
    }
    submitting.current = true
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const result = await createBranchOnce(
        { companyId, name, createdBy: user.id },
        {
          insert: async (draft) => {
            const { data, error: insertError } = await client
              .from("branches")
              .insert({
                company_id: draft.companyId,
                name: draft.name,
                created_by: draft.createdBy,
              })
              .select("id, name, is_default")
              .single()
            return { data, error: insertError }
          },
          findExisting: async (targetCompanyId, targetName) => {
            const { data, error: lookupError } = await client
              .from("branches")
              .select("id, name, is_default")
              .eq("company_id", targetCompanyId)
              .eq("name", targetName)
              .maybeSingle()
            return { data, error: lookupError }
          },
        },
      )
      if (!branches.some((branch) => branch.id === result.branch.id)) {
        onChanged([...branches, {
          id: result.branch.id,
          name: result.branch.name,
          is_default: result.branch.is_default,
        }])
      }
      form.reset()
      setMessage(result.created ? "Branch created." : "Branch already exists; no duplicate was created.")
    } catch (branchError) {
      setError(branchError instanceof Error ? branchError.message : "Could not create branch.")
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">Branches</h3>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {branches.map((branch) => (
          <li key={String(branch.id)}>{String(branch.name)}{branch.is_default ? " · Default" : ""}</li>
        ))}
      </ul>
      <form onSubmit={(event) => void createBranch(event)} className="mt-2 flex gap-2">
        <input required name="branch_name" placeholder="New branch name" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
        <button disabled={busy} className="rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">{busy ? "Adding…" : "Add"}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
    </section>
  )
}

function MemberManager({
  company,
  assignments,
  members,
  branches,
}: {
  company: CompanyMembership
  assignments: CompanyMembership[]
  members: CompanyMember[]
  branches: Record<string, unknown>[]
}) {
  const { user } = useAuth()
  const canManageMembers = assignments.some((membership) =>
    ["owner", "admin"].includes(membership.roleKey),
  )
  const canInviteAdmins = assignments.some((membership) => membership.roleKey === "owner")
  const canInviteAllBranches = assignments.some((membership) => membership.branchId === null)
  const allowedBranchIds = new Set(
    assignments.flatMap((membership) => membership.branchId ? [membership.branchId] : []),
  )
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("cashier")
  const [branchId, setBranchId] = useState("")
  const [expiresHours, setExpiresHours] = useState("72")
  const [invitationUrl, setInvitationUrl] = useState("")
  const [pendingInvitations, setPendingInvitations] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [visibleMembers, setVisibleMembers] = useState(members)

  useEffect(() => setVisibleMembers(members), [members])

  async function loadPendingInvitations() {
    if (!supabase) return
    const { data, error: listError } = await supabase
      .from("company_invitations")
      .select("id, email, expires_at, roles(display_name), branches(name)")
      .eq("company_id", company.companyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
    if (listError) setError(`Could not load invitations. ${listError.message}`)
    else setPendingInvitations((data ?? []) as unknown as Record<string, unknown>[])
  }

  useEffect(() => {
    if (canManageMembers) void loadPendingInvitations()
    else setPendingInvitations([])
  }, [company.companyId, canManageMembers])

  if (!canManageMembers) return null

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError("")
    setMessage("")
    setInvitationUrl("")
    const { data, error: inviteError } = await supabase.rpc("create_company_invitation", {
      p_company_id: company.companyId,
      p_email: email.trim(),
      p_role_key: role,
      p_branch_id: branchId || null,
      p_expires_in_hours: Number(expiresHours),
    })
    setBusy(false)
    if (inviteError) {
      setError(inviteError.message)
      return
    }
    if (typeof data !== "string") {
      setError("The invitation token was not returned.")
      return
    }
    setInvitationUrl(`${window.location.origin}/auth/invite/${data}`)
    setMessage("Invitation created. Copy and send this link to the intended email address. The server validates the account email and expiry.")
    void loadPendingInvitations()
  }

  async function revokeMembership(id: string) {
    if (!supabase || !window.confirm("Revoke this company membership? Access ends immediately.")) return
    setError("")
    const { error: revokeError } = await supabase.rpc("revoke_company_membership", {
      p_membership_id: id,
    })
    if (revokeError) setError(revokeError.message)
    else {
      setMessage("Membership revoked.")
      const { data, error: listError } = await supabase.rpc("list_company_members", {
        p_company_id: company.companyId,
      })
      if (listError) setError(`Membership was revoked, but the list could not be refreshed. ${listError.message}`)
      else setVisibleMembers(mapCompanyMembers(data ?? []))
    }
  }

  async function revokeInvitation(id: string) {
    if (!supabase || !window.confirm("Revoke this invitation? The invite link will stop working immediately.")) return
    const { error: revokeError } = await supabase.rpc("revoke_company_invitation", {
      p_invitation_id: id,
    })
    if (revokeError) setError(revokeError.message)
    else {
      setMessage("Invitation revoked.")
      void loadPendingInvitations()
    }
  }

  return (
    <section className="border-t border-slate-100 pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Users className="h-4 w-4" /> Members and invitations
      </h3>
      <ul className="mt-2 space-y-2">
        {visibleMembers.map((member) => {
          return (
            <li key={member.membershipId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {member.fullName} · {member.email} · {member.roleName}
                {member.branchName ? ` · ${member.branchName}` : " · All branches"}
                {` · ${member.status}`}
              </span>
              {member.status === "active" && member.userId !== (user?.id ?? "") && member.roleKey !== "owner" && (
                <button type="button" onClick={() => void revokeMembership(member.membershipId)} className="shrink-0 text-xs font-medium text-red-700 hover:underline">Revoke</button>
              )}
            </li>
          )
        })}
      </ul>
      {pendingInvitations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending invitations</h4>
          <ul className="mt-2 space-y-2">
            {pendingInvitations.map((invitation) => {
              const invitedRole = invitation.roles as Record<string, unknown> | null
              const invitedBranch = invitation.branches as Record<string, unknown> | null
              return (
                <li key={String(invitation.id)} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate">
                    {String(invitation.email)} · {String(invitedRole?.display_name || "Member")}
                    {invitedBranch?.name ? ` · ${String(invitedBranch.name)}` : " · All branches"}
                    {` · Expires ${new Date(String(invitation.expires_at)).toLocaleString()}`}
                  </span>
                  <button type="button" onClick={() => void revokeInvitation(String(invitation.id))} className="shrink-0 font-medium text-red-700 hover:underline">Revoke</button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <form onSubmit={(event) => void createInvitation(event)} className="mt-4 grid gap-2 sm:grid-cols-2">
        <input required type="email" placeholder="Invitee email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
        <select value={role} onChange={(event) => setRole(event.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
          {canInviteAdmins && <option value="admin">Company Admin</option>}
          <option value="manager">Manager</option>
          <option value="cashier">Cashier</option>
          <option value="inventory_manager">Inventory Manager</option>
          <option value="accountant">Accountant</option>
          <option value="read_only">Read-only</option>
        </select>
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
          {canInviteAllBranches && <option value="">All branches</option>}
          {branches
            .filter((branch) => canInviteAllBranches || allowedBranchIds.has(String(branch.id)))
            .map((branch) => <option key={String(branch.id)} value={String(branch.id)}>{String(branch.name)}</option>)}
        </select>
        <select value={expiresHours} onChange={(event) => setExpiresHours(event.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
          <option value="24">Expires in 24 hours</option>
          <option value="72">Expires in 72 hours</option>
          <option value="168">Expires in 7 days</option>
        </select>
        <button disabled={busy} className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create invitation"}</button>
      </form>
      {message && <p role="status" className="mt-2 text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {invitationUrl && (
        <div className="mt-2 break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          <span className="font-semibold">Invite link:</span> {invitationUrl}
          <button type="button" onClick={() => void navigator.clipboard.writeText(invitationUrl)} className="ml-2 font-semibold text-emerald-700">Copy</button>
        </div>
      )}
    </section>
  )
}

export default function WorkspaceRoutes() {
  const { configured, loading, user } = useAuth()
  if (!configured) return <SetupNotice />
  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-slate-600">Checking authenticated session…</main>
  if (!user) return <LoginPage />
  return (
    <Routes>
      <Route index element={<WorkspaceGuard />} />
      <Route element={<InventoryWorkspaceGuard />}>
        <Route element={<WorkspaceShell />}>
          <Route path="products" element={<ProductsPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="movements" element={<MovementsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/workspace" replace />} />
    </Routes>
  )
}
