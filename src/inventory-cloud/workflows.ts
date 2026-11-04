import {
  buildAdjustmentWrite,
  buildProductWrite,
  buildReceiptWrite,
  type AdjustmentInput,
  type ProductInput,
  type ProductWrite,
  type ReceiptInput,
} from "./domain"
import type { CloudInventoryLot, CloudWarehouse } from "./CloudInventoryContext"

export type ProductWorkflowGateway = {
  insert: (row: ProductWrite & { company_id: string; created_by: string }) => Promise<void>
  update: (productId: string, companyId: string, values: ProductWrite) => Promise<void>
  setActive: (productId: string, companyId: string, isActive: boolean) => Promise<void>
}

export async function saveProductWorkflow(
  gateway: ProductWorkflowGateway,
  companyId: string,
  userId: string,
  input: ProductInput,
  productId?: string,
) {
  const values = buildProductWrite(input)
  if (productId) {
    await gateway.update(productId, companyId, values)
  } else {
    await gateway.insert({ ...values, company_id: companyId, created_by: userId })
  }
}

export async function setProductArchiveWorkflow(
  gateway: Pick<ProductWorkflowGateway, "setActive">,
  companyId: string,
  productId: string,
  isActive: boolean,
) {
  await gateway.setActive(productId, companyId, isActive)
}

export function resolveAccessibleWarehouse(
  warehouseId: string,
  warehouses: CloudWarehouse[],
  allowedBranchIds: ReadonlySet<string>,
  hasCompanyScope: boolean,
) {
  const warehouse = warehouses.find((item) => item.id === warehouseId)
  if (!warehouse || (!hasCompanyScope && !allowedBranchIds.has(warehouse.branch_id))) {
    throw new Error("The selected warehouse is not available in the active company or branch.")
  }
  return warehouse
}

export type ReceiptCommand = ReturnType<typeof buildReceiptWrite> & {
  companyId: string
  branchId: string
  requestId: string
}

export async function receiveStockWorkflow(
  receive: (command: ReceiptCommand) => Promise<void>,
  companyId: string,
  warehouses: CloudWarehouse[],
  input: ReceiptInput,
  allowedBranchIds: ReadonlySet<string>,
  hasCompanyScope: boolean,
  requestId: string,
) {
  const values = buildReceiptWrite(input)
  const warehouse = resolveAccessibleWarehouse(
    values.warehouseId,
    warehouses,
    allowedBranchIds,
    hasCompanyScope,
  )
  await receive({ ...values, companyId, branchId: warehouse.branch_id, requestId })
}

export type AdjustmentCommand = ReturnType<typeof buildAdjustmentWrite> & {
  companyId: string
  requestId: string
}

export async function adjustStockWorkflow(
  adjust: (command: AdjustmentCommand) => Promise<void>,
  companyId: string,
  lots: CloudInventoryLot[],
  input: AdjustmentInput,
  requestId: string,
) {
  const values = buildAdjustmentWrite(input)
  const lot = lots.find((item) => item.id === values.lotId)
  if (!lot) throw new Error("The selected inventory lot is not available in the active company.")
  if (Number(lot.quantity) + values.quantityDelta < 0) {
    throw new Error("The adjustment cannot reduce lot quantity below zero.")
  }
  await adjust({ ...values, companyId, requestId })
}
