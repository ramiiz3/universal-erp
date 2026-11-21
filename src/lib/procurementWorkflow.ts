export type PurchaseRequisitionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CONVERTED"
  | "CANCELLED"

export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "REJECTED"
  | "CANCELLED"

export type PurchaseRequisitionItem = {
  id: string
  productId: string
  productName: string
  sku: string
  quantity: number
  unit: string
  estimatedUnitCost: number
}

export type PurchaseRequisition = {
  id: string
  requisitionNumber: string
  supplierId: string
  supplierName: string
  warehouseId: string
  warehouseName: string
  notes: string
  status: PurchaseRequisitionStatus
  items: PurchaseRequisitionItem[]
  createdAt: string
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
  convertedPurchaseOrderId?: string
}

export type PurchaseOrderItem = {
  id: string
  requisitionItemId: string
  productId: string
  productName: string
  sku: string
  quantity: number
  unit: string
  unitCost: number
  receivedQuantity: number
}

export type PurchaseOrder = {
  id: string
  purchaseOrderNumber: string
  requisitionId: string
  requisitionNumber: string
  supplierId: string
  supplierName: string
  warehouseId: string
  warehouseName: string
  notes: string
  status: PurchaseOrderStatus
  items: PurchaseOrderItem[]
  subtotal: number
  createdAt: string
  submittedAt?: string
  approvedAt?: string
  approvedBy?: string
  reviewNote?: string
}

export function applyPurchaseOrderReceipt(
  order: PurchaseOrder,
  receivedItems: readonly { productId: string; quantity: number }[],
): PurchaseOrder {
  if (order.status !== "APPROVED" && order.status !== "PARTIALLY_RECEIVED") {
    throw new Error("Goods can only be received against an approved purchase order.")
  }
  if (!receivedItems.length) {
    throw new Error("Add at least one item to this goods receipt.")
  }

  const quantities = new Map<string, number>()
  for (const received of receivedItems) {
    if (!received.productId || !Number.isFinite(received.quantity) || received.quantity <= 0) {
      throw new Error("Receipt quantities must be greater than zero.")
    }
    quantities.set(received.productId, (quantities.get(received.productId) ?? 0) + received.quantity)
  }

  const orderProducts = new Set<string>()
  for (const item of order.items) {
    if (orderProducts.has(item.productId)) {
      throw new Error("This purchase order contains duplicate product lines. Correct the order before receiving goods.")
    }
    orderProducts.add(item.productId)
  }
  for (const productId of quantities.keys()) {
    if (!orderProducts.has(productId)) {
      throw new Error("A received product is not included in this purchase order.")
    }
  }

  const items = order.items.map((item) => {
    const receivedNow = quantities.get(item.productId) ?? 0
    const alreadyReceived = item.receivedQuantity ?? 0
    const outstanding = Math.max(0, item.quantity - alreadyReceived)
    if (receivedNow > outstanding + 1e-8) {
      throw new Error(`Cannot receive ${receivedNow} ${item.unit} of ${item.productName}; only ${outstanding} ${item.unit} remain on the purchase order.`)
    }
    const nextReceived = alreadyReceived + receivedNow
    return { ...item, receivedQuantity: nextReceived >= item.quantity - 1e-8 ? item.quantity : nextReceived }
  })

  const fullyReceived = items.every((item) => item.receivedQuantity >= item.quantity - 1e-8)
  return { ...order, items, status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" }
}

export type CreatePurchaseRequisitionInput = {
  supplierId: string
  warehouseId: string
  notes?: string
  items: {
    productId: string
    quantity: number
    estimatedUnitCost: number
  }[]
}

function nextReference<T>(
  records: readonly T[],
  prefix: string,
  readReference: (record: T) => string,
  now: Date,
): string {
  const year = now.getFullYear()
  const yearPrefix = `${prefix}-${year}-`
  const highest = records.reduce((max, record) => {
    const reference = readReference(record)
    if (!reference.startsWith(yearPrefix)) return max
    const sequence = Number(reference.slice(yearPrefix.length))
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max
  }, 0)
  return `${yearPrefix}${String(highest + 1).padStart(5, "0")}`
}

export function buildPurchaseRequisition(
  input: CreatePurchaseRequisitionInput,
  suppliers: readonly {
    id: string
    name: string
    status: "Active" | "Inactive"
  }[],
  products: readonly {
    id: string
    name: string
    sku: string
    unit: string
    status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED"
    productType?: "GOODS" | "SERVICE"
  }[],
  warehouses: readonly {
    id: string
    name: string
    active: boolean
  }[],
  existing: readonly PurchaseRequisition[],
  now = new Date(),
): PurchaseRequisition {
  const supplier = suppliers.find(
    (item) => item.id === input.supplierId && item.status === "Active",
  )
  if (!supplier) throw new Error("Select an active supplier.")

  const warehouse = warehouses.find(
    (item) => item.id === input.warehouseId && item.active,
  )
  if (!warehouse) throw new Error("Select an active receiving warehouse.")

  if (!input.items.length) {
    throw new Error("Add at least one product to the requisition.")
  }

  const seen = new Set<string>()
  const items = input.items.map((request, index) => {
    if (seen.has(request.productId)) {
      throw new Error("A product can only appear once in a requisition.")
    }
    seen.add(request.productId)

    if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
      throw new Error("Requisition quantities must be greater than zero.")
    }
    if (!Number.isFinite(request.estimatedUnitCost) || request.estimatedUnitCost < 0) {
      throw new Error("Estimated unit costs must be zero or greater.")
    }

    const product = products.find((item) => item.id === request.productId)
    if (!product || product.productType === "SERVICE" || product.status === "INACTIVE" || product.status === "DISCONTINUED") {
      throw new Error("Select an active inventory product for every requisition line.")
    }

    return {
      id: `REQITEM-${now.getTime()}-${index}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: request.quantity,
      unit: product.unit,
      estimatedUnitCost: request.estimatedUnitCost,
    }
  })

  return {
    id: `REQ-${now.getTime()}`,
    requisitionNumber: nextReference(existing, "PR", (item) => item.requisitionNumber, now),
    supplierId: supplier.id,
    supplierName: supplier.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    notes: (input.notes ?? "").trim(),
    status: "DRAFT",
    items,
    createdAt: now.toISOString(),
  }
}

export function submitPurchaseRequisition(
  requisition: PurchaseRequisition,
  now = new Date(),
): PurchaseRequisition {
  if (requisition.status !== "DRAFT") {
    throw new Error("Only draft requisitions can be submitted.")
  }
  return { ...requisition, status: "SUBMITTED", submittedAt: now.toISOString() }
}

export function reviewPurchaseRequisition(
  requisition: PurchaseRequisition,
  decision: "APPROVE" | "REJECT",
  reviewer: string,
  note = "",
  now = new Date(),
): PurchaseRequisition {
  if (requisition.status !== "SUBMITTED") {
    throw new Error("Only submitted requisitions can be reviewed.")
  }
  if (decision === "REJECT" && !note.trim()) {
    throw new Error("Enter a reason when rejecting a requisition.")
  }
  if (!reviewer.trim()) throw new Error("Reviewer name is required.")

  return {
    ...requisition,
    status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
    reviewedAt: now.toISOString(),
    reviewedBy: reviewer.trim(),
    reviewNote: note.trim(),
  }
}

export function buildPurchaseOrderFromRequisition(
  requisition: PurchaseRequisition,
  warehouses: readonly { id: string; name: string; active: boolean }[],
  existing: readonly PurchaseOrder[],
  now = new Date(),
): PurchaseOrder {
  if (requisition.status !== "APPROVED") {
    throw new Error("Only approved requisitions can be converted to purchase orders.")
  }
  const warehouse = warehouses.find(
    (item) => item.id === requisition.warehouseId && item.active,
  )
  if (!warehouse) throw new Error("The requisition warehouse is no longer active.")

  const items: PurchaseOrderItem[] = requisition.items.map((item, index) => ({
    id: `POITEM-${now.getTime()}-${index}`,
    requisitionItemId: item.id,
    productId: item.productId,
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    unit: item.unit,
    unitCost: item.estimatedUnitCost,
    receivedQuantity: 0,
  }))

  return {
    id: `PO-${now.getTime()}`,
    purchaseOrderNumber: nextReference(existing, "PO", (item) => item.purchaseOrderNumber, now),
    requisitionId: requisition.id,
    requisitionNumber: requisition.requisitionNumber,
    supplierId: requisition.supplierId,
    supplierName: requisition.supplierName,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    notes: requisition.notes,
    status: "DRAFT",
    items,
    subtotal: items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    createdAt: now.toISOString(),
  }
}

export function submitPurchaseOrder(
  order: PurchaseOrder,
  now = new Date(),
): PurchaseOrder {
  if (order.status !== "DRAFT") {
    throw new Error("Only draft purchase orders can be submitted for approval.")
  }
  return { ...order, status: "PENDING_APPROVAL", submittedAt: now.toISOString() }
}

export function reviewPurchaseOrder(
  order: PurchaseOrder,
  decision: "APPROVE" | "REJECT",
  reviewer: string,
  note = "",
  now = new Date(),
): PurchaseOrder {
  if (order.status !== "PENDING_APPROVAL") {
    throw new Error("Only purchase orders awaiting approval can be reviewed.")
  }
  if (decision === "REJECT" && !note.trim()) {
    throw new Error("Enter a reason when rejecting a purchase order.")
  }
  if (!reviewer.trim()) throw new Error("Reviewer name is required.")

  return {
    ...order,
    status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
    approvedAt: decision === "APPROVE" ? now.toISOString() : undefined,
    approvedBy: decision === "APPROVE" ? reviewer.trim() : undefined,
    reviewNote: note.trim(),
  }
}
