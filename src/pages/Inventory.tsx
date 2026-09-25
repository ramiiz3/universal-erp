import {
  AlertTriangle,
  Barcode,
  Eye,
  Package,
  Plus,
  Search,
  ScanLine,
  X,
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  useERP,
  type InventoryLot,
} from "../context/ERPContext"

function money(value: number) {
  return `AED ${value.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(
    "en-GB",
  )
}

function expiringWithin90Days(
  date: string,
) {
  const expiry = new Date(date)
  const today = new Date()

  const limit = new Date(today)
  limit.setDate(limit.getDate() + 90)

  return (
    expiry >= today &&
    expiry <= limit
  )
}

export default function Inventory() {
  const {
    products,
    inventoryLots,
    receiveStock,
    getProductStock,
  } = useERP()

  const [search, setSearch] = useState("")
  const [showReceive, setShowReceive] =
    useState(false)

  const [selectedLot, setSelectedLot] =
    useState<InventoryLot | null>(null)

  const [scannerValue, setScannerValue] =
    useState("")

  const [scannedProductId, setScannedProductId] =
    useState<string | null>(null)

  const [batch, setBatch] = useState("")
  const [expiry, setExpiry] = useState("")
  const [quantity, setQuantity] = useState("")
  const [purchasePrice, setPurchasePrice] =
    useState("")

  const productMap = useMemo(
    () =>
      new Map(
        products.map((product) => [
          product.id,
          product,
        ]),
      ),
    [products],
  )

  const enrichedLots = useMemo(
    () =>
      inventoryLots.map((lot) => {
        const product =
          productMap.get(lot.productId)

        return {
          lot,
          product,
        }
      }),
    [inventoryLots, productMap],
  )

  const filteredLots = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase()

    if (!query) {
      return enrichedLots
    }

    return enrichedLots.filter(
      ({ lot, product }) =>
        product?.name
          .toLowerCase()
          .includes(query) ||
        product?.sku
          .toLowerCase()
          .includes(query) ||
        product?.barcode.includes(query) ||
        lot.batch
          .toLowerCase()
          .includes(query),
    )
  }, [search, enrichedLots])

  const totalUnits = inventoryLots.reduce(
    (sum, lot) =>
      sum + lot.quantity,
    0,
  )

  const inventoryValue = inventoryLots.reduce(
    (sum, lot) =>
      sum +
      lot.quantity *
        lot.purchasePrice,
    0,
  )

  const lowStockProducts = products.filter(
    (product) => {
      const stock =
        getProductStock(product.id)

      return (
        stock > 0 &&
        stock <= product.minimumStock
      )
    },
  )

  const outOfStockProducts =
    products.filter(
      (product) =>
        getProductStock(product.id) === 0,
    )

  const expiringSoon = inventoryLots.filter(
    (lot) =>
      lot.quantity > 0 &&
      expiringWithin90Days(lot.expiry),
  ).length

  const scannedProduct =
    scannedProductId
      ? products.find(
          (product) =>
            product.id ===
            scannedProductId,
        ) ?? null
      : null

  function resetReceiveForm() {
    setScannerValue("")
    setScannedProductId(null)
    setBatch("")
    setExpiry("")
    setQuantity("")
    setPurchasePrice("")
  }

  function openReceiveStock() {
    resetReceiveForm()
    setShowReceive(true)
  }

  function closeReceiveStock() {
    setShowReceive(false)
    resetReceiveForm()
  }

  function handleBarcodeScan(
    value: string,
  ) {
    const barcode = value.trim()

    if (!barcode) {
      return
    }

    const product = products.find(
      (item) =>
        item.barcode === barcode,
    )

    if (!product) {
      window.alert(
        `No product found for barcode ${barcode}. Create the product first in Products.`,
      )
      return
    }

    setScannerValue(product.barcode)
    setScannedProductId(product.id)

    // Product default purchase price
    // is loaded, but batch and expiry
    // remain blank for the new lot.
    setPurchasePrice(
      String(product.purchasePrice),
    )

    setBatch("")
    setExpiry("")
    setQuantity("")
  }

  function receive() {
    if (!scannedProduct) {
      window.alert(
        "Scan a product first.",
      )
      return
    }

    if (!batch.trim()) {
      window.alert(
        "Batch number is required.",
      )
      return
    }

    if (!expiry) {
      window.alert(
        "Expiry date is required.",
      )
      return
    }

    const qty = Number(quantity)

    if (!qty || qty <= 0) {
      window.alert(
        "Enter a valid quantity greater than zero.",
      )
      return
    }

    const cost =
      Number(purchasePrice) ||
      scannedProduct.purchasePrice

    receiveStock(
      scannedProduct.id,
      batch,
      expiry,
      qty,
      cost,
    )

    window.alert(
      `${qty} units received for ${scannedProduct.name}.`,
    )

    closeReceiveStock()
  }

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            Inventory
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Track stock, batches, expiry dates and stock levels.
          </p>
        </div>

        <button
          type="button"
          onClick={openReceiveStock}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <ScanLine size={17} />
          Receive Stock
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="Products"
          value={String(
            products.length,
          )}
        />

        <SummaryCard
          title="Total Units"
          value={String(totalUnits)}
        />

        <SummaryCard
          title="Stock Value"
          value={money(inventoryValue)}
        />

        <SummaryCard
          title="Low Stock"
          value={String(
            lowStockProducts.length,
          )}
        />

        <SummaryCard
          title="Expiring Soon"
          value={String(
            expiringSoon,
          )}
        />
      </div>

      {(lowStockProducts.length > 0 ||
        outOfStockProducts.length > 0) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 md:flex-row md:items-center">
          <AlertTriangle
            size={20}
            className="text-amber-600"
          />

          <div>
            <div className="font-semibold">
              Inventory attention required
            </div>

            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {
                lowStockProducts.length
              }{" "}
              low-stock product
              {lowStockProducts.length ===
              1
                ? ""
                : "s"} and{" "}
              {
                outOfStockProducts.length
              }{" "}
              out-of-stock product
              {outOfStockProducts.length ===
              1
                ? ""
                : "s"}.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
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
            placeholder="Search by product, SKU, barcode or batch..."
            className="h-11 w-full rounded-xl border bg-white pl-10 pr-4 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
              <tr className="text-left">
                <th className="px-5 py-4 font-medium text-slate-500">
                  Product
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Barcode
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Batch
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Expiry
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Lot Stock
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Total Product Stock
                </th>

                <th className="px-5 py-4 font-medium text-slate-500">
                  Purchase Cost
                </th>

                <th className="px-5 py-4 text-right font-medium text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredLots.map(
                ({ lot, product }) => (
                  <tr
                    key={lot.id}
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
                            {product?.name ??
                              "Unknown Product"}
                          </div>

                          <div className="text-xs text-slate-500">
                            {product?.sku ??
                              lot.productId}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono text-xs">
                      {product?.barcode ??
                        "—"}
                    </td>

                    <td className="px-5 py-4 font-medium">
                      {lot.batch}
                    </td>

                    <td className="px-5 py-4">
                      <div>
                        {formatDate(
                          lot.expiry,
                        )}
                      </div>

                      {expiringWithin90Days(
                        lot.expiry,
                      ) && (
                        <div className="mt-1 text-xs font-medium text-amber-600">
                          Expiring soon
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      {lot.quantity}
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      {product
                        ? getProductStock(
                            product.id,
                          )
                        : lot.quantity}
                    </td>

                    <td className="px-5 py-4">
                      {money(
                        lot.purchasePrice,
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedLot(
                              lot,
                            )
                          }
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="View lot"
                        >
                          <Eye
                            size={17}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}

              {filteredLots.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    No inventory lots found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showReceive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">
                  Receive Stock
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Scan a product barcode to begin receiving stock.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeReceiveStock
                }
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <label className="text-sm font-medium">
                  Scan Barcode
                </label>

                <div className="relative mt-2">
                  <Barcode
                    size={19}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    autoFocus
                    value={scannerValue}
                    onChange={(event) =>
                      setScannerValue(
                        event.target.value,
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key ===
                        "Enter"
                      ) {
                        handleBarcodeScan(
                          scannerValue,
                        )
                      }
                    }}
                    placeholder="Scan barcode and press Enter..."
                    className="h-12 w-full rounded-xl border bg-white pl-10 pr-4 font-mono text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  USB/Bluetooth scanners work when this field is focused.
                </p>
              </div>

              {scannedProduct ? (
                <>
                  <div className="rounded-2xl border bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Product Found
                        </div>

                        <div className="mt-1 text-lg font-semibold">
                          {
                            scannedProduct.name
                          }
                        </div>

                        <div className="mt-1 text-sm text-slate-500">
                          {
                            scannedProduct.sku
                          }{" "}
                          ·{" "}
                          {
                            scannedProduct.barcode
                          }
                        </div>
                      </div>

                      <div className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        Current Stock:{" "}
                        {
                          getProductStock(
                            scannedProduct.id,
                          )
                        }
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
                    Enter the batch and expiry from the shipment you are receiving. A new batch creates a separate inventory lot.
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Batch Number"
                      value={batch}
                      onChange={setBatch}
                      placeholder="e.g. PDX9832"
                    />

                    <Field
                      label="Expiry Date"
                      value={expiry}
                      onChange={setExpiry}
                      type="date"
                    />

                    <Field
                      label="Quantity Received"
                      value={quantity}
                      onChange={setQuantity}
                      type="number"
                      placeholder="50"
                    />

                    <Field
                      label="Purchase Price"
                      value={purchasePrice}
                      onChange={
                        setPurchasePrice
                      }
                      type="number"
                      placeholder="10.00"
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed p-8 text-center dark:border-slate-700">
                  <ScanLine
                    size={28}
                    className="mx-auto text-slate-400"
                  />

                  <div className="mt-3 font-medium">
                    Waiting for barcode
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Scan a product from the Products module.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t pt-5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={
                    closeReceiveStock
                  }
                  className="rounded-xl border px-4 py-2.5 text-sm dark:border-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!scannedProduct}
                  onClick={receive}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={17} />
                  Receive Stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">
                  Inventory Lot
                </h3>

                <p className="text-sm text-slate-500">
                  {
                    productMap.get(
                      selectedLot.productId,
                    )?.name
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedLot(
                    null,
                  )
                }
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Detail
                label="Batch"
                value={
                  selectedLot.batch
                }
              />

              <Detail
                label="Expiry"
                value={formatDate(
                  selectedLot.expiry,
                )}
              />

              <Detail
                label="Lot Quantity"
                value={String(
                  selectedLot.quantity,
                )}
              />

              <Detail
                label="Purchase Price"
                value={money(
                  selectedLot.purchasePrice,
                )}
              />
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
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  )
}
