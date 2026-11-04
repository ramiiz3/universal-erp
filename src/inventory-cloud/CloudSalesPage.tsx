import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"

type CloudSaleRow = {
  id: string
  invoice_number: string
  branch_id: string
  customer_name: string
  customer_phone: string
  subtotal: number
  discount_total: number
  vat_total: number
  total: number
  amount_paid: number
  payment_status: "unpaid" | "partial" | "paid"
  currency: string
  created_at: string
}

export default function CloudSalesPage() {
  const { activeCompany } = useAuth()
  const activeCompanyId = activeCompany?.companyId ?? ""
  const requestVersion = useRef(0)
  const [sales, setSales] = useState<CloudSaleRow[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const requestId = ++requestVersion.current
    if (!supabase || !activeCompanyId) {
      return () => { requestVersion.current += 1 }
    }
    void supabase
      .from("cloud_sales")
      .select("id, invoice_number, branch_id, customer_name, customer_phone, subtotal, discount_total, vat_total, total, amount_paid, payment_status, currency, created_at")
      .eq("company_id", activeCompanyId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error: resultError }) => {
        if (requestId !== requestVersion.current) return
        if (resultError) setError(resultError.message)
        setSales((data ?? []) as CloudSaleRow[])
        setLoading(false)
      })
    return () => { requestVersion.current += 1 }
  }, [activeCompanyId])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredSales = sales.filter((sale) =>
    `${sale.invoice_number} ${sale.customer_name} ${sale.customer_phone}`.toLocaleLowerCase().includes(normalizedQuery),
  )

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Cloud sales and invoices</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Immutable invoices and payment history for the active company.</p></div>
        <Link to="/workspace/pos" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">New sale</Link>
      </header>
      {(error || !activeCompanyId || !supabase) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || "Sales are unavailable until an active company is verified."}</p>}
      <label className="block text-sm font-medium">Search invoices<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice number, customer, phone" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800"><tr><th className="p-3">Invoice</th><th>Date</th><th>Customer</th><th>Subtotal</th><th>Discount</th><th>VAT</th><th>Total</th><th>Payment</th></tr></thead>
          <tbody>
            {filteredSales.map((sale) => <tr key={sale.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="p-3 font-semibold"><Link to={`/workspace/invoices/${sale.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">{sale.invoice_number}</Link></td>
              <td>{new Date(sale.created_at).toLocaleString()}</td>
              <td>{sale.customer_name || "Walk-in"}{sale.customer_phone && <span className="block text-xs text-slate-500">{sale.customer_phone}</span>}</td>
              <td>{sale.currency} {Number(sale.subtotal).toFixed(2)}</td>
              <td>{sale.currency} {Number(sale.discount_total).toFixed(2)}</td>
              <td>{sale.currency} {Number(sale.vat_total).toFixed(2)}</td>
              <td className="font-semibold">{sale.currency} {Number(sale.total).toFixed(2)}</td>
              <td><span className={`rounded-full px-2 py-1 text-xs font-medium ${sale.payment_status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{sale.payment_status} · {Number(sale.amount_paid).toFixed(2)}</span></td>
            </tr>)}
            {!loading && filteredSales.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">{sales.length ? "No invoices match this search." : "No cloud sales for this company yet."}</td></tr>}
            {loading && <tr><td colSpan={8} className="p-8 text-center text-slate-500">Loading invoices…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
