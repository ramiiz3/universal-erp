import { useMemo, useState } from "react"
import { Calculator, Pencil, Plus, Search, ShieldCheck } from "lucide-react"
import { useERP } from "../context/ERPContext"
import {
  CHART_ACCOUNT_GROUPS,
  CHART_ACCOUNT_TYPES,
  type ChartAccountGroup,
  type ChartAccountType,
  type ChartOfAccountInput,
} from "../lib/chartOfAccounts"

type Draft = {
  code: string
  name: string
  type: ChartAccountType
  group: ChartAccountGroup
  parentId: string
  description: string
}

const newDraft = (): Draft => ({
  code: "", name: "", type: "ASSET", group: "CURRENT_ASSET", parentId: "", description: "",
})

const groupLabels: Record<ChartAccountGroup, string> = {
  CURRENT_ASSET: "Current Assets",
  NON_CURRENT_ASSET: "Non-current Assets",
  CURRENT_LIABILITY: "Current Liabilities",
  NON_CURRENT_LIABILITY: "Non-current Liabilities",
  OWNER_EQUITY: "Owner's Equity",
  RETAINED_EARNINGS: "Retained Earnings",
  DRAWINGS: "Drawings",
  OPERATING_REVENUE: "Operating Revenue",
  OTHER_INCOME: "Other Income",
  CONTRA_REVENUE: "Sales Returns & Allowances",
  COST_OF_SALES: "Cost of Sales",
  OPERATING_EXPENSE: "Operating Expenses",
  OTHER_EXPENSE: "Other Expenses",
}

const typeLabels: Record<ChartAccountType, string> = {
  ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", REVENUE: "Revenue", EXPENSE: "Expense",
}

function moneyCount(value: number) { return value.toLocaleString("en-US") }

export default function ChartOfAccounts() {
  const { chartOfAccounts, createChartOfAccount, updateChartOfAccount, setChartOfAccountStatus } = useERP()
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(newDraft())
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const filtered = useMemo(() => chartOfAccounts
    .filter((account) => {
      const normalized = query.trim().toLowerCase()
      const matchesQuery = !normalized || account.code.toLowerCase().includes(normalized) || account.name.toLowerCase().includes(normalized) || account.description.toLowerCase().includes(normalized)
      return matchesQuery && (typeFilter === "ALL" || account.type === typeFilter) && (statusFilter === "ALL" || account.status === statusFilter)
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
  [chartOfAccounts, query, typeFilter, statusFilter])

  const activeCount = chartOfAccounts.filter((item) => item.status === "ACTIVE").length
  const systemCount = chartOfAccounts.filter((item) => item.isSystem).length
  const customCount = chartOfAccounts.length - systemCount

  function openCreate() {
    setEditingId(null); setDraft(newDraft()); setError(""); setSuccess(""); setShowForm(true)
  }

  function openEdit(id: string) {
    const account = chartOfAccounts.find((item) => item.id === id)
    if (!account || account.isSystem) return
    setEditingId(id)
    setDraft({ code: account.code, name: account.name, type: account.type, group: account.group, parentId: account.parentId ?? "", description: account.description })
    setError(""); setSuccess(""); setShowForm(true)
  }

  function changeType(type: ChartAccountType) {
    setDraft((current) => ({ ...current, type, group: CHART_ACCOUNT_GROUPS[type][0], parentId: "" }))
  }

  function save() {
    setError(""); setSuccess("")
    const input: ChartOfAccountInput = { code: draft.code, name: draft.name, type: draft.type, group: draft.group, parentId: draft.parentId || null, description: draft.description }
    try {
      if (editingId) updateChartOfAccount(editingId, input)
      else createChartOfAccount(input)
      setSuccess(editingId ? "Account updated." : "Account created.")
      setShowForm(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the account.")
    }
  }

  function toggleStatus(id: string, status: "ACTIVE" | "INACTIVE") {
    const next = status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
    try { setChartOfAccountStatus(id, next) }
    catch (statusError) { window.alert(statusError instanceof Error ? statusError.message : String(statusError)) }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6 dark:bg-[#0b120e]">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900"><Calculator className="h-6 w-6 text-slate-700 dark:text-slate-200" /></div>
            <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Chart of Accounts</h1><p className="mt-1 text-sm text-slate-500">Manage the account structure used by the financial ledger.</p></div>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> New account</button>
        </div>

        {success && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500">Total accounts</p><p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{moneyCount(chartOfAccounts.length)}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500">Active accounts</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{moneyCount(activeCount)}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500">System / custom</p><p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{systemCount} / {customCount}</p></div>
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_210px_180px] dark:border-slate-800 dark:bg-slate-900">
          <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search account code, name or description" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="ALL">All account types</option>{CHART_ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-5 py-4">Code</th><th className="px-5 py-4">Account name</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Group</th><th className="px-5 py-4">Parent account</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((account) => {
                const parent = account.parentId ? chartOfAccounts.find((item) => item.id === account.parentId) : undefined
                return <tr key={account.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-4 font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">{account.code}</td>
                  <td className="px-5 py-4"><div className="font-medium text-slate-900 dark:text-white">{account.name}</div>{account.isSystem && <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500"><ShieldCheck className="h-3 w-3" /> System account</span>}</td>
                  <td className="px-5 py-4 text-sm">{typeLabels[account.type]}</td><td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{groupLabels[account.group]}</td><td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{parent ? `${parent.code} · ${parent.name}` : "—"}</td>
                  <td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${account.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{account.status}</span></td>
                  <td className="px-5 py-4"><div className="flex justify-end gap-2">{!account.isSystem && <><button type="button" onClick={() => openEdit(account.id)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => toggleStatus(account.id, account.status)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">{account.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></>}</div></td>
                </tr>
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">No accounts match the selected filters.</td></tr>}
            </tbody>
          </table></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">The default chart creates account structures only. It does not set opening balances or post journals.</p>
      </div>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">{editingId ? "Edit account" : "New account"}</h2><p className="mt-1 text-xs text-slate-500">Account codes must be unique.</p></div><button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-sm text-slate-500">Close</button></div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {error && <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Account code<input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950" placeholder="e.g. 6100" /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Account name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Account name" /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Account type<select value={draft.type} onChange={(event) => changeType(event.target.value as ChartAccountType)} className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950">{CHART_ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">Account group<select value={draft.group} onChange={(event) => setDraft((current) => ({ ...current, group: event.target.value as ChartAccountGroup }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950">{CHART_ACCOUNT_GROUPS[draft.type].map((group) => <option key={group} value={group}>{groupLabels[group]}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Parent account (optional)<select value={draft.parentId} onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">No parent · top-level account</option>{chartOfAccounts.filter((item) => item.status === "ACTIVE" && item.type === draft.type && item.id !== editingId).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Description<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950" placeholder="Optional account description" /></label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">Cancel</button><button type="button" onClick={save} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">{editingId ? "Save changes" : "Create account"}</button></div>
        </div>
      </div>}
    </section>
  )
}
