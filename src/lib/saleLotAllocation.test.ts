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
    expiry: "2026-01-01",
    quantity: 2,
    purchasePrice: 5,
    sellingPrice: 10,
  },
  {
    id: "lot-later",
    productId: product.id,
    batch: "LATE",
    expiry: "2027-01-01",
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
})
