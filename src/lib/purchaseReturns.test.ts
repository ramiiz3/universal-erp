import { describe, expect, it } from "vitest"
import {
  buildPurchaseReturn,
  getPurchaseReturnedQuantity,
  getPurchaseReturnRemainingQuantity,
  type PurchaseReturn,
  type PurchaseReturnPurchaseSource,
  type PurchaseReturnLotSource,
} from "./purchaseReturns"

const purchase: PurchaseReturnPurchaseSource = {
  id: "purchase-1",
  purchaseNumber: "PUR-2026-00001",
  supplierId: "supplier-1",
  supplierName: "Supplier One",
  supplierInvoice: "INV-SUP-1",
  status: "Received",
  warehouseId: "warehouse-1",
  locationId: null,
  items: [{
    id: "purchase-line-1",
    productId: "product-1",
    name: "Vitamin C",
    quantity: 2,
    purchasePrice: 50,
    batch: "BATCH-A",
    expiry: "2027-12-31",
    purchaseUnit: "Box",
    baseUnit: "Tablet",
    conversionFactor: 10,
    baseQuantity: 20,
    baseUnitPurchasePrice: 5,
    lotId: "lot-1",
  }],
}

const lots: PurchaseReturnLotSource[] = [{
  id: "lot-1",
  productId: "product-1",
  batch: "BATCH-A",
  expiry: "2027-12-31",
  quantity: 20,
  purchasePrice: 5,
  warehouseId: "warehouse-1",
  locationId: null,
}]

const input = {
  purchaseId: "purchase-1",
  creditNoteReference: "CN-1001",
  reason: "Damaged outer packaging",
  items: [{ purchaseItemId: "purchase-line-1", quantity: 1 }],
}

function priorReturn(quantity: number, baseQuantity = quantity * 10): PurchaseReturn {
  return {
    id: "prior-return",
    returnNumber: "PR-2026-00001",
    purchaseId: "purchase-1",
    purchaseNumber: "PUR-2026-00001",
    supplierId: "supplier-1",
    supplierName: "Supplier One",
    supplierInvoice: "INV-SUP-1",
    creditNoteReference: "CN-OLD",
    reason: "Earlier damage",
    createdAt: "2026-11-20T10:00:00.000Z",
    items: [{
      id: "prior-item",
      purchaseItemId: "purchase-line-1",
      productId: "product-1",
      productName: "Vitamin C",
      quantity,
      purchaseUnit: "Box",
      baseQuantity,
      baseUnit: "Tablet",
      unitPurchasePrice: 50,
      baseUnitPurchasePrice: 5,
      creditAmount: quantity * 50,
      allocations: [{
        lotId: "lot-1",
        batch: "BATCH-A",
        expiry: "2027-12-31",
        quantity: baseQuantity,
        unitCost: 5,
      }],
    }],
    totalQuantity: quantity,
    totalBaseQuantity: baseQuantity,
    totalCreditAmount: quantity * 50,
  }
}

describe("supplier purchase returns", () => {
  it("creates a supplier credit linked to the original purchase and batch", () => {
    const result = buildPurchaseReturn(input, purchase, [], lots, new Date("2026-11-21T12:00:00.000Z"))
    expect(result.returnNumber).toBe("PR-2026-00001")
    expect(result.purchaseNumber).toBe(purchase.purchaseNumber)
    expect(result.supplierName).toBe("Supplier One")
    expect(result.creditNoteReference).toBe("CN-1001")
    expect(result.items[0].baseQuantity).toBe(10)
    expect(result.items[0].allocations).toEqual([{
      lotId: "lot-1",
      batch: "BATCH-A",
      expiry: "2027-12-31",
      quantity: 10,
      unitCost: 5,
    }])
    expect(result.totalCreditAmount).toBe(50)
  })

  it("converts supplier purchase units to base inventory units", () => {
    const result = buildPurchaseReturn(input, purchase, [], lots)
    expect(result.items[0].purchaseUnit).toBe("Box")
    expect(result.items[0].baseUnit).toBe("Tablet")
    expect(result.items[0].baseUnitPurchasePrice).toBe(5)
    expect(result.totalBaseQuantity).toBe(10)
  })

  it("limits cumulative returns to the original received quantity", () => {
    expect(() => buildPurchaseReturn(input, purchase, [priorReturn(2)], lots))
      .toThrow(/exceeds the remaining received quantity/)
  })

  it("allows a subsequent partial return only up to the remaining original quantity", () => {
    const result = buildPurchaseReturn(input, purchase, [priorReturn(1)], [{
      ...lots[0],
      quantity: 10,
    }])
    expect(result.items[0].quantity).toBe(1)
    expect(getPurchaseReturnedQuantity("purchase-1", "purchase-line-1", [priorReturn(1), result])).toBe(2)
    expect(getPurchaseReturnRemainingQuantity(purchase, "purchase-line-1", [priorReturn(1), result])).toBe(0)
  })

  it("rejects return when the original batch no longer has enough on-hand stock", () => {
    expect(() => buildPurchaseReturn(input, purchase, [], [{ ...lots[0], quantity: 9 }]))
      .toThrow(/Insufficient available stock/)
  })

  it("rejects a different lot with the same product and batch when purchase line has an exact lot link", () => {
    expect(() => buildPurchaseReturn(input, purchase, [], [{ ...lots[0], id: "another-lot" }]))
      .toThrow(/Insufficient available stock/)
  })

  it("requires a received purchase, a reason and at least one positive quantity", () => {
    expect(() => buildPurchaseReturn(input, { ...purchase, status: "ordered" }, [], lots))
      .toThrow(/Only received purchases/)
    expect(() => buildPurchaseReturn({ ...input, reason: " " }, purchase, [], lots))
      .toThrow(/reason is required/)
    expect(() => buildPurchaseReturn({ ...input, items: [] }, purchase, [], lots))
      .toThrow(/at least one purchase line/)
    expect(() => buildPurchaseReturn({ ...input, items: [{ purchaseItemId: "purchase-line-1", quantity: 0 }] }, purchase, [], lots))
      .toThrow(/greater than zero/)
  })

  it("rejects a purchase line that is not on the selected purchase", () => {
    expect(() => buildPurchaseReturn({ ...input, items: [{ purchaseItemId: "other-line", quantity: 1 }] }, purchase, [], lots))
      .toThrow(/does not belong/)
  })

  it("rejects duplicate purchase lines in the same return", () => {
    expect(() => buildPurchaseReturn({ ...input, items: [input.items[0], input.items[0]] }, purchase, [], lots))
      .toThrow(/only appear once/)
  })

  it("requires an available original batch record", () => {
    expect(() => buildPurchaseReturn(input, purchase, [], []))
      .toThrow(/Insufficient available stock/)
  })

  it("tracks previous return quantities by source purchase line", () => {
    expect(getPurchaseReturnedQuantity("purchase-1", "purchase-line-1", [priorReturn(0.5)])).toBe(0.5)
    expect(getPurchaseReturnRemainingQuantity(purchase, "purchase-line-1", [priorReturn(0.5)])).toBe(1.5)
  })
})
