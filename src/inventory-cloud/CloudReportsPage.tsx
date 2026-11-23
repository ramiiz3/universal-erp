import { useCallback, useEffect, useRef, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { useCloudInventory } from "./CloudInventoryContext"
import { buildCloudSalesReport, type CloudReportLine, type CloudReportPayment, type CloudReportSale } from "./reports"

const localDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: /^[A-Z]{3}$/.test(currency) ? currency : "AED",
  maximumFractionDigits: 2,
}).format(Number.isFinite(amount) ? amount : 0)
const csvCell = (value: unknown) => {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}
function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
function Metric({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>
    </article>
  )
}

export default function CloudReportsPage() {
  const { activeCompany } = useAuth()
  const { companyId, branches } = useCloudInventory()
  const currency = activeCompany?.currency ?? "AED"
  const today = new Date()
  const [fromDate, setFromDate] = useState(() => localDate(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [toDate, setToDate] = useState(() => localDate(today))
  const [branchId, setBranchId] = useState("")
  const [sales, setSales] = useState<CloudReportSale[]>([])
  const [lines, setLines] = useState<CloudReportLine[]>([])
  const [payments, setPayments] = useState<CloudReportPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const requestVersion = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestVersion.current
    if (!supabase || !companyId) {
      setSales([])
      setLines([])
      setPayments([])
      setError("Reports are unavailable until an active company is verified.")
      setLoading(false)
      return
    }
    if (!fromDate || !toDate || fromDate > toDate) {
      setError("Choose a valid start date and an end date on or after it.")
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")
    setNotice("")
    const start = new Date(`${fromDate}T00:00:00`).toISOString()
    const endExclusive = new Date(`${toDate}T00:00:00`)
    endExclusive.setDate(endExclusive.getDate() + 1)

    let salesQuery = supabase
      .from("cloud_sales")
      .select("id, invoice_number, branch_id, customer_name, customer_phone, subtotal, discount_total, vat_total, total, amount_paid, payment_status, currency, created_at")
      .eq("company_id", companyId)
      .gte("created_at", start)
      .lt("created_at", endExclusive.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000)
    if (branchId) salesQuery = salesQuery.eq("branch_id", branchId)

    const { data: saleRows, error: salesError } = await salesQuery
    if (requestId !== requestVersion.current) return
    if (salesError) {
      setSales([])
      setLines([])
      setPayments([])
      setError(`Could not load sales for this report. ${salesError.message}`)
      setLoading(false)
      return
    }

    const selectedSales = (saleRows ?? []) as unknown as CloudReportSale[]
    const saleIds = selectedSales.map((sale) => sale.id)
    if (!saleIds.length) {
      setSales([])
      setLines([])
      setPayments([])
      setLoading(false)
      return
    }

    const [lineResult, paymentResult] = await Promise.all([
      supabase.from("cloud_sale_lines")
        .select("sale_id, product_id, product_name, sku, quantity, unit_price, unit_cost, discount_amount, vat_rate, vat_amount, line_total")
        .eq("company_id", companyId)
        .in("sale_id", saleIds)
        .limit(10000),
      supabase.from("cloud_sale_payments")
        .select("sale_id, method, amount")
        .eq("company_id", companyId)
        .in("sale_id", saleIds)
        .limit(10000),
    ])
    if (requestId !== requestVersion.current) return
    const relatedErrors = [lineResult, paymentResult]
      .filter((result) => result.error)
      .map((result) => result.error?.message)
    if (relatedErrors.length) {
      setSales(selectedSales)
      setLines([])
      setPayments([])
      setError(`Invoices loaded, but some report details are unavailable: ${relatedErrors.join("; ")}`)
    } else {
      setSales(selectedSales)
      setLines((lineResult.data ?? []) as unknown as CloudReportLine[])
      setPayments((paymentResult.data ?? []) as unknown as CloudReportPayment[])
    }
    if (selectedSales.length === 2000) {
      setNotice("This report reached the 2,000-invoice retrieval limit. Narrow the date range to include all invoices.")
    }
    setLoading(false)
  }, [companyId, fromDate, toDate, branchId])

  useEffect(() => {
    void refresh()
    return () => { requestVersion.current += 1 }
  }, [refresh])

  const report = buildCloudSalesReport(sales, lines, payments)

  function exportRegister() {
    const rows: unknown[][] = [[
      "Invoice", "Date", "Branch", "Customer", "Gross sales", "Discount",
      "VAT", "Invoice total", "Collected", "Outstanding", "Payment status",
    ]]
    for (const sale of sales) {
      rows.push([
        sale.invoice_number,
        sale.created_at,
        branches.find((branch) => branch.id === sale.branch_id)?.name ?? sale.branch_id,
        sale.customer_name,
        sale.subtotal,
        sale.discount_total,
        sale.vat_total,
        sale.total,
        sale.amount_paid,
        Math.max(0, Number(sale.total) - Number(sale.amount_paid)),
        sale.payment_status,
      ])
    }
    downloadCsv(`cloud-sales-register-${fromDate}-to-${toDate}.csv`, rows)
  }

  function exportProducts() {
    downloadCsv(`cloud-product-performance-${fromDate}-to-${toDate}.csv`, [
      ["Product", "SKU", "Quantity sold", "Net sales ex VAT", "VAT", "Cost of goods", "Gross profit"],
      ...report.products.map((product) => [
        product.name, product.sku, product.quantity, product.netSales,
        product.vat, product.cost, product.grossProfit,
      ]),
    ])
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Company reporting</p>
          <h1 className="mt-1 text-2xl font-semibold">Sales reports</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Invoice, collection, VAT, product performance and gross margin from posted cloud sales.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportRegister} disabled={loading || !sales.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-slate-700"><Download className="h-4 w-4" /> Export register</button>
          <button type="button" onClick={exportProducts} disabled={loading || !report.products.length} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-slate-700"><Download className="h-4 w-4" /> Export products</button>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
        <label className="block text-sm font-medium">From date<input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
        <label className="block text-sm font-medium">To date<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
        <label className="block text-sm font-medium">Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">All permitted branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <span className="pb-2 text-xs text-slate-500">{sales.length.toLocaleString()} invoices loaded</span>
      </section>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{notice}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Invoice total" value={money(report.invoiceCount ? report.grossSales - report.discounts + report.vat : 0, currency)} note={`${report.invoiceCount.toLocaleString()} posted invoices, including VAT`} />
        <Metric label="Net sales (ex VAT)" value={money(report.netSales, currency)} note="After discounts, before VAT" />
        <Metric label="VAT on invoices" value={money(report.vat, currency)} note="Recorded VAT totals on invoice lines" />
        <Metric label="Collections" value={money(report.collected, currency)} note="Payments posted against these invoices" />
        <Metric label="Outstanding invoices" value={money(report.outstanding, currency)} note={`${report.unpaidInvoices} unpaid · ${report.partiallyPaidInvoices} partial`} />
        <Metric label="Cost of goods sold" value={money(report.costOfGoods, currency)} note="Sold quantity × recorded lot cost" />
        <Metric label="Gross profit" value={money(report.grossProfit, currency)} note="Net sales less recorded lot cost" />
        <Metric label="Average invoice" value={money(report.averageInvoice, currency)} note="Invoice total including VAT" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Collections by payment method</h2>
          <p className="mt-1 text-xs text-slate-500">Payment records posted against invoices in this period</p>
          <div className="mt-4 space-y-3">
            {(["cash", "card", "bank_transfer", "other"] as const).map((method) => (
              <div key={method} className="flex items-center justify-between gap-3 text-sm">
                <span className="capitalize">{method.replace("_", " ")}</span>
                <strong>{money(report.paymentsByMethod[method], currency)}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <div className="flex justify-between"><span>Paid invoices</span><strong>{report.paidInvoices}</strong></div>
            <div className="mt-2 flex justify-between"><span>Partially paid</span><strong>{report.partiallyPaidInvoices}</strong></div>
            <div className="mt-2 flex justify-between"><span>Unpaid invoices</span><strong>{report.unpaidInvoices}</strong></div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Product performance</h2><span className="text-xs text-slate-500">{report.products.length} products sold</span></div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800"><tr><th className="py-2">Product</th><th>Qty</th><th>Net sales</th><th>COGS</th><th>Gross profit</th></tr></thead>
              <tbody>
                {report.products.slice(0, 20).map((product) => <tr key={product.productId || product.sku} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="py-2 font-medium">{product.name}<span className="block text-xs text-slate-500">{product.sku}</span></td>
                  <td>{product.quantity.toLocaleString()}</td><td>{money(product.netSales, currency)}</td><td>{money(product.cost, currency)}</td><td className="font-semibold">{money(product.grossProfit, currency)}</td>
                </tr>)}
                {!loading && !report.products.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No product sales in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Sales register</h2><p className="mt-1 text-xs text-slate-500">Open an invoice to see the saved line and payment details.</p></div><Link to="/workspace/sales" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">All sales</Link></div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800"><tr><th className="py-2">Invoice</th><th>Date</th><th>Customer</th><th>Subtotal</th><th>VAT</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              {sales.map((sale) => <tr key={sale.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-3 font-semibold"><Link className="text-emerald-700 hover:underline dark:text-emerald-400" to={`/workspace/invoices/${sale.id}`}>{sale.invoice_number}</Link></td>
                <td>{new Date(sale.created_at).toLocaleString()}</td><td>{sale.customer_name || "Walk-in"}{sale.customer_phone && <span className="block text-xs text-slate-500">{sale.customer_phone}</span>}</td><td>{money(Number(sale.subtotal) - Number(sale.discount_total), currency)}</td><td>{money(Number(sale.vat_total), currency)}</td><td className="font-semibold">{money(Number(sale.total), currency)}</td><td>{money(Number(sale.amount_paid), currency)}</td><td>{money(Math.max(0, Number(sale.total) - Number(sale.amount_paid)), currency)}</td><td><span className={`rounded-full px-2 py-1 text-xs font-medium ${sale.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{sale.payment_status}</span></td>
              </tr>)}
              {!loading && !sales.length && <tr><td colSpan={9} className="py-10 text-center text-slate-500">No invoices were posted in this reporting period.</td></tr>}
              {loading && <tr><td colSpan={9} className="py-10 text-center text-slate-500">Loading company sales…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-slate-500">Gross profit is an operational estimate based on saved lot purchase costs; this report is not a general ledger or a VAT return. Results respect the active company and database row-level access policies.</p>
    </section>
  )
}
