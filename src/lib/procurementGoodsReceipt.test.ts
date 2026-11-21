import { describe, expect, it } from "vitest"
import { applyPurchaseOrderReceipt, type PurchaseOrder } from "./procurementWorkflow"

const makeOrder = (status: PurchaseOrder["status"] = "APPROVED"): PurchaseOrder => ({
  id: "PO-1",
  purchaseOrderNumber: "PO-2026-00001",
  requisitionId: "PR-1",
  requisitionNumber: "PR-2026-00001",
  supplierId: "SUP-1",
  supplierName: "Supplier One",
  warehouseId: "WH-1",
  warehouseName: "Main Warehouse",
  notes: "",
  status,
  items: [
    { id: "POI-1", requisitionItemId: "PRI-1", productId: "P-1", productName: "Product One", sku: "SKU-1", quantity: 10, unit: "unit", unitCost: 12, receivedQuantity: 0 },
    { id: "POI-2", requisitionItemId: "PRI-2", productId: "P-2", productName: "Product Two", sku: "SKU-2", quantity: 5, unit: "box", unitCost: 20, receivedQuantity: 0 },
  ],
  subtotal: 220,
  createdAt: "2026-11-21T00:00:00.000Z",
})

describe("applyPurchaseOrderReceipt", () => {
  it("records a partial receipt without closing the order", () => {
    const updated = applyPurchaseOrderReceipt(makeOrder(), [{ productId: "P-1", quantity: 4 }])
    expect(updated.items[0].receivedQuantity).toBe(4)
    expect(updated.status).toBe("PARTIALLY_RECEIVED")
    expect(updated.items[1].receivedQuantity).toBe(0)
  })

  it("marks the order received when all outstanding quantities are fulfilled", () => {
    const partial = { ...makeOrder("PARTIALLY_RECEIVED"), items: makeOrder().items.map((item) => item.productId === "P-1" ? { ...item, receivedQuantity: 4 } : item) }
    const updated = applyPurchaseOrderReceipt(partial, [{ productId: "P-1", quantity: 6 }, { productId: "P-2", quantity: 5 }])
    expect(updated.status).toBe("RECEIVED")
    expect(updated.items.map((item) => item.receivedQuantity)).toEqual([10, 5])
  })

  it("allows multiple receipts against a partially received order", () => {
    const partial = { ...makeOrder("PARTIALLY_RECEIVED"), items: makeOrder().items.map((item) => item.productId === "P-1" ? { ...item, receivedQuantity: 3 } : item) }
    expect(applyPurchaseOrderReceipt(partial, [{ productId: "P-1", quantity: 2 }]).items[0].receivedQuantity).toBe(5)
  })

  it("rejects receipts against draft or pending orders", () => {
    expect(() => applyPurchaseOrderReceipt(makeOrder("DRAFT"), [{ productId: "P-1", quantity: 1 }])).toThrow(/approved purchase order/i)
    expect(() => applyPurchaseOrderReceipt(makeOrder("PENDING_APPROVAL"), [{ productId: "P-1", quantity: 1 }])).toThrow(/approved purchase order/i)
  })

  it("rejects quantities greater than the outstanding order quantity", () => {
    expect(() => applyPurchaseOrderReceipt(makeOrder(), [{ productId: "P-1", quantity: 10.01 }])).toThrow(/only 10 unit remain/i)
  })

  it("rejects unknown products and invalid quantities", () => {
    expect(() => applyPurchaseOrderReceipt(makeOrder(), [{ productId: "UNKNOWN", quantity: 1 }])).toThrow(/not included/i)
    expect(() => applyPurchaseOrderReceipt(makeOrder(), [{ productId: "P-1", quantity: 0 }])).toThrow(/greater than zero/i)
  })

  it("rejects an empty receipt", () => {
    expect(() => applyPurchaseOrderReceipt(makeOrder(), [])).toThrow(/at least one item/i)
  })
})
