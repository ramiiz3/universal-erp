import { describe, expect, it } from "vitest"
import { buildInventoryAlerts } from "./inventoryAlerts"
import type { InventoryLot, Product, Warehouse } from "../context/ERPContext"

const today = new Date(2026, 10, 21)
const warehouses: Warehouse[] = [
  { id: "WH-A", code: "A", name: "Main Warehouse", type: "MAIN", address: "", manager: "", phone: "", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "WH-B", code: "B", name: "Branch Warehouse", type: "BRANCH", address: "", manager: "", phone: "", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
]

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "P1", name: "Example Product", category: "General", sku: "SKU-1", barcode: "123",
    purchasePrice: 10, sellingPrice: 15, minimumStock: 20, vatRate: 5, unit: "Pack",
    ...overrides,
  }
}

function lot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    id: "L1", productId: "P1", batch: "BATCH-1", expiry: "2027-01-15", quantity: 5,
    purchasePrice: 10, warehouseId: "WH-A", locationId: null,
    ...overrides,
  }
}

describe("inventory expiry and reorder alerts", () => {
  it("classifies expired, expiring-soon and upcoming batches using calendar days", () => {
    const result = buildInventoryAlerts({
      products: [product()],
      inventoryLots: [
        lot({ id: "EXPIRED", expiry: "2026-11-20" }),
        lot({ id: "SOON", batch: "SOON", expiry: "2026-12-01" }),
        lot({ id: "UPCOMING", batch: "UPCOMING", expiry: "2027-01-15" }),
        lot({ id: "LATER", batch: "LATER", expiry: "2027-05-01" }),
      ],
      warehouses, today,
    })
    expect(result.summary).toEqual({ expired: 1, expiringSoon: 1, upcoming: 1, lowStock: 1, outOfStock: 0 })
  })

  it("treats month/year expiry as valid through the last day of that month", () => {
    const result = buildInventoryAlerts({
      products: [product()], inventoryLots: [lot({ expiry: "2026-11" })], warehouses, today,
    })
    expect(result.expiryAlerts[0]?.kind).toBe("EXPIRING_SOON")
    expect(result.expiryAlerts[0]?.daysUntilExpiry).toBe(9)
  })

  it("does not create expiry alerts for zero-quantity lots", () => {
    const result = buildInventoryAlerts({
      products: [product()], inventoryLots: [lot({ quantity: 0, expiry: "2026-11-01" })], warehouses, today,
    })
    expect(result.expiryAlerts).toHaveLength(0)
  })

  it("filters expiry and available stock by the selected warehouse", () => {
    const result = buildInventoryAlerts({
      products: [product({ minimumStock: 10 })],
      inventoryLots: [
        lot({ id: "A", quantity: 4, warehouseId: "WH-A", expiry: "2027-01-15" }),
        lot({ id: "B", quantity: 40, warehouseId: "WH-B", expiry: "2027-01-15" }),
      ],
      warehouses, warehouseId: "WH-A", today,
    })
    expect(result.stockAlerts[0]?.availableStock).toBe(4)
    expect(result.expiryAlerts).toHaveLength(1)
    expect(result.expiryAlerts[0]?.warehouseName).toBe("Main Warehouse")
  })

  it("uses existing minimumStock as reorder threshold and calculates the shortfall", () => {
    const result = buildInventoryAlerts({
      products: [product({ minimumStock: 30 })],
      inventoryLots: [lot({ quantity: 12, expiry: "2028-05-01" })],
      warehouses, today,
    })
    expect(result.stockAlerts[0]).toMatchObject({ kind: "LOW_STOCK", availableStock: 12, minimumStock: 30, suggestedReorder: 18 })
  })

  it("flags products with zero stock and excludes service products", () => {
    const result = buildInventoryAlerts({
      products: [product({ id: "P1", minimumStock: 10 }), product({ id: "S1", productType: "SERVICE" })],
      inventoryLots: [], warehouses, today,
    })
    expect(result.stockAlerts).toHaveLength(1)
    expect(result.stockAlerts[0]).toMatchObject({ kind: "OUT_OF_STOCK", availableStock: 0, suggestedReorder: 10 })
  })

  it("keeps inventory inputs unchanged because alert generation is read-only", () => {
    const products = [product()]
    const lots = [lot()]
    const before = JSON.stringify({ products, lots })
    buildInventoryAlerts({ products, inventoryLots: lots, warehouses, today })
    expect(JSON.stringify({ products, lots })).toBe(before)
  })
})
