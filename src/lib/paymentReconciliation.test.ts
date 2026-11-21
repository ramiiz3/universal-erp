import { describe, expect, it } from "vitest"
import {
  buildPaymentReconciliation,
  calculateExpectedPaymentTotals,
  type ReconciliationAmounts,
} from "./paymentReconciliation"

const date = "2026-11-21"
const at = (hour: number) => new Date(2026, 10, 21, hour, 0, 0).toISOString()
const counts = (cash = 0, card = 0, bank = 0): ReconciliationAmounts => ({
  Cash: cash,
  Card: card,
  "Bank Transfer": bank,
})

const sales = [
  { createdAt: at(9), paymentMethod: "Cash", status: "Paid", total: 100.25 },
  { createdAt: at(10), paymentMethod: "Card", status: "Paid", total: 50 },
  { createdAt: at(11), paymentMethod: "Bank Transfer", status: "Paid", total: 25 },
  { createdAt: at(12), paymentMethod: "Credit", status: "Pending", total: 90 },
]

describe("daily payment reconciliation", () => {
  it("totals paid POS sales by tender method", () => {
    expect(calculateExpectedPaymentTotals(date, sales, [])).toEqual(counts(100.25, 50, 25))
  })

  it("does not count POS credit invoices as same-day collections", () => {
    const paidCreditSale = { createdAt: at(12), paymentMethod: "Credit", status: "Paid", total: 90 }
    expect(calculateExpectedPaymentTotals(date, [paidCreditSale], [])).toEqual(counts())
  })

  it("includes customer credit receipts on the date they were recorded", () => {
    const receipts = [
      { createdAt: at(13), method: "Cash", amount: 10 },
      { createdAt: at(14), method: "Card", amount: 20 },
      { createdAt: at(15), method: "Bank Transfer", amount: 30 },
    ]
    expect(calculateExpectedPaymentTotals(date, sales, receipts)).toEqual(counts(110.25, 70, 55))
  })

  it("excludes other dates, pending sales and refunded sales", () => {
    const otherDate = new Date(2026, 10, 20, 12).toISOString()
    const entries = [
      { createdAt: otherDate, paymentMethod: "Cash", status: "Paid", total: 100 },
      { createdAt: at(12), paymentMethod: "Card", status: "Pending", total: 100 },
      { createdAt: at(12), paymentMethod: "Cash", status: "Refunded", total: 100 },
    ]
    expect(calculateExpectedPaymentTotals(date, entries, [])).toEqual(counts())
  })

  it("creates a closed snapshot with over/short variance", () => {
    const result = buildPaymentReconciliation(
      { businessDate: date, countedAmounts: counts(99, 55, 25), notes: "Card terminal verified" },
      sales,
      [],
      [],
      new Date("2026-11-21T12:00:00.000Z"),
    )
    expect(result.status).toBe("CLOSED")
    expect(result.expectedTotal).toBe(175.25)
    expect(result.countedTotal).toBe(179)
    expect(result.varianceTotal).toBe(3.75)
    expect(result.varianceAmounts.Cash).toBe(-1.25)
    expect(result.varianceAmounts.Card).toBe(5)
    expect(result.notes).toBe("Card terminal verified")
    expect(result.reference).toBe("PAYREC-20261121")
  })

  it("rejects invalid calendar dates", () => {
    expect(() => calculateExpectedPaymentTotals("2026-02-30", [], [])).toThrow("valid reconciliation date")
  })

  it("rejects negative counted amounts", () => {
    expect(() => buildPaymentReconciliation(
      { businessDate: date, countedAmounts: counts(-1, 0, 0) }, sales, [], [],
    )).toThrow("non-negative counted amount for Cash")
  })

  it("rejects non-finite counted amounts", () => {
    expect(() => buildPaymentReconciliation(
      { businessDate: date, countedAmounts: counts(Number.NaN, 0, 0) }, sales, [], [],
    )).toThrow("non-negative counted amount for Cash")
  })

  it("prevents a second close for the same business date", () => {
    const first = buildPaymentReconciliation(
      { businessDate: date, countedAmounts: counts() }, [], [], [],
    )
    expect(() => buildPaymentReconciliation(
      { businessDate: date, countedAmounts: counts() }, [], [], [first],
    )).toThrow("already exists for this date")
  })

  it("rejects a missing business date", () => {
    expect(() => buildPaymentReconciliation(
      { businessDate: "", countedAmounts: counts() }, [], [], [],
    )).toThrow("valid reconciliation date")
  })
})
