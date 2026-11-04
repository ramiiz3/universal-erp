import { useRef, useState } from "react"
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
  const [productSearch, setProductSearch] = useState("")
  const [quantity, setQuantity] = useState("1")
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
  const matchedProducts = activeProducts.filter((product) => {
    const needle = productSearch.trim().toLocaleLowerCase()
    return !needle || [product.name, product.sku, product.barcode]
      .some((value) => value.toLocaleLowerCase().includes(needle))
  }).slice(0, 8)

  function addProduct(productId = selectedProductId) {
    setError("")
    const parsedQuantity = Number(quantity)
    if (!productId || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError("Select a product and enter a quantity greater than zero.")
      return
    }
    setCart((previous) => {
      const existing = previous.find((item) => item.productId === productId)
      return existing
        ? previous.map((item) => item.productId === productId
          ? { ...item, quantity: item.quantity + parsedQuantity }
          : item)
        : [...previous, { productId, quantity: parsedQuantity }]
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
      {(inventoryError || error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || inventoryError}</p>}
      {loading ? <p className="text-sm text-slate-500">Loading active-company inventory…</p> : (
        <form onSubmit={(event) => void submitSale(event)} className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Branch
                <select required value={branchId} onChange={(event) => {
                  setSelectedBranchId(event.target.value)
                  setSelectedWarehouseId("")
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
                  setProductSearch(event.target.value)
                  const exact = activeProducts.find((product) =>
                    [product.name, product.sku, product.barcode].some((value) =>
                      value.trim().toLocaleLowerCase() === event.target.value.trim().toLocaleLowerCase(),
                    ),
                  )
                  setSelectedProductId(exact?.id ?? "")
                }} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    const match = activeProducts.find((product) => product.id === selectedProductId)
                      ?? (matchedProducts.length === 1 ? matchedProducts[0] : undefined)
                    if (match) addProduct(match.id)
                    else setError("Select a matching product before adding it.")
                  }
                }} autoComplete="off" placeholder="Scan barcode or search" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" />
                {productSearch && matchedProducts.length > 0 && <div role="listbox" className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {matchedProducts.map((product) => <button key={product.id} type="button" role="option" aria-selected={selectedProductId === product.id} onClick={() => {
                    setSelectedProductId(product.id)
                    setProductSearch(product.name)
                  }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{product.name}<span className="block text-xs text-slate-500">SKU {product.sku || "—"} · Barcode {product.barcode || "—"}</span></button>)}
                </div>}
              </label>
              <label className="text-sm font-medium">Quantity
                <input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <button type="button" onClick={() => {
                const match = activeProducts.find((product) => product.id === selectedProductId)
                  ?? (matchedProducts.length === 1 ? matchedProducts[0] : undefined)
                if (!match) {
                  setError("Select a matching product before adding it.")
                  return
                }
                addProduct(match.id)
              }} className="self-end rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">Add item</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800"><tr><th className="py-2">Product</th><th>Qty</th><th>Estimated total</th><th /></tr></thead>
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
                      <td className="py-3 font-medium">{product?.name ?? "Unavailable product"}<div className="text-xs text-slate-500">{product?.sku}</div></td>
                      <td>{item.quantity} {product?.unit}</td>
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
