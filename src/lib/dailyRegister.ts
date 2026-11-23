export type DailyRegisterStatus = "OPEN" | "CLOSED"
export type DailyCashMovementKind = "IN" | "OUT"

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
  otherCashIn: number
  otherCashOut: number
  expectedCash: number
}

export type DailyRegisterSession = {
  id: string
  businessDate: string
  openedAt: string
  openedBy: string
  openingCash: number
  status: DailyRegisterStatus
  closedAt?: string
  closedBy?: string
  countedCash?: number
  expectedCash?: number
  cashDifference?: number
  notes?: string
  summary?: DailyRegisterSummary
}

export type DailyRegisterCashMovement = {
  id: string
  businessDate: string
  kind: DailyCashMovementKind
  category: string
  amount: number
  note: string
  createdAt: string
}

type DatedAmount = { amount: number; createdAt?: string; paymentDate?: string; method: string }
type RegisterSale = { createdAt: string; total: number; paymentMethod: string }
type RegisterReturn = { createdAt: string; refundTotal: number; refundMethod: string }
type RegisterSupplierInvoice = { payments?: DatedAmount[] }

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100

export const DEFAULT_BUSINESS_TIME_ZONE = "Asia/Dubai"

export function getBusinessDate(
  date = new Date(),
  timeZone = DEFAULT_BUSINESS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  if (!year || !month || !day) {
    throw new Error("Could not determine the business date for the configured time zone.")
  }
  return `${year}-${month}-${day}`
}

export function validateDailyRegisterMoney(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`)
  }
  return roundMoney(value)
}

function emptyAmounts(): DailyRegisterAmounts {
  return { cash: 0, card: 0, bankTransfer: 0, credit: 0, total: 0 }
}

function paymentBucket(method: string): keyof Omit<DailyRegisterAmounts, "total"> | null {
  switch (method.trim().toLowerCase()) {
    case "cash": return "cash"
    case "card": return "card"
    case "credit": return "credit"
    case "bank transfer":
    case "bank": return "bankTransfer"
    default: return null
  }
}

function addAmount(target: DailyRegisterAmounts, method: string, amount: number) {
  if (!Number.isFinite(amount) || amount < 0) return
  const bucket = paymentBucket(method)
  if (!bucket) return
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
  sales: readonly RegisterSale[]
  customerPayments: readonly DatedAmount[]
  returns: readonly RegisterReturn[]
  supplierInvoices: readonly RegisterSupplierInvoice[]
  cashMovements?: readonly DailyRegisterCashMovement[]
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
      if (!occurredOn(payment.createdAt || payment.paymentDate, input.businessDate)) continue
      addAmount(supplierPayments, payment.method, payment.amount)
    }
  }

  const cashMovements = (input.cashMovements ?? []).filter(
    (movement) => movement.businessDate === input.businessDate,
  )
  const otherCashIn = roundMoney(cashMovements
    .filter((movement) => movement.kind === "IN")
    .reduce((sum, movement) => sum + Math.max(0, movement.amount), 0))
  const otherCashOut = roundMoney(cashMovements
    .filter((movement) => movement.kind === "OUT")
    .reduce((sum, movement) => sum + Math.max(0, movement.amount), 0))

  const openingCash = validateDailyRegisterMoney(input.openingCash, "Opening cash")
  const expectedCash = roundMoney(
    openingCash +
    sales.cash +
    customerCollections.cash +
    otherCashIn -
    refunds.cash -
    supplierPayments.cash -
    otherCashOut,
  )

  return {
    salesCount,
    sales,
    customerCollections,
    refunds,
    supplierPayments,
    openingCash,
    otherCashIn,
    otherCashOut,
    expectedCash,
  }
}
