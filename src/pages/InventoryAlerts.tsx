import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { AlertTriangle, CalendarClock, CheckCircle2, Package, Search, Warehouse as WarehouseIcon } from "lucide-react"
import { useERP } from "../context/ERPContext"
import { buildInventoryAlerts, type InventoryAlert } from "../lib/inventoryAlerts"
import { formatExpiryDisplay } from "../lib/expiry"

type AlertFilter = "ALL" | "EXPIRED" | "EXPIRING_SOON" | "UPCOMING" | "LOW_STOCK" | "OUT_OF_STOCK"

const filters: { value: AlertFilter; label: string }[] = [
  { value: "ALL", label: "All alerts" },
  { value: "EXPIRED", label: "Expired" },
  { value: "EXPIRING_SOON", label: "Expiring soon" },
  { value: "UPCOMING", label: "Upcoming expiry" },
  { value: "LOW_STOCK", label: "Low stock" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
]

function alertTitle(alert: InventoryAlert) {
  switch (alert.kind) {
    case "EXPIRED": return "Expired batch"
    case "EXPIRING_SOON": return "Expiring soon"
    case "UPCOMING": return "Upcoming expiry"
    case "LOW_STOCK": return "Low stock"
    case "OUT_OF_STOCK": return "Out of stock"
  }
}

function alertTone(alert: InventoryAlert) {
  if (alert.kind === "EXPIRED" || alert.kind === "OUT_OF_STOCK") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
  if (alert.kind === "EXPIRING_SOON" || alert.kind === "LOW_STOCK") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"
}

function summaryCard(title: string, value: number, icon: ReactNode, detail: string) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>{title}</span><span className="text-slate-400">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
    </div>
  )
}

export default function InventoryAlerts() {
  const { products, inventoryLots, warehouses } = useERP()
  const [warehouseId, setWarehouseId] = useState("ALL")
  const [filter, setFilter] = useState<AlertFilter>("ALL")
  const [search, setSearch] = useState("")

  const result = useMemo(() => buildInventoryAlerts({
    products,
    inventoryLots,
    warehouses,
    warehouseId: warehouseId === "ALL" ? undefined : warehouseId,
  }), [products, inventoryLots, warehouses, warehouseId])

  const visibleAlerts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return result.alerts.filter((alert) => {
      if (filter !== "ALL" && alert.kind !== filter) return false
      if (!query) return true
      const values = alert.category === "EXPIRY"
        ? [alert.productName, alert.sku, alert.batch, alert.warehouseName]
        : [alert.productName, alert.sku, alert.warehouseName]
      return values.some((value) => value.toLowerCase().includes(query))
    })
  }, [result.alerts, filter, search])

  const totalAlerts = result.alerts.length
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.active)

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Expiry &amp; Reorder Alerts</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Monitor batch expiry dates and replenishment needs using your existing product minimum-stock settings. This page is read-only.
          </p>
        </div>
        <label className="flex min-w-56 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          <WarehouseIcon size={16} className="text-slate-400" />
          <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="w-full bg-transparent outline-none">
            <option value="ALL">All warehouses</option>
            {activeWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCard("Expired batches", result.summary.expired, <AlertTriangle size={18} />, "Positive stock past expiry")}
        {summaryCard("Expiring soon", result.summary.expiringSoon, <CalendarClock size={18} />, "Within the next 30 days")}
        {summaryCard("Upcoming expiry", result.summary.upcoming, <CalendarClock size={18} />, "31–90 days from today")}
        {summaryCard("Low-stock products", result.summary.lowStock, <Package size={18} />, "At or below minimum stock")}
        {summaryCard("Out of stock", result.summary.outOfStock, <AlertTriangle size={18} />, "No available units")}
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => {
          const count = item.value === "ALL" ? totalAlerts : result.alerts.filter((alert) => alert.kind === item.value).length
          const selected = filter === item.value
          return (
            <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`rounded-full border px-3 py-2 text-sm font-medium transition ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
              {item.label} <span className={selected ? "ml-1 text-emerald-100" : "ml-1 text-slate-400"}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU, batch or warehouse..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Alert details</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{visibleAlerts.length} result{visibleAlerts.length === 1 ? "" : "s"} · Month/year expiry is treated as valid through the last day of that month.</p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">No inventory changes are made here</span>
        </div>
        {visibleAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <CheckCircle2 size={32} className="text-emerald-500" />
            <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">No matching alerts</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">There are no alerts for the selected warehouse and filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Alert</th><th className="px-5 py-3">Product / SKU</th><th className="px-5 py-3">Batch</th><th className="px-5 py-3">Expiry / Threshold</th><th className="px-5 py-3">Available qty</th><th className="px-5 py-3">Warehouse</th><th className="px-5 py-3">Reorder suggestion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleAlerts.map((alert, index) => (
                  <tr key={`${alert.category}-${alert.productId}-${alert.category === "EXPIRY" ? alert.batch + alert.warehouseId : alert.warehouseId ?? "all"}-${index}`} className="text-slate-700 dark:text-slate-300">
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${alertTone(alert)}`}>{alertTitle(alert)}</span></td>
                    <td className="px-5 py-4"><div className="font-semibold text-slate-900 dark:text-white">{alert.productName}</div><div className="mt-1 text-xs text-slate-500">{alert.sku}</div></td>
                    <td className="px-5 py-4">{alert.category === "EXPIRY" ? alert.batch : "—"}</td>
                    <td className="px-5 py-4">{alert.category === "EXPIRY" ? <><div>{formatExpiryDisplay(alert.expiry)}</div><div className="mt-1 text-xs text-slate-500">{alert.daysUntilExpiry < 0 ? `${Math.abs(alert.daysUntilExpiry)} days overdue` : alert.daysUntilExpiry === 0 ? "Expires today" : `${alert.daysUntilExpiry} days remaining`}</div></> : <><div>Minimum: {alert.minimumStock} {alert.unit}</div><div className="mt-1 text-xs text-slate-500">Current: {alert.availableStock} {alert.unit}</div></>}</td>
                    <td className="px-5 py-4 font-semibold">{alert.category === "EXPIRY" ? `${alert.quantity} ${alert.unit}` : `${alert.availableStock} ${alert.unit}`}</td>
                    <td className="px-5 py-4">{alert.warehouseName}</td>
                    <td className="px-5 py-4">{alert.category === "REORDER" ? alert.suggestedReorder > 0 ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">{alert.suggestedReorder} {alert.unit}</span> : "Set minimum stock" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
