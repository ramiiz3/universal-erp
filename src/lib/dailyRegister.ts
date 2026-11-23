export type DailyRegisterStatus = "OPEN" | "CLOSED"

export type DailyRegisterAmounts = {
  cash: number
  card: number
  bankTransfer: number
  credit: number
  total: number
}

export type DailyRegisterSummary = {
  salesCount: number
  sales: DailyRegisterAmounts
  customerCollections: DailyRegisterAmounts
  refunds: DailyRegisterAmounts
  supplierPayments: DailyRegisterAmounts
  openingCash: number
  otherCashPaidOut: number
  expectedCash: number
}

export type DailyRegisterSession = {
  id: string
  businessDate: string
  openedAt: string
  openingCash: number
  status: DailyRegisterStatus
  closedAt?: string
  countedCash?: number
  otherCashPaidOut?: number
  cashDifference?: number
  notes?: string
  summary?: DailyRegisterSummary
}

type DatedAmount = { amount: number; createdAt?: string; paymentDate?: string; method: string }
type RegisterSale = { createdAt: string; total: number; paymentMethod: string }
type RegisterReturn = { createdAt: string; refundTotal: number; refundMethod: string }
type RegisterSupplierInvoice = { payments?: DatedAmount[] }

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100

export function getBusinessDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function emptyAmounts(): DailyRegisterAmounts {
  return { cash: 0, card: 0, bankTransfer: 0, credit: 0, total: 0 }
}

function paymentBucket(method: string): keyof Omit<DailyRegisterAmounts, "total"> {
  if (method === "Cash") return "cash"
  if (method === "Card") return "card"
  if (method === "Credit") return "credit"
  return "bankTransfer"
}

function addAmount(target: DailyRegisterAmounts, method: string, amount: number) {
  if (!Number.isFinite(amount)) return
  const bucket = paymentBucket(method)
  target[bucket] = roundMoney(target[bucket] + amount)
  target.total = roundMoney(target.total + amount)
}

function occurredOn(value: string | undefined, businessDate: string): boolean {
  if (!value) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value === businessDate
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && getBusinessDate(date) === businessDate
}

export function calculateDailyRegisterSummary(input: {
  businessDate: string
  openingCash: number
  otherCashPaidOut?: number
  sales: readonly RegisterSale[]
  customerPayments: readonly DatedAmount[]
  returns: readonly RegisterReturn[]
  supplierInvoices: readonly RegisterSupplierInvoice[]
}): DailyRegisterSummary {
  const sales = emptyAmounts()
  const customerCollections = emptyAmounts()
  const refunds = emptyAmounts()
  const supplierPayments = emptyAmounts()
  let salesCount = 0

  for (const sale of input.sales) {
    if (!occurredOn(sale.createdAt, input.businessDate)) continue
    salesCount += 1
    addAmount(sales, sale.paymentMethod, sale.total)
  }

  for (const payment of input.customerPayments) {
    if (!occurredOn(payment.createdAt, input.businessDate)) continue
    addAmount(customerCollections, payment.method, payment.amount)
  }

  for (const record of input.returns) {
    if (!occurredOn(record.createdAt, input.businessDate)) continue
    addAmount(refunds, record.refundMethod, record.refundTotal)
  }

  for (const invoice of input.supplierInvoices) {
    for (const payment of invoice.payments ?? []) {
      if (!occurredOn(payment.paymentDate || payment.createdAt, input.businessDate)) continue
      addAmount(supplierPayments, payment.method, payment.amount)
    }
  }

  const openingCash = roundMoney(Math.max(0, input.openingCash))
  const otherCashPaidOut = roundMoney(Math.max(0, input.otherCashPaidOut ?? 0))
  const expectedCash = roundMoney(
    openingCash +
    sales.cash +
    customerCollections.cash -
    refunds.cash -
    supplierPayments.cash -
    otherCashPaidOut,
  )

  return {
    salesCount,
    sales,
    customerCollections,
    refunds,
    supplierPayments,
    openingCash,
    otherCashPaidOut,
    expectedCash,
  }
}
