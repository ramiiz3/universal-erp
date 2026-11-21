export type SupplierInvoicePaymentMethod = "Cash" | "Card" | "Bank Transfer"

export type SupplierInvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID"

export type SupplierInvoicePayment = {
  id: string
  paymentDate: string
  amount: number
  method: SupplierInvoicePaymentMethod
  reference: string
  notes: string
  createdAt: string
}

export type SupplierInvoice = {
  id: string
  billNumber: string
  invoiceNumber: string
  supplierId: string
  supplierName: string
  purchaseIds: string[]
  purchaseNumbers: string[]
  purchaseOrderNumbers: string[]
  invoiceDate: string
  dueDate: string
  amount: number
  paidAmount: number
  balance: number
  status: SupplierInvoiceStatus
  notes: string
  createdAt: string
  payments: SupplierInvoicePayment[]
}

export type SupplierInvoicePurchaseSource = {
  id: string
  purchaseNumber: string
  supplierName: string
  supplierId?: string
  supplierInvoice?: string
  purchaseOrderId?: string
  purchaseOrderNumber?: string
  total: number
}

export type SupplierInvoiceSupplierSource = {
  id: string
  name: string
}

export type CreateSupplierInvoiceInput = {
  supplierId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  amount: number
  purchaseIds: string[]
  notes?: string
}

export type RecordSupplierInvoicePaymentInput = {
  paymentDate: string
  amount: number
  method: SupplierInvoicePaymentMethod
  reference?: string
  notes?: string
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function nextBillNumber(existing: readonly SupplierInvoice[], now: Date): string {
  const year = now.getFullYear()
  const prefix = `AP-${year}-`
  const highest = existing.reduce((max, invoice) => {
    if (!invoice.billNumber.startsWith(prefix)) return max
    const suffix = Number(invoice.billNumber.slice(prefix.length))
    return Number.isInteger(suffix) ? Math.max(max, suffix) : max
  }, 0)
  return `${prefix}${String(highest + 1).padStart(5, "0")}`
}

export function buildSupplierInvoice(
  input: CreateSupplierInvoiceInput,
  suppliers: readonly SupplierInvoiceSupplierSource[],
  purchases: readonly SupplierInvoicePurchaseSource[],
  existing: readonly SupplierInvoice[],
  now = new Date(),
): SupplierInvoice {
  const supplier = suppliers.find((item) => item.id === input.supplierId)
  if (!supplier) throw new Error("Select a valid supplier.")

  const invoiceNumber = input.invoiceNumber.trim()
  if (!invoiceNumber) throw new Error("Supplier invoice number is required.")
  if (!isValidDate(input.invoiceDate)) throw new Error("Enter a valid invoice date.")
  if (!isValidDate(input.dueDate)) throw new Error("Enter a valid due date.")

  const amount = roundMoney(input.amount)
  if (!Number.isFinite(input.amount) || amount <= 0) {
    throw new Error("Invoice amount must be greater than zero.")
  }
  if (!Array.isArray(input.purchaseIds) || input.purchaseIds.length === 0) {
    throw new Error("Link at least one goods receipt or purchase record.")
  }
  if (new Set(input.purchaseIds).size !== input.purchaseIds.length) {
    throw new Error("A purchase record was selected more than once.")
  }

  const normalizedInvoiceNumber = invoiceNumber.toLocaleLowerCase()
  const duplicate = existing.some(
    (item) => item.supplierId === supplier.id &&
      item.invoiceNumber.trim().toLocaleLowerCase() === normalizedInvoiceNumber,
  )
  if (duplicate) {
    throw new Error("This supplier invoice number is already registered. Select all related receipts when creating the invoice.")
  }

  const selected = input.purchaseIds.map((id) => {
    const purchase = purchases.find((item) => item.id === id)
    if (!purchase) throw new Error("A selected purchase or goods receipt could not be found.")
    const sameSupplier = purchase.supplierId
      ? purchase.supplierId === supplier.id
      : purchase.supplierName.trim().toLocaleLowerCase() === supplier.name.trim().toLocaleLowerCase()
    if (!sameSupplier) throw new Error(`Purchase ${purchase.purchaseNumber} belongs to a different supplier.`)
    if (existing.some((invoice) => invoice.purchaseIds.includes(purchase.id))) {
      throw new Error(`Purchase ${purchase.purchaseNumber} is already linked to a supplier invoice.`)
    }
    return purchase
  })

  return {
    id: `SUPINV-${now.getTime()}-${existing.length + 1}`,
    billNumber: nextBillNumber(existing, now),
    invoiceNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    purchaseIds: selected.map((item) => item.id),
    purchaseNumbers: selected.map((item) => item.purchaseNumber),
    purchaseOrderNumbers: [...new Set(selected.map((item) => item.purchaseOrderNumber).filter((value): value is string => Boolean(value)))],
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    amount,
    paidAmount: 0,
    balance: amount,
    status: "UNPAID",
    notes: (input.notes ?? "").trim(),
    createdAt: now.toISOString(),
    payments: [],
  }
}

export function applySupplierInvoicePayment(
  invoice: SupplierInvoice,
  input: RecordSupplierInvoicePaymentInput,
  now = new Date(),
): SupplierInvoice {
  if (invoice.status === "PAID" || invoice.balance <= 0) {
    throw new Error("This supplier invoice is already fully paid.")
  }
  if (!isValidDate(input.paymentDate)) throw new Error("Enter a valid payment date.")
  if (!["Cash", "Card", "Bank Transfer"].includes(input.method)) {
    throw new Error("Choose Cash, Card or Bank Transfer as the payment method.")
  }
  const amount = roundMoney(input.amount)
  if (!Number.isFinite(input.amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than zero.")
  }
  if (amount > roundMoney(invoice.balance)) {
    throw new Error("Payment cannot exceed the outstanding invoice balance.")
  }

  const paidAmount = roundMoney(invoice.paidAmount + amount)
  const balance = roundMoney(invoice.amount - paidAmount)
  return {
    ...invoice,
    paidAmount,
    balance,
    status: balance <= 0 ? "PAID" : "PARTIALLY_PAID",
    payments: [
      ...invoice.payments,
      {
        id: `${invoice.id}-PAY-${invoice.payments.length + 1}`,
        paymentDate: input.paymentDate,
        amount,
        method: input.method,
        reference: (input.reference ?? "").trim(),
        notes: (input.notes ?? "").trim(),
        createdAt: now.toISOString(),
      },
    ],
  }
}
