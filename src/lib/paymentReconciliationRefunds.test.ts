import { describe, expect, it } from "vitest"
import { calculateExpectedPaymentTotals } from "./paymentReconciliation"

describe("payment reconciliation sales refunds", () => {
  it("keeps the original collection on the sale date and deducts a refund on its actual payout date", () => {
    const sale = [{ id: "sale-1", createdAt: "2026-11-20T10:00:00.000Z", paymentMethod: "Cash", status: "Refunded", total: 100 }]
    const refunds = [{ saleId: "sale-1", createdAt: "2026-11-21T10:00:00.000Z", refundMethod: "Cash", refundTotal: 30 }]
    expect(calculateExpectedPaymentTotals("2026-11-20", sale, [], refunds)).toEqual({ Cash: 100, Card: 0, "Bank Transfer": 0 })
    expect(calculateExpectedPaymentTotals("2026-11-21", sale, [], refunds)).toEqual({ Cash: -30, Card: 0, "Bank Transfer": 0 })
  })

  it("does not deduct a refund from another payment method", () => {
    const sale = [{ id: "sale-1", createdAt: "2026-11-21T10:00:00.000Z", paymentMethod: "Card", status: "Paid", total: 80 }]
    const refunds = [{ saleId: "sale-1", createdAt: "2026-11-21T11:00:00.000Z", refundMethod: "Bank Transfer", refundTotal: 20 }]
    expect(calculateExpectedPaymentTotals("2026-11-21", sale, [], refunds)).toEqual({ Cash: 0, Card: 80, "Bank Transfer": -20 })
  })
})
