import { describe, expect, it, vi } from "vitest"
import {
  buildAdjustmentWrite,
  buildProductWrite,
  buildReceiptWrite,
  createSubmissionLock,
  type ProductInput,
} from "./domain"

const productInput: ProductInput = {
  name: "  Herbal tonic ",
  sku: " SKU-01 ",
  barcode: " 12345 ",
  description: "Bottled product",
  category: "Wellness",
  manufacturer: "Example Labs",
  unit: "bottle",
  purchasePrice: "2.75",
  sellingPrice: "4.5",
  minimumStock: "3.25",
  vatRate: "5",
}

describe("company inventory workflows", () => {
  it("builds safe product create and edit payloads from validated form data", () => {
    expect(buildProductWrite(productInput)).toEqual({
      name: "Herbal tonic",
      sku: "SKU-01",
      barcode: "12345",
      description: "Bottled product",
      category: "Wellness",
      manufacturer: "Example Labs",
      unit: "bottle",
      purchase_price: 2.75,
      selling_price: 4.5,
      minimum_stock: 3.25,
      vat_rate: 5,
    })
    expect(buildProductWrite({ ...productInput, manufacturer: "" }).manufacturer).toBeNull()
  })

  it("rejects invalid product values before a database write", () => {
    expect(() => buildProductWrite({ ...productInput, name: " " })).toThrow("Product name")
    expect(() => buildProductWrite({ ...productInput, vatRate: "101" })).toThrow("cannot exceed")
    expect(() => buildProductWrite({ ...productInput, purchasePrice: "-1" })).toThrow("Purchase cost")
  })

  it("preserves fractional lot quantities, lot-specific pricing, and expiry", () => {
    expect(buildReceiptWrite({
      productId: "product-1",
      warehouseId: "warehouse-1",
      batch: "BATCH-4",
      expiry: "2027-06-30",
      quantity: "2.75",
      purchasePrice: "1.25",
      sellingPrice: "3.4",
      reason: "Supplier delivery",
    })).toEqual({
      productId: "product-1",
      warehouseId: "warehouse-1",
      batch: "BATCH-4",
      expiry: "2027-06-30",
      quantity: 2.75,
      purchasePrice: 1.25,
      sellingPrice: 3.4,
      reason: "Supplier delivery",
    })
  })

  it("requires a product, warehouse, positive receipt quantity, and valid prices", () => {
    const receipt = {
      productId: "product-1",
      warehouseId: "warehouse-1",
      batch: "",
      expiry: "",
      quantity: "1",
      purchasePrice: "0",
      sellingPrice: "",
      reason: "",
    }
    expect(() => buildReceiptWrite({ ...receipt, productId: "" })).toThrow("Select a product")
    expect(() => buildReceiptWrite({ ...receipt, warehouseId: "" })).toThrow("Select a warehouse")
    expect(() => buildReceiptWrite({ ...receipt, quantity: "0" })).toThrow("greater than zero")
    expect(() => buildReceiptWrite({ ...receipt, expiry: "not-a-date" })).toThrow("expiry date")
  })

  it("requires a lot, non-zero signed adjustment, and reason", () => {
    expect(buildAdjustmentWrite({
      lotId: "lot-1",
      quantityDelta: "-0.25",
      reason: "Cycle count",
    })).toEqual({ lotId: "lot-1", quantityDelta: -0.25, reason: "Cycle count" })
    expect(() => buildAdjustmentWrite({ lotId: "", quantityDelta: "1", reason: "Count" })).toThrow("Select an inventory lot")
    expect(() => buildAdjustmentWrite({ lotId: "lot-1", quantityDelta: "0", reason: "Count" })).toThrow("non-zero")
    expect(() => buildAdjustmentWrite({ lotId: "lot-1", quantityDelta: "1", reason: " " })).toThrow("reason")
  })

  it("prevents duplicate submissions while the first mutation is pending and unlocks on failure", async () => {
    const run = createSubmissionLock()
    let release!: () => void
    const operation = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const first = run(operation)
    const duplicate = await run(operation)
    expect(duplicate).toBeUndefined()
    expect(operation).toHaveBeenCalledTimes(1)
    release()
    await first

    await expect(run(async () => { throw new Error("network failure") })).rejects.toThrow("network failure")
    await expect(run(async () => "retried")).resolves.toBe("retried")
  })
})
