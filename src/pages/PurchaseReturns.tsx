import { useMemo, useState } from "react"
import { ClipboardList, RotateCcw, Search } from "lucide-react"
import { useERP } from "../context/ERPContext"
import { getERPSettings } from "../lib/erpSettings"
import { getPurchaseReturnedQuantity } from "../lib/purchaseReturns"

export default function PurchaseReturns() {
  const {
    purchases,
    purchaseReturns,
    createPurchaseReturn,
  } = useERP()
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("")
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [creditNoteReference, setCreditNoteReference] = useState("")
  const [reason, setReason] = useState("")
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const currency = getERPSettings().currency || "AED"
  const money = (value: number) => new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  const dateLabel = (value: string) => new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const sortedPurchases = useMemo(
    () => [...purchases].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [purchases],
  )
  const selectedPurchase = purchases.find((purchase) => purchase.id === selectedPurchaseId)
  const filteredReturns = purchaseReturns.filter((record) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return [
      record.returnNumber,
      record.purchaseNumber,
      record.supplierName,
      record.supplierInvoice,
      record.creditNoteReference,
      record.reason,
      ...record.items.map((item) => item.productName),
    ].join(" ").toLowerCase().includes(query)
  })
  const totalCredits = purchaseReturns.reduce((sum, record) => sum + record.totalCreditAmount, 0)
  const totalReturnedUnits = purchaseReturns.reduce((sum, record) => sum + record.totalBaseQuantity, 0)

  function clearForm() {
    setSelectedPurchaseId("")
    setQuantities({})
    setCreditNoteReference("")
    setReason("")
    setError("")
  }

  function choosePurchase(id: string) {
    setSelectedPurchaseId(id)
    setQuantities({})
    setCreditNoteReference("")
    setReason("")
    setError("")
    setMessage("")
  }

  function submitReturn() {
    if (submitting) return
    setError("")
    setMessage("")
    setSubmitting(true)
    try {
      const items = Object.entries(quantities)
        .filter(([, value]) => value.trim() !== "" && Number(value) > 0)
        .map(([purchaseItemId, value]) => ({
          purchaseItemId,
          quantity: Number(value),
        }))
      const record = createPurchaseReturn({
        purchaseId: selectedPurchaseId,
        creditNoteReference,
        reason,
        items,
      })
      setMessage(`Purchase return ${record.returnNumber} posted. Supplier credit recorded: ${money(record.totalCreditAmount)}.`)
      clearForm()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not post the purchase return.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900"><RotateCcw className="h-6 w-6 text-slate-700 dark:text-slate-200" /></div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Purchase Returns</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Return received goods to suppliers against the original purchase and batch.</p>
            </div>
          </div>
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">{currency} · Supplier credit register</span>
        </div>

        {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Summary title="Purchase returns posted" value={purchaseReturns.length.toLocaleString()} detail="Supplier returns recorded" />
          <Summary title="Supplier credit value" value={money(totalCredits)} detail="Recorded return credit value" />
          <Summary title="Base units returned" value={totalReturnedUnits.toLocaleString()} detail="Total stock sent back to suppliers" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white">Create supplier return</h2>
            <p className="mt-1 text-xs text-slate-500">Choose a completed purchase receipt. Returned quantities are limited by the original receipt and stock still available in its batch.</p>
          </div>
          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Original purchase
                <select value={selectedPurchaseId} onChange={(event) => choosePurchase(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Select purchase receipt</option>
                  {sortedPurchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.purchaseNumber} · {purchase.supplierName} · {dateLabel(purchase.createdAt)}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Supplier credit note reference
                <input value={creditNoteReference} onChange={(event) => setCreditNoteReference(event.target.value)} maxLength={100} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Enter supplier credit note number (optional)" />
              </label>
            </div>

            {selectedPurchase && <>
              <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-800/60">
                <Info label="Supplier" value={selectedPurchase.supplierName} />
                <Info label="Purchase number" value={selectedPurchase.purchaseNumber} />
                <Info label="Supplier invoice" value={selectedPurchase.supplierInvoice || "Not recorded"} />
                <Info label="Purchase date" value={dateLabel(selectedPurchase.createdAt)} />
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-4 py-3">Product / batch</th>
                      <th className="px-4 py-3 text-right">Received</th>
                      <th className="px-4 py-3 text-right">Previously returned</th>
                      <th className="px-4 py-3 text-right">Returnable now</th>
                      <th className="px-4 py-3 text-right">Purchase cost</th>
                      <th className="px-4 py-3 text-right">Return quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedPurchase.items.map((item) => {
                      const returned = getPurchaseReturnedQuantity(selectedPurchase.id, item.id, purchaseReturns)
                      const remaining = Math.max(0, item.quantity - returned)
                      const baseUnitCost = item.baseUnitPurchasePrice ?? item.purchasePrice / (item.conversionFactor ?? 1)
                      return <tr key={item.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">Batch {item.batch} · Exp {item.expiry || "Not recorded"}</p>
                        </td>
                        <td className="px-4 py-3 text-right">{item.quantity} {item.purchaseUnit || item.baseUnit}</td>
                        <td className="px-4 py-3 text-right">{returned}</td>
                        <td className="px-4 py-3 text-right font-semibold">{remaining.toLocaleString()} {item.purchaseUnit || item.baseUnit}</td>
                        <td className="px-4 py-3 text-right">{money(item.purchasePrice)} / {item.purchaseUnit || item.baseUnit} <span className="block text-xs text-slate-500">{money(baseUnitCost)} / {item.baseUnit || "unit"}</span></td>
                        <td className="px-4 py-3 text-right">
                          <input aria-label={`Return quantity for ${item.name}`} type="number" min="0" max={remaining} step="any" disabled={remaining <= 0} value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="0" className="h-10 w-28 rounded-lg border border-slate-300 px-2 text-right dark:border-slate-700 dark:bg-slate-950" />
                        </td>
                      </tr>
                    })}
                    {selectedPurchase.items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">This purchase has no item lines.</td></tr>}
                  </tbody>
                </table>
              </div>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Return reason
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Damaged goods, near expiry, incorrect delivery, supplier recall..." />
              </label>
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <p className="text-xs text-slate-500">Posting this return deducts the selected quantities from their original inventory batch and records the supplier credit value. It does not record a cash refund.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={clearForm} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Clear</button>
                  <button type="button" onClick={submitReturn} disabled={submitting || !selectedPurchase.items.length || !Object.values(quantities).some((value) => Number(value) > 0) || !reason.trim()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Posting…" : "Post purchase return"}</button>
                </div>
              </div>
            </>}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div><h2 className="font-semibold text-slate-900 dark:text-white">Purchase return history</h2><p className="mt-1 text-xs text-slate-500">Search supplier, original purchase, credit note or product.</p></div>
            <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search purchase returns..." className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
                <tr><th className="px-5 py-3">Return reference</th><th className="px-5 py-3">Original purchase</th><th className="px-5 py-3">Supplier / invoice</th><th className="px-5 py-3">Credit note</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Products returned</th><th className="px-5 py-3 text-right">Credit value</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReturns.map((record) => <tr key={record.id}>
                  <td className="px-5 py-4 font-semibold">{record.returnNumber}</td>
                  <td className="px-5 py-4">{record.purchaseNumber}</td>
                  <td className="px-5 py-4"><p>{record.supplierName}</p><p className="mt-1 text-xs text-slate-500">{record.supplierInvoice || "No invoice reference"}</p></td>
                  <td className="px-5 py-4">{record.creditNoteReference || "Pending"}</td>
                  <td className="px-5 py-4 whitespace-nowrap">{dateLabel(record.createdAt)}</td>
                  <td className="px-5 py-4">{record.items.map((item) => `${item.productName} × ${item.quantity} ${item.purchaseUnit}`).join(", ")}</td>
                  <td className="px-5 py-4 text-right font-semibold">{money(record.totalCreditAmount)}</td>
                </tr>)}
                {filteredReturns.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-500"><ClipboardList className="mx-auto mb-2 h-7 w-7 text-slate-300" />No purchase returns found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800">Supplier credit values are recorded here for reference. Apply the supplier's credit note to its payable separately in your accounting workflow.</div>
        </div>
      </div>
    </section>
  )
}

function Summary({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{value}</p></div>
}
