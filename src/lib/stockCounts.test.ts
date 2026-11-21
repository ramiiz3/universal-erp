import { describe, expect, it } from "vitest"
import {
  calculateStockCountVariance,
  createStockCountReference,
  validateStockCountLines,
  type StockCountLine,
} from "./stockCounts"

const line = (overrides: Partial<StockCountLine> = {}): StockCountLine => ({
  id: "SC-2026-00001-LINE-0001",
  lotId: "LOT-1",
  productId: "PROD-1",
  productName: "Test product",
  sku: "TEST-1",
  unit: "Box",
  batch: "BATCH-1",
  expiry: "2027-12-31",
  locationId: null,
  locationName: "",
  systemQuantity: 10,
  countedQuantity: 10,
  ...overrides,
})

describe("stock count helpers", () => {
  it("calculates positive and negative variances", () => {
    expect(calculateStockCountVariance(line({ countedQuantity: 13 }))).toBe(3)
    expect(calculateStockCountVariance(line({ countedQuantity: 7 }))).toBe(-3)
  })

  it("returns no variance until a physical count is entered", () => {
    expect(calculateStockCountVariance(line({ countedQuantity: null }))).toBeNull()
  })

  it("requires every line to have a valid whole-number count", () => {
    expect(validateStockCountLines([line({ countedQuantity: null })])).toContain(
      "Enter a counted quantity for every inventory line before submitting.",
    )
    expect(validateStockCountLines([line({ countedQuantity: 1.5 })])).toContain(
      "Counted quantities must be whole numbers greater than or equal to zero.",
    )
  })

  it("rejects negative counts and duplicate lot lines", () => {
    expect(validateStockCountLines([line({ countedQuantity: -1 })])).toContain(
      "Counted quantities must be whole numbers greater than or equal to zero.",
    )
    expect(validateStockCountLines([line(), line({ id: "LINE-2" })])).toContain(
      "Inventory lot LOT-1 appears more than once.",
    )
  })

  it("rejects empty count sheets", () => {
    expect(validateStockCountLines([])).toContain("This stock count has no inventory lines.")
  })

  it("generates the next annual reference without reusing prior references", () => {
    const now = new Date("2026-11-21T10:00:00.000Z")
    expect(
      createStockCountReference(
        [
          { reference: "SC-2026-00001" },
          { reference: "SC-2026-00004" },
          { reference: "SC-2025-00099" },
        ],
        now,
      ),
    ).toBe("SC-2026-00005")
  })
})
