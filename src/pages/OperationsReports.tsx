import { useMemo, useState } from "react"
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Package,
  RotateCcw,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react"
import { useERP } from "../context/ERPContext"
import { isInventoryLotExpired } from "../lib/saleLotAllocation"

type ReportTab = "sales" | "purchases" | "inventory" | "suppliers" | "returns"

const TABS: { id: ReportTab; label: string; icon: typeof BarChart3 }[] = [
  { id: "sales", label: "Sales", icon: ShoppingCart },
  { id: "purchases", label: "Purchases", icon: Package },
  { id: "inventory", label: "Inventory", icon: BarChart3 },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "returns", label: "Returns", icon: RotateCcw },
]

function money(value: number) {
  return `AED ${Number(value || 0).toFixed(2)}`
}

function todayInput() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function monthStartInput() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
}

function inRange(value: string, from: string, to: string) {
  const date = new Date(value).getTime()
  if (!Number.isFinite(date)) return false
  const start = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY
  return date >= start && date <= end
}

function csvCell(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

function Empty({ children }: { children: string }) {
  return <tr><td colSpan={12} className="px-4 py-12 text-center text-sm text-slate-500">{children}</td></tr>
}

export default function OperationsReports() {
  const {
    sales,
    purchases,
    products,
    inventoryLots,
    suppliers,
    purchaseReturns,
    salesReturns,
  } = useERP()

  const [tab, setTab] = useState<ReportTab>("sales")
  const [dateFrom, setDateFrom] = useState(monthStartInput)
  const [dateTo, setDateTo] = useState(todayInput)

  const salesInRange = useMemo(
    () => sales.filter((sale) => inRange(sale.createdAt, dateFrom, dateTo)),
    [sales, dateFrom, dateTo],
  )
  const purchasesInRange = useMemo(
    () => purchases.filter((purchase) => inRange(purchase.createdAt, dateFrom, dateTo)),
    [purchases, dateFrom, dateTo],
  )
  const purchaseReturnsInRange = useMemo(
    () => purchaseReturns.filter((record) => inRange(record.createdAt, dateFrom, dateTo)),
    [purchaseReturns, dateFrom, dateTo],
  )
  const salesReturnsInRange = useMemo(
    () => salesReturns.filter((record) => inRange(record.createdAt, dateFrom, dateTo)),
    [salesReturns, dateFrom, dateTo],
  )

  const salesValue = salesInRange.reduce((sum, sale) => sum + sale.total, 0)
  const salesRefunds = salesReturnsInRange.reduce((sum, record) => sum + record.refundTotal, 0)
  const purchaseValue = purchasesInRange.reduce((sum, purchase) => sum + purchase.total, 0)
  const supplierCredits = purchaseReturnsInRange.reduce((sum, record) => sum + record.totalCreditAmount, 0)
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  const stockRows = useMemo(() => products.map((product) => {
    const lots = inventoryLots.filter((lot) => lot.productId === product.id)
    const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
    const saleableQuantity = lots.filter((lot) => !isInventoryLotExpired(lot)).reduce((sum, lot) => sum + lot.quantity, 0)
    const stockValue = lots.reduce((sum, lot) => sum + Math.max(0, lot.quantity) * Math.max(0, lot.purchasePrice), 0)
    const expiredQuantity = lots.filter((lot) => lot.quantity > 0 && isInventoryLotExpired(lot)).reduce((sum, lot) => sum + lot.quantity, 0)
    const minimum = Math.max(0, product.minimumStock || 0)
    return {
      product,
      lots,
      quantity,
      saleableQuantity,
      stockValue,
      expiredQuantity,
      minimum,
      low: saleableQuantity <= minimum,
    }
  }).sort((a, b) => a.product.name.localeCompare(b.product.name)), [products, inventoryLots])

  const batchRows = useMemo(() => inventoryLots
    .filter((lot) => lot.quantity !== 0)
    .map((lot) => ({
      lot,
      productName: products.find((product) => product.id === lot.productId)?.name || lot.productId,
      stockValue: Math.max(0, lot.quantity) * Math.max(0, lot.purchasePrice),
      expired: isInventoryLotExpired(lot),
    }))
    .sort((a, b) => (a.lot.expiry || "9999").localeCompare(b.lot.expiry || "9999")),
  [inventoryLots, products])

  const supplierRows = useMemo(() => suppliers.map((supplier) => {
    const nameKey = supplier.name.trim().toLowerCase()
    const supplierPurchases = purchases.filter((purchase) =>
      purchase.supplierId === supplier.id ||
      (!purchase.supplierId && purchase.supplierName.trim().toLowerCase() === nameKey),
    )
    const supplierReturns = purchaseReturns.filter((record) =>
      record.supplierId === supplier.id ||
      record.supplierName.trim().toLowerCase() === nameKey,
    )
    const periodPurchases = supplierPurchases.filter((purchase) => inRange(purchase.createdAt, dateFrom, dateTo))
    const periodReturns = supplierReturns.filter((record) => inRange(record.createdAt, dateFrom, dateTo))
    const purchased = periodPurchases.reduce((sum, purchase) => sum + purchase.total, 0)
    const credits = periodReturns.reduce((sum, record) => sum + record.totalCreditAmount, 0)
    return {
      supplier,
      purchaseCount: periodPurchases.length,
      returnCount: periodReturns.length,
      purchased,
      credits,
      net: purchased - credits,
      lastPurchase: periodPurchases.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt ?? "",
    }
  }).sort((a, b) => b.net - a.net), [suppliers, purchases, purchaseReturns, dateFrom, dateTo])

  const exportCurrent = () => {
    const suffix = `${dateFrom || "all"}-${dateTo || "all"}`
    if (tab === "sales") {
      downloadCsv(`zaki-sales-report-${suffix}.csv`,
        ["Date", "Invoice", "Customer", "Customer mobile", "Customer email", "Payment", "Status", "Lines", "Subtotal", "Discount", "VAT", "Total"],
        salesInRange.map((sale) => [sale.createdAt, sale.invoiceNumber, sale.customerName, sale.customerPhone || "", sale.customerEmail || "", sale.paymentMethod, sale.status, sale.items.length, sale.subtotal, sale.discount, sale.vat, sale.total]))
    } else if (tab === "purchases") {
      downloadCsv(`zaki-purchase-report-${suffix}.csv`,
        ["Date", "Purchase", "GRN", "Supplier", "Supplier invoice", "Lines", "Subtotal", "Total"],
        purchasesInRange.map((purchase) => [purchase.createdAt, purchase.purchaseNumber, purchase.grnNumber || "", purchase.supplierName, purchase.supplierInvoice, purchase.items.length, purchase.subtotal, purchase.total]))
    } else if (tab === "inventory") {
      downloadCsv("zaki-inventory-report-current.csv",
        ["Product", "SKU", "Stock unit", "Total stock", "Saleable stock", "Minimum stock", "Expired quantity", "Stock value", "Positive batches"],
        stockRows.map((row) => [row.product.name, row.product.sku, row.product.unit, row.quantity, row.saleableQuantity, row.minimum, row.expiredQuantity, row.stockValue, row.lots.filter((lot) => lot.quantity > 0).length]))
    } else if (tab === "suppliers") {
      downloadCsv(`zaki-supplier-report-${suffix}.csv`,
        ["Supplier", "Purchases", "Purchase count", "Returns", "Return count", "Net purchases", "Last purchase"],
        supplierRows.map((row) => [row.supplier.name, row.purchased, row.purchaseCount, row.credits, row.returnCount, row.net, row.lastPurchase]))
    } else {
      downloadCsv(`zaki-returns-report-${suffix}.csv`,
        ["Type", "Return number", "Original reference", "Supplier / customer", "Date", "Items", "Reason", "Refund / credit"],
        [
          ...salesReturnsInRange.map((record) => ["Sales return", record.returnNumber, record.invoiceNumber, record.customerName, record.createdAt, record.items.map((item) => `${item.productName} × ${item.quantity}`).join("; "), record.reason, record.refundTotal]),
          ...purchaseReturnsInRange.map((record) => ["Purchase return", record.returnNumber, record.purchaseNumber, record.supplierName, record.createdAt, record.items.map((item) => `${item.productName} × ${item.quantity}`).join("; "), record.reason, record.totalCreditAmount]),
        ])
    }
  }

  const periodLabel = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : "All recorded dates"

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><FileSpreadsheet className="h-6 w-6 text-slate-700"/><h1 className="text-2xl font-semibold text-slate-900">Operations Reports</h1></div>
            <p className="mt-1 text-sm text-slate-500">Purchase, sales, inventory, supplier and return reports from recorded ERP transactions.</p>
          </div>
          <button type="button" onClick={exportCurrent} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Download className="h-4 w-4"/>Export CSV</button>
        </header>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <label className="text-xs font-semibold text-slate-600">From<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label>
          <label className="text-xs font-semibold text-slate-600">To<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label>
          <span className="pb-2 text-xs text-slate-500">Period: {periodLabel}</span>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Operations report type">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${tab === id ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><Icon className="h-4 w-4"/>{label}</button>
          ))}
        </nav>

        {tab === "sales" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Sales value" value={money(salesValue)} detail={`${salesInRange.length} invoices`}/>
              <Stat label="Sales returns" value={money(salesRefunds)} detail={`${salesReturnsInRange.length} returns`}/>
              <Stat label="Net after refunds" value={money(salesValue - salesRefunds)}/>
              <Stat label="VAT recorded" value={money(salesInRange.reduce((sum, sale) => sum + sale.vat, 0))}/>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Mobile / email</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Discount</th><th className="px-4 py-3 text-right">VAT</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {salesInRange.map((sale) => <tr key={sale.id}><td className="px-4 py-3">{new Date(sale.createdAt).toLocaleDateString("en-GB")}</td><td className="px-4 py-3 font-semibold">{sale.invoiceNumber}</td><td className="px-4 py-3">{sale.customerName}</td><td className="px-4 py-3 text-xs text-slate-600">{sale.customerPhone || "—"}<br/>{sale.customerEmail || ""}</td><td className="px-4 py-3">{sale.paymentMethod}</td><td className="px-4 py-3">{sale.status}</td><td className="px-4 py-3 text-right">{money(sale.discount)}</td><td className="px-4 py-3 text-right">{money(sale.vat)}</td><td className="px-4 py-3 text-right font-semibold">{money(sale.total)}</td></tr>)}
                  {salesInRange.length === 0 && <Empty>No sales were recorded in this date range.</Empty>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "purchases" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Purchase value" value={money(purchaseValue)} detail={`${purchasesInRange.length} purchase receipts`}/>
              <Stat label="Purchase returns" value={money(supplierCredits)} detail={`${purchaseReturnsInRange.length} supplier returns`}/>
              <Stat label="Net purchases" value={money(purchaseValue - supplierCredits)}/>
              <Stat label="Products received" value={String(purchasesInRange.reduce((sum, purchase) => sum + purchase.items.length, 0))} detail="Purchase lines"/>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Purchase / GRN</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Supplier invoice</th><th className="px-4 py-3">Items</th><th className="px-4 py-3 text-right">Subtotal</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {purchasesInRange.map((purchase) => <tr key={purchase.id}><td className="px-4 py-3">{new Date(purchase.createdAt).toLocaleDateString("en-GB")}</td><td className="px-4 py-3"><p className="font-semibold">{purchase.purchaseNumber}</p><p className="text-[10px] text-slate-500">GRN {purchase.grnNumber || "—"}</p></td><td className="px-4 py-3">{purchase.supplierName}</td><td className="px-4 py-3">{purchase.supplierInvoice || "—"}</td><td className="px-4 py-3">{purchase.items.length}</td><td className="px-4 py-3 text-right">{money(purchase.subtotal)}</td><td className="px-4 py-3 text-right font-semibold">{money(purchase.total)}</td></tr>)}
                  {purchasesInRange.length === 0 && <Empty>No purchases were recorded in this date range.</Empty>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "inventory" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Products" value={String(stockRows.length)}/>
              <Stat label="Saleable units" value={stockRows.reduce((sum, row) => sum + row.saleableQuantity, 0).toLocaleString()}/>
              <Stat label="Low / reorder" value={String(stockRows.filter((row) => row.low).length)}/>
              <Stat label="Recorded stock cost" value={money(stockRows.reduce((sum, row) => sum + row.stockValue, 0))}/>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Stock unit</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Saleable</th><th className="px-4 py-3 text-right">Minimum</th><th className="px-4 py-3 text-right">Expired</th><th className="px-4 py-3 text-right">Cost value</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {stockRows.map((row) => <tr key={row.product.id}><td className="px-4 py-3 font-semibold">{row.product.name}</td><td className="px-4 py-3">{row.product.sku || "—"}</td><td className="px-4 py-3">{row.product.unit}</td><td className="px-4 py-3 text-right">{row.quantity}</td><td className="px-4 py-3 text-right font-semibold">{row.saleableQuantity}</td><td className="px-4 py-3 text-right">{row.minimum}</td><td className="px-4 py-3 text-right">{row.expiredQuantity}</td><td className="px-4 py-3 text-right">{money(row.stockValue)}</td><td className="px-4 py-3">{row.low ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Reorder</span> : "OK"}</td></tr>)}
                  {stockRows.length === 0 && <Empty>No products are configured.</Empty>}
                </tbody>
              </table>
            </div>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="font-semibold text-slate-800">Batch and expiry detail</h3>
                  <p className="mt-1 text-xs text-slate-500">Current remaining quantity by supplier batch, with expiry and purchase cost.</p>
                </div>
                <button type="button" onClick={() => downloadCsv("zaki-inventory-batch-report-current.csv",
                  ["Product", "Supplier", "Batch", "GRN", "Expiry", "Stock", "Stock unit", "Unit cost", "Stock value", "Status"],
                  batchRows.map((row) => [row.productName, row.lot.supplierName || "Supplier not recorded", row.lot.batch, row.lot.grnNumber || "", row.lot.expiry, row.lot.quantity, productById.get(row.lot.productId)?.unit || "", row.lot.purchasePrice, row.stockValue, row.expired ? "Expired" : "Valid"]))
                } className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"><Download className="h-3.5 w-3.5"/>Export batch CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-white text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Batch / GRN</th><th className="px-4 py-3">Expiry</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Unit cost</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchRows.map((row) => <tr key={row.lot.id}><td className="px-4 py-3 font-medium">{row.productName}</td><td className="px-4 py-3">{row.lot.supplierName || "Supplier not recorded"}</td><td className="px-4 py-3"><p>{row.lot.batch || "—"}</p><p className="text-[10px] text-slate-500">{row.lot.grnNumber || "—"}</p></td><td className="px-4 py-3">{row.lot.expiry || "Not recorded"}</td><td className="px-4 py-3 text-right">{row.lot.quantity} {productById.get(row.lot.productId)?.unit || ""}</td><td className="px-4 py-3 text-right">{money(row.lot.purchasePrice)}</td><td className="px-4 py-3 text-right font-semibold">{money(row.stockValue)}</td><td className="px-4 py-3">{row.expired ? <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Expired</span> : "Valid"}</td></tr>)}
                    {batchRows.length === 0 && <Empty>No stock batches are currently recorded.</Empty>}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="text-xs text-slate-500">Inventory is a current on-hand snapshot, not a historical as-of-date valuation. Cost value uses the saved purchase cost on each remaining batch.</p>
          </>
        )}

        {tab === "suppliers" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Suppliers" value={String(supplierRows.length)}/>
              <Stat label="Purchased" value={money(supplierRows.reduce((sum, row) => sum + row.purchased, 0))}/>
              <Stat label="Return credits" value={money(supplierRows.reduce((sum, row) => sum + row.credits, 0))}/>
              <Stat label="Net purchases" value={money(supplierRows.reduce((sum, row) => sum + row.net, 0))}/>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3 text-right">Purchases</th><th className="px-4 py-3 text-right">Purchase count</th><th className="px-4 py-3 text-right">Return credits</th><th className="px-4 py-3 text-right">Return count</th><th className="px-4 py-3 text-right">Net purchases</th><th className="px-4 py-3">Last purchase</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierRows.map((row) => <tr key={row.supplier.id}><td className="px-4 py-3 font-semibold">{row.supplier.name}</td><td className="px-4 py-3 text-right">{money(row.purchased)}</td><td className="px-4 py-3 text-right">{row.purchaseCount}</td><td className="px-4 py-3 text-right">{money(row.credits)}</td><td className="px-4 py-3 text-right">{row.returnCount}</td><td className="px-4 py-3 text-right font-semibold">{money(row.net)}</td><td className="px-4 py-3">{row.lastPurchase ? new Date(row.lastPurchase).toLocaleDateString("en-GB") : "—"}</td></tr>)}
                  {supplierRows.length === 0 && <Empty>No suppliers are configured.</Empty>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">This is a purchase/return activity report, not an accounts-payable balance. Supplier invoice payment and outstanding balances are reported separately in Supplier Invoices.</p>
          </>
        )}

        {tab === "returns" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Sales returns" value={money(salesRefunds)} detail={`${salesReturnsInRange.length} records`}/>
              <Stat label="Purchase returns" value={money(supplierCredits)} detail={`${purchaseReturnsInRange.length} records`}/>
              <Stat label="Sales units returned" value={salesReturnsInRange.reduce((sum, record) => sum + record.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0).toLocaleString()}/>
              <Stat label="Supplier units returned" value={purchaseReturnsInRange.reduce((sum, record) => sum + record.totalBaseQuantity, 0).toLocaleString()}/>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Return number</th><th className="px-4 py-3">Original reference</th><th className="px-4 py-3">Customer / supplier</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">Refund / credit</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ...salesReturnsInRange.map((record) => ({ key: record.id, type: "Sales return", number: record.returnNumber, reference: record.invoiceNumber, party: record.customerName, createdAt: record.createdAt, reason: record.reason, amount: record.refundTotal })),
                    ...purchaseReturnsInRange.map((record) => ({ key: record.id, type: "Purchase return", number: record.returnNumber, reference: record.purchaseNumber, party: record.supplierName, createdAt: record.createdAt, reason: record.reason, amount: record.totalCreditAmount })),
                  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((record) => <tr key={record.key}><td className="px-4 py-3">{record.type}</td><td className="px-4 py-3 font-semibold">{record.number}</td><td className="px-4 py-3">{record.reference}</td><td className="px-4 py-3">{record.party}</td><td className="px-4 py-3">{new Date(record.createdAt).toLocaleDateString("en-GB")}</td><td className="px-4 py-3">{record.reason}</td><td className="px-4 py-3 text-right font-semibold">{money(record.amount)}</td></tr>)}
                  {salesReturnsInRange.length + purchaseReturnsInRange.length === 0 && <Empty>No returns were recorded in this date range.</Empty>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
