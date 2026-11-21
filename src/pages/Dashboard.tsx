import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Package,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
  Users,
  Warehouse,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useERP } from "../context/ERPContext"
import { useTheme } from "../context/ThemeContext"
import { getERPSettings } from "../lib/erpSettings"

type Period = "today" | "7d" | "30d" | "all" | "custom"

const PALETTE = ["#0F766E", "#2563EB", "#D97706", "#7C3AED", "#DB2777"]

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function toDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateInput(value: string, end = false) {
  if (!value) return null
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  if (end) date.setHours(23, 59, 59, 999)
  else date.setHours(0, 0, 0, 0)
  return date
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatCompactDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

function isWithinBounds(value: string, start: Date | null, end: Date | null) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return false
  if (start && timestamp < start.getTime()) return false
  if (end && timestamp > end.getTime()) return false
  return true
}

function safeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export default function Dashboard() {
  const { products, inventoryLots, inventoryMovements, customers, sales, purchases } = useERP()
  const { theme } = useTheme()
  const darkMode = theme === "dark"
  const settings = useMemo(() => getERPSettings(), [])
  const currency = settings.currency?.trim().toUpperCase() || "AED"
  const money = (value: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(safeNumber(value))
    } catch {
      return `${currency} ${safeNumber(value).toFixed(2)}`
    }
  }

  const today = startOfDay(new Date())
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  const [period, setPeriod] = useState<Period>("30d")
  const [customFrom, setCustomFrom] = useState(toDateInput(thirtyDaysAgo))
  const [customTo, setCustomTo] = useState(toDateInput(today))

  const bounds = useMemo(() => {
    const now = new Date()
    const end = new Date(now)
    if (period === "today") return { start: startOfDay(now), end }
    if (period === "7d") {
      const start = startOfDay(now)
      start.setDate(start.getDate() - 6)
      return { start, end }
    }
    if (period === "30d") {
      const start = startOfDay(now)
      start.setDate(start.getDate() - 29)
      return { start, end }
    }
    if (period === "custom") {
      return { start: parseDateInput(customFrom), end: parseDateInput(customTo, true) }
    }
    return { start: null, end: null }
  }, [period, customFrom, customTo])

  const periodSales = useMemo(() => sales.filter((sale) => isWithinBounds(sale.createdAt, bounds.start, bounds.end)), [sales, bounds])
  const periodPurchases = useMemo(() => purchases.filter((purchase) => isWithinBounds(purchase.createdAt, bounds.start, bounds.end)), [purchases, bounds])
  const completedSales = periodSales.filter((sale) => sale.status !== "Refunded")
  const salesRevenue = completedSales.reduce((sum, sale) => sum + safeNumber(sale.total), 0)
  const purchaseSpend = periodPurchases.reduce((sum, purchase) => sum + safeNumber(purchase.total), 0)
  const averageOrder = completedSales.length ? salesRevenue / completedSales.length : 0

  const stockByProduct = useMemo(() => products.map((product) => {
    const lots = inventoryLots.filter((lot) => lot.productId === product.id)
    const quantity = lots.reduce((sum, lot) => sum + safeNumber(lot.quantity), 0)
    const value = lots.reduce((sum, lot) => sum + safeNumber(lot.quantity) * safeNumber(lot.purchasePrice), 0)
    return { product, quantity, value }
  }), [products, inventoryLots])

  const inventoryUnits = inventoryLots.reduce((sum, lot) => sum + safeNumber(lot.quantity), 0)
  const inventoryValue = inventoryLots.reduce((sum, lot) => sum + safeNumber(lot.quantity) * safeNumber(lot.purchasePrice), 0)
  const lowStockProducts = stockByProduct
    .filter(({ product, quantity }) => quantity <= safeNumber(product.minimumStock))
    .sort((a, b) => a.quantity - b.quantity)
  const expiringLots = useMemo(() => {
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + 90)
    return inventoryLots
      .filter((lot) => {
        if (safeNumber(lot.quantity) <= 0 || !lot.expiry) return false
        const expiry = parseDateInput(lot.expiry)
        return Boolean(expiry && expiry >= today && expiry <= cutoff)
      })
      .sort((a, b) => a.expiry.localeCompare(b.expiry))
      .map((lot) => ({ lot, product: products.find((product) => product.id === lot.productId) }))
  }, [inventoryLots, products, today.getTime()])

  const costCoverage = useMemo(() => {
    let eligible = 0
    let costed = 0
    let cogs = 0
    let grossRevenue = 0
    for (const sale of completedSales) {
      for (const item of sale.items) {
        eligible += 1
        if (item.costSnapshot && Number.isFinite(Number(item.costSnapshot.cogs))) {
          costed += 1
          cogs += safeNumber(item.costSnapshot.cogs)
          grossRevenue += safeNumber(item.total)
        }
      }
    }
    return {
      eligible,
      costed,
      coverage: eligible ? (costed / eligible) * 100 : 0,
      cogs,
      grossProfit: grossRevenue - cogs,
    }
  }, [completedSales])

  const paymentMix = useMemo(() => {
    const methods = ["Cash", "Card", "Credit", "Bank Transfer"] as const
    return methods.map((name) => ({
      name,
      value: completedSales
        .filter((sale) => sale.paymentMethod === name)
        .reduce((sum, sale) => sum + safeNumber(sale.total), 0),
    })).filter((item) => item.value > 0)
  }, [completedSales])

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number }>()
    for (const sale of completedSales) {
      for (const item of sale.items) {
        const current = map.get(item.productId)
        if (current) {
          current.units += safeNumber(item.quantity)
          current.revenue += safeNumber(item.total)
        } else {
          map.set(item.productId, {
            name: item.name,
            units: safeNumber(item.quantity),
            revenue: safeNumber(item.total),
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6)
  }, [completedSales])

  const recentSales = useMemo(() => [...periodSales]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6), [periodSales])
  const recentPurchases = useMemo(() => [...periodPurchases]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5), [periodPurchases])
  const recentMovements = useMemo(() => [...inventoryMovements]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6), [inventoryMovements])

  const salesTrend = useMemo(() => {
    const days = 14
    const trendStart = startOfDay(new Date())
    trendStart.setDate(trendStart.getDate() - (days - 1))
    const trendSales = sales.filter((sale) => sale.status !== "Refunded" && isWithinBounds(sale.createdAt, trendStart, new Date()))
    const result: { label: string; sales: number }[] = []
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = startOfDay(new Date())
      date.setDate(date.getDate() - index)
      const key = date.getTime()
      const amount = trendSales
        .filter((sale) => startOfDay(new Date(sale.createdAt)).getTime() === key)
        .reduce((sum, sale) => sum + safeNumber(sale.total), 0)
      result.push({ label: formatCompactDate(date), sales: Number(amount.toFixed(2)) })
    }
    return result
  }, [sales])

  const totalUnitsSold = completedSales.reduce((sum, sale) =>
    sum + sale.items.reduce((itemSum, item) => itemSum + safeNumber(item.quantity), 0), 0)
  const pendingCredit = completedSales
    .filter((sale) => sale.status === "Pending")
    .reduce((sum, sale) => sum + safeNumber(sale.total), 0)
  const dateLabel = period === "today" ? "Today" : period === "7d" ? "Last 7 days" : period === "30d" ? "Last 30 days" : period === "all" ? "All time" : "Selected dates"
  const chartGrid = darkMode ? "#33443a" : "#E5E7EB"
  const chartAxisText = darkMode ? "#aebbb2" : "#64748B"
  const chartTooltipStyle = {
    backgroundColor: darkMode ? "#18231c" : "#ffffff",
    borderColor: darkMode ? "#405248" : "#E2E8F0",
    color: darkMode ? "#edf4ef" : "#17221D",
    borderRadius: 12,
  }
  const totalCustomers = customers.length
  const totalPurchasesAllTime = purchases.reduce((sum, purchase) => sum + safeNumber(purchase.total), 0)

  return (
    <section className="min-h-full space-y-6 bg-slate-50 p-4 md:p-6 dark:bg-[#0b120e]">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Universal ERP · Management overview</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-3xl">Business dashboard</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A live operational view of sales, procurement, inventory and business activity.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <CalendarDays size={16} />
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </div>
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} aria-label="Dashboard date range" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
        </header>

        {period === "custom" && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <label className="text-xs font-medium text-slate-500">From<input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label>
            <label className="text-xs font-medium text-slate-500">To<input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label>
            <p className="pb-2 text-xs text-slate-400">The selected range filters sales and purchase summaries.</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Sales value" value={money(salesRevenue)} note={`${completedSales.length} transactions · ${dateLabel}`} icon={CircleDollarSign} tone="emerald" />
          <MetricCard title="Average order value" value={money(averageOrder)} note="Average per non-refunded sale" icon={ShoppingCart} tone="blue" />
          <MetricCard title="Purchase expenditure" value={money(purchaseSpend)} note={`${periodPurchases.length} purchases · ${dateLabel}`} icon={ShoppingBag} tone="violet" />
          <MetricCard title="Inventory valuation" value={money(inventoryValue)} note={`${inventoryUnits.toLocaleString()} units · valued at recorded lot purchase cost`} icon={Boxes} tone="amber" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Recorded cost of sales" value={costCoverage.costed ? money(costCoverage.cogs) : "Not available"} note={costCoverage.costed ? `Cost snapshots available for ${costCoverage.coverage.toFixed(0)}% of sale lines` : "No cost snapshots recorded"} icon={TrendingUp} tone="emerald" />
          <MetricCard title="Outstanding credit (recorded)" value={money(pendingCredit)} note="Sales marked Pending; not an aged receivables ledger" icon={Clock3} tone="amber" />
          <MetricCard title="Customers" value={totalCustomers.toLocaleString()} note="Customer records in this workspace" icon={Users} tone="blue" />
          <MetricCard title="Low-stock products" value={lowStockProducts.length.toLocaleString()} note="At or below minimum stock level" icon={AlertTriangle} tone="rose" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
          <Panel title="Sales performance" description="Daily sales from the current workspace records · last 14 days" icon={TrendingUp}>
            <div className="h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesTrend} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGrid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: chartAxisText, fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: chartAxisText, fontSize: 11 }} width={64} tickFormatter={(value) => Number(value).toLocaleString()} />
                  <Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} />
                  <Bar dataKey="sales" name="Sales" fill="#0F766E" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Payment mix" description={`${dateLabel} · non-refunded sales`} icon={Banknote}>
            {paymentMix.length ? (
              <>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentMix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>
                        {paymentMix.map((item, index) => <Cell key={item.name} fill={PALETTE[index % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {paymentMix.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />{item.name}</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{money(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState icon={Banknote} title="No payment records" description="Payment totals will appear when sales are recorded." />}
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Recent sales" description="Latest sales in the selected period" icon={ShoppingCart} action={<Link to="/sales" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View sales <ChevronRight className="inline h-3 w-3" /></Link>}>
            {recentSales.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{sale.invoiceNumber}</p><p className="mt-1 truncate text-xs text-slate-500">{sale.customerName || "Walk-in customer"} · {formatDate(sale.createdAt)}</p></div>
                  <div className="shrink-0 text-right"><p className="text-sm font-semibold text-slate-900 dark:text-white">{money(sale.total)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${sale.status === "Paid" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : sale.status === "Refunded" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}>{sale.status}</span></div>
                </div>
              ))}
            </div> : <EmptyState icon={ShoppingCart} title="No sales in this period" description="Sales will appear here when transactions are recorded." />}
          </Panel>

          <Panel title="Top-selling products" description="Ranked by recorded sales value in the selected period" icon={Package} action={<Link to="/inventory" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open inventory <ChevronRight className="inline h-3 w-3" /></Link>}>
            {topProducts.length ? <div className="space-y-3">
              {topProducts.map((product, index) => {
                const maxRevenue = topProducts[0]?.revenue || 1
                return <div key={product.name}>
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-200"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-500 dark:bg-slate-800">{index + 1}</span>{product.name}</span><span className="shrink-0 font-semibold text-slate-900 dark:text-white">{money(product.revenue)}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(3, (product.revenue / maxRevenue) * 100)}%` }} /></div>
                  <p className="mt-1 text-[11px] text-slate-400">{product.units.toLocaleString()} units sold</p>
                </div>
              })}
            </div> : <EmptyState icon={Package} title="No product sales yet" description="Product performance will appear after sales are recorded." />}
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel title="Inventory health" description="Live stock and expiry monitoring" icon={Warehouse} action={<Link to="/inventory" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">View stock <ChevronRight className="inline h-3 w-3" /></Link>}>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-xs text-slate-500">Low stock</p><p className="mt-1 text-2xl font-semibold text-amber-600">{lowStockProducts.length}</p></div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-xs text-slate-500">Expiring in 90 days</p><p className="mt-1 text-2xl font-semibold text-rose-600">{expiringLots.length}</p></div>
            </div>
            {lowStockProducts.length ? <div className="mt-4 space-y-2">{lowStockProducts.slice(0, 4).map(({ product, quantity }) => <div key={product.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-600 dark:text-slate-300">{product.name}</span><span className="shrink-0 font-semibold text-amber-700">{quantity} / min {product.minimumStock}</span></div>)}</div> : <p className="mt-4 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={15} /> No products currently below minimum stock.</p>}
            {expiringLots.length ? <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800"><p className="mb-2 text-xs font-semibold text-slate-500">Upcoming expiry</p>{expiringLots.slice(0, 3).map(({ lot, product }) => <div key={lot.id} className="flex items-center justify-between gap-2 py-1 text-xs"><span className="truncate text-slate-600 dark:text-slate-300">{product?.name ?? "Unknown product"} · {lot.batch || "No batch"}</span><span className="shrink-0 text-rose-600">{lot.expiry}</span></div>)}</div> : null}
          </Panel>

          <Panel title="Purchasing activity" description={`${dateLabel} · recorded purchases`} icon={ShoppingBag} action={<Link to="/purchasing" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open purchasing <ChevronRight className="inline h-3 w-3" /></Link>}>
            <div className="mb-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-xs text-slate-500">Purchase expenditure</p><p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{money(purchaseSpend)}</p><p className="mt-1 text-[11px] text-slate-400">All-time recorded purchases: {money(totalPurchasesAllTime)}</p></div>
            {recentPurchases.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{recentPurchases.map((purchase) => <div key={purchase.id} className="flex items-center justify-between gap-2 py-2 first:pt-0"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{purchase.purchaseNumber}</p><p className="truncate text-[11px] text-slate-400">{purchase.supplierName || "Supplier not recorded"} · {formatDate(purchase.createdAt)}</p></div><span className="shrink-0 text-xs font-semibold text-slate-800 dark:text-white">{money(purchase.total)}</span></div>)}</div> : <p className="text-xs text-slate-400">No purchases in this period.</p>}
          </Panel>

          <Panel title="Management indicators" description="Operational metrics available in this workspace" icon={Activity}>
            <div className="space-y-3">
              <Indicator label="Customers registered" value={totalCustomers.toLocaleString()} icon={Users} />
              <Indicator label="Units sold in period" value={totalUnitsSold.toLocaleString()} icon={ArrowDownToLine} />
              <Indicator label="Stock movements recorded" value={inventoryMovements.length.toLocaleString()} icon={Activity} />
              <Indicator label="Recorded sale transactions" value={periodSales.length.toLocaleString()} icon={FileText} />
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Accounting modules not configured</p><p className="mt-1 text-[11px] leading-5 text-slate-500">A general ledger, supplier payables, bank balances and reconciled cash flow are not part of this local data model yet. They will be added as connected finance modules rather than estimated here.</p></div>
          </Panel>
        </div>

        <Panel title="Recent stock activity" description="Latest inventory movements recorded in the workspace" icon={Activity} action={<Link to="/inventory" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Inventory details <ChevronRight className="inline h-3 w-3" /></Link>}>
          {recentMovements.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-2 font-semibold">Movement</th><th className="pb-2 font-semibold">Product</th><th className="pb-2 font-semibold">Quantity</th><th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">Reason</th></tr></thead><tbody>{recentMovements.map((movement) => { const product = products.find((item) => item.id === movement.productId); return <tr key={movement.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"><td className="py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{movement.type}</span></td><td className="py-3 font-medium text-slate-800 dark:text-slate-200">{product?.name ?? "Unknown product"}</td><td className="py-3 tabular-nums text-slate-600 dark:text-slate-300">{movement.quantity.toLocaleString()}</td><td className="py-3 text-xs text-slate-500">{formatDate(movement.createdAt)}</td><td className="py-3 text-xs text-slate-500">{movement.reason || "—"}</td></tr> })}</tbody></table></div> : <EmptyState icon={Activity} title="No stock movements" description="Receipts, sales, returns and adjustments will appear here." />}
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink to="/pos" label="New sale" description="Open point of sale" icon={ShoppingCart} />
          <QuickLink to="/purchasing" label="Record purchase" description="Manage procurement" icon={ShoppingBag} />
          <QuickLink to="/inventory" label="Manage inventory" description="Review stock and batches" icon={Warehouse} />
          <QuickLink to="/reports" label="Business reports" description="Open analytics and reports" icon={FileText} />
        </div>
      </div>
    </section>
  )
}

function MetricCard({ title, value, note, icon: Icon, tone }: {
  title: string
  value: string
  note: string
  icon: LucideIcon
  tone: "emerald" | "blue" | "violet" | "amber" | "rose"
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  }
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p><p className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-2xl">{value}</p></div><span className={`rounded-xl p-3 ${tones[tone]}`}><Icon className="h-5 w-5" /></span></div><p className="mt-3 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{note}</p></div>
}

function Panel({ title, description, icon: Icon, action, children }: {
  title: string
  description: string
  icon: LucideIcon
  action?: ReactNode
  children: ReactNode
}) {
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p></div></div>{action}</div>{children}</section>
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-8 text-center dark:bg-slate-800/50"><Icon className="h-7 w-7 text-slate-300 dark:text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{description}</p></div>
}

function Indicator({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Icon className="h-4 w-4" />{label}</span><strong className="text-sm text-slate-900 dark:text-white">{value}</strong></div>
}

function QuickLink({ to, label, description, icon: Icon }: { to: string; label: string; description: string; icon: LucideIcon }) {
  return <Link to={to} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900 dark:text-white">{label}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{description}</span></span><ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-emerald-600" /></Link>
}
