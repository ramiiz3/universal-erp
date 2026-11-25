import { describe, expect, it } from "vitest"
import { getSalePaymentDisplayLabel } from "./paymentDisplay"

describe("getSalePaymentDisplayLabel", () => {
  it("shows the selected card scheme", () => {
    expect(getSalePaymentDisplayLabel({ paymentMethod: "Card", cardPaymentOption: "Visa" })).toBe("Card · Visa")
  })

  it("shows the selected contactless wallet", () => {
    expect(getSalePaymentDisplayLabel({ paymentMethod: "Card", cardPaymentOption: "Apple Pay" })).toBe("Card · Apple Pay")
  })

  it("keeps existing payment labels unchanged", () => {
    expect(getSalePaymentDisplayLabel({ paymentMethod: "Cash" })).toBe("Cash")
    expect(getSalePaymentDisplayLabel({ paymentMethod: "Card" })).toBe("Card")
  })
})
