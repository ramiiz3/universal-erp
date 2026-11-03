import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import type { InventoryLot, Product } from "../context/ERPContext"
import {
  applyInventoryImport,
  buildInventoryExportRows,
  detectInventoryColumnMapping,
  detectInventoryHeaderRow,
  INVENTORY_EXPORT_HEADERS,
  inventoryRowsToCsv,
  previewInventoryImport,
} from "./inventoryTransfer"

const headers = [...INVENTORY_EXPORT_HEADERS]
const mapping = detectInventoryColumnMapping(headers)

const product: Product = {
  id: "P-1",
  name: "Sample Medicine",
  barcode: "123456",
  sku: "SKU-1",
  category: "Medicine",
  manufacturer: "Zaki Labs",
  unit: "Box",
  purchasePrice: 8,
  sellingPrice: 12,
  minimumStock: 2,
  vatRate: 5,
}

const lot: InventoryLot = {
  id: "L-1",
  productId: "P-1",
  batch: "B-1",
  expiry: "2027-06",
  quantity: 5,
  purchasePrice: 8,
}

function row(overrides: Partial<Record<string, string | number>> = {}) {
  const values: (string | number)[] = [
    "P-1", "L-1", "Sample Medicine", "123456", "SKU-1", "Medicine",
    "Zaki Labs", "Box", 8, 12, 2, 5, "B-1", "2027-06", 5, 8,
    12, 40, 60,
  ]
  for (const [key, value] of Object.entries(overrides)) {
    const index = headers.indexOf(key)
    if (index >= 0 && value !== undefined) values[index] = value
  }
  return values
}

describe("inventory import and export", () => {
  it("detects stable exported headings and skips duplicate rows", () => {
    const preview = previewInventoryImport(
      [row(), row()],
      mapping,
      2,
    )

    expect(preview.records).toHaveLength(1)
    expect(preview.duplicateRows).toEqual([
      expect.objectContaining({ rowNumber: 3 }),
    ])
    expect(preview.invalidRows).toHaveLength(0)
  })

  it("accepts fractional stock quantities and reports invalid numeric values", () => {
    const fractional = row({ "Stock Quantity": 1.25 })
    const fractionalPreview = previewInventoryImport([fractional], mapping)
    expect(fractionalPreview.records[0]?.quantity).toBe(1.25)

    const invalid = row({ "Stock Quantity": "not a number" })
    const preview = previewInventoryImport([invalid], mapping)

    expect(preview.records).toHaveLength(0)
    expect(preview.invalidRows[0]?.message).toContain("non-negative number")
  })

  it("matches products and lots by exported IDs and keeps re-import idempotent", () => {
    const preview = previewInventoryImport([row()], mapping)
    const first = applyInventoryImport([product], [lot], preview.records, "merge")
    const exported = buildInventoryExportRows(first.products, first.inventoryLots)
    const roundTrip = previewInventoryImport(exported.slice(1), mapping)
    const second = applyInventoryImport(first.products, first.inventoryLots, roundTrip.records, "merge")

    expect(first.products).toHaveLength(1)
    expect(first.products[0]?.id).toBe("P-1")
    expect(first.inventoryLots).toHaveLength(1)
    expect(second.inventoryLots[0]?.quantity).toBe(5)
    expect(second.products[0]?.manufacturer).toBe("Zaki Labs")
  })

  it("merges new quantities into matching natural lots", () => {
    const values = row({ "Product ID": "", "Inventory Lot ID": "", "Stock Quantity": 3 })
    const preview = previewInventoryImport([values], mapping)
    const result = applyInventoryImport([product], [lot], preview.records, "merge")

    expect(result.products).toHaveLength(1)
    expect(result.inventoryLots).toHaveLength(1)
    expect(result.inventoryLots[0]?.quantity).toBe(8)
  })

  it("falls back to SKU matching and normalizes spreadsheet date cells", () => {
    const values: unknown[] = row({
      "Product ID": "",
      "Inventory Lot ID": "",
      "Barcode": "",
      "Product Name": "Renamed Medicine",
    })
    values[headers.indexOf("Expiry Date")] = new Date("2027-06-15T00:00:00.000Z")
    const preview = previewInventoryImport([values], mapping)
    const result = applyInventoryImport([product], [lot], preview.records, "merge")

    expect(preview.records[0]?.expiry).toBe("2027-06-15")
    expect(result.products).toHaveLength(1)
    expect(result.products[0]?.id).toBe("P-1")
    expect(result.products[0]?.name).toBe("Renamed Medicine")
  })

  it("preserves month-only expiry values from CSV without adding a day", () => {
    const values = row({ "Expiry Date": "2027-12" })
    const preview = previewInventoryImport([values], mapping)

    expect(preview.records[0]?.expiry).toBe("2027-12")
  })

  it("rejects conflicting barcode and SKU matches instead of updating the wrong product", () => {
    const otherProduct: Product = { ...product, id: "P-2", name: "Other", barcode: "789", sku: "SKU-2" }
    const conflicting = row({ SKU: "SKU-2" })
    const preview = previewInventoryImport([conflicting], mapping)

    expect(() => applyInventoryImport([product, otherProduct], [lot], preview.records, "merge"))
      .toThrow("matches different existing products")
  })

  it("replaces quantities without removing products or lot history", () => {
    const otherProduct: Product = { ...product, id: "P-2", name: "Other", barcode: "789", sku: "SKU-2" }
    const otherLot: InventoryLot = { ...lot, id: "L-2", productId: "P-2", quantity: 7 }
    const preview = previewInventoryImport([row()], mapping)
    const result = applyInventoryImport([product, otherProduct], [lot, otherLot], preview.records, "replace")

    expect(result.products.map((item) => item.id)).toEqual(["P-1", "P-2"])
    expect(result.inventoryLots.find((item) => item.id === "L-1")?.quantity).toBe(5)
    expect(result.inventoryLots.find((item) => item.id === "L-2")?.quantity).toBe(0)
  })

  it("quotes CSV values and exports products without lots as zero-stock rows", () => {
    const csv = inventoryRowsToCsv([["Product Name", "Category"], ['Medicine, "A"', "Cold\nCare"]])
    const rows = buildInventoryExportRows([product], [])

    expect(csv).toContain('"Medicine, ""A"""')
    expect(csv).toContain('"Cold\nCare"')
    expect(rows[0]).toEqual(INVENTORY_EXPORT_HEADERS)
    expect(rows[1]?.[14]).toBe(0)
  })

  it("detects the titled Zaki stock summary headings without losing the spacer column", () => {
    const reportRows: unknown[][] = [
      ["ZAKI PHARMACY LLC"],
      ["Shop No 3 Nuaimeya 1, Ajman"],
      ["STOCK SUMMARY"],
      [],
      ["SL", "PRODUCT NAME", "", "Expiry", "QTY", "COST", "TOTAL", "S PRICE", "TOTAL"],
      [1, "24K GOLD PLUS SERUM", "", 46722, 1.25, 4.1234, 5.15425, 9.4567, 11.820875],
      [2, "24K GOLD PLUS SERUM", "", 47088, 2.5, 5.6789, 14.19725, 10.1234, 25.3085],
      [3, "24K GOLD PLUS SERUM", "", 47088, 2.5, 5.6789, 14.19725, 10.1234, 25.3085],
    ]
    const detected = detectInventoryHeaderRow(reportRows)

    expect(detected?.rowIndex).toBe(4)
    expect(detected?.isZakiStockSummary).toBe(true)
    expect(detected?.mapping.productId).toBeNull()
    expect(detected?.mapping.name).toBe(1)
    expect(detected?.mapping.expiry).toBe(3)
    expect(detected?.mapping.quantity).toBe(4)
    expect(detected?.mapping.lotPurchasePrice).toBe(5)
    expect(detected?.mapping.lotTotalPurchaseValue).toBe(6)
    expect(detected?.mapping.lotSellingPrice).toBe(7)
    expect(detected?.mapping.lotTotalSellingValue).toBe(8)

    const preview = previewInventoryImport(
      reportRows.slice((detected?.rowIndex ?? 0) + 1),
      detected!.mapping,
      (detected?.rowIndex ?? 0) + 2,
      detected?.isZakiStockSummary,
    )
    expect(preview.invalidRows).toHaveLength(0)
    expect(preview.records).toHaveLength(3)
    expect(preview.duplicateRows).toHaveLength(0)
    expect(preview.records.map((record) => record.quantity)).toEqual([1.25, 2.5, 2.5])
    expect(preview.records.map((record) => record.expiry)).toEqual(["2027-12-01", "2028-12-01", "2028-12-01"])
    expect(preview.records.map((record) => record.lotPurchasePrice)).toEqual([4.1234, 5.6789, 5.6789])
    expect(preview.records.map((record) => record.lotSellingPrice)).toEqual([9.4567, 10.1234, 10.1234])
    expect(preview.records.map((record) => record.lotTotalPurchaseValue)).toEqual([5.15425, 14.19725, 14.19725])
    expect(preview.records.map((record) => record.lotTotalSellingValue)).toEqual([11.820875, 25.3085, 25.3085])

    const incorrectlyMappedSerial = previewInventoryImport(
      reportRows.slice((detected?.rowIndex ?? 0) + 1, (detected?.rowIndex ?? 0) + 2),
      { ...detected!.mapping, productId: 0 },
      (detected?.rowIndex ?? 0) + 2,
      true,
    )
    expect(incorrectlyMappedSerial.records[0]?.sourceProductId).toBe("")
  })

  it("keeps all summary rows as separate lots and exports their row-level values", () => {
    const reportHeaders = ["SL", "PRODUCT NAME", "", "Expiry", "QTY", "COST", "TOTAL", "S PRICE", "TOTAL"]
    const rows = [
      [1, "24K GOLD PLUS SERUM", "", "2027-12", 1.25, 4.1234, 5.15425, 9.4567, 11.820875],
      [2, "24K GOLD PLUS SERUM", "", "2028-12", 2.5, 5.6789, 14.19725, 10.1234, 25.3085],
      [3, "24K GOLD PLUS SERUM", "", "2028-12", 2.5, 5.6789, 14.19725, 10.1234, 25.3085],
    ]
    const detected = detectInventoryHeaderRow([reportHeaders])
    const preview = previewInventoryImport(rows, detected!.mapping, 2, true)
    const result = applyInventoryImport([], [], preview.records, "merge")
    const exported = buildInventoryExportRows(result.products, result.inventoryLots)

    expect(result.products).toHaveLength(1)
    expect(result.inventoryLots).toHaveLength(3)
    expect(result.inventoryLots.map((item) => item.quantity)).toEqual([1.25, 2.5, 2.5])
    expect(result.inventoryLots.map((item) => item.batch)).toEqual(["", "", ""])
    expect(result.inventoryLots.map((item) => item.sellingPrice)).toEqual([9.4567, 10.1234, 10.1234])
    expect(result.products[0]?.sellingPrice).toBe(9.4567)
    expect(result.inventoryLots.map((item) => item.totalPurchaseValue)).toEqual([5.15425, 14.19725, 14.19725])
    expect(result.inventoryLots.map((item) => item.totalSellingValue)).toEqual([11.820875, 25.3085, 25.3085])
    expect(exported.slice(1).map((exportedRow) => [exportedRow[14], exportedRow[15], exportedRow[16], exportedRow[17], exportedRow[18]]))
      .toEqual([
        [1.25, 4.1234, 9.4567, 5.15425, 11.820875],
        [2.5, 5.6789, 10.1234, 14.19725, 25.3085],
        [2.5, 5.6789, 10.1234, 14.19725, 25.3085],
      ])

    const roundTripPreview = previewInventoryImport(exported.slice(1), detectInventoryColumnMapping(exported[0] ?? []))
    const roundTrip = applyInventoryImport(result.products, result.inventoryLots, roundTripPreview.records, "merge")
    expect(roundTrip.inventoryLots).toHaveLength(3)
    expect(roundTrip.inventoryLots.map((item) => item.quantity)).toEqual([1.25, 2.5, 2.5])
    expect(roundTrip.inventoryLots.map((item) => item.sellingPrice)).toEqual([9.4567, 10.1234, 10.1234])
    expect(roundTrip.inventoryLots.map((item) => item.totalPurchaseValue)).toEqual([5.15425, 14.19725, 14.19725])
    expect(roundTrip.inventoryLots.map((item) => item.totalSellingValue)).toEqual([11.820875, 25.3085, 25.3085])
  })

  it("reads legacy XLS workbooks and CSV text with SheetJS", () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Product Name", "Stock Quantity"], ["Legacy product", 4]]),
      "Stock",
    )
    const legacyFile = XLSX.write(workbook, { bookType: "xls", type: "array" })
    const legacyWorkbook = XLSX.read(legacyFile, { type: "array" })
    const legacyRows = XLSX.utils.sheet_to_json<unknown[]>(
      legacyWorkbook.Sheets.Stock,
      { header: 1, raw: false },
    )
    const csvWorkbook = XLSX.read("Product Name,Stock Quantity\nCSV product,6", { type: "string", raw: true })
    const csvRows = XLSX.utils.sheet_to_json<unknown[]>(
      csvWorkbook.Sheets[csvWorkbook.SheetNames[0]],
      { header: 1, raw: false },
    )

    expect(legacyRows[1]).toEqual(["Legacy product", "4"])
    expect(csvRows[1]).toEqual(["CSV product", "6"])
  })

  it("reads a legacy XLS stock summary with title rows and preserves every source lot", () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["ZAKI PHARMACY LLC"],
      ["Shop No 3 Nuaimeya 1, Ajman"],
      ["STOCK SUMMARY"],
      [],
      ["SL", "PRODUCT NAME", "", "Expiry", "QTY", "COST", "TOTAL", "S PRICE", "TOTAL"],
      [1, "24K GOLD PLUS SERUM", "", 46722, 1.25, 4.1234, 5.15425, 9.4567, 11.820875],
      [2, "24K GOLD PLUS SERUM", "", 47088, 2.5, 5.6789, 14.19725, 10.1234, 25.3085],
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Summary")
    const bytes = XLSX.write(workbook, { bookType: "xls", type: "array" })
    const parsedWorkbook = XLSX.read(bytes, { type: "array", raw: true })
    const parsedRows = XLSX.utils.sheet_to_json<unknown[]>(
      parsedWorkbook.Sheets["Stock Summary"],
      { header: 1, raw: true, defval: "", blankrows: true },
    )
    const detected = detectInventoryHeaderRow(parsedRows)
    const preview = previewInventoryImport(
      parsedRows.slice(detected!.rowIndex + 1),
      detected!.mapping,
      detected!.rowIndex + 2,
      detected!.isZakiStockSummary,
    )

    expect(detected?.rowIndex).toBe(4)
    expect(preview.invalidRows).toHaveLength(0)
    expect(preview.records).toHaveLength(2)
    expect(preview.records[0]?.expiry).toBe("2027-12-01")
    expect(preview.records[1]?.expiry).toBe("2028-12-01")
  })
})
