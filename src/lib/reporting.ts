export type ReportRangeMode = "daily" | "weekly" | "monthly" | "yearly" | "custom"

export type SaleItemCostAllocation = {
  lotId: string
  batch: string
  expiry: string
  quantity: number
  unitCost: number
  totalCost: number
}

export type SaleItemCostSnapshot = {
  cogs: number
  unitCost: number
  lotAllocations: SaleItemCostAllocation[]
}

export type ReportSaleItem = {
  id: string
  productId: string
  name: string
  barcode: string
  quantity: number
  unitPrice: number
  vatRate: number
  total: number
  costSnapshot?: SaleItemCostSnapshot
}

export type ReportSale = {
  id: string
  invoiceNumber: string
  createdAt: string
  customerId: string | null
  customerName: string
  paymentMethod: string
  subtotal: number
  discount: number
  vat: number
  total: number
  status: string
  items: ReportSaleItem[]
}

export type ReportSalesReturnItem = {
  id: string
  saleItemId: string
  productId: string
  productName: string
  quantity: number
  baseQuantity: number
  subtotalAmount: number
  discountAmount: number
  vatAmount: number
  refundAmount: number
  allocations: { lotId: string; batch: string; expiry: string; quantity: number }[]
}

export type ReportSalesReturn = {
  id: string
  returnNumber: string
  saleId: string
  invoiceNumber: string
  customerName: string
  createdAt: string
  refundMethod: string
  reason: string
  items: ReportSalesReturnItem[]
  subtotalAmount: number
  discountAmount: number
  vatAmount: number
  refundTotal: number
}

export type ReportSalesRegisterRow = {
  id: string
  invoiceNumber: string
  date: string
  customerName: string
  paymentMethod: string
  status: string
  lineCount: number
  grossSales: number
  discounts: number
  netSales: number
  vat: number
  total: number
}

export type ReportReturnBreakdownRow = {
  id: string
  returnNumber: string
  invoiceNumber: string
  saleId: string
  date: string
  customerName: string
  productName: string
  quantity: number
  refundMethod: string
  reason: string
  refundAmount: number
  vatAmount: number
}

export type ReportDateRange = {
  mode: ReportRangeMode
  start: Date
  end: Date
  label: string
}

export type SummaryMetrics = {
  grossSales: number
  discounts: number
  refunds: number
  netSales: number
  cogs: number
  grossProfit: number
  grossMargin: number
  vatCollected: number
  transactionCount: number
  costsUnavailableCount: number
  costsUnavailableMessage: string
}

export type ProductBreakdownRow = {
  productId: string
  name: string
  category: string
  quantitySold: number
  quantityReturned: number
  grossSales: number
  discounts: number
  refunds: number
  netSales: number
  cogs: number
  grossProfit: number
  grossMargin: number
  vatCollected: number
  costsComplete: boolean
}

export type CategoryBreakdownRow = {
  category: string
  quantitySold: number
  quantityReturned: number
  grossSales: number
  discounts: number
  refunds: number
  netSales: number
  cogs: number
  grossProfit: number
  grossMargin: number
  vatCollected: number
  costsComplete: boolean
}

export type DailyBreakdownRow = {
  date: string
  label: string
  grossSales: number
  discounts: number
  netSales: number
  cogs: number
  grossProfit: number
  grossMargin: number
  vatCollected: number
  refunds: number
  refundTransactions: number
  transactions: number
  costsComplete: boolean
}

export type ReportDataset = {
  title: string
  periodLabel: string
  generatedAt: string
  range?: ReportDateRange
  summary: SummaryMetrics
  salesRegister: ReportSalesRegisterRow[]
  productBreakdown: ProductBreakdownRow[]
  categoryBreakdown?: CategoryBreakdownRow[]
  dailyBreakdown: DailyBreakdownRow[]
  returnBreakdown: ReportReturnBreakdownRow[]
}

const moneyRound = (value: number) => Number(Number.isFinite(value) ? value.toFixed(2) : 0)

const startOfDay = (date: Date) => {
  const clone = new Date(date)
  clone.setHours(0, 0, 0, 0)
  return clone
}

const endOfDay = (date: Date) => {
  const clone = new Date(date)
  clone.setHours(23, 59, 59, 999)
  return clone
}

const safeNumber = (value: number | null | undefined) => {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

export function getDateRange(
  mode: ReportRangeMode,
  referenceDate: Date = new Date(),
  customStart?: string,
  customEnd?: string,
): ReportDateRange {
  const ref = new Date(referenceDate)

  if (mode === "daily") {
    const start = startOfDay(ref)
    const end = endOfDay(ref)

    return {
      mode,
      start,
      end,
      label: `Daily · ${formatDisplayDate(start)}`,
    }
  }

  if (mode === "weekly") {
    const start = startOfDay(ref)
    start.setDate(ref.getDate() - 6)

    return {
      mode,
      start,
      end: endOfDay(ref),
      label: `${formatDisplayDate(start)} - ${formatDisplayDate(ref)}`,
    }
  }

  if (mode === "monthly") {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999)

    return {
      mode,
      start,
      end,
      label: start.toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
    }
  }

  if (mode === "yearly") {
    const start = new Date(ref.getFullYear(), 0, 1)
    const end = new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999)

    return {
      mode,
      start,
      end,
      label: String(ref.getFullYear()),
    }
  }

  const safeStart = customStart ? new Date(`${customStart}T00:00:00`) : startOfDay(ref)
  const safeEnd = customEnd ? new Date(`${customEnd}T23:59:59.999`) : endOfDay(ref)

  if (Number.isNaN(safeStart.getTime()) || Number.isNaN(safeEnd.getTime())) {
    const start = startOfDay(ref)
    const end = endOfDay(ref)

    return {
      mode,
      start,
      end,
      label: `Custom · ${formatDisplayDate(start)} - ${formatDisplayDate(end)}`,
    }
  }

  const normalizedStart = startOfDay(safeStart)
  const normalizedEnd = endOfDay(safeEnd)

  return {
    mode,
    start: normalizedStart,
    end: normalizedEnd,
    label: `${formatDisplayDate(normalizedStart)} - ${formatDisplayDate(normalizedEnd)}`,
  }
}

const getSaleDiscountAllocation = (sale: ReportSale, itemTotal: number) => {
  if (!sale.subtotal || sale.subtotal <= 0) return 0
  return safeNumber(sale.discount) * (itemTotal / sale.subtotal)
}

const getSalesInRange = (sales: ReportSale[], range: ReportDateRange) =>
  sales.filter((sale) => {
    const timestamp = new Date(sale.createdAt).getTime()
    return timestamp >= range.start.getTime() && timestamp <= range.end.getTime()
  })

const getReturnsInRange = (returns: ReportSalesReturn[], range: ReportDateRange) =>
  returns.filter((record) => {
    const timestamp = new Date(record.createdAt).getTime()
    return Number.isFinite(timestamp) &&
      timestamp >= range.start.getTime() &&
      timestamp <= range.end.getTime()
  })

function getReliableReturnedCost(
  sale: ReportSale | undefined,
  returnItem: ReportSalesReturnItem,
): number | null {
  if (!sale || sale.items.some((item) => !item.costSnapshot || !Number.isFinite(item.costSnapshot.cogs))) {
    return null
  }

  const saleItem = sale.items.find((item) => item.id === returnItem.saleItemId)
  if (!saleItem?.costSnapshot) return null

  let total = 0
  for (const allocation of returnItem.allocations) {
    const lotCost = saleItem.costSnapshot.lotAllocations.find((item) => item.lotId === allocation.lotId)
    const unitCost = lotCost?.unitCost ?? saleItem.costSnapshot.unitCost
    if (!Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(allocation.quantity) || allocation.quantity < 0) {
      return null
    }
    total += allocation.quantity * unitCost
  }
  return moneyRound(total)
}

export function buildReportDataset({
  sales,
  salesReturns = [],
  period,
  title = "ERP Report",
  products,
}: {
  sales: ReportSale[]
  salesReturns?: ReportSalesReturn[]
  period: ReportDateRange
  title?: string
  products?: { id: string; category?: string }[]
}): ReportDataset {
  // Pending invoices are credit sales, not drafts. They remain part of sales revenue.
  // Fully refunded invoices also remain in their original sale period; the refund is
  // recognised separately on the date the return/refund was recorded.
  const inRangeSales = getSalesInRange(sales, period)
  const inRangeReturns = getReturnsInRange(salesReturns, period)
  const salesById = new Map(sales.map((sale) => [sale.id, sale]))

  const summary: SummaryMetrics = {
    grossSales: 0,
    discounts: 0,
    refunds: 0,
    netSales: 0,
    cogs: 0,
    grossProfit: 0,
    grossMargin: 0,
    vatCollected: 0,
    transactionCount: inRangeSales.length,
    costsUnavailableCount: 0,
    costsUnavailableMessage: "",
  }

  let grossProfitFromReliableData = 0

  for (const sale of inRangeSales) {
    const saleGrossSales = safeNumber(sale.subtotal)
    const saleDiscount = safeNumber(sale.discount)
    const saleNetSales = saleGrossSales - saleDiscount
    const saleVat = safeNumber(sale.vat)

    summary.grossSales += saleGrossSales
    summary.discounts += saleDiscount
    summary.netSales += saleNetSales
    summary.vatCollected += saleVat

    let saleCogs = 0
    let missingHistoricalCost = false

    for (const item of sale.items) {
      const itemCogs = item.costSnapshot && Number.isFinite(item.costSnapshot.cogs)
        ? safeNumber(item.costSnapshot.cogs)
        : 0

      saleCogs += itemCogs

      if (!item.costSnapshot || !Number.isFinite(item.costSnapshot.cogs)) {
        missingHistoricalCost = true
      }
    }

    if (missingHistoricalCost) {
      summary.costsUnavailableCount += 1
    } else {
      summary.cogs += saleCogs
      grossProfitFromReliableData += saleNetSales - saleCogs
    }
  }

  let returnedGrossProfitAdjustment = 0
  for (const record of inRangeReturns) {
    summary.refunds += safeNumber(record.refundTotal)
    summary.netSales -= Math.max(0, safeNumber(record.subtotalAmount) - safeNumber(record.discountAmount))
    summary.vatCollected -= safeNumber(record.vatAmount)

    const originalSale = salesById.get(record.saleId)
    for (const returnItem of record.items) {
      const netRefund = Math.max(0, safeNumber(returnItem.subtotalAmount) - safeNumber(returnItem.discountAmount))
      const returnedCost = getReliableReturnedCost(originalSale, returnItem)
      if (returnedCost === null) {
        summary.costsUnavailableCount += 1
        continue
      }

      // Returned stock re-enters inventory, reversing its original historical COGS.
      summary.cogs -= returnedCost
      returnedGrossProfitAdjustment += netRefund - returnedCost
    }
  }

  summary.grossProfit = grossProfitFromReliableData - returnedGrossProfitAdjustment
  summary.grossMargin = summary.netSales > 0 ? (summary.grossProfit / summary.netSales) * 100 : 0

  if (summary.costsUnavailableCount > 0) {
    summary.costsUnavailableMessage = `${summary.costsUnavailableCount} sale/return transaction(s) have unavailable historical cost data, so gross profit is incomplete.`
  }

  const salesRegister: ReportSalesRegisterRow[] = inRangeSales
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((sale) => ({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      date: sale.createdAt,
      customerName: sale.customerName,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      lineCount: sale.items.length,
      grossSales: moneyRound(safeNumber(sale.subtotal)),
      discounts: moneyRound(safeNumber(sale.discount)),
      netSales: moneyRound(safeNumber(sale.subtotal) - safeNumber(sale.discount)),
      vat: moneyRound(safeNumber(sale.vat)),
      total: moneyRound(safeNumber(sale.total)),
    }))

  const productMap = new Map<string, ProductBreakdownRow>()
  const categoryMap = new Map<string, CategoryBreakdownRow>()
  const dailyMap = new Map<string, DailyBreakdownRow>()
  const productLookup = new Map((products ?? []).map((product) => [product.id, product]))

  for (const sale of inRangeSales) {
    const saleGrossSales = safeNumber(sale.subtotal)
    const saleDiscount = safeNumber(sale.discount)
    const saleNetSales = saleGrossSales - saleDiscount
    const saleVat = safeNumber(sale.vat)
    const saleCogs = sale.items.every((item) => item.costSnapshot && Number.isFinite(item.costSnapshot.cogs))
      ? sale.items.reduce((sum, item) => sum + safeNumber(item.costSnapshot?.cogs), 0)
      : 0

    const saleDate = new Date(sale.createdAt)
    const dayKey = startOfDay(saleDate).toISOString().slice(0, 10)
    const dayLabel = formatDisplayDate(startOfDay(saleDate))

    const dayRow = dailyMap.get(dayKey) ?? {
      date: dayKey,
      label: dayLabel,
      grossSales: 0,
      discounts: 0,
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      grossMargin: 0,
      vatCollected: 0,
      refunds: 0,
      refundTransactions: 0,
      transactions: 0,
      costsComplete: true,
    }

    dayRow.grossSales += saleGrossSales
    dayRow.discounts += saleDiscount
    dayRow.netSales += saleNetSales
    dayRow.vatCollected += saleVat
    dayRow.transactions += 1
    const saleCostsComplete = sale.items.every((item) => item.costSnapshot && Number.isFinite(item.costSnapshot.cogs))
    if (saleCostsComplete) {
      dayRow.cogs += saleCogs
    } else {
      dayRow.costsComplete = false
    }
    dailyMap.set(dayKey, dayRow)

    for (const item of sale.items) {
      const itemGrossSales = safeNumber(item.total)
      const itemDiscount = getSaleDiscountAllocation(sale, itemGrossSales)
      const itemNetSales = itemGrossSales - itemDiscount
      const itemVatCollected = itemNetSales * (safeNumber(item.vatRate) / 100)
      const itemCogs = item.costSnapshot && Number.isFinite(item.costSnapshot.cogs)
        ? safeNumber(item.costSnapshot.cogs)
        : 0
      const categoryName = productLookup.get(item.productId)?.category ?? "Uncategorized"

      const existingProduct = productMap.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        category: categoryName,
        quantitySold: 0,
        quantityReturned: 0,
        grossSales: 0,
        discounts: 0,
        refunds: 0,
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        vatCollected: 0,
        costsComplete: true,
      }

      existingProduct.quantitySold += item.quantity
      existingProduct.grossSales += itemGrossSales
      existingProduct.discounts += itemDiscount
      existingProduct.netSales += itemNetSales
      existingProduct.cogs += itemCogs
      existingProduct.vatCollected += itemVatCollected
      if (!item.costSnapshot || !Number.isFinite(item.costSnapshot.cogs)) existingProduct.costsComplete = false
      productMap.set(item.productId, existingProduct)

      const categoryRow = categoryMap.get(categoryName) ?? {
        category: categoryName,
        quantitySold: 0,
        quantityReturned: 0,
        grossSales: 0,
        discounts: 0,
        refunds: 0,
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        vatCollected: 0,
        costsComplete: true,
      }

      categoryRow.quantitySold += item.quantity
      categoryRow.grossSales += itemGrossSales
      categoryRow.discounts += itemDiscount
      categoryRow.netSales += itemNetSales
      categoryRow.cogs += itemCogs
      categoryRow.vatCollected += itemVatCollected
      if (!item.costSnapshot || !Number.isFinite(item.costSnapshot.cogs)) categoryRow.costsComplete = false
      categoryMap.set(categoryName, categoryRow)
    }
  }

  for (const record of inRangeReturns) {
    const returnDate = new Date(record.createdAt)
    const dayKey = startOfDay(returnDate).toISOString().slice(0, 10)
    const dayLabel = formatDisplayDate(startOfDay(returnDate))
    const dayRow = dailyMap.get(dayKey) ?? {
      date: dayKey,
      label: dayLabel,
      grossSales: 0,
      discounts: 0,
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      grossMargin: 0,
      vatCollected: 0,
      refunds: 0,
      refundTransactions: 0,
      transactions: 0,
      costsComplete: true,
    }
    dayRow.refunds += safeNumber(record.refundTotal)
    dayRow.netSales -= Math.max(0, safeNumber(record.subtotalAmount) - safeNumber(record.discountAmount))
    dayRow.vatCollected -= safeNumber(record.vatAmount)
    dayRow.refundTransactions += 1

    const originalSale = salesById.get(record.saleId)
    for (const item of record.items) {
      const categoryName = productLookup.get(item.productId)?.category ?? "Uncategorized"
      const returnedNetSales = Math.max(0, safeNumber(item.subtotalAmount) - safeNumber(item.discountAmount))
      const returnedCost = getReliableReturnedCost(originalSale, item)

      const productRow = productMap.get(item.productId) ?? {
        productId: item.productId,
        name: item.productName,
        category: categoryName,
        quantitySold: 0,
        quantityReturned: 0,
        grossSales: 0,
        discounts: 0,
        refunds: 0,
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        vatCollected: 0,
        costsComplete: returnedCost !== null,
      }
      productRow.quantityReturned += safeNumber(item.quantity)
      productRow.refunds += safeNumber(item.refundAmount)
      productRow.netSales -= returnedNetSales
      productRow.vatCollected -= safeNumber(item.vatAmount)
      if (returnedCost === null) {
        productRow.costsComplete = false
      } else {
        productRow.cogs -= returnedCost
        dayRow.cogs -= returnedCost
      }
      productMap.set(item.productId, productRow)

      const categoryRow = categoryMap.get(categoryName) ?? {
        category: categoryName,
        quantitySold: 0,
        quantityReturned: 0,
        grossSales: 0,
        discounts: 0,
        refunds: 0,
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        vatCollected: 0,
        costsComplete: returnedCost !== null,
      }
      categoryRow.quantityReturned += safeNumber(item.quantity)
      categoryRow.refunds += safeNumber(item.refundAmount)
      categoryRow.netSales -= returnedNetSales
      categoryRow.vatCollected -= safeNumber(item.vatAmount)
      if (returnedCost === null) {
        categoryRow.costsComplete = false
      } else {
        categoryRow.cogs -= returnedCost
      }
      categoryMap.set(categoryName, categoryRow)
    }

    if (record.items.some((item) => getReliableReturnedCost(originalSale, item) === null)) {
      dayRow.costsComplete = false
    }
    dailyMap.set(dayKey, dayRow)
  }

  const productBreakdown = Array.from(productMap.values()).map((row) => {
    const grossProfit = row.netSales - row.cogs
    const grossMargin = row.netSales > 0 ? (grossProfit / row.netSales) * 100 : 0

    return {
      ...row,
      cogs: moneyRound(row.cogs),
      grossProfit: moneyRound(grossProfit),
      grossMargin: moneyRound(grossMargin),
      grossSales: moneyRound(row.grossSales),
      discounts: moneyRound(row.discounts),
      netSales: moneyRound(row.netSales),
      vatCollected: moneyRound(row.vatCollected),
    }
  }).sort((a, b) => b.netSales - a.netSales)

  const categoryBreakdown = Array.from(categoryMap.values()).map((row) => {
    const grossProfit = row.netSales - row.cogs
    const grossMargin = row.netSales > 0 ? (grossProfit / row.netSales) * 100 : 0

    return {
      ...row,
      cogs: moneyRound(row.cogs),
      grossProfit: moneyRound(grossProfit),
      grossMargin: moneyRound(grossMargin),
      grossSales: moneyRound(row.grossSales),
      discounts: moneyRound(row.discounts),
      netSales: moneyRound(row.netSales),
      vatCollected: moneyRound(row.vatCollected),
    }
  }).sort((a, b) => b.netSales - a.netSales)

  const dailyBreakdown = Array.from(dailyMap.values())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((row) => {
      const grossProfit = row.netSales - row.cogs
      const grossMargin = row.netSales > 0 ? (grossProfit / row.netSales) * 100 : 0

      return {
        ...row,
        cogs: moneyRound(row.cogs),
        grossProfit: moneyRound(grossProfit),
        grossMargin: moneyRound(grossMargin),
        refunds: moneyRound(row.refunds),
      }
    })

  const returnBreakdown: ReportReturnBreakdownRow[] = inRangeReturns
    .flatMap((record) => record.items.map((item) => ({
      id: item.id,
      returnNumber: record.returnNumber,
      invoiceNumber: record.invoiceNumber,
      saleId: record.saleId,
      date: record.createdAt,
      customerName: record.customerName,
      productName: item.productName,
      quantity: item.quantity,
      refundMethod: record.refundMethod,
      reason: record.reason,
      refundAmount: moneyRound(item.refundAmount),
      vatAmount: moneyRound(item.vatAmount),
    })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return {
    title,
    periodLabel: period.label,
    generatedAt: new Date().toISOString(),
    range: period,
    summary: {
      ...summary,
      grossSales: moneyRound(summary.grossSales),
      discounts: moneyRound(summary.discounts),
      netSales: moneyRound(summary.netSales),
      cogs: moneyRound(summary.cogs),
      grossProfit: moneyRound(summary.grossProfit),
      grossMargin: moneyRound(summary.grossMargin),
      vatCollected: moneyRound(summary.vatCollected),
      refunds: moneyRound(summary.refunds),
    },
    salesRegister,
    productBreakdown,
    categoryBreakdown,
    dailyBreakdown,
    returnBreakdown,
  }
}

const csvEscape = (value: unknown) => {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return `"${escaped}"`
}

export function exportReportCsv(report: ReportDataset) {
  const categoryBreakdown = report.categoryBreakdown ?? []

  const summaryRows = [
    ["metric", "value"],
    ["reportTitle", report.title],
    ["periodLabel", report.periodLabel],
    ["generatedAt", report.generatedAt],
    ["grossSales", report.summary.grossSales],
    ["discounts", report.summary.discounts],
    ["refunds", report.summary.refunds],
    ["netSales", report.summary.netSales],
    ["cogs", report.summary.cogs],
    ["grossProfit", report.summary.grossProfit],
    ["grossMargin", report.summary.grossMargin],
    ["vatCollected", report.summary.vatCollected],
    ["transactionCount", report.summary.transactionCount],
    ["costsUnavailableCount", report.summary.costsUnavailableCount],
    ["costsUnavailableMessage", report.summary.costsUnavailableMessage],
    ["salesReturnCount", report.returnBreakdown.length],
  ]

  const salesRegisterRows = [
    [
      "invoiceNumber",
      "date",
      "customerName",
      "paymentMethod",
      "status",
      "lineCount",
      "grossSales",
      "discounts",
      "netSales",
      "vat",
      "total",
    ],
    ...report.salesRegister.map((row) => [
      row.invoiceNumber,
      row.date,
      row.customerName,
      row.paymentMethod,
      row.status,
      row.lineCount,
      row.grossSales,
      row.discounts,
      row.netSales,
      row.vat,
      row.total,
    ]),
  ]

  const productRows = [
    [
      "productId",
      "name",
      "category",
      "quantitySold",
      "quantityReturned",
      "grossSales",
      "discounts",
      "refunds",
      "netSales",
      "cogs",
      "grossProfit",
      "grossMargin",
      "vatCollected",
      "costsComplete",
    ],
    ...report.productBreakdown.map((row) => [
      row.productId,
      row.name,
      row.category,
      row.quantitySold,
      row.quantityReturned,
      row.grossSales,
      row.discounts,
      row.refunds,
      row.netSales,
      row.cogs,
      row.grossProfit,
      row.grossMargin,
      row.vatCollected,
      row.costsComplete,
    ]),
  ]

  const categoryRows = [
    [
      "category",
      "quantitySold",
      "quantityReturned",
      "grossSales",
      "discounts",
      "refunds",
      "netSales",
      "cogs",
      "grossProfit",
      "grossMargin",
      "vatCollected",
      "costsComplete",
    ],
    ...categoryBreakdown.map((row) => [
      row.category,
      row.quantitySold,
      row.quantityReturned,
      row.grossSales,
      row.discounts,
      row.refunds,
      row.netSales,
      row.cogs,
      row.grossProfit,
      row.grossMargin,
      row.vatCollected,
      row.costsComplete,
    ]),
  ]

  const rows = [
    ["SUMMARY"],
    ...summaryRows,
    [],
    ["SALES REGISTER"],
    ...salesRegisterRows,
    [],
    ["PRODUCT BREAKDOWN"],
    ...productRows,
    [],
    ["CATEGORY BREAKDOWN"],
    ...categoryRows,
    [],
    ["DAILY BREAKDOWN"],
    [
      "date",
      "label",
      "grossSales",
      "discounts",
      "netSales",
      "cogs",
      "grossProfit",
      "grossMargin",
      "vatCollected",
      "refunds",
      "refundTransactions",
      "transactions",
      "costsComplete",
    ],
    ...report.dailyBreakdown.map((row) => [
      row.date,
      row.label,
      row.grossSales,
      row.discounts,
      row.netSales,
      row.cogs,
      row.grossProfit,
      row.grossMargin,
      row.vatCollected,
      row.refunds,
      row.refundTransactions,
      row.transactions,
      row.costsComplete,
    ]),
    [],
    ["SALES RETURNS"],
    [
      "returnNumber",
      "invoiceNumber",
      "saleId",
      "date",
      "customerName",
      "productName",
      "quantity",
      "refundMethod",
      "reason",
      "refundAmount",
      "vatAmount",
    ],
    ...report.returnBreakdown.map((row) => [
      row.returnNumber,
      row.invoiceNumber,
      row.saleId,
      row.date,
      row.customerName,
      row.productName,
      row.quantity,
      row.refundMethod,
      row.reason,
      row.refundAmount,
      row.vatAmount,
    ]),
  ]

  return rows
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n")
}

export async function exportReportWorkbook(report: ReportDataset) {
  const XLSX = await import("xlsx")

  const categoryBreakdown = report.categoryBreakdown ?? []
  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.json_to_sheet([
    { metric: "reportTitle", value: report.title },
    { metric: "periodLabel", value: report.periodLabel },
    { metric: "generatedAt", value: report.generatedAt },
    { metric: "grossSales", value: report.summary.grossSales },
    { metric: "discounts", value: report.summary.discounts },
    { metric: "refunds", value: report.summary.refunds },
    { metric: "netSales", value: report.summary.netSales },
    { metric: "cogs", value: report.summary.cogs },
    { metric: "grossProfit", value: report.summary.grossProfit },
    { metric: "grossMargin", value: report.summary.grossMargin },
    { metric: "vatCollected", value: report.summary.vatCollected },
    { metric: "transactionCount", value: report.summary.transactionCount },
    { metric: "costsUnavailableCount", value: report.summary.costsUnavailableCount },
    { metric: "costsUnavailableMessage", value: report.summary.costsUnavailableMessage },
    { metric: "salesReturnCount", value: report.returnBreakdown.length },
  ])

  const salesRegisterSheet = XLSX.utils.json_to_sheet(report.salesRegister)
  const productSheet = XLSX.utils.json_to_sheet(report.productBreakdown)
  const categorySheet = XLSX.utils.json_to_sheet(categoryBreakdown)
  const dailySheet = XLSX.utils.json_to_sheet(report.dailyBreakdown)
  const returnsSheet = XLSX.utils.json_to_sheet(report.returnBreakdown)

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary")
  XLSX.utils.book_append_sheet(workbook, salesRegisterSheet, "Sales Register")
  XLSX.utils.book_append_sheet(workbook, productSheet, "Product Breakdown")
  XLSX.utils.book_append_sheet(workbook, categorySheet, "Category Breakdown")
  XLSX.utils.book_append_sheet(workbook, dailySheet, "Daily Breakdown")
  XLSX.utils.book_append_sheet(workbook, returnsSheet, "Sales Returns")

  return workbook
}
