import { useMemo, useState } from "react"
import { CreditCard, Wallet, X } from "lucide-react"
import { useERP } from "../context/ERPContext"
import { getSalePaymentSummary, type CustomerPaymentMethod } from "../lib/customerPayments"

const METHODS: CustomerPaymentMethod[] = ["Cash", "Card", "Bank Transfer"]

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

export default function CustomerPayments() {
  const { sales, customerPayments, recordCustomerPayment } = useERP()
  const [selectedSaleId, setSelectedSaleId] = useState("")
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<CustomerPaymentMethod>("Bank Transfer")
  const [reference, setReference] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const creditInvoices = useMemo(() => sales
    .filter((sale) => sale.paymentMethod === "Credit" && sale.status !== "Refunded" && Boolean(sale.customerId))
    .map((sale) => ({ sale, settlement: getSalePaymentSummary(sale, customerPayments) }))
    .filter((entry) => entry.settlement.outstandingAmount > 0)
    .sort((a, b) => new Date(b.sale.createdAt).getTime() - new Date(a.sale.createdAt).getTime()),
  [sales, customerPayments])

  const outstandingTotal = creditInvoices.reduce((sum, entry) => sum + entry.settlement.outstandingAmount, 0)
  const paidTotal = customerPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const selectedEntry = creditInvoices.find((entry) => entry.sale.id === selectedSaleId)

  function openPayment(saleId: string) {
    const entry = creditInvoices.find((item) => item.sale.id === saleId)
    if (!entry) return
    setSelectedSaleId(saleId)
    setAmount(entry.settlement.outstandingAmount.toFixed(2))
    setMethod("Bank Transfer")
    setReference("")
    setError("")
    setSuccess("")
  }

  function closePayment() {
    setSelectedSaleId("")
    setError("")
  }

  function savePayment() {
    setError("")
    if (!selectedEntry) return
    try {
      const payment = recordCustomerPayment({
        customerId: selectedEntry.sale.customerId ?? "",
        method,
        reference,
        allocations: [{ saleId: selectedEntry.sale.id, amount: Number(amount) }],
      })
      setSuccess(`Payment ${payment.receiptNumber} recorded successfully.`)
      setSelectedSaleId("")
      setAmount("")
      setReference("")
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Could not record customer payment.")
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-white p-3 shadow-sm"><Wallet className="h-6 w-6 text-slate-700" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customer Payments & Receivables</h1>
            <p className="mt-1 text-sm text-slate-500">Record full or partial receipts against customer credit invoices.</p>
          </div>
        </div>

        {success && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Outstanding customer credit</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{money(outstandingTotal)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Invoices with balance</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{creditInvoices.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Customer payments recorded</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{money(paidTotal)}</p>
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Outstanding credit invoices</h2>
            <p className="mt-1 text-xs text-slate-500">Only credit sales with an identified customer and a remaining balance are listed.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="px-5 py-4">Invoice</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Date</th><th className="px-5 py-4 text-right">Invoice total</th><th className="px-5 py-4 text-right">Received</th><th className="px-5 py-4 text-right">Outstanding</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {creditInvoices.map(({ sale, settlement }) => <tr key={sale.id}>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">{sale.invoiceNumber}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{sale.customerName}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{new Date(sale.createdAt).toLocaleDateString("en-GB")}</td>
                  <td className="px-5 py-4 text-right text-sm">{money(sale.total)}</td>
                  <td className="px-5 py-4 text-right text-sm">{money(settlement.paidAmount)}</td>
                  <td className="px-5 py-4 text-right text-sm font-semibold">{money(settlement.outstandingAmount)}</td>
                  <td className="px-5 py-4"><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${settlement.status === "Partially Paid" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{settlement.status}</span></td>
                  <td className="px-5 py-4 text-right"><button type="button" onClick={() => openPayment(sale.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Receive payment</button></td>
                </tr>)}
                {creditInvoices.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-sm text-slate-500">No outstanding customer credit invoices.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Payment receipt history</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Receipt</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Invoice allocation</th><th className="px-5 py-4">Method</th><th className="px-5 py-4">Reference</th><th className="px-5 py-4 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {customerPayments.map((payment) => <tr key={payment.id}>
                  <td className="px-5 py-4 text-sm font-semibold">{payment.receiptNumber}</td>
                  <td className="px-5 py-4 text-sm">{new Date(payment.createdAt).toLocaleString("en-GB")}</td>
                  <td className="px-5 py-4 text-sm">{payment.customerName}</td>
                  <td className="px-5 py-4 text-sm">{payment.allocations.map((item) => item.invoiceNumber).join(", ")}</td>
                  <td className="px-5 py-4 text-sm">{payment.method}</td>
                  <td className="px-5 py-4 text-sm">{payment.reference || "—"}</td>
                  <td className="px-5 py-4 text-right text-sm font-semibold">{money(payment.amount)}</td>
                </tr>)}
                {customerPayments.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No customer payments recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedEntry && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Receive customer payment</h2><p className="mt-1 text-xs text-slate-500">{selectedEntry.sale.invoiceNumber} · {selectedEntry.sale.customerName}</p></div><button type="button" onClick={closePayment} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          <div className="space-y-4 p-5">
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Invoice total</p><p className="mt-1 font-semibold">{money(selectedEntry.sale.total)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 font-semibold text-emerald-700">{money(selectedEntry.settlement.outstandingAmount)}</p></div></div>
            <label className="block text-sm font-medium text-slate-700">Payment amount<input type="number" min="0.01" max={selectedEntry.settlement.outstandingAmount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
            <label className="block text-sm font-medium text-slate-700">Payment method<select value={method} onChange={(event) => setMethod(event.target.value as CustomerPaymentMethod)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3">{METHODS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="block text-sm font-medium text-slate-700">Transaction reference (optional)<input value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" placeholder="Bank / card / receipt reference" /></label>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Recording a payment updates the customer’s outstanding balance. It does not change inventory or the original sale lines.</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4"><button type="button" onClick={closePayment} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium">Cancel</button><button type="button" onClick={savePayment} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><CreditCard className="h-4 w-4" /> Record payment</button></div>
        </div>
      </div>}
    </section>
  )
}
