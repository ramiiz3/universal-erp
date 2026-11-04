import { useCallback, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { useCloudInventory } from "./CloudInventoryContext"
import { buildPurchaseLines, buildPurchaseReceiptLines, type PurchaseCartItem, type PurchaseReceiveItem } from "./transactions"

type CloudSupplier = {
  id: string
  company_id: string
  name: string
  email: string
  phone: string
  address: string
  tax_registration_number: string
  is_active: boolean
}

type CloudPurchase = {
  id: string
  company_id: string
  branch_id: string
  warehouse_id: string
  supplier_id: string
  purchase_number: string
  supplier_invoice_reference: string
  status: "ordered" | "partially_received" | "received"
  subtotal: number
  discount_total: number
  vat_total: number
  total: number
  currency: string
  created_at: string
}

type PurchaseLine = {
  id: string
  product_id: string
  product_name: string
  sku: string
  unit: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  line_total: number
}

type ReceiveDraft = {
  quantity: string
  unitCost: string
  sellingPrice: string
  batch: string
  expiry: string
}

const EMPTY_DRAFT: ReceiveDraft = {
  quantity: "0",
  unitCost: "",
  sellingPrice: "",
  batch: "",
  expiry: "",
}

const PURCHASING_ROLES = new Set(["owner", "admin", "manager"])

export default function CloudPurchasingPage() {
  const { activeCompany, user } = useAuth()
  const { companyId, branches, warehouses, products, loading: inventoryLoading, refresh: refreshInventory } = useCloudInventory()
  const pendingRef = useRef(false)
  const receiptRequestRef = useRef(crypto.randomUUID())
  const purchaseRequestRef = useRef(crypto.randomUUID())
  const fetchVersion = useRef(0)
  const purchaseLinesVersion = useRef(0)
  const memberships = activeCompany?.memberships ?? []
  const companyScope = memberships.some((membership) => membership.branchId === null)
  const allowedBranchIds = new Set(memberships.flatMap((membership) =>
    membership.branchId ? [membership.branchId] : [],
  ))
  const accessibleBranches = companyScope ? branches : branches.filter((branch) => allowedBranchIds.has(branch.id))
  const hasPurchasingRole = memberships.some((membership) => PURCHASING_ROLES.has(membership.roleKey))
  const canManageSuppliers = memberships.some((membership) =>
    PURCHASING_ROLES.has(membership.roleKey) && membership.branchId === null,
  )

  const [suppliers, setSuppliers] = useState<CloudSupplier[]>([])
  const [purchases, setPurchases] = useState<CloudPurchase[]>([])
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("")
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLine[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBranchOverride, setSelectedBranchOverride] = useState("")
  const [selectedWarehouseOverride, setSelectedWarehouseOverride] = useState("")
  const [selectedSupplierId, setSelectedSupplierId] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [supplierEmail, setSupplierEmail] = useState("")
  const [supplierPhone, setSupplierPhone] = useState("")
  const [supplierAddress, setSupplierAddress] = useState("")
  const [supplierTaxNumber, setSupplierTaxNumber] = useState("")
  const [supplierInvoiceReference, setSupplierInvoiceReference] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitCost, setUnitCost] = useState("")
  const [lineDiscount, setLineDiscount] = useState("0")
  const [cart, setCart] = useState<PurchaseCartItem[]>([])
  const [receiveDrafts, setReceiveDrafts] = useState<Record<string, ReceiveDraft>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const preferredBranchId = activeCompany?.branchId
    && accessibleBranches.some((branch) => branch.id === activeCompany.branchId)
    ? activeCompany.branchId
    : accessibleBranches[0]?.id ?? ""
  const selectedBranchId = accessibleBranches.some((branch) => branch.id === selectedBranchOverride)
    ? selectedBranchOverride
    : preferredBranchId
  const branchWarehouses = warehouses.filter((warehouse) => warehouse.branch_id === selectedBranchId)
  const preferredWarehouseId = branchWarehouses.find((warehouse) => warehouse.is_default)?.id
    ?? branchWarehouses[0]?.id
    ?? ""
  const warehouseId = branchWarehouses.some((warehouse) => warehouse.id === selectedWarehouseOverride)
    ? selectedWarehouseOverride
    : preferredWarehouseId
  const supplierId = suppliers.some((supplier) => supplier.id === selectedSupplierId && supplier.is_active)
    ? selectedSupplierId
    : suppliers.find((supplier) => supplier.is_active)?.id ?? ""
  const selectedPurchase = purchases.find((purchase) => purchase.id === selectedPurchaseId) ?? null
  const refreshLists = useCallback(async () => {
    const requestId = ++fetchVersion.current
    if (!supabase || !companyId) {
      return
    }
    const [supplierResult, purchaseResult] = await Promise.all([
      supabase.from("cloud_suppliers").select("*").eq("company_id", companyId).order("name"),
      supabase.from("cloud_purchases").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100),
    ])
    if (requestId !== fetchVersion.current) return
    setError([supplierResult.error?.message, purchaseResult.error?.message].filter(Boolean).join("; "))
    setSuppliers((supplierResult.data ?? []) as CloudSupplier[])
    setPurchases((purchaseResult.data ?? []) as CloudPurchase[])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    void refreshLists()
    return () => { fetchVersion.current += 1 }
  }, [refreshLists])

  const loadPurchaseLines = useCallback(async (purchaseId: string) => {
    const requestId = ++purchaseLinesVersion.current
    setPurchaseLines([])
    setReceiveDrafts({})
    if (!supabase || !purchaseId) return
    const { data, error: linesError } = await supabase
      .from("cloud_purchase_lines")
      .select("*")
      .eq("company_id", companyId)
      .eq("purchase_id", purchaseId)
      .order("created_at")
    if (linesError) {
      if (requestId !== purchaseLinesVersion.current) return
      setError(linesError.message)
      return
    }
    if (requestId !== purchaseLinesVersion.current) return
    const lines = (data ?? []) as PurchaseLine[]
    setPurchaseLines(lines)
    setReceiveDrafts(Object.fromEntries(lines.map((line) => [line.id, {
      ...EMPTY_DRAFT,
      quantity: String(Math.max(0, Number(line.quantity_ordered) - Number(line.quantity_received))),
      unitCost: String(line.unit_cost),
    }])))
  }, [companyId])

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRef.current) return
    pendingRef.current = true
    setSubmitting(true)
    setError("")
    setMessage("")
    try {
      if (!supabase || !user) throw new Error("Supplier management is unavailable.")
      const name = supplierName.trim()
      if (!name) throw new Error("Supplier name is required.")
      const { error: insertError } = await supabase.from("cloud_suppliers").insert({
        company_id: companyId,
        name,
        email: supplierEmail.trim(),
        phone: supplierPhone.trim(),
        address: supplierAddress.trim(),
        tax_registration_number: supplierTaxNumber.trim(),
        created_by: user.id,
      })
      if (insertError) throw insertError
      setSupplierName("")
      setSupplierEmail("")
      setSupplierPhone("")
      setSupplierAddress("")
      setSupplierTaxNumber("")
      setMessage("Supplier created.")
      await refreshLists()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      pendingRef.current = false
      setSubmitting(false)
    }
  }

  function addPurchaseLine() {
    setError("")
    const product = products.find((candidate) => candidate.id === selectedProductId && candidate.is_active)
    if (!product) {
      setError("Select an active company product.")
      return
    }
    if (cart.some((line) => line.productId === product.id)) {
      setError("That product is already in the purchase. Edit its existing line instead.")
      return
    }
    try {
      const line = {
        productId: product.id,
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        discountAmount: Number(lineDiscount || 0),
      }
      buildPurchaseLines([line])
      setCart((previous) => [...previous, line])
      setQuantity("1")
      setUnitCost(String(product.purchase_price))
      setLineDiscount("0")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function createPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRef.current) return
    pendingRef.current = true
    setSubmitting(true)
    setError("")
    setMessage("")
    try {
      if (!supabase || !user) throw new Error("Cloud purchasing is unavailable.")
      if (!selectedBranchId || !warehouseId || !supplierId) throw new Error("Select an accessible branch, warehouse, and supplier.")
      const lines = buildPurchaseLines(cart)
      const { data, error: rpcError } = await supabase.rpc("create_cloud_purchase", {
        p_company_id: companyId,
        p_branch_id: selectedBranchId,
        p_warehouse_id: warehouseId,
        p_supplier_id: supplierId,
        p_supplier_invoice_reference: supplierInvoiceReference.trim(),
        p_lines: lines,
        p_request_id: purchaseRequestRef.current,
      })
      if (rpcError) throw rpcError
      const result = data as { purchase_id?: string; purchase_number?: string } | null
      if (!result?.purchase_id) throw new Error("The purchase was saved without returning its identifier.")
      purchaseRequestRef.current = crypto.randomUUID()
      setCart([])
      setSupplierInvoiceReference("")
      setMessage(`Purchase ${result.purchase_number ?? ""} created. Receive goods to add stock.`)
      await refreshLists()
      setSelectedPurchaseId(result.purchase_id)
      await loadPurchaseLines(result.purchase_id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      pendingRef.current = false
      setSubmitting(false)
    }
  }

  async function receivePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRef.current || !selectedPurchase) return
    pendingRef.current = true
    setSubmitting(true)
    setError("")
    setMessage("")
    try {
      if (!supabase) throw new Error("Cloud purchasing is unavailable.")
      const receiveItems: PurchaseReceiveItem[] = purchaseLines.map((line) => {
        const draft = receiveDrafts[line.id] ?? EMPTY_DRAFT
        return {
          purchaseLineId: line.id,
          outstandingQuantity: Number(line.quantity_ordered) - Number(line.quantity_received),
          quantity: Number(draft.quantity || 0),
          unitCost: draft.unitCost.trim() ? Number(draft.unitCost) : null,
          sellingPrice: draft.sellingPrice.trim() ? Number(draft.sellingPrice) : null,
          batch: draft.batch,
          expiry: draft.expiry,
        }
      })
      const lines = buildPurchaseReceiptLines(receiveItems)
      const { data, error: rpcError } = await supabase.rpc("receive_cloud_purchase_once", {
        p_company_id: companyId,
        p_purchase_id: selectedPurchase.id,
        p_lines: lines,
        p_request_id: receiptRequestRef.current,
      })
      if (rpcError) throw rpcError
      const result = data as { status?: string; received_lines?: number } | null
      setMessage(`Stock receipt recorded (${result?.received_lines ?? lines.length} lot${lines.length === 1 ? "" : "s"}). Purchase status: ${result?.status ?? "updated"}.`)
      receiptRequestRef.current = crypto.randomUUID()
      await Promise.all([refreshLists(), refreshInventory()])
      await loadPurchaseLines(selectedPurchase.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      pendingRef.current = false
      setSubmitting(false)
    }
  }

  if (!hasPurchasingRole) {
    return <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">Your company role does not grant cloud purchasing access.</section>
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Cloud purchasing</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Create supplier purchase orders and receive any portion of an order into a new inventory lot.</p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Suppliers</h2>
          {loading ? <p className="mt-3 text-sm text-slate-500">Loading suppliers…</p> : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {suppliers.map((supplier) => <li key={supplier.id} className="py-2">
                <div className="font-medium">{supplier.name}{!supplier.is_active && <span className="ml-2 text-xs text-slate-500">Inactive</span>}</div>
                <div className="text-xs text-slate-500">{[supplier.email, supplier.phone, supplier.tax_registration_number].filter(Boolean).join(" · ") || "No contact details"}</div>
              </li>)}
              {!suppliers.length && <li className="py-4 text-slate-500">No suppliers have been added to this company.</li>}
            </ul>
          )}
          {canManageSuppliers && <form onSubmit={(event) => void createSupplier(event)} className="mt-4 grid gap-2 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
            <label className="text-xs font-medium sm:col-span-2">Supplier name<input required value={supplierName} onChange={(event) => setSupplierName(event.target.value)} maxLength={200} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-xs font-medium">Email<input type="email" value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-xs font-medium">Phone<input value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-xs font-medium">Address<input value={supplierAddress} onChange={(event) => setSupplierAddress(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-xs font-medium">Tax registration<input value={supplierTaxNumber} onChange={(event) => setSupplierTaxNumber(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <button disabled={submitting} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700 sm:col-span-2">Add supplier</button>
          </form>}
        </section>

        <form onSubmit={(event) => void createPurchase(event)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">New purchase order</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Branch<select required value={selectedBranchId} onChange={(event) => {
              setSelectedBranchOverride(event.target.value)
              setSelectedWarehouseOverride("")
            }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">Select branch</option>{accessibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="text-sm">Destination warehouse<select required value={warehouseId} onChange={(event) => setSelectedWarehouseOverride(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">Select warehouse</option>{branchWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <label className="text-sm sm:col-span-2">Supplier<select required value={supplierId} onChange={(event) => setSelectedSupplierId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="">Select supplier</option>{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <label className="text-sm sm:col-span-2">Supplier invoice reference<input value={supplierInvoiceReference} onChange={(event) => setSupplierInvoiceReference(event.target.value)} maxLength={200} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_110px_100px_auto]">
            <label className="text-xs font-medium">Product<select value={selectedProductId} onChange={(event) => {
              const product = products.find((candidate) => candidate.id === event.target.value)
              setSelectedProductId(event.target.value)
              setUnitCost(product ? String(product.purchase_price) : "")
            }} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="">Select product</option>{products.filter((product) => product.is_active).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
            <label className="text-xs font-medium">Quantity<input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-xs font-medium">Unit cost<input type="number" min="0" step="any" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-xs font-medium">Discount<input type="number" min="0" step="0.01" value={lineDiscount} onChange={(event) => setLineDiscount(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <button type="button" onClick={addPurchaseLine} className="self-end rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-emerald-700">Add line</button>
          </div>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {cart.map((line) => {
              const product = products.find((candidate) => candidate.id === line.productId)
              return <li key={line.productId} className="flex items-center justify-between gap-2 py-2">
                <span>{product?.name} · {line.quantity} {product?.unit} × {line.unitCost.toFixed(2)}</span>
                <button type="button" onClick={() => setCart((previous) => previous.filter((item) => item.productId !== line.productId))} className="text-red-700">Remove</button>
              </li>
            })}
            {!cart.length && <li className="py-3 text-slate-500">Add at least one product line.</li>}
          </ul>
          <button type="submit" disabled={submitting || inventoryLoading || !cart.length || !supplierId || !warehouseId} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Saving…" : "Create purchase order"}</button>
        </form>
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(250px,.65fr)_minmax(0,1.35fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Purchase history</h2>
          {loading ? <p className="mt-3 text-sm text-slate-500">Loading purchases…</p> : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {purchases.map((purchase) => <li key={purchase.id}>
                <button type="button" onClick={() => {
                  setSelectedPurchaseId(purchase.id)
                  void loadPurchaseLines(purchase.id)
                }} className={`w-full py-3 text-left ${purchase.id === selectedPurchaseId ? "text-emerald-800 dark:text-emerald-300" : ""}`}>
                  <span className="block text-sm font-semibold">{purchase.purchase_number}</span>
                  <span className="block text-xs text-slate-500">{new Date(purchase.created_at).toLocaleString()} · {purchase.status}</span>
                  <span className="block text-xs">{purchase.currency} {Number(purchase.total).toFixed(2)}</span>
                </button>
              </li>)}
              {!purchases.length && <li className="py-4 text-sm text-slate-500">No cloud purchase orders yet.</li>}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {!selectedPurchase ? <p className="text-sm text-slate-500">Select a purchase order to inspect lines and record a goods receipt.</p> : <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">{selectedPurchase.purchase_number}</h2><p className="text-sm text-slate-500">Status: {selectedPurchase.status} · Supplier: {suppliers.find((supplier) => supplier.id === selectedPurchase.supplier_id)?.name ?? "Company supplier"}</p></div>
              <p className="text-sm font-semibold">{selectedPurchase.currency} {Number(selectedPurchase.total).toFixed(2)}</p>
            </div>
            <form onSubmit={(event) => void receivePurchase(event)} className="mt-4 space-y-3">
              {purchaseLines.map((line) => {
                const draft = receiveDrafts[line.id] ?? EMPTY_DRAFT
                const outstanding = Number(line.quantity_ordered) - Number(line.quantity_received)
                return <div key={line.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium">{line.product_name} · {line.sku || "No SKU"}</span>
                    <span>Ordered {line.quantity_ordered} · Received {line.quantity_received} · Remaining {outstanding} · Cost {selectedPurchase.currency} {Number(line.unit_cost).toFixed(2)} · VAT {Number(line.vat_rate).toFixed(2)}% ({selectedPurchase.currency} {Number(line.vat_amount).toFixed(2)}) · Line total {selectedPurchase.currency} {Number(line.line_total).toFixed(2)}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="text-xs">Receive quantity<input type="number" min="0" max={outstanding} step="any" value={draft.quantity} onChange={(event) => setReceiveDrafts((previous) => ({ ...previous, [line.id]: { ...draft, quantity: event.target.value } }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                    <label className="text-xs">Unit cost<input type="number" min="0" step="any" value={draft.unitCost} onChange={(event) => setReceiveDrafts((previous) => ({ ...previous, [line.id]: { ...draft, unitCost: event.target.value } }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                    <label className="text-xs">Lot selling price<input type="number" min="0" step="any" value={draft.sellingPrice} onChange={(event) => setReceiveDrafts((previous) => ({ ...previous, [line.id]: { ...draft, sellingPrice: event.target.value } }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                    <label className="text-xs">Batch<input value={draft.batch} onChange={(event) => setReceiveDrafts((previous) => ({ ...previous, [line.id]: { ...draft, batch: event.target.value } }))} maxLength={200} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                    <label className="text-xs">Expiry<input type="date" value={draft.expiry} onChange={(event) => setReceiveDrafts((previous) => ({ ...previous, [line.id]: { ...draft, expiry: event.target.value } }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
                  </div>
                </div>
              })}
              {purchaseLines.length === 0 && <p className="text-sm text-slate-500">Loading purchase lines…</p>}
              {selectedPurchase.status !== "received" && <button type="submit" disabled={submitting || !purchaseLines.length} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Recording receipt…" : "Receive selected quantities"}</button>}
              {selectedPurchase.status === "received" && <p className="text-sm text-emerald-700">All purchase quantities have been received.</p>}
            </form>
          </>}
        </div>
      </section>
    </section>
  )
}
