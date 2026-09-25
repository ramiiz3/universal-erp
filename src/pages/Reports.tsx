import { useMemo, useState } from "react"
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useERP } from "../context/ERPContext"

type RangeDays = 7 | 30 | 90

const GREEN = "#2F9E63"
const DARK = "#17221D"
const AMBER = "#D97706"
const SLATE = "#64748B"

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export default function Reports() {
  const {
    products,
    inventoryLots,
    sales,
    purchases,
  } = useERP()

  const [range, setRange] =
    useState<RangeDays>(30)

  const now = new Date()

  const rangeStart = useMemo(() => {
    const date = new Date(now)
    date.setDate(date.getDate() - (range - 1))
    return startOfDay(date)
  }, [range])

  const salesInRange = useMemo(() => {
    return sales.filter(
      (sale) =>
        new Date(sale.createdAt).getTime() >=
        rangeStart.getTime(),
    )
  }, [sales, rangeStart])

  const purchasesInRange = useMemo(() => {
    return purchases.filter(
      (purchase) =>
        new Date(purchase.createdAt).getTime() >=
        rangeStart.getTime(),
    )
  }, [purchases, rangeStart])

  const totalSales = salesInRange.reduce(
    (sum, sale) => sum + sale.total,
    0,
  )

  const totalPurchases =
    purchasesInRange.reduce(
      (sum, purchase) =>
        sum + purchase.total,
      0,
    )

  const totalDiscount = salesInRange.reduce(
    (sum, sale) => sum + sale.discount,
    0,
  )

  const totalVat = salesInRange.reduce(
    (sum, sale) => sum + sale.vat,
    0,
  )

  const totalUnitsSold = salesInRange.reduce(
    (sum, sale) =>
      sum +
      sale.items.reduce(
        (itemSum, item) =>
          itemSum + item.quantity,
        0,
      ),
    0,
  )

  const inventoryValue =
    inventoryLots.reduce(
      (sum, lot) =>
        sum +
        lot.quantity *
          lot.purchasePrice,
      0,
    )

  const inventoryUnits =
    inventoryLots.reduce(
      (sum, lot) =>
        sum + lot.quantity,
      0,
    )

  const lowStockProducts =
    products.filter(
      (product) => {
        const stock =
          inventoryLots
            .filter(
              (lot) =>
                lot.productId ===
                product.id,
            )
            .reduce(
              (sum, lot) =>
                sum + lot.quantity,
              0,
            )

        return (
          stock <=
          product.minimumStock
        )
      },
    )

  const expiringLots = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(
      cutoff.getDate() + 90,
    )

    return inventoryLots
      .filter((lot) => {
        if (lot.quantity <= 0) return false

        const expiry = new Date(
          `${lot.expiry}T00:00:00`,
        )

        return (
          expiry >= startOfDay(now) &&
          expiry <= cutoff
        )
      })
      .sort(
        (a, b) =>
          new Date(
            `${a.expiry}T00:00:00`,
          ).getTime() -
          new Date(
            `${b.expiry}T00:00:00`,
          ).getTime(),
      )
  }, [inventoryLots, now])

  const grossProfit = useMemo(() => {
    return salesInRange.reduce(
      (saleSum, sale) => {
        const cost = sale.items.reduce(
          (itemSum, item) => {
            const itemCost =
              item.batchAllocations.reduce(
                (allocationSum, allocation) => {
                  const lot =
                    inventoryLots.find(
                      (candidate) =>
                        candidate.id ===
                        allocation.lotId,
                    )

                  return (
                    allocationSum +
                    allocation.quantity *
                      (lot?.purchasePrice ?? 0)
                  )
                },
                0,
              )

            return (
              itemSum +
              itemCost
            )
          },
          0,
        )

        return (
          saleSum +
          sale.subtotal -
          sale.discount -
          cost
        )
      },
      0,
    )
  }, [salesInRange, inventoryLots])

  const grossMargin =
    salesInRange.length > 0 &&
    totalSales > 0
      ? (grossProfit / totalSales) *
        100
      : 0

  const salesChart = useMemo(() => {
    const data: {
      label: string
      sales: number
      units: number
    }[] = []

    for (
      let index = 0;
      index < range;
      index += 1
    ) {
      const date = new Date(rangeStart)
      date.setDate(
        rangeStart.getDate() + index,
      )

      const key = startOfDay(
        date,
      ).getTime()

      const daySales =
        salesInRange.filter(
          (sale) =>
            startOfDay(
              new Date(
                sale.createdAt,
              ),
            ).getTime() === key,
        )

      data.push({
        label: formatShortDate(date),
        sales: Number(
          daySales
            .reduce(
              (sum, sale) =>
                sum + sale.total,
              0,
            )
            .toFixed(2),
        ),
        units:
          daySales.reduce(
            (sum, sale) =>
              sum +
              sale.items.reduce(
                (itemSum, item) =>
                  itemSum +
                  item.quantity,
                0,
              ),
            0,
          ),
      })
    }

    return data
  }, [range, rangeStart, salesInRange])

  const paymentData = useMemo(() => {
    const cash = salesInRange
      .filter(
        (sale) =>
          sale.paymentMethod === "Cash",
      )
      .reduce(
        (sum, sale) =>
          sum + sale.total,
        0,
      )

    const card = salesInRange
      .filter(
        (sale) =>
          sale.paymentMethod === "Card",
      )
      .reduce(
        (sum, sale) =>
          sum + sale.total,
        0,
      )

    const credit = salesInRange
      .filter(
        (sale) =>
          sale.paymentMethod ===
          "Credit",
      )
      .reduce(
        (sum, sale) =>
          sum + sale.total,
        0,
      )

    return [
      {
        name: "Cash",
        value: Number(
          cash.toFixed(2),
        ),
      },
      {
        name: "Card",
        value: Number(
          card.toFixed(2),
        ),
      },
      {
        name: "Credit",
        value: Number(
          credit.toFixed(2),
        ),
      },
    ].filter(
      (item) => item.value > 0,
    )
  }, [salesInRange])

  const topProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        units: number
        sales: number
      }
    >()

    for (const sale of salesInRange) {
      for (const item of sale.items) {
        const existing =
          map.get(item.productId)

        if (existing) {
          existing.units +=
            item.quantity

          existing.sales +=
            item.total
        } else {
          map.set(item.productId, {
            name: item.name,
            units: item.quantity,
            sales: item.total,
          })
        }
      }
    }

    return Array.from(
      map.values(),
    )
      .sort(
        (a, b) =>
          b.units - a.units,
      )
      .slice(0, 5)
  }, [salesInRange])

  const topProductsChart =
    topProducts.map((item) => ({
      name:
        item.name.length > 16
          ? `${item.name.slice(0, 13)}...`
          : item.name,
      units: item.units,
    }))

  const paymentColors = [
    GREEN,
    DARK,
    AMBER,
  ]

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-slate-700" />

              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Reports
              </h1>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Business performance based on your recorded ERP data.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {([7, 30, 90] as RangeDays[]).map(
              (days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    setRange(days)
                  }
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    range === days
                      ? "bg-[#17221D] text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {days} Days
                </button>
              ),
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Sales
              </p>

              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                <CircleDollarSign className="h-4 w-4" />
              </div>
            </div>

            <p className="mt-3 text-2xl font-semibold text-slate-900">
              {money(totalSales)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {salesInRange.length} transaction
              {salesInRange.length === 1
                ? ""
                : "s"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Gross Profit
              </p>

              <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>

            <p className="mt-3 text-2xl font-semibold text-slate-900">
              {money(grossProfit)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Approx. margin{" "}
              {grossMargin.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Purchases
              </p>

              <div className="rounded-xl bg-violet-50 p-2 text-violet-700">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>

            <p className="mt-3 text-2xl font-semibold text-slate-900">
              {money(totalPurchases)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {purchasesInRange.length} purchase
              {purchasesInRange.length === 1
                ? ""
                : "s"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Inventory Value
              </p>

              <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
                <Boxes className="h-4 w-4" />
              </div>
            </div>

            <p className="mt-3 text-2xl font-semibold text-slate-900">
              {money(inventoryValue)}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {inventoryUnits} units currently in stock
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Sales Trend
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Daily sales for the selected period.
                </p>
              </div>

              <CalendarDays className="h-5 w-5 text-slate-400" />
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={salesChart}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E5E7EB"
                  />

                  <XAxis
                    dataKey="label"
                    tick={{
                      fill: SLATE,
                      fontSize: 11,
                    }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    tick={{
                      fill: SLATE,
                      fontSize: 11,
                    }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <Tooltip
                    formatter={(
                      value,
                    ) =>
                      `AED ${Number(
                        value,
                      ).toFixed(2)}`
                    }
                  />

                  <Bar
                    dataKey="sales"
                    fill={GREEN}
                    radius={[
                      6,
                      6,
                      0,
                      0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="font-semibold text-slate-900">
                Payment Mix
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Sales by payment method.
              </p>
            </div>

            <div className="mt-4 h-[250px]">
              {paymentData.length > 0 ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={paymentData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={88}
                      paddingAngle={3}
                    >
                      {paymentData.map(
                        (_, index) => (
                          <Cell
                            key={`payment-${index}`}
                            fill={
                              paymentColors[
                                index %
                                  paymentColors.length
                              ]
                            }
                          />
                        ),
                      )}
                    </Pie>

                    <Tooltip
                      formatter={(value) =>
                        `AED ${Number(
                          value,
                        ).toFixed(2)}`
                      }
                    />

                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-center text-sm text-slate-500">
                  No payment data yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Top Selling Products
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Based on units sold in the selected period.
                </p>
              </div>

              <Package className="h-5 w-5 text-slate-400" />
            </div>

            {topProducts.length > 0 ? (
              <>
                <div className="h-[250px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={topProductsChart}
                      layout="vertical"
                      margin={{
                        left: 10,
                        right: 10,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#E5E7EB"
                      />

                      <XAxis
                        type="number"
                        tick={{
                          fill: SLATE,
                          fontSize: 11,
                        }}
                        tickLine={false}
                        axisLine={false}
                      />

                      <YAxis
                        type="category"
                        dataKey="name"
                        width={105}
                        tick={{
                          fill: SLATE,
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                      />

                      <Tooltip />

                      <Bar
                        dataKey="units"
                        fill={DARK}
                        radius={[
                          0,
                          6,
                          6,
                          0,
                        ]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 space-y-2">
                  {topProducts.map(
                    (product, index) => (
                      <div
                        key={product.name}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-semibold text-slate-500">
                            {index + 1}
                          </span>

                          <span className="text-sm font-medium text-slate-800">
                            {product.name}
                          </span>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">
                            {product.units} units
                          </p>

                          <p className="text-xs text-slate-500">
                            {money(product.sales)}
                          </p>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-[300px] items-center justify-center rounded-xl bg-slate-50 text-center text-sm text-slate-500">
                No sales data for this period.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Stock Alerts
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Products and batches needing attention.
                </p>
              </div>

              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-red-800">
                    Low / Out of Stock
                  </p>

                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-red-700">
                    {lowStockProducts.length}
                  </span>
                </div>

                {lowStockProducts.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {lowStockProducts
                      .slice(0, 4)
                      .map((product) => {
                        const stock =
                          inventoryLots
                            .filter(
                              (lot) =>
                                lot.productId ===
                                product.id,
                            )
                            .reduce(
                              (
                                sum,
                                lot,
                              ) =>
                                sum +
                                lot.quantity,
                              0,
                            )

                        return (
                          <div
                            key={product.id}
                            className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2"
                          >
                            <span className="text-sm text-slate-700">
                              {product.name}
                            </span>

                            <span className="text-xs font-semibold text-red-700">
                              {stock} / min{" "}
                              {product.minimumStock}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-red-700">
                    No low-stock products.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-800">
                    Expiring Within 90 Days
                  </p>

                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-amber-700">
                    {expiringLots.length}
                  </span>
                </div>

                {expiringLots.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {expiringLots
                      .slice(0, 4)
                      .map((lot) => {
                        const product =
                          products.find(
                            (item) =>
                              item.id ===
                              lot.productId,
                          )

                        return (
                          <div
                            key={lot.id}
                            className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm text-slate-700">
                                {product?.name ??
                                  "Unknown Product"}
                              </p>

                              <p className="text-[11px] text-slate-500">
                                Batch{" "}
                                {lot.batch}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-xs font-semibold text-amber-700">
                                {lot.quantity} units
                              </p>

                              <p className="text-[11px] text-slate-500">
                                Exp{" "}
                                {lot.expiry}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">
                    No batches expiring within 90 days.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Units Sold
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {totalUnitsSold}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Discounts Given
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {money(totalDiscount)}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                VAT Collected
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {money(totalVat)}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Low Stock Products
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {lowStockProducts.length}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
