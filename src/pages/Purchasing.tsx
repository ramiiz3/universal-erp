import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { FormEvent } from "react"
import {
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { useERP, type Purchase } from "../context/ERPContext"

type PurchaseLine = {
  id: string
  productId: string
  name: string
  barcode: string
  quantity: number
  purchasePrice: number
  batch: string
  expiry: string
}

type SupplierOption = {
  id: string
  name: string
  status: "Active" | "Inactive"
}

function formatCurrency(value: number) {
  return `AED ${value.toFixed(2)}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function Purchasing() {
  const navigate = useNavigate()

  const {
    products,
    purchases,
    createPurchase,
  } = useERP()

  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState("")
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [supplierName, setSupplierName] = useState("")
  const [supplierInvoice, setSupplierInvoice] = useState("")
  const [barcode, setBarcode] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [batch, setBatch] = useState("")
  const [expiry, setExpiry] = useState("")
  const [lines, setLines] = useState<PurchaseLine[]>([])
  const [error, setError] = useState("")
  const [successNumber, setSuccessNumber] = useState("")

  const supplierMasterKey =
    "universal-erp-suppliers"

  useMemo(() => {
    try {
      const raw =
        localStorage.getItem(
          supplierMasterKey,
        )

      if (!raw) {
        setSuppliers([])
        return
      }

      const parsed = JSON.parse(raw)

      setSuppliers(
        Array.isArray(parsed)
          ? parsed
          : [],
      )
    } catch {
      setSuppliers([])
    }
  }, [showForm])

  const filteredPurchases = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...purchases]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      )
      .filter((purchase) => {
        if (!query) return true

        return (
          purchase.purchaseNumber
            .toLowerCase()
            .includes(query) ||
          purchase.supplierName
            .toLowerCase()
            .includes(query) ||
          purchase.supplierInvoice
            .toLowerCase()
            .includes(query)
        )
      })
  }, [purchases, search])

  const purchaseTotal = lines.reduce(
    (sum, line) =>
      sum + line.quantity * line.purchasePrice,
    0,
  )

  const totalPurchased = purchases.reduce(
    (sum: number, purchase: Purchase) => sum + purchase.total,
    0,
  )

  function resetForm() {
    setSupplierName("")
    setSupplierInvoice("")
    setBarcode("")
    setSelectedProductId("")
    setQuantity("")
    setPurchasePrice("")
    setBatch("")
    setExpiry("")
    setLines([])
    setError("")
  }

  function openForm() {
    resetForm()
    setShowForm(true)
  }

  function selectProduct(productId: string) {
    setSelectedProductId(productId)

    const product = products.find(
      (item) => item.id === productId,
    )

    if (product) {
      setPurchasePrice(
        product.purchasePrice.toFixed(2),
      )
    }
  }

  function handleBarcode() {
    const code = barcode.trim().toLowerCase()

    if (!code) return

    const product = products.find(
      (item) =>
        item.barcode.trim().toLowerCase() === code,
    )

    if (!product) {
      setError(
        `No product found for barcode ${barcode}. Add the product in Products first.`,
      )
      return
    }

    setError("")
    selectProduct(product.id)
    setBarcode("")
  }

  function addLine() {
    setError("")

    if (!selectedProductId) {
      setError("Select a product.")
      return
    }

    const product = products.find(
      (item) => item.id === selectedProductId,
    )

    if (!product) {
      setError("Selected product was not found.")
      return
    }

    const qty = Number(quantity)
    const price = Number(purchasePrice)

    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Quantity must be a whole number greater than zero.")
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid purchase price.")
      return
    }

    if (!batch.trim()) {
      setError("Batch number is required.")
      return
    }

    if (!expiry) {
      setError("Expiry date is required.")
      return
    }

    const newLine: PurchaseLine = {
      id: `LINE-${Date.now()}`,
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      quantity: qty,
      purchasePrice: price,
      batch: batch.trim().toUpperCase(),
      expiry,
    }

    setLines((current) => [
      ...current,
      newLine,
    ])

    setQuantity("")
    setBatch("")
    setExpiry("")
    setBarcode("")
    setSelectedProductId("")
    setPurchasePrice("")
  }

  function removeLine(id: string) {
    setLines((current) =>
      current.filter((line) => line.id !== id),
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")

    if (!supplierName.trim()) {
      setError("Supplier name is required.")
      return
    }

    if (!lines.length) {
      setError("Add at least one product to the purchase.")
      return
    }

    try {
      const purchase = createPurchase({
        supplierName,
        supplierInvoice,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          batch: line.batch,
          expiry: line.expiry,
        })),
      })

      setSuccessNumber(purchase.purchaseNumber)
      setShowForm(false)
      resetForm()
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "Could not receive the purchase.",
      )
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <PackagePlus className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Purchasing
              </h1>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Receive supplier purchases into pharmacy inventory.
            </p>
          </div>

          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            New Purchase
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Purchase Orders
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {purchases.length}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Received purchase records
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Purchased
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrency(totalPurchased)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Recorded supplier cost
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Inventory Impact
            </p>

            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              Stock In
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Every received purchase updates Inventory
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search purchase number, supplier or supplier invoice..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Purchase
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Supplier
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Items
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {purchase.purchaseNumber}
                      </p>

                      {purchase.supplierInvoice && (
                        <p className="mt-1 text-xs text-slate-500">
                          Supplier invoice:{" "}
                          {purchase.supplierInvoice}
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {purchase.supplierName}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatDate(purchase.createdAt)}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {purchase.items.reduce(
                        (sum: number, item: PurchaseLine) =>
                          sum + item.quantity,
                        0,
                      )}{" "}
                      units
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {formatCurrency(purchase.total)}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {purchase.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {filteredPurchases.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-14 text-center"
                    >
                      <PackagePlus className="mx-auto h-9 w-9 text-slate-300" />

                      <p className="mt-3 font-medium text-slate-700">
                        No purchases yet
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Receive your first supplier purchase to add stock.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Receive New Purchase
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Received stock will immediately become available in Inventory and POS.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {error && (
                  <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-sm font-medium text-slate-700">
                        Supplier
                      </label>

                      <button
                        type="button"
                        onClick={() => navigate("/suppliers")}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                      >
                        Manage Suppliers
                      </button>
                    </div>

                    <select
                      value={supplierName}
                      onChange={(event) =>
                        setSupplierName(
                          event.target.value,
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="">
                        Select supplier
                      </option>

                      {suppliers
                        .filter(
                          (supplier) =>
                            supplier.status ===
                            "Active",
                        )
                        .sort((a, b) =>
                          a.name.localeCompare(
                            b.name,
                          ),
                        )
                        .map((supplier) => (
                          <option
                            key={supplier.id}
                            value={supplier.name}
                          >
                            {supplier.name}
                          </option>
                        ))}
                    </select>

                    {suppliers.filter(
                      (supplier) =>
                        supplier.status ===
                        "Active",
                    ).length === 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        No active suppliers found. Add a supplier first.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Supplier Invoice Number
                    </label>

                    <input
                      value={supplierInvoice}
                      onChange={(event) =>
                        setSupplierInvoice(event.target.value)
                      }
                      placeholder="Optional supplier invoice number"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <PackagePlus className="h-4 w-4 text-emerald-600" />
                    <h3 className="font-semibold text-slate-900">
                      Add Stock
                    </h3>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[1.2fr_1.2fr_100px_120px_150px_150px_auto]">
                    <input
                      value={barcode}
                      onChange={(event) =>
                        setBarcode(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          handleBarcode()
                        }
                      }}
                      placeholder="Scan barcode"
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />

                    <select
                      value={selectedProductId}
                      onChange={(event) =>
                        selectProduct(event.target.value)
                      }
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="">
                        Select product
                      </option>

                      {products.map((product) => (
                        <option
                          key={product.id}
                          value={product.id}
                        >
                          {product.name} — {product.barcode}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity}
                      onChange={(event) =>
                        setQuantity(event.target.value)
                      }
                      placeholder="Qty"
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchasePrice}
                      onChange={(event) =>
                        setPurchasePrice(event.target.value)
                      }
                      placeholder="Cost"
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />

                    <input
                      value={batch}
                      onChange={(event) =>
                        setBatch(event.target.value)
                      }
                      placeholder="Batch"
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm uppercase outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />

                    <input
                      type="date"
                      value={expiry}
                      onChange={(event) =>
                        setExpiry(event.target.value)
                      }
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />

                    <button
                      type="button"
                      onClick={addLine}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[950px] text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Product
                          </th>

                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Batch
                          </th>

                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Expiry
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Qty
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Cost
                          </th>

                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Total
                          </th>

                          <th className="px-4 py-3" />
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">
                                {line.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {line.barcode}
                              </p>
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-700">
                              {line.batch}
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-700">
                              {line.expiry}
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                              {line.quantity}
                            </td>

                            <td className="px-4 py-3 text-right text-sm text-slate-700">
                              {formatCurrency(
                                line.purchasePrice,
                              )}
                            </td>

                            <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                              {formatCurrency(
                                line.quantity *
                                  line.purchasePrice,
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  removeLine(line.id)
                                }
                                className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {lines.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-5 py-12 text-center"
                            >
                              <PackagePlus className="mx-auto h-8 w-8 text-slate-300" />

                              <p className="mt-3 font-medium text-slate-700">
                                No purchase items added
                              </p>

                              <p className="mt-1 text-sm text-slate-500">
                                Select or scan a product above.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-5 text-white">
                    <p className="text-xs uppercase tracking-wide text-white/50">
                      Purchase Total
                    </p>

                    <p className="mt-2 text-3xl font-semibold">
                      {formatCurrency(purchaseTotal)}
                    </p>

                    <p className="mt-1 text-xs text-white/50">
                      Stock will be added immediately after receiving.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!lines.length}
                  className="h-11 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Receive Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successNumber && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <PackagePlus className="h-7 w-7 text-emerald-600" />
            </div>

            <h2 className="mt-4 text-xl font-semibold text-slate-900">
              Purchase Received
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              The stock has been added to Inventory and is now available to POS.
            </p>

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Purchase Number
              </p>

              <p className="mt-1 text-lg font-semibold text-slate-900">
                {successNumber}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSuccessNumber("")}
              className="mt-6 h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
