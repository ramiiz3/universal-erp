import { describe, expect, it } from "vitest"
import {
  buildPurchaseLines,
  buildPurchaseReceiptLines,
  buildSaleLines,
  buildSalePayments,
  estimateFefoSale,
} from "./transactions"
import type { CloudInventoryLot, CloudProduct } from "./CloudInventoryContext"

const product: CloudProduct = {
  id: "product-a",
  company_id: "company-a",
  name: "Product A",
  sku: "A",
  barcode: "100",
  description: "",
  category: "",
  manufacturer: null,
  unit: "box",
  purchase_price: 2,
  selling_price: 5,
  minimum_stock: 0,
  vat_rate: 5,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

function lot(overrides: Partial<CloudInventoryLot>): CloudInventoryLot {
  return {
    id: "lot-a",
    company_id: "company-a",
    product_id: product.id,
    branch_id: "branch-a",
    warehouse_id: "warehouse-a",
    batch: "batch-a",
    expiry: "2027-01-01",
    quantity: 1.5,
    purchase_price: 2,
    selling_price: 4,
    total_purchase_value: null,
    total_selling_value: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("cloud transaction validation", () => {
  it("preserves fractional sale quantities and rejects empty or duplicate products", () => {
    expect(buildSaleLines([{ productId: product.id, quantity: 0.25 }])).toEqual([
      { product_id: product.id, quantity: 0.25 },
    ])
    expect(() => buildSaleLines([])).toThrow(/at least one product/)
    expect(() => buildSaleLines([
      { productId: product.id, quantity: 1 },
      { productId: product.id, quantity: 1 },
    ])).toThrow(/only once/)
  })

  it("validates purchase prices and line discounts", () => {
    expect(buildPurchaseLines([{
      productId: product.id,
      quantity: 2.5,
      unitCost: 1.25,
      discountAmount: 0.5,
    }])).toEqual([{
      product_id: product.id,
      quantity: 2.5,
      unit_cost: 1.25,
      discount_amount: 0.5,
    }])
    expect(() => buildPurchaseLines([{
      productId: product.id,
      quantity: 1,
      unitCost: 1,
      discountAmount: 2,
    }])).toThrow(/cannot exceed/)
  })

  it("validates partial purchase receipts against the outstanding quantity", () => {
    expect(buildPurchaseReceiptLines([{
      purchaseLineId: "line-a",
      outstandingQuantity: 3,
      quantity: 0,
      unitCost: null,
      sellingPrice: null,
      batch: "",
      expiry: "",
    }, {
      purchaseLineId: "line-b",
      outstandingQuantity: 2,
      quantity: 0.75,
      unitCost: 1.1,
      sellingPrice: 3.25,
      batch: "batch-b",
      expiry: "2027-12-31",
    }])).toEqual([{
      purchase_line_id: "line-b",
      quantity: 0.75,
      unit_cost: 1.1,
      selling_price: 3.25,
      batch: "batch-b",
      expiry: "2027-12-31",
    }])
    expect(() => buildPurchaseReceiptLines([{
      purchaseLineId: "line-a",
      outstandingQuantity: 2,
      quantity: 2.1,
      unitCost: null,
      sellingPrice: null,
      batch: "",
      expiry: "",
    }])).toThrow(/cannot exceed/)
    expect(() => buildPurchaseReceiptLines([{
      purchaseLineId: "line-a",
      outstandingQuantity: 2,
      quantity: -1,
      unitCost: null,
      sellingPrice: null,
      batch: "",
      expiry: "",
    }])).toThrow(/zero or greater/)
  })

  it("builds a payment only when a valid positive amount is supplied", () => {
    expect(buildSalePayments("cash", 0, "", 10)).toEqual([])
    expect(buildSalePayments("card", 5, "ref", 10)).toEqual([{
      method: "card",
      amount: 5,
      reference: "ref",
    }])
    expect(() => buildSalePayments("cash", 11, "", 10)).toThrow(/not exceeding/)
  })

  it("estimates FEFO pricing with separate lot prices, fractional stock, and expiry exclusion", () => {
    const estimate = estimateFefoSale([product], [
      lot({ id: "expired", expiry: "2025-01-01", quantity: 10, selling_price: 1 }),
      lot({ id: "later", expiry: "2027-01-01", quantity: 0.75, selling_price: 8 }),
      lot({ id: "first", expiry: "2026-12-01", quantity: 0.5, selling_price: 4 }),
      lot({ id: "no-expiry", expiry: null, quantity: 1, selling_price: null }),
    ], [{ productId: product.id, quantity: 1.5 }], "warehouse-a", 5, 0, "2026-06-01")
    expect(estimate).toEqual({ subtotal: 9.25, vat: 0.46, total: 9.71, shortProducts: [] })
  })

  it("reduces VAT by the proportional invoice discount", () => {
    const estimate = estimateFefoSale(
      [product],
      [lot({ quantity: 2, selling_price: 10 })],
      [{ productId: product.id, quantity: 2 }],
      "warehouse-a",
      5,
      2,
      "2026-06-01",
    )
    expect(estimate).toEqual({ subtotal: 20, vat: 0.9, total: 18.9, shortProducts: [] })
  })

  it("reports inventory shortages without using stock in another warehouse", () => {
    const estimate = estimateFefoSale([product], [
      lot({ warehouse_id: "warehouse-b", quantity: 10 }),
    ], [{ productId: product.id, quantity: 1 }], "warehouse-a", 5, 0, "2026-06-01")
    expect(estimate.shortProducts).toEqual(["Product A"])
    expect(estimate.total).toBe(0)
  })
})
