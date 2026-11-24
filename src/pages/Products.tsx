import {
  Archive,
  Barcode as BarcodeIcon,
  Edit3,
  Eye,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import BarcodePreview from "../components/BarcodePreview"
import { generateCompanyProductBarcode } from "../lib/productBarcode"
import { getERPSettings } from "../lib/erpSettings"
import { useERP, type Product, type ProductPackaging } from "../context/ERPContext"
import { calculateGrossMarginPercentage, calculateSellingPriceFromGrossMargin } from "../lib/productPricing"
import {
  getERPUnits,
  ERP_UNITS_EVENT,
  type ERPUnitDefinition,
} from "../lib/erpUnits"
import {
  getProductCategories,
  PRODUCT_CATEGORIES_EVENT,
  type ProductCategory,
} from "../lib/productCategories"

const emptyForm = {
  name: "",
  category: "",
  productGroup: "",
  sku: "",
  barcode: "",
  companyName: "",
  genericName: "",
  preferredSupplierId: "",
  mrp: "",
  purchasePrice: "",
  sellingPrice: "",
  marginPercentage: "",
  minimumStock: "",
  vatRate: "5",
  vatApplicable: true,
  unit: "Pack",
  productType: "GOODS",
  subcategory: "",
  brand: "",
  manufacturer: "",
  alternateBarcodes: "",
  description: "",
  status: "ACTIVE",
  returnEligible: "false",
  packagings: [] as ProductPackaging[],
}

type LegacyCompanyBarcodeProfile = {
  companyName: string
  mobileNumber: string
  vatRate: string
}

function getLegacyCompanyBarcodeProfile(): LegacyCompanyBarcodeProfile {
  const settings = getERPSettings()
  return {
    companyName: settings.businessName.trim() || "Zaki Pharmacy LLC",
    mobileNumber: settings.phone,
    vatRate: Number(settings.vatRate) > 0 ? settings.vatRate : "5",
  }
}

function money(value: number) {
  return `AED ${value.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function Products() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    products,
    suppliers,
    addProduct,
    updateProduct,
    deleteProducts,
    archiveProducts,
    getProductStock,
  } = useERP()

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [productStatusFilter, setProductStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "DISCONTINUED" | "ALL">("ACTIVE")
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])

  const [showForm, setShowForm] = useState(false)

  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null)

  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null)

  const [barcodeProduct, setBarcodeProduct] =
    useState<Product | null>(null)
  const [barcodeValue, setBarcodeValue] = useState("")
  const [barcodeError, setBarcodeError] = useState("")

  const [form, setForm] = useState(emptyForm)

  const [availableUnits, setAvailableUnits] =
    useState<ERPUnitDefinition[]>([])

  useEffect(() => {
    const refreshUnits = () => {
      setAvailableUnits(getERPUnits(products.map((product) => product.unit)))
    }
    refreshUnits()
    window.addEventListener(ERP_UNITS_EVENT, refreshUnits)
    window.addEventListener("storage", refreshUnits)
    return () => {
      window.removeEventListener(ERP_UNITS_EVENT, refreshUnits)
      window.removeEventListener("storage", refreshUnits)
    }
  }, [products])


  const [managedCategories, setManagedCategories] =
    useState<ProductCategory[]>([])

  useEffect(() => {
    const refreshCategories = () => {
      setManagedCategories(getProductCategories(products))
    }

    refreshCategories()
    window.addEventListener(PRODUCT_CATEGORIES_EVENT, refreshCategories)
    window.addEventListener("storage", refreshCategories)

    return () => {
      window.removeEventListener(PRODUCT_CATEGORIES_EVENT, refreshCategories)
      window.removeEventListener("storage", refreshCategories)
    }
  }, [products])


  const categories = [
    "All",
    ...Array.from(
      new Set(
        products.map(
          (product) => product.category,
        ),
      ),
    ),
  ]

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()

    return products.filter((product) => {
      const matchesSearch =
        !query ||
        product.name
          .toLowerCase()
          .includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.barcode.toLowerCase().includes(query) ||
        (product.genericName ?? "").toLowerCase().includes(query) ||
        (product.companyName ?? "").toLowerCase().includes(query) ||
        (product.productGroup ?? "").toLowerCase().includes(query) ||
        (product.brand ?? "").toLowerCase().includes(query) ||
        (product.packagings ?? []).some((unit) =>
          [unit.name, unit.unit, unit.barcode ?? ""].some((value) => value.toLowerCase().includes(query)),
        ) ||
        (product.alternateBarcodes || []).some((barcode) => barcode.toLowerCase().includes(query))

      const matchesCategory =
        category === "All" ||
        product.category === category
      const status = product.status || "ACTIVE"
      const matchesStatus = productStatusFilter === "ALL" || status === productStatusFilter

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [products, search, category, productStatusFilter])

  const totalStockUnits = products.reduce(
    (sum, product) =>
      sum + getProductStock(product.id),
    0,
  )

  const inventoryValue = products.reduce(
    (sum, product) =>
      sum +
      getProductStock(product.id) *
        product.purchasePrice,
    0,
  )

  const lowStockProducts = products.filter(
    (product) => {
      const stock = getProductStock(product.id)

      return (
        stock > 0 &&
        stock <= product.minimumStock
      )
    },
  ).length

  const outOfStockProducts = products.filter(
    (product) =>
      getProductStock(product.id) === 0,
  ).length

  function resetForm() {
    setForm(emptyForm)
  }

  function updatePackaging(index: number, updates: Partial<ProductPackaging>) {
    setForm((current) => ({
      ...current,
      packagings: current.packagings.map((packaging, itemIndex) =>
        itemIndex === index ? { ...packaging, ...updates } : packaging,
      ),
    }))
  }

  function addPackaging() {
    setForm((current) => ({
      ...current,
      packagings: [
        ...current.packagings,
        {
          id: `PACK-${Date.now()}-${current.packagings.length}`,
          name: "",
          unit: "",
          conversionFactor: 1,
          purchaseEnabled: true,
          salesEnabled: true,
        },
      ],
    }))
  }

  function removePackaging(index: number) {
    setForm((current) => ({
      ...current,
      packagings: current.packagings.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  function updatePurchasePrice(value: string) {
    setForm((current) => {
      const margin = current.marginPercentage.trim() ? Number(current.marginPercentage) : null
      const nextSelling = margin !== null && Number.isFinite(margin) && margin < 100
        ? calculateSellingPriceFromGrossMargin(Number(value) || 0, margin)
        : current.sellingPrice
      const calculatedMargin = margin === null
        ? calculateGrossMarginPercentage(Number(value), Number(current.sellingPrice))
        : margin
      return {
        ...current,
        purchasePrice: value,
        sellingPrice: typeof nextSelling === "number" ? nextSelling.toFixed(2) : nextSelling,
        marginPercentage: calculatedMargin === null ? current.marginPercentage : String(calculatedMargin),
      }
    })
  }

  function updateSellingPrice(value: string) {
    setForm((current) => ({
      ...current,
      sellingPrice: value,
      marginPercentage: calculateGrossMarginPercentage(Number(current.purchasePrice), Number(value))?.toFixed(2) ?? "",
    }))
  }

  function updateMarginPercentage(value: string) {
    setForm((current) => {
      const margin = Number(value)
      if (!value.trim() || !Number.isFinite(margin) || margin >= 100) {
        return { ...current, marginPercentage: value }
      }
      return {
        ...current,
        marginPercentage: value,
        sellingPrice: calculateSellingPriceFromGrossMargin(Number(current.purchasePrice) || 0, margin).toFixed(2),
      }
    })
  }

  function openAdd() {
    const companyProfile = getLegacyCompanyBarcodeProfile()
    setForm({
      ...emptyForm,
      companyName: companyProfile.companyName,
      vatRate: companyProfile.vatRate || "5",
      vatApplicable: true,
      packagings: [],
    })
    setEditingProduct(null)
    setShowForm(true)
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get("addProduct") === "1") {
      const companyProfile = getLegacyCompanyBarcodeProfile()
      setForm({
        ...emptyForm,
        companyName: companyProfile.companyName,
        vatRate: companyProfile.vatRate || "5",
        vatApplicable: true,
        packagings: [],
      })
      setEditingProduct(null)
      setShowForm(true)
      navigate("/products", { replace: true })
    }
  }, [location.search, navigate])

  function openEdit(product: Product) {
    setForm({
      name: product.name,
      category: product.category,
      productGroup: product.productGroup || "",
      sku: product.sku,
      barcode: product.barcode,
      companyName: product.companyName || "",
      genericName: product.genericName || "",
      preferredSupplierId: product.preferredSupplierId || "",
      mrp: String(product.mrp ?? product.sellingPrice),
      purchasePrice: String(
        product.purchasePrice,
      ),
      sellingPrice: String(
        product.sellingPrice,
      ),
      marginPercentage: calculateGrossMarginPercentage(product.purchasePrice, product.sellingPrice)?.toFixed(2) ?? "",
      minimumStock: String(
        product.minimumStock,
      ),
      vatRate: String(product.vatApplicable === false ? 0 : (product.vatRate || getLegacyCompanyBarcodeProfile().vatRate || "5")),
      vatApplicable: product.vatApplicable !== false,
      unit: product.unit,
      productType: product.productType || "GOODS",
      subcategory: product.subcategory || "",
      brand: product.brand || "",
      manufacturer: product.manufacturer || "",
      alternateBarcodes: (product.alternateBarcodes || []).join(", "),
      description: product.description || "",
      status: product.status || "ACTIVE",
      returnEligible: product.returnEligible === true ? "true" : "false",
      packagings: (product.packagings ?? []).map((packaging) => ({ ...packaging })),
    })

    setEditingProduct(product)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingProduct(null)
    resetForm()
  }

  function saveProduct() {
    if (!form.name.trim()) {
      window.alert(
        "Product name is required.",
      )
      return
    }

    if (editingProduct && form.unit !== editingProduct.unit && getProductStock(editingProduct.id) > 0) {
      window.alert("This product has existing stock. Its base unit cannot be changed until the stock is cleared or formally converted.")
      return
    }

    let barcode = form.barcode.trim()
    if (form.productType !== "SERVICE" && !barcode) {
      try {
        const profile = getLegacyCompanyBarcodeProfile()
        barcode = generateCompanyProductBarcode(profile)
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Save the company mobile number in Settings before generating barcodes.")
        return
      }
    }

    const packagingNames = form.packagings.map((item) => item.name.trim().toLowerCase()).filter(Boolean)
    const packagingUnits = form.packagings.map((item) => item.unit.trim().toLowerCase()).filter(Boolean)
    if (packagingNames.length !== form.packagings.length || packagingUnits.length !== form.packagings.length) {
      window.alert("Enter both a package name and unit for every sub-unit.")
      return
    }
    if (new Set(packagingNames).size !== packagingNames.length) {
      window.alert("Package names must be unique for this product.")
      return
    }
    if (form.packagings.some((item) => !Number.isFinite(Number(item.conversionFactor)) || Number(item.conversionFactor) <= 0)) {
      window.alert("Every package conversion must be greater than zero.")
      return
    }
    if (form.packagings.some((item) =>
      [item.purchasePrice, item.sellingPrice].some((value) => value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)),
    )) {
      window.alert("Package purchase and selling prices must be valid amounts of zero or greater.")
      return
    }

    const productData: Omit<Product, "id"> =
      {
        name: form.name.trim(),
        category:
          form.category.trim() ||
          "General",
        productGroup: form.productGroup.trim() || undefined,
        sku: form.sku.trim(),
        barcode,
        companyName: form.companyName.trim() || undefined,
        genericName: form.genericName.trim() || undefined,
        preferredSupplierId: form.preferredSupplierId || undefined,
        mrp: Number(form.mrp) || Number(form.sellingPrice) || 0,
        purchasePrice:
          Number(form.purchasePrice) || 0,
        sellingPrice:
          Number(form.sellingPrice) || 0,
        minimumStock:
          Number(form.minimumStock) || 0,
        vatRate:
          form.vatApplicable ? (Number(form.vatRate) || 0) : 0,
        vatApplicable: form.vatApplicable,
        unit:
          form.unit.trim() || "Unit",
        productType: (form.productType || "GOODS") as Product["productType"],
        subcategory: form.subcategory.trim() || undefined,
        brand: form.brand.trim() || undefined,
        manufacturer: form.manufacturer.trim() || undefined,
        alternateBarcodes: form.alternateBarcodes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        description: form.description.trim() || undefined,
        returnEligible: form.productType !== "SERVICE" && form.returnEligible === "true",
        packagings: form.packagings.map((item) => ({
          ...item,
          id: item.id || `PACK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: item.name.trim(),
          unit: item.unit.trim(),
          conversionFactor: Number(item.conversionFactor),
          barcode: item.barcode?.trim() || undefined,
          purchasePrice: item.purchasePrice === undefined || item.purchasePrice === null ? undefined : Number(item.purchasePrice),
          sellingPrice: item.sellingPrice === undefined || item.sellingPrice === null ? undefined : Number(item.sellingPrice),
        })),
        status: (form.status || "ACTIVE") as Product["status"],
      }

    const submittedCodes = [
      productData.barcode,
      ...(productData.alternateBarcodes || []),
      ...(productData.packagings ?? []).map((packaging) => packaging.barcode ?? ""),
    ]
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean)

    if (new Set(submittedCodes).size !== submittedCodes.length) {
      window.alert("The same barcode was entered more than once.")
      return
    }

    const duplicate = products.some((product) => {
      if (product.id === editingProduct?.id) return false

      const existingCodes = [
        product.barcode,
        ...(product.alternateBarcodes || []),
        ...(product.packagings ?? []).map((packaging) => packaging.barcode ?? ""),
      ]

      return existingCodes.some((code) =>
        submittedCodes.includes(code.trim().toLowerCase()),
      )
    })

    if (duplicate) {
      window.alert("One or more barcodes are already assigned to another product.")
      return
    }

    if (!Number.isFinite(productData.minimumStock) || productData.minimumStock < 0) {
      window.alert("Minimum stock / reorder level must be a valid number of zero or greater.")
      return
    }

    try {
      if (editingProduct) {
        updateProduct(editingProduct.id, productData)
      } else {
        addProduct(productData)
      }
      closeForm()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The product could not be saved.")
    }
  }

  function handleBulkDelete(ids: string[], removeInventory = false) {
    const uniqueIds = [...new Set(ids)].filter((id) => products.some((product) => product.id === id))
    if (!uniqueIds.length) return

    const confirmation = removeInventory
      ? `PERMANENTLY remove ${uniqueIds.length} selected product(s), their inventory lots and stock movement history? A recovery backup will be created first. Products linked to sales, purchases, returns, orders or transfers will still be retained.`
      : `Delete ${uniqueIds.length} selected product(s) only where there is no stock or stock history? Products with stock or commercial documents will be retained.`
    if (!window.confirm(confirmation)) return

    try {
      const result = deleteProducts(uniqueIds, { removeInventory })
      const archived = result.blocked.length
        ? archiveProducts(result.blocked.map((item) => item.id))
        : 0
      setSelectedProductIds([])
      if (selectedProduct && (result.deletedIds.includes(selectedProduct.id) || result.blocked.some((item) => item.id === selectedProduct.id))) setSelectedProduct(null)
      const blockedSummary = result.blocked.length
        ? "\n\nProducts with transaction history were archived (not erased):\n" + result.blocked.map((item) => `• ${item.name}: ${item.reason}`).join("\n")
        : ""
      const inventorySummary = removeInventory
        ? `\nInventory lots removed: ${result.removedLots}. Stock movements removed: ${result.removedMovements}.`
        : ""
      window.alert(`${result.deletedIds.length} product(s) permanently deleted. ${archived} product(s) archived to preserve transaction history.${inventorySummary}${blockedSummary}`)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  const visibleProductIds = filteredProducts.map((product) => product.id)
  const allVisibleSelected = visibleProductIds.length > 0 &&
    visibleProductIds.every((id) => selectedProductIds.includes(id))

  function toggleProductSelection(id: string) {
    setSelectedProductIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function handleDelete(product: Product) {
    const stock = getProductStock(product.id)
    const confirmation = `Permanently delete "${product.name}" and its ${stock} on-hand units, batches and stock movement history? A recovery backup is created first. Products referenced by sales or purchasing records cannot be erased.`
    if (!window.confirm(confirmation)) return
    try {
      const result = deleteProducts([product.id], { removeInventory: true })
      if (result.blocked.length) {
        const blocked = result.blocked[0]
        if (window.confirm(`${blocked.name} is linked to transaction history and cannot be permanently erased. Archive it instead? Old invoices and purchases will remain intact.`)) {
          archiveProducts([product.id])
        }
      }
      if (selectedProduct?.id === product.id) setSelectedProduct(null)
      setSelectedProductIds((current) => current.filter((id) => id !== product.id))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  function handleArchive(ids: string[]) {
    const uniqueIds = [...new Set(ids)].filter((id) => products.some((product) => product.id === id))
    if (!uniqueIds.length) return
    if (!window.confirm(`Archive ${uniqueIds.length} selected product(s)? They will be removed from active product selection while existing invoices, purchases and stock history are preserved. You can restore them later from the Inactive filter.`)) return
    try {
      const archived = archiveProducts(uniqueIds)
      setSelectedProductIds([])
      window.alert(`${archived} product(s) archived. Historical transactions and stock records were preserved.`)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  function openBarcodeGenerator(product: Product) {
    setBarcodeProduct(product)
    setBarcodeValue(product.barcode || "")
    setBarcodeError("")
  }

  function generateBarcodeForProduct() {
    if (!barcodeProduct) return
    try {
      setBarcodeValue(generateCompanyProductBarcode(getLegacyCompanyBarcodeProfile()))
      setBarcodeError("")
    } catch (error) {
      setBarcodeError(error instanceof Error ? error.message : String(error))
    }
  }

  function saveGeneratedBarcode() {
    if (!barcodeProduct) return
    const nextBarcode = barcodeValue.trim()
    if (!nextBarcode) {
      setBarcodeError("Generate a barcode or enter a value first.")
      return
    }

    const duplicate = products.some((product) =>
      product.id !== barcodeProduct.id &&
      [product.barcode, ...(product.alternateBarcodes ?? [])]
        .some((value) => value.trim().toLowerCase() === nextBarcode.toLowerCase()),
    )
    if (duplicate) {
      setBarcodeError("This barcode is already assigned to another product.")
      return
    }

    const { id, ...productData } = barcodeProduct
    updateProduct(id, { ...productData, barcode: nextBarcode })
    setBarcodeProduct({ ...barcodeProduct, barcode: nextBarcode })
    setBarcodeError("")
  }

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            Products
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Manage products and stock. Use the barcode icon in each product row to view or generate its barcode.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleBulkDelete(products.map((product) => product.id), true)}
            disabled={products.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            <Trash2 size={16} />
            Delete All + Stock
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus size={17} />
            Add Product
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Products"
          value={String(products.length)}
        />

        <SummaryCard
          title="Total Units"
          value={String(totalStockUnits)}
        />

        <SummaryCard
          title="Inventory Value"
          value={money(inventoryValue)}
        />

        <SummaryCard
          title="Low / Out of Stock"
          value={`${lowStockProducts} / ${outOfStockProducts}`}
        />
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search by product, SKU or barcode..."
              className="h-11 w-full rounded-xl border bg-white pl-10 pr-4 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <select
            aria-label="Filter products by status"
            value={productStatusFilter}
            onChange={(event) => {
              setProductStatusFilter(event.target.value as typeof productStatusFilter)
              setSelectedProductIds([])
            }}
            className="h-11 rounded-xl border bg-white px-4 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="ACTIVE">Active products</option>
            <option value="INACTIVE">Archived products</option>
            <option value="DISCONTINUED">Discontinued products</option>
            <option value="ALL">All statuses</option>
          </select>

          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value)
            }
            className="h-11 rounded-xl border bg-white px-4 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {categories.map((item) => (
              <option
                key={item}
                value={item}
              >
                {item === "All"
                  ? "All Categories"
                  : item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {selectedProductIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-100 bg-red-50/70 px-4 py-3 dark:border-red-950 dark:bg-red-950/20">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{selectedProductIds.length} product(s) selected</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedProductIds([])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Cancel selection</button>
              <button type="button" onClick={() => handleArchive(selectedProductIds)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"><Archive size={14}/> Archive Selected</button>
              <button type="button" onClick={() => handleBulkDelete(selectedProductIds)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 size={14}/> Delete Selected</button>
              <button type="button" onClick={() => handleBulkDelete(selectedProductIds, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"><Trash2 size={14}/> Delete Selected + Stock</button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="border-b bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
              <tr className="text-left">
                <th className="w-12 px-4 py-4">
                  <input
                    type="checkbox"
                    aria-label="Select all visible products"
                    checked={allVisibleSelected}
                    onChange={() => setSelectedProductIds((current) =>
                      allVisibleSelected
                        ? current.filter((id) => !visibleProductIds.includes(id))
                        : [...new Set([...current, ...visibleProductIds])],
                    )}
                    className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                  />
                </th>
                <th className="px-5 py-4 font-medium text-slate-500">
                  Product
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Category
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Barcode
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Selling Price
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Current Stock
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Min Stock
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  VAT
                </th>

                <th className="px-5 py-4 text-right font-medium text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map(
                (product) => {
                  const stock =
                    getProductStock(
                      product.id,
                    )

                  const lowStock =
                    stock > 0 &&
                    stock <=
                      product.minimumStock

                  return (
                    <tr
                      key={product.id}
                      className="border-b last:border-b-0 dark:border-slate-800"
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          aria-label={`Select ${product.name}`}
                          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <Package
                              size={18}
                            />
                          </div>

                          <div>
                            <div className="font-semibold">
                              {product.name}
                            </div>

                            <div className="text-xs text-slate-500">
                              {product.sku ||
                                product.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {product.category}
                      </td>

                      <td className="px-5 py-4 font-mono text-xs">
                        {product.barcode}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {money(
                          product.sellingPrice,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div
                          className={
                            lowStock ||
                            stock === 0
                              ? "font-semibold text-amber-600"
                              : "font-semibold"
                          }
                        >
                          On hand: {stock}
                        </div>

                        <div className="text-xs text-slate-500">
                          {product.unit} · Reorder at {product.minimumStock}
                        </div>
                        {stock > 0 && stock <= product.minimumStock && <div className="mt-1 text-[11px] font-semibold text-amber-700">Below minimum</div>}
                      </td>

                      <td className="px-5 py-4">
                        {product.minimumStock}
                      </td>

                      <td className="px-5 py-4">
                        {product.vatApplicable === false ? "Not applicable" : `${product.vatRate}%`}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openBarcodeGenerator(product)}
                            title="View or generate barcode"
                            aria-label={`View or generate barcode for ${product.name}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30"
                          >
                            <BarcodeIcon size={17} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setSelectedProduct(product)
                            }
                            title="View product details"
                            aria-label={`View ${product.name}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Eye
                              size={17}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openEdit(
                                product,
                              )
                            }
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Edit3
                              size={17}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDelete(
                                product,
                              )
                            }
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          >
                            <Trash2
                              size={17}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                },
              )}

              {filteredProducts.length ===
                0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {barcodeProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">Product Barcode</h3>
                <p className="text-sm text-slate-500">{barcodeProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setBarcodeProduct(null)}
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close barcode generator"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-sm font-medium">
                Barcode value
                <input
                  value={barcodeValue}
                  onChange={(event) => setBarcodeValue(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                  placeholder="Generate a barcode or enter one"
                />
              </label>
              <button
                type="button"
                onClick={generateBarcodeForProduct}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                <BarcodeIcon size={16} /> Generate Code 128
              </button>
              <BarcodePreview value={barcodeValue} />
              {barcodeError && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  {barcodeError}
                </p>
              )}
              <p className="text-xs text-slate-500">
                Internal format: company name · company mobile · unique product code
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t p-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBarcodeProduct(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={saveGeneratedBarcode}
                disabled={!barcodeValue.trim() || barcodeValue.trim() === (barcodeProduct.barcode || "")}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save Barcode
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">
                  Product Details
                </h3>

                <p className="text-sm text-slate-500">
                  {selectedProduct.id}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedProduct(
                    null,
                  )
                }
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 p-5">
              <div>
                <h4 className="text-xl font-semibold">
                  {selectedProduct.name}
                </h4>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedProduct.category}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Detail
                  label="SKU"
                  value={
                    selectedProduct.sku ||
                    "—"
                  }
                />

                <Detail label="Barcode / GTIN" value={selectedProduct.barcode || "—"} />
                <Detail label="Generic Name" value={selectedProduct.genericName || "—"} />
                <Detail label="Company" value={selectedProduct.companyName || "—"} />
                <Detail label="Group" value={selectedProduct.productGroup || "—"} />
                <Detail label="Preferred Supplier" value={suppliers.find((supplier) => supplier.id === selectedProduct.preferredSupplierId)?.name || "—"} />
                <Detail label="MRP" value={money(selectedProduct.mrp ?? selectedProduct.sellingPrice)} />

                <Detail
                  label="Purchase Price"
                  value={money(
                    selectedProduct.purchasePrice,
                  )}
                />

                <Detail
                  label="Selling Price"
                  value={money(
                    selectedProduct.sellingPrice,
                  )}
                />

                <Detail
                  label="Current Stock"
                  value={String(
                    getProductStock(
                      selectedProduct.id,
                    ),
                  )}
                />

                <Detail
                  label="Minimum Stock"
                  value={String(
                    selectedProduct.minimumStock,
                  )}
                />

                <Detail
                  label="VAT"
                  value={selectedProduct.vatApplicable === false ? "Not applicable" : `${selectedProduct.vatRate}%`}
                />

                <Detail
                  label="Unit"
                  value={
                    selectedProduct.unit
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">
                  {editingProduct
                    ? "Edit Product"
                    : "Add Product"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Product master information only. Stock is received through Inventory.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field
                label="Product Name"
                value={form.name}
                onChange={(value) =>
                  setForm({
                    ...form,
                    name: value,
                  })
                }
                required
              />

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Category
                </span>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      category: event.target.value,
                      subcategory: "",
                    })
                  }
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Select category</option>
                  {managedCategories
                    .filter((item) => item.active || item.name === form.category)
                    .map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}{item.active ? "" : " (Inactive)"}
                      </option>
                    ))}
                </select>
              </label>

              <Field
                label="Product Group"
                value={form.productGroup}
                onChange={(value) => setForm({ ...form, productGroup: value })}
              />

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Subcategory
                </span>
                <select
                  value={form.subcategory}
                  onChange={(event) =>
                    setForm({ ...form, subcategory: event.target.value })
                  }
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Select subcategory (optional)</option>
                  {managedCategories
                    .find((item) => item.name === form.category)
                    ?.subcategories.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  {form.subcategory &&
                    !managedCategories
                      .find((item) => item.name === form.category)
                      ?.subcategories.includes(form.subcategory) && (
                        <option value={form.subcategory}>{form.subcategory}</option>
                      )}
                </select>
              </label>

              <Field
                label="Company"
                value={form.companyName}
                onChange={(value) => setForm({ ...form, companyName: value })}
              />

              <Field
                label="Generic Name"
                value={form.genericName}
                onChange={(value) => setForm({ ...form, genericName: value })}
              />

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Preferred Supplier</span>
                <select
                  value={form.preferredSupplierId}
                  onChange={(event) => setForm({ ...form, preferredSupplierId: event.target.value })}
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">Select supplier (optional)</option>
                  {suppliers.filter((supplier) => supplier.status === "Active" || supplier.id === form.preferredSupplierId).map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </label>

              <Field
                label="Product Code / SKU"
                value={form.sku}
                onChange={(value) =>
                  setForm({
                    ...form,
                    sku: value,
                  })
                }
              />

              <div className="space-y-2">
                <Field
                  label="Barcode / GTIN"
                  value={form.barcode}
                  onChange={(value) => setForm({ ...form, barcode: value })}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const profile = getLegacyCompanyBarcodeProfile()
                        setForm((current) => ({
                          ...current,
                          barcode: generateCompanyProductBarcode(profile),
                        }))
                      } catch (error) {
                        window.alert(error instanceof Error ? error.message : "Save the company mobile number in Settings first.")
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    <BarcodeIcon size={15} /> Generate Code 128
                  </button>
                  <span className="self-center text-xs text-slate-500">Company name · mobile · unique product code</span>
                </div>
                <BarcodePreview value={form.barcode} />
              </div>

              <Field
                label="MRP"
                value={form.mrp}
                onChange={(value) => setForm({ ...form, mrp: value })}
                type="number"
              />

              <Field
                label="Purchase Price / Buying Rate (base unit)"
                value={form.purchasePrice}
                onChange={updatePurchasePrice}
                type="number"
              />

              <Field
                label="Selling Price (base unit)"
                value={form.sellingPrice}
                onChange={updateSellingPrice}
                type="number"
              />

              <div className="space-y-1">
                <Field
                  label="Gross Margin (%)"
                  value={form.marginPercentage}
                  onChange={updateMarginPercentage}
                  type="number"
                />
                <p className="text-xs text-slate-500">Based on base-unit cost: (selling price − purchase price) ÷ selling price. Entering a margin calculates the selling price.</p>
              </div>

              <Field
                label="Minimum Stock"
                value={form.minimumStock}
                onChange={(value) =>
                  setForm({
                    ...form,
                    minimumStock: value,
                  })
                }
                type="number"
              />
              <p className="text-xs text-slate-500 sm:col-span-2">
                Reorder alert threshold only. This does not change On Hand quantity. Use Inventory → Receive Stock or Manage Stock to change physical quantity.
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.vatApplicable}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      vatApplicable: event.target.checked,
                      vatRate: event.target.checked
                        ? (current.vatRate === "0" ? (getLegacyCompanyBarcodeProfile().vatRate || "5") : current.vatRate)
                        : "0",
                    }))}
                  />
                  VAT applicable to this product
                </label>
                <Field
                  label="VAT Rate (%)"
                  value={form.vatRate}
                  onChange={(value) => setForm({ ...form, vatRate: value })}
                  type="number"
                  disabled={!form.vatApplicable}
                />
                <p className="text-xs text-slate-500">Untick for VAT-exempt products such as eligible medicines. Exempt products are charged 0%.</p>
              </div>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Base Unit of Measure</span>
                <select
                  value={form.unit}
                  onChange={(event) => setForm({ ...form, unit: event.target.value })}
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                >
                  {availableUnits.filter((unit) => unit.active || unit.name === form.unit).map((unit) => (
                    <option key={unit.id} value={unit.name}>{unit.name} ({unit.symbol})</option>
                  ))}
                  {!availableUnits.some((unit) => unit.name === form.unit) && (
                    <option value={form.unit}>{form.unit}</option>
                  )}
                </select>
              </label>

              <div className="flex items-end">
                <div className="w-full rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">
                  Opening stock is not entered here. Use Inventory → Receive Stock.
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Sub-units & packaging</h4>
                    <p className="mt-1 text-xs text-slate-500">Define how each purchase or selling unit converts to the stock unit. Example: base unit Box; 1 Strip = 0.1 Box; 1 Piece = 0.01 Box (for a 10-strip / 100-piece box).</p>
                  </div>
                  <button type="button" onClick={addPackaging} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Add sub-unit</button>
                </div>

                {form.packagings.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">No sub-units configured. The base unit will be used for purchasing and sales.</p>}

                {form.packagings.map((packaging, index) => (
                  <div key={packaging.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1 text-xs font-medium">Package name
                      <input value={packaging.name} onChange={(event) => updatePackaging(index, { name: event.target.value })} placeholder="Strip" className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    </label>
                    <label className="space-y-1 text-xs font-medium">Purchase / sales unit
                      <input value={packaging.unit} onChange={(event) => updatePackaging(index, { unit: event.target.value })} placeholder="strip" className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    </label>
                    <label className="space-y-1 text-xs font-medium">Stock-unit quantity per sub-unit
                      <input type="number" min="0.000001" step="any" value={packaging.conversionFactor} onChange={(event) => updatePackaging(index, { conversionFactor: Number(event.target.value) })} className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                      <span className="block font-normal text-slate-500">For base unit Box: enter 0.1 for one strip when 10 strips make a box.</span>
                    </label>
                    <label className="space-y-1 text-xs font-medium">Package barcode (optional)
                      <input value={packaging.barcode ?? ""} onChange={(event) => updatePackaging(index, { barcode: event.target.value })} placeholder="Scan or enter barcode" className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    </label>
                    <label className="space-y-1 text-xs font-medium">Purchase price per package (optional)
                      <input type="number" min="0" step="any" value={packaging.purchasePrice ?? ""} onChange={(event) => updatePackaging(index, { purchasePrice: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder={`Base cost × ${packaging.conversionFactor || 1}`} className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    </label>
                    <label className="space-y-1 text-xs font-medium">Selling price per package (optional)
                      <input type="number" min="0" step="any" value={packaging.sellingPrice ?? ""} onChange={(event) => updatePackaging(index, { sellingPrice: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder={`Base price × ${packaging.conversionFactor || 1}`} className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    </label>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={packaging.purchaseEnabled} onChange={(event) => updatePackaging(index, { purchaseEnabled: event.target.checked })} /> Allow purchasing</label>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={packaging.salesEnabled} onChange={(event) => updatePackaging(index, { salesEnabled: event.target.checked })} /> Allow sales / POS</label>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
                      <span>1 {packaging.unit || packaging.name || "sub-unit"} = {packaging.conversionFactor || 0} {form.unit || "stock units"}</span>
                      <button type="button" onClick={() => removePackaging(index)} className="font-semibold text-red-600 hover:text-red-700">Remove sub-unit</button>
                    </div>
                  </div>
                ))}
              </div>

                  {/* Universal ERP extended product fields */}
                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Product Type</span>
                    <select
                      value={form.productType}
                      onChange={(event) => setForm({ ...form, productType: event.target.value })}
                      className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="GOODS">Goods</option>
                      <option value="SERVICE">Service</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Return eligibility</span>
                    <select value={form.returnEligible} disabled={form.productType === "SERVICE"} onChange={(event) => setForm({ ...form, returnEligible: event.target.value })} className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950">
                      <option value="false">Non-returnable (default)</option>
                      <option value="true">Eligible for return (non-medicinal goods only)</option>
                    </select>
                    <span className="block text-xs text-amber-700">Do not enable this for medicines or products restricted by pharmacy policy.</span>
                  </label>


                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Brand</span>
                    <input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} placeholder="Brand name" className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950" />
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Manufacturer</span>
                    <input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} placeholder="Manufacturer" className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950" />
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Additional Barcodes</span>
                    <input value={form.alternateBarcodes} onChange={(event) => setForm({ ...form, alternateBarcodes: event.target.value })} placeholder="Separate multiple barcodes with commas" className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950" />
                  </label>

                  <label className="space-y-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Product Status</span>
                    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950">
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="DISCONTINUED">Discontinued</option>
                    </select>
                  </label>

                  <label className="space-y-2 md:col-span-2">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Description</span>
                    <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} placeholder="Product description and internal notes" className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950" />
                  </label>

<div className="sm:col-span-2 flex justify-end gap-2 border-t pt-5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border px-4 py-2.5 text-sm dark:border-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={saveProduct}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {editingProduct
                    ? "Save Changes"
                    : "Add Product"}
                </button>
              </div>
</div>
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500">
        {title}
      </div>

      <div className="mt-3 text-2xl font-bold">
        {value}
      </div>
    </div>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
      <div className="text-xs text-slate-500">
        {label}
      </div>

      <div className="mt-1 font-semibold">
        {value}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
  disabled?: boolean
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">
        {label}
        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        disabled={disabled}
        className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  )
}
