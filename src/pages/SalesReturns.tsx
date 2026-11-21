import { useMemo, useState } from "react"
import { RotateCcw, X } from "lucide-react"
import { useERP } from "../context/ERPContext"
import { getReturnedQuantity, type SalesRefundMethod } from "../lib/salesReturns"

const METHODS: SalesRefundMethod[] = ["Cash", "Card", "Bank Transfer"]
type QuantityDraft = Record<string, string>

function money(value: number) { return `AED ${value.toFixed(2)}` }

export default function SalesReturns() {
  const { sales, products, salesReturns, createSalesReturn } = useERP()
  const [selectedSaleId, setSelectedSaleId] = useState("")
  const [quantities, setQuantities] = useState<QuantityDraft>({})
  const [refundMethod, setRefundMethod] = useState<SalesRefundMethod>("Cash")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const productById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products])
  const eligibleSales = useMemo(() => sales.filter((sale) =>
    sale.status === "Paid" && sale.paymentMethod !== "Credit" && sale.items.some((line) => {
      const product = productById.get(line.productId)
      return product?.returnEligible === true && product.productType !== "SERVICE" &&
        getReturnedQuantity(sale.id, line.id, salesReturns) < line.quantity
    }),
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [sales, productById, salesReturns])

  const selectedSale = sales.find((item) => item.id === selectedSaleId)
  const returnableLines = (selectedSale?.items ?? []).filter((line) => {
    const product = productById.get(line.productId)
    return product?.returnEligible === true && product.productType !== "SERVICE" &&
      getReturnedQuantity(selectedSale!.id, line.id, salesReturns) < line.quantity
  })
  const totalRefunded = salesReturns.reduce((sum, item) => sum + item.refundTotal, 0)
  const totalUnitsReturned = salesReturns.reduce((sum, record) => sum + record.items.reduce((lineSum, item) => lineSum + item.quantity, 0), 0)

  function openReturn(saleId: string) {
    const sale = sales.find((item) => item.id === saleId)
    if (!sale) return
    setSelectedSaleId(saleId)
    setQuantities({})
    setRefundMethod(METHODS.includes(sale.paymentMethod as SalesRefundMethod) ? sale.paymentMethod as SalesRefundMethod : "Cash")
    setReason("")
    setError("")
    setSuccess("")
  }

  function closeReturn() {
    setSelectedSaleId("")
    setQuantities({})
    setError("")
  }

  function postReturn() {
    setError("")
    if (!selectedSale) return
    try {
      const items = Object.entries(quantities)
        .filter(([, value]) => value.trim() !== "" && Number(value) > 0)
        .map(([saleItemId, value]) => ({ saleItemId, quantity: Number(value) }))
      if (!items.length) throw new Error("Enter a return quantity for at least one item.")
      const record = createSalesReturn({ saleId: selectedSale.id, refundMethod, reason, items })
      setSuccess(`Return ${record.returnNumber} posted. Refund: ${money(record.refundTotal)}.`)
      closeReturn()
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : "Could not post sales return.")
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-white p-3 shadow-sm"><RotateCcw className="h-6 w-6 text-slate-700" /></div>
          <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sales Returns & Refunds</h1>
            <p className="mt-1 text-sm text-slate-500">Process eligible non-medicinal goods returns against the original paid invoice and batches.</p></div>
        </div>
        {success && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Invoices with returnable items</p><p className="mt-2 text-2xl font-semibold">{eligibleSales.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Returns posted</p><p className="mt-2 text-2xl font-semibold">{salesReturns.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Refunds issued</p><p className="mt-2 text-2xl font-semibold text-slate-900">{money(totalRefunded)}</p><p className="mt-1 text-xs text-slate-500">{totalUnitsReturned} selling units returned</p></div>
        </div>
        <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Eligible paid sales</h2><p className="mt-1 text-xs text-slate-500">Credit invoices are excluded. Only products explicitly marked eligible in Product Master are shown. Medicines must remain non-returnable.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
            <th className="px-5 py-4">Invoice</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Date</th><th className="px-5 py-4 text-right">Invoice total</th><th className="px-5 py-4">Eligible lines</th><th className="px-5 py-4 text-right">Action</th>
          </tr></thead><tbody className="divide-y divide-slate-100">
            {eligibleSales.map((sale) => <tr key={sale.id}><td className="px-5 py-4 text-sm font-semibold">{sale.invoiceNumber}</td><td className="px-5 py-4 text-sm">{sale.customerName}</td><td className="px-5 py-4 text-sm">{new Date(sale.createdAt).toLocaleDateString("en-GB")}</td><td className="px-5 py-4 text-right text-sm">{money(sale.total)}</td><td className="px-5 py-4 text-sm">{sale.items.filter((line) => productById.get(line.productId)?.returnEligible === true && getReturnedQuantity(sale.id, line.id, salesReturns) < line.quantity).length}</td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openReturn(sale.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Process return</button></td></tr>)}
            {eligibleSales.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">No paid invoices currently have eligible returnable items.</td></tr>}
          </tbody></table></div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Sales return history</h2></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Return</th><th className="px-5 py-4">Original invoice</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Date</th><th className="px-5 py-4">Items</th><th className="px-5 py-4">Refund method</th><th className="px-5 py-4 text-right">Refund</th></tr></thead><tbody className="divide-y divide-slate-100">
            {salesReturns.map((record) => <tr key={record.id}><td className="px-5 py-4 text-sm font-semibold">{record.returnNumber}</td><td className="px-5 py-4 text-sm">{record.invoiceNumber}</td><td className="px-5 py-4 text-sm">{record.customerName}</td><td className="px-5 py-4 text-sm">{new Date(record.createdAt).toLocaleString("en-GB")}</td><td className="px-5 py-4 text-sm">{record.items.map((item) => `${item.productName} × ${item.quantity}`).join(", ")}</td><td className="px-5 py-4 text-sm">{record.refundMethod}</td><td className="px-5 py-4 text-right text-sm font-semibold">{money(record.refundTotal)}</td></tr>)}
            {salesReturns.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">No sales returns recorded yet.</td></tr>}
          </tbody></table></div>
        </div>
      </div>
      {selectedSale && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-semibold">Process return · {selectedSale.invoiceNumber}</h2><p className="mt-1 text-xs text-slate-500">{selectedSale.customerName} · Original sale {new Date(selectedSale.createdAt).toLocaleDateString("en-GB")}</p></div><button type="button" onClick={closeReturn} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Only explicitly eligible non-medicinal goods may be returned. Original batch traceability is required. Credit sales are handled separately.</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-2">Item</th><th className="py-2">Sold</th><th className="py-2">Previously returned</th><th className="py-2">Remaining</th><th className="py-2">Return quantity</th></tr></thead><tbody>
            {returnableLines.map((line) => { const returned = getReturnedQuantity(selectedSale.id, line.id, salesReturns); const remaining = line.quantity - returned; return <tr key={line.id} className="border-b border-slate-100"><td className="py-3 pr-3"><p className="font-medium">{line.name}</p><p className="text-xs text-slate-500">{line.sellingUnit ?? "Unit"}</p></td><td className="py-3">{line.quantity}</td><td className="py-3">{returned}</td><td className="py-3">{remaining}</td><td className="py-3"><input type="number" min="0" max={remaining} step="1" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} className="h-10 w-28 rounded-lg border border-slate-200 px-2 text-right" placeholder="0" /></td></tr> })}
            {returnableLines.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No eligible quantities remain on this invoice.</td></tr>}
          </tbody></table></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-700">Refund method<select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as SalesRefundMethod)} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3">{METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><label className="block text-sm font-medium text-slate-700">Return reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3" placeholder="Reason for return" /></label></div>
          <p className="text-xs text-slate-500">The refund is calculated proportionally from the original invoice line, discount and VAT. Stock is restored to the original sale batches.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4"><button type="button" onClick={closeReturn} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">Cancel</button><button type="button" onClick={postReturn} disabled={returnableLines.length === 0} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Post return & refund</button></div>
      </div></div>}
    </section>
  )
}
