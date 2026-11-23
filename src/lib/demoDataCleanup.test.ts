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
      packagings: [{ id: "DEMO-PACK", name: "Demo Pack", conversionFactor: 1, unit: "Pack", barcode: "" }],
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
      inventoryMovements: [{
        id: "MOV-DEMO-1",
        type: "OPENING",
        productId: "PROD-005",
        lotId: "LOT-005",
        quantity: 12,
        reason: "Demo opening stock",
      }],
    })

    expect(result.removedProducts).toBe(1)
    expect(result.removedInventoryLots).toBe(1)
    expect(result.removedCustomers).toBe(1)
    expect(result.removedInventoryMovements).toBe(1)
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

  it("removes demo records after name, price, stock or barcode edits", () => {
    const changedProduct = { ...demoProduct, name: "Updated demo item", sellingPrice: 19, barcode: "NEW-DEMO-BARCODE" }
    const changedLot = { ...demoLot, quantity: 13, expiry: "2028-01-01" }
    const changedCustomer = { ...demoCustomer, name: "Updated demo customer", status: "Inactive" as const }
    const result = removeBuiltInDemoData({
      products: [changedProduct],
      inventoryLots: [changedLot],
      customers: [changedCustomer],
      sales: [],
      inventoryMovements: [],
    })

    expect(result.removedProducts).toBe(1)
    expect(result.removedInventoryLots).toBe(1)
    expect(result.removedCustomers).toBe(1)
    expect(result.data.products).toEqual([])
    expect(result.data.inventoryLots).toEqual([])
    expect(result.data.customers).toEqual([])
    expect(result.data.inventoryMovements).toEqual([])
  })

  it("removes a sale composed only of bundled demo products and its dependent receipts", () => {
    const demoSale = {
      id: "SALE-DEMO-1",
      invoiceNumber: "INV-DEMO-1",
      customerId: "CUS-001",
      customerName: "Ahmed Khan",
      createdAt: "2026-11-20T12:00:00.000Z",
      paymentMethod: "Cash",
      subtotal: 15,
      discount: 0,
      vat: 0.75,
      total: 15.75,
      status: "Paid",
      items: [{
        id: "SALE-LINE-1",
        productId: "PROD-005",
        name: "Advil",
        quantity: 1,
        batchAllocations: [{
          lotId: "LOT-005",
          batch: "ADV3348",
          expiry: "2027-07-01",
          quantity: 1,
        }],
      }],
    }
    const demoReturn = {
      id: "RETURN-DEMO-1",
      saleId: "SALE-DEMO-1",
      items: [{ productId: "PROD-005", quantity: 1 }],
    }
    const demoPayment = {
      id: "PAYMENT-DEMO-1",
      customerId: "CUS-001",
      amount: 15.75,
      allocations: [{ saleId: "SALE-DEMO-1", amount: 15.75 }],
    }
    const result = removeBuiltInDemoData({
      products: [demoProduct],
      inventoryLots: [demoLot],
      customers: [demoCustomer],
      sales: [demoSale],
      salesReturns: [demoReturn],
      customerPayments: [demoPayment],
      inventoryMovements: [{
        id: "MOV-DEMO-1",
        productId: "PROD-005",
        lotId: "LOT-005",
        type: "SALE",
        quantity: -1,
      }],
    })

    expect(result.removedSales).toBe(1)
    expect(result.removedSalesReturns).toBe(1)
    expect(result.removedCustomerPayments).toBe(1)
    expect(result.removedProducts).toBe(1)
    expect(result.removedInventoryLots).toBe(1)
    expect(result.removedCustomers).toBe(1)
    expect(result.data.sales).toEqual([])
    expect(result.data.salesReturns).toEqual([])
    expect(result.data.customerPayments).toEqual([])
    expect(result.data.products).toEqual([])
    expect(result.data.inventoryLots).toEqual([])
    expect(result.data.customers).toEqual([])
  })

  it("keeps the genuine part of a customer receipt when its other allocation is a demo sale", () => {
    const demoSale = {
      id: "SALE-DEMO-PARTIAL",
      items: [{
        productId: "PROD-005",
        batchAllocations: [{ lotId: "LOT-005" }],
      }],
    }
    const payment = {
      id: "PAYMENT-MIXED",
      customerId: "CUSTOMER-REAL",
      amount: 30,
      allocations: [
        { saleId: "SALE-DEMO-PARTIAL", amount: 10 },
        { saleId: "SALE-GENUINE", amount: 20 },
      ],
    }
    const result = removeBuiltInDemoData({
      products: [demoProduct],
      inventoryLots: [demoLot],
      customers: [],
      sales: [demoSale],
      customerPayments: [payment],
    })

    expect(result.removedSales).toBe(1)
    expect(result.removedCustomerPayments).toBe(0)
    expect(result.data.customerPayments).toEqual([{
      ...payment,
      amount: 20,
      allocations: [{ saleId: "SALE-GENUINE", amount: 20 }],
    }])
  })

  it("preserves demo products when a sale includes a genuine product", () => {
    const genuineProduct = {
      ...demoProduct,
      id: "COMPANY-PRODUCT-1",
      name: "Company Medicine",
      sku: "COMPANY-SKU-1",
      barcode: "COMPANY-123",
    }
    const mixedSale = {
      id: "SALE-MIXED-1",
      items: [
        { productId: "PROD-005", batchAllocations: [{ lotId: "LOT-005" }] },
        { productId: "COMPANY-PRODUCT-1", batchAllocations: [] },
      ],
    }
    const result = removeBuiltInDemoData({
      products: [demoProduct, genuineProduct],
      inventoryLots: [demoLot],
      customers: [],
      sales: [mixedSale],
    })

    expect(result.removedSales).toBe(0)
    expect(result.removedProducts).toBe(0)
    expect(result.data.sales).toHaveLength(1)
    expect(result.data.products).toHaveLength(2)
  })

  it("preserves genuine sales and other demo products when deleting one selected demo product", () => {
    const otherDemoProduct = {
      ...demoProduct,
      id: "PROD-006",
      name: "Dove Shampoo",
      sku: "DOV-SHA-001",
      barcode: "8964001234572",
    }
    const selectedSale = {
      id: "SALE-SELECTED-DEMO",
      items: [{ productId: "PROD-005", batchAllocations: [{ lotId: "LOT-005" }] }],
    }
    const otherSale = {
      id: "SALE-OTHER-DEMO",
      items: [{ productId: "PROD-006", batchAllocations: [{ lotId: "LOT-006" }] }],
    }
    const result = removeBuiltInDemoData({
      products: [demoProduct, otherDemoProduct],
      inventoryLots: [demoLot, { ...demoLot, id: "LOT-006", productId: "PROD-006", batch: "DOV7412" }],
      customers: [],
      sales: [selectedSale, otherSale],
    }, { onlyProductId: "PROD-005" })

    expect(result.removedSales).toBe(1)
    expect(result.data.sales).toEqual([otherSale])
    expect(result.removedProducts).toBe(1)
    expect(result.data.products).toEqual([otherDemoProduct])
  })

  it("preserves demo-looking records referenced by stock transfers or purchases", () => {
    const result = removeBuiltInDemoData({
      products: [demoProduct],
      inventoryLots: [demoLot],
      customers: [],
      sales: [],
      purchases: [{
        id: "PURCHASE-1",
        items: [{ productId: "PROD-005" }],
      }],
    })

    expect(result.removedSales).toBe(0)
    expect(result.removedProducts).toBe(0)
    expect(result.data.products).toHaveLength(1)
    expect(result.data.inventoryLots).toHaveLength(1)
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

  it("deletes only the selected demo product and preserves company warehouses and customers", () => {
    const otherProduct = {
      ...demoProduct,
      id: "REAL-PRODUCT-1",
      name: "Company Product",
      sku: "REAL-SKU-1",
      barcode: "REAL-BARCODE-1",
    }
    const warehouse = {
      id: "WH-COMPANY",
      name: "Company Warehouse",
      code: "COMPANY",
      type: "MAIN",
      address: "Company address",
      manager: "Manager",
      phone: "971500000000",
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
    }
    const result = removeBuiltInDemoData({
      products: [demoProduct, otherProduct],
      inventoryLots: [demoLot],
      customers: [demoCustomer],
      warehouses: [warehouse],
      sales: [],
      purchases: [],
      inventoryMovements: [{
        id: "MOV-DEMO-1",
        type: "OPENING",
        productId: "PROD-005",
        lotId: "LOT-005",
        quantity: 12,
      }],
    }, { onlyProductId: "PROD-005" })

    expect(result.removedProducts).toBe(1)
    expect(result.removedInventoryLots).toBe(1)
    expect(result.removedCustomers).toBe(0)
    expect(result.removedWarehouses).toBe(0)
    expect(result.data.products).toEqual([otherProduct])
    expect(result.data.customers).toEqual([demoCustomer])
    expect(result.data.warehouses).toEqual([warehouse])
    expect(result.data.inventoryMovements).toEqual([])
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
