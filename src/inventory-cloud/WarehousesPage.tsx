import { useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { createSubmissionLock } from "./domain"
import { useCloudInventory, type CloudWarehouse } from "./CloudInventoryContext"

type WarehouseForm = {
  branchId: string
  name: string
  code: string
  address: string
}

const EMPTY_FORM: WarehouseForm = { branchId: "", name: "", code: "", address: "" }

export default function WarehousesPage() {
  const { activeCompany, memberships, user } = useAuth()
  const { companyId, branches, warehouses, products, lots, loading, error, refresh } = useCloudInventory()
  const [form, setForm] = useState<WarehouseForm>(EMPTY_FORM)
  const [editing, setEditing] = useState<CloudWarehouse | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState("")
  const [message, setMessage] = useState("")
  const submitLock = useRef(createSubmissionLock())

  const companyMemberships = memberships.filter((item) => item.companyId === companyId)
  const hasCompanyScope = companyMemberships.some((item) => item.branchId === null)
  const allowedBranchIds = new Set(companyMemberships.flatMap((item) => item.branchId ? [item.branchId] : []))
  const visibleBranches = branches.filter((branch) => hasCompanyScope || allowedBranchIds.has(branch.id))
  const canManageWarehouses = companyMemberships.some((item) =>
    ["owner", "admin", "manager", "inventory_manager"].includes(item.roleKey),
  )
  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products])

  function startCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, branchId: visibleBranches[0]?.id ?? "" })
    setPageError("")
    setShowForm(true)
  }

  function startEdit(warehouse: CloudWarehouse) {
    setEditing(warehouse)
    setForm({
      branchId: warehouse.branch_id,
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
    })
    setPageError("")
    setShowForm(true)
  }

  async function saveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = supabase
    if (!client || !activeCompany || !user) return
    const name = form.name.trim()
    if (!name || !form.branchId) {
      setPageError("Select an accessible branch and enter a warehouse name.")
      return
    }
    if (!visibleBranches.some((branch) => branch.id === form.branchId)) {
      setPageError("You do not have access to the selected branch.")
      return
    }
    setPageError("")
    setSaving(true)
    try {
      await submitLock.current(async () => {
        const result = editing
          ? await client.from("warehouses").update({
            name,
            code: form.code.trim(),
            address: form.address.trim(),
          }).eq("company_id", activeCompany.companyId).eq("id", editing.id)
          : await client.from("warehouses").insert({
            company_id: activeCompany.companyId,
            branch_id: form.branchId,
            name,
            code: form.code.trim(),
            address: form.address.trim(),
            created_by: user.id,
          })
        if (result.error) throw result.error
        setShowForm(false)
        setMessage(editing ? "Warehouse updated." : "Warehouse created.")
        await refresh()
      })
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  async function setDefault(warehouse: CloudWarehouse) {
    const client = supabase
    if (!client || !activeCompany) return
    setPageError("")
    setSaving(true)
    try {
      await submitLock.current(async () => {
        const { error: rpcError } = await client.rpc("set_default_inventory_warehouse", {
          p_company_id: activeCompany.companyId,
          p_warehouse_id: warehouse.id,
        })
        if (rpcError) throw rpcError
        setMessage(`${warehouse.name} is now the default for its branch.`)
        await refresh()
      })
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Warehouses</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{activeCompany?.companyName} · stock location access follows branch membership</p></div>
        {canManageWarehouses && <button type="button" onClick={startCreate} disabled={!visibleBranches.length} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add warehouse</button>}
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {pageError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading ? <p className="rounded-xl border bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">Loading accessible warehouses…</p> : warehouses.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {warehouses.map((warehouse) => {
            const warehouseLots = lots.filter((lot) => lot.warehouse_id === warehouse.id)
            const quantity = warehouseLots.reduce((sum, lot) => sum + Number(lot.quantity), 0)
            const stockValue = warehouseLots.reduce((sum, lot) => sum + Number(lot.quantity) * Number(lot.purchase_price), 0)
            return (
              <article key={warehouse.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{warehouse.name} {warehouse.is_default && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Default</span>}</h2>
                    <p className="text-sm text-slate-500">{branchNames.get(warehouse.branch_id) ?? "Branch"} · {warehouse.code || "No code"}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{warehouse.address || "No address"}</p>
                  </div>
                  {canManageWarehouses && (
                    <div className="flex items-start gap-3">
                      <button type="button" disabled={saving || warehouse.is_default} onClick={() => void setDefault(warehouse)} className="text-xs font-medium text-emerald-800 hover:underline disabled:opacity-40 dark:text-emerald-300">Set default</button>
                      <button type="button" onClick={() => startEdit(warehouse)} className="text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-300">Edit</button>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
                  <div><p className="text-xs text-slate-500">On hand</p><p className="font-semibold">{quantity}</p></div>
                  <div><p className="text-xs text-slate-500">Lots</p><p className="font-semibold">{warehouseLots.length}</p></div>
                  <div><p className="text-xs text-slate-500">Stock cost</p><p className="font-semibold">{stockValue.toFixed(2)} {activeCompany?.currency}</p></div>
                </div>
                {warehouseLots.length > 0 && <ul className="mt-3 space-y-1 text-xs text-slate-500">{warehouseLots.slice(0, 5).map((lot) => <li key={lot.id}>{productNames.get(lot.product_id) ?? "Product"} · {lot.batch || "No batch"} · {lot.quantity} {lot.expiry ? `· exp ${lot.expiry}` : ""}</li>)}</ul>}
              </article>
            )
          })}
        </div>
      ) : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No warehouses are available to your active company/branch membership.</div>}

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form onSubmit={(event) => void saveWarehouse(event)} className="w-full max-w-xl rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">{editing ? "Edit warehouse" : "Create warehouse"}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">Branch
                <select disabled={Boolean(editing)} value={form.branchId} onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
                  {visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              {([
                ["name", "Warehouse name"],
                ["code", "Code"],
                ["address", "Address"],
              ] as const).map(([field, label]) => <label key={field} className="block text-sm font-medium">{label}<input required={field === "name"} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>)}
            </div>
            {pageError && <p role="alert" className="mt-3 text-sm text-red-700">{pageError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save warehouse"}</button></div>
          </form>
        </div>
      )}
    </section>
  )
}
