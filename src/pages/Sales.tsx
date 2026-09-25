import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CalendarDays,
  Eye,
  FileText,
  Search,
  ShoppingBag,
  X,
} from "lucide-react"
import { useERP, type Sale } from "../context/ERPContext"

export default function Sales() {
  const navigate = useNavigate()
  const { sales, customers } = useERP()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [paymentFilter, setPaymentFilter] = useState("All")
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...sales]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      )
      .filter((sale) => {
        const matchesSearch =
          !query ||
          sale.invoiceNumber.toLowerCase().includes(query) ||
          sale.customerName.toLowerCase().includes(query) ||
          sale.items.some((item) =>
            item.name.toLowerCase().includes(query),
          )

        const matchesStatus =
          statusFilter === "All" || sale.status === statusFilter

        const matchesPayment =
          paymentFilter === "All" ||
          sale.paymentMethod === paymentFilter

        return matchesSearch && matchesStatus && matchesPayment
      })
  }, [sales, search, statusFilter, paymentFilter])

  const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0)
  const paidSales = sales
    .filter((sale) => sale.status === "Paid")
    .reduce((sum, sale) => sum + sale.total, 0)
  const pendingSales = sales
    .filter((sale) => sale.status === "Pending")
    .reduce((sum, sale) => sum + sale.total, 0)

  function getCustomerPhone(sale: Sale) {
    if (!sale.customerId) return "Walk-in Customer"

    const customer = customers.find(
      (item) => item.id === sale.customerId,
    )

    return customer?.phone || "Customer"
  }

  function formatDate(value: string) {
    const date = new Date(value)

    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Sales
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            View completed sales, payment status and invoices.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total Sales</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              AED {totalSales.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {sales.length} transaction{sales.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Paid</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              AED {paidSales.toFixed(2)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Pending Credit</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">
              AED {pendingSales.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice, customer or product..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="All">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Refunded">Refunded</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="All">All Payments</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Credit">Credit</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Invoice
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payment
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Amount
                  </th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">
                        {sale.invoiceNumber}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {sale.items.length} line item
                        {sale.items.length === 1 ? "" : "s"}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-800">
                        {sale.customerName}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {getCustomerPhone(sale)}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatDate(sale.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {sale.paymentMethod}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-900">
                      AED {sale.total.toFixed(2)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
                          sale.status === "Paid"
                            ? "bg-emerald-50 text-emerald-700"
                            : sale.status === "Pending"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {sale.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedSale(sale)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center">
                      <FileText className="mx-auto h-9 w-9 text-slate-300" />
                      <p className="mt-3 font-medium text-slate-700">
                        No sales found
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Completed POS transactions will appear here.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {selectedSale.invoiceNumber}
                </h2>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(selectedSale.createdAt)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-200">
                <div className="divide-y divide-slate-100">
                  {selectedSale.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.quantity} × AED {item.unitPrice.toFixed(2)}
                        </p>

                        {item.batchAllocations.length > 0 && (
                          <p className="mt-1 text-xs text-slate-400">
                            Batch:{" "}
                            {item.batchAllocations
                              .map((allocation) => allocation.batch)
                              .join(", ")}
                          </p>
                        )}
                      </div>

                      <p className="font-semibold text-slate-900">
                        AED {item.total.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {selectedSale.customerName}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Payment</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {selectedSale.paymentMethod}
                  </p>
                </div>
              </div>

              <div className="mt-5 ml-auto max-w-sm space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>AED {selectedSale.subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span>
                    - AED {selectedSale.discount.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>VAT</span>
                  <span>AED {selectedSale.vat.toFixed(2)}</span>
                </div>

                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
                  <span>Total</span>
                  <span>AED {selectedSale.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  const invoice = selectedSale.invoiceNumber
                  setSelectedSale(null)
                  navigate(`/invoices/${invoice}`)
                }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800"
              >
                <FileText className="h-4 w-4" />
                Open Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
