import { useMemo, useState } from "react"
import {
  Edit3,
  Eye,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { useERP, type Customer } from "../context/ERPContext"

type CustomerForm = {
  name: string
  phone: string
  email: string
  whatsapp: string
  status: "Active" | "Inactive"
}

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  whatsapp: "",
  status: "Active",
}

function formatCurrency(value: number) {
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

export default function Customers() {
  const {
    customers,
    sales,
    addCustomer,
    updateCustomer,
    deleteCustomer,
  } = useERP()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(
    null,
  )
  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [error, setError] = useState("")

  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      {
        purchases: number
        totalSpent: number
        pending: number
        lastPurchase: string | null
      }
    >()

    for (const customer of customers) {
      map.set(customer.id, {
        purchases: 0,
        totalSpent: 0,
        pending: 0,
        lastPurchase: null,
      })
    }

    for (const sale of sales) {
      if (!sale.customerId) continue

      const current = map.get(sale.customerId)
      if (!current) continue

      current.purchases += 1
      current.totalSpent += sale.total

      if (sale.status === "Pending") {
        current.pending += sale.total
      }

      if (
        !current.lastPurchase ||
        new Date(sale.createdAt).getTime() >
          new Date(current.lastPurchase).getTime()
      ) {
        current.lastPurchase = sale.createdAt
      }
    }

    return map
  }, [customers, sales])

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...customers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((customer) => {
        const matchesSearch =
          !query ||
          customer.name.toLowerCase().includes(query) ||
          customer.phone.toLowerCase().includes(query) ||
          customer.email.toLowerCase().includes(query) ||
          customer.whatsapp.toLowerCase().includes(query)

        const matchesStatus =
          statusFilter === "All" ||
          customer.status === statusFilter

        return matchesSearch && matchesStatus
      })
  }, [customers, search, statusFilter])

  const activeCustomers = customers.filter(
    (customer) => customer.status === "Active",
  ).length

  const totalCustomerSpend = sales
    .filter((sale) => sale.customerId)
    .reduce((sum, sale) => sum + sale.total, 0)

  const pendingCredit = sales
    .filter(
      (sale) =>
        sale.customerId && sale.status === "Pending",
    )
    .reduce((sum, sale) => sum + sale.total, 0)

  function openAdd() {
    setEditingCustomer(null)
    setForm(emptyForm)
    setError("")
    setShowForm(true)
  }

  function openEdit(customer: Customer) {
    setEditingCustomer(customer)
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      whatsapp: customer.whatsapp,
      status: customer.status,
    })
    setError("")
    setShowForm(true)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError("")

    const name = form.name.trim()
    const phone = form.phone.trim()
    const email = form.email.trim()
    const whatsapp = form.whatsapp.trim()

    if (!name) {
      setError("Customer name is required.")
      return
    }

    if (!phone) {
      setError("Phone number is required.")
      return
    }

    const duplicatePhone = customers.find(
      (customer) =>
        customer.phone.trim() === phone &&
        customer.id !== editingCustomer?.id,
    )

    if (duplicatePhone) {
      setError("A customer with this phone number already exists.")
      return
    }

    const duplicateEmail =
      email &&
      customers.find(
        (customer) =>
          customer.email.trim().toLowerCase() ===
            email.toLowerCase() &&
          customer.id !== editingCustomer?.id,
      )

    if (duplicateEmail) {
      setError("A customer with this email already exists.")
      return
    }

    const customerData: Omit<Customer, "id"> = {
      name,
      phone,
      email,
      whatsapp: whatsapp || phone,
      status: form.status,
    }

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, customerData)
    } else {
      addCustomer(customerData)
    }

    setShowForm(false)
    setEditingCustomer(null)
    setForm(emptyForm)
  }

  function handleDelete(customer: Customer) {
    const hasSales = sales.some(
      (sale) => sale.customerId === customer.id,
    )

    if (hasSales) {
      window.alert(
        "This customer has sales history and cannot be deleted. You can mark the customer as Inactive instead.",
      )
      return
    }

    const confirmed = window.confirm(
      `Delete ${customer.name}? This action cannot be undone.`,
    )

    if (!confirmed) return

    deleteCustomer(customer.id)

    if (selectedCustomer?.id === customer.id) {
      setSelectedCustomer(null)
    }
  }

  function getStats(customer: Customer) {
    return (
      customerStats.get(customer.id) ?? {
        purchases: 0,
        totalSpent: 0,
        pending: 0,
        lastPurchase: null,
      }
    )
  }

  function customerSales(customer: Customer) {
    return [...sales]
      .filter((sale) => sale.customerId === customer.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      )
  }

  function emailCustomer(customer: Customer) {
    if (!customer.email) {
      window.alert("This customer does not have an email address.")
      return
    }

    const subject = encodeURIComponent(
      `Message from Zaki Pharmacy`,
    )

    const body = encodeURIComponent(
      `Dear ${customer.name},\n\n`,
    )

    window.location.href = `mailto:${customer.email}?subject=${subject}&body=${body}`
  }

  function whatsappCustomer(customer: Customer) {
    const number = customer.whatsapp || customer.phone

    if (!number) {
      window.alert("This customer does not have a WhatsApp number.")
      return
    }

    const cleanNumber = number.replace(/[^\d]/g, "")

    window.open(
      `https://wa.me/${cleanNumber}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <UserRound className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Customers
              </h1>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Manage customer profiles, purchase history and credit activity.
            </p>
          </div>

          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total Customers</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {customers.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {activeCustomers} active
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Customer Sales
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrency(totalCustomerSpend)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              From recorded POS transactions
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Pending Credit</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">
              {formatCurrency(pendingCredit)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Outstanding customer balances
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer name, phone or email..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="All">All Customers</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Contact
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Purchases
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total Spent
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Credit
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>

                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => {
                  const stats = getStats(customer)

                  return (
                    <tr
                      key={customer.id}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 font-semibold text-emerald-700">
                            {customer.name
                              .split(" ")
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")
                              .toUpperCase()}
                          </div>

                          <div>
                            <p className="font-medium text-slate-900">
                              {customer.name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {stats.lastPurchase
                                ? `Last purchase: ${formatDate(
                                    stats.lastPurchase,
                                  )}`
                                : "No purchases yet"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-sm text-slate-700">
                          {customer.phone}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {customer.email || "No email"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm font-medium text-slate-700">
                        {stats.purchases}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                        {formatCurrency(stats.totalSpent)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`text-sm font-semibold ${
                            stats.pending > 0
                              ? "text-amber-700"
                              : "text-slate-400"
                          }`}
                        >
                          {formatCurrency(stats.pending)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
                            customer.status === "Active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {customer.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(customer)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                            title="View customer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEdit(customer)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                            title="Edit customer"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(customer)}
                            className="rounded-lg border border-red-100 p-2 text-red-600 hover:bg-red-50"
                            title="Delete customer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredCustomers.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-14 text-center"
                    >
                      <UserRound className="mx-auto h-9 w-9 text-slate-300" />

                      <p className="mt-3 font-medium text-slate-700">
                        No customers found
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Add a customer or change your search.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {editingCustomer
                    ? "Edit Customer"
                    : "Add Customer"}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Customer details will be available directly in POS.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4 p-5">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Customer Name
                  </label>

                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Ahmed Khan"
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Phone
                    </label>

                    <input
                      value={form.phone}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      placeholder="+971 50 123 4567"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      WhatsApp
                    </label>

                    <input
                      value={form.whatsapp}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          whatsapp: event.target.value,
                        }))
                      }
                      placeholder="Leave blank to use phone"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Email
                  </label>

                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="customer@example.com"
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Status
                  </label>

                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as
                          | "Active"
                          | "Inactive",
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {editingCustomer
                    ? "Save Changes"
                    : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 font-semibold text-emerald-700">
                  {selectedCustomer.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()}
                </div>

                <div>
                  <h2 className="font-semibold text-slate-900">
                    {selectedCustomer.name}
                  </h2>

                  <p className="text-xs text-slate-500">
                    Customer profile
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  [
                    "Purchases",
                    String(
                      getStats(selectedCustomer).purchases,
                    ),
                  ],
                  [
                    "Total Spent",
                    formatCurrency(
                      getStats(selectedCustomer).totalSpent,
                    ),
                  ],
                  [
                    "Credit Due",
                    formatCurrency(
                      getStats(selectedCustomer).pending,
                    ),
                  ],
                  [
                    "Status",
                    selectedCustomer.status,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl bg-slate-50 p-4"
                  >
                    <p className="text-xs text-slate-500">
                      {label}
                    </p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Phone className="h-4 w-4" />
                    <span className="text-xs font-medium">
                      Phone
                    </span>
                  </div>

                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {selectedCustomer.phone}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Mail className="h-4 w-4" />
                    <span className="text-xs font-medium">
                      Email
                    </span>
                  </div>

                  <p className="mt-2 break-all text-sm font-medium text-slate-900">
                    {selectedCustomer.email || "Not provided"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MessageCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">
                      WhatsApp
                    </span>
                  </div>

                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {selectedCustomer.whatsapp ||
                      selectedCustomer.phone}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => emailCustomer(selectedCustomer)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </button>

                <button
                  type="button"
                  onClick={() =>
                    whatsappCustomer(selectedCustomer)
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null)
                    openEdit(selectedCustomer)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit Customer
                </button>
              </div>

              <div className="mt-7">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Purchase History
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Recorded sales linked to this customer.
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  {customerSales(selectedCustomer).length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      No purchases recorded yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {customerSales(selectedCustomer).map(
                        (sale) => (
                          <div
                            key={sale.id}
                            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="font-medium text-slate-900">
                                {sale.invoiceNumber}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {formatDate(sale.createdAt)} •{" "}
                                {sale.paymentMethod}
                              </p>
                            </div>

                            <div className="text-left sm:text-right">
                              <p className="font-semibold text-slate-900">
                                {formatCurrency(sale.total)}
                              </p>

                              <span
                                className={`mt-1 inline-flex rounded-lg px-2 py-1 text-[11px] font-medium ${
                                  sale.status === "Paid"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : sale.status === "Pending"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-red-50 text-red-700"
                                }`}
                              >
                                {sale.status}
                              </span>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
