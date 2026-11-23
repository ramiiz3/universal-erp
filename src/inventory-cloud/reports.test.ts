import { describe, expect, it } from "vitest"
import { buildCloudSalesReport, type CloudReportSale } from "./reports"

const sale: CloudReportSale = {
  id: "sale-1",
  invoice_number: "INV-0001",
  branch_id: "branch-1",
  customer_name: "Walk-in",
  subtotal: 100,
  discount_total: 10,
  vat_total: 4.5,
  total: 94.5,
  amount_paid: 60,
  payment_status: "partial",
  currency: "AED",
  created_at: "2026-11-23T09:00:00.000Z",
}

describe("cloud sales reporting", () => {
  it("calculates net sales, VAT, collections, receivables, cost and gross profit", () => {
    const report = buildCloudSalesReport([sale], [{
      sale_id: sale.id,
      product_id: "product-1",
      product_name: "Medicine A",
      sku: "MED-A",
      quantity: 2,
      unit_price: 50,
      unit_cost: 30,
      discount_amount: 10,
      vat_rate: 5,
      vat_amount: 4.5,
      line_total: 94.5,
    }], [
      { sale_id: sale.id, method: "cash", amount: 40 },
      { sale_id: sale.id, method: "card", amount: 20 },
      { sale_id: "unrelated-sale", method: "cash", amount: 900 },
    ])

    expect(report).toMatchObject({
      invoiceCount: 1,
      invoiceTotal: 94.5,
      grossSales: 100,
      discounts: 10,
      vat: 4.5,
      netSales: 90,
      collected: 60,
      outstanding: 34.5,
      costOfGoods: 60,
      grossProfit: 30,
      averageInvoice: 94.5,
      partiallyPaidInvoices: 1,
      paymentsByMethod: { cash: 40, card: 20, bank_transfer: 0, other: 0 },
    })
    expect(report.products).toEqual([{
      productId: "product-1",
      name: "Medicine A",
      sku: "MED-A",
      quantity: 2,
      netSales: 90,
      vat: 4.5,
      cost: 60,
      grossProfit: 30,
    }])
  })

  it("handles an empty period without NaN or fabricated totals", () => {
    expect(buildCloudSalesReport([], [], [])).toMatchObject({
      invoiceCount: 0,
      invoiceTotal: 0,
      grossSales: 0,
      discounts: 0,
      vat: 0,
      netSales: 0,
      collected: 0,
      outstanding: 0,
      costOfGoods: 0,
      grossProfit: 0,
      averageInvoice: 0,
      paymentsByMethod: { cash: 0, card: 0, bank_transfer: 0, other: 0 },
      products: [],
    })
  })

  it("does not mix lines or payments from invoices outside the selected company report", () => {
    const report = buildCloudSalesReport([sale], [{
      sale_id: "other",
      product_id: "product-2",
      product_name: "Other product",
      sku: "OTHER",
      quantity: 100,
      unit_price: 20,
      unit_cost: 1,
      discount_amount: 0,
      vat_rate: 5,
      vat_amount: 100,
      line_total: 2100,
    }], [{ sale_id: "other", method: "card", amount: 2100 }])
    expect(report.costOfGoods).toBe(0)
    expect(report.paymentsByMethod.card).toBe(0)
    expect(report.products).toEqual([])
  })
})
