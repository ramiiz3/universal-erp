import { describe, expect, it } from "vitest"
import { resolvePackagingConversions } from "./productPackaging"

describe("pharmacy pack hierarchy", () => {
  it("calculates nested Strip and Tablet conversions from a Box stock unit", () => {
    const result = resolvePackagingConversions([
      {
        id: "strip",
        name: "Strip",
        unit: "Strip",
        conversionFactor: 1,
        parentPackagingId: "",
        unitsPerParent: 10,
      },
      {
        id: "tablet",
        name: "Tablet",
        unit: "Tablet",
        conversionFactor: 1,
        parentPackagingId: "strip",
        unitsPerParent: 10,
      },
    ])

    expect(result.map((item) => item.conversionFactor)).toEqual([0.1, 0.01])
  })

  it("supports sachets directly contained in the stock box", () => {
    const result = resolvePackagingConversions([
      {
        id: "sachet",
        name: "Sachet",
        unit: "Sachet",
        conversionFactor: 1,
        parentPackagingId: "",
        unitsPerParent: 10,
      },
    ])

    expect(result[0].conversionFactor).toBe(0.1)
  })

  it("preserves legacy direct conversions for existing products", () => {
    const result = resolvePackagingConversions([
      {
        id: "legacy-strip",
        name: "Strip",
        unit: "Strip",
        conversionFactor: 0.1,
      },
    ])

    expect(result[0].conversionFactor).toBe(0.1)
  })

  it("rejects a parent pack that appears after its child", () => {
    expect(() => resolvePackagingConversions([
      {
        id: "tablet",
        name: "Tablet",
        unit: "Tablet",
        conversionFactor: 1,
        parentPackagingId: "strip",
        unitsPerParent: 10,
      },
      {
        id: "strip",
        name: "Strip",
        unit: "Strip",
        conversionFactor: 1,
        parentPackagingId: "",
        unitsPerParent: 10,
      },
    ])).toThrow(/listed above as the parent/)
  })

  it("requires a positive whole number of contained units", () => {
    expect(() => resolvePackagingConversions([
      {
        id: "strip",
        name: "Strip",
        unit: "Strip",
        conversionFactor: 1,
        parentPackagingId: "",
        unitsPerParent: 0,
      },
    ])).toThrow(/whole number greater than zero/)
  })
})
