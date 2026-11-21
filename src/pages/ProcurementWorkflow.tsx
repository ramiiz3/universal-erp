import { useMemo, useState } from "react"
import {
  ClipboardList,
  FileCheck2,
  Plus,
  Send,
  CheckCircle2,
  XCircle,
  ShoppingCart,
} from "lucide-react"
import { useERP } from "../context/ERPContext"
import type { PurchaseOrder } from "../lib/procurementWorkflow"

type RequisitionLineDraft = {
  productId: string
  quantity: string
  estimatedUnitCost: string
}

type ReceiptLineDraft = {
  productId: string
  productName: string
  unit: string
  orderedQuantity: number
  alreadyReceived: number
  remainingQuantity: number
  quantity: string
  purchasePrice: string
  batch: string
  expiry: string
}

const emptyLine = (): RequisitionLineDraft => ({
  productId: "",
  quantity: "",
  estimatedUnitCost: "",
})

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

export default function ProcurementWorkflow() {
  const {
    suppliers,
    products,
    warehouses,
    purchaseRequisitions,
    purchaseOrders,
    createPurchaseRequisition,
    submitPurchaseRequisition,
    reviewPurchaseRequisition,
    createPurchaseOrderFromRequisition,
    submitPurchaseOrder,
    reviewPurchaseOrder,
    createPurchase,
  } = useERP()

  const [showForm, setShowForm] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  const [warehouseId, setWarehouseId] = useState(
    () => warehouses.find((item) => item.active && item.type === "MAIN")?.id ??
      warehouses.find((item) => item.active)?.id ?? "",
  )
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<RequisitionLineDraft[]>([emptyLine()])
  const [error, setError] = useState("")
  const [activeView, setActiveView] = useState<"REQUISITIONS" | "ORDERS">("REQUISITIONS")
  const [showReceiptForm, setShowReceiptForm] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [supplierInvoice, setSupplierInvoice] = useState("")
  const [receiptLines, setReceiptLines] = useState<ReceiptLineDraft[]>([])
  const [receiptError, setReceiptError] = useState("")

  const activeSuppliers = suppliers.filter((item) => item.status === "Active")
  const activeWarehouses = warehouses.filter((item) => item.active)
  const activeProducts = products.filter(
    (item) => item.productType !== "SERVICE" &&
      item.status !== "INACTIVE" && item.status !== "DISCONTINUED",
  )

  const pendingReq = purchaseRequisitions.filter((item) => item.status === "SUBMITTED").length
  const approvedReq = purchaseRequisitions.filter((item) => item.status === "APPROVED").length
  const pendingOrders = purchaseOrders.filter((item) => item.status === "PENDING_APPROVAL").length
  const approvedOrders = purchaseOrders.filter((item) => item.status === "APPROVED").length

  const orderedProducts = useMemo(
    () => new Map(activeProducts.map((item) => [item.id, item])),
    [activeProducts],
  )

  function resetForm() {
    setSupplierId("")
    setNotes("")
    setLines([emptyLine()])
    setError("")
  }

  function saveRequisition() {
    setError("")
    try {
      createPurchaseRequisition({
        supplierId,
        warehouseId,
        notes,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          estimatedUnitCost: Number(line.estimatedUnitCost),
        })),
      })
      resetForm()
      setShowForm(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not create requisition.")
    }
  }

  function rejectRequisition(id: string) {
    const reason = window.prompt("Enter the reason for rejecting this requisition:")
    if (reason === null) return
    try {
      reviewPurchaseRequisition(id, "REJECT", "Admin Owner", reason)
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : String(actionError))
    }
  }

  function rejectOrder(id: string) {
    const reason = window.prompt("Enter the reason for rejecting this purchase order:")
    if (reason === null) return
    try {
      reviewPurchaseOrder(id, "REJECT", "Admin Owner", reason)
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : String(actionError))
    }
  }

  function openGoodsReceipt(order: PurchaseOrder) {
    setSelectedOrder(order)
    setSupplierInvoice("")
    setReceiptError("")
    setReceiptLines(order.items
      .filter((item) => item.quantity - item.receivedQuantity > 1e-8)
      .map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        orderedQuantity: item.quantity,
        alreadyReceived: item.receivedQuantity,
        remainingQuantity: Math.max(0, item.quantity - item.receivedQuantity),
        quantity: "",
        purchasePrice: String(item.unitCost),
        batch: "",
        expiry: "",
      })))
    setShowReceiptForm(true)
  }

  function updateReceiptLine(productId: string, field: keyof Pick<ReceiptLineDraft, "quantity" | "purchasePrice" | "batch" | "expiry">, value: string) {
    setReceiptLines((current) => current.map((line) =>
      line.productId === productId ? { ...line, [field]: value } : line,
    ))
  }

  function postGoodsReceipt() {
    if (!selectedOrder) return
    setReceiptError("")
    try {
      if (!supplierInvoice.trim()) throw new Error("Supplier invoice number is required.")
      const linesToReceive = receiptLines.filter((line) => Number(line.quantity) > 0)
      if (!linesToReceive.length) throw new Error("Enter a quantity for at least one purchase-order line.")
      for (const line of linesToReceive) {
        if (!line.batch.trim()) throw new Error(`Batch number is required for ${line.productName}.`)
        if (!line.expiry) throw new Error(`Expiry date is required for ${line.productName}.`)
      }
      const purchase = createPurchase({
        supplierId: selectedOrder.supplierId,
        supplierName: selectedOrder.supplierName,
        supplierInvoice: supplierInvoice.trim(),
        purchaseOrderId: selectedOrder.id,
        warehouseId: selectedOrder.warehouseId,
        items: linesToReceive.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          purchasePrice: Number(line.purchasePrice),
          batch: line.batch,
          expiry: line.expiry,
        })),
      })
      setShowReceiptForm(false)
      setSelectedOrder(null)
      window.alert(`Goods receipt ${purchase.purchaseNumber} posted successfully. Inventory and purchase-order balances have been updated.`)
    } catch (receiptSaveError) {
      setReceiptError(receiptSaveError instanceof Error ? receiptSaveError.message : "Could not post goods receipt.")
    }
  }

  function runAction(action: () => void) {
    try {
      action()
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : String(actionError))
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Requisitions & Purchase Orders</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Request, review and approve purchasing commitments before goods are received.
            </p>
          </div>
          {activeView === "REQUISITIONS" && (
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(true) }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> New requisition
            </button>
          )}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Requisitions awaiting review", pendingReq],
            ["Approved requisitions", approvedReq],
            ["Orders awaiting approval", pendingOrders],
            ["Approved purchase orders", approvedOrders],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveView("REQUISITIONS")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeView === "REQUISITIONS" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            <ClipboardList className="mr-2 inline h-4 w-4" /> Purchase Requisitions ({purchaseRequisitions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView("ORDERS")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeView === "ORDERS" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
          >
            <ShoppingCart className="mr-2 inline h-4 w-4" /> Purchase Orders ({purchaseOrders.length})
          </button>
        </div>

        {activeView === "REQUISITIONS" ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Requisition</th>
                    <th className="px-5 py-4">Supplier</th>
                    <th className="px-5 py-4">Warehouse</th>
                    <th className="px-5 py-4">Lines</th>
                    <th className="px-5 py-4">Estimated total</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseRequisitions.map((req) => (
                    <tr key={req.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{req.requisitionNumber}</p>
                        <p className="mt-1 text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString("en-GB")}</p>
                      </td>
                      <td className="px-5 py-4 text-sm">{req.supplierName}</td>
                      <td className="px-5 py-4 text-sm">{req.warehouseName}</td>
                      <td className="px-5 py-4 text-sm">{req.items.length}</td>
                      <td className="px-5 py-4 text-sm font-semibold">
                        {money(req.items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitCost, 0))}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{req.status.replaceAll("_", " ")}</span>
                        {req.reviewNote && <p className="mt-1 max-w-48 text-xs text-slate-500">{req.reviewNote}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {req.status === "DRAFT" && (
                            <button type="button" onClick={() => runAction(() => submitPurchaseRequisition(req.id))} className="rounded-lg border px-3 py-2 text-xs font-semibold">
                              <Send className="mr-1 inline h-3.5 w-3.5" /> Submit
                            </button>
                          )}
                          {req.status === "SUBMITTED" && (
                            <>
                              <button type="button" onClick={() => runAction(() => reviewPurchaseRequisition(req.id, "APPROVE", "Admin Owner"))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Approve
                              </button>
                              <button type="button" onClick={() => rejectRequisition(req.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                                <XCircle className="mr-1 inline h-3.5 w-3.5" /> Reject
                              </button>
                            </>
                          )}
                          {req.status === "APPROVED" && (
                            <button type="button" onClick={() => runAction(() => createPurchaseOrderFromRequisition(req.id))} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                              <FileCheck2 className="mr-1 inline h-3.5 w-3.5" /> Create PO
                            </button>
                          )}
                          {req.status === "CONVERTED" && <span className="text-xs text-slate-500">Converted to PO</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {purchaseRequisitions.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">No purchase requisitions created yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Purchase order</th>
                    <th className="px-5 py-4">Supplier</th>
                    <th className="px-5 py-4">Warehouse</th>
                    <th className="px-5 py-4">Lines</th>
                    <th className="px-5 py-4">Order total</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{order.purchaseOrderNumber}</p>
                        <p className="mt-1 text-xs text-slate-500">From {order.requisitionNumber}</p>
                      </td>
                      <td className="px-5 py-4 text-sm">{order.supplierName}</td>
                      <td className="px-5 py-4 text-sm">{order.warehouseName}</td>
                      <td className="px-5 py-4 text-sm">{order.items.length}</td>
                      <td className="px-5 py-4 text-sm font-semibold">{money(order.subtotal)}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{order.status.replaceAll("_", " ")}</span>
                        {order.reviewNote && <p className="mt-1 max-w-48 text-xs text-slate-500">{order.reviewNote}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {order.status === "DRAFT" && (
                            <button type="button" onClick={() => runAction(() => submitPurchaseOrder(order.id))} className="rounded-lg border px-3 py-2 text-xs font-semibold">Submit for approval</button>
                          )}
                          {order.status === "PENDING_APPROVAL" && (
                            <>
                              <button type="button" onClick={() => runAction(() => reviewPurchaseOrder(order.id, "APPROVE", "Procurement Manager"))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                              <button type="button" onClick={() => rejectOrder(order.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Reject</button>
                            </>
                          )}
                          {(order.status === "APPROVED" || order.status === "PARTIALLY_RECEIVED") && (
                            <button type="button" onClick={() => openGoodsReceipt(order)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Receive goods</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {purchaseOrders.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">No purchase orders created yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">New Purchase Requisition</h2>
                <p className="mt-1 text-xs text-slate-500">Creating a requisition does not change inventory.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-3 py-2 text-sm">Close</button>
            </div>
            <div className="space-y-4 p-5">
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Supplier
                  <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal">
                    <option value="">Select active supplier</option>
                    {activeSuppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Receiving warehouse
                  <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-11 w-full rounded-xl border px-3 font-normal">
                    {activeWarehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block space-y-1 text-sm font-medium text-slate-700">
                Notes
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full rounded-xl border px-3 py-2 font-normal" placeholder="Reason or purchasing notes" />
              </label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">Requested products</h3>
                  <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} className="rounded-lg border px-3 py-2 text-xs font-semibold"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add line</button>
                </div>
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                    <select value={line.productId} onChange={(event) => {
                      const productId = event.target.value
                      const product = orderedProducts.get(productId)
                      setLines((current) => current.map((item, i) => i === index
                        ? { ...item, productId, estimatedUnitCost: product ? String(product.purchasePrice) : "" }
                        : item))
                    }} className="h-10 min-w-0 rounded-lg border px-2 text-sm">
                      <option value="">Select product</option>
                      {activeProducts.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
                    </select>
                    <input type="number" min="0.001" step="any" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} placeholder="Quantity" className="h-10 min-w-0 rounded-lg border px-2 text-sm" />
                    <input type="number" min="0" step="0.01" value={line.estimatedUnitCost} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, estimatedUnitCost: event.target.value } : item))} placeholder="Est. unit cost" className="h-10 min-w-0 rounded-lg border px-2 text-sm" />
                    <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="rounded-lg border px-3 text-xs text-red-700 disabled:opacity-30">Remove</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={saveRequisition} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">Create requisition</button>
            </div>
          </div>
        </div>
      )}
      {showReceiptForm && selectedOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">Receive goods against {selectedOrder.purchaseOrderNumber}</h2>
                <p className="mt-1 text-xs text-slate-500">Enter quantities in the purchase order unit. Posting creates a purchase receipt and updates inventory.</p>
              </div>
              <button type="button" onClick={() => setShowReceiptForm(false)} className="rounded-lg border px-3 py-2 text-sm">Close</button>
            </div>
            <div className="space-y-4 p-5">
              {receiptError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{receiptError}</div>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">Supplier</span><p className="mt-1 font-semibold text-slate-900">{selectedOrder.supplierName}</p></div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">Receiving warehouse</span><p className="mt-1 font-semibold text-slate-900">{selectedOrder.warehouseName}</p></div>
              </div>
              <label className="block max-w-md space-y-1 text-sm font-medium text-slate-700">
                Supplier invoice number <span className="text-red-600">*</span>
                <input value={supplierInvoice} onChange={(event) => setSupplierInvoice(event.target.value)} required className="h-10 w-full rounded-lg border px-3 font-normal" placeholder="Enter supplier invoice number" />
              </label>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-3">Product</th><th className="px-3 py-3">Ordered</th><th className="px-3 py-3">Received</th><th className="px-3 py-3">Outstanding</th><th className="px-3 py-3">Receive now</th><th className="px-3 py-3">Unit cost</th><th className="px-3 py-3">Batch</th><th className="px-3 py-3">Expiry</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receiptLines.map((line) => (
                      <tr key={line.productId}>
                        <td className="px-3 py-3 font-medium text-slate-900">{line.productName}<p className="text-xs font-normal text-slate-500">{line.unit}</p></td>
                        <td className="px-3 py-3">{line.orderedQuantity}</td>
                        <td className="px-3 py-3">{line.alreadyReceived}</td>
                        <td className="px-3 py-3 font-semibold">{line.remainingQuantity}</td>
                        <td className="px-3 py-3"><input type="number" min="0" max={line.remainingQuantity} step="any" value={line.quantity} onChange={(event) => updateReceiptLine(line.productId, "quantity", event.target.value)} className="h-9 w-24 rounded-lg border px-2" placeholder="0" /></td>
                        <td className="px-3 py-3"><input type="number" min="0" step="0.01" value={line.purchasePrice} onChange={(event) => updateReceiptLine(line.productId, "purchasePrice", event.target.value)} className="h-9 w-28 rounded-lg border px-2" /></td>
                        <td className="px-3 py-3"><input value={line.batch} onChange={(event) => updateReceiptLine(line.productId, "batch", event.target.value)} className="h-9 w-28 rounded-lg border px-2" placeholder="Batch no." /></td>
                        <td className="px-3 py-3"><input type="date" value={line.expiry} onChange={(event) => updateReceiptLine(line.productId, "expiry", event.target.value)} className="h-9 w-36 rounded-lg border px-2" /></td>
                      </tr>
                    ))}
                    {receiptLines.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">All purchase-order quantities have already been received.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                <button type="button" onClick={() => setShowReceiptForm(false)} className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                <button type="button" onClick={postGoodsReceipt} disabled={receiptLines.length === 0} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Post goods receipt</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  )
}
