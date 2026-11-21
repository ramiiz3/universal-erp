import { describe, expect, it } from "vitest"
import {
  buildCompanyProductBarcode,
  normalizeBarcodeCompanyName,
  normalizeBarcodeMobile,
} from "./productBarcode"

describe("company product barcodes", () => {
  it("normalizes the company name and mobile into a Code 128 value", () => {
    expect(buildCompanyProductBarcode(
      { companyName: "Zaki Pharmacy LLC", mobileNumber: "+971 50 123 4567" },
      "a1b2c3d4",
    )).toBe("ZAKIPHARMACYLLC-971501234567-A1B2C3D4")
  })

  it("removes punctuation and whitespace but preserves digits", () => {
    expect(normalizeBarcodeCompanyName("Zaki Pharmacy, L.L.C.")).toBe("ZAKIPHARMACYLLC")
    expect(normalizeBarcodeMobile("+971 (50) 123-4567")).toBe("971501234567")
  })

  it("requires company name, mobile number and a unique product suffix", () => {
    expect(() => buildCompanyProductBarcode({ companyName: "", mobileNumber: "971501234567" }, "ABC123")).toThrow("company name")
    expect(() => buildCompanyProductBarcode({ companyName: "Zaki Pharmacy LLC", mobileNumber: "" }, "ABC123")).toThrow("mobile number")
    expect(() => buildCompanyProductBarcode({ companyName: "Zaki Pharmacy LLC", mobileNumber: "971501234567" }, "ABC")).toThrow("unique product code")
  })

  it("does not exceed a Code 128-safe company identifier length", () => {
    const value = buildCompanyProductBarcode(
      { companyName: "A Very Long Company Name That Must Be Truncated LLC", mobileNumber: "971501234567" },
      "12345678",
    )
    expect(value.split("-")[0]).toHaveLength(32)
    expect(value).toMatch(/^[A-Z0-9-]+$/)
  })
})
