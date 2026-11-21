import { describe, expect, it } from "vitest"
import {
  applySupplierInvoicePayment,
  buildSupplierInvoice,
  type SupplierInvoice,
  type SupplierInvoicePurchaseSource,
} from "./supplierInvoices"

const suppliers = [{ id: "SUP-1", name: "Health Supplies" }]
const purchases: SupplierInvoicePurchaseSource[] = [
  { id: "PUR-1", purchaseNumber: "PUR-2026-00001", supplierId: "SUP-1", supplierName: "Health Supplies", purchaseOrderId: "PO-1", purchaseOrderNumber: "PO-2026-00001", total: 120 },
  { id: "PUR-2", purchaseNumber: "PUR-2026-00002", supplierId: "SUP-1", supplierName: "Health Supplies", purchaseOrderId: "PO-1", purchaseOrderNumber: "PO-2026-00001", total: 80 },
  { id: "PUR-3", purchaseNumber: "PUR-2026-00003", supplierId: "SUP-2", supplierName: "Other Supplier", total: 40 },
]
const input = {
  supplierId: "SUP-1",
  invoiceNumber: "HS-INV-100",
  invoiceDate: "2026-11-20",
  dueDate: "2026-12-20",
  amount: 200,
  purchaseIds: ["PUR-1", "PUR-2"],
  notes: "November delivery",
}
const fixedNow = new Date("2026-11-21T10:00:00.000Z")

function makeInvoice(): SupplierInvoice {
  return buildSupplierInvoice(input, suppliers, purchases, [], fixedNow)
}

describe("supplier invoice register", () => {
  it("creates an AP bill linked to multiple purchase receipts from one supplier", () => {
    const invoice = makeInvoice()
    expect(invoice.billNumber).toBe("AP-2026-00001")
    expect(invoice.purchaseIds).toEqual(["PUR-1", "PUR-2"])
    expect(invoice.purchaseNumbers).toHaveLength(2)
    expect(invoice.purchaseOrderNumbers).toEqual(["PO-2026-00001"])
    expect(invoice.balance).toBe(200)
    expect(invoice.status).toBe("UNPAID")
  })

  it("rejects a purchase belonging to another supplier", () => {
    expect(() => buildSupplierInvoice({ ...input, purchaseIds: ["PUR-3"] }, suppliers, purchases, [], fixedNow))
      .toThrow("belongs to a different supplier")
  })

  it("rejects duplicate supplier invoice numbers", () => {
    const existing = [makeInvoice()]
    expect(() => buildSupplierInvoice(input, suppliers, purchases, existing, fixedNow))
      .toThrow("already registered")
  })

  it("prevents a purchase receipt from being invoiced twice", () => {
    const existing = [makeInvoice()]
    expect(() => buildSupplierInvoice({ ...input, invoiceNumber: "HS-INV-101", purchaseIds: ["PUR-1"] }, suppliers, purchases, existing, fixedNow))
      .toThrow("already linked")
  })

  it("requires at least one source purchase record", () => {
    expect(() => buildSupplierInvoice({ ...input, purchaseIds: [] }, suppliers, purchases, [], fixedNow))
      .toThrow("Link at least one")
  })

  it("records a partial payment and recalculates outstanding balance", () => {
    const invoice = applySupplierInvoicePayment(makeInvoice(), {
      paymentDate: "2026-11-21", amount: 75, method: "Bank Transfer", reference: "TXN-1",
    }, fixedNow)
    expect(invoice.paidAmount).toBe(75)
    expect(invoice.balance).toBe(125)
    expect(invoice.status).toBe("PARTIALLY_PAID")
    expect(invoice.payments).toHaveLength(1)
  })

  it("marks an invoice paid when the final partial payment settles it", () => {
    const partial = applySupplierInvoicePayment(makeInvoice(), {
      paymentDate: "2026-11-21", amount: 75, method: "Cash",
    }, fixedNow)
    const paid = applySupplierInvoicePayment(partial, {
      paymentDate: "2026-11-22", amount: 125, method: "Card",
    }, fixedNow)
    expect(paid.paidAmount).toBe(200)
    expect(paid.balance).toBe(0)
    expect(paid.status).toBe("PAID")
    expect(paid.payments).toHaveLength(2)
  })

  it("rejects overpayment and zero-value payments", () => {
    const invoice = makeInvoice()
    expect(() => applySupplierInvoicePayment(invoice, {
      paymentDate: "2026-11-21", amount: 201, method: "Cash",
    }, fixedNow)).toThrow("cannot exceed")
    expect(() => applySupplierInvoicePayment(invoice, {
      paymentDate: "2026-11-21", amount: 0, method: "Cash",
    }, fixedNow)).toThrow("greater than zero")
  })

  it("rejects invalid dates and Credit as a payment method", () => {
    const invoice = makeInvoice()
    expect(() => applySupplierInvoicePayment(invoice, {
      paymentDate: "2026-02-30", amount: 10, method: "Cash",
    }, fixedNow)).toThrow("valid payment date")
    expect(() => applySupplierInvoicePayment(invoice, {
      paymentDate: "2026-11-21", amount: 10, method: "Credit" as never,
    }, fixedNow)).toThrow("Choose Cash, Card or Bank Transfer")
  })
})
