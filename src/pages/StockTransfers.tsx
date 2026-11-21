import { useMemo, useState } from "react"
import { ArrowRightLeft, CheckCircle2, Plus, X, XCircle } from "lucide-react"
import { useERP } from "../context/ERPContext"

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB")
}

const labels: Record<string, string> = {
  DRAFT: "Draft",
  DISPATCHED: "In Transit",
  PARTIALLY_RECEIVED: "Partially Received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
}

export default function StockTransfers() {
  const {
    warehouses, storageLocations, inventoryLots, products,
    stockTransfers, createStockTransfer, dispatchStockTransfer,
    receiveStockTransfer, cancelStockTransfer,
  } = useERP()

  const activeWarehouses = warehouses.filter((item) => item.active)

  const [createOpen, setCreateOpen] = useState(false)
  const [sourceId, setSourceId] = useState(
    () => activeWarehouses.find((item) => item.type === "MAIN")?.id ?? activeWarehouses[0]?.id ?? "",
  )
  const [destinationId, setDestinationId] = useState("")
  const [destinationLocationId, setDestinationLocationId] = useState("")
  const [lotId, setLotId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<{ sourceLotId: string; quantity: number }[]>([])
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({})
  const [receiptLocationId, setReceiptLocationId] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const sourceLots = useMemo(
    () => inventoryLots.filter((lot) => lot.warehouseId === sourceId && lot.quantity > 0),
    [inventoryLots, sourceId],
  )
  const selectedLot = sourceLots.find((lot) => lot.id === lotId)
  const destinationLocations = storageLocations.filter(
    (item) => item.active && item.warehouseId === destinationId,
  )
  const receivingTransfer = stockTransfers.find((item) => item.id === receivingId)
  const receivingLocations = receivingTransfer
    ? storageLocations.filter(
        (item) => item.active && item.warehouseId === receivingTransfer.destinationWarehouseId,
      )
    : []

  function name(productId: string) {
    return products.find((item) => item.id === productId)?.name ?? "Unknown product"
  }

  function remaining(item: (typeof stockTransfers)[number]["items"][number]) {
    return Math.max(
      0,
      item.quantity - item.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0),
    )
  }

  function openCreate() {
    setLines([])
    setLotId("")
    setQuantity("")
    setNotes("")
    setDestinationLocationId("")
    setError("")
    setMessage("")
    setCreateOpen(true)
  }

  function addLine() {
    const qty = Number(quantity)
    if (!selectedLot) {
      setError("Select a source batch.")
      return
    }
    if (!Number.isInteger(qty) || qty <= 0 || qty > selectedLot.quantity) {
      setError(`Enter a whole number between 1 and ${selectedLot.quantity}.`)
      return
    }
    if (lines.some((item) => item.sourceLotId === lotId)) {
      setError("This batch is already included.")
      return
    }
    setLines((items) => [...items, { sourceLotId: lotId, quantity: qty }])
    setLotId("")
    setQuantity("")
    setError("")
  }

  function saveDraft() {
    setError("")
    try {
      const result = createStockTransfer({
        sourceWarehouseId: sourceId,
        destinationWarehouseId: destinationId,
        destinationLocationId: destinationLocationId || null,
        notes,
        items: lines,
      })
      setCreateOpen(false)
      setMessage(`${result.transferNumber} saved as a draft. Stock has not changed.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function dispatch(id: string) {
    setError("")
    try {
      dispatchStockTransfer(id)
      setMessage("Transfer dispatched. Source stock has been reduced.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function cancel(id: string) {
    setError("")
    try {
      cancelStockTransfer(id)
      setMessage("Draft transfer cancelled. Stock has not changed.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function openReceipt(id: string) {
    const transfer = stockTransfers.find((item) => item.id === id)
    if (!transfer) return
    const initial: Record<string, string> = {}
    transfer.items.forEach((item) => { initial[item.id] = String(remaining(item)) })
    setReceiptQuantities(initial)
    setReceiptLocationId(transfer.destinationLocationId ?? "")
    setReceivingId(id)
    setError("")
  }

  function recordReceipt() {
    if (!receivingTransfer) return
    setError("")
    try {
      const items = receivingTransfer.items
        .map((item) => ({
          itemId: item.id,
          quantity: Number(receiptQuantities[item.id] ?? 0),
        }))
        .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0)

      if (!items.length) throw new Error("Enter at least one quantity to receive.")

      receiveStockTransfer(receivingTransfer.id, {
        items,
        locationId: receiptLocationId || null,
      })
      setReceivingId(null)
      setMessage("Receipt saved. Destination inventory and stock ledger updated.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const inTransit = stockTransfers
    .filter((item) => item.status === "DISPATCHED" || item.status === "PARTIALLY_RECEIVED")
    .reduce(
      (sum, transfer) => sum + transfer.items.reduce((total, item) => total + remaining(item), 0),
      0,
    )

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Stock Transfers</h1>
            <p className="mt-1 text-sm text-slate-500">Transfer batches between warehouses with dispatch and receipt tracking.</p>
          </div>
          <button type="button" onClick={openCreate} disabled={activeWarehouses.length < 2}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Plus size={17} /> New Transfer
          </button>
        </div>

        {activeWarehouses.length < 2 && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            You currently have one active warehouse. Add a second warehouse in Warehouses & Locations before creating a transfer. Your Main Warehouse stock will remain unchanged.
          </div>
        )}

        {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
        {error && !createOpen && !receivingTransfer && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Total Transfers</p><p className="mt-2 text-2xl font-bold">{stockTransfers.length}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Awaiting Receipt</p><p className="mt-2 text-2xl font-bold">{stockTransfers.filter((item) => item.status === "DISPATCHED" || item.status === "PARTIALLY_RECEIVED").length}</p></div>
          <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Units In Transit</p><p className="mt-2 text-2xl font-bold">{inTransit}</p></div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Transfer</th><th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Destination</th><th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...stockTransfers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((transfer) => {
                  const total = transfer.items.reduce((sum, item) => sum + item.quantity, 0)
                  const received = transfer.items.reduce((sum, item) => sum + item.quantity - remaining(item), 0)
                  return (
                    <tr key={transfer.id}>
                      <td className="px-4 py-3 font-semibold">{transfer.transferNumber}</td>
                      <td className="px-4 py-3">{transfer.sourceWarehouseName}</td>
                      <td className="px-4 py-3">{transfer.destinationWarehouseName}</td>
                      <td className="px-4 py-3">{total}{transfer.status !== "DRAFT" && transfer.status !== "CANCELLED" ? ` · ${received} received` : ""}</td>
                      <td className="px-4 py-3">{dateLabel(transfer.createdAt)}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{labels[transfer.status]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {transfer.status === "DRAFT" && <>
                            <button type="button" onClick={() => dispatch(transfer.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Dispatch</button>
                            <button type="button" onClick={() => cancel(transfer.id)} className="rounded-lg border px-3 py-2 text-xs">Cancel</button>
                          </>}
                          {(transfer.status === "DISPATCHED" || transfer.status === "PARTIALLY_RECEIVED") && (
                            <button type="button" onClick={() => openReceipt(transfer.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Receive Stock</button>
                          )}
                          {transfer.status === "RECEIVED" && <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={15}/> Complete</span>}
                          {transfer.status === "CANCELLED" && <span className="flex items-center gap-1 text-slate-400"><XCircle size={15}/> Cancelled</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!stockTransfers.length && <tr><td colSpan={7} className="px-4 py-14 text-center text-slate-500"><ArrowRightLeft className="mx-auto mb-3 text-slate-300" size={30}/><p className="font-semibold">No transfers created yet</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div><h2 className="text-lg font-bold">Create Stock Transfer</h2><p className="mt-1 text-sm text-slate-500">Draft creation does not change inventory.</p></div>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={19}/></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2"><span className="text-sm font-semibold">Source Warehouse</span>
                  <select value={sourceId} onChange={(event) => {setSourceId(event.target.value);setLines([]);setLotId("")}} className="h-11 w-full rounded-lg border px-3 text-sm">
                    {activeWarehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2"><span className="text-sm font-semibold">Destination Warehouse</span>
                  <select value={destinationId} onChange={(event) => {setDestinationId(event.target.value);setDestinationLocationId("")}} className="h-11 w-full rounded-lg border px-3 text-sm">
                    <option value="">Select destination</option>
                    {activeWarehouses.filter((item) => item.id !== sourceId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2"><span className="text-sm font-semibold">Destination Location (Optional)</span>
                  <select value={destinationLocationId} onChange={(event) => setDestinationLocationId(event.target.value)} className="h-11 w-full rounded-lg border px-3 text-sm">
                    <option value="">Not specified</option>
                    {destinationLocations.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2"><span className="text-sm font-semibold">Notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} className="h-11 w-full rounded-lg border px-3 text-sm" placeholder="Optional transfer notes"/></label>
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <h3 className="mb-3 font-semibold">Add Batch / Lot</h3>
                <div className="grid gap-3 md:grid-cols-[1fr_130px_auto]">
                  <select value={lotId} onChange={(event) => setLotId(event.target.value)} className="h-11 min-w-0 rounded-lg border bg-white px-3 text-sm">
                    <option value="">Select source batch</option>
                    {sourceLots.map((lot) => <option key={lot.id} value={lot.id}>{name(lot.productId)} · {lot.batch} · Exp {lot.expiry || "—"} · Available {lot.quantity}</option>)}
                  </select>
                  <input type="number" min="1" max={selectedLot?.quantity ?? undefined} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantity" className="h-11 rounded-lg border bg-white px-3 text-sm"/>
                  <button type="button" onClick={addLine} className="rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Add Batch</button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[550px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Product / Batch</th><th className="px-3 py-3">Expiry</th><th className="px-3 py-3 text-right">Quantity</th><th className="px-3 py-3 text-right">Remove</th></tr></thead>
                  <tbody className="divide-y">
                    {lines.map((line) => {
                      const lot = inventoryLots.find((item) => item.id === line.sourceLotId)
                      return <tr key={line.sourceLotId}><td className="px-3 py-3"><p className="font-semibold">{lot ? name(lot.productId) : "Unknown"}</p><p className="text-xs text-slate-500">{lot?.batch}</p></td><td className="px-3 py-3">{lot?.expiry || "—"}</td><td className="px-3 py-3 text-right">{line.quantity}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => setLines((items) => items.filter((item) => item.sourceLotId !== line.sourceLotId))} className="text-red-600">Remove</button></td></tr>
                    })}
                    {!lines.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">No batch lines added.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border px-4 py-2.5 text-sm">Close</button>
              <button type="button" disabled={!lines.length} onClick={saveDraft} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save Draft</button>
            </div>
          </div>
        </div>
      )}

      {receivingTransfer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div><h2 className="text-lg font-bold">Receive {receivingTransfer.transferNumber}</h2><p className="mt-1 text-sm text-slate-500">{receivingTransfer.sourceWarehouseName} → {receivingTransfer.destinationWarehouseName}</p></div>
              <button type="button" onClick={() => setReceivingId(null)} className="rounded-lg p-2 hover:bg-slate-100"><X size={19}/></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <label className="block space-y-2"><span className="text-sm font-semibold">Destination Location</span>
                <select value={receiptLocationId} onChange={(event) => setReceiptLocationId(event.target.value)} className="h-11 w-full rounded-lg border px-3 text-sm">
                  <option value="">Not specified</option>
                  {receivingLocations.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
                </select>
              </label>
              {receivingTransfer.items.map((item) => {
                const received = item.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0)
                const left = remaining(item)
                return <div key={item.id} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_130px]">
                  <div><p className="font-semibold">{item.productName} · Batch {item.batch}</p><p className="mt-1 text-xs text-slate-500">Expiry {item.expiry || "—"} · Dispatched {item.quantity} · Received {received} · Remaining {left}</p></div>
                  <label className="space-y-1"><span className="text-xs font-semibold">Receive Now</span><input type="number" min="0" max={left} disabled={left === 0} value={receiptQuantities[item.id] ?? "0"} onChange={(event) => setReceiptQuantities((old) => ({...old,[item.id]:event.target.value}))} className="h-10 w-full rounded-lg border px-3 text-sm"/></label>
                </div>
              })}
              <p className="text-xs text-slate-500">Partial receipts are supported. Remaining quantities can be received later.</p>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
              <button type="button" onClick={() => setReceivingId(null)} className="rounded-lg border px-4 py-2.5 text-sm">Close</button>
              <button type="button" onClick={recordReceipt} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">Record Receipt</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
