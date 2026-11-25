import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Package,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Users,
  Warehouse,
  X,
  Zap,
} from "lucide-react"
import { useERP } from "../context/ERPContext"
import { useAuth } from "../auth/AuthProvider"
import { buildERPAssistantIndex, searchERPAssistant, type ERPAssistantCategory } from "../lib/erpAssistantSearch"

const categories: { value: ERPAssistantCategory; label: string }[] = [
  { value: "all", label: "All records" },
  { value: "sales", label: "Sales & invoices" },
  { value: "customers", label: "Customers" },
  { value: "products", label: "Products" },
  { value: "purchases", label: "Purchases" },
  { value: "suppliers", label: "Suppliers" },
  { value: "stock", label: "Stock & batches" },
  { value: "finance", label: "Payments & accounts" },
  { value: "operations", label: "Operations" },
]

const suggestions = [
  "Show today's sales with invoice numbers and amounts",
  "Which customers purchased from us today?",
  "Show sales for Rameez this month",
  "Find invoice INV-1001",
  "Which products are low in stock?",
  "Show products expiring in the next 30 days",
  "Summarise purchases by supplier this month",
]

const typeIcons: Record<string, typeof FileText> = {
  "Sale / invoice": ShoppingCart,
  Customer: Users,
  Product: Package,
  Purchase: FileText,
  "Supplier invoice": FileText,
  Supplier: Building2,
  "Stock batch": Warehouse,
  "Stock movement": RotateCcw,
  "Sales return": RotateCcw,
  "Purchase return": RotateCcw,
  "Customer payment": CheckCircle2,
  "Payment reconciliation": CheckCircle2,
  Warehouse,
  "Storage location": Warehouse,
}

function formatDate(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(value.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 2,
  }).format(value)
}

export default function AI() {
  const navigate = useNavigate()
  const { activeCompany } = useAuth()
  const {
    products,
    customers,
    sales,
    purchases,
    suppliers,
    supplierInvoices,
    purchaseReturns,
    salesReturns,
    inventoryLots,
    inventoryMovements,
    warehouses,
    storageLocations,
    customerPayments,
    paymentReconciliations,
    purchaseRequisitions,
    purchaseOrders,
    stockTransfers,
    stockCounts,
    dailyRegisters,
    dailyCashMovements,
    chartOfAccounts,
    journalEntries,
    cloudSyncStatus,
  } = useERP()

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<ERPAssistantCategory>("all")

  const searchIndex = useMemo(() => buildERPAssistantIndex({
    products,
    customers,
    sales,
    purchases,
    suppliers,
    supplierInvoices,
    purchaseReturns,
    salesReturns,
    inventoryLots,
    inventoryMovements,
    warehouses,
    storageLocations,
    customerPayments,
    paymentReconciliations,
    purchaseRequisitions,
    purchaseOrders,
    stockTransfers,
    stockCounts,
    dailyRegisters,
    dailyCashMovements,
    chartOfAccounts,
    journalEntries,
  }), [
    products,
    customers,
    sales,
    purchases,
    suppliers,
    supplierInvoices,
    purchaseReturns,
    salesReturns,
    inventoryLots,
    inventoryMovements,
    warehouses,
    storageLocations,
    customerPayments,
    paymentReconciliations,
    purchaseRequisitions,
    purchaseOrders,
    stockTransfers,
    stockCounts,
    dailyRegisters,
    dailyCashMovements,
    chartOfAccounts,
    journalEntries,
  ])

  const searchResult = useMemo(
    () => searchERPAssistant(searchIndex, query, category),
    [searchIndex, query, category],
  )

  const uniqueCustomers = useMemo(() => {
    if (!/which customers|who purchased|customers purchased/i.test(query)) return []
    return [...new Set(searchResult.results
      .filter((record) => record.type === "Sale / invoice")
      .map((record) => {
        const match = /Customer Name: ([^·]+)/i.exec(record.detail)
        return match?.[1]?.trim() ?? ""
      })
      .filter(Boolean))]
  }, [query, searchResult.results])

  function runSuggestion(value: string) {
    setQuery(value)
    setCategory("all")
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6 dark:bg-[#0d1510]">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl border border-emerald-900 bg-gradient-to-r from-[#123525] to-[#20543a] p-5 text-white shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-emerald-100">
              <Search className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">ERP Assistant</h1>
              <p className="mt-1 text-sm text-emerald-50/75">
                Instant search across your ERP records. No AI response delay.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-50">
              <Zap className="h-3.5 w-3.5" /> Direct ERP search
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/80">
              <ShieldCheck className="h-3.5 w-3.5" /> Read-only
            </span>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <main className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
            <div className="border-b border-slate-100 p-4 md:p-5 dark:border-slate-700">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {activeCompany?.companyName || "Current company"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Search customers, sales, invoices, products, purchases, suppliers, stock and more.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {cloudSyncStatus === "saved" ? "ERP data synced" : "Searching loaded ERP data"}
                </span>
              </div>

              <label htmlFor="erp-assistant-search" className="sr-only">Search ERP records</label>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-900">
                <Search className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <input
                  id="erp-assistant-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by customer, invoice number, product, barcode, supplier, date…"
                  autoComplete="off"
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCategory(item.value)}
                    aria-pressed={category === item.value}
                    className={"rounded-full border px-3 py-1.5 text-xs font-medium transition " + (
                      category === item.value
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-emerald-950/30"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {!query.trim() ? (
              <div className="p-5 md:p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Quick searches</h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => runSuggestion(item)}
                      className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-emerald-950/30"
                    >
                      <span>{item}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    </button>
                  ))}
                </div>
                <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  Results are matched directly against records already available in this ERP workspace. This screen does not send your question to Gemini or another AI service.
                </p>
              </div>
            ) : (
              <div className="p-4 md:p-5" aria-live="polite">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {searchResult.total.toLocaleString()} matching record{searchResult.total === 1 ? "" : "s"}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {searchResult.periodLabel ? searchResult.periodLabel + " · " : ""}Instant local match
                    </p>
                  </div>
                  {searchResult.totalAmount !== null && (
                    <div className="rounded-xl bg-emerald-50 px-4 py-2 text-right dark:bg-emerald-950/40">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Matched total</p>
                      <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{formatMoney(searchResult.totalAmount)}</p>
                    </div>
                  )}
                </div>

                {uniqueCustomers.length > 0 && (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Customers with matching sales</p>
                    <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-100">{uniqueCustomers.join(", ")}</p>
                  </div>
                )}

                {searchResult.results.length > 0 ? (
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                    {searchResult.results.map((record) => {
                      const Icon = typeIcons[record.type] || FileText
                      return (
                        <button
                          key={record.category + "-" + record.id}
                          type="button"
                          onClick={() => navigate(record.path)}
                          className="flex w-full items-center gap-3 px-3 py-3.5 text-left transition hover:bg-emerald-50/60 sm:px-4 dark:hover:bg-emerald-950/25"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{record.title}</span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{record.type}</span>
                              {record.lowStock && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">Low stock</span>}
                            </span>
                            {record.detail && <span className="mt-1 block break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{record.detail}</span>}
                            <span className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
                              {record.date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(record.date)}</span>}
                              {record.expiry && <span>Expiry {formatDate(record.expiry)}</span>}
                              {record.currentStock !== undefined && <span>Available: {record.currentStock}</span>}
                              {record.amount !== undefined && <span className="font-semibold text-slate-600 dark:text-slate-300">{formatMoney(record.amount)}</span>}
                            </span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-5 py-12 text-center dark:border-slate-700">
                    <Search className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No matching ERP records</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try an invoice number, customer name, product name, barcode, supplier or a date such as “today”.</p>
                  </div>
                )}

                {searchResult.total > searchResult.results.length && (
                  <p className="mt-3 text-center text-xs text-slate-400">
                    Showing the first {searchResult.results.length} of {searchResult.total.toLocaleString()} matches. Add more detail to narrow the search.
                  </p>
                )}
              </div>
            )}
          </main>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-600" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">What it searches</h2>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Sales, invoices and customer purchase history",
                  "Products, SKU, barcode and stock quantity",
                  "Batches, supplier details and expiry dates",
                  "Purchases, GRNs and supplier invoices",
                  "Payments, returns and reconciliations",
                  "Warehouses, transfers, counts and registers",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">How results work</p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                The search reads ERP records already loaded for this signed-in company. It does not call Gemini, OpenRouter, or an external search service, and it cannot create, edit, approve or delete records.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </section>
  )
}
