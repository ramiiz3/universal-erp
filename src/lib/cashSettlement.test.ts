import { describe, expect, it } from "vitest"
import { calculateCashSettlement } from "./cashSettlement"

describe("calculateCashSettlement", () => {
  it("records exact cash with zero change", () => {
    expect(calculateCashSettlement(98.7, 98.7)).toEqual({ cashTendered: 98.7, changeDue: 0 })
  })

  it("calculates change for an overpayment", () => {
    expect(calculateCashSettlement(98.7, 100)).toEqual({ cashTendered: 100, changeDue: 1.3 })
  })

  it("rejects cash below the invoice total", () => {
    expect(() => calculateCashSettlement(100, 99.99)).toThrow("at least equal")
  })

  it("rounds amounts to currency cents", () => {
    expect(calculateCashSettlement(10.005, 20)).toEqual({ cashTendered: 20, changeDue: 9.99 })
  })

  it("rejects negative cash received", () => {
    expect(() => calculateCashSettlement(10, -1)).toThrow("non-negative")
  })

  it("rejects non-finite cash received", () => {
    expect(() => calculateCashSettlement(10, Number.NaN)).toThrow("valid non-negative")
  })

  it("rejects invalid totals", () => {
    expect(() => calculateCashSettlement(Number.POSITIVE_INFINITY, 20)).toThrow("Sale total")
  })

  it("supports zero-value totals", () => {
    expect(calculateCashSettlement(0, 0)).toEqual({ cashTendered: 0, changeDue: 0 })
  })
})
