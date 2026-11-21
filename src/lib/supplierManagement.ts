export type Supplier = {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  taxNumber: string
  status: "Active" | "Inactive"
}

export type SupplierInput = Omit<Supplier, "id">

export function normalizeSupplierRecords(value: unknown): Supplier[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null
      const raw = entry as Record<string, unknown>
      const name = String(raw.name ?? "").trim()
      if (!name) return null

      return {
        id: String(raw.id ?? `SUP-MIGRATED-${index + 1}`),
        name,
        contactPerson: String(raw.contactPerson ?? "").trim(),
        phone: String(raw.phone ?? "").trim(),
        email: String(raw.email ?? "").trim(),
        address: String(raw.address ?? "").trim(),
        taxNumber: String(raw.taxNumber ?? "").trim(),
        status: raw.status === "Inactive" ? "Inactive" as const : "Active" as const,
      }
    })
    .filter((supplier): supplier is Supplier => supplier !== null)
}

export function validateSupplierInput(
  input: SupplierInput,
  existing: readonly Supplier[],
  excludeId?: string,
): SupplierInput {
  const normalized: SupplierInput = {
    name: input.name.trim(),
    contactPerson: input.contactPerson.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    address: input.address.trim(),
    taxNumber: input.taxNumber.trim(),
    status: input.status === "Inactive" ? "Inactive" : "Active",
  }

  if (!normalized.name) throw new Error("Supplier name is required.")
  if (!normalized.phone) throw new Error("Phone number is required.")

  const duplicate = existing.some(
    (supplier) =>
      supplier.id !== excludeId &&
      supplier.name.trim().toLowerCase() === normalized.name.toLowerCase(),
  )
  if (duplicate) throw new Error("A supplier with this name already exists.")

  return normalized
}

export function linkPurchasesToSuppliers<
  T extends { supplierName: string; supplierId?: string },
>(
  purchases: readonly T[],
  suppliers: readonly Supplier[],
): T[] {
  const byName = new Map(
    suppliers.map((supplier) => [supplier.name.trim().toLowerCase(), supplier.id]),
  )

  return purchases.map((purchase) => {
    if (purchase.supplierId) return { ...purchase }
    const supplierId = byName.get(purchase.supplierName.trim().toLowerCase())
    return supplierId ? { ...purchase, supplierId } : { ...purchase }
  })
}
