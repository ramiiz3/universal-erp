import { describe, expect, it } from "vitest"
import {
  calculateDailyRegisterSummary,
  getBusinessDate,
  validateDailyRegisterMoney,
} from "./dailyRegister"

describe("daily cash register", () => {
  const businessDate = "2026-11-23"
  const timestamp = new Date(2026, 10, 23, 14, 30, 0).toISOString()
  const nextDay = new Date(2026, 10, 24, 9, 0, 0).toISOString()

  it("formats business dates using the pharmacy business timezone", () => {
    expect(getBusinessDate(new Date("2026-11-23T19:59:00.000Z"))).toBe("2026-11-23")
    expect(getBusinessDate(new Date("2026-11-23T20:00:00.000Z"))).toBe("2026-11-24")
    expect(getBusinessDate(new Date("2026-11-23T20:00:00.000Z"), "Asia/Kolkata")).toBe("2026-11-24")
  })

  it("groups transactions by Dubai business date when UTC has not crossed midnight", () => {
    const summary = calculateDailyRegisterSummary({
      businessDate: "2026-11-24",
      openingCash: 0,
      sales: [{ createdAt: "2026-11-23T20:00:00.000Z", paymentMethod: "Cash", total: 25 }],
      customerPayments: [],
      returns: [],
      supplierInvoices: [],
    })
    expect(summary.salesCount).toBe(1)
    expect(summary.sales.cash).toBe(25)
  })

  it("reconciles cash sales, credit collections, refunds, supplier payments and cash movements", () => {
    const summary = calculateDailyRegisterSummary({
      businessDate,
      openingCash: 100,
      sales: [
        { createdAt: timestamp, paymentMethod: "Cash", total: 200 },
        { createdAt: timestamp, paymentMethod: "Card", total: 60 },
        { createdAt: timestamp, paymentMethod: "Bank Transfer", total: 30 },
        { createdAt: timestamp, paymentMethod: "Credit", total: 50 },
        { createdAt: nextDay, paymentMethod: "Cash", total: 500 },
      ],
      customerPayments: [
        { createdAt: timestamp, method: "Cash", amount: 20 },
        { createdAt: timestamp, method: "Card", amount: 10 },
        { createdAt: nextDay, method: "Cash", amount: 100 },
      ],
      returns: [
        { createdAt: timestamp, refundMethod: "Cash", refundTotal: 10 },
        { createdAt: timestamp, refundMethod: "Card", refundTotal: 5 },
      ],
      supplierInvoices: [{
        payments: [
          { createdAt: timestamp, paymentDate: businessDate, method: "Cash", amount: 15 },
          { createdAt: timestamp, paymentDate: businessDate, method: "Bank Transfer", amount: 20 },
        ],
      }],
      cashMovements: [
        { id: "IN-1", businessDate, kind: "IN", category: "Cash deposit", amount: 10, note: "Float top-up", createdAt: timestamp },
        { id: "OUT-1", businessDate, kind: "OUT", category: "Expense", amount: 7, note: "Delivery", createdAt: timestamp },
      ],
    })

    expect(summary.salesCount).toBe(4)
    expect(summary.sales).toEqual({
      cash: 200,
      card: 60,
      bankTransfer: 30,
      credit: 50,
      total: 340,
    })
    expect(summary.customerCollections.total).toBe(30)
    expect(summary.refunds.total).toBe(15)
    expect(summary.supplierPayments.total).toBe(35)
    expect(summary.otherCashIn).toBe(10)
    expect(summary.otherCashOut).toBe(7)
    expect(summary.expectedCash).toBe(298)
  })

  it("uses the recorded payment time for supplier cash movements, even when an invoice date was backdated", () => {
    const summary = calculateDailyRegisterSummary({
      businessDate,
      openingCash: 50,
      sales: [],
      customerPayments: [],
      returns: [],
      supplierInvoices: [{
        payments: [
          { createdAt: timestamp, paymentDate: "2026-11-20", method: "Cash", amount: 12 },
        ],
      }],
    })
    expect(summary.supplierPayments.cash).toBe(12)
    expect(summary.expectedCash).toBe(38)
  })

  it("rejects negative and non-finite cash entries", () => {
    expect(validateDailyRegisterMoney(12.345, "Cash")).toBe(12.35)
    expect(() => validateDailyRegisterMoney(-1, "Opening cash")).toThrow("zero or greater")
    expect(() => validateDailyRegisterMoney(Number.NaN, "Closing cash")).toThrow("zero or greater")
  })
})
