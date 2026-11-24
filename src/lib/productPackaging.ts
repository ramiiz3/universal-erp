export type PackagingConversionInput = {
  id: string
  conversionFactor: number
  /** Empty string means the product's base stock unit. Undefined keeps a legacy direct conversion. */
  parentPackagingId?: string
  /** Number of this UOM contained in one parent UOM. */
  unitsPerParent?: number
}

/**
 * Resolve pack sizes entered as a hierarchy.
 *
 * Example with Box as the inventory unit:
 *  - Strip, parent = base Box, unitsPerParent = 10 -> 0.1 Box per Strip
 *  - Tablet, parent = Strip, unitsPerParent = 10   -> 0.01 Box per Tablet
 *
 * Stock stays recorded in the outer Box unit. A sale of 5 tablets therefore
 * consumes 0.05 Box from the selected batch.
 *
 * Old packaging records without parentPackagingId retain their stored
 * conversionFactor unchanged.
 */
export function resolvePackagingConversions<T extends PackagingConversionInput>(
  packagings: T[],
): T[] {
  const resolvedById = new Map<string, number>()

  return packagings.map((packaging, index) => {
    if (!packaging.id.trim()) {
      throw new Error(`Selling unit ${index + 1} is missing its ID. Please save the product again.`)
    }
    if (resolvedById.has(packaging.id)) {
      throw new Error("Selling unit IDs must be unique.")
    }

    // Backward compatibility for products that already use direct conversions.
    if (packaging.parentPackagingId === undefined) {
      const directFactor = Number(packaging.conversionFactor)
      if (!Number.isFinite(directFactor) || directFactor <= 0) {
        throw new Error(`Enter a valid stock-unit conversion for selling unit ${index + 1}.`)
      }
      resolvedById.set(packaging.id, directFactor)
      return { ...packaging, conversionFactor: directFactor }
    }

    const unitsPerParent = Number(packaging.unitsPerParent)
    if (!Number.isInteger(unitsPerParent) || unitsPerParent <= 0) {
      throw new Error(`Enter a whole number greater than zero for how many ${packaging.unit || packaging.name || "units"} fit in the selected parent pack.`)
    }

    let parentFactor = 1
    if (packaging.parentPackagingId) {
      const parentIndex = packagings.findIndex((candidate) => candidate.id === packaging.parentPackagingId)
      if (parentIndex < 0 || parentIndex >= index) {
        throw new Error(`Choose the stock unit or a selling unit listed above as the parent of ${packaging.unit || packaging.name || "this unit"}.`)
      }
      const resolvedParent = resolvedById.get(packaging.parentPackagingId)
      if (resolvedParent === undefined) {
        throw new Error(`The parent pack for ${packaging.unit || packaging.name || "this unit"} could not be calculated.`)
      }
      parentFactor = resolvedParent
    }

    const conversionFactor = parentFactor / unitsPerParent
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      throw new Error(`The pack conversion for ${packaging.unit || packaging.name || "this unit"} is invalid.`)
    }

    resolvedById.set(packaging.id, conversionFactor)
    return { ...packaging, conversionFactor }
  })
}
