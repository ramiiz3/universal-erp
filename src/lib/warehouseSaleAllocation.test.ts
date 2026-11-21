import { describe, expect, it } from "vitest"
import type { InventoryLot, Product } from "../context/ERPContext"
import { allocateSaleLots } from "./saleLotAllocation"

const product = {
  id: "P1",
  name: "Test Product",
  category: "General",
  sku: "TEST-1",
  barcode: "TEST-1",
  purchasePrice: 2,
  sellingPrice: 5,
  minimumStock: 0,
  vatRate: 0,
  unit: "Piece",
} as Product

describe("warehouse-scoped FEFO allocation", () => {
  it("never allocates stock from another warehouse", () => {
    const lots: InventoryLot[] = [
      {
        id: "LOT-A",
        productId: "P1",
        batch: "A",
        expiry: "2027-01-01",
        quantity: 4,
        purchasePrice: 2,
        warehouseId: "WH-A",
      },
      {
        id: "LOT-B",
        productId: "P1",
        batch: "B",
        expiry: "2026-01-01",
        quantity: 10,
        purchasePrice: 2,
        warehouseId: "WH-B",
      },
    ]

    const result = allocateSaleLots(
      [{ product, quantity: 3, warehouseId: "WH-A" }],
      lots,
    )

    expect(result.unallocated).toEqual([])
    expect(result.lines.map((line) => line.lotId)).toEqual(["LOT-A"])
    expect(result.lines.every((line) => line.warehouseId === "WH-A")).toBe(true)
    expect(result.updatedLots.find((lot) => lot.id === "LOT-A")?.quantity).toBe(1)
    expect(result.updatedLots.find((lot) => lot.id === "LOT-B")?.quantity).toBe(10)
  })
})
