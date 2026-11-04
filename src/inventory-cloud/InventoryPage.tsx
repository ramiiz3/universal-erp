import { useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { createSubmissionLock, type AdjustmentInput, type ReceiptInput } from "./domain"
import { useCloudInventory, type CloudInventoryLot } from "./CloudInventoryContext"
import { adjustStockWorkflow, receiveStockWorkflow } from "./workflows"

const EMPTY_RECEIPT: ReceiptInput = {
  productId: "",
  warehouseId: "",
  batch: "",
  expiry: "",
  quantity: "",
  purchasePrice: "",
  sellingPrice: "",
  reason: "Stock received",
}

const EMPTY_ADJUSTMENT: AdjustmentInput = { lotId: "", quantityDelta: "", reason: "" }

export default function InventoryPage() {
  const { activeCompany, memberships } = useAuth()
  const { companyId, products, warehouses, lots, loading, error, refresh } = useCloudInventory()
  const [query, setQuery] = useState("")
  const [warehouseFilter, setWarehouseFilter] = useState("")
  const [showReceive, setShowReceive] = useState(false)
  const [showAdjustment, setShowAdjustment] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptInput>(EMPTY_RECEIPT)
  const [adjustment, setAdjustment] = useState<AdjustmentInput>(EMPTY_ADJUSTMENT)
  const [receiptRequestId, setReceiptRequestId] = useState("")
  const [adjustmentRequestId, setAdjustmentRequestId] = useState("")
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState("")
  const [message, setMessage] = useState("")
  const submitLock = useRef(createSubmissionLock())

  const canManageInventory = memberships.some((membership) =>
    membership.companyId === companyId &&
    ["owner", "admin", "manager", "inventory_manager"].includes(membership.roleKey),
  )
  const companyMemberships = memberships.filter((membership) => membership.companyId === companyId)
  const hasCompanyScope = companyMemberships.some((membership) => membership.branchId === null)
  const allowedBranchIds = new Set(companyMemberships.flatMap((membership) => membership.branchId ? [membership.branchId] : []))
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const warehouseById = useMemo(() => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])), [warehouses])
  const visibleLots = useMemo(() => {
    const text = query.trim().toLocaleLowerCase()
    return lots.filter((lot) => {
      if (warehouseFilter && lot.warehouse_id !== warehouseFilter) return false
      const product = productById.get(lot.product_id)
      const warehouse = lot.warehouse_id ? warehouseById.get(lot.warehouse_id) : undefined
      return !text || [
        product?.name ?? "",
        product?.sku ?? "",
        product?.barcode ?? "",
        lot.batch,
        warehouse?.name ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(text))
    })
  }, [lots, productById, warehouseById, query, warehouseFilter])

  function startReceive() {
    setPageError("")
    setReceiptRequestId(globalThis.crypto.randomUUID())
    setReceipt({
      ...EMPTY_RECEIPT,
      productId: products.find((product) => product.is_active)?.id ?? "",
      warehouseId: warehouses[0]?.id ?? "",
    })
    setShowReceive(true)
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = supabase
    if (!client || !activeCompany) return
    setPageError("")
    setMessage("")
    try {
      if (!products.some((product) => product.id === receipt.productId && product.is_active)) {
        throw new Error("Select an active product in the active company.")
      }
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
      return
    }

    setSaving(true)
    try {
      await submitLock.current(async () => {
        await receiveStockWorkflow(async (command) => {
          const { error: receiveError } = await client.rpc("receive_inventory_lot_once", {
            p_company_id: command.companyId,
            p_product_id: command.productId,
            p_branch_id: command.branchId,
            p_warehouse_id: command.warehouseId,
            p_batch: command.batch,
            p_expiry: command.expiry,
            p_quantity: command.quantity,
            p_purchase_price: command.purchasePrice,
            p_selling_price: command.sellingPrice,
            p_reason: command.reason,
            p_request_id: command.requestId,
          })
          if (receiveError) throw receiveError
        }, activeCompany.companyId, warehouses, receipt, allowedBranchIds, hasCompanyScope, receiptRequestId)
        setShowReceive(false)
        setMessage("Stock received. A new lot and receipt movement were recorded atomically.")
        await refresh()
      })
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = supabase
    if (!client || !activeCompany) return
    setPageError("")
    setMessage("")
    try {
      if (!adjustment.lotId) throw new Error("Select an inventory lot.")
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
      return
    }

    setSaving(true)
    try {
      await submitLock.current(async () => {
        await adjustStockWorkflow(async (command) => {
          const { error: adjustmentError } = await client.rpc("record_inventory_movement_once", {
            p_company_id: command.companyId,
            p_lot_id: command.lotId,
            p_quantity_delta: command.quantityDelta,
            p_reason: command.reason,
            p_metadata: { source: "company_inventory_adjustment" },
            p_request_id: command.requestId,
          })
          if (adjustmentError) throw adjustmentError
        }, activeCompany.companyId, lots, adjustment, adjustmentRequestId)
        setShowAdjustment(false)
        setMessage("Stock adjustment and movement history were recorded atomically.")
        await refresh()
      })
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  function requestAdjustment(lot: CloudInventoryLot) {
    setAdjustment({ lotId: lot.id, quantityDelta: "", reason: "" })
    setAdjustmentRequestId(globalThis.crypto.randomUUID())
    setPageError("")
    setShowAdjustment(true)
  }

  const totalUnits = visibleLots.reduce((sum, lot) => sum + Number(lot.quantity), 0)
  const lowStock = products.filter((product) => product.is_active).filter((product) => {
    const stock = lots.filter((lot) => lot.product_id === product.id).reduce((sum, lot) => sum + Number(lot.quantity), 0)
    return stock <= Number(product.minimum_stock)
  })

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Inventory lots</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{activeCompany?.companyName} · lots remain separate by batch, expiry, cost, and price</p></div>
        {canManageInventory && <div className="flex gap-2"><button type="button" onClick={startReceive} disabled={!products.some((product) => product.is_active) || !warehouses.length} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Receive stock</button><button type="button" onClick={() => { setAdjustment(EMPTY_ADJUSTMENT); setAdjustmentRequestId(globalThis.crypto.randomUUID()); setPageError(""); setShowAdjustment(true) }} disabled={!lots.length} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Adjust stock</button></div>}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Units in current view</p><p className="mt-1 text-xl font-semibold">{totalUnits}</p></div>
        <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Low / zero-stock products</p><p className="mt-1 text-xl font-semibold">{lowStock.length}</p></div>
        <div className="rounded-xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">Visible lots</p><p className="mt-1 text-xl font-semibold">{visibleLots.length}</p></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="sr-only">Search lots</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU, barcode, batch" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
        <label><span className="sr-only">Filter warehouse</span><select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">All accessible warehouses</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {pageError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading ? <p className="rounded-xl border bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">Loading branch-accessible inventory…</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300"><tr><th className="p-3">Product</th><th className="p-3">Warehouse</th><th className="p-3">Batch / expiry</th><th className="p-3">Quantity</th><th className="p-3">Unit cost</th><th className="p-3">Lot / default price</th><th className="p-3">Action</th></tr></thead>
            <tbody>{visibleLots.map((lot) => {
              const product = productById.get(lot.product_id)
              const warehouse = lot.warehouse_id ? warehouseById.get(lot.warehouse_id) : undefined
              return <tr key={lot.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3 font-medium">{product?.name ?? "Unavailable product"}<div className="text-xs text-slate-500">{product?.sku || "No SKU"} · {product?.category || "Uncategorized"}</div></td>
                <td className="p-3">{warehouse?.name ?? "Unavailable warehouse"}</td>
                <td className="p-3">{lot.batch || "No batch"}<div className="text-xs text-slate-500">{lot.expiry ?? "No expiry date"}</div></td>
                <td className="p-3">{Number(lot.quantity)} {product?.unit}</td>
                <td className="p-3">{Number(lot.purchase_price).toFixed(2)} {activeCompany?.currency}</td>
                <td className="p-3">{lot.selling_price == null ? `${Number(product?.selling_price ?? 0).toFixed(2)} default` : Number(lot.selling_price).toFixed(2)} {activeCompany?.currency}</td>
                <td className="p-3">{canManageInventory && <button type="button" onClick={() => requestAdjustment(lot)} className="text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-300">Adjust</button>}</td>
              </tr>
            })}{!visibleLots.length && <tr><td colSpan={7} className="p-8 text-center text-sm text-slate-500">No inventory lots match this view. Zero-stock products remain visible in the Products module.</td></tr>}</tbody>
          </table>
        </div>
      )}

      {showReceive && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={(event) => void receive(event)} className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Receive stock into a new lot</h2>
            <p className="mt-1 text-xs text-slate-500">Lot creation and the RECEIPT movement commit atomically. Fractional quantities are supported.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">Product<select required value={receipt.productId} onChange={(event) => setReceipt((current) => ({ ...current, productId: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">Select product</option>{products.filter((product) => product.is_active).map((product) => <option key={product.id} value={product.id}>{product.name} {product.sku && `· ${product.sku}`}</option>)}</select></label>
              <label className="text-sm font-medium sm:col-span-2">Warehouse<select required value={receipt.warehouseId} onChange={(event) => setReceipt((current) => ({ ...current, warehouseId: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">Select warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
              {([
                ["batch", "Batch number", "text"],
                ["expiry", "Expiry date", "date"],
                ["quantity", "Received quantity", "number"],
                ["purchasePrice", "Unit purchase cost", "number"],
                ["sellingPrice", "Lot selling price (optional)", "number"],
                ["reason", "Reason / reference", "text"],
              ] as const).map(([field, label, type]) => <label key={field} className="text-sm font-medium">{label}<input required={field === "quantity" || field === "purchasePrice"} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} value={receipt[field]} onChange={(event) => setReceipt((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>)}
            </div>
            {pageError && <p role="alert" className="mt-3 text-sm text-red-700">{pageError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowReceive(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Receiving…" : "Receive stock"}</button></div>
          </form>
        </div>
      )}

      {showAdjustment && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form onSubmit={(event) => void adjust(event)} className="w-full max-w-xl rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h2 className="text-lg font-semibold">Adjust stock</h2>
            <p className="mt-1 text-xs text-slate-500">The server locks the lot, checks permission and prevents a negative balance.</p>
            <label className="mt-4 block text-sm font-medium">Inventory lot<select required value={adjustment.lotId} onChange={(event) => setAdjustment((current) => ({ ...current, lotId: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">Select lot</option>{lots.map((lot) => <option key={lot.id} value={lot.id}>{productById.get(lot.product_id)?.name ?? "Product"} · {warehouseById.get(lot.warehouse_id ?? "")?.name ?? "Warehouse"} · {lot.batch || lot.id.slice(0, 8)} · {lot.quantity} on hand</option>)}</select></label>
            <label className="mt-3 block text-sm font-medium">Quantity change (+ or −)<input required type="number" step="any" value={adjustment.quantityDelta} onChange={(event) => setAdjustment((current) => ({ ...current, quantityDelta: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="mt-3 block text-sm font-medium">Reason<input required value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} placeholder="Cycle count, damage, correction…" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
            {pageError && <p role="alert" className="mt-3 text-sm text-red-700">{pageError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowAdjustment(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Adjusting…" : "Record adjustment"}</button></div>
          </form>
        </div>
      )}
    </section>
  )
}
