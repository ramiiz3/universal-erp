import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, useParams } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"

type CloudSale = {
  id: string
  branch_id: string
  warehouse_id: string
  invoice_number: string
  customer_name: string
  customer_phone: string
  customer_email: string
  subtotal: number
  discount_total: number
  vat_total: number
  total: number
  amount_paid: number
  payment_status: string
  currency: string
  created_at: string
}

type CloudSaleLine = {
  id: string
  product_name: string
  sku: string
  unit: string
  batch: string
  expiry: string | null
  quantity: number
  unit_price: number
  unit_cost: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  line_total: number
}

type CloudPayment = {
  id: string
  method: string
  amount: number
  reference: string
  created_at: string
}

const PAYMENT_ROLES = new Set(["owner", "admin", "manager", "cashier", "accountant"])

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character)
}

export default function CloudInvoicePage() {
  const { saleId = "" } = useParams()
  const { activeCompany } = useAuth()
  const activeCompanyId = activeCompany?.companyId ?? ""
  const requestScope = `${activeCompanyId}:${saleId}`
  const requestVersion = useRef(0)
  const paymentRequestId = useRef(crypto.randomUUID())
  const paymentPending = useRef(false)
  const [sale, setSale] = useState<CloudSale | null>(null)
  const [lines, setLines] = useState<CloudSaleLine[]>([])
  const [payments, setPayments] = useState<CloudPayment[]>([])
  const [loadedScope, setLoadedScope] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [printError, setPrintError] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "other">("cash")
  const [paymentAmountOverride, setPaymentAmountOverride] = useState<string | null>(null)
  const [paymentReference, setPaymentReference] = useState("")
  const [paymentError, setPaymentError] = useState("")
  const [paymentMessage, setPaymentMessage] = useState("")
  const [savingPayment, setSavingPayment] = useState(false)
  const canRecordPayment = (activeCompany?.memberships ?? []).some((membership) =>
    PAYMENT_ROLES.has(membership.roleKey),
  )
  const paymentAmount = paymentAmountOverride
    ?? (sale ? Math.max(0, Number(sale.total) - Number(sale.amount_paid)).toFixed(2) : "0")

  const loadInvoice = useCallback(async () => {
    const requestId = ++requestVersion.current
    if (!supabase || !activeCompanyId || !saleId) return
    const [saleResult, lineResult, paymentResult] = await Promise.all([
      supabase.from("cloud_sales").select("*").eq("company_id", activeCompanyId).eq("id", saleId).maybeSingle(),
      supabase.from("cloud_sale_lines").select("*").eq("company_id", activeCompanyId).eq("sale_id", saleId).order("created_at"),
      supabase.from("cloud_sale_payments").select("*").eq("company_id", activeCompanyId).eq("sale_id", saleId).order("created_at"),
    ])
    if (requestId !== requestVersion.current) return
    const errors = [saleResult.error, lineResult.error, paymentResult.error].filter(Boolean)
    setError(errors.length ? errors.map((item) => item?.message).join("; ") : "")
    setSale((saleResult.data ?? null) as CloudSale | null)
    setLines((lineResult.data ?? []) as CloudSaleLine[])
    setPayments((paymentResult.data ?? []) as CloudPayment[])
    setLoadedScope(requestScope)
    setLoading(false)
  }, [activeCompanyId, requestScope, saleId])

  useEffect(() => {
    void loadInvoice()
    return () => { requestVersion.current += 1 }
  }, [loadInvoice])

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (paymentPending.current || !sale || !supabase) return
    paymentPending.current = true
    setSavingPayment(true)
    setPaymentError("")
    setPaymentMessage("")
    try {
      const amount = Number(paymentAmount)
      const outstanding = Number(sale.total) - Number(sale.amount_paid)
      if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
        throw new Error("Payment must be greater than zero and cannot exceed the remaining invoice balance.")
      }
      const { data, error: rpcError } = await supabase.rpc("record_cloud_sale_payment_once", {
        p_company_id: activeCompany?.companyId,
        p_sale_id: sale.id,
        p_method: paymentMethod,
        p_amount: Math.round(amount * 100) / 100,
        p_reference: paymentReference.trim(),
        p_request_id: paymentRequestId.current,
      })
      if (rpcError) throw rpcError
      if (!data || typeof data !== "object" || !("payment_id" in data)) {
        throw new Error("The payment was saved without returning its identifier.")
      }
      paymentRequestId.current = crypto.randomUUID()
      setPaymentMessage("Payment recorded and invoice balance updated.")
      setPaymentReference("")
      setPaymentAmountOverride(null)
      await loadInvoice()
    } catch (caught) {
      setPaymentError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      paymentPending.current = false
      setSavingPayment(false)
    }
  }

  function printInvoice() {
    if (!sale || !activeCompany) return
    setPrintError("")
    const popup = window.open("", "_blank")
    if (!popup) {
      setPrintError("The invoice print window was blocked. Allow pop-ups for this local ERP site and try again.")
      return
    }
    const rows = lines.map((line) => `<tr>
      <td>${escapeHtml(line.product_name)}${line.sku ? `<small>${escapeHtml(line.sku)}</small>` : ""}${line.batch ? `<small>Batch: ${escapeHtml(line.batch)}</small>` : ""}</td>
      <td>${Number(line.quantity)} ${escapeHtml(line.unit)}</td>
      <td>${escapeHtml(sale.currency)} ${Number(line.unit_price).toFixed(2)}</td>
      <td>${escapeHtml(sale.currency)} ${Number(line.discount_amount).toFixed(2)}</td>
      <td>${Number(line.vat_rate).toFixed(2)}%</td>
      <td>${escapeHtml(sale.currency)} ${Number(line.vat_amount).toFixed(2)}</td>
      <td>${escapeHtml(sale.currency)} ${Number(line.line_total).toFixed(2)}</td>
    </tr>`).join("")
    const paymentRows = payments.map((payment) => `<p>${escapeHtml(payment.method.replace("_", " "))}: ${escapeHtml(sale.currency)} ${Number(payment.amount).toFixed(2)}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ""}</p>`).join("")
    const address = [activeCompany.address, activeCompany.phone, activeCompany.email].filter(Boolean).map(escapeHtml).join(" · ")
    const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sale.invoice_number)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font: 12px Arial, sans-serif; color: #17221d; margin: 0; }
        header { text-align: center; border-bottom: 2px solid #174b37; padding-bottom: 12px; }
        h1 { font-size: 22px; margin: 0 0 5px; }
        h2 { font-size: 17px; margin: 16px 0 2px; }
        p { margin: 4px 0; }
        .meta { display: flex; justify-content: space-between; gap: 20px; margin: 14px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #cbd5d0; padding: 7px 5px; text-align: right; vertical-align: top; }
        th:first-child, td:first-child { text-align: left; }
        small { display: block; color: #59665f; margin-top: 2px; }
        .totals { margin: 14px 0 0 auto; width: min(320px, 100%); }
        .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
        .grand { border-top: 2px solid #174b37; font-weight: bold; font-size: 15px; }
        .payments { margin-top: 16px; }
        footer { margin-top: 32px; border-top: 1px solid #cbd5d0; padding-top: 10px; text-align: center; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
        <header><h1>${escapeHtml(activeCompany.legalName || activeCompany.companyName)}</h1><p>${escapeHtml(activeCompany.companyName)}</p>
        <p>${address}</p><p>TRN: ${escapeHtml(activeCompany.taxRegistrationNumber || "—")}</p></header>
        <h2>Tax Invoice</h2><p>فاتورة ضريبية</p>
        <section class="meta"><div><strong>Invoice:</strong> ${escapeHtml(sale.invoice_number)}<br><strong>Date:</strong> ${escapeHtml(new Date(sale.created_at).toLocaleString())}</div>
        <div><strong>Customer:</strong> ${escapeHtml(sale.customer_name || "Walk-in")}<br><strong>Phone:</strong> ${escapeHtml(sale.customer_phone || "—")}<br><strong>Email:</strong> ${escapeHtml(sale.customer_email || "—")}</div></section>
        <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>VAT</th><th>VAT amount</th><th>Line total</th></tr></thead><tbody>${rows}</tbody></table>
        <section class="totals"><div><span>Gross amount</span><strong>${escapeHtml(sale.currency)} ${Number(sale.subtotal).toFixed(2)}</strong></div>
        <div><span>Discount</span><strong>${escapeHtml(sale.currency)} ${Number(sale.discount_total).toFixed(2)}</strong></div>
        <div><span>VAT total</span><strong>${escapeHtml(sale.currency)} ${Number(sale.vat_total).toFixed(2)}</strong></div>
        <div class="grand"><span>Amount payable</span><strong>${escapeHtml(sale.currency)} ${Number(sale.total).toFixed(2)}</strong></div>
        <div><span>Paid (${escapeHtml(sale.payment_status)})</span><strong>${escapeHtml(sale.currency)} ${Number(sale.amount_paid).toFixed(2)}</strong></div></section>
        <section class="payments"><strong>Payment information</strong>${paymentRows || "<p>No payment recorded.</p>"}</section>
        <footer>${escapeHtml(activeCompany.invoiceFooter || "Thank you for your business.")}</footer>
        <script>window.addEventListener("load", () => { window.focus(); window.print(); });</script>
      </body></html>`
    popup.document.open()
    popup.document.write(documentHtml)
    popup.document.close()
  }

  if (!supabase || !activeCompanyId || !saleId) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Invoice is unavailable until an active company and invoice are selected.</p>
  if (loading || loadedScope !== requestScope) return <p className="text-sm text-slate-500">Loading invoice…</p>
  if (error || !sale) {
    return <section className="space-y-4"><p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error || "Invoice not found or not available to this company."}</p><Link to="/workspace/sales" className="text-sm font-medium text-emerald-700">Back to sales</Link></section>
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><Link to="/workspace/sales" className="text-sm text-emerald-700">← Sales and invoices</Link><h1 className="mt-2 text-2xl font-semibold">{sale.invoice_number}</h1><p className="text-sm text-slate-500">{new Date(sale.created_at).toLocaleString()} · {sale.payment_status}</p></div>
        <button type="button" onClick={printInvoice} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Print invoice</button>
      </header>
      {printError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{printError}</p>}
      {paymentError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{paymentError}</p>}
      {paymentMessage && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{paymentMessage}</p>}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><h2 className="font-semibold">Customer</h2><p className="mt-1 text-sm">{sale.customer_name || "Walk-in"}<br />{sale.customer_phone || "No phone"}<br />{sale.customer_email || "No email"}</p></div>
          <div><h2 className="font-semibold">Payment</h2><p className="mt-1 text-sm">{sale.payment_status} · {sale.currency} {Number(sale.amount_paid).toFixed(2)} paid</p></div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[750px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800"><tr><th className="py-2">Product / lot</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>VAT</th><th>VAT amount</th><th>Total</th></tr></thead>
            <tbody>{lines.map((line) => <tr key={line.id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-3 font-medium">{line.product_name}<span className="block text-xs text-slate-500">{line.sku}{line.batch ? ` · Batch ${line.batch}` : ""}{line.expiry ? ` · Exp ${line.expiry}` : ""}</span></td>
              <td>{line.quantity} {line.unit}</td><td>{sale.currency} {Number(line.unit_price).toFixed(2)}</td><td>{sale.currency} {Number(line.discount_amount).toFixed(2)}</td><td>{Number(line.vat_rate).toFixed(2)}%</td><td>{sale.currency} {Number(line.vat_amount).toFixed(2)}</td><td className="font-semibold">{sale.currency} {Number(line.line_total).toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <dl className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
          <div className="flex justify-between"><dt>Gross amount</dt><dd>{sale.currency} {Number(sale.subtotal).toFixed(2)}</dd></div>
          <div className="flex justify-between"><dt>Discount</dt><dd>{sale.currency} {Number(sale.discount_total).toFixed(2)}</dd></div>
          <div className="flex justify-between"><dt>VAT total</dt><dd>{sale.currency} {Number(sale.vat_total).toFixed(2)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold dark:border-slate-800"><dt>Amount payable</dt><dd>{sale.currency} {Number(sale.total).toFixed(2)}</dd></div>
        </dl>
        <section className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800"><h2 className="font-semibold">Payments</h2>
          {payments.map((payment) => <p key={payment.id} className="mt-2 text-sm">{payment.method.replace("_", " ")} · {sale.currency} {Number(payment.amount).toFixed(2)}{payment.reference ? ` · ${payment.reference}` : ""} · {new Date(payment.created_at).toLocaleString()}</p>)}
          {!payments.length && <p className="mt-2 text-sm text-slate-500">No payments recorded.</p>}
        </section>
        {canRecordPayment && Number(sale.amount_paid) < Number(sale.total) && <form onSubmit={(event) => void recordPayment(event)} className="mt-5 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_1fr_1fr_auto] dark:border-slate-800">
          <label className="text-sm">Additional payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
          <label className="text-sm">Amount received<input type="number" min="0.01" max={Number(sale.total) - Number(sale.amount_paid)} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmountOverride(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
          <label className="text-sm">Reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={200} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
          <button type="submit" disabled={savingPayment} className="self-end rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingPayment ? "Saving…" : "Record payment"}</button>
        </form>}
      </div>
    </section>
  )
}
