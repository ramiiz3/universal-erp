import { describe, expect, it } from "vitest"
import type { InventoryLot, Product, Warehouse } from "../context/ERPContext"
import { allocateSaleLots, calculateLotSaleTotals } from "./saleLotAllocation"
import {
  calculateStockCountVariance,
  validateStockCountLines,
  type StockCountLine,
} from "./stockCounts"
import {
  toStockMovementDelta,
  validateStockWriteOff,
} from "./stockAdjustment"
import { buildInventoryAlerts } from "./inventoryAlerts"
import { calculateInventoryValuation } from "./inventoryValuation"

const product: Product = {
  id: "PROD-LIFECYCLE-1",
  name: "Lifecycle Test Medicine",
  category: "Medicine",
  sku: "LIFE-001",
  barcode: "990000000001",
  purchasePrice: 10,
  sellingPrice: 20,
  minimumStock: 2,
  vatRate: 5,
  unit: "Pack",
}

const warehouses: Warehouse[] = [
  {
    id: "WH-MAIN",
    code: "MAIN",
    name: "Main Warehouse",
    type: "MAIN",
    address: "",
    manager: "",
    phone: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "WH-BRANCH",
    code: "BRANCH",
    name: "Branch Warehouse",
    type: "BRANCH",
    address: "",
    manager: "",
    phone: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
]

const openingLots: InventoryLot[] = [
  {
    id: "LOT-FEFO-1",
    productId: product.id,
    batch: "BATCH-EARLIEST",
    expiry: "2026-02-01",
    quantity: 5,
    purchasePrice: 10,
    sellingPrice: 20,
    warehouseId: "WH-MAIN",
    locationId: null,
  },
  {
    id: "LOT-FEFO-2",
    productId: product.id,
    batch: "BATCH-LATER",
    expiry: "2026-03-15",
    quantity: 4,
    purchasePrice: 12,
    sellingPrice: 20,
    warehouseId: "WH-MAIN",
    locationId: null,
  },
  {
    id: "LOT-BRANCH",
    productId: product.id,
    batch: "BATCH-BRANCH",
    expiry: "2027-06-30",
    quantity: 20,
    purchasePrice: 9,
    sellingPrice: 18,
    warehouseId: "WH-BRANCH",
    locationId: null,
  },
]

function runSharedLifecycle() {
  const sale = allocateSaleLots(
    [{ product, quantity: 6, warehouseId: "WH-MAIN" }],
    openingLots,
    new Date(2026, 0, 1),
  )
  const saleTotals = calculateLotSaleTotals(sale.lines)

  let lots = sale.updatedLots
  const writeOffs = [
    { type: "DAMAGE" as const, reason: "Damaged packaging" },
    { type: "LOSS" as const, reason: "Stock missing after inspection" },
  ]

  for (const writeOff of writeOffs) {
    const delta = toStockMovementDelta(1, writeOff.type)
    validateStockWriteOff(writeOff.type, delta, "LOT-FEFO-2", writeOff.reason)
    lots = lots.map((lot) =>
      lot.id === "LOT-FEFO-2"
        ? { ...lot, quantity: lot.quantity + delta }
        : lot,
    )
  }

  return { sale, saleTotals, lots }
}

describe("shared inventory lifecycle integration", () => {
  it("allocates a sale FEFO within its warehouse and preserves branch stock", () => {
    const { sale } = runSharedLifecycle()

    expect(sale.unallocated).toEqual([])
    expect(sale.lines.map((line) => [line.lotId, line.quantity])).toEqual([
      ["LOT-FEFO-1", 5],
      ["LOT-FEFO-2", 1],
    ])
    expect(sale.updatedLots.find((lot) => lot.id === "LOT-BRANCH")?.quantity).toBe(20)
  })

  it("calculates invoice totals from the same FEFO allocations", () => {
    const { saleTotals } = runSharedLifecycle()

    expect(saleTotals.subtotal).toBe(120)
    expect(saleTotals.vat).toBe(6)
    expect(saleTotals.total).toBe(126)
  })

  it("applies damage and loss deltas and reconciles a later physical count", () => {
    const { lots } = runSharedLifecycle()
    const remainingMainLot = lots.find((lot) => lot.id === "LOT-FEFO-2")!

    expect(remainingMainLot.quantity).toBe(1)

    const countLine: StockCountLine = {
      id: "SC-LIFECYCLE-LINE-1",
      lotId: remainingMainLot.id,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      batch: remainingMainLot.batch,
      expiry: remainingMainLot.expiry,
      locationId: null,
      locationName: "",
      systemQuantity: remainingMainLot.quantity,
      countedQuantity: 0,
    }

    expect(validateStockCountLines([countLine])).toEqual([])
    expect(calculateStockCountVariance(countLine)).toBe(-1)
  })

  it("builds expiry and reorder alerts from the post-sale and post-write-off balances", () => {
    const { lots } = runSharedLifecycle()
    const result = buildInventoryAlerts({
      products: [product],
      inventoryLots: lots,
      warehouses,
      warehouseId: "WH-MAIN",
      today: new Date(2026, 0, 1),
    })

    expect(result.summary).toEqual({
      expired: 0,
      expiringSoon: 0,
      upcoming: 1,
      lowStock: 1,
      outOfStock: 0,
    })
    expect(result.expiryAlerts[0]).toMatchObject({
      kind: "UPCOMING",
      batch: "BATCH-LATER",
      quantity: 1,
      warehouseId: "WH-MAIN",
    })
    expect(result.stockAlerts[0]).toMatchObject({
      kind: "LOW_STOCK",
      availableStock: 1,
      minimumStock: 2,
      suggestedReorder: 1,
    })
  })

  it("values the same remaining lots consistently by warehouse and overall", () => {
    const { lots } = runSharedLifecycle()
    const main = calculateInventoryValuation(
      [product],
      lots,
      warehouses,
      [],
      "WH-MAIN",
    )
    const all = calculateInventoryValuation([product], lots, warehouses, [])

    expect(main.totalQuantity).toBe(1)
    expect(main.totalValue).toBe(12)
    expect(main.positiveBatchCount).toBe(1)

    expect(all.totalQuantity).toBe(21)
    expect(all.totalValue).toBe(192)
    expect(all.byWarehouse.find((item) => item.id === "WH-MAIN")?.value).toBe(12)
    expect(all.byWarehouse.find((item) => item.id === "WH-BRANCH")?.value).toBe(180)
  })

  it("does not count expired stock as sellable availability for reorder alerts", () => {
    const expiredLots: InventoryLot[] = [
      {
        ...openingLots[0],
        quantity: 5,
        expiry: "2025-12-31",
      },
    ]
    const result = buildInventoryAlerts({
      products: [product],
      inventoryLots: expiredLots,
      warehouses,
      warehouseId: "WH-MAIN",
      today: new Date(2026, 0, 1),
    })

    expect(result.summary.expired).toBe(1)
    expect(result.summary.outOfStock).toBe(1)
    expect(result.stockAlerts[0]?.availableStock).toBe(0)
    expect(result.stockAlerts[0]?.suggestedReorder).toBe(2)
  })

})
