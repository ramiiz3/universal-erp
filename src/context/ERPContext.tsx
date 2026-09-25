import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react"
import type { ReactNode } from "react"

export type Product = {
  id: string
  name: string
  category: string
  sku: string
  barcode: string
  purchasePrice: number
  sellingPrice: number
  minimumStock: number
  vatRate: number
  unit: string
}

export type InventoryLot = {
  id: string
  productId: string
  batch: string
  expiry: string
  quantity: number
  purchasePrice: number
}

export type Customer = {
  id: string
  name: string
  phone: string
  email: string
  whatsapp: string
  status: "Active" | "Inactive"
}

export type PaymentMethod =
  | "Cash"
  | "Card"
  | "Credit"
  | "Bank Transfer"

export type SaleItem = {
  id: string
  productId: string
  name: string
  barcode: string
  quantity: number
  unitPrice: number
  vatRate: number
  total: number
  batchAllocations: {
    lotId: string
    batch: string
    expiry: string
    quantity: number
  }[]
}

export type Sale = {
  id: string
  invoiceNumber: string
  createdAt: string
  customerId: string | null
  customerName: string
  paymentMethod: PaymentMethod
  subtotal: number
  discount: number
  vat: number
  total: number
  status: "Paid" | "Pending" | "Refunded"
  items: SaleItem[]
}

export type PurchaseItem = {
  id: string
  productId: string
  name: string
  barcode: string
  quantity: number
  purchasePrice: number
  batch: string
  expiry: string
  total: number
}

export type Purchase = {
  id: string
  purchaseNumber: string
  supplierName: string
  supplierInvoice: string
  createdAt: string
  subtotal: number
  total: number
  status: "Received"
  items: PurchaseItem[]
}

type CompleteSaleInput = {
  items: {
    productId: string
    quantity: number
    unitPrice?: number
  }[]
  customerId?: string | null
  paymentMethod: PaymentMethod
  discount?: number
}

type CreatePurchaseInput = {
  supplierName: string
  supplierInvoice: string
  items: {
    productId: string
    quantity: number
    purchasePrice: number
    batch: string
    expiry: string
  }[]
}

type ERPContextValue = {
  products: Product[]
  inventoryLots: InventoryLot[]
  customers: Customer[]
  sales: Sale[]
  purchases: Purchase[]

  addProduct: (
    product: Omit<Product, "id">,
  ) => void

  updateProduct: (
    id: string,
    product: Omit<Product, "id">,
  ) => void

  deleteProduct: (id: string) => void

  receiveStock: (
    productId: string,
    batch: string,
    expiry: string,
    quantity: number,
    purchasePrice: number,
  ) => InventoryLot

  addCustomer: (
    customer: Omit<Customer, "id">,
  ) => void

  updateCustomer: (
    id: string,
    customer: Omit<Customer, "id">,
  ) => void

  deleteCustomer: (id: string) => void

  getProductStock: (
    productId: string,
  ) => number

  createPurchase: (
    input: CreatePurchaseInput,
  ) => Purchase

  completeSale: (
    input: CompleteSaleInput,
  ) => Sale
}

const initialProducts: Product[] = [
  {
    id: "PROD-001",
    name: "Panadol Extra",
    category: "Pain Relief",
    sku: "PAN-EXT-001",
    barcode: "8964001234567",
    purchasePrice: 10,
    sellingPrice: 15,
    minimumStock: 30,
    vatRate: 5,
    unit: "Pack",
  },
  {
    id: "PROD-002",
    name: "Vitamin C 1000mg",
    category: "Vitamins",
    sku: "VIT-C-001",
    barcode: "8964001234568",
    purchasePrice: 24,
    sellingPrice: 32,
    minimumStock: 25,
    vatRate: 5,
    unit: "Bottle",
  },
  {
    id: "PROD-003",
    name: "Cetaphil Cleanser",
    category: "Skincare",
    sku: "CET-CLN-001",
    barcode: "8964001234569",
    purchasePrice: 37,
    sellingPrice: 49,
    minimumStock: 20,
    vatRate: 5,
    unit: "Bottle",
  },
  {
    id: "PROD-004",
    name: "Nivea Moisturiser",
    category: "Skincare",
    sku: "NIV-MOI-001",
    barcode: "8964001234570",
    purchasePrice: 21,
    sellingPrice: 28,
    minimumStock: 20,
    vatRate: 5,
    unit: "Tube",
  },
  {
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
  },
  {
    id: "PROD-006",
    name: "Dove Shampoo",
    category: "Hair Care",
    sku: "DOV-SHA-001",
    barcode: "8964001234572",
    purchasePrice: 17,
    sellingPrice: 24,
    minimumStock: 15,
    vatRate: 5,
    unit: "Bottle",
  },
]

const initialInventoryLots: InventoryLot[] = [
  {
    id: "LOT-001",
    productId: "PROD-001",
    batch: "PDX2451",
    expiry: "2028-05-01",
    quantity: 125,
    purchasePrice: 10,
  },
  {
    id: "LOT-002",
    productId: "PROD-002",
    batch: "VTC7742",
    expiry: "2027-11-01",
    quantity: 84,
    purchasePrice: 24,
  },
  {
    id: "LOT-003",
    productId: "PROD-003",
    batch: "CET9182",
    expiry: "2029-02-01",
    quantity: 67,
    purchasePrice: 37,
  },
  {
    id: "LOT-004",
    productId: "PROD-004",
    batch: "NIV5521",
    expiry: "2028-08-01",
    quantity: 41,
    purchasePrice: 21,
  },
  {
    id: "LOT-005",
    productId: "PROD-005",
    batch: "ADV3348",
    expiry: "2027-07-01",
    quantity: 12,
    purchasePrice: 12,
  },
  {
    id: "LOT-006",
    productId: "PROD-006",
    batch: "DOV7412",
    expiry: "2028-03-01",
    quantity: 0,
    purchasePrice: 17,
  },
]

const initialCustomers: Customer[] = [
  {
    id: "CUS-001",
    name: "Ahmed Khan",
    phone: "+971 50 123 4567",
    email: "ahmed@example.com",
    whatsapp: "+971501234567",
    status: "Active",
  },
  {
    id: "CUS-002",
    name: "Sarah Ali",
    phone: "+971 55 234 6789",
    email: "sarah@example.com",
    whatsapp: "+971552346789",
    status: "Active",
  },
  {
    id: "CUS-003",
    name: "Mohammed Hassan",
    phone: "+971 52 345 7890",
    email: "mohammed@example.com",
    whatsapp: "+971523457890",
    status: "Active",
  },
  {
    id: "CUS-004",
    name: "Fatima Rahman",
    phone: "+971 56 456 8901",
    email: "fatima@example.com",
    whatsapp: "+971564568901",
    status: "Active",
  },
  {
    id: "CUS-005",
    name: "Omar Abdullah",
    phone: "+971 58 567 9012",
    email: "omar@example.com",
    whatsapp: "+971585679012",
    status: "Active",
  },
]

const initialSales: Sale[] = []
const initialPurchases: Purchase[] = []

const STORAGE_KEY =
  "universal-erp-demo-store"

type StoredData = {
  products: Product[]
  inventoryLots: InventoryLot[]
  customers: Customer[]
  sales: Sale[]
  purchases: Purchase[]
}

function loadStoredData(): StoredData {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return {
        products: initialProducts,
        inventoryLots:
          initialInventoryLots,
        customers: initialCustomers,
        sales: initialSales,
        purchases: initialPurchases,
      }
    }

    const parsed = JSON.parse(raw)

    return {
      products:
        Array.isArray(parsed.products)
          ? parsed.products
          : initialProducts,

      inventoryLots:
        Array.isArray(parsed.inventoryLots)
          ? parsed.inventoryLots
          : initialInventoryLots,

      customers:
        Array.isArray(parsed.customers)
          ? parsed.customers
          : initialCustomers,

      sales:
        Array.isArray(parsed.sales)
          ? parsed.sales
          : initialSales,

      purchases:
        Array.isArray(parsed.purchases)
          ? parsed.purchases
          : initialPurchases,
    }
  } catch {
    return {
      products: initialProducts,
      inventoryLots:
        initialInventoryLots,
      customers: initialCustomers,
      sales: initialSales,
      purchases: initialPurchases,
    }
  }
}

const ERPContext =
  createContext<ERPContextValue | null>(
    null,
  )

export function ERPProvider({
  children,
}: {
  children: ReactNode
}) {
  const [store, setStore] =
    useState<StoredData>(
      loadStoredData,
    )

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(store),
    )
  }, [store])

  function persistStore(
    nextStore: StoredData,
  ) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(nextStore),
    )

    setStore(nextStore)
  }

  function addProduct(
    product: Omit<Product, "id">,
  ) {
    const newProduct: Product = {
      id: `PROD-${Date.now()}`,
      ...product,
    }

    persistStore({
      ...store,
      products: [
        ...store.products,
        newProduct,
      ],
    })
  }

  function updateProduct(
    id: string,
    product: Omit<Product, "id">,
  ) {
    persistStore({
      ...store,
      products: store.products.map(
        (item) =>
          item.id === id
            ? {
                id,
                ...product,
              }
            : item,
      ),
    })
  }

  function deleteProduct(id: string) {
    persistStore({
      ...store,
      products: store.products.filter(
        (item) => item.id !== id,
      ),
    })
  }

  function receiveStock(
    productId: string,
    batch: string,
    expiry: string,
    quantity: number,
    purchasePrice: number,
  ) {
    if (
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "Quantity must be a whole number greater than zero.",
      )
    }

    const product = store.products.find(
      (item) => item.id === productId,
    )

    if (!product) {
      throw new Error(
        "Product was not found.",
      )
    }

    const normalizedBatch =
      batch.trim().toUpperCase()

    if (!normalizedBatch) {
      throw new Error(
        "Batch number is required.",
      )
    }

    if (!expiry) {
      throw new Error(
        "Expiry date is required.",
      )
    }

    const lots = store.inventoryLots.map(
      (lot) => ({
        ...lot,
      }),
    )

    const existing = lots.find(
      (lot) =>
        lot.productId === productId &&
        lot.batch.trim().toUpperCase() ===
          normalizedBatch &&
        lot.expiry === expiry,
    )

    let savedLot: InventoryLot

    if (existing) {
      existing.quantity += quantity
      existing.purchasePrice = purchasePrice
      savedLot = existing
    } else {
      savedLot = {
        id: `LOT-${Date.now()}`,
        productId,
        batch: normalizedBatch,
        expiry,
        quantity,
        purchasePrice,
      }

      lots.push(savedLot)
    }

    persistStore({
      ...store,
      inventoryLots: lots,
    })

    return savedLot
  }

  function addCustomer(
    customer: Omit<Customer, "id">,
  ) {
    const newCustomer: Customer = {
      id: `CUS-${Date.now()}`,
      ...customer,
    }

    persistStore({
      ...store,
      customers: [
        ...store.customers,
        newCustomer,
      ],
    })
  }

  function updateCustomer(
    id: string,
    customer: Omit<Customer, "id">,
  ) {
    persistStore({
      ...store,
      customers: store.customers.map(
        (item) =>
          item.id === id
            ? {
                id,
                ...customer,
              }
            : item,
      ),
    })
  }

  function deleteCustomer(id: string) {
    persistStore({
      ...store,
      customers: store.customers.filter(
        (item) => item.id !== id,
      ),
    })
  }

  function getProductStock(
    productId: string,
  ) {
    return store.inventoryLots
      .filter(
        (lot) => lot.productId === productId,
      )
      .reduce(
        (sum, lot) =>
          sum + lot.quantity,
        0,
      )
  }

  function getNextInvoiceNumber(
    sales: Sale[],
  ) {
    const year =
      new Date().getFullYear()

    let highest = 0

    sales.forEach((sale) => {
      const match =
        sale.invoiceNumber.match(
          /(\d+)$/,
        )

      if (match) {
        highest = Math.max(
          highest,
          Number(match[1]),
        )
      }
    })

    return `INV-${year}-${String(
      highest + 1,
    ).padStart(5, "0")}`
  }

  function getNextPurchaseNumber(
    purchases: Purchase[],
  ) {
    const year =
      new Date().getFullYear()

    let highest = 0

    purchases.forEach((purchase) => {
      const match =
        purchase.purchaseNumber.match(
          /(\d+)$/,
        )

      if (match) {
        highest = Math.max(
          highest,
          Number(match[1]),
        )
      }
    })

    return `PUR-${year}-${String(
      highest + 1,
    ).padStart(5, "0")}`
  }

  function createPurchase(
    input: CreatePurchaseInput,
  ): Purchase {
    if (!input.supplierName.trim()) {
      throw new Error(
        "Supplier name is required.",
      )
    }

    if (!input.items.length) {
      throw new Error(
        "Add at least one product to the purchase.",
      )
    }

    const preparedItems =
      input.items.map((item) => {
        if (
          !Number.isInteger(
            item.quantity,
          ) ||
          item.quantity <= 0
        ) {
          throw new Error(
            "Purchase quantity must be a whole number greater than zero.",
          )
        }

        if (
          !Number.isFinite(
            item.purchasePrice,
          ) ||
          item.purchasePrice < 0
        ) {
          throw new Error(
            "Purchase price must be zero or greater.",
          )
        }

        if (!item.batch.trim()) {
          throw new Error(
            "Batch number is required for every purchase item.",
          )
        }

        if (!item.expiry) {
          throw new Error(
            "Expiry date is required for every purchase item.",
          )
        }

        const product =
          store.products.find(
            (candidate) =>
              candidate.id ===
              item.productId,
          )

        if (!product) {
          throw new Error(
            `Product ${item.productId} was not found.`,
          )
        }

        return {
          product,
          quantity: item.quantity,
          purchasePrice:
            item.purchasePrice,
          batch:
            item.batch
              .trim()
              .toUpperCase(),
          expiry: item.expiry,
        }
      })

    const updatedLots =
      store.inventoryLots.map(
        (lot) => ({
          ...lot,
        }),
      )

    const purchaseItems:
      PurchaseItem[] = []

    preparedItems.forEach(
      (item, index) => {
        const existingLot =
          updatedLots.find(
            (lot) =>
              lot.productId ===
                item.product.id &&
              lot.batch
                .trim()
                .toUpperCase() ===
                item.batch &&
              lot.expiry ===
                item.expiry,
          )

        if (existingLot) {
          existingLot.quantity +=
            item.quantity

          existingLot.purchasePrice =
            item.purchasePrice
        } else {
          updatedLots.push({
            id: `LOT-${Date.now()}-${index}`,
            productId:
              item.product.id,
            batch: item.batch,
            expiry: item.expiry,
            quantity:
              item.quantity,
            purchasePrice:
              item.purchasePrice,
          })
        }

        purchaseItems.push({
          id: `PITEM-${Date.now()}-${index}`,
          productId:
            item.product.id,
          name:
            item.product.name,
          barcode:
            item.product.barcode,
          quantity:
            item.quantity,
          purchasePrice:
            item.purchasePrice,
          batch: item.batch,
          expiry: item.expiry,
          total:
            item.quantity *
            item.purchasePrice,
        })
      },
    )

    const subtotal =
      purchaseItems.reduce(
        (
          sum: number,
          item: PurchaseItem,
        ) =>
          sum + item.total,
        0,
      )

    const purchase: Purchase = {
      id: `PURCHASE-${Date.now()}`,
      purchaseNumber:
        getNextPurchaseNumber(
          store.purchases,
        ),
      supplierName:
        input.supplierName.trim(),
      supplierInvoice:
        input.supplierInvoice.trim(),
      createdAt:
        new Date().toISOString(),
      subtotal,
      total: subtotal,
      status: "Received",
      items: purchaseItems,
    }

    const nextStore: StoredData = {
      ...store,
      inventoryLots:
        updatedLots,
      purchases: [
        purchase,
        ...store.purchases,
      ],
    }

    persistStore(nextStore)

    return purchase
  }

  function completeSale(
    input: CompleteSaleInput,
  ): Sale {
    if (!input.items.length) {
      throw new Error(
        "Cannot complete a sale with no items.",
      )
    }

    const discount = Math.max(
      0,
      input.discount ?? 0,
    )

    const requestedItems =
      input.items.map((item) => {
        if (
          !Number.isInteger(
            item.quantity,
          ) ||
          item.quantity <= 0
        ) {
          throw new Error(
            "Each product quantity must be a whole number greater than zero.",
          )
        }

        const product =
          store.products.find(
            (candidate) =>
              candidate.id ===
              item.productId,
          )

        if (!product) {
          throw new Error(
            `Product ${item.productId} was not found.`,
          )
        }

        const currentStock =
          getProductStock(
            product.id,
          )

        if (
          item.quantity >
          currentStock
        ) {
          throw new Error(
            `${product.name} only has ${currentStock} unit(s) available.`,
          )
        }

        return {
          product,
          quantity:
            item.quantity,
          unitPrice:
            item.unitPrice ??
            product.sellingPrice,
        }
      })

    const subtotal =
      requestedItems.reduce(
        (
          sum: number,
          item,
        ) =>
          sum +
          item.quantity *
            item.unitPrice,
        0,
      )

    const appliedDiscount =
      Math.min(
        discount,
        subtotal,
      )

    const discountRatio =
      subtotal > 0
        ? appliedDiscount /
          subtotal
        : 0

    const vat =
      requestedItems.reduce(
        (
          sum: number,
          item,
        ) => {
          const lineTotal =
            item.quantity *
            item.unitPrice

          const discountedLine =
            lineTotal *
            (1 - discountRatio)

          return (
            sum +
            discountedLine *
              (item.product
                .vatRate / 100)
          )
        },
        0,
      )

    const total =
      subtotal -
      appliedDiscount +
      vat

    const allocations: {
      itemIndex: number
      lotId: string
      batch: string
      expiry: string
      quantity: number
    }[] = []

    const updatedLots =
      store.inventoryLots.map(
        (lot) => ({
          ...lot,
        }),
      )

    requestedItems.forEach(
      (
        requested,
        itemIndex,
      ) => {
        let remaining =
          requested.quantity

        const matchingLots =
          updatedLots
            .filter(
              (lot) =>
                lot.productId ===
                  requested.product.id &&
                lot.quantity > 0,
            )
            .sort(
              (a, b) =>
                new Date(
                  a.expiry,
                ).getTime() -
                new Date(
                  b.expiry,
                ).getTime(),
            )

        for (
          const lot of matchingLots
        ) {
          if (
            remaining <= 0
          ) {
            break
          }

          const deduction =
            Math.min(
              remaining,
              lot.quantity,
            )

          lot.quantity -=
            deduction

          remaining -= deduction

          allocations.push({
            itemIndex,
            lotId: lot.id,
            batch:
              lot.batch,
            expiry:
              lot.expiry,
            quantity:
              deduction,
          })
        }

        if (
          remaining > 0
        ) {
          throw new Error(
            `Unable to allocate stock for ${requested.product.name}.`,
          )
        }
      },
    )

    const saleItems:
      SaleItem[] =
      requestedItems.map(
        (
          requested,
          index,
        ) => ({
          id: `ITEM-${Date.now()}-${index}`,
          productId:
            requested.product.id,
          name:
            requested.product.name,
          barcode:
            requested.product
              .barcode,
          quantity:
            requested.quantity,
          unitPrice:
            requested.unitPrice,
          vatRate:
            requested.product
              .vatRate,
          total:
            requested.quantity *
            requested.unitPrice,
          batchAllocations:
            allocations
              .filter(
                (
                  allocation,
                ) =>
                  allocation.itemIndex ===
                  index,
              )
              .map(
                ({
                  lotId,
                  batch,
                  expiry,
                  quantity,
                }) => ({
                  lotId,
                  batch,
                  expiry,
                  quantity,
                }),
              ),
        }),
      )

    const customer =
      input.customerId
        ? store.customers.find(
            (item) =>
              item.id ===
              input.customerId,
          )
        : undefined

    const sale: Sale = {
      id: `SALE-${Date.now()}`,
      invoiceNumber:
        getNextInvoiceNumber(
          store.sales,
        ),
      createdAt:
        new Date().toISOString(),
      customerId:
        customer?.id ?? null,
      customerName:
        customer?.name ??
        "Walk-in Customer",
      paymentMethod:
        input.paymentMethod,
      subtotal,
      discount:
        appliedDiscount,
      vat,
      total,
      status:
        input.paymentMethod ===
        "Credit"
          ? "Pending"
          : "Paid",
      items: saleItems,
    }

    const nextStore: StoredData = {
      ...store,
      inventoryLots:
        updatedLots,
      sales: [
        sale,
        ...store.sales,
      ],
    }

    persistStore(nextStore)

    return sale
  }

  return (
    <ERPContext.Provider
      value={{
        products: store.products,
        inventoryLots:
          store.inventoryLots,
        customers: store.customers,
        sales: store.sales,
        purchases:
          store.purchases,
        addProduct,
        updateProduct,
        deleteProduct,
        receiveStock,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        getProductStock,
        createPurchase,
        completeSale,
      }}
    >
      {children}
    </ERPContext.Provider>
  )
}

export function useERP() {
  const context =
    useContext(ERPContext)

  if (!context) {
    throw new Error(
      "useERP must be used inside ERPProvider",
    )
  }

  return context
}
