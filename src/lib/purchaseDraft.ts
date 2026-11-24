export const PURCHASE_DRAFT_STORAGE_KEY = "universal-erp-active-purchase-draft"
export const PURCHASE_DRAFT_EVENT = "universal-erp-purchase-draft-updated"

export type PurchaseDraftLine = {
  id: string
  productId: string
  name: string
  barcode: string
  quantity: number
  purchasePrice: number
  packageId?: string
  packageName?: string
  purchaseUnit?: string
  baseUnit?: string
  conversionFactor?: number
  baseQuantity?: number
  batch: string
  expiry: string
}

export type PurchaseDraft = {
  supplierId: string
  supplierInvoice: string
  barcode: string
  selectedProductId: string
  quantity: string
  purchasePrice: string
  selectedPackageId: string
  batch: string
  expiry: string
  lines: PurchaseDraftLine[]
  warehouseId: string
  locationId: string
  minimized: boolean
  updatedAt: string
}

export function loadPurchaseDraft(): PurchaseDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(PURCHASE_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PurchaseDraft>
    if (
      !value ||
      typeof value !== "object" ||
      !Array.isArray(value.lines) ||
      typeof value.supplierId !== "string" ||
      typeof value.warehouseId !== "string" ||
      typeof value.minimized !== "boolean"
    ) return null
    return {
      supplierId: value.supplierId,
      supplierInvoice: typeof value.supplierInvoice === "string" ? value.supplierInvoice : "",
      barcode: typeof value.barcode === "string" ? value.barcode : "",
      selectedProductId: typeof value.selectedProductId === "string" ? value.selectedProductId : "",
      quantity: typeof value.quantity === "string" ? value.quantity : "",
      purchasePrice: typeof value.purchasePrice === "string" ? value.purchasePrice : "",
      selectedPackageId: typeof value.selectedPackageId === "string" ? value.selectedPackageId : "",
      batch: typeof value.batch === "string" ? value.batch : "",
      expiry: typeof value.expiry === "string" ? value.expiry : "",
      lines: value.lines as PurchaseDraftLine[],
      warehouseId: value.warehouseId,
      locationId: typeof value.locationId === "string" ? value.locationId : "",
      minimized: value.minimized,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function savePurchaseDraft(draft: Omit<PurchaseDraft, "updatedAt">) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(
      PURCHASE_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() } satisfies PurchaseDraft),
    )
    window.dispatchEvent(new Event(PURCHASE_DRAFT_EVENT))
  } catch (error) {
    throw new Error("The purchase draft could not be saved in this browser session. " + (error instanceof Error ? error.message : String(error)))
  }
}

export function clearPurchaseDraft() {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(PURCHASE_DRAFT_STORAGE_KEY)
  window.dispatchEvent(new Event(PURCHASE_DRAFT_EVENT))
}

export function setPurchaseDraftMinimized(minimized: boolean) {
  const draft = loadPurchaseDraft()
  if (!draft) return
  const { updatedAt: _updatedAt, ...rest } = draft
  savePurchaseDraft({ ...rest, minimized })
}
