import { useMemo, useState } from "react"
import { useAuth } from "../auth/AuthProvider"
import { useCloudInventory } from "./CloudInventoryContext"

export default function MovementsPage() {
  const { activeCompany } = useAuth()
  const { products, warehouses, movements, loading, error } = useCloudInventory()
  const [type, setType] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products])
  const warehouseNames = useMemo(() => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name])), [warehouses])
  const visible = movements.filter((movement) =>
    (!type || movement.movement_type === type) &&
    (!warehouseId || movement.warehouse_id === warehouseId),
  )

  return (
    <section className="space-y-4">
      <header><h1 className="text-2xl font-semibold">Stock movements</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{activeCompany?.companyName} · immutable, server-authorized movement history</p></header>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="sr-only">Filter movement type</span><select value={type} onChange={(event) => setType(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">All movement types</option>{["OPENING", "RECEIPT", "SALE", "RETURN", "ADJUSTMENT", "DAMAGE", "LOSS"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">Filter movement warehouse</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">All accessible warehouses</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="rounded-xl border bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">Loading movement history…</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300"><tr><th className="p-3">Date / time</th><th className="p-3">Product / lot</th><th className="p-3">Warehouse</th><th className="p-3">Type</th><th className="p-3">Change</th><th className="p-3">Balance before → after</th><th className="p-3">Reason / reference</th><th className="p-3">User</th></tr></thead>
            <tbody>{visible.map((movement) => {
              const previous = movement.metadata?.previous_quantity
              const resulting = movement.metadata?.resulting_quantity
              const reference = movement.metadata?.reference
              return <tr key={movement.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3 whitespace-nowrap">{new Date(movement.created_at).toLocaleString()}</td>
                <td className="p-3">{productNames.get(movement.product_id) ?? "Product"}<div className="text-xs text-slate-500">Lot {movement.lot_id?.slice(0, 8) ?? "—"}</div></td>
                <td className="p-3">{warehouseNames.get(movement.warehouse_id ?? "") ?? "—"}</td>
                <td className="p-3">{movement.movement_type}</td>
                <td className={`p-3 font-medium ${Number(movement.quantity) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{Number(movement.quantity) > 0 ? "+" : ""}{Number(movement.quantity)}</td>
                <td className="p-3">{typeof previous === "number" && typeof resulting === "number" ? `${previous} → ${resulting}` : "Not recorded"}</td>
                <td className="p-3">{movement.reason || "—"}{reference != null && <div className="text-xs text-slate-500">Ref: {String(reference)}</div>}</td>
                <td className="p-3 font-mono text-xs">{movement.created_by}</td>
              </tr>
            })}{!visible.length && <tr><td colSpan={8} className="p-8 text-center text-sm text-slate-500">No stock movements match this view.</td></tr>}</tbody>
          </table>
          {movements.length === 500 && <p className="border-t p-3 text-xs text-slate-500">Showing the 500 most recent accessible movements.</p>}
        </div>
      )}
    </section>
  )
}
