import { useCallback, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { useAuth } from "../auth/AuthProvider"
import { Barcode as BarcodeIcon } from "lucide-react"
import BarcodePreview from "../components/BarcodePreview"
import { generateCompanyProductBarcode } from "../lib/productBarcode"
import { supabase } from "../lib/supabase"
import { useCloudInventory } from "./CloudInventoryContext"

type Category = {
  id: string
  company_id: string
  parent_id: string | null
  name: string
  code: string
  description: string
  is_active: boolean
}

type Unit = {
  id: string
  company_id: string
  name: string
  symbol: string
  unit_type: string
  factor_to_base: number
  is_active: boolean
}

type Packaging = {
  id: string
  company_id: string
  product_id: string
  name: string
  base_quantity: number
  is_base_unit: boolean
  allow_fractional: boolean
  is_purchase_enabled: boolean
  is_sale_enabled: boolean
  is_active: boolean
  sort_order: number
}

type ProductBarcode = {
  id: string
  product_id: string
  packaging_id: string
  barcode: string
  barcode_type: string
  is_primary: boolean
}

type ProductPrice = {
  id: string
  product_id: string
  packaging_id: string
  branch_id: string | null
  price_type: "purchase" | "selling"
  amount: number
  currency: string
  effective_from: string
  effective_to: string | null
}

type LooseDatabase = {
  from: (table: string) => any
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown
    error: { message: string } | null
  }>
}

const UNIT_TYPES = ["count", "mass", "volume", "length", "area", "time", "other"]
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "qr", "internal", "other"]
const PACKAGING_OPTIONS = [
  "Piece", "Tablet", "Capsule", "Sachet", "Strip", "Blister",
  "Bottle", "Vial", "Ampoule", "Tube", "Pack", "Box", "Carton",
  "Case", "Bag", "Pouch", "Jar", "Can", "Roll", "Pair", "Dozen",
  "Set", "Bundle",
]
const inputClass = "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
const buttonClass = "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"

export default function ProductCatalogPage() {
  const { activeCompany, memberships, user } = useAuth()
  const { companyId, products, branches, lots, refresh: refreshInventory } = useCloudInventory()
  const db = supabase as unknown as LooseDatabase | null
  const canManage = memberships.some((membership) =>
    membership.companyId === companyId
      && membership.branchId === null
      && ["owner", "admin", "manager", "inventory_manager"].includes(membership.roleKey),
  )

  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [packagings, setPackagings] = useState<Packaging[]>([])
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([])
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [categoryName, setCategoryName] = useState("")
  const [categoryCode, setCategoryCode] = useState("")
  const [parentCategoryId, setParentCategoryId] = useState("")
  const [unitName, setUnitName] = useState("")
  const [unitSymbol, setUnitSymbol] = useState("")
  const [unitType, setUnitType] = useState("other")
  const [unitFactor, setUnitFactor] = useState("1")
  const [packageType, setPackageType] = useState("")
  const [customPackageName, setCustomPackageName] = useState("")
  const [packageFactor, setPackageFactor] = useState("1")
  const [packageFractional, setPackageFractional] = useState(false)
  const [packagePurchaseEnabled, setPackagePurchaseEnabled] = useState(true)
  const [packageSaleEnabled, setPackageSaleEnabled] = useState(true)
  const [barcodePackageId, setBarcodePackageId] = useState("")
  const [barcodeValue, setBarcodeValue] = useState("")
  const [barcodeType, setBarcodeType] = useState("code128")
  const [barcodePrimary, setBarcodePrimary] = useState(false)
  const [pricePackageId, setPricePackageId] = useState("")
  const [priceType, setPriceType] = useState<"purchase" | "selling">("selling")
  const [priceAmount, setPriceAmount] = useState("")
  const [priceBranchId, setPriceBranchId] = useState("")

  const activeProducts = useMemo(() => products.filter((product) => product.is_active), [products])
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId) ?? activeProducts[0] ?? null
  const productPackages = packagings.filter((packaging) => packaging.product_id === selectedProduct?.id)
  const productBarcodes = barcodes.filter((barcode) => barcode.product_id === selectedProduct?.id)
  const productPrices = prices.filter((price) => price.product_id === selectedProduct?.id)
  const categoryOptions = categories.filter((category) => category.is_active && category.parent_id === null)

  const refreshCatalog = useCallback(async () => {
    if (!db || !companyId) {
      setLoading(false)
      setError("Catalog is unavailable until an active company and Supabase connection are ready.")
      return
    }
    setLoading(true)
    setError("")
    const [categoryResult, unitResult, packagingResult, barcodeResult, priceResult] = await Promise.all([
      db.from("product_categories").select("*").eq("company_id", companyId).order("name"),
      db.from("units_of_measure").select("*").eq("company_id", companyId).order("name"),
      db.from("product_packagings").select("*").eq("company_id", companyId).order("sort_order").order("name"),
      db.from("product_barcodes").select("*").eq("company_id", companyId).order("barcode"),
      db.from("product_prices").select("*").eq("company_id", companyId).order("effective_from", { ascending: false }),
    ])
    const failures = [categoryResult, unitResult, packagingResult, barcodeResult, priceResult]
      .filter((result) => result.error)
      .map((result) => result.error.message)
    if (failures.length) setError(failures.join("; "))
    setCategories((categoryResult.data ?? []) as Category[])
    setUnits((unitResult.data ?? []) as Unit[])
    setPackagings((packagingResult.data ?? []) as Packaging[])
    setBarcodes((barcodeResult.data ?? []) as ProductBarcode[])
    setPrices((priceResult.data ?? []) as ProductPrice[])
    setLoading(false)
  }, [companyId, db])

  useEffect(() => {
    void refreshCatalog()
  }, [refreshCatalog])

  useEffect(() => {
    if (!selectedProductId && activeProducts.length) setSelectedProductId(activeProducts[0].id)
    if (selectedProductId && !activeProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(activeProducts[0]?.id ?? "")
    }
  }, [activeProducts, selectedProductId])

  useEffect(() => {
    const firstPackageId = productPackages.find((packaging) => packaging.is_base_unit)?.id
      ?? productPackages[0]?.id
      ?? ""
    if (firstPackageId) {
      setBarcodePackageId((current) => productPackages.some((packaging) => packaging.id === current) ? current : firstPackageId)
      setPricePackageId((current) => productPackages.some((packaging) => packaging.id === current) ? current : firstPackageId)
    } else {
      setBarcodePackageId("")
      setPricePackageId("")
    }
  }, [productPackages])

  async function completeMutation(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    if (saving) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const result = await action()
      if (result.error) throw new Error(result.error.message)
      setMessage(success)
      await refreshCatalog()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!db || !user) return
    const name = categoryName.trim()
    if (!name) return
    await completeMutation(() => db.from("product_categories").insert({
      company_id: companyId,
      parent_id: parentCategoryId || null,
      name,
      code: categoryCode.trim(),
      created_by: user.id,
    }), "Category created.")
    setCategoryName("")
    setCategoryCode("")
    setParentCategoryId("")
  }

  async function createUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!db || !user) return
    const factor = Number(unitFactor)
    if (!Number.isFinite(factor) || factor <= 0) {
      setError("Unit conversion factor must be greater than zero.")
      return
    }
    await completeMutation(() => db.from("units_of_measure").insert({
      company_id: companyId,
      name: unitName.trim(),
      symbol: unitSymbol.trim(),
      unit_type: unitType,
      factor_to_base: factor,
      created_by: user.id,
    }), "Unit created.")
    setUnitName("")
    setUnitSymbol("")
    setUnitType("other")
    setUnitFactor("1")
  }

  async function createPackaging(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!db || !user || !selectedProduct) return
    const factor = Number(packageFactor)
    const resolvedPackageName = packageType === "__custom__"
      ? customPackageName.trim()
      : packageType.trim()
    if (!resolvedPackageName) {
      setError("Select a packaging type or enter a custom package name.")
      return
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      setError("Package conversion must be greater than zero.")
      return
    }
    await completeMutation(() => db.from("product_packagings").insert({
      company_id: companyId,
      product_id: selectedProduct.id,
      name: resolvedPackageName,
      base_quantity: factor,
      is_base_unit: false,
      allow_fractional: packageFractional,
      is_purchase_enabled: packagePurchaseEnabled,
      is_sale_enabled: packageSaleEnabled,
      sort_order: productPackages.length + 1,
      created_by: user.id,
    }), "Packaging level created.")
    setPackageType("")
    setCustomPackageName("")
    setPackageFactor("1")
    setPackageFractional(false)
    setPackagePurchaseEnabled(true)
    setPackageSaleEnabled(true)
  }

  async function createBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!db || !user || !selectedProduct || !barcodePackageId) return
    await completeMutation(() => db.from("product_barcodes").insert({
      company_id: companyId,
      product_id: selectedProduct.id,
      packaging_id: barcodePackageId,
      barcode: barcodeValue.trim(),
      barcode_type: barcodeType,
      is_primary: barcodePrimary,
      created_by: user.id,
    }), "Barcode added.")
    setBarcodeValue("")
    setBarcodePrimary(false)
  }

  async function createPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!db || !selectedProduct || !pricePackageId) return
    const amount = Number(priceAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Price must be zero or greater.")
      return
    }
    if (saving) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const result = await db.rpc("set_product_price", {
        p_company_id: companyId,
        p_product_id: selectedProduct.id,
        p_packaging_id: pricePackageId,
        p_branch_id: priceBranchId || null,
        p_price_type: priceType,
        p_amount: amount,
        p_currency: activeCompany?.currency || "AED",
      })
      if (result.error) throw new Error(result.error.message)
      setMessage("Price saved. Previous price history was retained.")
      setPriceAmount("")
      await refreshCatalog()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  async function setActive(table: string, id: string, isActive: boolean, label: string) {
    if (!db) return
    await completeMutation(() => db.from(table).update({ is_active: isActive }).eq("company_id", companyId).eq("id", id), `${label} ${isActive ? "reactivated" : "archived"}.`)
  }

  async function removeBarcode(id: string) {
    if (!db) return
    await completeMutation(() => db.from("product_barcodes").delete().eq("company_id", companyId).eq("id", id), "Barcode removed.")
  }

  async function assignCategory(categoryId: string) {
    if (!db || !selectedProduct) return
    const category = categories.find((item) => item.id === categoryId)
    await completeMutation(() => db.from("products").update({
      category_id: categoryId || null,
      category: category?.name ?? "",
    }).eq("company_id", companyId).eq("id", selectedProduct.id), "Product category updated.")
    await refreshInventory()
  }

  const productStock = selectedProduct
    ? lots.filter((lot) => lot.product_id === selectedProduct.id).reduce((sum, lot) => sum + Number(lot.quantity), 0)
    : 0

  if (!canManage) {
    return <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">Your company role does not grant product catalog management access.</section>
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Product Catalog</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Manage company categories, units, packaging levels, package barcodes and effective-dated prices.</p>
      </header>

      {(error) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading ? <p className="rounded-xl border bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">Loading product catalog…</p> : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="font-semibold">Categories</h2>
                <p className="text-xs text-slate-500">Create parent categories and subcategories.</p>
              </div>
              <form onSubmit={(event) => void createCategory(event)} className="grid gap-2 sm:grid-cols-2">
                <input required value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" className={inputClass} />
                <input value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} placeholder="Code (optional)" className={inputClass} />
                <select value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)} className={`${inputClass} sm:col-span-2`}>
                  <option value="">No parent category</option>
                  {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <button disabled={saving} className={buttonClass}>Add category</button>
              </form>
              <div className="max-h-56 space-y-2 overflow-auto">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                    <div><strong>{category.name}</strong><span className="ml-2 text-xs text-slate-500">{category.code || "No code"}{category.parent_id ? ` · ${categories.find((item) => item.id === category.parent_id)?.name ?? "Parent"}` : ""}</span></div>
                    <button type="button" disabled={saving} onClick={() => void setActive("product_categories", category.id, !category.is_active, "Category")} className="text-xs font-medium text-emerald-700">{category.is_active ? "Archive" : "Restore"}</button>
                  </div>
                ))}
                {!categories.length && <p className="py-3 text-sm text-slate-500">No categories created yet.</p>}
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="font-semibold">Units of measure</h2>
                <p className="text-xs text-slate-500">Define reusable measurement units. Product package conversion is configured separately below.</p>
              </div>
              <form onSubmit={(event) => void createUnit(event)} className="grid gap-2 sm:grid-cols-2">
                <input required value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="Unit name (e.g. Tablet)" className={inputClass} />
                <input required value={unitSymbol} onChange={(event) => setUnitSymbol(event.target.value)} placeholder="Symbol (e.g. tab)" className={inputClass} />
                <select value={unitType} onChange={(event) => setUnitType(event.target.value)} className={inputClass}>
                  {UNIT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <input required type="number" min="0.0000000001" step="any" value={unitFactor} onChange={(event) => setUnitFactor(event.target.value)} placeholder="Factor to canonical unit" className={inputClass} />
                <button disabled={saving} className={buttonClass}>Add unit</button>
              </form>
              <div className="max-h-56 space-y-2 overflow-auto">
                {units.map((unit) => (
                  <div key={unit.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                    <span><strong>{unit.name}</strong><span className="ml-2 text-xs text-slate-500">{unit.symbol} · {unit.unit_type}</span></span>
                    <button type="button" disabled={saving} onClick={() => void setActive("units_of_measure", unit.id, !unit.is_active, "Unit")} className="text-xs font-medium text-emerald-700">{unit.is_active ? "Archive" : "Restore"}</button>
                  </div>
                ))}
                {!units.length && <p className="py-3 text-sm text-slate-500">No units created yet.</p>}
              </div>
            </section>
          </div>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="font-semibold">Product packaging, barcodes and prices</h2>
              <p className="text-xs text-slate-500">One product can have multiple packaging levels. Each factor represents the number of base stock units in one package.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm font-medium md:col-span-2">Product
                <select value={selectedProduct?.id ?? ""} onChange={(event) => setSelectedProductId(event.target.value)} className={inputClass}>
                  {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku || "No SKU"}</option>)}
                </select>
              </label>
              <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <span className="text-xs text-slate-500">Current stock across warehouses</span>
                <p className="mt-1 font-semibold">{productStock.toLocaleString()} {selectedProduct?.unit ?? ""}</p>
              </div>
            </div>

            {selectedProduct ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-medium">Product category
                    <select value={(selectedProduct as typeof selectedProduct & { category_id?: string | null }).category_id ?? ""} onChange={(event) => void assignCategory(event.target.value)} className={inputClass}>
                      <option value="">Uncategorised</option>
                      {categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                  <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                    <span className="text-xs text-slate-500">Existing base stock unit</span>
                    <p className="mt-1 font-semibold">{selectedProduct.unit}</p>
                    <p className="text-xs text-slate-500">The base unit is locked here to protect existing stock balances.</p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <h3 className="text-sm font-semibold">Packaging levels</h3>
                    <form onSubmit={(event) => void createPackaging(event)} className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Packaging type
                        <select required value={packageType} onChange={(event) => setPackageType(event.target.value)} className={inputClass}>
                          <option value="">Select package type</option>
                          {PACKAGING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                          <option value="__custom__">Other / custom</option>
                        </select>
                      </label>
                      {packageType === "__custom__" && (
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Custom package name
                          <input required value={customPackageName} onChange={(event) => setCustomPackageName(event.target.value)} placeholder="Enter package name" className={inputClass} />
                        </label>
                      )}
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Base units per package
                        <input required type="number" min="0.000001" step="any" value={packageFactor} onChange={(event) => setPackageFactor(event.target.value)} placeholder={`Number of ${selectedProduct.unit} in one ${packageType && packageType !== "__custom__" ? packageType.toLowerCase() : "package"}`} className={inputClass} />
                      </label>
                      <p className="text-xs text-slate-500 sm:col-span-2">Example: if the product's base unit is Tablet, enter 10 for a Strip of 10 tablets and 100 for a Box of 100 tablets.</p>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={packageFractional} onChange={(event) => setPackageFractional(event.target.checked)} /> Allow fractional package quantity</label>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={packagePurchaseEnabled} onChange={(event) => setPackagePurchaseEnabled(event.target.checked)} /> Purchase</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={packageSaleEnabled} onChange={(event) => setPackageSaleEnabled(event.target.checked)} /> Sale</label>
                      </div>
                      <button disabled={saving} className={buttonClass}>Add packaging</button>
                    </form>
                    <div className="space-y-2">
                      {productPackages.map((packaging) => (
                        <div key={packaging.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                          <div><strong>{packaging.name}</strong><span className="ml-2 text-xs text-slate-500">× {Number(packaging.base_quantity).toLocaleString()} {selectedProduct.unit}{packaging.is_base_unit ? " · Base" : ""}</span><div className="text-xs text-slate-500">{packaging.is_purchase_enabled ? "Purchase" : "No purchase"} · {packaging.is_sale_enabled ? "Sale" : "No sale"}</div></div>
                          {!packaging.is_base_unit && <button type="button" disabled={saving} onClick={() => void setActive("product_packagings", packaging.id, !packaging.is_active, "Packaging")} className="text-xs font-medium text-emerald-700">{packaging.is_active ? "Archive" : "Restore"}</button>}
                        </div>
                      ))}
                      {!productPackages.length && <p className="text-sm text-amber-700">No packaging found for this product. Check the catalog migration before continuing.</p>}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <h3 className="text-sm font-semibold">Barcodes</h3>
                    <form onSubmit={(event) => void createBarcode(event)} className="grid gap-2 sm:grid-cols-2">
                      <select required value={barcodePackageId} onChange={(event) => setBarcodePackageId(event.target.value)} className={inputClass}>
                        {productPackages.filter((packaging) => packaging.is_active).map((packaging) => <option key={packaging.id} value={packaging.id}>{packaging.name}</option>)}
                      </select>
                      <div className="space-y-2">
                        <input required value={barcodeValue} onChange={(event) => setBarcodeValue(event.target.value)} placeholder="Barcode value" className={inputClass} />
                        <button type="button" onClick={() => {
                          try {
                            setBarcodeValue(generateCompanyProductBarcode({
                              companyName: activeCompany?.legalName || activeCompany?.companyName || "",
                              mobileNumber: activeCompany?.phone || "",
                            }))
                            setBarcodeType("code128")
                          } catch (caught) {
                            setError(caught instanceof Error ? caught.message : String(caught))
                          }
                        }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700"><BarcodeIcon className="h-4 w-4" /> Generate Code 128</button>
                        {barcodeType === "code128" && <BarcodePreview value={barcodeValue} />}
                      </div>
                      <select value={barcodeType} onChange={(event) => setBarcodeType(event.target.value)} className={inputClass}>
                        {BARCODE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={barcodePrimary} onChange={(event) => setBarcodePrimary(event.target.checked)} /> Primary barcode</label>
                      <button disabled={saving || !productPackages.some((packaging) => packaging.id === barcodePackageId && packaging.is_active)} className={buttonClass}>Add barcode</button>
                    </form>
                    <div className="space-y-2">
                      {productBarcodes.map((barcode) => (
                        <div key={barcode.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                          <div><strong>{barcode.barcode}</strong><span className="ml-2 text-xs text-slate-500">{productPackages.find((packaging) => packaging.id === barcode.packaging_id)?.name ?? "Package"} · {barcode.barcode_type}{barcode.is_primary ? " · Primary" : ""}</span></div>
                          <button type="button" disabled={saving} onClick={() => void removeBarcode(barcode.id)} className="text-xs font-medium text-red-700">Remove</button>
                        </div>
                      ))}
                      {!productBarcodes.length && <p className="text-sm text-slate-500">No package barcodes recorded.</p>}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <h3 className="text-sm font-semibold">Package prices</h3>
                  <form onSubmit={(event) => void createPrice(event)} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <select required value={pricePackageId} onChange={(event) => setPricePackageId(event.target.value)} className={inputClass}>
                      {productPackages.filter((packaging) => packaging.is_active).map((packaging) => <option key={packaging.id} value={packaging.id}>{packaging.name}</option>)}
                    </select>
                    <select value={priceType} onChange={(event) => setPriceType(event.target.value as "purchase" | "selling")} className={inputClass}><option value="selling">Selling price</option><option value="purchase">Purchase price</option></select>
                    <input required type="number" min="0" step="0.000001" value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} placeholder="Price" className={inputClass} />
                    <select value={priceBranchId} onChange={(event) => setPriceBranchId(event.target.value)} className={inputClass}><option value="">Company default</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                    <button disabled={saving || !pricePackageId} className={buttonClass}>Save price</button>
                  </form>
                  <p className="text-xs text-slate-500">Prices are stored in {activeCompany?.currency ?? "company currency"}. Branch prices override company defaults when transaction workflows are connected.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Package</th><th>Type</th><th>Price</th><th>Branch</th><th>Validity</th></tr></thead>
                      <tbody>
                        {productPrices.map((price) => (
                          <tr key={price.id} className="border-t border-slate-100 dark:border-slate-800">
                            <td className="py-2">{productPackages.find((packaging) => packaging.id === price.packaging_id)?.name ?? "Package"}</td>
                            <td>{price.price_type}</td>
                            <td>{price.currency} {Number(price.amount).toFixed(2)}</td>
                            <td>{price.branch_id ? branches.find((branch) => branch.id === price.branch_id)?.name ?? "Branch" : "Company"}</td>
                            <td>{price.effective_to ? `Ended ${new Date(price.effective_to).toLocaleDateString()}` : "Current"}</td>
                          </tr>
                        ))}
                        {!productPrices.length && <tr><td colSpan={5} className="py-4 text-center text-slate-500">No package prices found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800">Create an active product first, then configure its packaging and barcodes.</p>}
          </section>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Catalog setup is the first phase. Your current purchasing, goods-receipt and POS transaction screens still submit base-unit quantities. Do not use package-level quantities for live transactions until the transaction-conversion update has been implemented and tested.
          </div>
        </>
      )}
    </section>
  )
}
