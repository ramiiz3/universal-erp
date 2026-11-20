import { useCallback, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { useCloudInventory, type CloudProduct } from "./CloudInventoryContext"

type Category = {
  id: string
  company_id: string
  parent_id: string | null
  name: string
  code: string
  is_active: boolean
}
type Unit = {
  id: string
  company_id: string
  code: string
  name: string
  symbol: string
  dimension: string
  allow_fractional: boolean
  decimal_places: number
  is_system: boolean
  is_active: boolean
}
type Packaging = {
  id: string
  product_id: string
  unit_id: string
  name: string
  base_quantity: number
  is_base: boolean
  is_purchase_unit: boolean
  is_sales_unit: boolean
  allow_fractional_quantity: boolean
  is_active: boolean
}
type Barcode = {
  id: string
  packaging_id: string
  barcode_value: string
  symbology: string
  barcode_kind: string
  is_primary: boolean
  is_active: boolean
}
type Price = {
  id: string
  packaging_id: string
  price_type: string
  currency_code: string
  amount: number
  tax_inclusive: boolean
  valid_from: string
  is_active: boolean
}

const DIMENSIONS = ["count", "mass", "volume", "length", "area", "time", "service", "custom"]
const SYMBOLOGIES = ["EAN13", "EAN8", "UPCA", "UPCE", "CODE128", "QR", "DATAMATRIX", "GS1_128", "OTHER"]
const PRICE_TYPES = [
  { value: "purchase", label: "Purchase" },
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
  { value: "minimum_selling", label: "Minimum selling" },
]

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "unit"
}

function internalBarcode() {
  const values = new Uint32Array(2)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(values)
  else {
    values[0] = Date.now() >>> 0
    values[1] = Math.floor(Math.random() * 0xffffffff)
  }
  return `INT${values[0].toString(36).toUpperCase()}${values[1].toString(36).toUpperCase()}`
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: currency || "AED",
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

export default function ProductCatalogPage() {
  const { activeCompany, user, memberships } = useAuth()
  const { companyId, products, refresh } = useCloudInventory()
  const [selectedProductId, setSelectedProductId] = useState("")
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [packagings, setPackagings] = useState<Packaging[]>([])
  const [barcodes, setBarcodes] = useState<Barcode[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [categoryName, setCategoryName] = useState("")
  const [parentCategoryId, setParentCategoryId] = useState("")
  const [unitName, setUnitName] = useState("")
  const [unitSymbol, setUnitSymbol] = useState("")
  const [unitDimension, setUnitDimension] = useState("count")
  const [allowFractional, setAllowFractional] = useState(false)

  const [packName, setPackName] = useState("")
  const [packUnitId, setPackUnitId] = useState("")
  const [packFactor, setPackFactor] = useState("10")
  const [packPurchase, setPackPurchase] = useState(true)
  const [packSales, setPackSales] = useState(true)
  const [barcodePackId, setBarcodePackId] = useState("")
  const [barcodeValue, setBarcodeValue] = useState("")
  const [barcodeSymbology, setBarcodeSymbology] = useState("CODE128")
  const [barcodeKind, setBarcodeKind] = useState("internal")
  const [pricePackId, setPricePackId] = useState("")
  const [priceType, setPriceType] = useState("retail")
  const [priceAmount, setPriceAmount] = useState("")
  const [priceInclusive, setPriceInclusive] = useState(false)

  const canManage = memberships.some((membership) =>
    membership.companyId === companyId &&
    membership.branchId === null &&
    ["owner", "admin", "manager", "inventory_manager"].includes(membership.roleKey),
  )
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null
  const parentCategories = useMemo(() => categories.filter((item) => item.is_active && !item.parent_id), [categories])
  const selectedPackaging = packagings.find((item) => item.id === barcodePackId) ?? null

  const loadProductCatalog = useCallback(async () => {
    if (!supabase || !companyId) return
    setLoading(true)
    setError("")
    const [categoryResult, unitResult] = await Promise.all([
      supabase.from("product_categories").select("*").eq("company_id", companyId).order("name"),
      supabase.from("units_of_measure").select("*").eq("company_id", companyId).order("name"),
    ])
    if (categoryResult.error || unitResult.error) {
      setError(categoryResult.error?.message || unitResult.error?.message || "Catalog setup could not be loaded.")
      setLoading(false)
      return
    }
    setCategories((categoryResult.data ?? []) as Category[])
    setUnits((unitResult.data ?? []) as Unit[])
    if (selectedProductId) {
      const [packResult, barcodeResult, priceResult] = await Promise.all([
        supabase.from("product_packagings").select("*").eq("company_id", companyId)
          .eq("product_id", selectedProductId).order("sort_order").order("created_at"),
        supabase.from("product_barcodes").select("*").eq("company_id", companyId)
          .eq("product_id", selectedProductId).order("created_at", { ascending: false }),
        supabase.from("product_prices").select("*").eq("company_id", companyId)
          .eq("product_id", selectedProductId).order("valid_from", { ascending: false }),
      ])
      const queryError = packResult.error || barcodeResult.error || priceResult.error
      if (queryError) setError(queryError.message)
      setPackagings((packResult.data ?? []) as Packaging[])
      setBarcodes((barcodeResult.data ?? []) as Barcode[])
      setPrices((priceResult.data ?? []) as Price[])
    } else {
      setPackagings([])
      setBarcodes([])
      setPrices([])
    }
    setLoading(false)
  }, [companyId, selectedProductId])

  useEffect(() => { void loadProductCatalog() }, [loadProductCatalog])

  function notifyError(caught: unknown) {
    setError(caught instanceof Error ? caught.message : String(caught))
  }

  async function perform(action: () => Promise<void>, success: string) {
    if (!canManage || !user || !supabase) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      await action()
      await loadProductCatalog()
      await refresh()
      setMessage(success)
    } catch (caught) {
      notifyError(caught)
    } finally {
      setSaving(false)
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = categoryName.trim()
    if (!name || !supabase || !user) return
    await perform(async () => {
      const { error: insertError } = await supabase!.from("product_categories").insert({
        company_id: companyId,
        parent_id: parentCategoryId || null,
        name,
        code: slug(name),
        created_by: user!.id,
      })
      if (insertError) throw insertError
      setCategoryName("")
      setParentCategoryId("")
    }, "Category added.")
  }

  async function addUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = unitName.trim()
    if (!name || !supabase || !user) return
    await perform(async () => {
      const code = slug(name)
      const { error: insertError } = await supabase!.from("units_of_measure").insert({
        company_id: companyId,
        code,
        name,
        symbol: unitSymbol.trim() || name,
        dimension: unitDimension,
        allow_fractional: allowFractional,
        decimal_places: allowFractional ? 6 : 0,
        created_by: user!.id,
      })
      if (insertError) throw insertError
      setUnitName("")
      setUnitSymbol("")
    }, "Unit added.")
  }

  async function toggleCategory(category: Category) {
    if (!supabase) return
    await perform(async () => {
      const { error: updateError } = await supabase!.from("product_categories")
        .update({ is_active: !category.is_active })
        .eq("company_id", companyId)
        .eq("id", category.id)
      if (updateError) throw updateError
    }, category.is_active ? "Category archived." : "Category reactivated.")
  }

  async function toggleUnit(unit: Unit) {
    if (!supabase) return
    await perform(async () => {
      const { error: updateError } = await supabase!.from("units_of_measure")
        .update({ is_active: !unit.is_active })
        .eq("company_id", companyId)
        .eq("id", unit.id)
      if (updateError) throw updateError
    }, unit.is_active ? "Unit archived." : "Unit reactivated.")
  }

  async function setProductCategory(categoryId: string) {
    if (!selectedProduct || !supabase) return
    await perform(async () => {
      const category = categories.find((item) => item.id === categoryId)
      const { error: updateError } = await supabase!.from("products")
        .update({ category: category?.name ?? "", category_id: category?.id ?? null })
        .eq("company_id", companyId)
        .eq("id", selectedProduct.id)
      if (updateError) throw updateError
    }, "Product category updated.")
  }

  async function addPackaging(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProduct || !packUnitId || !supabase || !user) return
    const factor = Number(packFactor)
    if (!Number.isFinite(factor) || factor <= 1) {
      setError("Packaging conversion must be greater than one base unit.")
      return
    }
    const selectedUnit = units.find((item) => item.id === packUnitId)
    if (!selectedUnit) {
      setError("Select a valid packaging unit.")
      return
    }
    await perform(async () => {
      const { error: insertError } = await supabase!.from("product_packagings").insert({
        company_id: companyId,
        product_id: selectedProduct.id,
        unit_id: selectedUnit.id,
        name: packName.trim() || selectedUnit.name,
        base_quantity: factor,
        is_base: false,
        is_purchase_unit: packPurchase,
        is_sales_unit: packSales,
        allow_fractional_quantity: false,
        created_by: user!.id,
      })
      if (insertError) throw insertError
      setPackName("")
      setPackFactor("10")
      setPackUnitId("")
    }, "Packaging level added.")
  }

  async function addBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProduct || !barcodePackId || !supabase || !user) return
    const value = barcodeValue.trim() || internalBarcode()
    await perform(async () => {
      const isPrimary = !barcodes.some((item) => item.packaging_id === barcodePackId && item.is_primary && item.is_active)
      const { error: insertError } = await supabase!.from("product_barcodes").insert({
        company_id: companyId,
        product_id: selectedProduct.id,
        packaging_id: barcodePackId,
        barcode_value: value,
        symbology: barcodeSymbology,
        barcode_kind: barcodeKind,
        is_primary: isPrimary,
        created_by: user!.id,
      })
      if (insertError) throw insertError
      setBarcodeValue("")
    }, "Barcode saved.")
  }

  async function addPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProduct || !pricePackId || !supabase || !user) return
    const amount = Number(priceAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid price.")
      return
    }
    await perform(async () => {
      const oldPrices = prices.filter((item) =>
        item.packaging_id === pricePackId && item.price_type === priceType &&
        item.currency_code === (activeCompany?.currency || "AED") && item.is_active,
      )
      if (oldPrices.length) {
        const { error: closeError } = await supabase!.from("product_prices")
          .update({ is_active: false, valid_to: new Date().toISOString().slice(0, 10) })
          .in("id", oldPrices.map((item) => item.id))
        if (closeError) throw closeError
      }
      const { error: insertError } = await supabase!.from("product_prices").insert({
        company_id: companyId,
        product_id: selectedProduct.id,
        packaging_id: pricePackId,
        price_type: priceType,
        currency_code: activeCompany?.currency || "AED",
        amount,
        tax_inclusive: priceInclusive,
        valid_from: new Date().toISOString().slice(0, 10),
        created_by: user!.id,
      })
      if (insertError) throw insertError
      setPriceAmount("")
    }, "Packaging price saved.")
  }

  async function archiveBarcode(barcode: Barcode) {
    if (!supabase) return
    await perform(async () => {
      const { error: updateError } = await supabase!.from("product_barcodes")
        .update({ is_active: false, is_primary: false })
        .eq("company_id", companyId)
        .eq("id", barcode.id)
      if (updateError) throw updateError
    }, "Barcode archived.")
  }

  async function archivePackaging(packaging: Packaging) {
    if (!supabase) return
    if (packaging.is_base) {
      setError("The base packaging cannot be archived.")
      return
    }
    await perform(async () => {
      const { error: updateError } = await supabase!.from("product_packagings")
        .update({ is_active: false })
        .eq("company_id", companyId)
        .eq("id", packaging.id)
      if (updateError) throw updateError
    }, "Packaging archived. Historical transactions are retained.")
  }

  const categoryForProduct = selectedProduct
    ? categories.find((item) => item.id === (selectedProduct as CloudProduct & { category_id?: string }).category_id)?.id
      ?? categories.find((item) => item.name.toLowerCase() === selectedProduct.category.toLowerCase())?.id
      ?? ""
    : ""

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Product catalog setup</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Manage categories, measurement units, product packaging, barcodes and package prices for {activeCompany?.companyName}.
        </p>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {!canManage && <p className="rounded-lg border p-3 text-sm">You have read-only access to product catalog setup.</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Categories and subcategories</h2>
          <form onSubmit={(event) => void addCategory(event)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" required className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            <select value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)} className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="">Top-level category</option>
              {parentCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button disabled={!canManage || saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Add</button>
          </form>
          <div className="mt-3 max-h-56 space-y-2 overflow-auto text-sm">
            {categories.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <span>{item.parent_id ? "↳ " : ""}{item.name} <span className="text-xs text-slate-500">{item.is_active ? "Active" : "Archived"}</span></span>
                {canManage && <button type="button" disabled={saving} onClick={() => void toggleCategory(item)} className="shrink-0 text-xs font-medium text-emerald-800 disabled:opacity-50 dark:text-emerald-300">{item.is_active ? "Archive" : "Restore"}</button>}
              </div>
            ))}
            {!categories.length && <p className="text-slate-500">No categories created yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Units of measure</h2>
          <form onSubmit={(event) => void addUnit(event)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Unit name (e.g. strip)" required className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            <input value={unitSymbol} onChange={(event) => setUnitSymbol(event.target.value)} placeholder="Symbol (optional)" className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            <select value={unitDimension} onChange={(event) => setUnitDimension(event.target.value)} className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
              {DIMENSIONS.map((dimension) => <option key={dimension} value={dimension}>{dimension}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowFractional} onChange={(event) => setAllowFractional(event.target.checked)} /> Allow fractional quantity</label>
            <button disabled={!canManage || saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">Add unit</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {units.map((unit) => (
              <span key={unit.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">
                {unit.name} · {unit.dimension}{!unit.is_active ? " · Archived" : ""}
                {canManage && <button type="button" disabled={saving || unit.is_system} onClick={() => void toggleUnit(unit)} className="font-semibold text-emerald-800 disabled:opacity-40 dark:text-emerald-300">{unit.is_active ? "Archive" : "Restore"}</button>}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Product packaging and barcodes</h2>
            <p className="text-xs text-slate-500">Stock stays in the product's existing base unit. Each package converts directly to that unit.</p>
          </div>
          <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="h-10 min-w-64 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Select a product</option>
            {products.filter((item) => item.is_active).map((product) => <option key={product.id} value={product.id}>{product.name} {product.sku ? `· ${product.sku}` : ""}</option>)}
          </select>
        </div>
        {selectedProduct && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <label className="text-xs font-semibold uppercase text-slate-500">Category</label>
                <select value={categoryForProduct} onChange={(event) => { void setProductCategory(event.target.value) }} disabled={!canManage || saving} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Uncategorized</option>
                  {categories.filter((item) => item.is_active || item.id === categoryForProduct).map((item) => <option key={item.id} value={item.id}>{item.parent_id ? "— " : ""}{item.name}{item.is_active ? "" : " (Archived)"}</option>)}
                </select>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <div className="text-xs font-semibold uppercase text-slate-500">Base inventory unit</div>
                <div className="mt-2 font-medium">{selectedProduct.unit}</div>
                <div className="text-xs text-slate-500">Current stock balances are not recalculated by catalog setup.</div>
              </div>
            </div>

            <form onSubmit={(event) => void addPackaging(event)} className="rounded-lg border p-3 dark:border-slate-700">
              <h3 className="text-sm font-semibold">Add packaging level</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <input value={packName} onChange={(event) => setPackName(event.target.value)} placeholder="Display name (e.g. Box of 10)" className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
                <select required value={packUnitId} onChange={(event) => setPackUnitId(event.target.value)} className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Unit type</option>
                  {units.filter((unit) => unit.is_active).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
                <input required type="number" min="1.000001" step="any" value={packFactor} onChange={(event) => setPackFactor(event.target.value)} placeholder="Base units per pack" className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={packPurchase} onChange={(event) => setPackPurchase(event.target.checked)} /> Purchase unit</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={packSales} onChange={(event) => setPackSales(event.target.checked)} /> Sales unit</label>
                <button disabled={!canManage || saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-5">Add packaging</button>
              </div>
            </form>

            <div className="overflow-x-auto rounded-lg border dark:border-slate-700">
              <table className="w-full min-w-[660px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-3">Packaging</th><th className="p-3">Conversion</th><th className="p-3">Use</th><th className="p-3">Barcodes</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
                <tbody>
                  {packagings.map((pack) => {
                    const unitName = units.find((unit) => unit.id === pack.unit_id)?.name ?? selectedProduct.unit
                    const codes = barcodes.filter((item) => item.packaging_id === pack.id && item.is_active)
                    return <tr key={pack.id} className="border-t dark:border-slate-800">
                      <td className="p-3 font-medium">{pack.name}{pack.is_base && <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">BASE</span>}<div className="text-xs text-slate-500">{unitName}</div></td>
                      <td className="p-3">1 {unitName} = {Number(pack.base_quantity)} {selectedProduct.unit}</td>
                      <td className="p-3">{pack.is_purchase_unit ? "Purchase " : ""}{pack.is_sales_unit ? "Sale" : ""}</td>
                      <td className="p-3">{codes.length}</td>
                      <td className="p-3">{pack.is_active ? "Active" : "Archived"}</td>
                      <td className="p-3">{!pack.is_base && pack.is_active && <button type="button" disabled={!canManage || saving} onClick={() => void archivePackaging(pack)} className="text-xs font-medium text-rose-700">Archive</button>}</td>
                    </tr>
                  })}
                  {!packagings.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No packaging records found. Check that the catalog migration has been applied.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <form onSubmit={(event) => void addBarcode(event)} className="rounded-lg border p-3 dark:border-slate-700">
                <h3 className="text-sm font-semibold">Add barcode</h3>
                <div className="mt-2 space-y-2">
                  <select required value={barcodePackId} onChange={(event) => setBarcodePackId(event.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="">Select packaging</option>{packagings.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <div className="flex gap-2"><input value={barcodeValue} onChange={(event) => setBarcodeValue(event.target.value)} placeholder="Scan or enter barcode (blank = internal code)" className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /><button type="button" onClick={() => setBarcodeValue(internalBarcode())} className="rounded-lg border px-3 text-xs">Generate</button></div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={barcodeSymbology} onChange={(event) => setBarcodeSymbology(event.target.value)} className="h-10 rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-950">{SYMBOLOGIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                    <select value={barcodeKind} onChange={(event) => setBarcodeKind(event.target.value)} className="h-10 rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="internal">Internal</option><option value="manufacturer_gtin">Manufacturer GTIN</option><option value="supplier">Supplier</option><option value="other">Other</option></select>
                  </div>
                  <button disabled={!canManage || saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save barcode</button>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {barcodes.map((code) => <div key={code.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 p-2 dark:bg-slate-800"><span className="min-w-0 break-all">{code.barcode_value} · {packagings.find((item) => item.id === code.packaging_id)?.name} · {code.barcode_kind}{code.is_primary ? " · Primary" : ""}{!code.is_active ? " · Archived" : ""}</span>{code.is_active && <button type="button" disabled={!canManage || saving} onClick={() => void archiveBarcode(code)} className="shrink-0 text-rose-700">Archive</button>}</div>)}
                </div>
                {selectedPackaging && <p className="mt-2 text-xs text-slate-500">Selected barcode unit: {selectedPackaging.name}</p>}
              </form>

              <form onSubmit={(event) => void addPrice(event)} className="rounded-lg border p-3 dark:border-slate-700">
                <h3 className="text-sm font-semibold">Set packaging price</h3>
                <div className="mt-2 space-y-2">
                  <select required value={pricePackId} onChange={(event) => setPricePackId(event.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="">Select packaging</option>{packagings.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={priceType} onChange={(event) => setPriceType(event.target.value)} className="h-10 rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-950">{PRICE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                    <input required type="number" min="0" step="0.01" value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} placeholder={`Price (${activeCompany?.currency || "AED"})`} className="h-10 rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
                  </div>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={priceInclusive} onChange={(event) => setPriceInclusive(event.target.checked)} /> Price includes VAT</label>
                  <button disabled={!canManage || saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save price</button>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {prices.map((price) => <div key={price.id} className="flex justify-between gap-2 rounded bg-slate-50 p-2 dark:bg-slate-800"><span>{packagings.find((item) => item.id === price.packaging_id)?.name} · {price.price_type} · {price.currency_code}</span><span className="font-semibold">{money(price.amount, price.currency_code)} {price.is_active ? "" : "(historical)"}</span></div>)}
                </div>
              </form>
            </div>
          </div>
        )}
        {!selectedProductId && <p className="mt-5 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-800">Choose a product to manage its category, packaging, barcode values and prices.</p>}
        {loading && <p className="mt-3 text-xs text-slate-500">Loading catalog details…</p>}
      </section>
    </section>
  )
}
