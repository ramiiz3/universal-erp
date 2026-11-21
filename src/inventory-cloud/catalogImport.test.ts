import { describe, expect, it } from "vitest"
import { previewCloudCatalogImport } from "./catalogImport"

describe("cloud company catalog import preview", () => {
  it("reads product catalog rows without requiring opening stock", () => {
    const result = previewCloudCatalogImport([
      ["Product Name", "SKU", "Category", "Unit", "Purchase Price", "Selling Price", "VAT", "Minimum Stock"],
      ["Product A", "A-1", "General", "Box", "3.50", "5", "5", "1.5"],
    ])
    expect(result.issues).toEqual([])
    expect(result.productCount).toBe(1)
    expect(result.rows[0]).toMatchObject({
      name: "Product A",
      sku: "A-1",
      unit: "Box",
      purchasePrice: 3.5,
      sellingPrice: 5,
      minimumStock: 1.5,
      stockQuantity: 0,
      expiry: null,
    })
  })

  it("preserves multiple opening-stock lots for the same product", () => {
    const result = previewCloudCatalogImport([
      ["Product Name", "Barcode", "Batch", "Expiry Date", "Qty", "Cost", "Lot Selling Price"],
      ["Product A", "123", "B-1", "2027-06", "4.5", "2", "6"],
      ["Product A", "123", "B-2", "2028-07-15", "3", "2.25", "6.5"],
    ])
    expect(result.issues).toEqual([])
    expect(result.productCount).toBe(1)
    expect(result.stockRows).toBe(2)
    expect(result.totalStock).toBe(7.5)
    expect(result.rows.map((row) => row.expiry)).toEqual(["2027-06-01", "2028-07-15"])
  })

  it("supports titled pharmacy stock sheets and DMY expiry values", () => {
    const result = previewCloudCatalogImport([
      ["ZAKI PHARMACY"],
      ["Opening stock"],
      ["SL", "PRODUCT NAME", "Barcode", "Expiry", "QTY", "COST", "S PRICE"],
      [1, "Medicine A", "00123", "15/06/2027", "2", "4", "7"],
    ])
    expect(result.issues).toEqual([])
    expect(result.rows[0]?.name).toBe("Medicine A")
    expect(result.rows[0]?.expiry).toBe("2027-06-15")
    expect(result.rows[0]?.stockQuantity).toBe(2)
  })

  it("preserves an explicit zero batch cost instead of defaulting it to product cost", () => {
    const result = previewCloudCatalogImport([
      ["Product Name", "Purchase Price", "Batch", "Qty", "Lot Purchase Price"],
      ["Product A", "8", "FREE-GOODS", "2", "0"],
    ])
    expect(result.issues).toEqual([])
    expect(result.rows[0]?.purchasePrice).toBe(8)
    expect(result.rows[0]?.lotPurchasePrice).toBe(0)
  })

  it("reports invalid numeric, tax and expiry values", () => {
    const result = previewCloudCatalogImport([
      ["Product Name", "VAT", "Qty", "Expiry"],
      ["Product A", "105", "2", "not-a-date"],
      ["Product B", "", "-1", ""],
    ])
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0]?.message).toContain("VAT rate")
    expect(result.issues[1]?.message).toContain("non-negative number")
  })

  it("flags duplicate imported lot rows rather than double-counting them", () => {
    const result = previewCloudCatalogImport([
      ["Product Name", "Batch", "Expiry", "Qty", "Cost"],
      ["Product A", "B-1", "2027-01-01", "5", "2"],
      ["Product A", "B-1", "2027-01-01", "5", "2"],
    ])
    expect(result.rows).toHaveLength(1)
    expect(result.duplicateRows).toEqual([
      { rowNumber: 3, message: "Duplicate product batch / expiry / cost row. This row is skipped." },
    ])
    expect(result.totalStock).toBe(5)
  })
})
