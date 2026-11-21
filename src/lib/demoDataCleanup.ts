export type DemoCleanupResult<T extends Record<string, unknown>> = {
  data: T
  removedProducts: number
  removedInventoryLots: number
  removedCustomers: number
}

type BuiltInDemoProduct = {
  id: string
  name: string
  sku: string
  barcode: string
}

type BuiltInDemoLot = {
  id: string
  productId: string
  batch: string
  expiry: string
  purchasePrice: number
}

type BuiltInDemoCustomer = {
  id: string
  name: string
  phone: string
  email: string
}

const BUILT_IN_PRODUCTS: BuiltInDemoProduct[] = [
  { id: "PROD-001", name: "Panadol Extra", sku: "PAN-EXT-001", barcode: "8964001234567" },
  { id: "PROD-002", name: "Vitamin C 1000mg", sku: "VIT-C-001", barcode: "8964001234568" },
  { id: "PROD-003", name: "Cetaphil Cleanser", sku: "CET-CLN-001", barcode: "8964001234569" },
  { id: "PROD-004", name: "Nivea Moisturiser", sku: "NIV-MOI-001", barcode: "8964001234570" },
  { id: "PROD-005", name: "Advil", sku: "ADV-001", barcode: "8964001234571" },
  { id: "PROD-006", name: "Dove Shampoo", sku: "DOV-SHA-001", barcode: "8964001234572" },
]

const BUILT_IN_LOTS: BuiltInDemoLot[] = [
  { id: "LOT-001", productId: "PROD-001", batch: "PDX2451", expiry: "2028-05-01", purchasePrice: 10 },
  { id: "LOT-002", productId: "PROD-002", batch: "VTC7742", expiry: "2027-11-01", purchasePrice: 24 },
  { id: "LOT-003", productId: "PROD-003", batch: "CET9182", expiry: "2029-02-01", purchasePrice: 37 },
  { id: "LOT-004", productId: "PROD-004", batch: "NIV5521", expiry: "2028-08-01", purchasePrice: 21 },
  { id: "LOT-005", productId: "PROD-005", batch: "ADV3348", expiry: "2027-07-01", purchasePrice: 12 },
  { id: "LOT-006", productId: "PROD-006", batch: "DOV7412", expiry: "2028-03-01", purchasePrice: 17 },
]

const BUILT_IN_CUSTOMERS: BuiltInDemoCustomer[] = [
  { id: "CUS-001", name: "Ahmed Khan", phone: "+971 50 123 4567", email: "ahmed@example.com" },
  { id: "CUS-002", name: "Sarah Ali", phone: "+971 55 234 6789", email: "sarah@example.com" },
  { id: "CUS-003", name: "Mohammed Hassan", phone: "+971 52 345 7890", email: "mohammed@example.com" },
  { id: "CUS-004", name: "Fatima Rahman", phone: "+971 56 456 8901", email: "fatima@example.com" },
  { id: "CUS-005", name: "Omar Abdullah", phone: "+971 58 567 9012", email: "omar@example.com" },
]

const PRODUCT_REFERENCE_FIELDS = new Set(["productId", "product_id", "sourceProductId", "source_product_id", "productIds", "product_ids"])
const LOT_REFERENCE_FIELDS = new Set(["lotId", "lot_id", "sourceLotId", "source_lot_id", "lotIds", "lot_ids"])
const CUSTOMER_REFERENCE_FIELDS = new Set(["customerId", "customer_id", "customerIds", "customer_ids"])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function matchesProduct(value: unknown, expected: BuiltInDemoProduct): boolean {
  const record = asRecord(value)
  return record?.id === expected.id
    && record.name === expected.name
    && record.sku === expected.sku
    && record.barcode === expected.barcode
}

function matchesLot(value: unknown, expected: BuiltInDemoLot): boolean {
  const record = asRecord(value)
  return record?.id === expected.id
    && record.productId === expected.productId
    && record.batch === expected.batch
    && record.expiry === expected.expiry
    && Number(record.purchasePrice) === expected.purchasePrice
}

function matchesCustomer(value: unknown, expected: BuiltInDemoCustomer): boolean {
  const record = asRecord(value)
  return record?.id === expected.id
    && record.name === expected.name
    && record.phone === expected.phone
    && record.email === expected.email
}

function containsReference(value: unknown, fields: ReadonlySet<string>, targetId: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsReference(item, fields, targetId))
  }
  const record = asRecord(value)
  if (!record) return false

  return Object.entries(record).some(([key, nested]) => {
    if (fields.has(key)) {
      if (nested === targetId) return true
      if (Array.isArray(nested) && nested.includes(targetId)) return true
    }
    return containsReference(nested, fields, targetId)
  })
}

function isReferencedOutside(
  data: Record<string, unknown>,
  fields: ReadonlySet<string>,
  targetId: string,
  excludedCollections: ReadonlySet<string>,
): boolean {
  return Object.entries(data).some(([key, value]) =>
    !excludedCollections.has(key) && containsReference(value, fields, targetId),
  )
}

/**
 * Removes only the exact starter products, lots and customers shipped by the
 * original demo store. Records involved in business activity or changed from
 * their bundled identity are retained.
 */
export function removeBuiltInDemoData<T extends Record<string, unknown>>(
  source: T,
): DemoCleanupResult<T> {
  const products = Array.isArray(source.products) ? source.products : []
  const lots = Array.isArray(source.inventoryLots) ? source.inventoryLots : []
  const customers = Array.isArray(source.customers) ? source.customers : []
  const removableLotIds = new Set<string>()
  const removableProductIds = new Set<string>()

  for (const expectedProduct of BUILT_IN_PRODUCTS) {
    const product = products.find((item) => matchesProduct(item, expectedProduct))
    if (!product) continue

    const productId = expectedProduct.id
    const hasBusinessReferences = isReferencedOutside(
      source,
      PRODUCT_REFERENCE_FIELDS,
      productId,
      new Set(["products", "inventoryLots"]),
    )
    if (hasBusinessReferences) continue

    const relatedLots = lots.filter((item) => asRecord(item)?.productId === productId)
    const seedLots = relatedLots.filter((item) =>
      BUILT_IN_LOTS.some((expectedLot) => matchesLot(item, expectedLot)),
    )

    for (const seedLot of seedLots) {
      const lotId = String(asRecord(seedLot)?.id ?? "")
      if (!lotId) continue
      const hasLotReferences = isReferencedOutside(
        source,
        LOT_REFERENCE_FIELDS,
        lotId,
        new Set(["inventoryLots"]),
      )
      if (!hasLotReferences) removableLotIds.add(lotId)
    }

    const allRelatedLotsAreRemovable = relatedLots.every((lot) => {
      const record = asRecord(lot)
      return Boolean(record?.id && removableLotIds.has(String(record.id)))
    })
    if (allRelatedLotsAreRemovable) removableProductIds.add(productId)
  }

  const removableCustomerIds = new Set<string>()
  for (const expectedCustomer of BUILT_IN_CUSTOMERS) {
    const customer = customers.find((item) => matchesCustomer(item, expectedCustomer))
    if (!customer) continue
    const hasBusinessReferences = isReferencedOutside(
      source,
      CUSTOMER_REFERENCE_FIELDS,
      expectedCustomer.id,
      new Set(["customers"]),
    )
    if (!hasBusinessReferences) removableCustomerIds.add(expectedCustomer.id)
  }

  const next = {
    ...source,
    products: products.filter((item) => !removableProductIds.has(String(asRecord(item)?.id ?? ""))),
    inventoryLots: lots.filter((item) => !removableLotIds.has(String(asRecord(item)?.id ?? ""))),
    customers: customers.filter((item) => !removableCustomerIds.has(String(asRecord(item)?.id ?? ""))),
  } as T

  return {
    data: next,
    removedProducts: removableProductIds.size,
    removedInventoryLots: removableLotIds.size,
    removedCustomers: removableCustomerIds.size,
  }
}
