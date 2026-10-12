import { describe, expect, it } from "vitest"
import { expiryWithinWindow, formatExpiryDisplay, parseExpiryDate } from "./expiry"
import { buildReportDataset, exportReportCsv, getDateRange } from "./reporting"

describe("reporting utilities", () => {
  it("includes the end date for custom ranges", () => {
    const period = getDateRange("custom", new Date("2025-03-01T12:00:00Z"), "2025-03-05", "2025-03-10")

    expect(period.start.getTime()).toBe(new Date("2025-03-05T00:00:00").getTime())
    expect(period.end.getTime()).toBe(new Date("2025-03-10T23:59:59.999").getTime())
  })

  it("calculates profit and margin from historical cost snapshots", () => {
    const sales = [
      {
        id: "S-1",
        invoiceNumber: "INV-2025-0001",
        createdAt: "2025-03-03T10:00:00.000Z",
        customerId: null,
        customerName: "Walk-in Customer",
        paymentMethod: "Cash",
        subtotal: 120,
        discount: 10,
        vat: 5,
        total: 115,
        status: "Paid",
        items: [
          {
            id: "I-1",
            productId: "P-1",
            name: "Example Product",
            barcode: "123",
            quantity: 2,
            unitPrice: 60,
            vatRate: 5,
            total: 120,
            costSnapshot: {
              cogs: 40,
              unitCost: 20,
              lotAllocations: [
                { lotId: "L-1", batch: "B1", expiry: "2025-11-01", quantity: 2, unitCost: 20, totalCost: 40 },
              ],
            },
          },
        ],
      },
    ]

    const report = buildReportDataset({ sales, period: getDateRange("custom", new Date("2025-03-01T12:00:00Z"), "2025-03-02", "2025-03-10") })

    expect(report.summary.grossSales).toBe(120)
    expect(report.summary.netSales).toBe(110)
    expect(report.summary.cogs).toBe(40)
    expect(report.summary.grossProfit).toBe(70)
    expect(report.summary.grossMargin).toBeCloseTo(63.64, 2)
  })

  it("flags missing historical cost data as unavailable", () => {
    const sales = [
      {
        id: "S-1",
        invoiceNumber: "INV-2025-0001",
        createdAt: "2025-02-10T10:00:00.000Z",
        customerId: null,
        customerName: "Walk-in Customer",
        paymentMethod: "Cash",
        subtotal: 50,
        discount: 0,
        vat: 2.5,
        total: 52.5,
        status: "Paid",
        items: [
          {
            id: "I-1",
            productId: "P-1",
            name: "Legacy Product",
            barcode: "456",
            quantity: 1,
            unitPrice: 50,
            vatRate: 5,
            total: 50,
          },
        ],
      },
    ]

    const report = buildReportDataset({ sales, period: getDateRange("monthly", new Date("2025-02-15T12:00:00Z")) })

    expect(report.summary.costsUnavailableCount).toBe(1)
    expect(report.summary.costsUnavailableMessage).toContain("unavailable")
    expect(report.summary.grossProfit).toBe(0)
  })

  it("supports month/year expiry values without inventing a day", () => {
    const monthOnly = parseExpiryDate("03/2025")
    const isoDate = parseExpiryDate("2025-03-10")

    expect(monthOnly).not.toBeNull()
    expect(monthOnly?.getFullYear()).toBe(2025)
    expect(monthOnly?.getMonth()).toBe(2)
    expect(formatExpiryDisplay("03/2025")).toContain("2025")
    expect(expiryWithinWindow("03/2025", new Date("2025-01-01T00:00:00Z"), new Date("2025-12-31T00:00:00Z"))).toBe(true)
    expect(isoDate?.getDate()).toBe(10)
  })

  it("returns the correct date ranges for the standard report modes", () => {
    const ref = new Date("2025-05-15T12:00:00Z")

    expect(getDateRange("daily", ref).label).toContain("15")
    expect(getDateRange("weekly", ref).start.getDate()).toBe(9)
    expect(getDateRange("monthly", ref).label).toContain("May")
    expect(getDateRange("yearly", ref).label).toBe("2025")

    const custom = getDateRange("custom", ref, "2025-05-01", "2025-05-31")
    expect(custom.start.getTime()).toBe(new Date("2025-05-01T00:00:00").getTime())
    expect(custom.end.getTime()).toBe(new Date("2025-05-31T23:59:59.999").getTime())
  })

  it("exports report rows to csv with proper quoting", () => {
    const report = {
      title: "Monthly Report",
      periodLabel: "Monthly",
      generatedAt: "2025-03-10T00:00:00.000Z",
      summary: {
        grossSales: 120,
        discounts: 10,
        netSales: 110,
        cogs: 40,
        grossProfit: 70,
        grossMargin: 63.64,
        vatCollected: 5,
        transactionCount: 1,
        refunds: 0,
        costsUnavailableCount: 0,
        costsUnavailableMessage: "",
      },
      productBreakdown: [
        {
          productId: "P-1",
          name: 'Widget "A", Extra',
          category: "Sundries",
          quantitySold: 2,
          grossSales: 120,
          discounts: 10,
          netSales: 110,
          cogs: 40,
          grossProfit: 70,
          grossMargin: 63.64,
          vatCollected: 5,
        },
      ],
      dailyBreakdown: [],
    }

    const csv = exportReportCsv(report)

    expect(csv).toContain('"Widget ""A"", Extra"')
    expect(csv).toContain("grossSales")
  })
})
