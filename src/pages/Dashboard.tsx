import { useMemo } from "react"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useERP } from "../context/ERPContext"

const GREEN = "#2F9E63"
const DARK = "#17221D"
const AMBER = "#D97706"

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export default function Dashboard() {
  const {
    products,
    inventoryLots,
    sales,
    purchases,
  } = useERP()

  const today = startOfDay(new Date())

  const todaySales = useMemo(() => {
    return sales.filter(
      (sale) =>
        startOfDay(new Date(sale.createdAt)).getTime() ===
        today.getTime(),
    )
  }, [sales, today])

  const todaySalesAmount = todaySales.reduce(
    (sum, sale) => sum + sale.total,
    0,
  )

  const totalSales = sales.reduce(
    (sum, sale) => sum + sale.total,
    0,
  )

  const totalPurchases = purchases.reduce(
    (sum, purchase) => sum + purchase.total,
    0,
  )

  const inventoryUnits = inventoryLots.reduce(
    (sum, lot) => sum + lot.quantity,
    0,
  )

  const inventoryValue = inventoryLots.reduce(
    (sum, lot) =>
      sum + lot.quantity * lot.purchasePrice,
    0,
  )

  const lowStockProducts = useMemo(() => {
    return products
      .map((product) => {
        const stock = inventoryLots
          .filter(
            (lot) =>
              lot.productId === product.id,
          )
          .reduce(
            (sum, lot) =>
              sum + lot.quantity,
            0,
          )

        return {
          product,
          stock,
        }
      })
      .filter(
        ({ product, stock }) =>
          stock <= product.minimumStock,
      )
      .sort((a, b) => a.stock - b.stock)
  }, [products, inventoryLots])

  const expiringLots = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(
      cutoff.getDate() + 90,
    )

    return inventoryLots
      .filter((lot) => {
        if (lot.quantity <= 0) {
          return false
        }

        const expiry = new Date(
          `${lot.expiry}T00:00:00`,
        )

        return (
          expiry >= today &&
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
      .map((lot) => ({
        lot,
        product: products.find(
          (product) =>
            product.id === lot.productId,
        ),
      }))
  }, [inventoryLots, products, today])

  const recentSales = useMemo(() => {
    return [...sales]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      )
      .slice(0, 6)
  }, [sales])

  const topProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        units: number
        revenue: number
      }
    >()

    for (const sale of sales) {
      for (const item of sale.items) {
        const existing = map.get(
          item.productId,
        )

        if (existing) {
          existing.units += item.quantity
          existing.revenue += item.total
        } else {
          map.set(item.productId, {
            name: item.name,
            units: item.quantity,
            revenue: item.total,
          })
        }
      }
    }

    return Array.from(map.values())
      .sort(
        (a, b) => b.units - a.units,
      )
      .slice(0, 5)
  }, [sales])

  const paymentMix = useMemo(() => {
    const cash = sales
      .filter(
        (sale) =>
          sale.paymentMethod === "Cash",
      )
      .reduce(
        (sum, sale) =>
          sum + sale.total,
        0,
      )

    const card = sales
      .filter(
        (sale) =>
          sale.paymentMethod === "Card",
      )
      .reduce(
        (sum, sale) =>
          sum + sale.total,
        0,
      )

    const credit = sales
      .filter(
        (sale) =>
          sale.paymentMethod === "Credit",
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
  }, [sales])

  const salesTrend = useMemo(() => {
    const days = 7
    const result: {
      label: string
      sales: number
    }[] = []

    for (
      let index = days - 1;
      index >= 0;
      index -= 1
    ) {
      const date = new Date()
      date.setDate(
        date.getDate() - index,
      )

      const key = startOfDay(
        date,
      ).getTime()

      const amount = sales
        .filter(
          (sale) =>
            startOfDay(
              new Date(
                sale.createdAt,
              ),
            ).getTime() === key,
        )
        .reduce(
          (sum, sale) =>
            sum + sale.total,
          0,
        )

      result.push({
        label: date.toLocaleDateString(
          "en-GB",
          {
            day: "2-digit",
            month: "short",
          },
        ),
        sales: Number(
          amount.toFixed(2),
        ),
      })
    }

    return result
  }, [sales])

  const totalUnitsSold = sales.reduce(
    (sum, sale) =>
      sum +
      sale.items.reduce(
        (itemSum, item) =>
          itemSum + item.quantity,
        0,
      ),
    0,
  )

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-7 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-[#2F9E63]">
              Pharmacy Overview
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Dashboard
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Live business performance from your ERP data.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarClock className="h-4 w-4" />
            {new Date().toLocaleDateString(
              "en-GB",
              {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              },
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Today's Sales
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {money(todaySalesAmount)}
                </p>
              </div>

              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                <CircleDollarSign className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {todaySales.length} transaction
              {todaySales.length === 1
                ? ""
                : "s"} today
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Total Sales
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {money(totalSales)}
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              All recorded transactions
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Inventory Value
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {money(inventoryValue)}
                </p>
              </div>

              <div className="rounded-xl bg-violet-50 p-3 text-violet-700">
                <Boxes className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {inventoryUnits} units in stock
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Low Stock
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {lowStockProducts.length}
                </p>
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Products at or below minimum stock
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.7fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Sales — Last 7 Days
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Daily sales generated through POS.
                </p>
              </div>

              <ArrowUpRight className="h-5 w-5 text-slate-400" />
            </div>

            <div className="mt-5 h-[300px]">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart data={salesTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E5E7EB"
                  />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fill: "#64748B",
                      fontSize: 11,
                    }}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fill: "#64748B",
                      fontSize: 11,
                    }}
                  />

                  <Tooltip
                    formatter={(value) =>
                      money(Number(value))
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
                All recorded sales.
              </p>
            </div>

            <div className="mt-4 h-[250px]">
              {paymentMix.length > 0 ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={paymentMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {paymentMix.map(
                        (_, index) => (
                          <Cell
                            key={index}
                            fill={[
                              GREEN,
                              DARK,
                              AMBER,
                            ][
                              index % 3
                            ]}
                          />
                        ),
                      )}
                    </Pie>

                    <Tooltip
                      formatter={(value) =>
                        money(Number(value))
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-center text-sm text-slate-500">
                  No payment data yet.
                </div>
              )}
            </div>

            {paymentMix.length > 0 && (
              <div className="space-y-2">
                {paymentMix.map(
                  (item, index) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              [
                                GREEN,
                                DARK,
                                AMBER,
                              ][
                                index %
                                  3
                              ],
                          }}
                        />

                        <span className="text-slate-600">
                          {item.name}
                        </span>
                      </div>

                      <span className="font-medium text-slate-900">
                        {money(item.value)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Recent Sales
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Latest transactions recorded in POS.
                </p>
              </div>

              <ShoppingCart className="h-5 w-5 text-slate-400" />
            </div>

            <div className="divide-y divide-slate-100">
              {recentSales.length > 0 ? (
                recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {sale.invoiceNumber}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {sale.customerName} •{" "}
                        {formatDate(
                          sale.createdAt,
                        )}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold text-slate-900">
                        {money(sale.total)}
                      </p>

                      <span
                        className={`mt-1 inline-flex rounded-lg px-2 py-1 text-[10px] font-medium ${
                          sale.status ===
                          "Paid"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {sale.paymentMethod}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center">
                  <ShoppingCart className="mx-auto h-9 w-9 text-slate-300" />

                  <p className="mt-3 font-medium text-slate-700">
                    No sales yet
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Completed POS transactions will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Top Products
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Based on units sold.
                </p>
              </div>

              <Package className="h-5 w-5 text-slate-400" />
            </div>

            <div className="divide-y divide-slate-100">
              {topProducts.length > 0 ? (
                topProducts.map(
                  (product, index) => (
                    <div
                      key={product.name}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                          {index + 1}
                        </span>

                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">
                            {product.name}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {product.units} units sold
                          </p>
                        </div>
                      </div>

                      <p className="shrink-0 text-sm font-semibold text-slate-900">
                        {money(
                          product.revenue,
                        )}
                      </p>
                    </div>
                  ),
                )
              ) : (
                <div className="p-12 text-center">
                  <Package className="mx-auto h-9 w-9 text-slate-300" />

                  <p className="mt-3 font-medium text-slate-700">
                    No product sales yet
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Total Units Sold
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {totalUnitsSold}
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Total Purchases
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {money(totalPurchases)}
                </p>
              </div>

              <div className="rounded-xl bg-violet-50 p-3 text-violet-700">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Expiring in 90 Days
                </p>

                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {expiringLots.length}
                </p>
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                <CalendarClock className="h-5 w-5" />
              </div>
            </div>

            {expiringLots.length > 0 && (
              <div className="mt-3 space-y-2">
                {expiringLots
                  .slice(0, 2)
                  .map(({ lot, product }) => (
                    <div
                      key={lot.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate text-slate-600">
                        {product?.name ??
                          "Unknown product"}
                      </span>

                      <span className="font-medium text-amber-700">
                        {lot.expiry}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
