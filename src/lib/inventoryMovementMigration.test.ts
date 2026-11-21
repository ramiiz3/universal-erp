import { describe, expect, it } from "vitest"
import type {
  InventoryLot,
  InventoryMovement,
  Product,
  Purchase,
  Sale,
} from "../context/ERPContext"
import { migrateHistoricalInventoryMovements } from "./inventoryMovementMigration"

describe("historical inventory movement migration", () => {
  const product = {
    id: "product-1",
    name: "Test Product",
    category: "General",
    sku: "TEST-1",
    barcode: "123",
    purchasePrice: 10,
    sellingPrice: 15,
    minimumStock: 0,
    vatRate: 5,
    unit: "Pack",
  } as Product

  const lot = {
    id: "lot-1",
    productId: product.id,
    batch: "BATCH-1",
    expiry: "2027-12-31",
    quantity: 0,
    purchasePrice: 10,
  } as InventoryLot

  const purchase = {
    id: "purchase-1",
    purchaseNumber: "PUR-00001",
    supplierName: "Test Supplier",
    supplierInvoice: "SUP-001",
    createdAt: "2026-11-20T10:00:00.000Z",
    subtotal: 120,
    total: 120,
    status: "Received",
    items: [{
      id: "purchase-item-1",
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      quantity: 1,
      purchasePrice: 120,
      packageId: "carton-12",
      packageName: "Carton of 12",
      purchaseUnit: "Carton",
      baseUnit: "Pack",
      conversionFactor: 12,
      baseQuantity: 12,
      baseUnitPurchasePrice: 10,
      batch: "BATCH-1",
      expiry: "2027-12-31",
      total: 120,
    }],
  } as unknown as Purchase

  const sale = {
    id: "sale-1",
    invoiceNumber: "INV-00001",
    createdAt: "2026-11-20T11:00:00.000Z",
    customerId: null,
    customerName: "Walk-in Customer",
    paymentMethod: "Cash",
    subtotal: 180,
    discount: 0,
    vat: 9,
    total: 189,
    status: "Paid",
    items: [{
      id: "sale-item-1",
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      quantity: 1,
      unitPrice: 180,
      vatRate: 5,
      total: 180,
      sellingUnit: "Carton",
      packageId: "carton-12",
      packageName: "Carton of 12",
      conversionFactor: 12,
      baseQuantity: 12,
      batchAllocations: [{
        lotId: lot.id,
        batch: lot.batch,
        expiry: lot.expiry,
        quantity: 12,
      }],
      costSnapshot: {
        cogs: 120,
        unitCost: 10,
        lotAllocations: [{
          lotId: lot.id,
          batch: lot.batch,
          expiry: lot.expiry,
          quantity: 12,
          unitCost: 10,
          totalCost: 120,
        }],
      },
    }],
  } as unknown as Sale

  it("reconstructs package purchase receipts and FEFO sale issues in base units", () => {
    const migrated = migrateHistoricalInventoryMovements({
      products: [product],
      inventoryLots: [lot],
      purchases: [purchase],
      sales: [sale],
      inventoryMovements: [] as InventoryMovement[],
    })

    const receipt = migrated.inventoryMovements.find(
      (movement) => movement.type === "RECEIPT",
    )
    const issue = migrated.inventoryMovements.find(
      (movement) => movement.type === "SALE",
    )

    expect(receipt?.quantity).toBe(12)
    expect(receipt?.metadata?.baseUnit).toBe("Pack")
    expect(receipt?.metadata?.referenceNumber).toBe("PUR-00001")

    expect(issue?.quantity).toBe(-12)
    expect(issue?.metadata?.baseUnit).toBe("Pack")
    expect(issue?.metadata?.referenceNumber).toBe("INV-00001")
    expect(issue?.metadata?.totalCost).toBe(120)
  })

  it("does not duplicate movements when the migration runs again", () => {
    const first = migrateHistoricalInventoryMovements({
      products: [product],
      inventoryLots: [lot],
      purchases: [purchase],
      sales: [sale],
      inventoryMovements: [] as InventoryMovement[],
    })

    const second = migrateHistoricalInventoryMovements(first)

    expect(first.inventoryMovements).toHaveLength(2)
    expect(second.inventoryMovements).toHaveLength(2)
  })

  it("preserves existing stock quantities and saved transactions", () => {
    const data = {
      products: [product],
      inventoryLots: [{ ...lot, quantity: 124 }],
      purchases: [purchase],
      sales: [sale],
      inventoryMovements: [] as InventoryMovement[],
    }

    const migrated = migrateHistoricalInventoryMovements(data)

    expect(migrated.inventoryLots[0].quantity).toBe(124)
    expect(migrated.purchases).toBe(data.purchases)
    expect(migrated.sales).toBe(data.sales)
  })
})
