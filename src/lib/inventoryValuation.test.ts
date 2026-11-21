import { describe, expect, it } from "vitest"
import {
  buildInventoryValuationCsv,
  calculateInventoryValuation,
  type ValuationLot,
  type ValuationProduct,
  type ValuationWarehouse,
  type ValuationLocation,
} from "./inventoryValuation"

const products: ValuationProduct[] = [
  { id: "p1", name: "Panadol Extra", sku: "PAN-01", category: "Pain Relief", unit: "Pack" },
  { id: "p2", name: "Vitamin C", sku: "VIT-01", category: "Vitamins", unit: "Bottle" },
]
const warehouses: ValuationWarehouse[] = [
  { id: "w1", name: "Main Warehouse" },
  { id: "w2", name: "Branch Warehouse" },
]
const locations: ValuationLocation[] = [
  { id: "l1", name: "Shelf A", code: "A-01" },
]
const lots: ValuationLot[] = [
  { id: "lot1", productId: "p1", batch: "PAN-A", expiry: "2028-05-01", quantity: 10, purchasePrice: 12, warehouseId: "w1", locationId: "l1" },
  { id: "lot2", productId: "p1", batch: "PAN-B", expiry: "2028-08-01", quantity: 5, purchasePrice: 14, warehouseId: "w2", locationId: null },
  { id: "lot3", productId: "p2", batch: "VIT-A", expiry: "2027-10-20", quantity: 4, purchasePrice: 24, warehouseId: "w1", locationId: null },
]

describe("inventory valuation", () => {
  it("values each batch using remaining quantity multiplied by recorded purchase cost", () => {
    const result = calculateInventoryValuation(products, lots, warehouses, locations)
    expect(result.rows.map((row) => row.value)).toEqual([120, 70, 96])
    expect(result.totalValue).toBe(286)
    expect(result.totalQuantity).toBe(19)
  })

  it("filters valuation by warehouse without changing source lots", () => {
    const result = calculateInventoryValuation(products, lots, warehouses, locations, "w1")
    expect(result.rows).toHaveLength(2)
    expect(result.totalValue).toBe(216)
    expect(result.totalQuantity).toBe(14)
    expect(lots).toHaveLength(3)
  })

  it("aggregates quantities, values and positive batch counts by product", () => {
    const result = calculateInventoryValuation(products, lots, warehouses, locations)
    const panadol = result.byProduct.find((item) => item.id === "p1")!
    expect(panadol.quantity).toBe(15)
    expect(panadol.value).toBe(190)
    expect(panadol.batchCount).toBe(2)
  })

  it("aggregates valuation by warehouse", () => {
    const result = calculateInventoryValuation(products, lots, warehouses, locations)
    expect(result.byWarehouse.find((item) => item.id === "w1")?.value).toBe(216)
    expect(result.byWarehouse.find((item) => item.id === "w2")?.value).toBe(70)
    expect(result.stockedWarehouseCount).toBe(2)
  })

  it("includes products with no inventory as zero-valued summaries", () => {
    const result = calculateInventoryValuation([...products, { id: "p3", name: "No Stock", sku: "NS-1", category: "Other", unit: "Unit" }], lots, warehouses, locations)
    expect(result.byProduct.find((item) => item.id === "p3")?.value).toBe(0)
    expect(result.stockedProductCount).toBe(2)
  })

  it("handles missing product, warehouse and location references safely", () => {
    const orphan: ValuationLot = { id: "orphan", productId: "missing", batch: "X", expiry: "", quantity: 2, purchasePrice: 3, warehouseId: "missing-wh", locationId: "missing-loc" }
    const result = calculateInventoryValuation(products, [...lots, orphan], warehouses, locations)
    const row = result.rows.find((item) => item.lotId === "orphan")!
    expect(row.productName).toBe("Unknown product")
    expect(row.warehouseName).toBe("Unknown warehouse")
    expect(row.locationName).toBe("Unknown location")
    expect(row.value).toBe(6)
  })

  it("exports batch traceability and safely quotes comma-containing CSV fields", () => {
    const commaCategoryProducts = products.map((item) => item.id === "p1" ? { ...item, category: "Pain, Relief" } : item)
    const csv = buildInventoryValuationCsv(calculateInventoryValuation(commaCategoryProducts, lots, warehouses, locations).rows)
    expect(csv).toContain("Product,SKU,Category,Batch,Expiry,Warehouse,Location")
    expect(csv).toContain('"Pain, Relief"')
    expect(csv).toContain("Main Warehouse")
    expect(csv).toContain("PAN-A")
  })
})
