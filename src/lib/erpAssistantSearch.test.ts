import { describe, expect, it } from "vitest"
import { buildERPAssistantIndex, searchERPAssistant, type ERPAssistantCollections } from "./erpAssistantSearch"

function makeData(overrides: Partial<ERPAssistantCollections> = {}): ERPAssistantCollections {
  return {
    products: [
      { id: "p1", name: "Paracetamol 500mg", sku: "PAR500", barcode: "10001", unit: "Box", minimumStock: 10, status: "ACTIVE" },
      { id: "p2", name: "Vitamin C", sku: "VITC", barcode: "10002", unit: "Bottle", minimumStock: 5, status: "ACTIVE" },
    ],
    customers: [
      { id: "c1", name: "Rameez Khan", phone: "0501234567", status: "Active" },
      { id: "c2", name: "Sara Ali", phone: "0509876543", status: "Active" },
    ],
    sales: [
      { id: "s1", invoiceNumber: "INV-1001", customerId: "c1", customerName: "Rameez Khan", createdAt: "2026-11-25T10:00:00.000Z", total: 120, status: "Paid", items: [{ name: "Paracetamol 500mg" }] },
      { id: "s2", invoiceNumber: "INV-1002", customerId: "c2", customerName: "Sara Ali", createdAt: "2026-11-24T10:00:00.000Z", total: 80, status: "Paid", items: [{ name: "Vitamin C" }] },
    ],
    purchases: [
      { id: "pur1", purchaseNumber: "PUR-90", supplierName: "ABC Medical", createdAt: "2026-11-25T08:00:00.000Z", total: 400, status: "Received" },
    ],
    suppliers: [{ id: "sup1", name: "ABC Medical", phone: "12345", status: "Active" }],
    supplierInvoices: [], purchaseReturns: [], salesReturns: [],
    inventoryLots: [
      { id: "lot1", productId: "p1", batch: "BATCH-PAR-1", expiry: "2026-12-10", quantity: 4, supplierName: "ABC Medical" },
      { id: "lot2", productId: "p2", batch: "BATCH-VIT-1", expiry: "2027-06-01", quantity: 20, supplierName: "ABC Medical" },
    ],
    inventoryMovements: [], warehouses: [], storageLocations: [],
    customerPayments: [], paymentReconciliations: [], purchaseRequisitions: [],
    purchaseOrders: [], stockTransfers: [], stockCounts: [], dailyRegisters: [],
    dailyCashMovements: [], chartOfAccounts: [], journalEntries: [],
    ...overrides,
  }
}

describe("ERP-only assistant search", () => {
  const now = new Date(2026, 10, 25, 12, 0, 0)

  it("finds an invoice from the local ERP index", () => {
    const result = searchERPAssistant(buildERPAssistantIndex(makeData()), "Show invoice INV-1001", "all", now)
    expect(result.total).toBe(1)
    expect(result.results[0].title).toBe("INV-1001")
    expect(result.results[0].type).toBe("Sale / invoice")
  })

  it("filters sales by customer and date range and calculates the total", () => {
    const result = searchERPAssistant(buildERPAssistantIndex(makeData()), "Show sales for Rameez this month", "all", now)
    expect(result.results.map((item) => item.id)).toEqual(["s1"])
    expect(result.periodLabel).toBe("This month")
    expect(result.totalAmount).toBe(120)
  })

  it("finds today's sales from ERP records", () => {
    const result = searchERPAssistant(buildERPAssistantIndex(makeData()), "Show today's sales with invoice numbers and amounts", "all", now)
    expect(result.results.map((item) => item.id)).toEqual(["s1"])
  })

  it("identifies products at or below their configured reorder level", () => {
    const result = searchERPAssistant(buildERPAssistantIndex(makeData()), "Which products are low in stock?", "all", now)
    expect(result.results.map((item) => item.title)).toContain("Paracetamol 500mg")
    expect(result.results.map((item) => item.title)).not.toContain("Vitamin C")
  })

  it("finds batches expiring in the next 30 days", () => {
    const result = searchERPAssistant(buildERPAssistantIndex(makeData()), "Show products expiring in the next 30 days", "all", now)
    expect(result.results.map((item) => item.id)).toEqual(["lot1"])
  })

  it("searches across supplier, purchase and batch records", () => {
    const result = searchERPAssistant(buildERPAssistantIndex(makeData()), "ABC Medical", "all", now)
    expect(result.results.some((item) => item.type === "Supplier")).toBe(true)
    expect(result.results.some((item) => item.type === "Purchase")).toBe(true)
    expect(result.results.some((item) => item.type === "Stock batch")).toBe(true)
  })
})
