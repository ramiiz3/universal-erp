import type {
  InventoryLot,
  InventoryMovement,
  Product,
  Purchase,
  Sale,
} from "../context/ERPContext"

type MigrationStore = {
  products: Product[]
  inventoryLots: InventoryLot[]
  purchases: Purchase[]
  sales: Sale[]
  inventoryMovements: InventoryMovement[]
}

export function migrateHistoricalInventoryMovements<T extends MigrationStore>(
  data: T,
): T {
  const existing = [...data.inventoryMovements]
  const additions: InventoryMovement[] = []

  const hasReference = (
    type: InventoryMovement["type"],
    referenceId: string,
    referenceNumber: string,
  ) =>
    [...existing, ...additions].some((movement) =>
      movement.type === type &&
      (
        movement.metadata?.referenceId === referenceId ||
        movement.metadata?.referenceNumber === referenceNumber
      ),
    )

  // Reconstruct receipts from saved purchase records.
  for (const purchase of data.purchases) {
    if (
      hasReference("RECEIPT", purchase.id, purchase.purchaseNumber)
    ) {
      continue
    }

    purchase.items.forEach((item, index) => {
      const factor =
        Number(item.conversionFactor) > 0
          ? Number(item.conversionFactor)
          : 1

      const baseQuantity =
        Number(item.baseQuantity) > 0
          ? Number(item.baseQuantity)
          : item.quantity * factor

      if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return

      const product = data.products.find(
        (candidate) => candidate.id === item.productId,
      )

      const lot = data.inventoryLots.find(
        (candidate) =>
          candidate.productId === item.productId &&
          candidate.batch.trim().toUpperCase() ===
            item.batch.trim().toUpperCase() &&
          candidate.expiry === item.expiry,
      )

      const baseUnit =
        item.baseUnit ?? product?.unit ?? item.purchaseUnit ?? ""

      const unitCost =
        typeof item.baseUnitPurchasePrice === "number"
          ? item.baseUnitPurchasePrice
          : item.purchasePrice / factor

      const totalCost =
        typeof item.total === "number"
          ? item.total
          : item.quantity * item.purchasePrice

      additions.push({
        id: `MOV-HISTORY-PUR-${purchase.id}-${item.id || index}`,
        type: "RECEIPT",
        productId: item.productId,
        lotId: lot?.id ?? null,
        quantity: baseQuantity,
        reason: `Historical purchase receipt ${purchase.purchaseNumber}`,
        createdAt: purchase.createdAt,
        metadata: {
          referenceType: "PURCHASE",
          referenceId: purchase.id,
          referenceNumber: purchase.purchaseNumber,
          supplierName: purchase.supplierName,
          purchaseItemId: item.id,
          batch: item.batch,
          expiry: item.expiry,
          purchaseQuantity: item.quantity,
          purchaseUnit: item.purchaseUnit ?? item.baseUnit ?? baseUnit,
          conversionFactor: factor,
          baseUnit,
          unitCost,
          totalCost,
          packageName: item.packageName ?? "",
          migratedFromTransaction: true,
        },
      })
    })
  }

  // Reconstruct sales issues from their saved FEFO batch allocations.
  for (const sale of data.sales) {
    if (
      hasReference("SALE", sale.id, sale.invoiceNumber)
    ) {
      continue
    }

    sale.items.forEach((item) => {
      const allocations =
        item.batchAllocations?.length
          ? item.batchAllocations
          : item.costSnapshot?.lotAllocations ?? []

      // Never invent batch details if the source transaction lacks allocations.
      allocations.forEach((allocation, allocationIndex) => {
        const quantity = Math.abs(allocation.quantity)
        if (!Number.isFinite(quantity) || quantity <= 0) return

        const costAllocation =
          item.costSnapshot?.lotAllocations?.find(
            (cost) =>
              cost.lotId === allocation.lotId &&
              cost.batch === allocation.batch,
          )

        const unitCost =
          typeof costAllocation?.unitCost === "number"
            ? costAllocation.unitCost
            : item.costSnapshot?.unitCost

        const totalCost =
          typeof costAllocation?.totalCost === "number"
            ? costAllocation.totalCost
            : typeof unitCost === "number"
              ? quantity * unitCost
              : undefined

        const product = data.products.find(
          (candidate) => candidate.id === item.productId,
        )

        additions.push({
          id: `MOV-HISTORY-SALE-${sale.id}-${item.id}-${allocationIndex}`,
          type: "SALE",
          productId: item.productId,
          lotId: allocation.lotId ?? null,
          quantity: -quantity,
          reason: `Historical POS sale ${sale.invoiceNumber}`,
          createdAt: sale.createdAt,
          metadata: {
            referenceType: "SALE",
            referenceId: sale.id,
            referenceNumber: sale.invoiceNumber,
            invoiceItemId: item.id,
            batch: allocation.batch,
            expiry: allocation.expiry,
            invoiceQuantity: item.quantity,
            sellingUnit: item.sellingUnit ?? product?.unit ?? "",
            conversionFactor: item.conversionFactor ?? 1,
            baseUnit: product?.unit ?? "",
            unitCost,
            totalCost,
            migratedFromTransaction: true,
          },
        })
      })
    })
  }

  if (!additions.length) return data

  return {
    ...data,
    inventoryMovements: [...additions, ...existing],
  }
}
