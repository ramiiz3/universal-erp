import { describe, expect, it } from "vitest"
import { buildSalesReturn, getReturnedQuantity, isSaleFullyReturned, type SalesReturn } from "./salesReturns"

const sale = {
  id: "sale-1", invoiceNumber: "INV-1", createdAt: "2026-11-20T10:00:00.000Z",
  customerName: "Customer", paymentMethod: "Cash", status: "Paid", subtotal: 100, discount: 10,
  items: [{ id: "line-1", productId: "p1", name: "Eligible goods", quantity: 2, unitPrice: 50,
    vatRate: 5, total: 100, sellingUnit: "Pack", conversionFactor: 1, baseQuantity: 2,
    batchAllocations: [{ lotId: "lot-1", batch: "B1", expiry: "2027-12-31", quantity: 1 },
      { lotId: "lot-2", batch: "B2", expiry: "2028-06-30", quantity: 1 }] }],
}
const products = [{ id: "p1", name: "Eligible goods", productType: "GOODS" as const, returnEligible: true }]
const baseInput = { saleId: "sale-1", refundMethod: "Cash" as const, reason: "Customer changed mind", items: [{ saleItemId: "line-1", quantity: 1 }] }

function priorReturn(quantity: number, lotId = "lot-1"): SalesReturn {
  return { id: "r1", returnNumber: "SR-2026-00001", saleId: "sale-1", invoiceNumber: "INV-1", customerName: "Customer",
    createdAt: "2026-11-21T10:00:00.000Z", refundMethod: "Cash", reason: "Earlier return",
    items: [{ id: "ri1", saleItemId: "line-1", productId: "p1", productName: "Eligible goods", quantity,
      sellingUnit: "Pack", baseQuantity: quantity, subtotalAmount: 50, discountAmount: 5, vatAmount: 2.25,
      refundAmount: 47.25, allocations: [{ lotId, batch: lotId === "lot-1" ? "B1" : "B2", expiry: lotId === "lot-1" ? "2027-12-31" : "2028-06-30", quantity }] }],
    subtotalAmount: 50 * quantity,
    discountAmount: 5 * quantity,
    vatAmount: 2.25 * quantity,
    refundTotal: 47.25 * quantity,
  }
}

describe("sales returns", () => {
  it("builds a return linked to the source invoice and exact original batch", () => {
    const result = buildSalesReturn(baseInput, sale, products, [], new Date("2026-11-21T12:00:00.000Z"))
    expect(result.invoiceNumber).toBe("INV-1")
    expect(result.returnNumber).toBe("SR-2026-00001")
    expect(result.refundTotal).toBe(47.25)
    expect(result.items[0].allocations).toEqual([{ lotId: "lot-1", batch: "B1", expiry: "2027-12-31", quantity: 1 }])
  })

  it("rejects credit invoices", () => {
    expect(() => buildSalesReturn(baseInput, { ...sale, paymentMethod: "Credit", status: "Pending" }, products, []))
      .toThrow(/Credit sales/)
  })

  it("rejects products not explicitly marked returnable", () => {
    expect(() => buildSalesReturn(baseInput, sale, [{ id: "p1", returnEligible: false }], [])).toThrow(/not marked as eligible/)
  })

  it("rejects services", () => {
    expect(() => buildSalesReturn(baseInput, sale, [{ id: "p1", productType: "SERVICE", returnEligible: true }], [])).toThrow(/not marked as eligible/)
  })

  it("requires a non-empty reason", () => {
    expect(() => buildSalesReturn({ ...baseInput, reason: "  " }, sale, products, [])).toThrow(/reason is required/)
  })

  it("rejects zero and fractional quantities", () => {
    expect(() => buildSalesReturn({ ...baseInput, items: [{ saleItemId: "line-1", quantity: 0 }] }, sale, products, [])).toThrow(/whole number/)
    expect(() => buildSalesReturn({ ...baseInput, items: [{ saleItemId: "line-1", quantity: 0.5 }] }, sale, products, [])).toThrow(/whole number/)
  })

  it("prevents cumulative returns above sold quantity", () => {
    expect(() => buildSalesReturn(baseInput, sale, products, [priorReturn(2)])).toThrow(/exceeds the remaining/)
  })

  it("allocates later partial returns to the remaining original batch", () => {
    const result = buildSalesReturn(baseInput, sale, products, [priorReturn(1)])
    expect(result.items[0].allocations).toEqual([{ lotId: "lot-2", batch: "B2", expiry: "2028-06-30", quantity: 1 }])
  })

  it("requires original batch allocation history", () => {
    const noLots = { ...sale, items: [{ ...sale.items[0], batchAllocations: [] }] }
    expect(() => buildSalesReturn(baseInput, noLots, products, [])).toThrow(/Original batch allocation is unavailable/)
  })

  it("tracks cumulative returned selling quantity", () => {
    expect(getReturnedQuantity("sale-1", "line-1", [priorReturn(1)])).toBe(1)
    expect(isSaleFullyReturned(sale, [priorReturn(2)])).toBe(true)
    expect(isSaleFullyReturned(sale, [priorReturn(1)])).toBe(false)
  })

  it("rejects a duplicate sale line in one return request", () => {
    expect(() => buildSalesReturn({ ...baseInput, items: [baseInput.items[0], baseInput.items[0]] }, sale, products, []))
      .toThrow(/only appear once/)
  })
})
