import { useMemo, useState } from "react"
import { Search, RotateCcw, ArrowDownToLine, History } from "lucide-react"
import { useERP, type InventoryMovement } from "../context/ERPContext"
import { getERPSettings } from "../lib/erpSettings"

const movementLabels: Record<InventoryMovement["type"], string> = {
  OPENING: "Opening Stock",
  RECEIPT: "Stock Receipt",
  SALE: "POS Sale",
  RETURN: "Customer Return",
  PURCHASE_RETURN: "Supplier Purchase Return",
  ADJUSTMENT: "Stock Adjustment",
  DAMAGE: "Damaged Stock",
  LOSS: "Stock Loss",
  TRANSFER_OUT: "Warehouse Transfer Out",
  TRANSFER_IN: "Warehouse Transfer In",
}

const movementTypes = [
  "OPENING",
  "RECEIPT",
  "SALE",
  "RETURN",
  "PURCHASE_RETURN",
  "ADJUSTMENT",
  "DAMAGE",
  "LOSS",
  "TRANSFER_OUT",
  "TRANSFER_IN",
] as const

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function StockLedger() {
  const { inventoryMovements, inventoryLots, products } = useERP()

  const [search, setSearch] = useState("")
  const [type, setType] = useState("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const currency = getERPSettings().currency || "AED"

  const money = (value: number) =>
    new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)

  const sortedMovements = useMemo(
    () =>
      [...inventoryMovements].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      ),
    [inventoryMovements],
  )

  const filteredMovements = useMemo(() => {
    const query = search.trim().toLowerCase()

    return sortedMovements.filter((movement) => {
      const product = products.find(
        (item) => item.id === movement.productId,
      )
      const lot = inventoryLots.find(
        (item) => item.id === movement.lotId,
      )
      const metadata = movement.metadata ?? {}

      const reference = String(
        metadata.referenceNumber ??
        metadata.invoiceNumber ??
        metadata.purchaseNumber ??
        metadata.referenceId ??
        "",
      )
      const batch = String(metadata.batch ?? lot?.batch ?? "")
      const haystack = [
        product?.name,
        product?.sku,
        product?.barcode,
        batch,
        reference,
        movement.reason,
        movement.type,
      ].join(" ").toLowerCase()

      const day = movement.createdAt.slice(0, 10)

      return (
        (!query || haystack.includes(query)) &&
        (type === "ALL" || movement.type === type) &&
        (!dateFrom || day >= dateFrom) &&
        (!dateTo || day <= dateTo)
      )
    })
  }, [
    sortedMovements,
    products,
    inventoryLots,
    search,
    type,
    dateFrom,
    dateTo,
  ])

  const totalIn = filteredMovements
    .filter((movement) => movement.quantity > 0)
    .reduce((sum, movement) => sum + movement.quantity, 0)

  const totalOut = filteredMovements
    .filter((movement) => movement.quantity < 0)
    .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0)

  function getCost(movement: InventoryMovement) {
    const metadata = movement.metadata ?? {}

    if (typeof metadata.totalCost === "number") {
      return metadata.totalCost
    }

    if (typeof metadata.unitCost === "number") {
      return Math.abs(movement.quantity) * metadata.unitCost
    }

    return null
  }

  function resetFilters() {
    setSearch("")
    setType("ALL")
    setDateFrom("")
    setDateTo("")
  }

  function exportCsv() {
    const rows = [
      [
        "Date",
        "Movement",
        "Product",
        "SKU",
        "Reference",
        "Batch",
        "Expiry",
        "Quantity",
        "Unit",
        "Cost",
        "Reason",
      ],
      ...filteredMovements.map((movement) => {
        const product = products.find(
          (item) => item.id === movement.productId,
        )
        const lot = inventoryLots.find(
          (item) => item.id === movement.lotId,
        )
        const metadata = movement.metadata ?? {}

        return [
          movement.createdAt,
          movementLabels[movement.type],
          product?.name ?? movement.productId,
          product?.sku ?? "",
          metadata.referenceNumber ?? metadata.invoiceNumber ?? metadata.purchaseNumber ?? "",
          metadata.batch ?? lot?.batch ?? "",
          metadata.expiry ?? lot?.expiry ?? "",
          movement.quantity,
          metadata.baseUnit ?? product?.unit ?? "",
          getCost(movement) ?? "",
          movement.reason ?? "",
        ]
      }),
    ]

    const csv = rows
      .map((row) =>
        row.map((value) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`,
        ).join(","),
      )
      .join("\n")

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `stock-movement-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Stock Movement Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Auditable history of inventory receipts, issues and adjustments.
          </p>
        </div>

        <button
          type="button"
          onClick={exportCsv}
          disabled={!filteredMovements.length}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowDownToLine size={17} />
          Export CSV
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Movement Records"
          value={filteredMovements.length.toLocaleString()}
          detail="Matching current filters"
        />
        <SummaryCard
          title="Stock Received"
          value={totalIn.toLocaleString()}
          detail="Positive base-unit movements"
        />
        <SummaryCard
          title="Stock Issued"
          value={totalOut.toLocaleString()}
          detail="Negative base-unit movements"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, SKU, batch or reference..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="ALL">All movement types</option>
            {movementTypes.map((movementType) => (
              <option key={movementType} value={movementType}>
                {movementLabels[movementType]}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            aria-label="From date"
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label="To date"
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={resetFilters}
              title="Reset filters"
              className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
              <tr>
                <th className="px-5 py-4">Date & Time</th>
                <th className="px-5 py-4">Movement</th>
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">Reference / Batch</th>
                <th className="px-5 py-4 text-right">Stock In</th>
                <th className="px-5 py-4 text-right">Stock Out</th>
                <th className="px-5 py-4 text-right">Cost Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMovements.map((movement) => {
                const product = products.find(
                  (item) => item.id === movement.productId,
                )
                const lot = inventoryLots.find(
                  (item) => item.id === movement.lotId,
                )
                const metadata = movement.metadata ?? {}
                const batch = metadata.batch ?? lot?.batch ?? "—"
                const reference =
                  metadata.referenceNumber ??
                  metadata.invoiceNumber ??
                  metadata.purchaseNumber ??
                  movement.id
                const cost = getCost(movement)

                return (
                  <tr key={movement.id}>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatDate(movement.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {movementLabels[movement.type]}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        {movement.reason || movement.id}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {product?.name ?? movement.productId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {product?.sku || "No SKU"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-700 dark:text-slate-200">
                        {reference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Batch {batch} · Exp {metadata.expiry ?? lot?.expiry ?? "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {movement.quantity > 0
                        ? `+${movement.quantity.toLocaleString()} ${metadata.baseUnit ?? product?.unit ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-red-600 dark:text-red-400">
                      {movement.quantity < 0
                        ? `${Math.abs(movement.quantity).toLocaleString()} ${metadata.baseUnit ?? product?.unit ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {cost == null ? "—" : money(cost)}
                    </td>
                  </tr>
                )
              })}

              {filteredMovements.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <History className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      No stock movements found
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      New receipts, sales and adjustments will appear here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs leading-5 text-slate-500">
        Ledger entries are created when the corresponding stock transaction is saved.
        Historical balances without a recorded movement are not reconstructed or invented.
        Quantities are shown in the product&apos;s base inventory unit.
      </p>
    </section>
  )
}

function SummaryCard({
  title,
  value,
  detail,
}: {
  title: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  )
}
