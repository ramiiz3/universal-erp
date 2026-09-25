import {
  Edit3,
  Eye,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useERP, type Product } from "../context/ERPContext"

const emptyForm = {
  name: "",
  category: "",
  sku: "",
  barcode: "",
  purchasePrice: "",
  sellingPrice: "",
  minimumStock: "",
  vatRate: "5",
  unit: "Pack",
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
        product.barcode.includes(query)

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
    resetForm()
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
      vatRate: String(product.vatRate),
      unit: product.unit,
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

    if (!form.barcode.trim()) {
      window.alert(
        "Barcode is required.",
      )
      return
    }

    const productData: Omit<Product, "id"> =
      {
        name: form.name.trim(),
        category:
          form.category.trim() ||
          "General",
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        purchasePrice:
          Number(form.purchasePrice) || 0,
        sellingPrice:
          Number(form.sellingPrice) || 0,
        minimumStock:
          Number(form.minimumStock) || 0,
        vatRate:
          Number(form.vatRate) || 0,
        unit:
          form.unit.trim() || "Unit",
      }

    if (editingProduct) {
      updateProduct(
        editingProduct.id,
        productData,
      )
    } else {
      const duplicate = products.some(
        (product) =>
          product.barcode.trim() ===
          productData.barcode.trim(),
      )

      if (duplicate) {
        window.alert(
          "A product with this barcode already exists.",
        )
        return
      }

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
                        {product.vatRate}%
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
                  value={`${selectedProduct.vatRate}%`}
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

              <Field
                label="Category"
                value={form.category}
                onChange={(value) =>
                  setForm({
                    ...form,
                    category: value,
                  })
                }
              />

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

              <Field
                label="Barcode"
                value={form.barcode}
                onChange={(value) =>
                  setForm({
                    ...form,
                    barcode: value,
                  })
                }
                required
              />

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

              <Field
                label="VAT Rate"
                value={form.vatRate}
                onChange={(value) =>
                  setForm({
                    ...form,
                    vatRate: value,
                  })
                }
                type="number"
              />

              <Field
                label="Unit"
                value={form.unit}
                onChange={(value) =>
                  setForm({
                    ...form,
                    unit: value,
                  })
                }
              />

              <div className="flex items-end">
                <div className="w-full rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-950">
                  Opening stock is not entered here. Use Inventory → Receive Stock.
                </div>
              </div>

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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
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
