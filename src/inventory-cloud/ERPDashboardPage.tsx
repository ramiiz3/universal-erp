import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  Clock3,
  Package,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { useCloudInventory } from "./CloudInventoryContext"

type MonthlySales = { month: string; amount: number }
type RecentSale = {
  id: string
  invoice_number: string
  customer_name: string
  total: number
  amount_paid: number
  payment_status: string
  created_at: string
}
type RecentPurchase = {
  id: string
  purchase_number: string
  status: string
  total: number
  created_at: string
}
type DashboardSummary = {
  sales_this_month: number
  purchases_this_month: number
  outstanding_receivables: number
  inventory_cost_value: number
  active_products: number
  low_stock_products: number
  out_of_stock_products: number
  expiring_lots_30_days: number
  pending_purchase_orders: number
  warehouse_count: number
  monthly_sales: MonthlySales[]
  recent_sales: RecentSale[]
  recent_purchases: RecentPurchase[]
}

const money = (value: number, currency: string) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: /^[A-Z]{3}$/.test(currency) ? currency : "AED",
  maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0)

const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "slate",
}: {
  label: string
  value: string
  detail: string
  icon: typeof Package
  tone?: "slate" | "emerald" | "amber" | "rose" | "blue"
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  }
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
        <span className={`rounded-xl p-3 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      </div>
    </article>
  )
}

export default function ERPDashboardPage() {
  const { activeCompany } = useAuth()
  const {
    companyId,
    products,
    warehouses,
    lots,
    movements,
    loading: inventoryLoading,
    error: inventoryError,
    refresh: refreshInventory,
  } = useCloudInventory()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState("")
  const currency = activeCompany?.currency ?? "AED"

  const refreshSummary = useCallback(async () => {
    if (!supabase || !companyId) {
      setSummary(null)
      setSummaryError("The active company dashboard is unavailable.")
      setSummaryLoading(false)
      return
    }
    setSummaryLoading(true)
    setSummaryError("")
    const { data, error } = await supabase.rpc("get_company_dashboard_summary", {
      p_company_id: companyId,
    })
    if (error) {
      setSummary(null)
      setSummaryError(error.message)
    } else {
      setSummary(data as unknown as DashboardSummary)
    }
    setSummaryLoading(false)
  }, [companyId])

  useEffect(() => {
    void refreshSummary()
  }, [refreshSummary])

  const localStock = useMemo(() => {
    const byProduct = new Map<string, number>()
    for (const lot of lots) {
      byProduct.set(lot.product_id, (byProduct.get(lot.product_id) ?? 0) + Number(lot.quantity || 0))
    }
    const active = products.filter((product) => product.is_active)
    return {
      activeProducts: active.length,
      lowStock: active.filter((product) => Number(product.minimum_stock) > 0
        && (byProduct.get(product.id) ?? 0) > 0
        && (byProduct.get(product.id) ?? 0) <= Number(product.minimum_stock)).length,
      outOfStock: active.filter((product) => (byProduct.get(product.id) ?? 0) <= 0).length,
      inventoryCostValue: lots.reduce((total, lot) => total + Number(lot.quantity) * Number(lot.purchase_price), 0),
      expiringLots: lots.filter((lot) => {
        if (!lot.expiry || Number(lot.quantity) <= 0) return false
        const days = (new Date(`${lot.expiry}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000
        return days >= 0 && days <= 30
      }).length,
    }
  }, [products, lots])

  const recentMovements = useMemo(() => movements.slice(0, 7), [movements])
  const monthSales = summary?.monthly_sales ?? []
  const maxSales = Math.max(1, ...monthSales.map((item) => Number(item.amount) || 0))
  const hasDashboardSummary = Boolean(summary)

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Business overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Operational overview for {activeCompany?.companyName ?? "your company"}. Figures follow your verified company and branch permissions.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <CalendarDays className="h-4 w-4" /> This month
          </span>
          <button type="button" onClick={() => { void Promise.all([refreshSummary(), refreshInventory()]) }} disabled={summaryLoading || inventoryLoading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${summaryLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </header>

      {(inventoryError || summaryError) && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Some dashboard information is unavailable.</p><p className="mt-1">{inventoryError || summaryError}</p><p className="mt-1 text-xs">The dashboard summary requires the local dashboard migration to be applied to the connected database. No figures are fabricated.</p></div></div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Sales this month" value={hasDashboardSummary ? money(Number(summary?.sales_this_month ?? 0), currency) : "Not connected"} detail={hasDashboardSummary ? "Posted sales, including VAT" : "Dashboard summary not yet deployed"} icon={ShoppingCart} tone="emerald" />
        <MetricCard label="Purchases this month" value={hasDashboardSummary ? money(Number(summary?.purchases_this_month ?? 0), currency) : "Not connected"} detail={hasDashboardSummary ? "Purchase order value" : "Dashboard summary not yet deployed"} icon={ShoppingBag} tone="blue" />
        <MetricCard label="Inventory cost value" value={money(hasDashboardSummary ? Number(summary?.inventory_cost_value ?? 0) : localStock.inventoryCostValue, currency)} detail="On-hand quantity × lot purchase cost" icon={Boxes} tone="amber" />
        <MetricCard label="Outstanding receivables" value={hasDashboardSummary ? money(Number(summary?.outstanding_receivables ?? 0), currency) : "Not connected"} detail={hasDashboardSummary ? "Unpaid and partially paid sales" : "Requires dashboard summary"} icon={TrendingUp} tone="slate" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active products" value={String(localStock.activeProducts)} detail="Company product master" icon={Package} />
        <MetricCard label="Low-stock products" value={String(hasDashboardSummary ? summary?.low_stock_products ?? 0 : localStock.lowStock)} detail="At or below reorder threshold" icon={ArrowDownRight} tone="amber" />
        <MetricCard label="Out of stock" value={String(hasDashboardSummary ? summary?.out_of_stock_products ?? 0 : localStock.outOfStock)} detail="Active products with no visible stock" icon={AlertTriangle} tone="rose" />
        <MetricCard label="Lots expiring in 30 days" value={String(hasDashboardSummary ? summary?.expiring_lots_30_days ?? 0 : localStock.expiringLots)} detail="Positive-quantity inventory lots" icon={Clock3} tone="blue" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,.8fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold text-slate-900 dark:text-white">Sales trend</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Monthly invoiced sales for the last six months</p></div>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><TrendingUp className="h-5 w-5" /></span>
          </div>
          {hasDashboardSummary && monthSales.length ? (
            <div className="mt-6 flex h-48 items-end gap-2 sm:gap-4">
              {monthSales.map((item) => {
                const value = Number(item.amount) || 0
                const height = Math.max(value > 0 ? 5 : 2, value / maxSales * 100)
                return <div key={item.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="max-w-full truncate text-[10px] text-slate-500" title={money(value, currency)}>{value > 0 ? money(value, currency) : "—"}</span>
                  <div className="flex h-32 w-full items-end rounded-t-md bg-slate-100 dark:bg-slate-800"><div className="w-full rounded-t-md bg-emerald-600" style={{ height: `${height}%` }} /></div>
                  <span className="text-xs text-slate-500">{item.month}</span>
                </div>
              })}
            </div>
          ) : (
            <div className="mt-5 grid h-48 place-items-center rounded-xl border border-dashed border-slate-200 text-center dark:border-slate-700">
              <div className="max-w-sm px-4"><TrendingUp className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Sales trend will appear here</p><p className="mt-1 text-xs text-slate-500">It will populate from posted sales once the dashboard summary migration is available.</p></div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <h2 className="font-semibold text-slate-900 dark:text-white">Operational snapshot</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Live counts from the current workspace</p>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Warehouse className="h-4 w-4 text-slate-400" /> Warehouses</span><strong className="text-sm">{hasDashboardSummary ? summary?.warehouse_count ?? warehouses.length : warehouses.length}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><ShoppingBag className="h-4 w-4 text-slate-400" /> Pending purchase orders</span><strong className="text-sm">{hasDashboardSummary ? summary?.pending_purchase_orders ?? 0 : "—"}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Activity className="h-4 w-4 text-slate-400" /> Stock movements loaded</span><strong className="text-sm">{movements.length}</strong></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link to="/workspace/pos" className="rounded-xl bg-emerald-700 px-3 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-800">Open POS</Link>
            <Link to="/workspace/purchasing" className="rounded-xl border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Purchasing</Link>
            <Link to="/workspace/catalog" className="rounded-xl border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Product catalog</Link>
            <Link to="/workspace/inventory" className="rounded-xl border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Inventory</Link>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Recent sales</h2><p className="mt-1 text-xs text-slate-500">Latest invoices visible to your membership</p></div><Link to="/workspace/sales" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View all</Link></div>
          {summary?.recent_sales?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800"><tr><th className="px-4 py-2 font-medium">Invoice</th><th className="px-4 py-2 font-medium">Customer</th><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 text-right font-medium">Total</th></tr></thead><tbody>{summary.recent_sales.map((sale) => <tr key={sale.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-3 font-medium">{sale.invoice_number}</td><td className="px-4 py-3">{sale.customer_name || "Walk-in customer"}</td><td className="px-4 py-3 text-slate-500">{dateLabel(sale.created_at)}</td><td className="px-4 py-3 text-right font-medium">{money(Number(sale.total), currency)}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-slate-500">No recent sales are available, or the dashboard summary has not been deployed.</p>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-slate-800"><div><h2 className="font-semibold text-slate-900 dark:text-white">Recent purchases</h2><p className="mt-1 text-xs text-slate-500">Latest purchase orders visible to your membership</p></div><Link to="/workspace/purchasing" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View all</Link></div>
          {summary?.recent_purchases?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800"><tr><th className="px-4 py-2 font-medium">Purchase order</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 text-right font-medium">Total</th></tr></thead><tbody>{summary.recent_purchases.map((purchase) => <tr key={purchase.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-3 font-medium">{purchase.purchase_number}</td><td className="px-4 py-3 capitalize">{purchase.status.replaceAll("_", " ")}</td><td className="px-4 py-3 text-slate-500">{dateLabel(purchase.created_at)}</td><td className="px-4 py-3 text-right font-medium">{money(Number(purchase.total), currency)}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-slate-500">No recent purchase orders are available, or the dashboard summary has not been deployed.</p>}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">Recent stock activity</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latest inventory movements in your permitted scope</p></div><Link to="/workspace/movements" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View movement ledger</Link></div>
        {recentMovements.length ? <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{recentMovements.map((movement) => {
          const product = products.find((item) => item.id === movement.product_id)
          const positive = Number(movement.quantity) > 0
          return <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{product?.name ?? "Product"} <span className="font-normal text-slate-500">· {movement.movement_type.replaceAll("_", " ")}</span></p><p className="mt-1 text-xs text-slate-500">{movement.reason || "No reason provided"} · {dateLabel(movement.created_at)}</p></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${positive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}`}>{positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{positive ? "+" : ""}{movement.quantity} {product?.unit ?? "units"}</span></div>
        })}</div> : <p className="py-8 text-center text-sm text-slate-500">No stock movements are available in the current view.</p>}
      </section>
      {summaryLoading && <p className="text-xs text-slate-500">Refreshing company dashboard figures…</p>}
    </section>
  )
}
