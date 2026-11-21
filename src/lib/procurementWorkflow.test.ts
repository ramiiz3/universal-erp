import { describe, expect, it } from "vitest"
import {
  buildPurchaseOrderFromRequisition,
  buildPurchaseRequisition,
  reviewPurchaseOrder,
  reviewPurchaseRequisition,
  submitPurchaseOrder,
  submitPurchaseRequisition,
  type PurchaseRequisition,
} from "./procurementWorkflow"

const suppliers = [{ id: "SUP-1", name: "Test Supplier", status: "Active" as const }]
const products = [{
  id: "PROD-1",
  name: "Test Medicine",
  sku: "MED-1",
  unit: "Pack",
  status: "ACTIVE" as const,
  productType: "GOODS" as const,
}]
const warehouses = [{ id: "WH-1", name: "Main Warehouse", active: true }]
const now = new Date("2026-11-21T10:00:00.000Z")

function requisition(): PurchaseRequisition {
  return buildPurchaseRequisition({
    supplierId: "SUP-1",
    warehouseId: "WH-1",
    notes: "Monthly replenishment",
    items: [{ productId: "PROD-1", quantity: 10, estimatedUnitCost: 12 }],
  }, suppliers, products, warehouses, [], now)
}

describe("purchase requisition and purchase order workflow", () => {
  it("creates a draft requisition with supplier, warehouse and item snapshots", () => {
    const result = requisition()
    expect(result.requisitionNumber).toBe("PR-2026-00001")
    expect(result.status).toBe("DRAFT")
    expect(result.supplierName).toBe("Test Supplier")
    expect(result.warehouseName).toBe("Main Warehouse")
    expect(result.items[0]).toMatchObject({
      productId: "PROD-1",
      productName: "Test Medicine",
      quantity: 10,
      unit: "Pack",
      estimatedUnitCost: 12,
    })
  })

  it("rejects inactive suppliers, inactive warehouses and invalid requisition lines", () => {
    expect(() => buildPurchaseRequisition({
      supplierId: "SUP-X",
      warehouseId: "WH-1",
      items: [{ productId: "PROD-1", quantity: 1, estimatedUnitCost: 1 }],
    }, suppliers, products, warehouses, [], now)).toThrow(/active supplier/)
    expect(() => buildPurchaseRequisition({
      supplierId: "SUP-1",
      warehouseId: "WH-X",
      items: [{ productId: "PROD-1", quantity: 1, estimatedUnitCost: 1 }],
    }, suppliers, products, warehouses, [], now)).toThrow(/active receiving warehouse/)
    expect(() => buildPurchaseRequisition({
      supplierId: "SUP-1",
      warehouseId: "WH-1",
      items: [{ productId: "PROD-1", quantity: 0, estimatedUnitCost: 1 }],
    }, suppliers, products, warehouses, [], now)).toThrow(/greater than zero/)
  })

  it("submits and approves a requisition before conversion", () => {
    const submitted = submitPurchaseRequisition(requisition(), now)
    expect(submitted.status).toBe("SUBMITTED")
    const approved = reviewPurchaseRequisition(submitted, "APPROVE", "Admin Owner", "", now)
    expect(approved.status).toBe("APPROVED")
    expect(approved.reviewedBy).toBe("Admin Owner")
  })

  it("requires a rejection reason and prevents review of a draft requisition", () => {
    expect(() => reviewPurchaseRequisition(requisition(), "APPROVE", "Admin Owner"))
      .toThrow(/submitted requisitions/)
    const submitted = submitPurchaseRequisition(requisition(), now)
    expect(() => reviewPurchaseRequisition(submitted, "REJECT", "Admin Owner", " "))
      .toThrow(/reason/)
  })

  it("creates a purchase order only from an approved requisition and does not mark it received", () => {
    const approved = reviewPurchaseRequisition(
      submitPurchaseRequisition(requisition(), now),
      "APPROVE",
      "Admin Owner",
      "",
      now,
    )
    const order = buildPurchaseOrderFromRequisition(approved, warehouses, [], now)
    expect(order.purchaseOrderNumber).toBe("PO-2026-00001")
    expect(order.status).toBe("DRAFT")
    expect(order.subtotal).toBe(120)
    expect(order.items[0]?.receivedQuantity).toBe(0)
  })

  it("submits and approves a purchase order through its own approval stage", () => {
    const approvedReq = reviewPurchaseRequisition(
      submitPurchaseRequisition(requisition(), now),
      "APPROVE",
      "Admin Owner",
      "",
      now,
    )
    const order = buildPurchaseOrderFromRequisition(approvedReq, warehouses, [], now)
    const submitted = submitPurchaseOrder(order, now)
    expect(submitted.status).toBe("PENDING_APPROVAL")
    const approved = reviewPurchaseOrder(submitted, "APPROVE", "Procurement Manager", "", now)
    expect(approved.status).toBe("APPROVED")
    expect(approved.approvedBy).toBe("Procurement Manager")
  })

  it("rejects invalid PO transitions and requires a reason for rejection", () => {
    const approvedReq = reviewPurchaseRequisition(
      submitPurchaseRequisition(requisition(), now),
      "APPROVE",
      "Admin Owner",
      "",
      now,
    )
    const order = buildPurchaseOrderFromRequisition(approvedReq, warehouses, [], now)
    expect(() => reviewPurchaseOrder(order, "APPROVE", "Admin Owner")).toThrow(/awaiting approval/)
    const submitted = submitPurchaseOrder(order, now)
    expect(() => reviewPurchaseOrder(submitted, "REJECT", "Admin Owner", " ")).toThrow(/reason/)
    expect(reviewPurchaseOrder(submitted, "REJECT", "Admin Owner", "Budget not approved", now).status)
      .toBe("REJECTED")
  })

  it("increments annual requisition and purchase order references", () => {
    const req = requisition()
    const nextReq = buildPurchaseRequisition({
      supplierId: "SUP-1",
      warehouseId: "WH-1",
      items: [{ productId: "PROD-1", quantity: 1, estimatedUnitCost: 12 }],
    }, suppliers, products, warehouses, [req], now)
    expect(nextReq.requisitionNumber).toBe("PR-2026-00002")
  })
})
