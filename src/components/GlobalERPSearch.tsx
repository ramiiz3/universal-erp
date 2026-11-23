import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowUpRight,
  Search,
  X,
  Users,
  Package,
  ShoppingCart,
  Warehouse,
} from "lucide-react"
import { useERP } from "../context/ERPContext"

type SearchRecord = {
  id: string
  type: string
  title: string
  detail: string
  path: string
  haystack: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : {}
}

function displayValue(value: unknown, key: string): string {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value === "boolean") return value ? "Active" : "Inactive"
  if (typeof value === "object") return ""
  const text = String(value)
  if (/(createdAt|updatedAt|date|expiry)$/i.test(key) && !Number.isNaN(Date.parse(text))) {
    return new Date(text).toLocaleDateString()
  }
  return text
}

function firstValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = displayValue(row[key], key)
    if (value) return value
  }
  return ""
}

export default function GlobalERPSearch() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const {
    products,
    customers,
    sales,
    purchases,
    suppliers,
    supplierInvoices,
    inventoryLots,
    inventoryMovements,
    warehouses,
    storageLocations,
    customerPayments,
    paymentReconciliations,
    salesReturns,
    purchaseRequisitions,
    purchaseOrders,
    stockTransfers,
    stockCounts,
    dailyRegisters,
    chartOfAccounts,
    journalEntries,
  } = useERP()

  const records = useMemo(() => {
    const output: SearchRecord[] = []

    const add = (
      items: readonly unknown[],
      type: string,
      titleKeys: string[],
      detailKeys: string[],
      path: string,
    ) => {
      items.forEach((value, index) => {
        const row = asRecord(value)
        const title = firstValue(row, titleKeys) || firstValue(row, ["name", "id"]) || type
        const detail = detailKeys
          .map((key) => displayValue(row[key], key))
          .filter(Boolean)
          .slice(0, 4)
          .join(" · ")
        let searchable = ""
        try {
          searchable = JSON.stringify(value) || ""
        } catch {
          searchable = title + " " + detail
        }
        output.push({
          id: String(row.id || type + "-" + index),
          type,
          title,
          detail,
          path,
          haystack: (title + " " + detail + " " + searchable).toLowerCase(),
        })
      })
    }

    add(customers, "Customer", ["name"], ["phone", "email", "status"], "/customers")
    add(products, "Product", ["name"], ["sku", "barcode", "brand", "category", "manufacturer"], "/products")
    add(sales, "Sale / invoice", ["invoiceNumber"], ["customerName", "createdAt", "total", "status"], "/sales")
    add(purchases, "Purchase", ["purchaseNumber"], ["supplierName", "supplierInvoice", "createdAt", "total", "status"], "/purchasing")
    add(suppliers, "Supplier", ["name"], ["phone", "email", "status"], "/suppliers")
    add(supplierInvoices, "Supplier invoice", ["invoiceNumber", "supplierInvoice", "referenceNumber", "id"], ["supplierName", "createdAt", "dueDate", "total", "status"], "/supplier-invoices")
    add(inventoryMovements, "Stock movement", ["referenceNumber", "type", "id"], ["productId", "quantity", "reason", "createdAt"], "/stock-ledger")
    add(warehouses, "Warehouse", ["name"], ["code", "address", "manager", "phone"], "/warehouses")
    add(storageLocations, "Storage location", ["name", "code"], ["warehouseId", "zone", "rack", "shelf", "bin"], "/warehouses")
    add(customerPayments, "Customer payment", ["referenceNumber", "receiptNumber", "id"], ["customerName", "paymentMethod", "amount", "createdAt"], "/customer-payments")
    add(paymentReconciliations, "Payment reconciliation", ["referenceNumber", "id"], ["paymentMethod", "status", "createdAt", "amount"], "/payment-reconciliation")
    add(salesReturns, "Sales return", ["returnNumber", "referenceNumber", "id"], ["invoiceNumber", "customerName", "createdAt", "total", "status"], "/sales-returns")
    add(purchaseRequisitions, "Purchase requisition", ["requisitionNumber", "referenceNumber", "id"], ["supplierName", "status", "createdAt"], "/procurement-workflow")
    add(purchaseOrders, "Purchase order", ["purchaseOrderNumber", "orderNumber", "referenceNumber", "id"], ["supplierName", "status", "createdAt", "total"], "/procurement-workflow")
    add(stockTransfers, "Stock transfer", ["transferNumber", "referenceNumber", "id"], ["status", "createdAt", "fromWarehouseName", "toWarehouseName"], "/stock-transfers")
    add(stockCounts, "Stock count", ["countNumber", "referenceNumber", "id"], ["warehouseName", "status", "createdAt"], "/stock-counts")
    add(dailyRegisters, "Daily register", ["businessDate", "date", "id"], ["status", "openingBalance", "closingBalance"], "/daily-register")
    add(chartOfAccounts, "Account", ["accountName", "name", "code"], ["accountType", "status"], "/chart-of-accounts")
    add(journalEntries, "Journal entry", ["referenceNumber", "entryNumber", "description", "id"], ["status", "date", "createdAt"], "/chart-of-accounts")

    const productNames = new Map(products.map((product) => [product.id, product.name]))
    inventoryLots.forEach((lot, index) => {
      const productName = productNames.get(lot.productId) || "Stock batch"
      const detail = [
        "Batch " + (lot.batch || "—"),
        "Expiry " + (lot.expiry || "—"),
        "Qty " + String(lot.quantity),
      ].join(" · ")
      let searchable = ""
      try {
        searchable = JSON.stringify(lot) || ""
      } catch {
        searchable = ""
      }
      output.push({
        id: String(lot.id || "lot-" + index),
        type: "Stock batch",
        title: productName,
        detail,
        path: "/inventory",
        haystack: (productName + " " + detail + " " + searchable).toLowerCase(),
      })
    })

    return output
  }, [
    customers,
    products,
    sales,
    purchases,
    suppliers,
    supplierInvoices,
    inventoryLots,
    inventoryMovements,
    warehouses,
    storageLocations,
    customerPayments,
    paymentReconciliations,
    salesReturns,
    purchaseRequisitions,
    purchaseOrders,
    stockTransfers,
    stockCounts,
    dailyRegisters,
    chartOfAccounts,
    journalEntries,
  ])

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return []
    return records
      .filter((record) => terms.every((term) => record.haystack.includes(term)))
      .sort((left, right) => {
        const leftRank = left.title.toLowerCase().startsWith(query.trim().toLowerCase()) ? 0 : 1
        const rightRank = right.title.toLowerCase().startsWith(query.trim().toLowerCase()) ? 0 : 1
        return leftRank - rightRank || left.title.localeCompare(right.title)
      })
      .slice(0, 10)
  }, [records, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", focusSearch)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", focusSearch)
    }
  }, [])

  function openRecord(path: string) {
    navigate(path)
    setQuery("")
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % results.length)
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + results.length) % results.length)
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault()
      openRecord(results[activeIndex].path)
    }
  }

  const quickLinks = [
    { label: "Customers", path: "/customers", icon: Users },
    { label: "Products", path: "/products", icon: Package },
    { label: "Sales", path: "/sales", icon: ShoppingCart },
    { label: "Inventory", path: "/inventory", icon: Warehouse },
  ]

  return (
    <div ref={rootRef} className="relative mx-2 w-full min-w-[135px] max-w-[390px] flex-1">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:bg-slate-950">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search ERP…"
          aria-label="Search all ERP records"
          aria-expanded={open}
          aria-controls="global-erp-search-results"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(""); setOpen(true); inputRef.current?.focus() }} aria-label="Clear search" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline dark:border-slate-700">⌘ K</span>
        )}
      </div>

      {open && (
        <div id="global-erp-search-results" role="listbox" className="absolute left-0 right-0 top-12 z-[60] max-h-[min(70vh,520px)] min-w-[280px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-[#111a15]">
          {query.trim() ? (
            results.length ? (
              <>
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{results.length} matching records</div>
                {results.map((result, index) => (
                  <button
                    key={result.type + "-" + result.id}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openRecord(result.path)}
                    className={"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition " + (activeIndex === index ? "bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{result.title}</span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{result.type}</span>
                      </span>
                      {result.detail && <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{result.detail}</span>}
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
                <p className="px-3 pb-1 pt-2 text-[10px] text-slate-400">Use ↑ ↓ to navigate, Enter to open, Esc to close</p>
              </>
            ) : (
              <div className="px-4 py-7 text-center">
                <Search className="mx-auto h-5 w-5 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">No matching ERP records</p>
                <p className="mt-1 text-xs text-slate-500">Try an invoice number, customer, product, barcode or date.</p>
              </div>
            )
          ) : (
            <div className="p-2">
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Quick access</p>
              <div className="grid grid-cols-2 gap-2">
                {quickLinks.map(({ label, path, icon: Icon }) => (
                  <button key={path} type="button" onClick={() => openRecord(path)} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-left text-xs font-medium text-slate-700 hover:bg-emerald-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-emerald-950/40">
                    <Icon className="h-4 w-4 text-emerald-600" />
                    {label}
                  </button>
                ))}
              </div>
              <p className="px-2 pb-1 pt-3 text-[11px] text-slate-400">Search customers, invoices, sales, products, suppliers, purchases, batches, stock movements and more.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
