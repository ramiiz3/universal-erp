import { Fragment, useMemo, useState } from "react"
import { CheckCircle2, Plus, ReceiptText, Wallet } from "lucide-react"
import { useERP } from "../context/ERPContext"
import type { SupplierInvoicePaymentMethod } from "../lib/supplierInvoices"

const today = () => new Date().toISOString().slice(0, 10)
const money = (value: number) => `AED ${value.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateLabel = (value: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB") : "—"

export default function SupplierInvoices() {
  const {
    suppliers,
    purchases,
    supplierInvoices,
    createSupplierInvoice,
    recordSupplierInvoicePayment,
  } = useERP()

  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [dueDate, setDueDate] = useState("")
  const [purchaseIds, setPurchaseIds] = useState<string[]>([])
  const [invoiceAmount, setInvoiceAmount] = useState("")
  const [invoiceNotes, setInvoiceNotes] = useState("")
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("")
  const [paymentDate, setPaymentDate] = useState(today())
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<SupplierInvoicePaymentMethod>("Bank Transfer")
  const [paymentReference, setPaymentReference] = useState("")
  const [paymentNotes, setPaymentNotes] = useState("")
  const [error, setError] = useState("")
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)

  const eligiblePurchases = useMemo(() => purchases.filter((purchase) => {
    const alreadyLinked = supplierInvoices.some((invoice) => invoice.purchaseIds.includes(purchase.id))
    if (alreadyLinked) return false
    if (!supplierId) return false
    const supplier = suppliers.find((item) => item.id === supplierId)
    if (!supplier) return false
    return purchase.supplierId
      ? purchase.supplierId === supplierId
      : purchase.supplierName.trim().toLowerCase() === supplier.name.trim().toLowerCase()
  }), [purchases, supplierInvoices, supplierId, suppliers])

  const selectedPurchases = eligiblePurchases.filter((purchase) => purchaseIds.includes(purchase.id))
  const selectedInvoice = supplierInvoices.find((invoice) => invoice.id === selectedInvoiceId)
  const outstandingTotal = supplierInvoices.reduce((sum, invoice) => sum + invoice.balance, 0)
  const overdueInvoices = supplierInvoices.filter((invoice) => invoice.balance > 0 && invoice.dueDate < today())
  const unpaidInvoices = supplierInvoices.filter((invoice) => invoice.status === "UNPAID").length
  const paidTotal = supplierInvoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0)

  function resetInvoiceForm() {
    setSupplierId("")
    setInvoiceNumber("")
    setInvoiceDate(today())
    setDueDate("")
    setPurchaseIds([])
    setInvoiceAmount("")
    setInvoiceNotes("")
    setError("")
  }

  function togglePurchase(purchaseId: string) {
    const nextIds = purchaseIds.includes(purchaseId)
      ? purchaseIds.filter((id) => id !== purchaseId)
      : [...purchaseIds, purchaseId]
    setPurchaseIds(nextIds)
    const nextSelected = eligiblePurchases.filter((item) => nextIds.includes(item.id))
    setInvoiceAmount(nextSelected.reduce((sum, item) => sum + item.total, 0).toFixed(2))
    if (nextIds.length === 1 && !invoiceNumber.trim()) {
      const source = eligiblePurchases.find((item) => item.id === nextIds[0])
      if (source?.supplierInvoice) setInvoiceNumber(source.supplierInvoice)
    }
  }

  function saveInvoice() {
    setError("")
    try {
      createSupplierInvoice({
        supplierId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        amount: Number(invoiceAmount),
        purchaseIds,
        notes: invoiceNotes,
      })
      resetInvoiceForm()
      setShowInvoiceForm(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not register supplier invoice.")
    }
  }

  function openPayment(invoiceId: string) {
    const invoice = supplierInvoices.find((item) => item.id === invoiceId)
    if (!invoice) return
    setSelectedInvoiceId(invoiceId)
    setPaymentDate(today())
    setPaymentAmount(invoice.balance.toFixed(2))
    setPaymentMethod("Bank Transfer")
    setPaymentReference("")
    setPaymentNotes("")
    setError("")
    setShowPaymentForm(true)
  }

  function savePayment() {
    if (!selectedInvoiceId) return
    setError("")
    try {
      recordSupplierInvoicePayment(selectedInvoiceId, {
        paymentDate,
        amount: Number(paymentAmount),
        method: paymentMethod,
        reference: paymentReference,
        notes: paymentNotes,
      })
      setShowPaymentForm(false)
      setSelectedInvoiceId("")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not record payment.")
    }
  }

  function statusLabel(status: string) {
    if (status === "PAID") return "Paid"
    if (status === "PARTIALLY_PAID") return "Partially paid"
    return "Unpaid"
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ReceiptText className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Supplier Invoices & Payables</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">Register supplier bills, track due dates and record full or partial payments.</p>
          </div>
          <button type="button" onClick={() => { resetInvoiceForm(); setShowInvoiceForm(true) }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Register supplier invoice
          </button>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Outstanding payables</p><p className="mt-2 text-2xl font-semibold text-slate-900">{money(outstandingTotal)}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Overdue invoices</p><p className="mt-2 text-2xl font-semibold text-rose-700">{overdueInvoices.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Unpaid invoices</p><p className="mt-2 text-2xl font-semibold text-slate-900">{unpaidInvoices}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Payments recorded</p><p className="mt-2 text-2xl font-semibold text-slate-900">{money(paidTotal)}</p></div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-5 py-4">AP reference / Supplier invoice</th><th className="px-5 py-4">Supplier</th><th className="px-5 py-4">Source receipts</th><th className="px-5 py-4">Invoice / Due date</th><th className="px-5 py-4">Invoice amount</th><th className="px-5 py-4">Outstanding</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {supplierInvoices.map((invoice) => {
                  const overdue = invoice.balance > 0 && invoice.dueDate < today()
                  return <Fragment key={invoice.id}>
                    <tr>
                      <td className="px-5 py-4"><p className="font-semibold text-slate-900">{invoice.billNumber}</p><p className="mt-1 text-xs text-slate-500">{invoice.invoiceNumber}</p></td>
                      <td className="px-5 py-4 text-sm">{invoice.supplierName}</td>
                      <td className="px-5 py-4 text-sm"><p>{invoice.purchaseNumbers.join(", ")}</p>{invoice.purchaseOrderNumbers.length > 0 && <p className="mt-1 text-xs text-slate-500">PO: {invoice.purchaseOrderNumbers.join(", ")}</p>}</td>
                      <td className="px-5 py-4 text-sm"><p>{dateLabel(invoice.invoiceDate)}</p><p className={`mt-1 text-xs ${overdue ? "font-semibold text-rose-700" : "text-slate-500"}`}>Due {dateLabel(invoice.dueDate)}{overdue ? " · Overdue" : ""}</p></td>
                      <td className="px-5 py-4 text-sm font-medium">{money(invoice.amount)}</td>
                      <td className="px-5 py-4 text-sm font-semibold">{money(invoice.balance)}</td>
                      <td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${invoice.status === "PAID" ? "bg-emerald-50 text-emerald-700" : overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{statusLabel(invoice.status)}</span></td>
                      <td className="px-5 py-4"><div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setExpandedInvoiceId(expandedInvoiceId === invoice.id ? null : invoice.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Payments ({invoice.payments.length})</button>
                        {invoice.balance > 0 && <button type="button" onClick={() => openPayment(invoice.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Record payment</button>}
                      </div></td>
                    </tr>
                    {expandedInvoiceId === invoice.id && <tr key={`${invoice.id}-payments`}><td colSpan={8} className="bg-slate-50 px-6 py-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Wallet className="h-4 w-4" /> Payment history</div>
                      {invoice.payments.length === 0 ? <p className="text-sm text-slate-500">No payments recorded.</p> : <div className="space-y-2">{invoice.payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"><div><span className="font-medium">{dateLabel(payment.paymentDate)}</span><span className="ml-3 text-slate-500">{payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span>{payment.notes && <p className="mt-1 text-xs text-slate-500">{payment.notes}</p>}</div><span className="font-semibold">{money(payment.amount)}</span></div>)}</div>}
                    </td></tr>}
                  </Fragment>
                })}
                {supplierInvoices.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-sm text-slate-500">No supplier invoices registered yet. Register a bill against one or more existing purchase receipts.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          Supplier invoice registration and payment tracking do not change inventory. This register is an Accounts Payable subledger; general-ledger and cash/bank account posting will be integrated in the Accounting phase.
        </div>
      </div>

      {showInvoiceForm && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
        <div className="my-6 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold text-slate-900">Register supplier invoice</h2><p className="mt-1 text-xs text-slate-500">Link one invoice to one or more receipts from the same supplier.</p></div><button type="button" onClick={() => setShowInvoiceForm(false)} className="rounded-lg border px-3 py-2 text-sm">Close</button></div>
          <div className="space-y-4 p-5">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">Supplier<select value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPurchaseIds([]); setInvoiceNumber(""); setInvoiceAmount("") }} className="h-11 w-full rounded-xl border px-3 font-normal"><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className="space-y-1 text-sm font-medium text-slate-700">Supplier invoice number<input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal" placeholder="e.g. INV-2026-001" /></label>
              <label className="space-y-1 text-sm font-medium text-slate-700">Invoice date<input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal" /></label>
              <label className="space-y-1 text-sm font-medium text-slate-700">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal" /></label>
            </div>
            <div className="rounded-xl border border-slate-200">
              <div className="border-b bg-slate-50 px-4 py-3"><p className="text-sm font-semibold text-slate-800">Link purchase receipts</p><p className="mt-1 text-xs text-slate-500">Only receipts for the selected supplier that are not already invoiced are listed.</p></div>
              <div className="max-h-52 space-y-2 overflow-y-auto p-4">
                {!supplierId ? <p className="text-sm text-slate-500">Select a supplier to view available receipts.</p> : eligiblePurchases.length === 0 ? <p className="text-sm text-slate-500">No uninvoiced purchase receipts are available for this supplier.</p> : eligiblePurchases.map((purchase) => <label key={purchase.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"><span className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={purchaseIds.includes(purchase.id)} onChange={() => togglePurchase(purchase.id)} /><span className="min-w-0"><span className="block font-medium text-slate-800">{purchase.purchaseNumber}{purchase.purchaseOrderNumber ? ` · ${purchase.purchaseOrderNumber}` : ""}</span><span className="block text-xs text-slate-500">{dateLabel(purchase.createdAt.slice(0, 10))} · Receipt invoice ref: {purchase.supplierInvoice || "Not supplied"}</span></span></span><span className="shrink-0 font-semibold">{money(purchase.total)}</span></label>)}
              </div>
              <div className="border-t bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">Selected receipts: {purchaseIds.length}</span><span className="float-right font-semibold text-slate-900">{money(selectedPurchases.reduce((sum, item) => sum + item.total, 0))}</span></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">Invoice amount (AED)<input type="number" min="0.01" step="0.01" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal" /></label>
              <label className="space-y-1 text-sm font-medium text-slate-700">Notes<textarea value={invoiceNotes} onChange={(event) => setInvoiceNotes(event.target.value)} rows={2} className="w-full rounded-xl border px-3 py-2 font-normal" placeholder="Optional notes" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setShowInvoiceForm(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={saveInvoice} disabled={!supplierId || !invoiceNumber.trim() || !dueDate || !purchaseIds.length || !(Number(invoiceAmount) > 0)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save supplier invoice</button></div>
          </div>
        </div>
      </div>}

      {showPaymentForm && selectedInvoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold text-slate-900">Record supplier payment</h2><p className="mt-1 text-xs text-slate-500">{selectedInvoice.billNumber} · {selectedInvoice.supplierName}</p></div><button type="button" onClick={() => setShowPaymentForm(false)} className="rounded-lg border px-3 py-2 text-sm">Close</button></div>
          <div className="space-y-4 p-5">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Outstanding balance</p><p className="mt-1 text-xl font-semibold text-slate-900">{money(selectedInvoice.balance)}</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">Payment date<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal" /></label>
              <label className="space-y-1 text-sm font-medium text-slate-700">Payment amount (AED)<input type="number" min="0.01" step="0.01" max={selectedInvoice.balance} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal" /></label>
              <label className="space-y-1 text-sm font-medium text-slate-700">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as SupplierInvoicePaymentMethod)} className="h-11 w-full rounded-xl border px-3 font-normal"><option>Bank Transfer</option><option>Cash</option><option>Card</option></select></label>
              <label className="space-y-1 text-sm font-medium text-slate-700">Transaction reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal" placeholder="Optional transaction ID" /></label>
            </div>
            <label className="block space-y-1 text-sm font-medium text-slate-700">Notes<textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} rows={2} className="w-full rounded-xl border px-3 py-2 font-normal" /></label>
            <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setShowPaymentForm(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={savePayment} disabled={!(Number(paymentAmount) > 0) || Number(paymentAmount) > selectedInvoice.balance} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save payment</button></div>
          </div>
        </div>
      </div>}
    </section>
  )
}
