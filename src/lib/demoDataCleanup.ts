export type DemoCleanupResult<T extends Record<string, unknown>> = {
  data: T
  removedProducts: number
  removedInventoryLots: number
  removedCustomers: number
  removedWarehouses: number
  removedInventoryMovements: number
}

type BuiltInDemoProduct = {
  id: string
  name: string
  sku: string
  barcode: string
  category: string
  purchasePrice: number
  sellingPrice: number
  minimumStock: number
  vatRate: number
  unit: string
}

type BuiltInDemoLot = {
  id: string
  productId: string
  batch: string
  expiry: string
  quantity: number
  purchasePrice: number
}

type BuiltInDemoWarehouse = {
  id: string
  name: string
  code: string
  type: string
  address: string
  manager: string
  phone: string
  active: boolean
  createdAt: string
}

type BuiltInDemoCustomer = {
  id: string
  name: string
  phone: string
  email: string
  whatsapp: string
  status: "Active" | "Inactive"
}

const BUILT_IN_PRODUCTS: BuiltInDemoProduct[] = [
  { id: "PROD-001", name: "Panadol Extra", sku: "PAN-EXT-001", barcode: "8964001234567", category: "Pain Relief", purchasePrice: 10, sellingPrice: 15, minimumStock: 30, vatRate: 5, unit: "Pack" },
  { id: "PROD-002", name: "Vitamin C 1000mg", sku: "VIT-C-001", barcode: "8964001234568", category: "Vitamins", purchasePrice: 24, sellingPrice: 32, minimumStock: 25, vatRate: 5, unit: "Bottle" },
  { id: "PROD-003", name: "Cetaphil Cleanser", sku: "CET-CLN-001", barcode: "8964001234569", category: "Skincare", purchasePrice: 37, sellingPrice: 49, minimumStock: 20, vatRate: 5, unit: "Bottle" },
  { id: "PROD-004", name: "Nivea Moisturiser", sku: "NIV-MOI-001", barcode: "8964001234570", category: "Skincare", purchasePrice: 21, sellingPrice: 28, minimumStock: 20, vatRate: 5, unit: "Tube" },
  { id: "PROD-005", name: "Advil", sku: "ADV-001", barcode: "8964001234571", category: "Pain Relief", purchasePrice: 12, sellingPrice: 18, minimumStock: 20, vatRate: 5, unit: "Pack" },
  { id: "PROD-006", name: "Dove Shampoo", sku: "DOV-SHA-001", barcode: "8964001234572", category: "Hair Care", purchasePrice: 17, sellingPrice: 24, minimumStock: 15, vatRate: 5, unit: "Bottle" },
]

const BUILT_IN_LOTS: BuiltInDemoLot[] = [
  { id: "LOT-001", productId: "PROD-001", batch: "PDX2451", expiry: "2028-05-01", quantity: 125, purchasePrice: 10 },
  { id: "LOT-002", productId: "PROD-002", batch: "VTC7742", expiry: "2027-11-01", quantity: 84, purchasePrice: 24 },
  { id: "LOT-003", productId: "PROD-003", batch: "CET9182", expiry: "2029-02-01", quantity: 67, purchasePrice: 37 },
  { id: "LOT-004", productId: "PROD-004", batch: "NIV5521", expiry: "2028-08-01", quantity: 41, purchasePrice: 21 },
  { id: "LOT-005", productId: "PROD-005", batch: "ADV3348", expiry: "2027-07-01", quantity: 12, purchasePrice: 12 },
  { id: "LOT-006", productId: "PROD-006", batch: "DOV7412", expiry: "2028-03-01", quantity: 0, purchasePrice: 17 },
]

const BUILT_IN_WAREHOUSES: BuiltInDemoWarehouse[] = [
  {
    id: "WH-MAIN",
    name: "Main Warehouse",
    code: "MAIN",
    type: "MAIN",
    address: "",
    manager: "",
    phone: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

const BUILT_IN_CUSTOMERS: BuiltInDemoCustomer[] = [
  { id: "CUS-001", name: "Ahmed Khan", phone: "+971 50 123 4567", email: "ahmed@example.com", whatsapp: "+971501234567", status: "Active" },
  { id: "CUS-002", name: "Sarah Ali", phone: "+971 55 234 6789", email: "sarah@example.com", whatsapp: "+971552346789", status: "Active" },
  { id: "CUS-003", name: "Mohammed Hassan", phone: "+971 52 345 7890", email: "mohammed@example.com", whatsapp: "+971523457890", status: "Active" },
  { id: "CUS-004", name: "Fatima Rahman", phone: "+971 56 456 8901", email: "fatima@example.com", whatsapp: "+971564568901", status: "Active" },
  { id: "CUS-005", name: "Omar Abdullah", phone: "+971 58 567 9012", email: "omar@example.com", whatsapp: "+971585679012", status: "Active" },
]

const PRODUCT_REFERENCE_FIELDS = new Set(["productId", "product_id", "sourceProductId", "source_product_id", "productIds", "product_ids"])
const LOT_REFERENCE_FIELDS = new Set(["lotId", "lot_id", "sourceLotId", "source_lot_id", "destinationLotId", "destination_lot_id", "inventoryLotId", "inventory_lot_id", "stockLotId", "stock_lot_id", "lotIds", "lot_ids"])
const CUSTOMER_REFERENCE_FIELDS = new Set(["customerId", "customer_id", "customerIds", "customer_ids"])
const WAREHOUSE_REFERENCE_FIELDS = new Set(["warehouseId", "warehouse_id", "sourceWarehouseId", "source_warehouse_id", "destinationWarehouseId", "destination_warehouse_id", "warehouseIds", "warehouse_ids"])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function matchesOnlyKnownFields(record: Record<string, unknown>, allowedFields: readonly string[]): boolean {
  return Object.keys(record).every((field) => allowedFields.includes(field))
}

function matchesProduct(value: unknown, expected: BuiltInDemoProduct): boolean {
  const record = asRecord(value)
  if (!record) return false

  // Product master fields evolve (for example, packagings were added later).
  // The original IDs, SKU and barcode remain the stable demo fingerprint.
  return record.id === expected.id
    && record.sku === expected.sku
}

function matchesLot(value: unknown, expected: BuiltInDemoLot): boolean {
  const record = asRecord(value)
  if (!record) return false

  // Quantity, expiry, warehouse and batch details can change during demo
  // testing; the bundled lot ID and product link are the stable fingerprint.
  return record.id === expected.id
    && record.productId === expected.productId
}

function matchesCustomer(value: unknown, expected: BuiltInDemoCustomer): boolean {
  const record = asRecord(value)
  if (!record) return false

  return record.id === expected.id
    && record.email === expected.email
    && record.phone === expected.phone
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
export function isBuiltInDemoProduct(value: unknown): boolean {
  return BUILT_IN_PRODUCTS.some((expected) => matchesProduct(value, expected))
}

export function removeBuiltInDemoData<T extends Record<string, unknown>>(
  source: T,
  options: { onlyProductId?: string } = {},
): DemoCleanupResult<T> {
  const products = Array.isArray(source.products) ? source.products : []
  const lots = Array.isArray(source.inventoryLots) ? source.inventoryLots : []
  const customers = Array.isArray(source.customers) ? source.customers : []
  const removableLotIds = new Set<string>()
  const removableProductIds = new Set<string>()

  for (const expectedProduct of BUILT_IN_PRODUCTS) {
    if (options.onlyProductId && expectedProduct.id !== options.onlyProductId) continue
    const product = products.find((item) => matchesProduct(item, expectedProduct))
    if (!product) continue

    const productId = expectedProduct.id
    const hasBusinessReferences = isReferencedOutside(
      source,
      PRODUCT_REFERENCE_FIELDS,
      productId,
      new Set(["products", "inventoryLots", "inventoryMovements"]),
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
        new Set(["inventoryLots", "inventoryMovements"]),
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
  for (const expectedCustomer of options.onlyProductId ? [] : BUILT_IN_CUSTOMERS) {
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
    ...(Array.isArray(source.inventoryMovements) ? {
      inventoryMovements: source.inventoryMovements.filter((movement) => {
        const record = asRecord(movement)
        return !record
          || (!removableProductIds.has(String(record.productId ?? ""))
            && !removableLotIds.has(String(record.lotId ?? "")))
      }),
    } : {}),
  } as T

  const warehouses = options.onlyProductId
    ? []
    : (Array.isArray(source.warehouses) ? source.warehouses : [])
  const removableWarehouseIds = new Set<string>()
  for (const expectedWarehouse of BUILT_IN_WAREHOUSES) {
    const warehouse = warehouses.find((item) => {
      const record = asRecord(item)
      if (!record || !matchesOnlyKnownFields(record, [
        "id", "name", "code", "type", "address", "manager", "phone", "active", "createdAt", "updatedAt",
      ])) return false
      return record.id === expectedWarehouse.id
        && record.name === expectedWarehouse.name
        && record.code === expectedWarehouse.code
        && record.type === expectedWarehouse.type
        && record.address === expectedWarehouse.address
        && record.manager === expectedWarehouse.manager
        && record.phone === expectedWarehouse.phone
        && record.active === expectedWarehouse.active
        && record.createdAt === expectedWarehouse.createdAt
        && (record.updatedAt == null || typeof record.updatedAt === "string")
    })
    if (!warehouse) continue
    const hasBusinessReferences = isReferencedOutside(
      next,
      WAREHOUSE_REFERENCE_FIELDS,
      expectedWarehouse.id,
      new Set(["warehouses"]),
    )
    if (!hasBusinessReferences) removableWarehouseIds.add(expectedWarehouse.id)
  }

  const finalData = {
    ...next,
    warehouses: warehouses.filter((item) => !removableWarehouseIds.has(String(asRecord(item)?.id ?? ""))),
  } as T

  const originalMovements = Array.isArray(source.inventoryMovements) ? source.inventoryMovements : []
  const remainingMovements = Array.isArray(finalData.inventoryMovements) ? finalData.inventoryMovements : originalMovements

  return {
    data: finalData,
    removedProducts: removableProductIds.size,
    removedInventoryLots: removableLotIds.size,
    removedCustomers: removableCustomerIds.size,
    removedWarehouses: removableWarehouseIds.size,
    removedInventoryMovements: originalMovements.length - remainingMovements.length,
  }
}
