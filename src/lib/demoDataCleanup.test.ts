import { describe, expect, it } from "vitest"
import { removeBuiltInDemoData } from "./demoDataCleanup"

const demoProduct = {
  id: "PROD-005",
  name: "Advil",
  category: "Pain Relief",
  sku: "ADV-001",
  barcode: "8964001234571",
  purchasePrice: 12,
  sellingPrice: 18,
  minimumStock: 20,
  vatRate: 5,
  unit: "Pack",
}
const demoLot = {
  id: "LOT-005",
  productId: "PROD-005",
  batch: "ADV3348",
  expiry: "2027-07-01",
  quantity: 12,
  purchasePrice: 12,
}
const demoCustomer = {
  id: "CUS-001",
  name: "Ahmed Khan",
  phone: "+971 50 123 4567",
  email: "ahmed@example.com",
  whatsapp: "+971501234567",
  status: "Active",
}

describe("built-in demo data cleanup", () => {
  it("removes exact bundled starter records and keeps company configuration", () => {
    const result = removeBuiltInDemoData({
      products: [demoProduct, { ...demoProduct, id: "REAL-1", name: "Company Product", sku: "C-1", barcode: "987" }],
      inventoryLots: [demoLot],
      customers: [demoCustomer, { ...demoCustomer, id: "REAL-C", name: "Company Customer", email: "accounts@company.test" }],
      sales: [],
      chartOfAccounts: [{ code: "1000", name: "Cash" }],
      warehouses: [{ id: "WH-MAIN", name: "Main Warehouse" }],
    })

    expect(result.removedProducts).toBe(1)
    expect(result.removedInventoryLots).toBe(1)
    expect(result.removedCustomers).toBe(1)
    expect(result.removedWarehouses).toBe(0)
    expect(result.data.products).toEqual([{ ...demoProduct, id: "REAL-1", name: "Company Product", sku: "C-1", barcode: "987" }])
    expect(result.data.inventoryLots).toEqual([])
    expect(result.data.customers).toEqual([{ ...demoCustomer, id: "REAL-C", name: "Company Customer", email: "accounts@company.test" }])
    expect(result.data.chartOfAccounts).toEqual([{ code: "1000", name: "Cash" }])
    expect(result.data.warehouses).toEqual([{ id: "WH-MAIN", name: "Main Warehouse" }])
  })

  it("removes the exact unused starter warehouse but keeps customized or referenced warehouses", () => {
    const starterWarehouse = {
      id: "WH-MAIN",
      name: "Main Warehouse",
      code: "MAIN",
      type: "MAIN",
      address: "",
      manager: "",
      phone: "",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    const removable = removeBuiltInDemoData({
      products: [],
      inventoryLots: [],
      customers: [],
      warehouses: [starterWarehouse],
    })
    expect(removable.removedWarehouses).toBe(1)
    expect(removable.data.warehouses).toEqual([])

    const customized = removeBuiltInDemoData({
      products: [],
      inventoryLots: [],
      customers: [],
      warehouses: [{ ...starterWarehouse, address: "Company location" }],
    })
    expect(customized.removedWarehouses).toBe(0)

    const referenced = removeBuiltInDemoData({
      products: [],
      inventoryLots: [],
      customers: [],
      warehouses: [starterWarehouse],
      storageLocations: [{ id: "LOC-1", warehouseId: "WH-MAIN" }],
    })
    expect(referenced.removedWarehouses).toBe(0)
  })

  it("removes starter records that only gained harmless fields during app migrations", () => {
    const migratedProduct = {
      ...demoProduct,
      productType: "GOODS",
      subcategory: "",
      brand: "",
      manufacturer: "",
      description: "",
      alternateBarcodes: [],
      returnEligible: false,
      status: "ACTIVE",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      vatApplicable: true,
    }
    const migratedLot = {
      ...demoLot,
      warehouseId: "WH-MAIN",
      locationId: null,
      sellingPrice: null,
      totalPurchaseValue: null,
      totalSellingValue: null,
      createdAt: "2026-02-01T00:00:00.000Z",
    }
    const migratedCustomer = {
      ...demoCustomer,
      address: "",
      notes: "",
      customerType: "",
      taxRegistrationNumber: "",
      creditLimit: 0,
      loyaltyPoints: 0,
      isActive: true,
      createdAt: "2026-02-01T00:00:00.000Z",
    }
    const result = removeBuiltInDemoData({
      products: [migratedProduct],
      inventoryLots: [migratedLot],
      customers: [migratedCustomer],
      sales: [],
      inventoryMovements: [],
    })

    expect(result.removedProducts).toBe(1)
    expect(result.removedInventoryLots).toBe(1)
    expect(result.removedCustomers).toBe(1)
    expect(result.data.products).toEqual([])
    expect(result.data.inventoryLots).toEqual([])
    expect(result.data.customers).toEqual([])
  })

  it("removes a starter warehouse with only a migrated updatedAt field", () => {
    const starterWarehouse = {
      id: "WH-MAIN",
      name: "Main Warehouse",
      code: "MAIN",
      type: "MAIN",
      address: "",
      manager: "",
      phone: "",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    }
    const result = removeBuiltInDemoData({
      products: [],
      inventoryLots: [],
      customers: [],
      warehouses: [starterWarehouse],
    })
    expect(result.removedWarehouses).toBe(1)
    expect(result.data.warehouses).toEqual([])
  })

  it("preserves records when a product identity has been changed", () => {
    const result = removeBuiltInDemoData({
      products: [{ ...demoProduct, sku: "NEW-SKU" }],
      inventoryLots: [demoLot],
      customers: [],
      sales: [],
    })

    expect(result.removedProducts).toBe(0)
    expect(result.data.products).toHaveLength(1)
    expect(result.data.inventoryLots).toHaveLength(1)
  })

  it("preserves starter records when stock, price, lot quantity or customer status was changed", () => {
    const changedProduct = { ...demoProduct, sellingPrice: 19 }
    const changedLot = { ...demoLot, quantity: 13 }
    const changedCustomer = { ...demoCustomer, status: "Inactive" as const }

    const result = removeBuiltInDemoData({
      products: [changedProduct],
      inventoryLots: [changedLot],
      customers: [changedCustomer],
      sales: [],
    })

    expect(result.removedProducts).toBe(0)
    expect(result.removedInventoryLots).toBe(0)
    expect(result.removedCustomers).toBe(0)
    expect(result.data.products).toEqual([changedProduct])
    expect(result.data.inventoryLots).toEqual([changedLot])
    expect(result.data.customers).toEqual([changedCustomer])
  })

  it("preserves demo-looking records referenced by business activity", () => {
    const result = removeBuiltInDemoData({
      products: [demoProduct],
      inventoryLots: [demoLot],
      customers: [demoCustomer],
      sales: [{
        items: [{ productId: "PROD-005", lotId: "LOT-005" }],
        customerId: "CUS-001",
      }],
    })

    expect(result.removedProducts).toBe(0)
    expect(result.removedInventoryLots).toBe(0)
    expect(result.removedCustomers).toBe(0)
    expect(result.data.products).toHaveLength(1)
    expect(result.data.inventoryLots).toHaveLength(1)
    expect(result.data.customers).toHaveLength(1)
  })

  it("keeps a starter product that now has a company lot but removes its unused bundled lot", () => {
    const companyLot = {
      id: "LOT-COMPANY-1",
      productId: "PROD-005",
      batch: "NEW-BATCH",
      expiry: "2028-01-01",
      quantity: 20,
      purchasePrice: 13,
    }
    const result = removeBuiltInDemoData({
      products: [demoProduct],
      inventoryLots: [demoLot, companyLot],
      customers: [],
      sales: [],
    })

    expect(result.removedProducts).toBe(0)
    expect(result.removedInventoryLots).toBe(1)
    expect(result.data.products).toEqual([demoProduct])
    expect(result.data.inventoryLots).toEqual([companyLot])
  })

  it("preserves bundled lots referenced as destination lots in transfers", () => {
    const result = removeBuiltInDemoData({
      products: [demoProduct],
      inventoryLots: [demoLot],
      customers: [],
      stockTransfers: [{
        items: [{
          productId: "PROD-005",
          sourceLotId: "another-lot",
          receipts: [{ destinationLotId: "LOT-005", quantity: 2 }],
        }],
      }],
    })

    expect(result.removedProducts).toBe(0)
    expect(result.removedInventoryLots).toBe(0)
  })

  it("is idempotent", () => {
    const first = removeBuiltInDemoData({
      products: [demoProduct],
      inventoryLots: [demoLot],
      customers: [demoCustomer],
      sales: [],
    })
    const second = removeBuiltInDemoData(first.data)

    expect(second.removedProducts).toBe(0)
    expect(second.removedInventoryLots).toBe(0)
    expect(second.removedCustomers).toBe(0)
  })
})
