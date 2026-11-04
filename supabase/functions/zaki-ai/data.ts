export type CloudAIDataScope = "inventory" | "sales" | "purchasing"

export type CloudAIHistoryEntry = {
  role: "user" | "assistant"
  text: string
}

export function inferCloudAIDataScopes(message: string): CloudAIDataScope[] {
  const normalized = message.toLocaleLowerCase()
  const scopes = new Set<CloudAIDataScope>()

  if (/stock|inventory|product|sku|barcode|batch|expiry|expir|restock|low stock|quantity|warehouse|movement|available|valuation/.test(normalized)) {
    scopes.add("inventory")
  }
  if (/sale|sales|invoice|customer|revenue|payment|paid|unpaid|outstanding|cashier|sold|top selling|best.?sell|turnover/.test(normalized)) {
    scopes.add("sales")
  }
  if (/purchase|purchasing|supplier|vendor|receipt|receiv|procurement|buying|cost price/.test(normalized)) {
    scopes.add("purchasing")
  }

  if (scopes.size === 0) {
    scopes.add("inventory")
    scopes.add("sales")
    scopes.add("purchasing")
  }
  return [...scopes]
}

export function sanitizeCloudAIHistory(value: unknown): CloudAIHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const item = entry as Record<string, unknown>
    if (item.role !== "user" && item.role !== "assistant") return []
    if (typeof item.text !== "string") return []
    const text = item.text.trim()
    if (!text || text.length > 2_000) return []
    return [{ role: item.role, text }]
  }).slice(-8)
}

export function buildCloudAIContext(input: {
  company: unknown
  scopes: CloudAIDataScope[]
  branches: unknown[]
  products?: unknown[]
  lots?: unknown[]
  movements?: unknown[]
  sales?: unknown[]
  saleLines?: unknown[]
  payments?: unknown[]
  purchases?: unknown[]
  purchaseLines?: unknown[]
  suppliers?: unknown[]
  contactDetailsIncluded?: boolean
}) {
  return {
    company: input.company,
    scopes: input.scopes,
    accessibleBranches: input.branches,
    products: input.products ?? [],
    inventoryLots: input.lots ?? [],
    stockMovements: input.movements ?? [],
    salesAndInvoices: input.sales ?? [],
    saleLines: input.saleLines ?? [],
    payments: input.payments ?? [],
    purchases: input.purchases ?? [],
    purchaseLines: input.purchaseLines ?? [],
    suppliers: input.suppliers ?? [],
    contactDetailsIncluded: Boolean(input.contactDetailsIncluded),
  }
}
