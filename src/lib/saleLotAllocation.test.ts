import { describe, expect, it } from "vitest"
import type { InventoryLot, Product } from "../context/ERPContext"
import {
  allocateSaleLots,
  calculateLotSaleTotals,
} from "./saleLotAllocation"

const product: Product = {
  id: "product-1",
  name: "Test medicine",
  category: "Medicine",
  sku: "SKU-1",
  barcode: "123",
  purchasePrice: 4,
  sellingPrice: 15,
  minimumStock: 0,
  vatRate: 5,
  unit: "Box",
}

const lots: InventoryLot[] = [
  {
    id: "lot-earlier",
    productId: product.id,
    batch: "EARLY",
    expiry: "2027-01-01",
    quantity: 2,
    purchasePrice: 5,
    sellingPrice: 10,
  },
  {
    id: "lot-later",
    productId: product.id,
    batch: "LATE",
    expiry: "2028-01-01",
    quantity: 5,
    purchasePrice: 8,
    sellingPrice: 20,
  },
]

describe("sale lot allocation", () => {
  it("splits partial lot quantities and uses each allocated lot's price and cost", () => {
    const result = allocateSaleLots(
      [{ product, quantity: 3, unitPrice: product.sellingPrice }],
      lots,
    )

    expect(result.unallocated).toEqual([])
    expect(result.lines.map(({ lotId, quantity, unitPrice, unitCost, totalCost }) => ({
      lotId,
      quantity,
      unitPrice,
      unitCost,
      totalCost,
    }))).toEqual([
      {
        lotId: "lot-earlier",
        quantity: 2,
        unitPrice: 10,
        unitCost: 5,
        totalCost: 10,
      },
      {
        lotId: "lot-later",
        quantity: 1,
        unitPrice: 20,
        unitCost: 8,
        totalCost: 8,
      },
    ])
    expect(result.updatedLots.map((lot) => lot.quantity)).toEqual([0, 4])
    expect(lots.map((lot) => lot.quantity)).toEqual([2, 5])
    expect(calculateLotSaleTotals(result.lines, 4)).toEqual({
      subtotal: 40,
      discount: 4,
      vat: 1.8,
      total: 37.8,
    })
  })

  it("keeps product-price fallback for lots without a lot-specific selling price", () => {
    const [lotWithoutPrice] = lots.map((lot) => ({ ...lot, quantity: 5 }))
    delete lotWithoutPrice.sellingPrice

    const result = allocateSaleLots(
      [{ product, quantity: 2, unitPrice: 12 }],
      [lotWithoutPrice],
    )

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].unitPrice).toBe(12)
  })

  it("uses remaining lot stock across requests and reports shortages", () => {
    const result = allocateSaleLots(
      [
        { product, quantity: 4, unitPrice: 15 },
        { product, quantity: 5, unitPrice: 15 },
      ],
      lots,
    )

    expect(result.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(7)
    expect(result.unallocated).toEqual([
      { productId: product.id, productName: product.name, quantity: 2 },
    ])
  })

  it("calculates discount and VAT over lot-priced taxable and non-taxable lines", () => {
    const nonTaxableProduct = { ...product, id: "product-2", vatRate: 0 }
    const allocation = allocateSaleLots(
      [
        { product, quantity: 2, unitPrice: 10 },
        { product: nonTaxableProduct, quantity: 2, unitPrice: 20 },
      ],
      [
        { ...lots[0], quantity: 2, sellingPrice: 10 },
        {
          ...lots[1],
          id: "lot-nontax",
          productId: nonTaxableProduct.id,
          quantity: 2,
          sellingPrice: 20,
        },
      ],
    )

    expect(calculateLotSaleTotals(allocation.lines, 6)).toEqual({
      subtotal: 60,
      discount: 6,
      vat: 0.9,
      total: 54.9,
    })
  })

  it("allocates package sales across FEFO batches using the selected package price", () => {
    const packageLots: InventoryLot[] = [
      { ...lots[0], quantity: 19, sellingPrice: 9 },
      { ...lots[1], quantity: 10, sellingPrice: 19 },
    ]

    // One carton contains 12 pieces.
    // Two cartons at AED 120 each = 24 pieces at AED 10 per piece.
    const result = allocateSaleLots(
      [{
        product,
        quantity: 24,
        unitPrice: 10,
        unitPriceOverride: true,
      }],
      packageLots,
    )

    expect(result.unallocated).toEqual([])
    expect(result.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }))).toEqual([
      { quantity: 19, unitPrice: 10 },
      { quantity: 5, unitPrice: 10 },
    ])

    expect(result.updatedLots.map((lot) => lot.quantity)).toEqual([0, 5])

    const baseQuantity = result.lines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    )
    const costOfGoodsSold = result.lines.reduce(
      (sum, line) => sum + line.totalCost,
      0,
    )

    expect(baseQuantity).toBe(24)
    expect(costOfGoodsSold).toBe(135)

    const totals = calculateLotSaleTotals(result.lines, 20)
    expect(totals.subtotal).toBe(240)
    expect(totals.discount).toBe(20)
    expect(totals.vat).toBeCloseTo(11)
    expect(totals.total).toBeCloseTo(231)
  })


  it("never allocates expired batches and treats month-only expiry as valid through month end", () => {
    const expired = {
      ...lots[0],
      id: "expired-lot",
      batch: "EXPIRED",
      expiry: "2026-01-31",
      quantity: 4,
    }
    const monthValid = {
      ...lots[1],
      id: "month-valid-lot",
      batch: "MONTH-VALID",
      expiry: "2026-02",
      quantity: 3,
    }

    const result = allocateSaleLots(
      [{ product, quantity: 2 }],
      [expired, monthValid],
      new Date("2026-02-01T12:00:00"),
    )

    expect(result.unallocated).toEqual([])
    expect(result.lines.map((line) => line.lotId)).toEqual(["month-valid-lot"])
    expect(result.updatedLots.find((lot) => lot.id === "expired-lot")?.quantity).toBe(4)
    expect(result.updatedLots.find((lot) => lot.id === "month-valid-lot")?.quantity).toBe(1)
  })

})
