import { useMemo, useState } from "react"
import { Calculator, Download, Package, Search, Warehouse as WarehouseIcon, Boxes } from "lucide-react"
import { useERP } from "../context/ERPContext"
import { getERPSettings } from "../lib/erpSettings"
import { buildInventoryValuationCsv, calculateInventoryValuation } from "../lib/inventoryValuation"

type ValuationView = "batch" | "product" | "warehouse"

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-AE", { maximumFractionDigits: 2 }).format(value)
}

export default function StockValuation() {
  const { products, inventoryLots, warehouses, storageLocations } = useERP()
  const [warehouseFilter, setWarehouseFilter] = useState("")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<ValuationView>("batch")
  const currency = (getERPSettings().currency || "AED").trim().toUpperCase()

  const money = (value: number) => {
    try {
      return new Intl.NumberFormat("en-AE", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    } catch {
      return `${currency} ${value.toFixed(2)}`
    }
  }

  const valuation = useMemo(
    () => calculateInventoryValuation(products, inventoryLots, warehouses, storageLocations, warehouseFilter || undefined),
    [products, inventoryLots, warehouses, storageLocations, warehouseFilter],
  )
  const query = search.trim().toLowerCase()
  const matchingRows = valuation.rows.filter((row) =>
    [row.productName, row.sku, row.category, row.batch, row.expiry, row.warehouseName, row.locationName]
      .join(" ").toLowerCase().includes(query),
  )
  const matchingProducts = valuation.byProduct.filter((item) =>
    `${item.name} ${item.secondary}`.toLowerCase().includes(query),
  )
  const matchingWarehouses = valuation.byWarehouse.filter((item) =>
    item.name.toLowerCase().includes(query),
  )

  function downloadCsv() {
    const csv = buildInventoryValuationCsv(matchingRows)
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `stock-valuation-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const tabs: { id: ValuationView; label: string }[] = [
    { id: "batch", label: "By batch" },
    { id: "product", label: "By product" },
    { id: "warehouse", label: "By warehouse" },
  ]

  return (
    <section className="space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Stock Valuation</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Current inventory cost by recorded batch purchase price. Review valuation by batch, product or warehouse. This page is read-only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by warehouse"
            value={warehouseFilter}
            onChange={(event) => setWarehouseFilter(event.target.value)}
            className="h-11 min-w-52 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All warehouses</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={matchingRows.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-sm text-slate-500"><span>Total inventory value</span><Calculator size={18} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{money(valuation.totalValue)}</div>
          <p className="mt-1 text-xs text-slate-500">Recorded batch cost basis</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-sm text-slate-500"><span>Units on hand</span><Boxes size={18} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{formatQuantity(valuation.totalQuantity)}</div>
          <p className="mt-1 text-xs text-slate-500">Across selected warehouse scope</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-sm text-slate-500"><span>Stocked products</span><Package size={18} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{valuation.stockedProductCount}</div>
          <p className="mt-1 text-xs text-slate-500">Products with positive quantity</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-sm text-slate-500"><span>Batch lines</span><WarehouseIcon size={18} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{valuation.positiveBatchCount}</div>
          <p className="mt-1 text-xs text-slate-500">Batches with positive quantity</p>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
        <strong>Valuation method:</strong> Remaining batch quantity × that batch's recorded purchase price. This matches the existing Inventory and Reports stock-value calculations. No purchase costs, stock quantities or transactions are changed here.
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${view === tab.id ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >{tab.label}</button>
          ))}
        </div>
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, SKU, batch or warehouse..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {view === "batch" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
                <tr><th className="px-5 py-4">Product / SKU</th><th className="px-5 py-4">Batch / Expiry</th><th className="px-5 py-4">Warehouse / Location</th><th className="px-5 py-4 text-right">Quantity</th><th className="px-5 py-4 text-right">Unit cost</th><th className="px-5 py-4 text-right">Stock value</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {matchingRows.map((row) => <tr key={row.lotId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-4"><div className="font-semibold text-slate-900 dark:text-white">{row.productName}</div><div className="mt-1 text-xs text-slate-500">{row.sku || "No SKU"} · {row.category || "Uncategorised"}</div></td>
                  <td className="px-5 py-4"><div className="font-medium">{row.batch}</div><div className="mt-1 text-xs text-slate-500">{row.expiry || "No expiry recorded"}</div></td>
                  <td className="px-5 py-4"><div>{row.warehouseName}</div><div className="mt-1 text-xs text-slate-500">{row.locationName}</div></td>
                  <td className="px-5 py-4 text-right font-medium">{formatQuantity(row.quantity)} {row.unit}</td>
                  <td className="px-5 py-4 text-right">{money(row.unitCost)}</td>
                  <td className="px-5 py-4 text-right font-semibold text-emerald-700 dark:text-emerald-400">{money(row.value)}</td>
                </tr>)}
              </tbody>
            </table>
            {matchingRows.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No inventory batches match this filter.</div>}
          </div>
        )}

        {view === "product" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70"><tr><th className="px-5 py-4">Product</th><th className="px-5 py-4 text-right">Units on hand</th><th className="px-5 py-4 text-right">Stocked batches</th><th className="px-5 py-4 text-right">Stock value</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {matchingProducts.map((item) => <tr key={item.id}><td className="px-5 py-4"><div className="font-semibold text-slate-900 dark:text-white">{item.name}</div><div className="mt-1 text-xs text-slate-500">{item.secondary}</div></td><td className="px-5 py-4 text-right">{formatQuantity(item.quantity)}</td><td className="px-5 py-4 text-right">{item.batchCount}</td><td className="px-5 py-4 text-right font-semibold text-emerald-700 dark:text-emerald-400">{money(item.value)}</td></tr>)}
              </tbody>
            </table>
            {matchingProducts.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No products match this filter.</div>}
          </div>
        )}

        {view === "warehouse" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70"><tr><th className="px-5 py-4">Warehouse</th><th className="px-5 py-4 text-right">Units on hand</th><th className="px-5 py-4 text-right">Stocked batches</th><th className="px-5 py-4 text-right">Stock value</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {matchingWarehouses.map((item) => <tr key={item.id}><td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">{item.name}</td><td className="px-5 py-4 text-right">{formatQuantity(item.quantity)}</td><td className="px-5 py-4 text-right">{item.batchCount}</td><td className="px-5 py-4 text-right font-semibold text-emerald-700 dark:text-emerald-400">{money(item.value)}</td></tr>)}
              </tbody>
            </table>
            {matchingWarehouses.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No warehouses match this filter.</div>}
          </div>
        )}
      </div>
    </section>
  )
}
