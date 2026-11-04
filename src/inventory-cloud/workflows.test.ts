import { describe, expect, it, vi } from "vitest"
import {
  adjustStockWorkflow,
  receiveStockWorkflow,
  saveProductWorkflow,
  setProductArchiveWorkflow,
} from "./workflows"
import type { CloudInventoryLot, CloudWarehouse } from "./CloudInventoryContext"
import type { ProductInput } from "./domain"

const productForm: ProductInput = {
  name: "Product",
  sku: "SKU",
  barcode: "BAR",
  description: "",
  category: "",
  manufacturer: "",
  unit: "each",
  purchasePrice: "1",
  sellingPrice: "2",
  minimumStock: "0",
  vatRate: "5",
}

const warehouse: CloudWarehouse = {
  id: "warehouse-a",
  company_id: "company-a",
  branch_id: "branch-a",
  name: "Main",
  code: "",
  address: "",
  is_default: true,
  created_at: "",
  updated_at: "",
}

const lot: CloudInventoryLot = {
  id: "lot-a",
  company_id: "company-a",
  product_id: "product-a",
  branch_id: "branch-a",
  warehouse_id: "warehouse-a",
  batch: "batch-a",
  expiry: null,
  quantity: 1.5,
  purchase_price: 1,
  selling_price: null,
  total_purchase_value: null,
  total_selling_value: null,
  created_at: "",
  updated_at: "",
}

describe("company inventory frontend workflows", () => {
  it("creates and edits products through the company-scoped gateway", async () => {
    const gateway = {
      insert: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      setActive: vi.fn(async () => {}),
    }

    await saveProductWorkflow(gateway, "company-a", "user-a", productForm)
    expect(gateway.insert).toHaveBeenCalledWith(expect.objectContaining({
      company_id: "company-a",
      created_by: "user-a",
      name: "Product",
    }))

    await saveProductWorkflow(gateway, "company-a", "user-a", { ...productForm, name: "Edited" }, "product-a")
    expect(gateway.update).toHaveBeenCalledWith("product-a", "company-a", expect.objectContaining({ name: "Edited" }))
  })

  it("archives rather than deleting products and propagates database errors", async () => {
    const setActive = vi.fn(async () => {})
    await setProductArchiveWorkflow({ setActive }, "company-a", "product-a", false)
    expect(setActive).toHaveBeenCalledWith("product-a", "company-a", false)

    const failingGateway = {
      insert: vi.fn(async () => { throw new Error("duplicate SKU") }),
      update: vi.fn(async () => {}),
      setActive: vi.fn(async () => {}),
    }
    await expect(saveProductWorkflow(failingGateway, "company-a", "user-a", productForm)).rejects.toThrow("duplicate SKU")
  })

  it("resolves stock receipts only against accessible company/branch warehouses", async () => {
    const receive = vi.fn(async () => {})
    await receiveStockWorkflow(receive, "company-a", [warehouse], {
      productId: "product-a",
      warehouseId: "warehouse-a",
      batch: "batch-a",
      expiry: "",
      quantity: "0.75",
      purchasePrice: "1.25",
      sellingPrice: "",
      reason: "Delivery",
    }, new Set(["branch-a"]), false, "request-a")
    expect(receive).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-a",
      branchId: "branch-a",
      requestId: "request-a",
      quantity: 0.75,
      purchasePrice: 1.25,
    }))

    await expect(receiveStockWorkflow(receive, "company-a", [warehouse], {
      productId: "product-a",
      warehouseId: "warehouse-a",
      batch: "",
      expiry: "",
      quantity: "1",
      purchasePrice: "1",
      sellingPrice: "",
      reason: "Delivery",
    }, new Set(["branch-other"]), false, "request-other")).rejects.toThrow("not available")
  })

  it("records authorized non-zero adjustments for known lots and rejects negative balances", async () => {
    const adjust = vi.fn(async () => {})
    await adjustStockWorkflow(adjust, "company-a", [lot], {
      lotId: "lot-a",
      quantityDelta: "-0.5",
      reason: "Count correction",
    }, "request-a")
    expect(adjust).toHaveBeenCalledWith({
      companyId: "company-a",
      lotId: "lot-a",
      quantityDelta: -0.5,
      reason: "Count correction",
      requestId: "request-a",
    })
    await expect(adjustStockWorkflow(adjust, "company-a", [lot], {
      lotId: "lot-a",
      quantityDelta: "-2",
      reason: "Bad count",
    }, "request-b")).rejects.toThrow("below zero")
    expect(adjust).toHaveBeenCalledTimes(1)
  })
})
