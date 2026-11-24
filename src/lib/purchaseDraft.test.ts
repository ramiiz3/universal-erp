import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearPurchaseDraft,
  loadPurchaseDraft,
  PURCHASE_DRAFT_EVENT,
  PURCHASE_DRAFT_STORAGE_KEY,
  savePurchaseDraft,
  setPurchaseDraftMinimized,
} from "./purchaseDraft"

const sample = {
  supplierId: "supplier-1",
  supplierInvoice: "INV-1",
  barcode: "",
  selectedProductId: "product-1",
  quantity: "2",
  purchasePrice: "4",
  selectedPackageId: "strip",
  batch: "B001",
  expiry: "2027-12-31",
  lines: [{
    id: "line-1", productId: "product-1", name: "Medicine", barcode: "123",
    quantity: 2, purchasePrice: 4, packageId: "strip", packageName: "Strip",
    purchaseUnit: "strip", baseUnit: "tablet", conversionFactor: 10,
    baseQuantity: 20, batch: "B001", expiry: "2027-12-31",
  }],
  warehouseId: "warehouse-1",
  locationId: "",
  minimized: false,
}

describe("purchase draft persistence", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it("saves and restores the complete purchase draft", () => {
    savePurchaseDraft(sample)
    expect(loadPurchaseDraft()).toMatchObject(sample)
  })

  it("persists minimize and resume state", () => {
    savePurchaseDraft(sample)
    setPurchaseDraftMinimized(true)
    expect(loadPurchaseDraft()?.minimized).toBe(true)
    setPurchaseDraftMinimized(false)
    expect(loadPurchaseDraft()?.minimized).toBe(false)
  })

  it("notifies the global purchase dock on updates", () => {
    const listener = vi.fn()
    window.addEventListener(PURCHASE_DRAFT_EVENT, listener)
    savePurchaseDraft(sample)
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(PURCHASE_DRAFT_EVENT, listener)
  })

  it("clears after completion or cancellation", () => {
    savePurchaseDraft(sample)
    clearPurchaseDraft()
    expect(loadPurchaseDraft()).toBeNull()
    expect(sessionStorage.getItem(PURCHASE_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it("ignores invalid session data", () => {
    sessionStorage.setItem(PURCHASE_DRAFT_STORAGE_KEY, "{bad json")
    expect(loadPurchaseDraft()).toBeNull()
  })
})
