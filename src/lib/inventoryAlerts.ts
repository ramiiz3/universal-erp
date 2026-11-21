import type { InventoryLot, Product, Warehouse } from "../context/ERPContext"
import { parseExpiryDate } from "./expiry"

export type ExpiryAlertKind = "EXPIRED" | "EXPIRING_SOON" | "UPCOMING"
export type StockAlertKind = "LOW_STOCK" | "OUT_OF_STOCK"

export type ExpiryInventoryAlert = {
  category: "EXPIRY"
  kind: ExpiryAlertKind
  productId: string
  productName: string
  sku: string
  batch: string
  expiry: string
  quantity: number
  unit: string
  warehouseId: string
  warehouseName: string
  locationId: string | null
  daysUntilExpiry: number
}

export type ReorderInventoryAlert = {
  category: "REORDER"
  kind: StockAlertKind
  productId: string
  productName: string
  sku: string
  availableStock: number
  minimumStock: number
  suggestedReorder: number
  unit: string
  warehouseId: string | null
  warehouseName: string
}

export type InventoryAlert = ExpiryInventoryAlert | ReorderInventoryAlert

export type InventoryAlertInput = {
  products: Product[]
  inventoryLots: InventoryLot[]
  warehouses: Warehouse[]
  warehouseId?: string
  today?: Date
  expiringSoonDays?: number
  upcomingDays?: number
}

function expiryDeadline(value: string): Date | null {
  const trimmed = value?.trim?.() ?? ""
  if (!trimmed) return null

  // A month/year expiry remains valid through the final calendar day of that month.
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(trimmed)
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (yearMonth || monthYear) {
    const year = Number(yearMonth ? yearMonth[1] : monthYear![2])
    const month = Number(yearMonth ? yearMonth[2] : monthYear![1])
    if (month < 1 || month > 12 || year < 1) return null
    return new Date(year, month, 0)
  }

  const exactDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (exactDate) {
    const year = Number(exactDate[1])
    const month = Number(exactDate[2])
    const day = Number(exactDate[3])
    const date = new Date(year, month - 1, day)
    if (
      month < 1 || month > 12 || day < 1 ||
      date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    ) return null
    return date
  }

  const dayMonthYear = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (dayMonthYear) {
    const day = Number(dayMonthYear[1])
    const month = Number(dayMonthYear[2])
    const year = Number(dayMonthYear[3])
    const date = new Date(year, month - 1, day)
    if (
      month < 1 || month > 12 || day < 1 ||
      date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    ) return null
    return date
  }

  return parseExpiryDate(trimmed)
}

function calendarDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

function isAlertEligible(product: Product): boolean {
  return product.productType !== "SERVICE" &&
    product.status !== "INACTIVE" &&
    product.status !== "DISCONTINUED"
}

export function buildInventoryAlerts(input: InventoryAlertInput): {
  alerts: InventoryAlert[]
  expiryAlerts: ExpiryInventoryAlert[]
  stockAlerts: ReorderInventoryAlert[]
  summary: {
    expired: number
    expiringSoon: number
    upcoming: number
    lowStock: number
    outOfStock: number
  }
} {
  const today = input.today ?? new Date()
  const todayNumber = calendarDayNumber(today)
  const soonDays = Math.max(0, input.expiringSoonDays ?? 30)
  const upcomingDays = Math.max(soonDays, input.upcomingDays ?? 90)
  const warehouseMap = new Map(input.warehouses.map((warehouse) => [warehouse.id, warehouse]))
  const productMap = new Map(input.products.map((product) => [product.id, product]))
  const scopedLots = input.inventoryLots.filter((lot) =>
    !input.warehouseId || lot.warehouseId === input.warehouseId
  )

  const expiryAlerts: ExpiryInventoryAlert[] = []
  for (const lot of scopedLots) {
    if (lot.quantity <= 0) continue
    const product = productMap.get(lot.productId)
    if (!product || !isAlertEligible(product)) continue
    const expiry = expiryDeadline(lot.expiry)
    if (!expiry) continue
    const daysUntilExpiry = calendarDayNumber(expiry) - todayNumber
    let kind: ExpiryAlertKind | null = null
    if (daysUntilExpiry < 0) kind = "EXPIRED"
    else if (daysUntilExpiry <= soonDays) kind = "EXPIRING_SOON"
    else if (daysUntilExpiry <= upcomingDays) kind = "UPCOMING"
    if (!kind) continue

    const warehouse = lot.warehouseId ? warehouseMap.get(lot.warehouseId) : undefined
    expiryAlerts.push({
      category: "EXPIRY",
      kind,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      batch: lot.batch,
      expiry: lot.expiry,
      quantity: lot.quantity,
      unit: product.unit,
      warehouseId: lot.warehouseId ?? "",
      warehouseName: warehouse?.name ?? "Unassigned warehouse",
      locationId: lot.locationId ?? null,
      daysUntilExpiry,
    })
  }

  const stockAlerts: ReorderInventoryAlert[] = []
  for (const product of input.products) {
    if (!isAlertEligible(product)) continue
    const productLots = scopedLots.filter((lot) => lot.productId === product.id)
    const availableStock = productLots.reduce((sum, lot) => {
      const expiry = expiryDeadline(lot.expiry)
      const expired = expiry !== null && calendarDayNumber(expiry) < todayNumber
      return sum + (expired ? 0 : lot.quantity)
    }, 0)
    const minimumStock = Math.max(0, Number(product.minimumStock) || 0)
    const kind: StockAlertKind | null = availableStock <= 0
      ? "OUT_OF_STOCK"
      : minimumStock > 0 && availableStock <= minimumStock
        ? "LOW_STOCK"
        : null
    if (!kind) continue

    const warehouse = input.warehouseId ? warehouseMap.get(input.warehouseId) : undefined
    stockAlerts.push({
      category: "REORDER",
      kind,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      availableStock,
      minimumStock,
      suggestedReorder: Math.max(0, minimumStock - availableStock),
      unit: product.unit,
      warehouseId: input.warehouseId ?? null,
      warehouseName: warehouse?.name ?? "All warehouses",
    })
  }

  const alerts: InventoryAlert[] = [...expiryAlerts, ...stockAlerts]
  const summary = {
    expired: expiryAlerts.filter((alert) => alert.kind === "EXPIRED").length,
    expiringSoon: expiryAlerts.filter((alert) => alert.kind === "EXPIRING_SOON").length,
    upcoming: expiryAlerts.filter((alert) => alert.kind === "UPCOMING").length,
    lowStock: stockAlerts.filter((alert) => alert.kind === "LOW_STOCK").length,
    outOfStock: stockAlerts.filter((alert) => alert.kind === "OUT_OF_STOCK").length,
  }

  return { alerts, expiryAlerts, stockAlerts, summary }
}
