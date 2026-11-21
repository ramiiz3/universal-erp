import {
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
import BarcodePreview from "../components/BarcodePreview"
import { buildCompanyProductBarcode } from "../lib/productBarcode"
import { ERP_SETTINGS_STORAGE_KEY } from "../lib/erpStorageKeys"
import { useERP, type Product } from "../context/ERPContext"
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
  sku: "",
  barcode: "",
  purchasePrice: "",
  sellingPrice: "",
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
}

type LegacyCompanyBarcodeProfile = {
  businessName: string
  phone: string
  vatRate: string
}

function getLegacyCompanyBarcodeProfile(): LegacyCompanyBarcodeProfile {
  try {
    const parsed = JSON.parse(localStorage.getItem(ERP_SETTINGS_STORAGE_KEY) ?? "{}") as Partial<LegacyCompanyBarcodeProfile>
    return {
      businessName: typeof parsed.businessName === "string" && parsed.businessName.trim()
        ? parsed.businessName.trim()
        : "Zaki Pharmacy LLC",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      vatRate: typeof parsed.vatRate === "string" ? parsed.vatRate : "5",
    }
  } catch {
    return { businessName: "Zaki Pharmacy LLC", phone: "", vatRate: "5" }
  }
}

function money(value: number) {
  return `AED ${value.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function Products() {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    getProductStock,
  } = useERP()

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")

  const [showForm, setShowForm] = useState(false)

  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null)

  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null)

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
        product.sku
          .toLowerCase()
          .includes(query) ||
        product.barcode.toLowerCase().includes(query) ||
        (product.alternateBarcodes || []).some(
          (barcode) => barcode.toLowerCase().includes(query),
        )

      const matchesCategory =
        category === "All" ||
        product.category === category

      return matchesSearch && matchesCategory
    })
  }, [products, search, category])

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

  function openAdd() {
    const companyProfile = getLegacyCompanyBarcodeProfile()
    setForm({
      ...emptyForm,
      vatRate: companyProfile.vatRate || "5",
      vatApplicable: true,
    })
    setEditingProduct(null)
    setShowForm(true)
  }

  function openEdit(product: Product) {
    setForm({
      name: product.name,
      category: product.category,
      sku: product.sku,
      barcode: product.barcode,
      purchasePrice: String(
        product.purchasePrice,
      ),
      sellingPrice: String(
        product.sellingPrice,
      ),
      minimumStock: String(
        product.minimumStock,
      ),
      vatRate: String(product.vatRate || getLegacyCompanyBarcodeProfile().vatRate || "5"),
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

    let barcode = form.barcode.trim()
    if (form.productType !== "SERVICE" && !barcode) {
      try {
        const profile = getLegacyCompanyBarcodeProfile()
        barcode = buildCompanyProductBarcode(
          profile,
          `PRD${Date.now().toString(36).toUpperCase()}`,
        )
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Save the company mobile number in Settings before generating barcodes.")
        return
      }
    }

    const productData: Omit<Product, "id"> =
      {
        name: form.name.trim(),
        category:
          form.category.trim() ||
          "General",
        sku: form.sku.trim(),
        barcode,
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
        status: (form.status || "ACTIVE") as Product["status"],
      }

    const submittedCodes = [
      productData.barcode,
      ...(productData.alternateBarcodes || []),
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
      ]

      return existingCodes.some((code) =>
        submittedCodes.includes(code.trim().toLowerCase()),
      )
    })

    if (duplicate) {
      window.alert("One or more barcodes are already assigned to another product.")
      return
    }

    if (editingProduct) {
      updateProduct(editingProduct.id, productData)
    } else {
      addProduct(productData)
    }

    closeForm()
  }

  function handleDelete(product: Product) {
    const stock = getProductStock(
      product.id,
    )

    if (stock > 0) {
      window.alert(
        `${product.name} still has ${stock} units in inventory. Stock must be cleared or adjusted before the product can be deleted.`,
      )
      return
    }

    if (
      !window.confirm(
        `Delete ${product.name}?`,
      )
    ) {
      return
    }

    deleteProduct(product.id)

    if (
      selectedProduct?.id === product.id
    ) {
      setSelectedProduct(null)
    }
  }

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            Products
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Manage the product master, pricing, barcode and stock rules.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus size={17} />
          Add Product
        </button>
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="border-b bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
              <tr className="text-left">
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
                          {stock}
                        </div>

                        <div className="text-xs text-slate-500">
                          {product.unit}
                        </div>
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
                            onClick={() =>
                              setSelectedProduct(
                                product,
                              )
                            }
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
                    colSpan={8}
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

                <Detail
                  label="Barcode"
                  value={
                    selectedProduct.barcode
                  }
                />

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
                label="SKU"
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
                  label="Barcode"
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
                          barcode: buildCompanyProductBarcode(
                            profile,
                            `PRD${Date.now().toString(36).toUpperCase()}`,
                          ),
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
                label="Purchase Price"
                value={form.purchasePrice}
                onChange={(value) =>
                  setForm({
                    ...form,
                    purchasePrice: value,
                  })
                }
                type="number"
              />

              <Field
                label="Selling Price"
                value={form.sellingPrice}
                onChange={(value) =>
                  setForm({
                    ...form,
                    sellingPrice: value,
                  })
                }
                type="number"
              />

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
        className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  )
}
