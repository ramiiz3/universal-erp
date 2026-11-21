import { describe, expect, it } from "vitest"
import {
  buildCustomerPayment,
  getSalePaymentSummary,
  type CustomerPayment,
} from "./customerPayments"

const customer = { id: "C1", name: "A Customer" }
const sale = {
  id: "S1", invoiceNumber: "INV-001", customerId: "C1", customerName: "A Customer",
  paymentMethod: "Credit", total: 100, status: "Pending" as const,
}
const now = new Date("2026-11-21T10:00:00.000Z")

function payment(amount: number, saleId = "S1"): CustomerPayment {
  return {
    id: "P1", receiptNumber: "CP-2026-00001", customerId: "C1", customerName: "A Customer",
    createdAt: now.toISOString(), method: "Cash", reference: "", amount,
    allocations: [{ saleId, invoiceNumber: "INV-001", amount }],
  }
}

describe("customer credit payments", () => {
  it("records a valid payment against an outstanding credit invoice", () => {
    const result = buildCustomerPayment({ customerId: "C1", method: "Cash", allocations: [{ saleId: "S1", amount: 40 }] }, [sale], [customer], [], now)
    expect(result.amount).toBe(40)
    expect(result.receiptNumber).toBe("CP-2026-00001")
    expect(result.allocations[0].invoiceNumber).toBe("INV-001")
  })

  it("rejects an unknown customer", () => {
    expect(() => buildCustomerPayment({ customerId: "X", method: "Cash", allocations: [{ saleId: "S1", amount: 10 }] }, [sale], [customer], [], now)).toThrow("Select a valid customer")
  })

  it("requires at least one invoice allocation", () => {
    expect(() => buildCustomerPayment({ customerId: "C1", method: "Cash", allocations: [] }, [sale], [customer], [], now)).toThrow("at least one credit invoice")
  })

  it("rejects duplicate invoice allocations", () => {
    expect(() => buildCustomerPayment({ customerId: "C1", method: "Cash", allocations: [{ saleId: "S1", amount: 10 }, { saleId: "S1", amount: 5 }] }, [sale], [customer], [], now)).toThrow("only appear once")
  })

  it("rejects a non-credit sale", () => {
    const cashSale = { ...sale, paymentMethod: "Cash" }
    expect(() => buildCustomerPayment({ customerId: "C1", method: "Cash", allocations: [{ saleId: "S1", amount: 10 }] }, [cashSale], [customer], [], now)).toThrow("Only outstanding credit invoices")
  })

  it("rejects an invoice belonging to another customer", () => {
    const otherSale = { ...sale, customerId: "C2" }
    expect(() => buildCustomerPayment({ customerId: "C1", method: "Cash", allocations: [{ saleId: "S1", amount: 10 }] }, [otherSale], [customer], [], now)).toThrow("does not belong")
  })

  it("prevents overpayment after earlier partial receipts", () => {
    expect(() => buildCustomerPayment({ customerId: "C1", method: "Cash", allocations: [{ saleId: "S1", amount: 61 }] }, [sale], [customer], [payment(40)], now)).toThrow("exceeds the outstanding balance")
  })

  it("summarizes pending, partial and fully settled invoices", () => {
    expect(getSalePaymentSummary(sale, []).status).toBe("Pending")
    expect(getSalePaymentSummary(sale, [payment(40)]).status).toBe("Partially Paid")
    expect(getSalePaymentSummary(sale, [payment(100)]).status).toBe("Paid")
    expect(getSalePaymentSummary(sale, [payment(40)]).outstandingAmount).toBe(60)
  })

  it("supports the balance being paid across multiple receipts", () => {
    const first = payment(40)
    const second = { ...payment(60), id: "P2", receiptNumber: "CP-2026-00002" }
    expect(getSalePaymentSummary(sale, [first, second])).toMatchObject({ paidAmount: 100, outstandingAmount: 0, status: "Paid" })
  })

  it("rejects allocations against a refunded invoice", () => {
    const refunded = { ...sale, status: "Refunded" as const }
    expect(() => buildCustomerPayment({ customerId: "C1", method: "Cash", allocations: [{ saleId: "S1", amount: 10 }] }, [refunded], [customer], [], now)).toThrow("Only outstanding credit invoices")
  })
})
