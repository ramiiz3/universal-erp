export type CloudReportSale = {
  id: string
  invoice_number: string
  branch_id: string
  customer_name: string
  customer_phone?: string
  subtotal: number
  discount_total: number
  vat_total: number
  total: number
  amount_paid: number
  payment_status: "unpaid" | "partial" | "paid"
  currency: string
  created_at: string
}

export type CloudReportLine = {
  sale_id: string
  product_id: string
  product_name: string
  sku: string
  quantity: number
  unit_price: number
  unit_cost: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  line_total: number
}

export type CloudReportPayment = {
  sale_id: string
  method: "cash" | "card" | "bank_transfer" | "other"
  amount: number
}

export type CloudSalesReport = {
  invoiceCount: number
  grossSales: number
  discounts: number
  vat: number
  netSales: number
  collected: number
  outstanding: number
  costOfGoods: number
  grossProfit: number
  averageInvoice: number
  paidInvoices: number
  partiallyPaidInvoices: number
  unpaidInvoices: number
  paymentsByMethod: Record<CloudReportPayment["method"], number>
  products: Array<{
    productId: string
    name: string
    sku: string
    quantity: number
    netSales: number
    vat: number
    cost: number
    grossProfit: number
  }>
}

const METHODS: CloudReportPayment["method"][] = ["cash", "card", "bank_transfer", "other"]
const number = (value: unknown) => {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

export function buildCloudSalesReport(
  sales: CloudReportSale[],
  lines: CloudReportLine[],
  payments: CloudReportPayment[],
): CloudSalesReport {
  const validSaleIds = new Set(sales.map((sale) => sale.id))
  const validLines = lines.filter((line) => validSaleIds.has(line.sale_id))
  const validPayments = payments.filter((payment) => validSaleIds.has(payment.sale_id))
  const paymentsByMethod = Object.fromEntries(METHODS.map((method) => [method, 0])) as CloudSalesReport["paymentsByMethod"]

  for (const payment of validPayments) {
    paymentsByMethod[payment.method] += number(payment.amount)
  }

  const productMap = new Map<string, CloudSalesReport["products"][number]>()
  let costOfGoods = 0
  for (const line of validLines) {
    const quantity = number(line.quantity)
    const vat = number(line.vat_amount)
    const netSales = number(line.line_total) - vat
    const cost = quantity * number(line.unit_cost)
    const key = line.product_id || line.sku || line.product_name
    const current = productMap.get(key) ?? {
      productId: line.product_id,
      name: line.product_name,
      sku: line.sku,
      quantity: 0,
      netSales: 0,
      vat: 0,
      cost: 0,
      grossProfit: 0,
    }
    current.quantity += quantity
    current.netSales += netSales
    current.vat += vat
    current.cost += cost
    current.grossProfit += netSales - cost
    productMap.set(key, current)
    costOfGoods += cost
  }

  const grossSales = sales.reduce((sum, sale) => sum + number(sale.subtotal), 0)
  const discounts = sales.reduce((sum, sale) => sum + number(sale.discount_total), 0)
  const vat = sales.reduce((sum, sale) => sum + number(sale.vat_total), 0)
  const netSales = sales.reduce((sum, sale) => sum + number(sale.total) - number(sale.vat_total), 0)
  const collected = sales.reduce((sum, sale) => sum + number(sale.amount_paid), 0)
  const outstanding = sales.reduce((sum, sale) => sum + Math.max(0, number(sale.total) - number(sale.amount_paid)), 0)

  return {
    invoiceCount: sales.length,
    grossSales,
    discounts,
    vat,
    netSales,
    collected,
    outstanding,
    costOfGoods,
    grossProfit: netSales - costOfGoods,
    averageInvoice: sales.length ? sales.reduce((sum, sale) => sum + number(sale.total), 0) / sales.length : 0,
    paidInvoices: sales.filter((sale) => sale.payment_status === "paid").length,
    partiallyPaidInvoices: sales.filter((sale) => sale.payment_status === "partial").length,
    unpaidInvoices: sales.filter((sale) => sale.payment_status === "unpaid").length,
    paymentsByMethod,
    products: [...productMap.values()].sort((a, b) => b.netSales - a.netSales),
  }
}
