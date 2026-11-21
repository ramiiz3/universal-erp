export type ReconciliationMethod = "Cash" | "Card" | "Bank Transfer"

export type ReconciliationAmounts = Record<ReconciliationMethod, number>

export type PaymentReconciliation = {
  id: string
  reference: string
  businessDate: string
  expectedAmounts: ReconciliationAmounts
  countedAmounts: ReconciliationAmounts
  varianceAmounts: ReconciliationAmounts
  expectedTotal: number
  countedTotal: number
  varianceTotal: number
  notes: string
  status: "CLOSED"
  createdAt: string
  closedAt: string
}

export type CreatePaymentReconciliationInput = {
  businessDate: string
  countedAmounts: ReconciliationAmounts
  notes?: string
}

type SaleForReconciliation = {
  createdAt: string
  paymentMethod: string
  status: string
  total: number
  id?: string
}

type CustomerPaymentForReconciliation = {
  createdAt: string
  method: string
  amount: number
}

type SaleRefundForReconciliation = {
  saleId: string
  createdAt: string
  refundMethod: string
  refundTotal: number
}

const METHODS: ReconciliationMethod[] = ["Cash", "Card", "Bank Transfer"]

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function localDateKey(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(parsed.getTime())) return false
  return localDateKey(parsed.toISOString()) === value ||
    (parsed.getFullYear() === Number(value.slice(0, 4)) &&
      parsed.getMonth() + 1 === Number(value.slice(5, 7)) &&
      parsed.getDate() === Number(value.slice(8, 10)))
}

function blankAmounts(): ReconciliationAmounts {
  return { Cash: 0, Card: 0, "Bank Transfer": 0 }
}

export function calculateExpectedPaymentTotals(
  businessDate: string,
  sales: readonly SaleForReconciliation[],
  customerPayments: readonly CustomerPaymentForReconciliation[],
  salesReturns: readonly SaleRefundForReconciliation[] = [],
): ReconciliationAmounts {
  if (!isBusinessDate(businessDate)) throw new Error("Enter a valid reconciliation date.")
  const totals = blankAmounts()

  for (const sale of sales) {
    const originalCollectionStillCounts = sale.status === "Paid" ||
      (sale.status === "Refunded" && Boolean(sale.id) && salesReturns.some((record) => record.saleId === sale.id))
    if (!originalCollectionStillCounts || localDateKey(sale.createdAt) !== businessDate) continue
    if (!METHODS.includes(sale.paymentMethod as ReconciliationMethod)) continue
    if (!Number.isFinite(sale.total) || sale.total < 0) continue
    const method = sale.paymentMethod as ReconciliationMethod
    totals[method] += sale.total
  }

  // Credit POS invoices are excluded above. Their cash/card/bank receipts are
  // counted once here, on the date the customer payment was actually recorded.
  for (const payment of customerPayments) {
    if (localDateKey(payment.createdAt) !== businessDate) continue
    if (!METHODS.includes(payment.method as ReconciliationMethod)) continue
    if (!Number.isFinite(payment.amount) || payment.amount < 0) continue
    const method = payment.method as ReconciliationMethod
    totals[method] += payment.amount
  }

  // Refunds reduce the payment method used on the actual refund date.
  for (const refund of salesReturns) {
    if (localDateKey(refund.createdAt) !== businessDate) continue
    if (!METHODS.includes(refund.refundMethod as ReconciliationMethod)) continue
    if (!Number.isFinite(refund.refundTotal) || refund.refundTotal < 0) continue
    totals[refund.refundMethod as ReconciliationMethod] -= refund.refundTotal
  }

  for (const method of METHODS) totals[method] = roundMoney(totals[method])
  return totals
}

export function buildPaymentReconciliation(
  input: CreatePaymentReconciliationInput,
  sales: readonly SaleForReconciliation[],
  customerPayments: readonly CustomerPaymentForReconciliation[],
  existing: readonly PaymentReconciliation[],
  now = new Date(),
  salesReturns: readonly SaleRefundForReconciliation[] = [],
): PaymentReconciliation {
  if (!isBusinessDate(input.businessDate)) throw new Error("Enter a valid reconciliation date.")
  if (existing.some((item) => item.businessDate === input.businessDate)) {
    throw new Error("A payment reconciliation already exists for this date.")
  }

  const countedAmounts = blankAmounts()
  for (const method of METHODS) {
    const amount = input.countedAmounts?.[method]
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Enter a valid non-negative counted amount for ${method}.`)
    }
    countedAmounts[method] = roundMoney(amount)
  }

  const expectedAmounts = calculateExpectedPaymentTotals(input.businessDate, sales, customerPayments, salesReturns)
  const varianceAmounts = blankAmounts()
  for (const method of METHODS) {
    varianceAmounts[method] = roundMoney(countedAmounts[method] - expectedAmounts[method])
  }

  const expectedTotal = roundMoney(METHODS.reduce((sum, method) => sum + expectedAmounts[method], 0))
  const countedTotal = roundMoney(METHODS.reduce((sum, method) => sum + countedAmounts[method], 0))
  const varianceTotal = roundMoney(countedTotal - expectedTotal)
  const dateToken = input.businessDate.replaceAll("-", "")

  return {
    id: `PAYREC-${dateToken}`,
    reference: `PAYREC-${dateToken}`,
    businessDate: input.businessDate,
    expectedAmounts,
    countedAmounts,
    varianceAmounts,
    expectedTotal,
    countedTotal,
    varianceTotal,
    notes: String(input.notes ?? "").trim(),
    status: "CLOSED",
    createdAt: now.toISOString(),
    closedAt: now.toISOString(),
  }
}
