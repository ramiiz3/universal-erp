export type CustomerPaymentMethod = "Cash" | "Card" | "Bank Transfer"

export type CustomerPaymentAllocation = {
  saleId: string
  invoiceNumber: string
  amount: number
}

export type CustomerPayment = {
  id: string
  receiptNumber: string
  customerId: string
  customerName: string
  createdAt: string
  method: CustomerPaymentMethod
  reference: string
  amount: number
  allocations: CustomerPaymentAllocation[]
}

export type RecordCustomerPaymentInput = {
  customerId: string
  method: CustomerPaymentMethod
  reference?: string
  allocations: { saleId: string; amount: number }[]
}

type CreditSale = {
  id: string
  invoiceNumber: string
  customerId: string | null
  customerName: string
  paymentMethod: string
  total: number
  status: "Paid" | "Pending" | "Refunded"
}

type CustomerRecord = { id: string; name: string }

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function getSalePaymentSummary(
  sale: CreditSale,
  payments: readonly CustomerPayment[],
): { paidAmount: number; outstandingAmount: number; status: "Pending" | "Partially Paid" | "Paid" | "Refunded" } {
  if (sale.status === "Refunded") {
    return { paidAmount: 0, outstandingAmount: 0, status: "Refunded" }
  }
  if (sale.status === "Paid" || sale.paymentMethod !== "Credit") {
    return { paidAmount: cents(sale.total), outstandingAmount: 0, status: "Paid" }
  }
  const paidAmount = cents(payments.reduce((sum, payment) =>
    sum + payment.allocations
      .filter((allocation) => allocation.saleId === sale.id)
      .reduce((allocationSum, allocation) => allocationSum + allocation.amount, 0), 0))
  const outstandingAmount = cents(Math.max(0, sale.total - paidAmount))
  const status = outstandingAmount <= 0.005
    ? "Paid"
    : paidAmount > 0
      ? "Partially Paid"
      : "Pending"
  return { paidAmount: Math.min(paidAmount, cents(sale.total)), outstandingAmount, status }
}

function nextReceiptNumber(existing: readonly CustomerPayment[], now: Date): string {
  const year = now.getFullYear()
  const prefix = `CP-${year}-`
  const highest = existing.reduce((max, payment) => {
    if (!payment.receiptNumber.startsWith(prefix)) return max
    const sequence = Number(payment.receiptNumber.slice(prefix.length))
    return Number.isInteger(sequence) ? Math.max(max, sequence) : max
  }, 0)
  return `${prefix}${String(highest + 1).padStart(5, "0")}`
}

export function buildCustomerPayment(
  input: RecordCustomerPaymentInput,
  sales: readonly CreditSale[],
  customers: readonly CustomerRecord[],
  existingPayments: readonly CustomerPayment[],
  now = new Date(),
): CustomerPayment {
  const customer = customers.find((item) => item.id === input.customerId)
  if (!customer) throw new Error("Select a valid customer.")
  if (!["Cash", "Card", "Bank Transfer"].includes(input.method)) {
    throw new Error("Choose Cash, Card or Bank Transfer.")
  }
  if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
    throw new Error("Allocate the payment to at least one credit invoice.")
  }

  const seen = new Set<string>()
  const allocations: CustomerPaymentAllocation[] = input.allocations.map((entry) => {
    if (seen.has(entry.saleId)) throw new Error("An invoice can only appear once in a payment.")
    seen.add(entry.saleId)
    if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
      throw new Error("Each allocated amount must be greater than zero.")
    }
    const sale = sales.find((item) => item.id === entry.saleId)
    if (!sale) throw new Error("The selected sales invoice was not found.")
    if (sale.customerId !== customer.id) throw new Error("The invoice does not belong to the selected customer.")
    if (sale.paymentMethod !== "Credit" || sale.status === "Refunded" || sale.status === "Paid") {
      throw new Error("Only outstanding credit invoices can receive customer payments.")
    }
    const summary = getSalePaymentSummary(sale, existingPayments)
    const amount = cents(entry.amount)
    if (amount - summary.outstandingAmount > 0.005) {
      throw new Error(`Payment exceeds the outstanding balance for ${sale.invoiceNumber}.`)
    }
    return { saleId: sale.id, invoiceNumber: sale.invoiceNumber, amount }
  })

  const amount = cents(allocations.reduce((sum, item) => sum + item.amount, 0))
  if (amount <= 0) throw new Error("Payment amount must be greater than zero.")
  return {
    id: `CPAY-${now.getTime()}-${existingPayments.length + 1}`,
    receiptNumber: nextReceiptNumber(existingPayments, now),
    customerId: customer.id,
    customerName: customer.name,
    createdAt: now.toISOString(),
    method: input.method,
    reference: String(input.reference ?? "").trim(),
    amount,
    allocations,
  }
}
