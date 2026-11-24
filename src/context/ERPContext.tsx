import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState
} from "react"
import type { ReactNode } from "react"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import {
  createERPCloudState,
  areERPCloudStatesEqual,
  restoreERPCloudState,
  ERP_CLOUD_SYNC_EVENT,
} from "../lib/erpCloudState"
import {
  applyInventoryImport as buildImportedInventory,
  type InventoryImportMode,
  type InventoryImportRecord,
  type InventoryImportResult,
} from "../lib/inventoryTransfer"
import {
  allocateSaleLots,
  calculateLotSaleTotals,
} from "../lib/saleLotAllocation"
import {
  ERP_STORAGE_KEY,
} from "../lib/erpBackup"
import { readStoredData } from "../lib/erpStorage"
import { isBuiltInDemoProduct, removeBuiltInDemoData } from "../lib/demoDataCleanup"
import { ERP_SUPPLIERS_STORAGE_KEY } from "../lib/erpStorageKeys"
import { linkPurchasesToSuppliers, normalizeSupplierRecords, validateSupplierInput, type Supplier, type SupplierInput } from "../lib/supplierManagement"
import { applySupplierInvoicePayment, buildSupplierInvoice, type CreateSupplierInvoiceInput, type RecordSupplierInvoicePaymentInput, type SupplierInvoice } from "../lib/supplierInvoices"
export type { Supplier } from "../lib/supplierManagement"
import { validateStockWriteOff } from "../lib/stockAdjustment"
import { mergeLotReceiptCost } from "../lib/inventoryCosting"
import { calculateCashSettlement } from "../lib/cashSettlement"
import { buildCustomerPayment, getSalePaymentSummary, type CustomerPayment, type RecordCustomerPaymentInput } from "../lib/customerPayments"
import { buildPaymentReconciliation, type CreatePaymentReconciliationInput, type PaymentReconciliation } from "../lib/paymentReconciliation"
import {
  applyPurchaseOrderReceipt,
  buildPurchaseOrderFromRequisition,
  buildPurchaseRequisition,
  reviewPurchaseOrder as reviewPurchaseOrderRecord,
  reviewPurchaseRequisition as reviewPurchaseRequisitionRecord,
  submitPurchaseOrder as submitPurchaseOrderRecord,
  submitPurchaseRequisition as submitPurchaseRequisitionRecord,
  type CreatePurchaseRequisitionInput,
  type PurchaseOrder,
  type PurchaseRequisition
} from "../lib/procurementWorkflow"
import {
  type StockCount,
  calculateStockCountVariance,
  createStockCountReference,
  validateStockCountLines,
} from "../lib/stockCounts"
import { buildSalesReturn, isSaleFullyReturned, type CreateSalesReturnInput, type SalesReturn } from "../lib/salesReturns"
import { buildPurchaseReturn, type CreatePurchaseReturnInput, type PurchaseReturn } from "../lib/purchaseReturns"
import BackupRestorePanel from "../components/BackupRestorePanel"

import { DEFAULT_CHART_OF_ACCOUNTS, buildChartOfAccount, validateChartOfAccountInput, validateChartAccountStatus, type ChartOfAccount, type ChartOfAccountInput, type ChartAccountStatus } from "../lib/chartOfAccounts"
import { buildJournalEntry, postJournalEntry as postJournalEntryRecord, type JournalEntry, type JournalEntryInput } from "../lib/journalEntries"
import {
  calculateDailyRegisterSummary,
  getBusinessDate,
  validateDailyRegisterMoney,
  type DailyCashMovementKind,
  type DailyRegisterCashMovement,
  type DailyRegisterSession,
  type DailyRegisterSummary,
} from "../lib/dailyRegister"


export type ProductPackaging = {
  id: string
  name: string
  unit: string
  conversionFactor: number
  barcode?: string
  purchasePrice?: number
  sellingPrice?: number
  purchaseEnabled: boolean
  salesEnabled: boolean
}

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
  vatApplicable?: boolean
  unit: string
  manufacturer?: string

  // Extended Universal ERP product master fields
  productType?: "GOODS" | "SERVICE"
  subcategory?: string
  brand?: string
  alternateBarcodes?: string[]
  description?: string
  returnEligible?: boolean
  status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED"
  packagings?: ProductPackaging[]
}

export type InventoryLot = {
  id: string
  productId: string
  batch: string
  expiry: string
  quantity: number
  purchasePrice: number
  sellingPrice?: number
  totalPurchaseValue?: number
  totalSellingValue?: number
  warehouseId?: string
  locationId?: string | null
}

export type InventoryMovement = {
  id: string
  type: "OPENING" | "RECEIPT" | "SALE" | "RETURN" | "PURCHASE_RETURN" | "ADJUSTMENT" | "DAMAGE" | "LOSS" | "TRANSFER_OUT" | "TRANSFER_IN"
  productId: string
  lotId?: string | null
  // Positive = stock received; negative = stock issued.
  quantity: number
  reason?: string
  createdAt: string
  metadata?: Record<string, any>
}

export type WarehouseType =
  | "MAIN"
  | "BRANCH"
  | "STORE"
  | "TRANSIT"

export type Warehouse = {
  id: string
  code: string
  name: string
  type: WarehouseType
  address: string
  manager: string
  phone: string
  active: boolean
  createdAt: string
}

export type StorageLocation = {
  id: string
  warehouseId: string
  code: string
  name: string
  zone: string
  rack: string
  shelf: string
  bin: string
  active: boolean
  createdAt: string
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

export type SaleItemCostAllocation = {
  lotId: string
  batch: string
  expiry: string
  quantity: number
  unitCost: number
  totalCost: number
}

export type SaleItemCostSnapshot = {
  cogs: number
  unitCost: number
  lotAllocations: SaleItemCostAllocation[]
}

export type SaleItem = {
  id: string
  productId: string
  name: string
  barcode: string
  quantity: number
  unitPrice: number
  vatRate: number
  total: number
  sellingUnit?: string
  packageId?: string
  packageName?: string
  conversionFactor?: number
  baseQuantity?: number
  batchAllocations: {
    lotId: string
    batch: string
    expiry: string
    quantity: number
  }[]
  costSnapshot?: SaleItemCostSnapshot
}

export type Sale = {
  id: string
  invoiceNumber: string
  createdAt: string
  customerId: string | null
  customerName: string
  paymentMethod: PaymentMethod
  cashTendered?: number
  changeDue?: number
  subtotal: number
  discount: number
  vat: number
  total: number
  status: "Paid" | "Pending" | "Refunded"
  items: SaleItem[]

  warehouseId?: string
  warehouseName?: string
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
  packageId?: string
  packageName?: string
  purchaseUnit?: string
  baseUnit?: string
  conversionFactor?: number
  baseQuantity?: number
  baseUnitPurchasePrice?: number
  lotId?: string
}

export type Purchase = {
  id: string
  purchaseNumber: string
  supplierName: string
  supplierId?: string
  supplierInvoice: string
  purchaseOrderId?: string
  purchaseOrderNumber?: string
  createdAt: string
  subtotal: number
  total: number
  status: "Received"
  items: PurchaseItem[]

  warehouseId?: string
  warehouseName?: string
  locationId?: string | null
  locationName?: string
}

type CompleteSaleInput = {
  items: {
    productId: string
    quantity: number
    unitPrice?: number
    packageId?: string
  }[]
  customerId?: string | null
  paymentMethod: PaymentMethod
  cashTendered?: number
  discount?: number

  warehouseId?: string
}

type CreatePurchaseInput = {
  supplierName: string
  supplierId?: string
  supplierInvoice: string
  purchaseOrderId?: string
  items: {
    productId: string
    quantity: number
    purchasePrice: number
    packageId?: string
    batch: string
    expiry: string
  }[]

  warehouseId?: string
  locationId?: string | null
}

type ERPContextValue = {
  cloudSyncStatus: "loading" | "saving" | "saved" | "error"
  cloudSyncError: string
  cloudLastSavedAt: string | null
  syncCloudNow: () => Promise<void>
  resolveCloudSyncConflict: () => Promise<void>
  localStorageError: string
  localLastSavedAt: string | null
  chartOfAccounts: ChartOfAccount[]
  createChartOfAccount: (input: ChartOfAccountInput) => ChartOfAccount
  updateChartOfAccount: (id: string, input: ChartOfAccountInput) => void
  setChartOfAccountStatus: (id: string, status: ChartAccountStatus) => void
  journalEntries: JournalEntry[]
  createJournalEntry: (input: JournalEntryInput) => JournalEntry
  postJournalEntry: (id: string) => JournalEntry
  products: Product[]
  inventoryLots: InventoryLot[]
  inventoryMovements: InventoryMovement[]
  customers: Customer[]
  sales: Sale[]
  customerPayments: CustomerPayment[]
  recordCustomerPayment: (input: RecordCustomerPaymentInput) => CustomerPayment
  paymentReconciliations: PaymentReconciliation[]
  salesReturns: SalesReturn[]
  createSalesReturn: (input: CreateSalesReturnInput) => SalesReturn
  purchaseReturns: PurchaseReturn[]
  createPurchaseReturn: (input: CreatePurchaseReturnInput) => PurchaseReturn
  createPaymentReconciliation: (input: CreatePaymentReconciliationInput) => PaymentReconciliation
  purchases: Purchase[]
  suppliers: Supplier[]
  createSupplier: (input: SupplierInput) => Supplier
  updateSupplier: (id: string, input: SupplierInput) => void
  deleteSupplier: (id: string) => void
  supplierInvoices: SupplierInvoice[]
  createSupplierInvoice: (input: CreateSupplierInvoiceInput) => SupplierInvoice
  recordSupplierInvoicePayment: (id: string, input: RecordSupplierInvoicePaymentInput) => SupplierInvoice
  purchaseRequisitions: PurchaseRequisition[]
  purchaseOrders: PurchaseOrder[]
  createPurchaseRequisition: (input: CreatePurchaseRequisitionInput) => PurchaseRequisition
  submitPurchaseRequisition: (id: string) => void
  reviewPurchaseRequisition: (id: string, decision: "APPROVE" | "REJECT", reviewer: string, note?: string) => void
  createPurchaseOrderFromRequisition: (requisitionId: string) => PurchaseOrder
  submitPurchaseOrder: (id: string) => void
  reviewPurchaseOrder: (id: string, decision: "APPROVE" | "REJECT", reviewer: string, note?: string) => void

  addProduct: (
    product: Omit<Product, "id">,
  ) => void

  addProductAndReceive: (
    product: Omit<Product, "id">,
    batch: string,
    expiry: string,
    quantity: number,
    purchasePrice: number,
  ) => { product: Product; lot: InventoryLot }

  adjustStock: (
    productId: string,
    lotId: string | null,
    quantityDelta: number,
    reason: string,
    warehouseId?: string,
    locationId?: string | null,
    movementType?: "ADJUSTMENT" | "DAMAGE" | "LOSS",
  ) => void

  recordMovement: (
    move: Omit<InventoryMovement, "id" | "createdAt">,
  ) => InventoryMovement

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
    warehouseId?: string,
    locationId?: string | null,
  ) => InventoryLot

  importInventory: (
    records: InventoryImportRecord[],
    mode: InventoryImportMode,
  ) => Promise<InventoryImportResult>

  addCustomer: (
    customer: Omit<Customer, "id">,
  ) => void

  updateCustomer: (
    id: string,
    customer: Omit<Customer, "id">,
  ) => void

  deleteCustomer: (id: string) => void

  getProductStock: (productId: string, warehouseId?: string) => number

  createPurchase: (
    input: CreatePurchaseInput,
  ) => Purchase

  completeSale: (
    input: CompleteSaleInput,
  ) => Sale
  warehouses: Warehouse[]
  storageLocations: StorageLocation[]
  createWarehouse: (input: Omit<Warehouse, 'id' | 'createdAt'>) => Warehouse
  updateWarehouse: (id: string, updates: Partial<Omit<Warehouse, 'id' | 'createdAt'>>) => void
  createStorageLocation: (input: Omit<StorageLocation, 'id' | 'createdAt'>) => StorageLocation
  updateStorageLocation: (id: string, updates: Partial<Omit<StorageLocation, 'id' | 'createdAt'>>) => void
  deleteStorageLocation: (id: string) => void

  stockTransfers: StockTransfer[]
  createStockTransfer: (input: CreateStockTransferInput) => StockTransfer
  dispatchStockTransfer: (id: string) => void
  receiveStockTransfer: (id: string, input: ReceiveStockTransferInput) => void
  cancelStockTransfer: (id: string) => void
  stockCounts: StockCount[]
  createStockCount: (input: { warehouseId: string; locationId?: string | null; notes?: string }) => StockCount
  updateStockCountLine: (countId: string, lineId: string, countedQuantity: number | null) => void
  submitStockCount: (id: string) => void
  postStockCount: (id: string) => void
  cancelStockCount: (id: string) => void
  dailyRegisters: DailyRegisterSession[]
  dailyCashMovements: DailyRegisterCashMovement[]
  addDailyCashMovement: (input: {
    businessDate?: string
    kind: DailyCashMovementKind
    category: string
    amount: number
    note?: string
  }) => DailyRegisterCashMovement
  saveDailyCashReconciliation: (input: {
    businessDate: string
    openingCash: number
    countedCash: number
    reconciledBy?: string
    notes?: string
  }) => DailyRegisterSession
  getDailyRegisterSummary: (businessDate: string, openingCash?: number) => DailyRegisterSummary
}

const initialProducts: Product[] = []
const initialInventoryLots: InventoryLot[] = []
const initialCustomers: Customer[] = []
const initialSales: Sale[] = []
const initialPurchases: Purchase[] = []

export type StockTransferStatus =
  | "DRAFT"
  | "DISPATCHED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED"

export type StockTransferReceipt = {
  id: string
  quantity: number
  destinationLotId: string
  locationId: string | null
  receivedAt: string
}

export type StockTransferItem = {
  id: string
  productId: string
  productName: string
  sourceLotId: string
  batch: string
  expiry: string
  quantity: number
  purchasePrice: number
  sellingPrice?: number
  sourceLocationId: string | null
  receipts: StockTransferReceipt[]
}

export type StockTransfer = {
  id: string
  transferNumber: string
  sourceWarehouseId: string
  sourceWarehouseName: string
  destinationWarehouseId: string
  destinationWarehouseName: string
  destinationLocationId: string | null
  status: StockTransferStatus
  notes: string
  createdAt: string
  dispatchedAt?: string
  receivedAt?: string
  cancelledAt?: string
  items: StockTransferItem[]
}

type CreateStockTransferInput = {
  sourceWarehouseId: string
  destinationWarehouseId: string
  destinationLocationId?: string | null
  notes?: string
  items: {
    sourceLotId: string
    quantity: number
  }[]
}

type ReceiveStockTransferInput = {
  items: {
    itemId: string
    quantity: number
  }[]
  locationId?: string | null
}

type StoredData = {
  chartOfAccounts: ChartOfAccount[]
  journalEntries: JournalEntry[]
  suppliers: Supplier[]
  supplierInvoices: SupplierInvoice[]
  purchaseRequisitions: PurchaseRequisition[]
  purchaseOrders: PurchaseOrder[]
  customerPayments: CustomerPayment[]
  paymentReconciliations: PaymentReconciliation[]
  salesReturns: SalesReturn[]
  purchaseReturns: PurchaseReturn[]
  products: Product[]
  inventoryLots: InventoryLot[]
  inventoryMovements: InventoryMovement[]
  customers: Customer[]
  sales: Sale[]
  purchases: Purchase[]
  warehouses: Warehouse[]
  storageLocations: StorageLocation[]

  stockTransfers: StockTransfer[]
  stockCounts: StockCount[]
  dailyRegisters: DailyRegisterSession[]
  dailyCashMovements: DailyRegisterCashMovement[]
}

function readLegacySuppliers(): Supplier[] {
  try {
    const raw = localStorage.getItem(ERP_SUPPLIERS_STORAGE_KEY)
    return raw ? normalizeSupplierRecords(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function createEmptyStore(): StoredData {
  return {
    chartOfAccounts: DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({ ...account })),
    journalEntries: [],
    suppliers: readLegacySuppliers(),
    supplierInvoices: [],
    purchaseRequisitions: [],
    purchaseOrders: [],
    customerPayments: [],
    paymentReconciliations: [],
    salesReturns: [],
    purchaseReturns: [],
    products: initialProducts,
    inventoryLots: initialInventoryLots,
    inventoryMovements: [],
    customers: initialCustomers,
    sales: initialSales,
    purchases: initialPurchases,
    warehouses: [],
    storageLocations: [],
    stockTransfers: [],
    stockCounts: [],
    dailyRegisters: [],
    dailyCashMovements: [],
  }
}


function migrateWarehouseData(data: StoredData): StoredData {
  const raw = data as StoredData & {
    warehouses?: Warehouse[]
    storageLocations?: StorageLocation[]
    stockTransfers?: StockTransfer[]
    stockCounts?: StockCount[]
    suppliers?: Supplier[]
    chartOfAccounts?: ChartOfAccount[]
    journalEntries?: JournalEntry[]
    supplierInvoices?: SupplierInvoice[]
    purchaseRequisitions?: PurchaseRequisition[]
    purchaseOrders?: PurchaseOrder[]
    customerPayments?: CustomerPayment[]
    salesReturns?: SalesReturn[]
    purchaseReturns?: PurchaseReturn[]
    dailyRegisters?: DailyRegisterSession[]
    dailyCashMovements?: DailyRegisterCashMovement[]
  }

  const suppliers = normalizeSupplierRecords(
    Array.isArray(raw.suppliers) ? raw.suppliers : readLegacySuppliers(),
  )
  const purchases = linkPurchasesToSuppliers(data.purchases || [], suppliers)

  const warehouses = Array.isArray(raw.warehouses) ? raw.warehouses : []

  const activeMain =
    warehouses.find((item) => item.active && item.type === "MAIN") ??
    warehouses.find((item) => item.active) ??
    warehouses[0]

  const validIds = new Set(warehouses.map((item) => item.id))

  return {
    ...data,
    chartOfAccounts: Array.isArray(raw.chartOfAccounts) ? raw.chartOfAccounts : DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({ ...account })),
    journalEntries: Array.isArray(raw.journalEntries) ? raw.journalEntries : [],
    suppliers,
    purchases,
    supplierInvoices: Array.isArray(raw.supplierInvoices) ? raw.supplierInvoices : [],
    purchaseRequisitions: Array.isArray(raw.purchaseRequisitions) ? raw.purchaseRequisitions : [],
    purchaseOrders: Array.isArray(raw.purchaseOrders) ? raw.purchaseOrders : [],
    customerPayments: Array.isArray(raw.customerPayments) ? raw.customerPayments : [],
    paymentReconciliations: Array.isArray(raw.paymentReconciliations) ? raw.paymentReconciliations : [],
    salesReturns: Array.isArray(raw.salesReturns) ? raw.salesReturns : [],
    purchaseReturns: Array.isArray(raw.purchaseReturns) ? raw.purchaseReturns : [],
    warehouses,
    storageLocations: Array.isArray(raw.storageLocations)
      ? raw.storageLocations
      : [],
    stockTransfers: Array.isArray(raw.stockTransfers)
      ? raw.stockTransfers
      : [],
    stockCounts: Array.isArray(raw.stockCounts)
      ? raw.stockCounts
      : [],
    dailyRegisters: Array.isArray(raw.dailyRegisters) ? raw.dailyRegisters : [],
    dailyCashMovements: Array.isArray(raw.dailyCashMovements) ? raw.dailyCashMovements : [],
    inventoryLots: (data.inventoryLots || []).map((lot) => ({
      ...lot,
      warehouseId:
        lot.warehouseId && validIds.has(lot.warehouseId)
          ? lot.warehouseId
          : activeMain?.id,
    })),
  }
}

function loadStoredData() {
  try {
    const result = readStoredData<StoredData>(
      localStorage,
      ERP_STORAGE_KEY,
      createEmptyStore,
    )
    if (result.error) return result

    const cleanup = removeBuiltInDemoData(
      result.data as unknown as Record<string, unknown>,
    )
    const removedRecords =
      cleanup.removedProducts +
      cleanup.removedInventoryLots +
      cleanup.removedCustomers +
      cleanup.removedWarehouses +
      cleanup.removedInventoryMovements +
      cleanup.removedSales +
      cleanup.removedSalesReturns +
      cleanup.removedCustomerPayments

    if (removedRecords > 0 && result.raw !== null) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const backupRoot = `${ERP_STORAGE_KEY}-pre-demo-cleanup-${timestamp}`
      let backupKey = backupRoot
      let suffix = 1
      while (localStorage.getItem(backupKey) !== null) {
        backupKey = `${backupRoot}-${suffix++}`
      }
      try {
        localStorage.setItem(backupKey, result.raw)
      } catch (error) {
        return {
          ...result,
          error: `Demo cleanup was not applied because a recoverable backup could not be saved. Free browser storage and reload. ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }

    return {
      ...result,
      data: cleanup.data as unknown as StoredData,
    }
  } catch (error) {
    return {
      data: createEmptyStore(),
      raw: null,
      error: `Browser storage could not be accessed. ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

const ERPContext =
  createContext<ERPContextValue | null>(
    null,
  )

const ERP_CLOUD_META_KEY = "zaky-pharmacy-erp-cloud-sync-meta"

type ERPCloudSyncMeta = {
  companyId: string
  revision: number
}

function readCloudSyncMeta(): ERPCloudSyncMeta | null {
  try {
    const raw = localStorage.getItem(ERP_CLOUD_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ERPCloudSyncMeta>
    if (
      typeof parsed.companyId !== "string" ||
      typeof parsed.revision !== "number" ||
      !Number.isSafeInteger(parsed.revision) ||
      parsed.revision < 1
    ) return null
    return { companyId: parsed.companyId, revision: parsed.revision }
  } catch {
    return null
  }
}

export function ERPProvider({
  children,
}: {
  children: ReactNode
}) {
  const { activeCompany, user } = useAuth()
  const companyId = activeCompany?.companyId ?? null
  const [loadResult] = useState(loadStoredData)
  const [store, setStore] =
    useState<StoredData>(() => migrateWarehouseData(loadResult.data))
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<ERPContextValue["cloudSyncStatus"]>("loading")
  const [cloudSyncError, setCloudSyncError] = useState("")
  const [cloudLastSavedAt, setCloudLastSavedAt] = useState<string | null>(null)
  const cloudRevisionRef = useRef<number | null>(null)
  const cloudCompanyRef = useRef<string | null>(null)
  const cloudDirtyRef = useRef(false)
  const cloudSavingRef = useRef(false)
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextCloudStoreWriteRef = useRef(false)
  const scheduleCloudSaveRef = useRef<() => void>(() => undefined)
  const [localStorageError, setLocalStorageError] = useState(loadResult.error ?? "")
  const [localLastSavedAt, setLocalLastSavedAt] = useState<string | null>(
    loadResult.raw ? new Date().toISOString() : null,
  )

  useEffect(() => {
    const client = supabase
    if (!companyId || !user?.id || !client) {
      setCloudReady(false)
      setCloudSyncStatus("loading")
      cloudRevisionRef.current = null
      cloudCompanyRef.current = null
      return
    }

    let cancelled = false
    setCloudReady(false)
    setCloudSyncStatus("loading")
    setCloudSyncError("")
    cloudRevisionRef.current = null
    cloudCompanyRef.current = companyId

    const hydrate = async () => {
      if (loadResult.error) {
        throw new Error(
          "The existing workstation data has a storage error. Resolve it or restore a valid ERP backup before connecting cloud storage. " +
          loadResult.error,
        )
      }

      const localSnapshot = createERPCloudState(localStorage)
      const { data: remoteRow, error: readError } = await client
        .from("legacy_erp_state")
        .select("revision, state, updated_at")
        .eq("company_id", companyId)
        .maybeSingle()

      if (readError) throw new Error("Could not read the saved pharmacy data. " + readError.message)

      // Preserve this workstation's exact ERP keys before remote data can
      // replace them. Auth sessions and unrelated browser storage are excluded.
      const { error: recoveryError } = await client
        .from("legacy_erp_recovery_snapshots")
        .insert({
          company_id: companyId,
          reason: remoteRow ? "Before workstation cloud hydration" : "Before initial workstation cloud migration",
          revision: remoteRow ? Number(remoteRow.revision) : null,
          state: localSnapshot,
          created_by: user.id,
        })

      if (recoveryError) {
        throw new Error(
          "A protected recovery copy of this workstation could not be created, so no data was changed. " +
          recoveryError.message,
        )
      }

      if (remoteRow) {
        const remoteRevision = Number(remoteRow.revision)
        if (!Number.isSafeInteger(remoteRevision) || remoteRevision < 1) {
          throw new Error("The saved pharmacy data has an invalid revision number.")
        }

        const meta = readCloudSyncMeta()
        const localDiffersFromCloud =
          !areERPCloudStatesEqual(localSnapshot, remoteRow.state)

        if (meta?.companyId === companyId && localDiffersFromCloud) {
          if (meta.revision !== remoteRevision) {
            throw new Error(
              "This workstation and the database have conflicting ERP changes. A recovery copy of this workstation was saved. Reload or reconcile the newer data before continuing; nothing was overwritten.",
            )
          }

          // The browser may have closed before its debounced save completed.
          // Retry those local changes only when the last acknowledged database
          // revision is unchanged, using the same compare-and-swap protection.
          const { data: recoveredRevision, error: recoverySaveError } =
            await client.rpc("save_legacy_erp_state", {
              p_company_id: companyId,
              p_expected_revision: remoteRevision,
              p_state: localSnapshot,
            })

          if (recoverySaveError) {
            throw new Error(
              recoverySaveError.code === "40001"
                ? "The pharmacy data changed in another tab during recovery. The workstation recovery copy is preserved; reload before continuing."
                : "The pending workstation changes could not be recovered to the database. " + recoverySaveError.message,
            )
          }

          const nextRevision = Number(recoveredRevision)
          if (!Number.isSafeInteger(nextRevision) || nextRevision <= remoteRevision) {
            throw new Error("The database did not confirm recovery of the pending workstation changes.")
          }
          cloudRevisionRef.current = nextRevision
        } else {
          restoreERPCloudState(localStorage, remoteRow.state)
          cloudRevisionRef.current = remoteRevision
        }
      } else {
        const { data: newRevision, error: seedError } = await client.rpc(
          "save_legacy_erp_state",
          {
            p_company_id: companyId,
            p_expected_revision: 0,
            p_state: localSnapshot,
          },
        )

        if (seedError) {
          if (seedError.code !== "40001") {
            throw new Error("Could not migrate this workstation's data to secure storage. " + seedError.message)
          }
          const { data: racedRow, error: racedReadError } = await client
            .from("legacy_erp_state")
            .select("revision, state")
            .eq("company_id", companyId)
            .maybeSingle()
          if (racedReadError || !racedRow) {
            throw new Error("The initial data migration conflicted and could not be safely reloaded.")
          }
          restoreERPCloudState(localStorage, racedRow.state)
          cloudRevisionRef.current = Number(racedRow.revision)
        } else {
          const revision = Number(newRevision)
          if (!Number.isSafeInteger(revision) || revision < 1) {
            throw new Error("The database did not confirm the initial ERP migration.")
          }
          cloudRevisionRef.current = revision
        }
      }

      if (cancelled) return

      const reloaded = loadStoredData()
      if (reloaded.error) throw new Error("The saved ERP data could not be loaded after synchronization. " + reloaded.error)
      setStore(migrateWarehouseData(reloaded.data))

      const revision = cloudRevisionRef.current
      if (revision !== null) {
        localStorage.setItem(
          ERP_CLOUD_META_KEY,
          JSON.stringify({ companyId, revision } satisfies ERPCloudSyncMeta),
        )
      }
      setCloudLastSavedAt(new Date().toISOString())
      setCloudSyncStatus("saved")
      setCloudReady(true)
    }

    void hydrate().catch((error: unknown) => {
      if (cancelled) return
      setCloudReady(false)
      setCloudSyncStatus("error")
      setCloudSyncError(error instanceof Error ? error.message : String(error))
    })

    return () => {
      cancelled = true
    }
  }, [companyId, user?.id, loadResult.error])

  async function saveCloudSnapshot() {
    const client = supabase
    if (
      !cloudReady ||
      !companyId ||
      !user?.id ||
      !client ||
      cloudSavingRef.current ||
      !cloudDirtyRef.current
    ) return

    const expectedRevision = cloudRevisionRef.current
    if (expectedRevision === null || cloudCompanyRef.current !== companyId) return

    cloudSavingRef.current = true
    setCloudSyncStatus("saving")
    setCloudSyncError("")

    try {
      const snapshot = createERPCloudState(localStorage)
      const { data, error } = await client.rpc("save_legacy_erp_state", {
        p_company_id: companyId,
        p_expected_revision: expectedRevision,
        p_state: snapshot,
      })
      if (error) {
        if (error.code === "40001") {
          throw new Error(
            "A different browser tab or workstation saved newer ERP data. This save was stopped to prevent overwriting it. Reload the ERP before continuing.",
          )
        }
        throw new Error("The latest ERP changes could not be saved. " + error.message)
      }

      const nextRevision = Number(data)
      if (!Number.isSafeInteger(nextRevision) || nextRevision <= expectedRevision) {
        throw new Error("The database did not confirm the latest ERP revision.")
      }
      cloudRevisionRef.current = nextRevision
      localStorage.setItem(
        ERP_CLOUD_META_KEY,
        JSON.stringify({ companyId, revision: nextRevision } satisfies ERPCloudSyncMeta),
      )
      setCloudLastSavedAt(new Date().toISOString())

      const latestSnapshot = createERPCloudState(localStorage)
      cloudDirtyRef.current =
        !areERPCloudStatesEqual(latestSnapshot, snapshot)
      setCloudSyncStatus(cloudDirtyRef.current ? "saving" : "saved")
      if (cloudDirtyRef.current) scheduleCloudSaveRef.current()
    } catch (error) {
      setCloudSyncStatus("error")
      setCloudSyncError(error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      cloudSavingRef.current = false
    }
  }

  async function resolveCloudSyncConflict() {
    const client = supabase
    if (!companyId || !user?.id || !client) {
      throw new Error("Sign in to the pharmacy owner account before resolving cloud sync.")
    }
    if (!cloudSyncError.toLowerCase().includes("conflicting erp changes")) {
      throw new Error("There is no confirmed cloud revision conflict to resolve. Refresh the ERP and check the sync status first.")
    }

    if (cloudTimerRef.current) {
      clearTimeout(cloudTimerRef.current)
      cloudTimerRef.current = null
    }

    setCloudReady(false)
    setCloudSyncStatus("saving")
    setCloudSyncError("")
    cloudDirtyRef.current = false

    try {
      const localSnapshot = createERPCloudState(localStorage)
      const { data: remoteRow, error: readError } = await client
        .from("legacy_erp_state")
        .select("revision, state, updated_at")
        .eq("company_id", companyId)
        .maybeSingle()

      if (readError) throw new Error("Could not load the latest cloud ERP data. " + readError.message)
      if (!remoteRow) throw new Error("No saved cloud ERP copy was found for this company.")

      const remoteRevision = Number(remoteRow.revision)
      if (!Number.isSafeInteger(remoteRevision) || remoteRevision < 1) {
        throw new Error("The cloud ERP copy has an invalid revision number.")
      }

      // Keep this browser's exact current ERP data before restoring the cloud copy.
      const { error: recoveryError } = await client
        .from("legacy_erp_recovery_snapshots")
        .insert({
          company_id: companyId,
          reason: "Before user-selected cloud conflict resolution",
          revision: remoteRevision,
          state: localSnapshot,
          created_by: user.id,
        })

      if (recoveryError) {
        throw new Error("The current browser copy could not be preserved, so cloud data was not restored. " + recoveryError.message)
      }

      restoreERPCloudState(localStorage, remoteRow.state)
      const reloaded = loadStoredData()
      if (reloaded.error) {
        throw new Error("The latest cloud data was restored, but this browser could not reload it. " + reloaded.error)
      }

      localStorage.setItem(
        ERP_CLOUD_META_KEY,
        JSON.stringify({ companyId, revision: remoteRevision } satisfies ERPCloudSyncMeta),
      )
      cloudRevisionRef.current = remoteRevision
      cloudCompanyRef.current = companyId
      cloudDirtyRef.current = false
      skipNextCloudStoreWriteRef.current = true
      setStore(migrateWarehouseData(reloaded.data))
      setCloudLastSavedAt(remoteRow.updated_at ?? new Date().toISOString())
      setCloudReady(true)
      setCloudSyncStatus("saved")
      setCloudSyncError("")
    } catch (error) {
      setCloudReady(false)
      setCloudSyncStatus("error")
      setCloudSyncError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function syncCloudNow() {
    const client = supabase
    if (!cloudReady || !companyId || !client) {
      throw new Error("The pharmacy cloud database is not ready to receive this backup.")
    }
    cloudDirtyRef.current = true
    if (cloudTimerRef.current) {
      clearTimeout(cloudTimerRef.current)
      cloudTimerRef.current = null
    }
    await saveCloudSnapshot()
    if (cloudDirtyRef.current) {
      throw new Error("The latest restored ERP backup has not yet been confirmed by the database.")
    }
  }

  function scheduleCloudSave() {
    cloudDirtyRef.current = true
    if (!cloudReady || cloudCompanyRef.current !== companyId) return
    setCloudSyncStatus("saving")
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current)
    cloudTimerRef.current = setTimeout(() => {
      cloudTimerRef.current = null
      void saveCloudSnapshot().catch(() => undefined)
    }, 800)
  }

  scheduleCloudSaveRef.current = scheduleCloudSave

  useEffect(() => {
    if (!cloudReady || loadResult.error || !companyId) return
    if (skipNextCloudStoreWriteRef.current) {
      skipNextCloudStoreWriteRef.current = false
      return
    }
    try {
      localStorage.setItem(ERP_STORAGE_KEY, JSON.stringify(store))
      scheduleCloudSave()
    } catch (error) {
      setCloudSyncStatus("error")
      setCloudSyncError("The local recovery copy could not be updated. " + (error instanceof Error ? error.message : String(error)))
    }
  }, [cloudReady, loadResult.error, store, companyId])

  useEffect(() => {
    const onERPCloudSync = () => scheduleCloudSaveRef.current()
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key.startsWith("universal-erp-")) {
        scheduleCloudSaveRef.current()
      }
    }
    window.addEventListener(ERP_CLOUD_SYNC_EVENT, onERPCloudSync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(ERP_CLOUD_SYNC_EVENT, onERPCloudSync)
      window.removeEventListener("storage", onStorage)
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current)
    }
  }, [])

  function persistStore(
    nextStore: StoredData,
  ) {
    if (loadResult.error) {
      const message = "The saved ERP data could not be validated. Restore a valid backup in Settings before making changes. " + loadResult.error
      setLocalStorageError(message)
      throw new Error(message)
    }

    const normalizedStore = migrateWarehouseData(nextStore)

    try {
      localStorage.setItem(
        ERP_STORAGE_KEY,
        JSON.stringify(normalizedStore),
      )
      setLocalStorageError("")
      setLocalLastSavedAt(new Date().toISOString())
    } catch (error) {
      const message = "The ERP could not save to this browser. The change was not applied. " + (error instanceof Error ? error.message : String(error))
      setLocalStorageError(message)
      throw new Error(message)
    }

    setStore(normalizedStore)
  }

  async function importInventory(
    records: InventoryImportRecord[],
    mode: InventoryImportMode,
  ) {
    if (loadResult.error) {
      throw new Error("The saved ERP data could not be validated. Restore a valid backup in Settings before importing inventory. " + loadResult.error)
    }

    const result = buildImportedInventory(
      store.products,
      store.inventoryLots,
      records,
      mode,
    )
    const nextStore: StoredData = {
      ...store,
      products: result.products,
      inventoryLots: result.inventoryLots,
    }
    const nextRaw = JSON.stringify(nextStore)
    const storedRaw = localStorage.getItem(ERP_STORAGE_KEY)
    const currentRaw = storedRaw ?? JSON.stringify(store)
    const backupBase =
      `${ERP_STORAGE_KEY}-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
    let backupKey = backupBase
    let backupIndex = 1
    while (localStorage.getItem(backupKey) !== null) {
      backupKey = `${backupBase}-${backupIndex++}`
    }

    const byteSize = (value: string) => value.length * 2
    const storageEstimate = await navigator.storage?.estimate()
    if (
      storageEstimate?.quota !== undefined &&
      storageEstimate.usage !== undefined
    ) {
      const addedBytes =
        byteSize(backupKey) +
        byteSize(currentRaw) +
        byteSize(ERP_STORAGE_KEY) +
        byteSize(nextRaw) -
        (storedRaw === null
          ? 0
          : byteSize(ERP_STORAGE_KEY) + byteSize(storedRaw))
      if (storageEstimate.usage + addedBytes > storageEstimate.quota) {
        throw new Error(
          "There may not be enough browser storage for both the import and its required backup. Free browser storage and try again.",
        )
      }
    }

    try {
      localStorage.setItem(backupKey, currentRaw)
      localStorage.setItem(ERP_STORAGE_KEY, nextRaw)
    } catch (error) {
      const reason =
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "Browser storage is full. The import was not saved; the original ERP data remains unchanged."
          : `The import could not be saved. The original ERP data remains unchanged. ${error instanceof Error ? error.message : String(error)}`
      throw new Error(reason)
    }

    setLocalStorageError("")
    setLocalLastSavedAt(new Date().toISOString())
    setStore(nextStore)
    return result
  }


  function createStockCount(input: {
    warehouseId: string
    locationId?: string | null
    notes?: string
  }): StockCount {
    const warehouse = resolveActiveWarehouse(input.warehouseId)
    const selectedLocation = input.locationId
      ? resolveActiveLocation(input.locationId, warehouse.id)
      : undefined

    const matchingLots = store.inventoryLots
      .filter((lot) =>
        lot.warehouseId === warehouse.id &&
        (!selectedLocation || (lot.locationId ?? null) === selectedLocation.id),
      )
      .sort((a, b) => {
        const productA = store.products.find((product) => product.id === a.productId)?.name ?? ""
        const productB = store.products.find((product) => product.id === b.productId)?.name ?? ""
        return productA.localeCompare(productB) || a.batch.localeCompare(b.batch)
      })

    if (!matchingLots.length) {
      throw new Error("There are no inventory lots in this warehouse/location to count.")
    }

    const missingProduct = matchingLots.find(
      (lot) => !store.products.some((product) => product.id === lot.productId),
    )
    if (missingProduct) {
      throw new Error(`Inventory lot ${missingProduct.id} refers to a missing product. Resolve that record before counting.`)
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const reference = createStockCountReference(store.stockCounts ?? [], now)
    const lines = matchingLots.map((lot, index) => {
      const product = store.products.find((item) => item.id === lot.productId)!
      const lotLocation = store.storageLocations.find((item) => item.id === lot.locationId)
      return {
        id: `${reference}-LINE-${String(index + 1).padStart(4, "0")}`,
        lotId: lot.id,
        productId: lot.productId,
        productName: product.name,
        sku: product.sku ?? "",
        unit: product.unit ?? "Unit",
        batch: lot.batch,
        expiry: lot.expiry,
        locationId: lot.locationId ?? null,
        locationName: lotLocation?.name ?? "",
        systemQuantity: lot.quantity,
        countedQuantity: null,
      }
    })

    const count: StockCount = {
      id: reference,
      reference,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      locationId: selectedLocation?.id ?? null,
      locationName: selectedLocation?.name ?? "All locations",
      notes: input.notes?.trim() ?? "",
      status: "DRAFT",
      lines,
      createdAt: nowIso,
    }

    persistStore({
      ...store,
      stockCounts: [count, ...(store.stockCounts ?? [])],
    })
    return count
  }

  function updateStockCountLine(
    countId: string,
    lineId: string,
    countedQuantity: number | null,
  ) {
    const count = (store.stockCounts ?? []).find((item) => item.id === countId)
    if (!count) throw new Error("Stock count not found.")
    if (count.status !== "DRAFT") throw new Error("Only draft stock counts can be edited.")
    if (
      countedQuantity !== null &&
      (!Number.isInteger(countedQuantity) || countedQuantity < 0)
    ) {
      throw new Error("Counted quantity must be a whole number greater than or equal to zero.")
    }
    if (!count.lines.some((line) => line.id === lineId)) {
      throw new Error("Stock count line not found.")
    }

    const updatedCount: StockCount = {
      ...count,
      lines: count.lines.map((line) =>
        line.id === lineId ? { ...line, countedQuantity } : line,
      ),
    }
    persistStore({
      ...store,
      stockCounts: (store.stockCounts ?? []).map((item) =>
        item.id === countId ? updatedCount : item,
      ),
    })
  }

  function submitStockCount(id: string) {
    const count = (store.stockCounts ?? []).find((item) => item.id === id)
    if (!count) throw new Error("Stock count not found.")
    if (count.status !== "DRAFT") throw new Error("Only draft stock counts can be submitted for review.")
    const validationErrors = validateStockCountLines(count.lines)
    if (validationErrors.length) throw new Error(validationErrors.join(" "))

    const updatedCount: StockCount = {
      ...count,
      status: "REVIEW",
      submittedAt: new Date().toISOString(),
    }
    persistStore({
      ...store,
      stockCounts: (store.stockCounts ?? []).map((item) =>
        item.id === id ? updatedCount : item,
      ),
    })
  }

  function postStockCount(id: string) {
    const count = (store.stockCounts ?? []).find((item) => item.id === id)
    if (!count) throw new Error("Stock count not found.")
    if (count.status !== "REVIEW") throw new Error("Submit the stock count for review before posting adjustments.")

    const validationErrors = validateStockCountLines(count.lines)
    if (validationErrors.length) throw new Error(validationErrors.join(" "))

    // Protect stock movements made after the count snapshot. A changed or newly
    // created lot requires a fresh count instead of silently overwriting stock.
    const currentScopeLots = store.inventoryLots.filter((lot) =>
      lot.warehouseId === count.warehouseId &&
      (!count.locationId || (lot.locationId ?? null) === count.locationId),
    )
    const snapshotLotIds = new Set(count.lines.map((line) => line.lotId))
    if (
      currentScopeLots.length !== count.lines.length ||
      currentScopeLots.some((lot) => !snapshotLotIds.has(lot.id))
    ) {
      throw new Error("Inventory lots changed after this count started. Cancel this count and create a new count before posting.")
    }

    const currentLotsById = new Map(store.inventoryLots.map((lot) => [lot.id, lot]))
    for (const line of count.lines) {
      const currentLot = currentLotsById.get(line.lotId)
      if (
        !currentLot ||
        currentLot.productId !== line.productId ||
        currentLot.warehouseId !== count.warehouseId ||
        (currentLot.locationId ?? null) !== line.locationId ||
        currentLot.quantity !== line.systemQuantity
      ) {
        throw new Error(`Stock for ${line.productName} / batch ${line.batch} changed after the count began. Cancel this count and recount before posting.`)
      }
    }

    const nowIso = new Date().toISOString()
    const updatedLots = store.inventoryLots.map((lot) => ({ ...lot }))
    const updatedLotsById = new Map(updatedLots.map((lot) => [lot.id, lot]))
    const newMovements: InventoryMovement[] = []

    count.lines.forEach((line, index) => {
      const variance = calculateStockCountVariance(line)
      if (variance === null || variance === 0) return
      const lot = updatedLotsById.get(line.lotId)
      if (!lot) throw new Error(`Inventory lot ${line.lotId} no longer exists.`)
      const countedQuantity = line.countedQuantity!
      lot.quantity = countedQuantity
      const location = store.storageLocations.find((item) => item.id === line.locationId)
      newMovements.push({
        id: `MOV-${Date.now()}-SC-${index + 1}`,
        type: "ADJUSTMENT",
        productId: line.productId,
        lotId: line.lotId,
        quantity: variance,
        reason: `Stock count ${count.reference}${count.notes ? ` — ${count.notes}` : ""}`,
        createdAt: nowIso,
        metadata: {
          source: "STOCK_COUNT",
          stockCountId: count.id,
          stockCountReference: count.reference,
          warehouseId: count.warehouseId,
          warehouseName: count.warehouseName,
          locationId: line.locationId,
          locationName: location?.name ?? line.locationName,
          batch: line.batch,
          expiry: line.expiry,
          systemQuantity: line.systemQuantity,
          countedQuantity,
          variance,
        },
      })
    })

    const postedCount: StockCount = {
      ...count,
      status: "POSTED",
      postedAt: nowIso,
    }
    persistStore({
      ...store,
      inventoryLots: updatedLots,
      inventoryMovements: [...newMovements, ...(store.inventoryMovements ?? [])],
      stockCounts: (store.stockCounts ?? []).map((item) =>
        item.id === id ? postedCount : item,
      ),
    })
  }

  function cancelStockCount(id: string) {
    const count = (store.stockCounts ?? []).find((item) => item.id === id)
    if (!count) throw new Error("Stock count not found.")
    if (count.status !== "DRAFT" && count.status !== "REVIEW") {
      throw new Error("Only draft or review stock counts can be cancelled.")
    }
    const cancelledCount: StockCount = {
      ...count,
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
    }
    persistStore({
      ...store,
      stockCounts: (store.stockCounts ?? []).map((item) =>
        item.id === id ? cancelledCount : item,
      ),
    })
  }

  function createStockTransfer(
    input: CreateStockTransferInput,
  ): StockTransfer {
    if (!input.items.length) {
      throw new Error("Add at least one batch to the transfer.")
    }

    const source = resolveActiveWarehouse(input.sourceWarehouseId)
    const destination = resolveActiveWarehouse(input.destinationWarehouseId)

    if (source.id === destination.id) {
      throw new Error("Source and destination warehouses must be different.")
    }

    const destinationLocation = resolveActiveLocation(
      input.destinationLocationId,
      destination.id,
    )

    const seen = new Set<string>()

    const items: StockTransferItem[] = input.items.map((request, index) => {
      if (!Number.isInteger(request.quantity) || request.quantity <= 0) {
        throw new Error("Transfer quantities must be positive whole numbers.")
      }

      if (seen.has(request.sourceLotId)) {
        throw new Error("A batch can only appear once in a transfer.")
      }
      seen.add(request.sourceLotId)

      const lot = store.inventoryLots.find(
        (candidate) => candidate.id === request.sourceLotId,
      )

      if (!lot || lot.warehouseId !== source.id) {
        throw new Error("A selected batch does not belong to the source warehouse.")
      }

      if (lot.quantity < request.quantity) {
        throw new Error(`Insufficient stock in batch ${lot.batch}.`)
      }

      const product = store.products.find(
        (candidate) => candidate.id === lot.productId,
      )
      if (!product) {
        throw new Error("Product for selected batch was not found.")
      }

      return {
        id: `TITEM-${Date.now()}-${index}`,
        productId: product.id,
        productName: product.name,
        sourceLotId: lot.id,
        batch: lot.batch,
        expiry: lot.expiry,
        quantity: request.quantity,
        purchasePrice: lot.purchasePrice,
        sellingPrice: lot.sellingPrice,
        sourceLocationId: lot.locationId ?? null,
        receipts: [],
      }
    })

    const year = new Date().getFullYear()
    const prefix = `TRF-${year}-`

    const highest = (store.stockTransfers ?? [])
      .filter((item) => item.transferNumber.startsWith(prefix))
      .reduce((max, item) => {
        const number = Number(item.transferNumber.slice(prefix.length))
        return Number.isFinite(number) ? Math.max(max, number) : max
      }, 0)

    const transfer: StockTransfer = {
      id: `TRANSFER-${Date.now()}`,
      transferNumber: `${prefix}${String(highest + 1).padStart(5, "0")}`,
      sourceWarehouseId: source.id,
      sourceWarehouseName: source.name,
      destinationWarehouseId: destination.id,
      destinationWarehouseName: destination.name,
      destinationLocationId: destinationLocation?.id ?? null,
      status: "DRAFT",
      notes: (input.notes ?? "").trim(),
      createdAt: new Date().toISOString(),
      items,
    }

    persistStore({
      ...store,
      stockTransfers: [transfer, ...(store.stockTransfers ?? [])],
    })

    return transfer
  }

  function dispatchStockTransfer(id: string) {
    const transfer = store.stockTransfers.find((item) => item.id === id)

    if (!transfer) throw new Error("Stock transfer was not found.")
    if (transfer.status !== "DRAFT") {
      throw new Error("Only draft transfers can be dispatched.")
    }

    resolveActiveWarehouse(transfer.sourceWarehouseId)
    resolveActiveWarehouse(transfer.destinationWarehouseId)

    const updatedLots = store.inventoryLots.map((lot) => ({ ...lot }))

    // Validate every source lot before changing any stock.
    for (const item of transfer.items) {
      const lot = updatedLots.find((candidate) => candidate.id === item.sourceLotId)

      if (
        !lot ||
        lot.productId !== item.productId ||
        lot.warehouseId !== transfer.sourceWarehouseId ||
        lot.batch !== item.batch ||
        lot.expiry !== item.expiry
      ) {
        throw new Error(`Source batch ${item.batch} is no longer valid.`)
      }

      if (lot.quantity < item.quantity) {
        throw new Error(`Insufficient remaining stock in batch ${item.batch}.`)
      }
    }

    const dispatchedAt = new Date().toISOString()
    const movements: InventoryMovement[] = []

    transfer.items.forEach((item, index) => {
      const lot = updatedLots.find((candidate) => candidate.id === item.sourceLotId)!
      lot.quantity -= item.quantity

      const product = store.products.find((candidate) => candidate.id === item.productId)

      movements.push({
        id: `MOV-${transfer.id}-OUT-${index}`,
        type: "TRANSFER_OUT",
        productId: item.productId,
        lotId: lot.id,
        quantity: -item.quantity,
        reason: `Transfer dispatch ${transfer.transferNumber}`,
        createdAt: dispatchedAt,
        metadata: {
          referenceType: "STOCK_TRANSFER",
          referenceId: transfer.id,
          referenceNumber: transfer.transferNumber,
          sourceWarehouseId: transfer.sourceWarehouseId,
          sourceWarehouseName: transfer.sourceWarehouseName,
          destinationWarehouseId: transfer.destinationWarehouseId,
          destinationWarehouseName: transfer.destinationWarehouseName,
          sourceLocationId: item.sourceLocationId,
          batch: item.batch,
          expiry: item.expiry,
          baseUnit: product?.unit ?? "",
          unitCost: item.purchasePrice,
          totalCost: item.quantity * item.purchasePrice,
        },
      })
    })

    const updatedTransfer: StockTransfer = {
      ...transfer,
      status: "DISPATCHED",
      dispatchedAt,
    }

    persistStore({
      ...store,
      inventoryLots: updatedLots,
      inventoryMovements: [...movements, ...store.inventoryMovements],
      stockTransfers: store.stockTransfers.map((item) =>
        item.id === id ? updatedTransfer : item,
      ),
    })
  }

  function receiveStockTransfer(
    id: string,
    input: ReceiveStockTransferInput,
  ) {
    const transfer = store.stockTransfers.find((item) => item.id === id)

    if (!transfer) throw new Error("Stock transfer was not found.")
    if (
      transfer.status !== "DISPATCHED" &&
      transfer.status !== "PARTIALLY_RECEIVED"
    ) {
      throw new Error("This transfer is not awaiting receipt.")
    }
    if (!input.items.length) {
      throw new Error("Enter at least one quantity to receive.")
    }

    const destination = resolveActiveWarehouse(transfer.destinationWarehouseId)
    const requestedLocation =
      input.locationId === undefined
        ? transfer.destinationLocationId
        : input.locationId

    const location = resolveActiveLocation(requestedLocation, destination.id)
    const seen = new Set<string>()

    // Validate every receipt line before changing destination inventory.
    for (const request of input.items) {
      if (seen.has(request.itemId)) {
        throw new Error("A transfer line can only appear once per receipt.")
      }
      seen.add(request.itemId)

      if (!Number.isInteger(request.quantity) || request.quantity <= 0) {
        throw new Error("Receipt quantities must be positive whole numbers.")
      }

      const line = transfer.items.find((item) => item.id === request.itemId)
      if (!line) throw new Error("Selected transfer line was not found.")

      const received = line.receipts.reduce(
        (sum, receipt) => sum + receipt.quantity,
        0,
      )
      const remaining = line.quantity - received

      if (request.quantity > remaining) {
        throw new Error(`Cannot receive more than ${remaining} remaining units of ${line.batch}.`)
      }
    }

    const updatedLots = store.inventoryLots.map((lot) => ({ ...lot }))
    const updatedItems = transfer.items.map((item) => ({
      ...item,
      receipts: [...item.receipts],
    }))
    const movements: InventoryMovement[] = []
    const receivedAt = new Date().toISOString()

    input.items.forEach((request, index) => {
      const line = updatedItems.find((item) => item.id === request.itemId)!
      const product = store.products.find((item) => item.id === line.productId)

      if (!product) {
        throw new Error(`Product ${line.productName} was not found.`)
      }

      const existingLot = updatedLots.find(
        (lot) =>
          lot.productId === line.productId &&
          lot.batch === line.batch &&
          lot.expiry === line.expiry &&
          lot.warehouseId === destination.id &&
          (lot.locationId ?? null) === (location?.id ?? null) &&
          lot.purchasePrice === line.purchasePrice &&
          lot.sellingPrice === line.sellingPrice,
      )

      let destinationLot: InventoryLot

      if (existingLot) {
        existingLot.quantity += request.quantity
        destinationLot = existingLot
      } else {
        destinationLot = {
          id: `LOT-TRF-${Date.now()}-${index}`,
          productId: line.productId,
          batch: line.batch,
          expiry: line.expiry,
          quantity: request.quantity,
          purchasePrice: line.purchasePrice,
          sellingPrice: line.sellingPrice,
          warehouseId: destination.id,
          locationId: location?.id ?? null,
        }
        updatedLots.push(destinationLot)
      }

      const receiptId = `TRFREC-${Date.now()}-${index}-${line.receipts.length}`

      line.receipts.push({
        id: receiptId,
        quantity: request.quantity,
        destinationLotId: destinationLot.id,
        locationId: location?.id ?? null,
        receivedAt,
      })

      movements.push({
        id: `MOV-${transfer.id}-IN-${receiptId}`,
        type: "TRANSFER_IN",
        productId: line.productId,
        lotId: destinationLot.id,
        quantity: request.quantity,
        reason: `Transfer receipt ${transfer.transferNumber}`,
        createdAt: receivedAt,
        metadata: {
          referenceType: "STOCK_TRANSFER",
          referenceId: transfer.id,
          referenceNumber: transfer.transferNumber,
          receiptId,
          sourceWarehouseId: transfer.sourceWarehouseId,
          sourceWarehouseName: transfer.sourceWarehouseName,
          destinationWarehouseId: destination.id,
          destinationWarehouseName: destination.name,
          sourceLotId: line.sourceLotId,
          locationId: location?.id ?? null,
          locationName: location?.name ?? "",
          batch: line.batch,
          expiry: line.expiry,
          baseUnit: product.unit,
          unitCost: line.purchasePrice,
          totalCost: request.quantity * line.purchasePrice,
        },
      })
    })

    const outstanding = updatedItems.reduce(
      (sum, item) =>
        sum + item.quantity -
        item.receipts.reduce((received, receipt) => received + receipt.quantity, 0),
      0,
    )

    const receivedTotal = updatedItems.reduce(
      (sum, item) =>
        sum + item.receipts.reduce((received, receipt) => received + receipt.quantity, 0),
      0,
    )

    const updatedTransfer: StockTransfer = {
      ...transfer,
      items: updatedItems,
      status:
        outstanding === 0
          ? "RECEIVED"
          : receivedTotal > 0
            ? "PARTIALLY_RECEIVED"
            : "DISPATCHED",
      receivedAt: outstanding === 0 ? receivedAt : undefined,
    }

    persistStore({
      ...store,
      inventoryLots: updatedLots,
      inventoryMovements: [...movements, ...store.inventoryMovements],
      stockTransfers: store.stockTransfers.map((item) =>
        item.id === id ? updatedTransfer : item,
      ),
    })
  }

  function cancelStockTransfer(id: string) {
    const transfer = store.stockTransfers.find((item) => item.id === id)

    if (!transfer) throw new Error("Stock transfer was not found.")
    if (transfer.status !== "DRAFT") {
      throw new Error("Only draft transfers can be cancelled.")
    }

    persistStore({
      ...store,
      stockTransfers: store.stockTransfers.map((item) =>
        item.id === id
          ? { ...item, status: "CANCELLED", cancelledAt: new Date().toISOString() }
          : item,
      ),
    })
  }

  function createWarehouse(
    input: Omit<Warehouse, "id" | "createdAt">,
  ): Warehouse {
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!code || !name) {
      throw new Error("Warehouse name and code are required.")
    }

    if (store.warehouses.some(
      (item) => item.code.toLowerCase() === code.toLowerCase(),
    )) {
      throw new Error("A warehouse with this code already exists.")
    }

    if (
      input.type === "MAIN" &&
      input.active &&
      store.warehouses.some((item) => item.active && item.type === "MAIN")
    ) {
      throw new Error("Only one active Main Warehouse is allowed.")
    }

    const warehouse: Warehouse = {
      ...input,
      id: `WH-${Date.now()}`,
      code,
      name,
      createdAt: new Date().toISOString(),
    }

    persistStore({
      ...store,
      warehouses: [...store.warehouses, warehouse],
    })

    return warehouse
  }

  function updateWarehouse(
    id: string,
    updates: Partial<Omit<Warehouse, "id" | "createdAt">>,
  ) {
    const current = store.warehouses.find((item) => item.id === id)
    if (!current) throw new Error("Warehouse not found.")

    const code = (updates.code ?? current.code).trim().toUpperCase()
    const name = (updates.name ?? current.name).trim()
    const active = updates.active ?? current.active
    const type = updates.type ?? current.type

    if (!code || !name) {
      throw new Error("Warehouse name and code are required.")
    }

    if (store.warehouses.some(
      (item) =>
        item.id !== id &&
        item.code.toLowerCase() === code.toLowerCase(),
    )) {
      throw new Error("A warehouse with this code already exists.")
    }

    if (
      type === "MAIN" &&
      active &&
      store.warehouses.some(
        (item) => item.id !== id && item.active && item.type === "MAIN",
      )
    ) {
      throw new Error("Only one active Main Warehouse is allowed.")
    }

    const hasStock = store.inventoryLots.some(
      (lot) => lot.warehouseId === id && lot.quantity > 0,
    )

    if (!active && hasStock) {
      throw new Error("Transfer all stock before deactivating this warehouse.")
    }

    if (
      current.type === "MAIN" &&
      current.active &&
      !active &&
      !store.warehouses.some(
        (item) => item.id !== id && item.active && item.type === "MAIN",
      )
    ) {
      throw new Error("The active Main Warehouse cannot be deactivated.")
    }

    persistStore({
      ...store,
      warehouses: store.warehouses.map((item) =>
        item.id === id ? { ...item, ...updates, code, name } : item,
      ),
    })
  }

  function createStorageLocation(
    input: Omit<StorageLocation, "id" | "createdAt">,
  ): StorageLocation {
    const warehouse = store.warehouses.find(
      (item) => item.id === input.warehouseId && item.active,
    )

    if (!warehouse) throw new Error("Select an active warehouse.")

    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!code || !name) {
      throw new Error("Location name and code are required.")
    }

    if (store.storageLocations.some(
      (item) =>
        item.warehouseId === input.warehouseId &&
        item.code.toLowerCase() === code.toLowerCase(),
    )) {
      throw new Error("This location code already exists in the warehouse.")
    }

    const location: StorageLocation = {
      ...input,
      id: `LOC-${Date.now()}`,
      code,
      name,
      createdAt: new Date().toISOString(),
    }

    persistStore({
      ...store,
      storageLocations: [...store.storageLocations, location],
    })

    return location
  }

  function updateStorageLocation(
    id: string,
    updates: Partial<Omit<StorageLocation, "id" | "createdAt">>,
  ) {
    const current = store.storageLocations.find((item) => item.id === id)
    if (!current) throw new Error("Storage location not found.")

    const warehouseId = updates.warehouseId ?? current.warehouseId
    const warehouse = store.warehouses.find(
      (item) => item.id === warehouseId && item.active,
    )

    if (!warehouse) throw new Error("Select an active warehouse.")

    const code = (updates.code ?? current.code).trim().toUpperCase()
    const name = (updates.name ?? current.name).trim()

    if (!code || !name) {
      throw new Error("Location name and code are required.")
    }

    if (store.storageLocations.some(
      (item) =>
        item.id !== id &&
        item.warehouseId === warehouseId &&
        item.code.toLowerCase() === code.toLowerCase(),
    )) {
      throw new Error("This location code already exists in the warehouse.")
    }

    if (
      updates.active === false &&
      store.inventoryLots.some(
        (lot) => lot.locationId === id && lot.quantity > 0,
      )
    ) {
      throw new Error("This location still contains stock and cannot be deactivated.")
    }

    persistStore({
      ...store,
      storageLocations: store.storageLocations.map((item) =>
        item.id === id
          ? { ...item, ...updates, warehouseId, code, name }
          : item,
      ),
    })
  }

  function deleteStorageLocation(id: string) {
    if (store.inventoryLots.some(
      (lot) => lot.locationId === id && lot.quantity > 0,
    )) {
      throw new Error("This location still contains stock and cannot be deleted.")
    }

    persistStore({
      ...store,
      storageLocations: store.storageLocations.filter((item) => item.id !== id),
    })
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

  function addProductAndReceive(
    product: Omit<Product, "id">,
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

    const normalizedBarcode =
      product.barcode.trim()

    if (!normalizedBarcode) {
      throw new Error("Barcode is required.")
    }

    // Prevent duplicate barcode
    const barcodeExists = store.products.some(
      (p) => p.barcode === normalizedBarcode,
    )

    if (barcodeExists) {
      throw new Error(
        `A product with barcode ${normalizedBarcode} already exists.`,
      )
    }

    // Ensure SKU uniqueness; if duplicate, append numeric suffix
    let sku = product.sku.trim()

    if (!sku) {
      sku = "ZK-000001"
    }

    const existingSkus = new Set(
      store.products.map((p) => p.sku),
    )

    if (existingSkus.has(sku)) {
      let counter = 1
      let candidate = sku

      while (existingSkus.has(candidate)) {
        counter++
        candidate = `${sku}-${counter}`
      }

      sku = candidate
    }

    const newProduct: Product = {
      id: `PROD-${Date.now()}`,
      ...product,
      sku,
      barcode: normalizedBarcode,
    }

    const normalizedBatch = batch.trim().toUpperCase()

    if (!normalizedBatch) {
      throw new Error("Batch number is required.")
    }

    if (!expiry) {
      throw new Error("Expiry date is required.")
    }

    const newLot: InventoryLot = {
      id: `LOT-${Date.now()}`,
      productId: newProduct.id,
      batch: normalizedBatch,
      expiry,
      quantity,
      purchasePrice,
    }

    const nextStore: StoredData = {
      ...store,
      products: [...store.products, newProduct],
      inventoryLots: [...store.inventoryLots, newLot],
      inventoryMovements: [
        ...store.inventoryMovements,
        {
          id: `MOV-${Date.now()}`,
          type: "OPENING",
          productId: newProduct.id,
          lotId: newLot.id,
          quantity: newLot.quantity,
          createdAt: new Date().toISOString(),
        },
      ],
    }

    persistStore(nextStore)

    return { product: newProduct, lot: newLot }
  }

  function recordMovement(move: Omit<InventoryMovement, "id" | "createdAt">) {
    const movement: InventoryMovement = {
      id: `MOV-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...move,
    }

    persistStore({
      ...store,
      inventoryMovements: [movement, ...store.inventoryMovements],
    })

    return movement
  }

  function resolveActiveWarehouse(requestedId?: string): Warehouse {
    const fallback =
      store.warehouses.find((item) => item.active && item.type === "MAIN") ??
      store.warehouses.find((item) => item.active)

    const selectedId = requestedId ?? fallback?.id
    const warehouse = store.warehouses.find(
      (item) => item.id === selectedId && item.active,
    )

    if (!warehouse) {
      throw new Error("Select an active warehouse.")
    }

    return warehouse
  }

  function resolveActiveLocation(
    locationId: string | null | undefined,
    warehouseId: string,
  ): StorageLocation | null {
    if (!locationId) return null

    const location = store.storageLocations.find(
      (item) =>
        item.id === locationId &&
        item.warehouseId === warehouseId &&
        item.active,
    )

    if (!location) {
      throw new Error("Select an active storage location in the selected warehouse.")
    }

    return location
  }

  function adjustStock(
    productId: string,
    lotId: string | null,
    quantityDelta: number,
    reason: string,
    warehouseId?: string,
    locationId?: string | null,
    movementType: "ADJUSTMENT" | "DAMAGE" | "LOSS" = "ADJUSTMENT",
  ) {
    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
      throw new Error("Quantity delta must be a non-zero whole number.")
    }

    validateStockWriteOff(movementType, quantityDelta, lotId, reason)

    const originalLot = lotId
      ? store.inventoryLots.find((lot) => lot.id === lotId)
      : undefined

    if (lotId && !originalLot) {
      throw new Error("Lot not found.")
    }

    const warehouse = resolveActiveWarehouse(
      warehouseId ?? originalLot?.warehouseId,
    )

    if (
      originalLot?.warehouseId &&
      originalLot.warehouseId !== warehouse.id
    ) {
      throw new Error("The selected lot belongs to a different warehouse.")
    }

    const targetLocationId = originalLot
      ? originalLot.locationId ?? null
      : locationId ?? null

    if (
      originalLot &&
      locationId !== undefined &&
      targetLocationId !== locationId
    ) {
      throw new Error("The selected lot belongs to a different storage location.")
    }

    const location = resolveActiveLocation(
      targetLocationId,
      warehouse.id,
    )

    const updatedLots = store.inventoryLots.map((lot) => ({ ...lot }))

    if (lotId) {
      const lot = updatedLots.find((item) => item.id === lotId)!
      if (lot.quantity + quantityDelta < 0) {
        throw new Error("Adjustment would make stock negative.")
      }
      lot.quantity += quantityDelta
    } else if (quantityDelta > 0) {
      updatedLots.push({
        id: `LOT-${Date.now()}`,
        productId,
        batch: "OPENING",
        expiry: "",
        quantity: quantityDelta,
        purchasePrice: 0,
        warehouseId: warehouse.id,
        locationId: location?.id ?? null,
      })
    } else {
      throw new Error("Must specify a lot to decrease stock.")
    }

    persistStore({
      ...store,
      inventoryLots: updatedLots,
      inventoryMovements: [
        {
          id: `MOV-${Date.now()}`,
          type: movementType,
          productId,
          lotId,
          quantity: quantityDelta,
          reason,
          createdAt: new Date().toISOString(),
          metadata: {
            warehouseId: warehouse.id,
            warehouseName: warehouse.name,
            locationId: location?.id ?? null,
            locationName: location?.name ?? "",
          },
        },
        ...store.inventoryMovements,
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
                manufacturer: product.manufacturer ?? item.manufacturer,
              }
            : item,
      ),
    })
  }

  function deleteProduct(id: string) {
    const product = store.products.find((item) => item.id === id)
    if (!product) return

    if (isBuiltInDemoProduct(product)) {
      const cleanup = removeBuiltInDemoData(
        store as unknown as Record<string, unknown>,
        { onlyProductId: id },
      )
      if (cleanup.removedProducts === 0) {
        throw new Error(
          "This starter product is linked to business activity or has non-demo inventory. Review its sales, purchases, transfers and stock records before deleting it.",
        )
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const backupRoot = `${ERP_STORAGE_KEY}-pre-demo-delete-${timestamp}`
      let backupKey = backupRoot
      let suffix = 1
      while (localStorage.getItem(backupKey) !== null) {
        backupKey = `${backupRoot}-${suffix++}`
      }
      const rawStore = localStorage.getItem(ERP_STORAGE_KEY) ?? JSON.stringify(store)
      try {
        localStorage.setItem(backupKey, rawStore)
      } catch (error) {
        throw new Error(
          `The demo product was not deleted because a recoverable backup could not be saved. ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      persistStore(cleanup.data as unknown as StoredData)
      return
    }

    const stock = getProductStock(id)
    if (stock > 0) {
      throw new Error(
        `${product.name} still has ${stock} units in inventory. Adjust or write off the stock before deleting this product.`,
      )
    }

    persistStore({
      ...store,
      products: store.products.filter((item) => item.id !== id),
    })
  }

  function receiveStock(
    productId: string,
    batch: string,
    expiry: string,
    quantity: number,
    purchasePrice: number,
    warehouseId?: string,
    locationId?: string | null,
  ) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantity must be a whole number greater than zero.")
    }

    const product = store.products.find((item) => item.id === productId)
    if (!product) throw new Error("Product was not found.")

    const normalizedBatch = batch.trim().toUpperCase()
    if (!normalizedBatch) throw new Error("Batch number is required.")
    if (!expiry) throw new Error("Expiry date is required.")

    const warehouse = resolveActiveWarehouse(warehouseId)
    const location = resolveActiveLocation(locationId, warehouse.id)

    const lots = store.inventoryLots.map((lot) => ({ ...lot }))

    const existing = lots.find(
      (lot) =>
        lot.productId === productId &&
        lot.batch.trim().toUpperCase() === normalizedBatch &&
        lot.expiry === expiry &&
        lot.warehouseId === warehouse.id &&
        (lot.locationId ?? null) === (location?.id ?? null),
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
        warehouseId: warehouse.id,
        locationId: location?.id ?? null,
      }
      lots.push(savedLot)
    }

    const receiptMovement: InventoryMovement = {
      id: `MOV-MANUAL-RECEIPT-${savedLot.id}-${Date.now()}`,
      type: "RECEIPT",
      productId,
      lotId: savedLot.id,
      quantity,
      reason: "Manual stock receipt",
      createdAt: new Date().toISOString(),
      metadata: {
        referenceType: "MANUAL_RECEIPT",
        batch: normalizedBatch,
        expiry,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        locationId: location?.id ?? null,
        locationName: location?.name ?? "",
        baseUnit: product.unit,
        unitCost: purchasePrice,
        totalCost: quantity * purchasePrice,
      },
    }

    persistStore({
      ...store,
      inventoryLots: lots,
      inventoryMovements: [
        receiptMovement,
        ...store.inventoryMovements,
      ],
    })

    return savedLot
  }

  function createSupplier(input: SupplierInput): Supplier {
    const normalized = validateSupplierInput(input, store.suppliers ?? [])
    const baseId = `SUP-${Date.now()}`
    const id = store.suppliers.some((item) => item.id === baseId)
      ? `${baseId}-${store.suppliers.length + 1}`
      : baseId
    const supplier: Supplier = { id, ...normalized }

    persistStore({
      ...store,
      suppliers: [...(store.suppliers ?? []), supplier],
    })
    return supplier
  }

  function updateSupplier(id: string, input: SupplierInput) {
    const existing = store.suppliers.find((item) => item.id === id)
    if (!existing) throw new Error("Supplier not found.")

    const normalized = validateSupplierInput(input, store.suppliers, id)
    persistStore({
      ...store,
      suppliers: store.suppliers.map((item) =>
        item.id === id ? { id, ...normalized } : item,
      ),
    })
  }

  function deleteSupplier(id: string) {
    const supplier = store.suppliers.find((item) => item.id === id)
    if (!supplier) throw new Error("Supplier not found.")

    const normalizedName = supplier.name.trim().toLowerCase()
    const hasPurchaseHistory = store.purchases.some(
      (purchase) =>
        purchase.supplierId === id ||
        (!purchase.supplierId &&
          purchase.supplierName.trim().toLowerCase() === normalizedName),
    )
    if (hasPurchaseHistory) {
      throw new Error("This supplier has purchase history and cannot be deleted. Mark it Inactive instead.")
    }

    persistStore({
      ...store,
      suppliers: store.suppliers.filter((item) => item.id !== id),
    })
  }

  function createSupplierInvoice(input: CreateSupplierInvoiceInput) {
    const invoice = buildSupplierInvoice(
      input,
      store.suppliers ?? [],
      store.purchases ?? [],
      store.supplierInvoices ?? [],
    )
    persistStore({
      ...store,
      supplierInvoices: [invoice, ...(store.supplierInvoices ?? [])],
    })
    return invoice
  }

  function getDailyRegisterSummary(businessDate: string, openingCash = 0): DailyRegisterSummary {
    return calculateDailyRegisterSummary({
      businessDate,
      openingCash: validateDailyRegisterMoney(openingCash, "Opening cash"),
      sales: store.sales,
      customerPayments: store.customerPayments ?? [],
      returns: store.salesReturns ?? [],
      supplierInvoices: store.supplierInvoices ?? [],
      cashMovements: store.dailyCashMovements ?? [],
    })
  }

  function addDailyCashMovement(input: {
    businessDate?: string
    kind: DailyCashMovementKind
    category: string
    amount: number
    note?: string
  }) {
    if (input.kind !== "IN" && input.kind !== "OUT") {
      throw new Error("Choose cash received or cash paid out.")
    }
    const category = input.category.trim()
    if (!category) throw new Error("Enter a cash movement category.")
    const amount = validateDailyRegisterMoney(input.amount, "Cash movement amount")
    if (amount <= 0) throw new Error("Cash movement amount must be greater than zero.")
    const note = (input.note ?? "").trim()
    if (!note) throw new Error("Add a short note for this cash movement.")
    const now = new Date()
    const businessDate = input.businessDate ?? getBusinessDate(now)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new Error("Choose a valid business date for this cash movement.")
    }
    const movement: DailyRegisterCashMovement = {
      id: `CASH-MOVE-${now.getTime()}`,
      businessDate,
      kind: input.kind,
      category,
      amount,
      note,
      createdAt: now.toISOString(),
    }
    persistStore({
      ...store,
      dailyCashMovements: [movement, ...(store.dailyCashMovements ?? [])],
    })
    return movement
  }

  function saveDailyCashReconciliation(input: {
    businessDate: string
    openingCash: number
    countedCash: number
    reconciledBy?: string
    notes?: string
  }): DailyRegisterSession {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) {
      throw new Error("Choose a valid business date to reconcile.")
    }
    const openingCash = validateDailyRegisterMoney(input.openingCash, "Opening cash")
    const countedCash = validateDailyRegisterMoney(input.countedCash, "Counted closing cash")
    const summary = getDailyRegisterSummary(input.businessDate, openingCash)
    const now = new Date()
    const previous = (store.dailyRegisters ?? []).find((item) => item.businessDate === input.businessDate)
    const reconciledBy = (input.reconciledBy ?? "").trim()
    const reconciliation: DailyRegisterSession = {
      id: previous?.id ?? `RECONCILIATION-${input.businessDate}`,
      businessDate: input.businessDate,
      openedAt: previous?.openedAt ?? now.toISOString(),
      openedBy: previous?.openedBy ?? reconciledBy,
      openingCash,
      status: "CLOSED",
      closedAt: now.toISOString(),
      closedBy: reconciledBy,
      countedCash,
      expectedCash: summary.expectedCash,
      cashDifference: Math.round((countedCash - summary.expectedCash + Number.EPSILON) * 100) / 100,
      notes: (input.notes ?? "").trim(),
      summary,
    }
    persistStore({
      ...store,
      dailyRegisters: [
        reconciliation,
        ...(store.dailyRegisters ?? []).filter((item) => item.businessDate !== input.businessDate),
      ],
    })
    return reconciliation
  }

  function recordSupplierInvoicePayment(id: string, input: RecordSupplierInvoicePaymentInput) {
    const current = (store.supplierInvoices ?? []).find((item) => item.id === id)
    if (!current) throw new Error("Supplier invoice not found.")
    const updated = applySupplierInvoicePayment(current, input)
    persistStore({
      ...store,
      supplierInvoices: (store.supplierInvoices ?? []).map((item) => item.id === id ? updated : item),
    })
    return updated
  }

  function createSalesReturn(input: CreateSalesReturnInput): SalesReturn {
    const sale = store.sales.find((item) => item.id === input.saleId)
    const salesReturn = buildSalesReturn(input, sale, store.products, store.salesReturns ?? [])
    const updatedLots = store.inventoryLots.map((lot) => ({ ...lot }))
    const movements: InventoryMovement[] = []

    salesReturn.items.forEach((returnItem, itemIndex) => {
      const saleItem = sale!.items.find((item) => item.id === returnItem.saleItemId)!
      returnItem.allocations.forEach((allocation, allocationIndex) => {
        const lot = updatedLots.find((candidate) => candidate.id === allocation.lotId)
        if (!lot || lot.productId !== returnItem.productId || lot.batch !== allocation.batch || lot.expiry !== allocation.expiry) {
          throw new Error(`Original batch ${allocation.batch} for ${returnItem.productName} is no longer available. The return was not posted.`)
        }
        lot.quantity += allocation.quantity
        const costAllocation = saleItem.costSnapshot?.lotAllocations?.find((candidate) => candidate.lotId === allocation.lotId)
        const unitCost = costAllocation?.unitCost ?? lot.purchasePrice
        movements.push({
          id: `MOV-${salesReturn.id}-${itemIndex}-${allocationIndex}`,
          type: "RETURN",
          productId: returnItem.productId,
          lotId: lot.id,
          quantity: allocation.quantity,
          reason: `Sales return ${salesReturn.returnNumber}`,
          createdAt: salesReturn.createdAt,
          metadata: {
            referenceType: "SALES_RETURN",
            referenceId: salesReturn.id,
            referenceNumber: salesReturn.returnNumber,
            originalSaleId: sale!.id,
            originalInvoiceNumber: sale!.invoiceNumber,
            refundMethod: salesReturn.refundMethod,
            warehouseId: lot.warehouseId,
            locationId: lot.locationId ?? null,
            batch: lot.batch,
            expiry: lot.expiry,
            unitCost,
            totalCost: unitCost * allocation.quantity,
          },
        })
      })
    })

    const nextReturns = [salesReturn, ...(store.salesReturns ?? [])]
    const nextSales = store.sales.map((item) => item.id === sale!.id && isSaleFullyReturned(item, nextReturns)
      ? { ...item, status: "Refunded" as const }
      : item)

    persistStore({
      ...store,
      sales: nextSales,
      salesReturns: nextReturns,
      inventoryLots: updatedLots,
      inventoryMovements: [...movements, ...store.inventoryMovements],
    })
    return salesReturn
  }

  function createPurchaseReturn(input: CreatePurchaseReturnInput): PurchaseReturn {
    const purchase = store.purchases.find((item) => item.id === input.purchaseId)
    const purchaseReturn = buildPurchaseReturn(
      input,
      purchase,
      store.purchaseReturns ?? [],
      store.inventoryLots,
    )
    const updatedLots = store.inventoryLots.map((lot) => ({ ...lot }))
    const movements: InventoryMovement[] = []

    purchaseReturn.items.forEach((returnItem, itemIndex) => {
      returnItem.allocations.forEach((allocation, allocationIndex) => {
        const lot = updatedLots.find((candidate) => candidate.id === allocation.lotId)
        if (!lot || lot.productId !== returnItem.productId || lot.batch.trim().toUpperCase() !== allocation.batch.trim().toUpperCase() || lot.expiry !== allocation.expiry) {
          throw new Error(`Original batch ${allocation.batch} for ${returnItem.productName} is no longer available. The purchase return was not posted.`)
        }
        if (lot.quantity + 1e-8 < allocation.quantity) {
          throw new Error(`Insufficient stock in original batch ${allocation.batch} for ${returnItem.productName}. Available: ${lot.quantity}; requested: ${allocation.quantity}.`)
        }
        lot.quantity = Math.max(0, lot.quantity - allocation.quantity)
        if (lot.totalPurchaseValue !== undefined) {
          lot.totalPurchaseValue = Math.max(0, lot.totalPurchaseValue - allocation.quantity * lot.purchasePrice)
        }
        movements.push({
          id: `MOV-${purchaseReturn.id}-${itemIndex}-${allocationIndex}`,
          type: "PURCHASE_RETURN",
          productId: returnItem.productId,
          lotId: lot.id,
          quantity: -allocation.quantity,
          reason: `Purchase return ${purchaseReturn.returnNumber}`,
          createdAt: purchaseReturn.createdAt,
          metadata: {
            referenceType: "PURCHASE_RETURN",
            referenceId: purchaseReturn.id,
            referenceNumber: purchaseReturn.returnNumber,
            purchaseId: purchase!.id,
            purchaseNumber: purchase!.purchaseNumber,
            supplierId: purchaseReturn.supplierId ?? null,
            supplierName: purchaseReturn.supplierName,
            supplierInvoice: purchaseReturn.supplierInvoice,
            creditNoteReference: purchaseReturn.creditNoteReference,
            batch: lot.batch,
            expiry: lot.expiry,
            warehouseId: lot.warehouseId,
            locationId: lot.locationId ?? null,
            baseUnit: returnItem.baseUnit,
            unitCost: allocation.unitCost,
            totalCost: allocation.quantity * allocation.unitCost,
          },
        })
      })
    })

    persistStore({
      ...store,
      purchaseReturns: [purchaseReturn, ...(store.purchaseReturns ?? [])],
      inventoryLots: updatedLots,
      inventoryMovements: [...movements, ...store.inventoryMovements],
    })
    return purchaseReturn
  }

  function createPaymentReconciliation(input: CreatePaymentReconciliationInput): PaymentReconciliation {
    const reconciliation = buildPaymentReconciliation(
      input,
      store.sales,
      store.customerPayments ?? [],
      store.paymentReconciliations ?? [],
      new Date(),
      store.salesReturns ?? [],
    )
    persistStore({
      ...store,
      paymentReconciliations: [reconciliation, ...(store.paymentReconciliations ?? [])],
    })
    return reconciliation
  }

  function recordCustomerPayment(input: RecordCustomerPaymentInput) {
    const payment = buildCustomerPayment(
      input,
      store.sales,
      store.customers,
      store.customerPayments ?? [],
    )
    const nextPayments = [payment, ...(store.customerPayments ?? [])]
    const allocatedSaleIds = new Set(payment.allocations.map((item) => item.saleId))
    const nextSales = store.sales.map((sale) => {
      if (!allocatedSaleIds.has(sale.id)) return sale
      const settlement = getSalePaymentSummary(sale, nextPayments)
      // Sale.status remains the legacy Paid/Pending/Refunded field. Partial
      // settlements stay Pending; the payment register displays Partially Paid.
      return settlement.status === "Paid" ? { ...sale, status: "Paid" as const } : sale
    })
    persistStore({
      ...store,
      customerPayments: nextPayments,
      sales: nextSales,
    })
    return payment
  }

  function createChartOfAccount(input: ChartOfAccountInput): ChartOfAccount {
    const currentAccounts = store.chartOfAccounts ?? DEFAULT_CHART_OF_ACCOUNTS
    const account = buildChartOfAccount(input, currentAccounts)
    persistStore({ ...store, chartOfAccounts: [...currentAccounts, account] })
    return account
  }

  function updateChartOfAccount(id: string, input: ChartOfAccountInput) {
    const currentAccounts = store.chartOfAccounts ?? DEFAULT_CHART_OF_ACCOUNTS
    const current = currentAccounts.find((item) => item.id === id)
    if (!current) throw new Error("Chart account not found.")
    if (current.isSystem) throw new Error("System accounts are protected from editing.")
    const normalized = validateChartOfAccountInput(input, currentAccounts, id)
    const updated: ChartOfAccount = { ...current, ...normalized, parentId: normalized.parentId ?? null, description: normalized.description ?? "" }
    persistStore({ ...store, chartOfAccounts: currentAccounts.map((item) => item.id === id ? updated : item) })
  }

  function setChartOfAccountStatus(id: string, status: ChartAccountStatus) {
    const currentAccounts = store.chartOfAccounts ?? DEFAULT_CHART_OF_ACCOUNTS
    const current = currentAccounts.find((item) => item.id === id)
    if (!current) throw new Error("Chart account not found.")
    validateChartAccountStatus(current, status, currentAccounts)
    persistStore({ ...store, chartOfAccounts: currentAccounts.map((item) => item.id === id ? { ...item, status } : item) })
  }

  function createJournalEntry(input: JournalEntryInput): JournalEntry {
    const currentEntries = store.journalEntries ?? []
    const currentAccounts = store.chartOfAccounts ?? DEFAULT_CHART_OF_ACCOUNTS
    const entry = buildJournalEntry(input, currentAccounts, currentEntries)

    persistStore({
      ...store,
      journalEntries: [...currentEntries, entry],
    })

    return entry
  }

  function postJournalEntryInStore(id: string): JournalEntry {
    const currentEntries = store.journalEntries ?? []
    const current = currentEntries.find((entry) => entry.id === id)

    if (!current) throw new Error("Journal entry not found.")

    const posted = postJournalEntryRecord(
      current,
      store.chartOfAccounts ?? DEFAULT_CHART_OF_ACCOUNTS,
    )

    persistStore({
      ...store,
      journalEntries: currentEntries.map((entry) =>
        entry.id === id ? posted : entry
      ),
    })

    return posted
  }


  function createPurchaseRequisition(input: CreatePurchaseRequisitionInput) {
    const requisition = buildPurchaseRequisition(
      input,
      store.suppliers,
      store.products,
      store.warehouses,
      store.purchaseRequisitions ?? [],
    )
    persistStore({
      ...store,
      purchaseRequisitions: [requisition, ...(store.purchaseRequisitions ?? [])],
    })
    return requisition
  }

  function submitPurchaseRequisition(id: string) {
    const current = store.purchaseRequisitions.find((item) => item.id === id)
    if (!current) throw new Error("Purchase requisition not found.")
    const updated = submitPurchaseRequisitionRecord(current)
    persistStore({
      ...store,
      purchaseRequisitions: store.purchaseRequisitions.map((item) =>
        item.id === id ? updated : item,
      ),
    })
  }

  function reviewPurchaseRequisition(
    id: string,
    decision: "APPROVE" | "REJECT",
    reviewer: string,
    note = "",
  ) {
    const current = store.purchaseRequisitions.find((item) => item.id === id)
    if (!current) throw new Error("Purchase requisition not found.")
    const updated = reviewPurchaseRequisitionRecord(current, decision, reviewer, note)
    persistStore({
      ...store,
      purchaseRequisitions: store.purchaseRequisitions.map((item) =>
        item.id === id ? updated : item,
      ),
    })
  }

  function createPurchaseOrderFromRequisition(requisitionId: string) {
    const requisition = store.purchaseRequisitions.find((item) => item.id === requisitionId)
    if (!requisition) throw new Error("Purchase requisition not found.")
    if (requisition.convertedPurchaseOrderId) {
      throw new Error("This requisition has already been converted to a purchase order.")
    }
    const order = buildPurchaseOrderFromRequisition(
      requisition,
      store.warehouses,
      store.purchaseOrders ?? [],
    )
    const converted: PurchaseRequisition = {
      ...requisition,
      status: "CONVERTED",
      convertedPurchaseOrderId: order.id,
    }
    persistStore({
      ...store,
      purchaseRequisitions: store.purchaseRequisitions.map((item) =>
        item.id === requisitionId ? converted : item,
      ),
      purchaseOrders: [order, ...(store.purchaseOrders ?? [])],
    })
    return order
  }

  function submitPurchaseOrder(id: string) {
    const current = store.purchaseOrders.find((item) => item.id === id)
    if (!current) throw new Error("Purchase order not found.")
    const updated = submitPurchaseOrderRecord(current)
    persistStore({
      ...store,
      purchaseOrders: store.purchaseOrders.map((item) =>
        item.id === id ? updated : item,
      ),
    })
  }

  function reviewPurchaseOrder(
    id: string,
    decision: "APPROVE" | "REJECT",
    reviewer: string,
    note = "",
  ) {
    const current = store.purchaseOrders.find((item) => item.id === id)
    if (!current) throw new Error("Purchase order not found.")
    const updated = reviewPurchaseOrderRecord(current, decision, reviewer, note)
    persistStore({
      ...store,
      purchaseOrders: store.purchaseOrders.map((item) =>
        item.id === id ? updated : item,
      ),
    })
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
    warehouseId?: string,
  ) {
    return store.inventoryLots
      .filter(
        (lot) =>
          lot.productId === productId &&
          (!warehouseId || lot.warehouseId === warehouseId),
      )
      .reduce((sum, lot) => sum + lot.quantity, 0)
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
    const selectedSupplier = input.supplierId
      ? store.suppliers.find((item) => item.id === input.supplierId)
      : undefined
    if (input.supplierId && (!selectedSupplier || selectedSupplier.status !== "Active")) {
      throw new Error("Select an active supplier.")
    }
    const resolvedSupplierName = selectedSupplier?.name ?? input.supplierName.trim()
    const receivingOrder = input.purchaseOrderId
      ? (store.purchaseOrders ?? []).find((item) => item.id === input.purchaseOrderId)
      : undefined
    if (input.purchaseOrderId && !receivingOrder) {
      throw new Error("Purchase order not found.")
    }
    if (receivingOrder && (!selectedSupplier || selectedSupplier.id !== receivingOrder.supplierId)) {
      throw new Error("The goods receipt supplier must match the purchase order supplier.")
    }
    if (receivingOrder && receivingOrder.status !== "APPROVED" && receivingOrder.status !== "PARTIALLY_RECEIVED") {
      throw new Error("Goods can only be received against an approved purchase order.")
    }
    if (!resolvedSupplierName) {
      throw new Error("Supplier name is required.")
    }

    if (!input.items.length) {
      throw new Error(
        "Add at least one product to the purchase.",
      )
    }

    const receivingWarehouse = resolveActiveWarehouse(input.warehouseId)
    const receivingLocation = resolveActiveLocation(
      input.locationId,
      receivingWarehouse.id,
    )
    if (receivingOrder && receivingOrder.warehouseId !== receivingWarehouse.id) {
      throw new Error("The receiving warehouse must match the purchase order warehouse.")
    }

    const preparedItems =
      input.items.map((item) => {
        if (
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0
        ) {
          throw new Error(
            "Purchase quantity must be a number greater than zero.",
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

        const selectedPackage = item.packageId
          ? product.packagings?.find(
              (packaging) => packaging.id === item.packageId,
            )
          : undefined

        if (item.packageId && !selectedPackage) {
          throw new Error(`Selected package was not found for ${product.name}.`)
        }

        if (selectedPackage && !selectedPackage.purchaseEnabled) {
          throw new Error(`${selectedPackage.name} is not enabled for purchasing.`)
        }

        const conversionFactor = selectedPackage?.conversionFactor ?? 1

        if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
          throw new Error(`Invalid package conversion for ${product.name}.`)
        }

        const baseQuantity = item.quantity * conversionFactor
        const baseUnitPurchasePrice = item.purchasePrice / conversionFactor

        if (
          !Number.isFinite(baseQuantity) ||
          !Number.isFinite(baseUnitPurchasePrice)
        ) {
          throw new Error(`Invalid converted purchase quantity or price for ${product.name}.`)
        }

        return {
          product,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          packageId: selectedPackage?.id,
          packageName: selectedPackage?.name,
          purchaseUnit: selectedPackage?.unit ?? product.unit,
          conversionFactor,
          baseQuantity,
          baseUnitPurchasePrice,
          batch: item.batch.trim().toUpperCase(),
          expiry: item.expiry,
        }
      })

    const updatedPurchaseOrder = receivingOrder
      ? applyPurchaseOrderReceipt(
          receivingOrder,
          preparedItems.map((item) => ({ productId: item.product.id, quantity: item.baseQuantity })),
        )
      : undefined

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
              lot.productId === item.product.id && lot.batch.trim().toUpperCase() === item.batch && lot.expiry === item.expiry && lot.warehouseId === receivingWarehouse.id && (lot.locationId ?? null) === (receivingLocation?.id ?? null),
          )

        let receiptLot: InventoryLot
        if (existingLot) {
          const mergedCost = mergeLotReceiptCost(
            existingLot.quantity,
            existingLot.purchasePrice,
            item.baseQuantity,
            item.baseUnitPurchasePrice,
          )
          existingLot.quantity = mergedCost.quantity
          existingLot.purchasePrice = mergedCost.unitCost
          if (existingLot.totalPurchaseValue !== undefined) {
            existingLot.totalPurchaseValue = mergedCost.totalValue
          }
          receiptLot = existingLot
        } else {
          receiptLot = {
            id: `LOT-${Date.now()}-${index}`,
            productId: item.product.id,
            batch: item.batch,
            expiry: item.expiry,
            quantity: item.baseQuantity,
            purchasePrice: item.baseUnitPurchasePrice,
            warehouseId: receivingWarehouse.id,
            locationId: receivingLocation?.id ?? null,
          }
          updatedLots.push(receiptLot)
        }

        purchaseItems.push({
          id: `PITEM-${Date.now()}-${index}`,
          lotId: receiptLot.id,
          productId:
            item.product.id,
          name:
            item.product.name,
          barcode:
            item.product.barcode,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          packageId: item.packageId,
          packageName: item.packageName,
          purchaseUnit: item.purchaseUnit,
          baseUnit: item.product.unit,
          conversionFactor: item.conversionFactor,
          baseQuantity: item.baseQuantity,
          baseUnitPurchasePrice: item.baseUnitPurchasePrice,
          batch: item.batch,
          expiry: item.expiry,
          total: item.quantity * item.purchasePrice,
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
      supplierName: resolvedSupplierName,
      supplierId: selectedSupplier?.id,
      supplierInvoice: input.supplierInvoice.trim(),
      purchaseOrderId: receivingOrder?.id,
      purchaseOrderNumber: receivingOrder?.purchaseOrderNumber,
      warehouseId: receivingWarehouse.id,
      warehouseName: receivingWarehouse.name,
      locationId: receivingLocation?.id ?? null,
      locationName: receivingLocation?.name ?? "",
      createdAt:
        new Date().toISOString(),
      subtotal,
      total: subtotal,
      status: "Received",
      items: purchaseItems,
    }

    const purchaseMovements: InventoryMovement[] =
      purchaseItems.map((item, index) => {
        const matchedLot = updatedLots.find(
          (lot) =>
            lot.productId === item.productId && lot.batch.trim().toUpperCase() === item.batch.trim().toUpperCase() && lot.expiry === item.expiry && lot.warehouseId === receivingWarehouse.id && (lot.locationId ?? null) === (receivingLocation?.id ?? null),
        )

        return {
          id: `MOV-${purchase.id}-${index}`,
          type: "RECEIPT",
          productId: item.productId,
          lotId: matchedLot?.id ?? null,
          quantity: item.baseQuantity ?? item.quantity,
          reason: receivingOrder
            ? `Goods receipt ${purchase.purchaseNumber} against ${receivingOrder.purchaseOrderNumber}`
            : `Purchase receipt ${purchase.purchaseNumber}`,
          createdAt: purchase.createdAt,
          metadata: {
            warehouseId: receivingWarehouse.id,
            warehouseName: receivingWarehouse.name,
            locationId: receivingLocation?.id ?? null,
            locationName: receivingLocation?.name ?? "",
            referenceType: receivingOrder ? "PURCHASE_ORDER_RECEIPT" : "PURCHASE",
            referenceId: purchase.id,
            purchaseOrderId: receivingOrder?.id,
            purchaseOrderNumber: receivingOrder?.purchaseOrderNumber,
            referenceNumber: purchase.purchaseNumber,
            supplierName: purchase.supplierName,
            batch: item.batch,
            expiry: item.expiry,
            purchaseQuantity: item.quantity,
            purchaseUnit: item.purchaseUnit ?? item.baseUnit ?? "",
            conversionFactor: item.conversionFactor ?? 1,
            baseUnit: item.baseUnit ?? "",
            unitCost: item.baseUnitPurchasePrice ?? item.purchasePrice,
            totalCost: item.total,
            packageName: item.packageName ?? "",
          },
        }
      })

    const nextStore: StoredData = {
      ...store,
      inventoryLots: updatedLots,
      inventoryMovements: [
        ...purchaseMovements,
        ...store.inventoryMovements,
      ],
      purchases: [
        purchase,
        ...store.purchases,
      ],
      purchaseOrders: updatedPurchaseOrder
        ? (store.purchaseOrders ?? []).map((item) => item.id === updatedPurchaseOrder.id ? updatedPurchaseOrder : item)
        : (store.purchaseOrders ?? []),
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

    const sellingWarehouse = resolveActiveWarehouse(input.warehouseId)

    const requestedItems =
      input.items.map((item) => {
        if (
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0
        ) {
          throw new Error(
            "Each product quantity must be a whole number greater than zero.",
          )
        }

        const product = store.products.find(
          (candidate) => candidate.id === item.productId,
        )

        if (!product) {
          throw new Error(
            `Product ${item.productId} was not found.`,
          )
        }

        const selectedPackage = item.packageId
          ? product.packagings?.find(
              (packaging) => packaging.id === item.packageId,
            )
          : undefined

        if (item.packageId && !selectedPackage) {
          throw new Error(
            `The selected package for ${product.name} was not found.`,
          )
        }

        if (selectedPackage && !selectedPackage.salesEnabled) {
          throw new Error(
            `${selectedPackage.name} is not enabled for sales.`,
          )
        }

        const conversionFactor =
          selectedPackage?.conversionFactor ?? 1

        if (
          !Number.isFinite(conversionFactor) ||
          conversionFactor <= 0
        ) {
          throw new Error(
            `Invalid package conversion for ${product.name}.`,
          )
        }

        const sellingUnitPrice = selectedPackage
          ? item.unitPrice ??
            selectedPackage.sellingPrice ??
            product.sellingPrice * conversionFactor
          : item.unitPrice ?? product.sellingPrice

        if (
          !Number.isFinite(sellingUnitPrice) ||
          sellingUnitPrice < 0
        ) {
          throw new Error(
            `Invalid selling price for ${product.name}.`,
          )
        }

        const baseQuantity =
          item.quantity * conversionFactor

        const baseUnitPrice =
          sellingUnitPrice / conversionFactor

        if (
          !Number.isFinite(baseQuantity) ||
          baseQuantity <= 0 ||
          !Number.isFinite(baseUnitPrice)
        ) {
          throw new Error(
            `Invalid base-unit conversion for ${product.name}.`,
          )
        }

        const currentStock = getProductStock(product.id, sellingWarehouse.id)

        if (baseQuantity > currentStock) {
          throw new Error(
            `${product.name} requires ${baseQuantity} ${product.unit}, but only ${currentStock} ${product.unit} are available.`,
          )
        }

        return {
          product,
          quantity: baseQuantity,
          unitPrice: baseUnitPrice,
          unitPriceOverride: Boolean(selectedPackage),
          displayQuantity: item.quantity,
          displayUnitPrice: sellingUnitPrice,
          sellingUnit: selectedPackage?.unit ?? product.unit,
          packageId: selectedPackage?.id,
          packageName: selectedPackage?.name,
          conversionFactor,
          baseQuantity,
        }
      })

    const allocation = allocateSaleLots(
      requestedItems.map((item) => ({
        product: item.product,
          warehouseId: sellingWarehouse.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitPriceOverride: item.unitPriceOverride,
      })),
      store.inventoryLots,
    )

    if (allocation.unallocated.length > 0) {
      const shortfall = allocation.unallocated[0]
      throw new Error(
        `Unable to allocate ${shortfall.quantity} unit(s) of ${shortfall.productName}.`,
      )
    }

    const totals = calculateLotSaleTotals(allocation.lines, discount)
    const cashSettlement = input.paymentMethod === "Cash"
      ? calculateCashSettlement(totals.total, input.cashTendered ?? totals.total)
      : null

    const saleItems: SaleItem[] = requestedItems.map(
      (request, index) => {
        const allocatedLines = allocation.lines.filter(
          (line) => line.product.id === request.product.id,
        )

        const lotAllocations = allocatedLines.map((line) => ({
          lotId: line.lotId,
          warehouseId: line.warehouseId,
          locationId: line.locationId ?? null,
          batch: line.batch,
          expiry: line.expiry,
          quantity: line.quantity,
          unitCost: line.unitCost,
          totalCost: line.totalCost,
        }))

        const cogs = lotAllocations.reduce(
          (sum, lot) => sum + lot.totalCost,
          0,
        )

        const allocatedBaseQuantity = lotAllocations.reduce(
          (sum, lot) => sum + lot.quantity,
          0,
        )

        return {
          id: `ITEM-${Date.now()}-${index}`,
          productId: request.product.id,
          name: request.product.name,
          barcode: request.product.barcode,
          quantity: request.displayQuantity,
          unitPrice: request.displayUnitPrice,
          vatRate: request.product.vatApplicable === false ? 0 : request.product.vatRate,
          total: request.displayQuantity * request.displayUnitPrice,
          sellingUnit: request.sellingUnit,
          packageId: request.packageId,
          packageName: request.packageName,
          conversionFactor: request.conversionFactor,
          baseQuantity: request.baseQuantity,
          batchAllocations: lotAllocations.map((lot) => ({
            lotId: lot.lotId,
            batch: lot.batch,
            expiry: lot.expiry,
            quantity: lot.quantity,
          })),
          costSnapshot: {
            cogs,
            unitCost: allocatedBaseQuantity > 0
              ? cogs / allocatedBaseQuantity
              : 0,
            lotAllocations,
          },
        }
      },
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
      warehouseId: sellingWarehouse.id,
      warehouseName: sellingWarehouse.name,
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
      cashTendered: cashSettlement?.cashTendered,
      changeDue: cashSettlement?.changeDue,
      subtotal: totals.subtotal,
      discount: totals.discount,
      vat: totals.vat,
      total: totals.total,
      status:
        input.paymentMethod ===
        "Credit"
          ? "Pending"
          : "Paid",
      items: saleItems,
    }

    const saleMovements: InventoryMovement[] =
      allocation.lines.map((line, index) => ({
        id: `MOV-${sale.id}-${index}`,
        type: "SALE",
        productId: line.product.id,
        lotId: line.lotId,
        quantity: -line.quantity,
        reason: `POS sale ${sale.invoiceNumber}`,
        createdAt: sale.createdAt,
        metadata: {
          referenceType: "SALE",
          referenceId: sale.id,
          referenceNumber: sale.invoiceNumber,
          warehouseId: sellingWarehouse.id,
          warehouseName: sellingWarehouse.name,
          locationId: line.locationId ?? null,
          batch: line.batch,
          expiry: line.expiry,
          baseUnit: line.product.unit,
          unitCost: line.unitCost,
          totalCost: line.totalCost,
        },
      }))

    const nextStore: StoredData = {
      ...store,
      inventoryLots: allocation.updatedLots,
      inventoryMovements: [
        ...saleMovements,
        ...store.inventoryMovements,
      ],
      sales: [
        sale,
        ...store.sales,
      ],
    }

    persistStore(nextStore)

    return sale
  }

  if (loadResult.error) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-300 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-amber-900">
            Saved ERP data needs recovery
          </h1>
          <p role="alert" className="mt-3 text-sm text-slate-700">
            {loadResult.error} No demo data was written over the saved value.
            Restore a valid full backup or download the original value before
            taking further action.
          </p>
          {loadResult.raw !== null && (
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([loadResult.raw ?? ""], {
                  type: "application/json;charset=utf-8",
                })
                const url = URL.createObjectURL(blob)
                const link = document.createElement("a")
                link.href = url
                link.download = `universal-erp-corrupted-store-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
                link.click()
                window.setTimeout(() => URL.revokeObjectURL(url), 0)
              }}
              className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Download original stored value
            </button>
          )}
          <div className="mt-6 border-t border-slate-200 pt-5">
            <BackupRestorePanel onRestored={() => window.location.reload()} />
          </div>
        </div>
      </main>
    )
  }

  return (
    <ERPContext.Provider
      value={{
        cloudSyncStatus,
        cloudSyncError,
        cloudLastSavedAt,
        syncCloudNow,
        resolveCloudSyncConflict,
        localStorageError,
        localLastSavedAt,
        products: store.products,
        chartOfAccounts: store.chartOfAccounts ?? DEFAULT_CHART_OF_ACCOUNTS,
        createChartOfAccount,
        updateChartOfAccount,
        setChartOfAccountStatus,
        journalEntries: store.journalEntries ?? [],
        createJournalEntry,
        postJournalEntry: postJournalEntryInStore,
        inventoryLots: store.inventoryLots,
        inventoryMovements: store.inventoryMovements,
        customers: store.customers,
        sales: store.sales,
        customerPayments: store.customerPayments ?? [],
        paymentReconciliations: store.paymentReconciliations ?? [],
        salesReturns: store.salesReturns ?? [],
        purchaseReturns: store.purchaseReturns ?? [],
        createPurchaseReturn,
        createPaymentReconciliation,
        createSalesReturn,
        purchases:
          store.purchases,

        suppliers: store.suppliers ?? [],
        createSupplier,
        updateSupplier,
        deleteSupplier,
        supplierInvoices: store.supplierInvoices ?? [],
        createSupplierInvoice,
        recordSupplierInvoicePayment,
        purchaseRequisitions: store.purchaseRequisitions ?? [],
        purchaseOrders: store.purchaseOrders ?? [],
        createPurchaseRequisition,
        submitPurchaseRequisition,
        reviewPurchaseRequisition,
        createPurchaseOrderFromRequisition,
        submitPurchaseOrder,
        reviewPurchaseOrder,
        recordCustomerPayment,
        stockTransfers: store.stockTransfers ?? [],
        createStockTransfer,
        dispatchStockTransfer,
        receiveStockTransfer,
        cancelStockTransfer,
        stockCounts: store.stockCounts ?? [],
        dailyRegisters: store.dailyRegisters ?? [],
        dailyCashMovements: store.dailyCashMovements ?? [],
        addDailyCashMovement,
        saveDailyCashReconciliation,
        getDailyRegisterSummary,
        createStockCount,
        updateStockCountLine,
        submitStockCount,
        postStockCount,
        cancelStockCount,
        warehouses: store.warehouses,
        storageLocations: store.storageLocations,
        createWarehouse,
        updateWarehouse,
        createStorageLocation,
        updateStorageLocation,
        deleteStorageLocation,
        addProduct,
        addProductAndReceive,
        adjustStock,
        recordMovement,
        updateProduct,
        deleteProduct,
        receiveStock,
        importInventory,
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
