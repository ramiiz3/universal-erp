import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { useCloudInventory } from "./CloudInventoryContext"
import {
  buildSaleLines,
  buildSalePayments,
  estimateFefoSale,
  type SaleCartItem,
} from "./transactions"

type SalesPackaging = {
  id: string
  product_id: string
  unit_id: string
  name: string
  base_quantity: number
  is_base: boolean
  is_sales_unit: boolean
  allow_fractional_quantity: boolean
  is_active: boolean
}
type SalesBarcode = {
  id: string
  product_id: string
  packaging_id: string
  barcode_value: string
  symbology: string
  is_active: boolean
}
type SalesUnit = { id: string; name: string; symbol: string }
type SalesPrice = {
  id: string
  product_id: string
  packaging_id: string
  price_type: string
  currency_code: string
  amount: number
  tax_inclusive: boolean
  branch_id: string | null
  valid_from: string
  valid_to: string | null
  is_active: boolean
}

const SALES_ROLES = new Set(["owner", "admin", "manager", "cashier"])
const FINANCE_ROLES = new Set(["owner", "admin"])

export default function CloudPOSPage() {
  const { activeCompany, user } = useAuth()
  const {
    companyId,
    products,
    branches,
    warehouses,
    lots,
    loading,
    error: inventoryError,
    refresh,
  } = useCloudInventory()
  const navigate = useNavigate()
  const pendingRef = useRef(false)
  const requestIdRef = useRef(crypto.randomUUID())
  const memberships = activeCompany?.memberships ?? []
  const companyScope = memberships.some((membership) => membership.branchId === null)
  const allowedBranchIds = new Set(memberships.flatMap((membership) =>
    membership.branchId ? [membership.branchId] : [],
  ))
  const accessibleBranches = companyScope
    ? branches
    : branches.filter((branch) => allowedBranchIds.has(branch.id))
  const hasSalesRole = memberships.some((membership) => SALES_ROLES.has(membership.roleKey))
  const hasFinanceRole = memberships.some((membership) => FINANCE_ROLES.has(membership.roleKey))
  const [selectedBranchId, setSelectedBranchId] = useState("")
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [selectedPackagingId, setSelectedPackagingId] = useState("")
  const [productSearch, setProductSearch] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [catalogPackages, setCatalogPackages] = useState<SalesPackaging[]>([])
  const [catalogBarcodes, setCatalogBarcodes] = useState<SalesBarcode[]>([])
  const [catalogUnits, setCatalogUnits] = useState<SalesUnit[]>([])
  const [catalogPrices, setCatalogPrices] = useState<SalesPrice[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState("")
  const [cart, setCart] = useState<SaleCartItem[]>([])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [discount, setDiscount] = useState("0")
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "other">("cash")
  const [paymentAmountOverride, setPaymentAmountOverride] = useState<string | null>(null)
  const [paymentReference, setPaymentReference] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      if (!supabase || !companyId) {
        setCatalogLoading(false)
        return
      }
      setCatalogLoading(true)
      setCatalogError("")
      const [packageResult, barcodeResult, unitResult, priceResult] = await Promise.all([
        supabase.from("product_packagings").select("*")
          .eq("company_id", companyId).eq("is_active", true).eq("is_sales_unit", true)
          .order("sort_order"),
        supabase.from("product_barcodes").select("*")
          .eq("company_id", companyId).eq("is_active", true),
        supabase.from("units_of_measure").select("id,name,symbol")
          .eq("company_id", companyId).eq("is_active", true),
        supabase.from("product_prices").select("*")
          .eq("company_id", companyId).eq("price_type", "retail").eq("is_active", true),
      ])
      if (cancelled) return
      const errors = [packageResult.error, barcodeResult.error, unitResult.error, priceResult.error].filter(Boolean)
      setCatalogError(errors.map((item) => item?.message).join("; "))
      setCatalogPackages((packageResult.data ?? []) as SalesPackaging[])
      setCatalogBarcodes((barcodeResult.data ?? []) as SalesBarcode[])
      setCatalogUnits((unitResult.data ?? []) as SalesUnit[])
      setCatalogPrices((priceResult.data ?? []) as SalesPrice[])
      setCatalogLoading(false)
    }
    void loadCatalog()
    return () => { cancelled = true }
  }, [companyId])

  const preferredBranchId = activeCompany?.branchId
    && accessibleBranches.some((branch) => branch.id === activeCompany.branchId)
    ? activeCompany.branchId
    : accessibleBranches.find((branch) =>
      warehouses.some((warehouse) => warehouse.branch_id === branch.id && warehouse.is_default),
    )?.id ?? accessibleBranches[0]?.id ?? ""
  const branchId = accessibleBranches.some((branch) => branch.id === selectedBranchId)
    ? selectedBranchId
    : preferredBranchId
  const availableWarehouses = warehouses.filter((warehouse) =>
    warehouse.branch_id === branchId
    && (companyScope || allowedBranchIds.has(warehouse.branch_id)),
  )
  const preferredWarehouseId = availableWarehouses.find((warehouse) => warehouse.is_default)?.id
    ?? availableWarehouses[0]?.id
    ?? ""
  const warehouseId = availableWarehouses.some((warehouse) => warehouse.id === selectedWarehouseId)
    ? selectedWarehouseId
    : preferredWarehouseId
  const activeProducts = products.filter((product) => product.is_active)
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId) ?? null
  const selectedProductPackages = catalogPackages.filter((pack) => pack.product_id === selectedProductId)
  const selectedPackaging = selectedProductPackages.find((pack) => pack.id === selectedPackagingId)
    ?? selectedProductPackages.find((pack) => pack.is_base)
    ?? null
  function retailPriceFor(productId: string, packagingId: string) {
    const today = new Date().toISOString().slice(0, 10)
    const selectedPrice = catalogPrices
      .filter((price) => price.product_id === productId
        && price.packaging_id === packagingId
        && price.currency_code === (activeCompany?.currency || "AED")
        && price.is_active
        && price.valid_from <= today
        && (!price.valid_to || price.valid_to >= today)
        && (price.branch_id === branchId || price.branch_id === null))
      .sort((left, right) => Number(Boolean(right.branch_id)) - Number(Boolean(left.branch_id))
        || right.valid_from.localeCompare(left.valid_from))[0]
    if (!selectedPrice) return null
    const product = activeProducts.find((item) => item.id === productId)
    const taxRate = Number(product?.vat_rate || 0) > 0
      ? Number(product?.vat_rate)
      : Number(activeCompany?.taxRate || 0)
    return selectedPrice.tax_inclusive
      ? Number(selectedPrice.amount) / (1 + taxRate / 100)
      : Number(selectedPrice.amount)
  }
  function selectProduct(productId: string, packagingId?: string) {
    const options = catalogPackages.filter((pack) => pack.product_id === productId)
    const packageChoice = options.find((pack) => pack.id === packagingId)
      ?? options.find((pack) => pack.is_base)
      ?? options[0]
    setSelectedProductId(productId)
    setSelectedPackagingId(packageChoice?.id ?? "")
    setPaymentAmountOverride(null)
  }
  const parsedDiscount = Number(discount || 0)
  const estimate = estimateFefoSale(
    activeProducts,
    lots,
    cart,
    warehouseId,
    activeCompany?.taxRate ?? 0,
    hasFinanceRole && Number.isFinite(parsedDiscount) ? parsedDiscount : 0,
  )
  const payableEstimate = estimate.total
  const paymentAmount = paymentAmountOverride ?? payableEstimate.toFixed(2)
  const normalizedSearch = productSearch.trim().toLocaleLowerCase()
  const matchedProducts = activeProducts.filter((product) => {
    return !normalizedSearch
      || [product.name, product.sku, product.barcode]
        .some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
      || catalogBarcodes.some((barcode) => barcode.product_id === product.id
        && barcode.barcode_value.toLocaleLowerCase().includes(normalizedSearch))
  }).slice(0, 8)

  function addProduct(productId = selectedProductId, packagingId = selectedPackaging?.id) {
    setError("")
    const parsedQuantity = Number(quantity)
    const product = activeProducts.find((item) => item.id === productId)
    const packaging = catalogPackages.find((item) => item.id === packagingId && item.product_id === productId)
    if (!product || !packaging || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Select a product, its packaging level, and a valid quantity.")
      return
    }
    if (!packaging.allow_fractional_quantity && parsedQuantity !== Math.trunc(parsedQuantity)) {
      setError("This packaging only allows whole quantities.")
      return
    }
    const unit = catalogUnits.find((item) => item.id === packaging.unit_id)
    const packagePrice = retailPriceFor(product.id, packaging.id)
    setCart((previous) => {
      const existing = previous.find((item) => item.productId === productId)
      if (existing && existing.packagingId !== packaging.id) {
        setError("A product can appear once per invoice. Remove its existing cart line before changing its packaging.")
        return previous
      }
      return existing
        ? previous.map((item) => item.productId === productId
          ? { ...item, quantity: item.quantity + parsedQuantity, packagePrice }
          : item)
        : [...previous, {
          productId,
          quantity: parsedQuantity,
          packagingId: packaging.id,
          packagingName: packaging.name,
          packagingUnit: unit?.symbol || unit?.name || product.unit,
          conversionFactor: Number(packaging.base_quantity),
          packagePrice,
          allowFractionalQuantity: packaging.allow_fractional_quantity,
        }]
    })
    setQuantity("1")
    setPaymentAmountOverride(null)
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRef.current) return
    pendingRef.current = true
    setSubmitting(true)
    setError("")
    try {
      if (!supabase || !activeCompany || !user) throw new Error("Cloud sales are not configured for this signed-in user.")
      if (!branchId || !warehouseId) throw new Error("Select an accessible branch and warehouse.")
      if (estimate.shortProducts.length) {
        throw new Error(`Insufficient eligible stock for: ${estimate.shortProducts.join(", ")}.`)
      }
      const lines = buildSaleLines(cart)
      const saleDiscount = hasFinanceRole ? Number(discount || 0) : 0
      if (!Number.isFinite(saleDiscount) || saleDiscount < 0 || saleDiscount > estimate.subtotal) {
        throw new Error("Discount must be a valid amount not exceeding the estimated subtotal.")
      }
      const estimatedDue = estimate.total
      const payments = buildSalePayments(
        paymentMethod,
        Number(paymentAmount || 0),
        paymentReference,
        estimatedDue,
      )
      const { data, error: rpcError } = await supabase.rpc("checkout_cloud_sale_once", {
        p_company_id: companyId,
        p_branch_id: branchId,
        p_warehouse_id: warehouseId,
        p_customer: { name: customerName.trim(), phone: customerPhone.trim(), email: customerEmail.trim() },
        p_items: lines,
        p_discount: saleDiscount,
        p_payments: payments,
        p_request_id: requestIdRef.current,
      })
      if (rpcError) throw rpcError
      const result = data as { sale_id?: string; invoice_number?: string } | null
      if (!result?.sale_id) throw new Error("The stock transaction completed without returning an invoice identifier.")
      requestIdRef.current = crypto.randomUUID()
      await refresh()
      navigate(`/workspace/invoices/${result.sale_id}`, { state: { createdInvoice: result.invoice_number } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      pendingRef.current = false
      setSubmitting(false)
    }
  }

  if (!hasSalesRole) {
    return <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">Your company role does not grant cloud sales access.</section>
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Cloud point of sale</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Checkout reserves eligible FEFO lots and records the invoice, payments, stock balance, and movement ledger in one transaction.</p>
        <Link to="/workspace/sales" className="mt-2 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400">Sales and invoices</Link>
      </header>
      {(inventoryError || catalogError || error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || inventoryError || catalogError}</p>}
      {loading || catalogLoading ? <p className="text-sm text-slate-500">Loading active-company products and packaging…</p> : (
        <form onSubmit={(event) => void submitSale(event)} className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Branch
                <select required value={branchId} onChange={(event) => {
                  setSelectedBranchId(event.target.value)
                  setSelectedWarehouseId("")
                  setCart([])
                  setPaymentAmountOverride(null)
                }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Select branch</option>
                  {accessibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Stock warehouse
                <select required value={warehouseId} onChange={(event) => {
                  setSelectedWarehouseId(event.target.value)
                  setPaymentAmountOverride(null)
                }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Select warehouse</option>
                  {availableWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.is_default ? " (default)" : ""}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
              <label className="relative text-sm font-medium">Product, SKU, or barcode
                <input value={productSearch} onChange={(event) => {
                  const value = event.target.value
                  const needle = value.trim().toLocaleLowerCase()
                  setProductSearch(value)
                  const barcode = catalogBarcodes.find((item) => item.barcode_value.trim().toLocaleLowerCase() === needle)
                  if (barcode) {
                    selectProduct(barcode.product_id, barcode.packaging_id)
                    return
                  }
                  const exact = activeProducts.find((product) =>
                    [product.name, product.sku, product.barcode].some((item) =>
                      item.trim().toLocaleLowerCase() === needle,
                    ),
                  )
                  if (exact) selectProduct(exact.id)
                  else setSelectedProductId("")
                }} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    const barcode = catalogBarcodes.find((item) => item.barcode_value.trim().toLocaleLowerCase() === normalizedSearch)
                    const product = activeProducts.find((item) => item.id === (barcode?.product_id ?? selectedProductId))
                      ?? (matchedProducts.length === 1 ? matchedProducts[0] : undefined)
                    if (product) addProduct(product.id, barcode?.packaging_id ?? selectedPackaging?.id)
                    else setError("Select a matching product or scan a known barcode before adding it.")
                  }
                }} autoComplete="off" placeholder="Scan product, box, strip or unit barcode" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" />
                {productSearch && matchedProducts.length > 0 && <div role="listbox" className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {matchedProducts.map((product) => <button key={product.id} type="button" role="option" aria-selected={selectedProductId === product.id} onClick={() => {
                    selectProduct(product.id)
                    setProductSearch(product.name)
                  }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{product.name}<span className="block text-xs text-slate-500">SKU {product.sku || "—"} · {catalogBarcodes.filter((barcode) => barcode.product_id === product.id).length} package barcode(s)</span></button>)}
                </div>}
              </label>
              <label className="text-sm font-medium">Packaging
                <select value={selectedPackaging?.id ?? ""} onChange={(event) => setSelectedPackagingId(event.target.value)} disabled={!selectedProduct} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Select pack</option>
                  {selectedProductPackages.map((pack) => {
                    const unit = catalogUnits.find((item) => item.id === pack.unit_id)
                    return <option key={pack.id} value={pack.id}>{pack.name} · 1 = {Number(pack.base_quantity)} {selectedProduct?.unit} ({unit?.symbol || unit?.name || ""})</option>
                  })}
                </select>
              </label>
              <label className="text-sm font-medium">Quantity
                <input type="number" min="0.000001" step={selectedPackaging?.allow_fractional_quantity ? "any" : "1"} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <button type="button" onClick={() => {
                const match = activeProducts.find((product) => product.id === selectedProductId)
                  ?? (matchedProducts.length === 1 ? matchedProducts[0] : undefined)
                if (!match) {
                  setError("Select a matching product before adding it.")
                  return
                }
                addProduct(match.id)
              }} disabled={!selectedPackaging || catalogLoading} className="self-end rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700">Add item</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800"><tr><th className="py-2">Product / packaging</th><th>Qty</th><th>Estimated total</th><th /></tr></thead>
                <tbody>
                  {cart.map((item) => {
                    const product = activeProducts.find((candidate) => candidate.id === item.productId)
                    const itemEstimate = estimateFefoSale(
                      activeProducts,
                      lots,
                      [item],
                      warehouseId,
                      activeCompany?.taxRate ?? 0,
                    )
                    return <tr key={item.productId} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-3 font-medium">{product?.name ?? "Unavailable product"}<div className="text-xs text-slate-500">{item.packagingName || product?.unit} · {item.packagingUnit || product?.unit} · {Number(item.conversionFactor ?? 1)} base units per pack · {product?.sku}</div></td>
                      <td>{item.quantity} {item.packagingName} <span className="block text-xs text-slate-500">{Number(item.quantity * (item.conversionFactor ?? 1))} {product?.unit}</span></td>
                      <td>{itemEstimate.shortProducts.length ? "Stock short" : `${activeCompany?.currency ?? ""} ${itemEstimate.total.toFixed(2)}`}</td>
                      <td className="text-right"><button type="button" onClick={() => {
                        setCart((items) => items.filter((line) => line.productId !== item.productId))
                        setPaymentAmountOverride(null)
                      }} className="text-sm text-red-700">Remove</button></td>
                    </tr>
                  })}
                  {!cart.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Add products to start a sale.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Displayed amount is an estimate from current lot prices. The server selects FEFO lots and calculates final totals at checkout.</p>
          </div>
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Customer and payment</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="text-sm">Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={200} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-sm">Phone<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={100} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-sm sm:col-span-2 xl:col-span-1">Email<input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} maxLength={254} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              {hasFinanceRole && <label className="text-sm sm:col-span-2 xl:col-span-1">Invoice discount<input type="number" min="0" step="0.01" value={discount} onChange={(event) => {
                setDiscount(event.target.value)
                setPaymentAmountOverride(null)
              }} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>}
              <label className="text-sm">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
              <label className="text-sm">Amount received<input type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmountOverride(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-sm sm:col-span-2 xl:col-span-1">Payment reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={200} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
            </div>
            <dl className="space-y-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
              <div className="flex justify-between"><dt>Estimated subtotal</dt><dd>{activeCompany?.currency} {estimate.subtotal.toFixed(2)}</dd></div>
              <div className="flex justify-between"><dt>Estimated VAT</dt><dd>{activeCompany?.currency} {estimate.vat.toFixed(2)}</dd></div>
              {hasFinanceRole && <div className="flex justify-between"><dt>Discount</dt><dd>{activeCompany?.currency} {Math.max(0, parsedDiscount || 0).toFixed(2)}</dd></div>}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold dark:border-slate-800"><dt>Estimated due</dt><dd>{activeCompany?.currency} {payableEstimate.toFixed(2)}</dd></div>
            </dl>
            <button type="submit" disabled={submitting || loading || cart.length === 0 || !warehouseId || !hasSalesRole} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {submitting ? "Committing sale…" : "Complete cloud sale"}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
