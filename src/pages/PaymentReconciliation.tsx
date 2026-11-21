import { useMemo, useState } from "react"
import { ClipboardCheck, LockKeyhole } from "lucide-react"
import { useERP } from "../context/ERPContext"
import {
  calculateExpectedPaymentTotals,
  type ReconciliationAmounts,
  type ReconciliationMethod,
} from "../lib/paymentReconciliation"

const METHODS: ReconciliationMethod[] = ["Cash", "Card", "Bank Transfer"]

type AmountDraft = Record<ReconciliationMethod, string>

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function money(value: number): string {
  return `AED ${value.toFixed(2)}`
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function emptyDraft(): AmountDraft {
  return { Cash: "", Card: "", "Bank Transfer": "" }
}

function varianceClass(value: number): string {
  if (value < 0) return "text-red-700"
  if (value > 0) return "text-amber-700"
  return "text-emerald-700"
}

export default function PaymentReconciliation() {
  const { sales, customerPayments, salesReturns, paymentReconciliations, createPaymentReconciliation } = useERP()
  const [businessDate, setBusinessDate] = useState(localToday)
  const [counted, setCounted] = useState<AmountDraft>(emptyDraft)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const expected = useMemo(
    () => calculateExpectedPaymentTotals(businessDate, sales, customerPayments, salesReturns),
    [businessDate, sales, customerPayments, salesReturns],
  )
  const closedRecord = paymentReconciliations.find((item) => item.businessDate === businessDate)
  const expectedTotal = METHODS.reduce((sum, method) => sum + expected[method], 0)
  const draftCountedTotal = METHODS.reduce((sum, method) => sum + (Number(counted[method]) || 0), 0)
  const allCountsEntered = METHODS.every((method) => counted[method].trim() !== "")
  const draftVariance = allCountsEntered ? draftCountedTotal - expectedTotal : null
  const history = [...paymentReconciliations].sort((a, b) => b.businessDate.localeCompare(a.businessDate))

  function changeCount(method: ReconciliationMethod, value: string) {
    setCounted((current) => ({ ...current, [method]: value }))
  }

  function closeDay() {
    setError("")
    setSuccess("")
    try {
      const amounts = {} as ReconciliationAmounts
      for (const method of METHODS) {
        if (counted[method].trim() === "") throw new Error(`Enter the counted amount for ${method}.`)
        amounts[method] = Number(counted[method])
      }
      const record = createPaymentReconciliation({ businessDate, countedAmounts: amounts, notes })
      setSuccess(`Reconciliation ${record.reference} was closed successfully.`)
      setCounted(emptyDraft())
      setNotes("")
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Could not close the reconciliation.")
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-white p-3 shadow-sm"><ClipboardCheck className="h-6 w-6 text-slate-700" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Daily Payment Reconciliation</h1>
            <p className="mt-1 text-sm text-slate-500">Compare recorded POS and customer collections with counted cash and settled card/bank totals.</p>
          </div>
        </div>

        {success && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}
        {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Expected collections · {formatDate(businessDate)}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{money(closedRecord?.expectedTotal ?? expectedTotal)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Counted / settled</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{money(closedRecord?.countedTotal ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Over / short variance</p>
            <p className={`mt-2 text-2xl font-semibold ${closedRecord ? varianceClass(closedRecord.varianceTotal) : draftVariance === null ? "text-slate-500" : varianceClass(draftVariance)}`}>{closedRecord ? money(closedRecord.varianceTotal) : draftVariance === null ? "Pending counts" : money(draftVariance)}</p>
          </div>
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Close a business day</h2>
            <p className="mt-1 text-xs text-slate-500">Expected totals include Paid POS sales and customer credit receipts recorded on the selected date. Credit invoices themselves are not counted as collections.</p>
          </div>
          <div className="space-y-5 p-5">
            <label className="block max-w-xs text-sm font-medium text-slate-700">Business date
              <input type="date" value={businessDate} onChange={(event) => { setBusinessDate(event.target.value); setCounted(emptyDraft()); setNotes(""); setError(""); setSuccess("") }} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" />
            </label>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                  <th className="px-4 py-3">Payment method</th><th className="px-4 py-3 text-right">Expected</th><th className="px-4 py-3">Actual counted / settled</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {METHODS.map((method) => (
                    <tr key={method}>
                      <td className="px-4 py-3 font-medium text-slate-800">{method}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(closedRecord?.expectedAmounts[method] ?? expected[method])}</td>
                      <td className="px-4 py-3">
                        {closedRecord ? <span className="font-semibold tabular-nums">{money(closedRecord.countedAmounts[method])}</span> : (
                          <input type="number" min="0" step="0.01" value={counted[method]} onChange={(event) => changeCount(method, event.target.value)} className="h-10 w-full max-w-xs rounded-lg border border-slate-200 px-3 text-right" placeholder="0.00" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-slate-50 font-semibold"><tr>
                  <td className="px-4 py-3">Total</td><td className="px-4 py-3 text-right">{money(closedRecord?.expectedTotal ?? expectedTotal)}</td><td className="px-4 py-3">{closedRecord ? money(closedRecord.countedTotal) : money(METHODS.reduce((sum, method) => sum + (Number(counted[method]) || 0), 0))}</td>
                </tr></tfoot>
              </table>
            </div>

            {closedRecord ? (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">This date is already reconciled.</p><p className="mt-1">Reference: {closedRecord.reference} · Closed {new Date(closedRecord.closedAt).toLocaleString("en-GB")}</p>{closedRecord.notes && <p className="mt-1">Notes: {closedRecord.notes}</p>}</div></div>
            ) : (
              <>
                <label className="block text-sm font-medium text-slate-700">Closeout notes (optional)
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Explain any overage, shortage or settlement difference" />
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">Closing is final for this date. It records a reconciliation snapshot only; it does not alter sales, customer payments, cash balances or inventory.</p>
                  <button type="button" onClick={closeDay} className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">Close day</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Reconciliation history</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Reference</th><th className="px-5 py-4">Business date</th><th className="px-5 py-4 text-right">Expected</th><th className="px-5 py-4 text-right">Counted / settled</th><th className="px-5 py-4 text-right">Variance</th><th className="px-5 py-4">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((record) => <tr key={record.id}>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">{record.reference}</td><td className="px-5 py-4 text-sm">{formatDate(record.businessDate)}</td><td className="px-5 py-4 text-right text-sm">{money(record.expectedTotal)}</td><td className="px-5 py-4 text-right text-sm">{money(record.countedTotal)}</td><td className={`px-5 py-4 text-right text-sm font-semibold ${varianceClass(record.varianceTotal)}`}>{money(record.varianceTotal)}</td><td className="px-5 py-4"><span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Closed</span></td>
                </tr>)}
                {history.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">No payment reconciliations closed yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
