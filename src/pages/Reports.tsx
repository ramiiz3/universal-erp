import { useMemo, useState } from "react"
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"
import * as XLSX from "xlsx"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useERP } from "../context/ERPContext"
import { expiryWithinWindow, parseExpiryDate } from "../lib/expiry"
import {
  buildReportDataset,
  exportReportCsv,
  exportReportWorkbook,
  getDateRange,
  type ReportRangeMode,
} from "../lib/reporting"

const GREEN = "#2F9E63"
const DARK = "#17221D"
const AMBER = "#D97706"
const SLATE = "#64748B"

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

const formatDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default function Reports() {
  const {
    products,
    inventoryLots,
    sales,
  } = useERP()

  const [rangeMode, setRangeMode] = useState<ReportRangeMode>("monthly")
  const [customStart, setCustomStart] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 29)
    return formatDateInput(date)
  })
  const [customEnd, setCustomEnd] = useState(() => formatDateInput(new Date()))

  const currentRange = useMemo(
    () => getDateRange(rangeMode, new Date(), customStart, customEnd),
    [rangeMode, customStart, customEnd],
  )

  const report = useMemo(
    () =>
      buildReportDataset({
        sales,
        products,
        period: currentRange,
        title: "UniversalERP Report",
      }),
    [sales, products, currentRange],
  )

  const salesInRange = useMemo(
    () =>
      sales.filter((sale) => {
        const timestamp = new Date(sale.createdAt).getTime()
        return timestamp >= currentRange.start.getTime() && timestamp <= currentRange.end.getTime()
      }),
    [sales, currentRange],
  )

  const totalDiscount = salesInRange.reduce((sum, sale) => sum + sale.discount, 0)
  const totalVat = salesInRange.reduce((sum, sale) => sum + sale.vat, 0)
  const totalUnitsSold = salesInRange.reduce(
    (sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  )

  const inventoryValue = inventoryLots.reduce((sum, lot) => sum + lot.quantity * lot.purchasePrice, 0)
  const inventoryUnits = inventoryLots.reduce((sum, lot) => sum + lot.quantity, 0)

  const lowStockProducts = products.filter((product) => {
    const stock = inventoryLots
      .filter((lot) => lot.productId === product.id)
      .reduce((sum, lot) => sum + lot.quantity, 0)

    return stock <= product.minimumStock
  })

  const expiringLots = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + 90)

    return inventoryLots
      .filter((lot) => {
        if (lot.quantity <= 0) return false
        return expiryWithinWindow(lot.expiry, new Date(), cutoff)
      })
      .sort((a, b) => {
        const aTime = parseExpiryDate(a.expiry)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bTime = parseExpiryDate(b.expiry)?.getTime() ?? Number.MAX_SAFE_INTEGER
        return aTime - bTime
      })
  }, [inventoryLots])

  const paymentData = useMemo(() => {
    const cash = salesInRange.filter((sale) => sale.paymentMethod === "Cash").reduce((sum, sale) => sum + sale.total, 0)
    const card = salesInRange.filter((sale) => sale.paymentMethod === "Card").reduce((sum, sale) => sum + sale.total, 0)
    const credit = salesInRange.filter((sale) => sale.paymentMethod === "Credit").reduce((sum, sale) => sum + sale.total, 0)

    return [
      { name: "Cash", value: Number(cash.toFixed(2)) },
      { name: "Card", value: Number(card.toFixed(2)) },
      { name: "Credit", value: Number(credit.toFixed(2)) },
    ].filter((entry) => entry.value > 0)
  }, [salesInRange])

  const topProducts = useMemo(
    () =>
      report.productBreakdown
        .slice()
        .sort((a, b) => b.quantitySold - a.quantitySold)
        .slice(0, 5),
    [report.productBreakdown],
  )

  const topProductsChart = topProducts.map((item) => ({
    name: item.name.length > 16 ? `${item.name.slice(0, 13)}...` : item.name,
    units: item.quantitySold,
  }))

  const salesChart = useMemo(() => {
    const data: Array<{ label: string; sales: number; units: number }> = []

    const start = new Date(currentRange.start)
    const end = new Date(currentRange.end)

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const key = startOfDay(cursor).toISOString().slice(0, 10)
      const dayRows = report.dailyBreakdown.filter((entry) => entry.date === key)
      const dayValue = dayRows.reduce((sum, row) => sum + row.grossSales, 0)
      const dayUnits = dayRows.reduce((sum, row) => sum + row.transactions, 0)

      data.push({
        label: formatShortDate(cursor),
        sales: Number(dayValue.toFixed(2)),
        units: dayUnits,
      })
    }

    return data
  }, [currentRange, report.dailyBreakdown])

  const paymentColors = [GREEN, DARK, AMBER]

  const customRangeInvalid =
    rangeMode === "custom" &&
    !!customStart &&
    !!customEnd &&
    new Date(customStart).getTime() > new Date(customEnd).getTime()

  const exportCsv = () => {
    const csv = exportReportCsv(report)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `universalerp-report-${rangeMode}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportXlsx = async () => {
    const workbook = await exportReportWorkbook(report)
    XLSX.writeFile(workbook, `universalerp-report-${rangeMode}.xlsx`)
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">Business performance based on your recorded ERP data.</p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(["daily", "weekly", "monthly", "yearly", "custom"] as ReportRangeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRangeMode(mode)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                    rangeMode === mode ? "bg-[#17221D] text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {mode === "custom" ? "Custom" : mode}
                </button>
              ))}
            </div>

            {rangeMode === "custom" && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm"
                />
                <span className="text-sm text-slate-500">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm"
                />
              </div>
            )}

            {customRangeInvalid && (
              <p className="text-xs text-red-600">The custom start date must be on or before the end date.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
              <button
                type="button"
                onClick={exportXlsx}
                className="inline-flex items-center gap-2 rounded-xl bg-[#17221D] px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#24342B]"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <span className="font-semibold text-slate-900">Period:</span> {report.range?.label ?? "Selected period"}
          {report.summary.costsUnavailableCount > 0 && (
            <span className="ml-3 inline-block text-amber-700">{report.summary.costsUnavailableMessage}</span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Gross Sales</p>
              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><CircleDollarSign className="h-4 w-4" /></div>
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{money(report.summary.grossSales)}</p>
            <p className="mt-1 text-xs text-slate-500">{report.summary.transactionCount} transaction{report.summary.transactionCount === 1 ? "" : "s"}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Discounts</p>
              <div className="rounded-xl bg-slate-100 p-2 text-slate-700"><ShoppingCart className="h-4 w-4" /></div>
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{money(report.summary.discounts)}</p>
            <p className="mt-1 text-xs text-slate-500">Applied to selected period</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Net Sales</p>
              <div className="rounded-xl bg-blue-50 p-2 text-blue-700"><TrendingUp className="h-4 w-4" /></div>
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{money(report.summary.netSales)}</p>
            <p className="mt-1 text-xs text-slate-500">Excludes VAT and discounts</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">COGS</p>
              <div className="rounded-xl bg-violet-50 p-2 text-violet-700"><Package className="h-4 w-4" /></div>
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{money(report.summary.cogs)}</p>
            <p className="mt-1 text-xs text-slate-500">Historical cost on verified sales only</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Gross Profit</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{money(report.summary.grossProfit)}</p>
            <p className="mt-1 text-xs text-slate-500">Margin {report.summary.grossMargin.toFixed(1)}%</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">VAT Collected</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{money(report.summary.vatCollected)}</p>
            <p className="mt-1 text-xs text-slate-500">Shown separately from net sales</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Refunds</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{money(report.summary.refunds)}</p>
            <p className="mt-1 text-xs text-slate-500">Trustworthy refund data only</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Transactions</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{report.summary.transactionCount}</p>
            <p className="mt-1 text-xs text-slate-500">Selected date range</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Inventory Value</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{money(inventoryValue)}</p>
            <p className="mt-1 text-xs text-slate-500">{inventoryUnits} units in stock</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Sales Trend</h2>
                <p className="mt-1 text-xs text-slate-500">Daily gross sales in the selected period.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-slate-400" />
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fill: SLATE, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: SLATE, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => `AED ${Number(value).toFixed(2)}`} />
                  <Bar dataKey="sales" fill={GREEN} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="font-semibold text-slate-900">Payment Mix</h2>
              <p className="mt-1 text-xs text-slate-500">Sales by payment method.</p>
            </div>

            <div className="mt-4 h-[250px]">
              {paymentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={88} paddingAngle={3}>
                      {paymentData.map((_, index) => (
                        <Cell key={`payment-${index}`} fill={paymentColors[index % paymentColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `AED ${Number(value).toFixed(2)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-center text-sm text-slate-500">
                  No payment data yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Top Products</h2>
                <p className="mt-1 text-xs text-slate-500">Based on units sold in the selected period.</p>
              </div>
              <Package className="h-5 w-5 text-slate-400" />
            </div>

            {topProducts.length > 0 ? (
              <>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductsChart} layout="vertical" margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                      <XAxis type="number" tick={{ fill: SLATE, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={105} tick={{ fill: SLATE, fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="units" fill={DARK} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 space-y-2">
                  {topProducts.map((product, index) => (
                    <div key={product.productId} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-semibold text-slate-500">{index + 1}</span>
                        <span className="text-sm font-medium text-slate-800">{product.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{product.quantitySold} units</p>
                        <p className="text-xs text-slate-500">{money(product.netSales)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-[300px] items-center justify-center rounded-xl bg-slate-50 text-center text-sm text-slate-500">
                No sales data for this period.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Stock Alerts</h2>
                <p className="mt-1 text-xs text-slate-500">Products and batches needing attention.</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-red-800">Low / Out of Stock</p>
                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-red-700">{lowStockProducts.length}</span>
                </div>

                {lowStockProducts.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {lowStockProducts.slice(0, 4).map((product) => {
                      const stock = inventoryLots
                        .filter((lot) => lot.productId === product.id)
                        .reduce((sum, lot) => sum + lot.quantity, 0)

                      return (
                        <div key={product.id} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2">
                          <span className="text-sm text-slate-700">{product.name}</span>
                          <span className="text-xs font-semibold text-red-700">{stock} / min {product.minimumStock}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-red-700">No low-stock products.</p>
                )}
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-800">Expiring Within 90 Days</p>
                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-amber-700">{expiringLots.length}</span>
                </div>

                {expiringLots.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {expiringLots.slice(0, 4).map((lot) => {
                      const product = products.find((item) => item.id === lot.productId)

                      return (
                        <div key={lot.id} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2">
                          <div>
                            <p className="text-sm text-slate-700">{product?.name ?? "Unknown Product"}</p>
                            <p className="text-[11px] text-slate-500">Batch {lot.batch}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-amber-700">{lot.quantity} units</p>
                            <p className="text-[11px] text-slate-500">Exp {lot.expiry}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">No batches expiring within 90 days.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Units Sold</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{totalUnitsSold}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Discounts Given</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{money(totalDiscount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">VAT Collected</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{money(totalVat)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Low Stock Products</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{lowStockProducts.length}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
