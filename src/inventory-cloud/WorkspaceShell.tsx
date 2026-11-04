import { useState } from "react"
import { Building2, Boxes, ClipboardList, Package, Warehouse } from "lucide-react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { useTheme } from "../context/ThemeContext"
import { CloudInventoryProvider } from "./CloudInventoryContext"

const navigation = [
  { to: "/workspace/products", label: "Products", icon: Package },
  { to: "/workspace/warehouses", label: "Warehouses", icon: Warehouse },
  { to: "/workspace/inventory", label: "Inventory lots", icon: Boxes },
  { to: "/workspace/movements", label: "Stock movements", icon: ClipboardList },
]

export default function WorkspaceShell() {
  const {
    activeCompany,
    activeCompanyLoading,
    activeCompanyError,
    activeCompanyRevision,
    memberships,
    activateCompany,
    signOut,
  } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [signOutError, setSignOutError] = useState("")
  const companies = [...new Map(memberships.map((membership) => [
    membership.companyId,
    { companyId: membership.companyId, companyName: membership.companyName },
  ])).values()]

  if (activeCompanyLoading) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-200">Verifying company access…</main>
  }
  if (!activeCompany) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-xl font-semibold">Select an active company</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {activeCompanyError || "Choose a company whose membership can be verified before opening its inventory."}
          </p>
          <button type="button" onClick={() => navigate("/workspace")} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
            Return to company selection
          </button>
        </div>
      </main>
    )
  }

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
    <CloudInventoryProvider key={`${activeCompany.companyId}:${activeCompanyRevision}`}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 md:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <Building2 className="h-5 w-5 text-emerald-700" />
              <span>UniversalERP Cloud</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="active-company">Active company</label>
              <select
                id="active-company"
                value={activeCompany.companyId}
                onChange={(event) => void activateCompany(event.target.value)}
                className="h-10 max-w-64 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>{company.companyName}</option>
                ))}
              </select>
              <button type="button" onClick={toggleTheme} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
              <button type="button" onClick={() => navigate("/workspace")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
                Companies
              </button>
              <button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
                Sign out
              </button>
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-7xl text-xs text-slate-500 dark:text-slate-400">
            Active company: <strong className="font-semibold">{activeCompany.companyName}</strong> · Cloud inventory, protected by company and branch RLS
          </p>
        </header>
        <div className="mx-auto grid max-w-7xl gap-5 p-4 md:grid-cols-[210px_minmax(0,1fr)] md:p-6">
          <nav aria-label="Company inventory" className="flex gap-2 overflow-x-auto md:block md:space-y-1">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </nav>
          <main className="min-w-0">
            {signOutError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{signOutError}</p>}
            <Outlet />
          </main>
        </div>
      </div>
    </CloudInventoryProvider>
  )
}
