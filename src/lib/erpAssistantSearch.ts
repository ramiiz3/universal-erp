export type ERPAssistantCategory =
  | "all" | "sales" | "customers" | "products" | "purchases"
  | "suppliers" | "stock" | "finance" | "operations"

export type ERPAssistantCollections = {
  products: readonly unknown[]
  customers: readonly unknown[]
  sales: readonly unknown[]
  purchases: readonly unknown[]
  suppliers: readonly unknown[]
  supplierInvoices: readonly unknown[]
  purchaseReturns: readonly unknown[]
  salesReturns: readonly unknown[]
  inventoryLots: readonly unknown[]
  inventoryMovements: readonly unknown[]
  warehouses: readonly unknown[]
  storageLocations: readonly unknown[]
  customerPayments: readonly unknown[]
  paymentReconciliations: readonly unknown[]
  purchaseRequisitions: readonly unknown[]
  purchaseOrders: readonly unknown[]
  stockTransfers: readonly unknown[]
  stockCounts: readonly unknown[]
  dailyRegisters: readonly unknown[]
  dailyCashMovements: readonly unknown[]
  chartOfAccounts: readonly unknown[]
  journalEntries: readonly unknown[]
}

export type ERPAssistantRecord = {
  id: string
  type: string
  category: Exclude<ERPAssistantCategory, "all">
  title: string
  detail: string
  path: string
  searchText: string
  date?: string
  expiry?: string
  amount?: number
  currentStock?: number
  minimumStock?: number
  lowStock?: boolean
}

export type ERPAssistantSearchResult = {
  results: ERPAssistantRecord[]
  total: number
  totalAmount: number | null
  periodLabel: string | null
  queryLabel: string
}

type DateRange = { start: Date; end: Date; label: string; future: boolean }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(" ")
  return ""
}

function firstValue(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const text = valueText(row[key]).trim()
    if (text) return text
  }
  return ""
}

function primaryDate(row: Record<string, unknown>, keys: readonly string[]): string | undefined {
  return firstValue(row, keys) || undefined
}

function numericValue(row: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}

function safeSearchText(value: unknown): string {
  try { return JSON.stringify(value) || "" } catch { return "" }
}

function normalized(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "by", "can", "could",
  "did", "do", "does", "for", "from", "get", "give", "has", "have", "how",
  "i", "in", "is", "it", "me", "my", "of", "on", "our", "please", "show",
  "the", "them", "there", "this", "to", "us", "was", "we", "were", "what",
  "when", "where", "which", "who", "with", "would", "you", "your", "find",
  "search", "list", "tell", "about", "details", "detail", "summary", "report",
  "reports", "all", "any", "much", "many", "number", "numbers", "total",
  "today", "todays", "yesterday", "yesterdays", "month", "months", "week",
  "weeks", "year", "years", "last", "next", "current", "previous", "past",
  "days", "day", "date", "between", "during", "within", "recent",
  "sale", "sales", "sold", "sell", "selling", "bought", "buy", "buys",
  "purchased", "purchase", "purchases", "purchasing", "invoice", "invoices",
  "customer", "customers", "client", "clients", "buyer", "buyers",
  "product", "products", "item", "items", "medicine", "medicines",
  "supplier", "suppliers", "vendor", "vendors", "stock", "inventory",
  "batch", "batches", "expiry", "expire", "expires", "expiring", "expired",
  "low", "reorder", "below", "minimum", "payment", "payments", "paid",
  "cash", "bank", "transfer", "transfers", "account", "accounts",
  "warehouse", "warehouses", "movement", "movements", "return", "returns",
  "reconciliation", "requisitions", "requisition", "orders", "order",
  "count", "counts", "register", "registers", "journal", "journals",
  "amount", "amounts", "number", "numbers", "with", "from", "us",
])

function localStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseDateValue(value: string | undefined): Date | null {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dateOnly) {
    const parsed = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseDateRange(query: string, now: Date): DateRange | null {
  const q = normalized(query)
  const today = localStartOfDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (/\btoday\b/.test(q)) return { start: today, end: tomorrow, label: "Today", future: false }
  if (/\byesterday\b/.test(q)) {
    const start = new Date(today)
    start.setDate(start.getDate() - 1)
    return { start, end: today, label: "Yesterday", future: false }
  }
  if (/\bthis month\b|\bcurrent month\b/.test(q)) {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1), label: "This month", future: false }
  }
  if (/\blast month\b|\bprevious month\b/.test(q)) {
    return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1), label: "Last month", future: false }
  }
  if (/\bthis week\b|\bcurrent week\b/.test(q)) {
    const start = new Date(today)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end, label: "This week", future: false }
  }

  const nextDays = /\bnext\s+(\d{1,3})\s+days?\b/.exec(q)
  if (nextDays) {
    const end = new Date(today)
    end.setDate(end.getDate() + Math.max(1, Math.min(365, Number(nextDays[1])) + 1))
    return { start: today, end, label: "Next " + nextDays[1] + " days", future: true }
  }

  const lastDays = /\blast\s+(\d{1,3})\s+days?\b/.exec(q)
  if (lastDays) {
    const start = new Date(today)
    start.setDate(start.getDate() - Math.max(1, Math.min(365, Number(lastDays[1]))))
    return { start, end: tomorrow, label: "Last " + lastDays[1] + " days", future: false }
  }

  const explicit = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(query)
    ?? /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(query)
  if (explicit) {
    const isIso = explicit[1].length === 4
    const year = Number(isIso ? explicit[1] : explicit[3])
    const month = Number(explicit[2])
    const day = Number(isIso ? explicit[3] : explicit[1])
    const start = new Date(year, month - 1, day)
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      return { start, end, label: start.toLocaleDateString(), future: start >= today }
    }
  }
  return null
}

function recordMatchesPeriod(record: ERPAssistantRecord, range: DateRange, useExpiry: boolean): boolean {
  const candidate = parseDateValue(useExpiry ? record.expiry : record.date)
  return Boolean(candidate && candidate >= range.start && candidate < range.end)
}

function hasAny(query: string, pattern: RegExp): boolean {
  return pattern.test(query)
}

function inferGroups(query: string): Exclude<ERPAssistantCategory, "all">[] | null {
  const q = normalized(query)
  const lowStock = /\blow stock\b|\bout of stock\b|\bbelow reorder\b|\breorder\b/.test(q)
  const expiry = /\bexpir|\bexpired\b|\bexpiring\b|\bbatch\b/.test(q)
  const sale = hasAny(q, /\bsales?\b|\binvoices?\b|\bsold\b|\bbought\b|\bpurchased\b|\bbilling\b|\brevenue\b/)
  const purchase = hasAny(q, /\bpurchases?\b|\bpurchasing\b|\bgrn\b|\bgoods received\b|\bsupplier invoice\b/)
  const customer = hasAny(q, /\bcustomers?\b|\bclients?\b|\bbuyers?\b/)
  const product = hasAny(q, /\bproducts?\b|\bitems?\b|\bmedicines?\b/)
  const supplier = hasAny(q, /\bsuppliers?\b|\bvendors?\b/)
  const stock = hasAny(q, /\bstock\b|\binventory\b|\bbatch\b|\bexpiry\b|\bexpired\b|\bexpiring\b/)
  const finance = hasAny(q, /\bpayments?\b|\bcash\b|\breconciliation\b|\baccounts?\b|\bjournal\b/)
  const operations = hasAny(q, /\bwarehouses?\b|\btransfers?\b|\bcounts?\b|\bregisters?\b|\bmovement\b/)

  if (lowStock) return ["products"]
  if (expiry) return ["stock"]
  if (customer && sale) return ["sales"]
  if (sale) return ["sales"]
  if (purchase) return ["purchases"]
  if (supplier) return customer ? ["suppliers", "purchases"] : ["suppliers"]
  if (customer) return ["customers"]
  if (product) return ["products"]
  if (finance) return ["finance"]
  if (operations) return ["operations"]
  if (stock) return ["products", "stock"]
  return null
}

function remainingTerms(query: string): string[] {
  return normalized(query).split(/\s+/).filter((term) => term.length > 1 && !STOP_WORDS.has(term))
}

function addRecords(
  output: ERPAssistantRecord[],
  items: readonly unknown[],
  type: string,
  category: Exclude<ERPAssistantCategory, "all">,
  titleKeys: readonly string[],
  detailKeys: readonly string[],
  path: string,
  dateKeys: readonly string[],
  amountKeys: readonly string[] = ["total", "amount"],
) {
  items.forEach((value, index) => {
    const row = asRecord(value)
    const title = firstValue(row, titleKeys) || firstValue(row, ["name", "id"]) || type
    const detail = detailKeys.map((key) => {
      const item = valueText(row[key]).trim()
      return item ? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) + ": " + item : ""
    }).filter(Boolean).slice(0, 5).join(" · ")
    const date = primaryDate(row, dateKeys)
    const amount = numericValue(row, amountKeys)
    output.push({
      id: String(row.id ?? type + "-" + index),
      type, category, title, detail, path,
      searchText: normalized(type + " " + title + " " + detail + " " + safeSearchText(value)),
      date, amount,
    })
  })
}

export function buildERPAssistantIndex(data: ERPAssistantCollections): ERPAssistantRecord[] {
  const output: ERPAssistantRecord[] = []
  const productNames = new Map<string, string>()
  const stockByProduct = new Map<string, number>()

  data.products.forEach((item) => {
    const row = asRecord(item)
    if (typeof row.id === "string") productNames.set(row.id, String(row.name ?? "Product"))
  })
  data.inventoryLots.forEach((item) => {
    const row = asRecord(item)
    const productId = String(row.productId ?? "")
    stockByProduct.set(productId, (stockByProduct.get(productId) ?? 0) + (numericValue(row, ["quantity"]) ?? 0))
  })

  data.products.forEach((value, index) => {
    const row = asRecord(value)
    const title = firstValue(row, ["name", "id"]) || "Product"
    const stock = stockByProduct.get(String(row.id ?? "")) ?? 0
    const minimumStock = numericValue(row, ["minimumStock"]) ?? 0
    const unit = firstValue(row, ["unit"])
    const detail = [
      firstValue(row, ["genericName", "brand", "category", "sku"]),
      "Stock: " + stock + (unit ? " " + unit : ""),
      "Reorder level: " + minimumStock,
      firstValue(row, ["barcode"]),
      firstValue(row, ["status"]),
    ].filter(Boolean).join(" · ")
    output.push({
      id: String(row.id ?? "product-" + index),
      type: "Product",
      category: "products",
      title, detail, path: "/products",
      searchText: normalized("product " + safeSearchText(value) + " " + title + " " + detail + " stock low stock"),
      currentStock: stock,
      minimumStock,
      lowStock: stock <= minimumStock,
    })
  })

  addRecords(output, data.customers, "Customer", "customers", ["name"], ["phone", "email", "status", "loyaltyPoints"], "/customers", ["createdAt", "date"], [])
  addRecords(output, data.sales, "Sale / invoice", "sales", ["invoiceNumber"], ["customerName", "createdAt", "total", "paymentMethod", "status"], "/sales", ["createdAt", "date"], ["total"])
  addRecords(output, data.purchases, "Purchase", "purchases", ["purchaseNumber"], ["supplierName", "supplierInvoice", "createdAt", "total", "status"], "/purchasing", ["createdAt", "purchaseDate", "date"], ["total"])
  addRecords(output, data.suppliers, "Supplier", "suppliers", ["name"], ["phone", "email", "status"], "/suppliers", ["createdAt", "date"], [])
  addRecords(output, data.supplierInvoices, "Supplier invoice", "purchases", ["invoiceNumber", "supplierInvoice", "referenceNumber", "id"], ["supplierName", "createdAt", "dueDate", "total", "status"], "/supplier-invoices", ["createdAt", "invoiceDate", "date", "dueDate"], ["total", "amount"])
  addRecords(output, data.purchaseReturns, "Purchase return", "purchases", ["returnNumber"], ["purchaseNumber", "supplierName", "creditNoteReference", "createdAt", "totalCreditAmount"], "/purchase-returns", ["createdAt", "date"], ["totalCreditAmount", "total"])
  addRecords(output, data.salesReturns, "Sales return", "sales", ["returnNumber", "referenceNumber", "id"], ["invoiceNumber", "customerName", "createdAt", "total", "status"], "/sales-returns", ["createdAt", "date"], ["total"])
  addRecords(output, data.customerPayments, "Customer payment", "finance", ["referenceNumber", "receiptNumber", "id"], ["customerName", "paymentMethod", "amount", "createdAt"], "/customer-payments", ["createdAt", "date"], ["amount"])
  addRecords(output, data.paymentReconciliations, "Payment reconciliation", "finance", ["referenceNumber", "id"], ["paymentMethod", "status", "createdAt", "amount"], "/payment-reconciliation", ["createdAt", "date"], ["amount"])
  addRecords(output, data.inventoryMovements, "Stock movement", "stock", ["referenceNumber", "type", "id"], ["productId", "quantity", "reason", "createdAt"], "/stock-ledger", ["createdAt", "date"], [])
  addRecords(output, data.warehouses, "Warehouse", "operations", ["name"], ["code", "address", "manager", "phone"], "/warehouses", ["createdAt", "date"], [])
  addRecords(output, data.storageLocations, "Storage location", "operations", ["name", "code"], ["warehouseId", "zone", "rack", "shelf", "bin"], "/warehouses", ["createdAt", "date"], [])
  addRecords(output, data.purchaseRequisitions, "Purchase requisition", "purchases", ["requisitionNumber", "referenceNumber", "id"], ["supplierName", "status", "createdAt"], "/procurement-workflow", ["createdAt", "date"], [])
  addRecords(output, data.purchaseOrders, "Purchase order", "purchases", ["purchaseOrderNumber", "orderNumber", "referenceNumber", "id"], ["supplierName", "status", "createdAt", "total"], "/procurement-workflow", ["createdAt", "date"], ["total"])
  addRecords(output, data.stockTransfers, "Stock transfer", "stock", ["transferNumber", "referenceNumber", "id"], ["status", "createdAt", "fromWarehouseName", "toWarehouseName"], "/stock-transfers", ["createdAt", "dispatchedAt", "receivedAt"], [])
  addRecords(output, data.stockCounts, "Stock count", "stock", ["countNumber", "referenceNumber", "id"], ["warehouseName", "status", "createdAt"], "/stock-counts", ["createdAt", "date"], [])
  addRecords(output, data.dailyRegisters, "Daily register", "operations", ["businessDate", "date", "id"], ["status", "openingBalance", "closingBalance"], "/daily-register", ["businessDate", "date", "createdAt"], [])
  addRecords(output, data.dailyCashMovements, "Cash movement", "finance", ["referenceNumber", "category", "id"], ["kind", "amount", "businessDate", "note"], "/daily-register", ["businessDate", "createdAt", "date"], ["amount"])
  addRecords(output, data.chartOfAccounts, "Account", "finance", ["accountName", "name", "code"], ["accountType", "status"], "/chart-of-accounts", ["createdAt", "date"], [])
  addRecords(output, data.journalEntries, "Journal entry", "finance", ["referenceNumber", "entryNumber", "description", "id"], ["status", "date", "createdAt"], "/chart-of-accounts", ["date", "createdAt"], ["totalDebit", "amount"])

  data.inventoryLots.forEach((value, index) => {
    const row = asRecord(value)
    const productId = String(row.productId ?? "")
    const productName = productNames.get(productId) ?? "Stock batch"
    const batch = firstValue(row, ["batch", "grnNumber"]) || "—"
    const expiry = primaryDate(row, ["expiry"])
    const quantity = numericValue(row, ["quantity"]) ?? 0
    const detail = [
      "Batch: " + batch,
      expiry ? "Expiry: " + expiry : "Expiry: not recorded",
      "Quantity: " + quantity,
      firstValue(row, ["supplierName"]),
      firstValue(row, ["warehouseId"]),
    ].filter(Boolean).join(" · ")
    output.push({
      id: String(row.id ?? "stock-batch-" + index),
      type: "Stock batch",
      category: "stock",
      title: productName,
      detail,
      path: "/inventory",
      searchText: normalized("stock batch expiry " + safeSearchText(value) + " " + productName + " " + detail),
      expiry,
    })
  })

  return output
}

export function searchERPAssistant(
  index: readonly ERPAssistantRecord[],
  query: string,
  category: ERPAssistantCategory = "all",
  now = new Date(),
): ERPAssistantSearchResult {
  const q = query.trim()
  if (!q) return { results: [], total: 0, totalAmount: null, periodLabel: null, queryLabel: "" }

  const normalizedQuery = normalized(q)
  const groups = category === "all" ? inferGroups(q) : [category]
  const lowStockQuery = /\blow stock\b|\bout of stock\b|\bbelow reorder\b|\breorder\b/.test(normalizedQuery)
  const expiryQuery = /\bexpir|\bexpired\b|\bexpiring\b|\bbatch\b/.test(normalizedQuery)
  const range = parseDateRange(q, now)
  const terms = remainingTerms(q).filter((term) => !(range && expiryQuery && /^\d{1,3}$/.test(term)))

  const matched = index.filter((record) => {
    if (groups && !groups.includes(record.category)) return false
    if (lowStockQuery && (record.category !== "products" || !record.lowStock)) return false
    if (expiryQuery && record.category === "stock" && !record.expiry) return false
    if (range && !recordMatchesPeriod(record, range, expiryQuery && range.future)) return false
    return terms.every((term) => record.searchText.includes(term))
  })

  matched.sort((left, right) => {
    const leftTitle = normalized(left.title)
    const rightTitle = normalized(right.title)
    const leftRank = leftTitle === normalizedQuery ? 0 : leftTitle.startsWith(normalizedQuery) ? 1 : 2
    const rightRank = rightTitle === normalizedQuery ? 0 : rightTitle.startsWith(normalizedQuery) ? 1 : 2
    if (leftRank !== rightRank) return leftRank - rightRank
    const leftDate = parseDateValue(left.expiry || left.date)?.getTime() ?? 0
    const rightDate = parseDateValue(right.expiry || right.date)?.getTime() ?? 0
    return rightDate - leftDate || left.title.localeCompare(right.title)
  })

  const onlySales = Boolean(groups?.length) && groups?.every((item) => item === "sales")
  const onlyPurchases = Boolean(groups?.length) && groups?.every((item) => item === "purchases")
  const totalAmount = onlySales && matched.some((record) => record.type === "Sale / invoice")
    ? matched.filter((record) => record.type === "Sale / invoice").reduce((sum, record) => sum + (record.amount ?? 0), 0)
    : onlyPurchases && matched.some((record) => record.type === "Purchase")
      ? matched.filter((record) => record.type === "Purchase").reduce((sum, record) => sum + (record.amount ?? 0), 0)
      : null

  return {
    results: matched.slice(0, 100),
    total: matched.length,
    totalAmount,
    periodLabel: range?.label ?? null,
    queryLabel: q,
  }
}
