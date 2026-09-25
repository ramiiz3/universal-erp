import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  Edit3,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { useERP } from "../context/ERPContext"

type Supplier = {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  taxNumber: string
  status: "Active" | "Inactive"
}

type SupplierForm = Omit<Supplier, "id">

const STORAGE_KEY = "universal-erp-suppliers"

const emptyForm: SupplierForm = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  taxNumber: "",
  status: "Active",
}

function loadSuppliers(): Supplier[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) return []

    const parsed = JSON.parse(raw)

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSuppliers(suppliers: Supplier[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(suppliers),
  )
}

function formatCurrency(value: number) {
  return `AED ${value.toFixed(2)}`
}

export default function Suppliers() {
  const { purchases } = useERP()

  const [suppliers, setSuppliers] = useState<Supplier[]>(
    loadSuppliers,
  )

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] =
    useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierForm>(
    emptyForm,
  )
  const [error, setError] = useState("")

  useEffect(() => {
    saveSuppliers(suppliers)
  }, [suppliers])

  const supplierStats = useMemo(() => {
    const map = new Map<
      string,
      {
        purchases: number
        totalPurchased: number
        lastPurchase: string | null
      }
    >()

    for (const supplier of suppliers) {
      map.set(supplier.name.trim().toLowerCase(), {
        purchases: 0,
        totalPurchased: 0,
        lastPurchase: null,
      })
    }

    for (const purchase of purchases) {
      const key = purchase.supplierName
        .trim()
        .toLowerCase()

      const current = map.get(key)

      if (!current) continue

      current.purchases += 1
      current.totalPurchased += purchase.total

      if (
        !current.lastPurchase ||
        new Date(purchase.createdAt).getTime() >
          new Date(current.lastPurchase).getTime()
      ) {
        current.lastPurchase = purchase.createdAt
      }
    }

    return map
  }, [suppliers, purchases])

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...suppliers]
      .sort((a, b) =>
        a.name.localeCompare(b.name),
      )
      .filter((supplier) => {
        const matchesSearch =
          !query ||
          supplier.name.toLowerCase().includes(query) ||
          supplier.contactPerson
            .toLowerCase()
            .includes(query) ||
          supplier.phone
            .toLowerCase()
            .includes(query) ||
          supplier.email
            .toLowerCase()
            .includes(query) ||
          supplier.taxNumber
            .toLowerCase()
            .includes(query)

        const matchesStatus =
          statusFilter === "All" ||
          supplier.status === statusFilter

        return (
          matchesSearch &&
          matchesStatus
        )
      })
  }, [suppliers, search, statusFilter])

  const activeSuppliers = suppliers.filter(
    (supplier) =>
      supplier.status === "Active",
  ).length

  const totalSupplierPurchases =
    purchases.reduce(
      (sum, purchase) =>
        sum + purchase.total,
      0,
    )

  function getStats(supplier: Supplier) {
    return (
      supplierStats.get(
        supplier.name.trim().toLowerCase(),
      ) ?? {
        purchases: 0,
        totalPurchased: 0,
        lastPurchase: null,
      }
    )
  }

  function openAdd() {
    setEditingSupplier(null)
    setForm(emptyForm)
    setError("")
    setShowForm(true)
  }

  function openEdit(supplier: Supplier) {
    setEditingSupplier(supplier)
    setForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      taxNumber: supplier.taxNumber,
      status: supplier.status,
    })
    setError("")
    setShowForm(true)
  }

  function handleSubmit(
    event: React.FormEvent,
  ) {
    event.preventDefault()
    setError("")

    const name = form.name.trim()

    if (!name) {
      setError("Supplier name is required.")
      return
    }

    if (!form.phone.trim()) {
      setError("Phone number is required.")
      return
    }

    const duplicate = suppliers.find(
      (supplier) =>
        supplier.name.trim().toLowerCase() ===
          name.toLowerCase() &&
        supplier.id !== editingSupplier?.id,
    )

    if (duplicate) {
      setError(
        "A supplier with this name already exists.",
      )
      return
    }

    if (editingSupplier) {
      setSuppliers((current) =>
        current.map((supplier) =>
          supplier.id ===
          editingSupplier.id
            ? {
                id: editingSupplier.id,
                ...form,
                name,
                phone: form.phone.trim(),
                email:
                  form.email.trim(),
                contactPerson:
                  form.contactPerson.trim(),
                address:
                  form.address.trim(),
                taxNumber:
                  form.taxNumber.trim(),
              }
            : supplier,
        ),
      )
    } else {
      setSuppliers((current) => [
        ...current,
        {
          id: `SUP-${Date.now()}`,
          ...form,
          name,
          phone: form.phone.trim(),
          email: form.email.trim(),
          contactPerson:
            form.contactPerson.trim(),
          address: form.address.trim(),
          taxNumber:
            form.taxNumber.trim(),
        },
      ])
    }

    setShowForm(false)
    setEditingSupplier(null)
    setForm(emptyForm)
  }

  function handleDelete(
    supplier: Supplier,
  ) {
    const stats = getStats(supplier)

    if (stats.purchases > 0) {
      window.alert(
        "This supplier has purchase history and cannot be deleted. Mark it Inactive instead.",
      )
      return
    }

    const confirmed = window.confirm(
      `Delete ${supplier.name}?`,
    )

    if (!confirmed) return

    setSuppliers((current) =>
      current.filter(
        (item) => item.id !== supplier.id,
      ),
    )
  }

  function formatDate(
    value: string | null,
  ) {
    if (!value) return "No purchases"

    return new Date(value).toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
    )
  }

  function sendEmail(
    supplier: Supplier,
  ) {
    if (!supplier.email) {
      window.alert(
        "This supplier does not have an email address.",
      )
      return
    }

    window.location.href =
      `mailto:${supplier.email}`
  }

  function callSupplier(
    supplier: Supplier,
  ) {
    window.location.href =
      `tel:${supplier.phone}`
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-slate-700" />

              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Suppliers
              </h1>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Manage pharmacy suppliers and purchasing relationships.
            </p>
          </div>

          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Supplier
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Suppliers
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {suppliers.length}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {activeSuppliers} active
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Supplier Purchases
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrency(
                totalSupplierPurchases,
              )}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Across recorded purchases
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Purchase Records
            </p>

            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {purchases.length}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Linked supplier purchases
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search supplier, contact, phone, email or tax number..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="All">
                All Suppliers
              </option>
              <option value="Active">
                Active
              </option>
              <option value="Inactive">
                Inactive
              </option>
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Supplier
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Contact
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Purchases
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Total Purchased
                  </th>

                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Last Purchase
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
                {filteredSuppliers.map(
                  (supplier) => {
                    const stats =
                      getStats(supplier)

                    return (
                      <tr
                        key={supplier.id}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                              <Building2 className="h-5 w-5" />
                            </div>

                            <div>
                              <p className="font-medium text-slate-900">
                                {supplier.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {supplier.taxNumber
                                  ? `Tax No: ${supplier.taxNumber}`
                                  : "No tax number"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-sm text-slate-700">
                            {supplier.contactPerson ||
                              "No contact person"}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {supplier.phone}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-sm font-medium text-slate-700">
                          {stats.purchases}
                        </td>

                        <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                          {formatCurrency(
                            stats.totalPurchased,
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatDate(
                            stats.lastPurchase,
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
                              supplier.status ===
                              "Active"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {supplier.status}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                callSupplier(
                                  supplier,
                                )
                              }
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              title="Call supplier"
                            >
                              <Phone className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                sendEmail(
                                  supplier,
                                )
                              }
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              title="Email supplier"
                            >
                              <Mail className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openEdit(
                                  supplier,
                                )
                              }
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              title="Edit supplier"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDelete(
                                  supplier,
                                )
                              }
                              className="rounded-lg border border-red-100 p-2 text-red-600 hover:bg-red-50"
                              title="Delete supplier"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  },
                )}

                {filteredSuppliers.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-14 text-center"
                    >
                      <Building2 className="mx-auto h-9 w-9 text-slate-300" />

                      <p className="mt-3 font-medium text-slate-700">
                        No suppliers found
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Add your first pharmacy supplier.
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
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {editingSupplier
                    ? "Edit Supplier"
                    : "Add Supplier"}
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Supplier information for purchasing and future supplier management.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowForm(false)
                }
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
            >
              <div className="space-y-4 p-5">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Supplier Name
                  </label>

                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          name: event
                            .target
                            .value,
                        }),
                      )
                    }
                    placeholder="e.g. ABC Healthcare Distribution"
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Contact Person
                    </label>

                    <input
                      value={
                        form.contactPerson
                      }
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            contactPerson:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="Contact name"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Phone
                    </label>

                    <input
                      value={form.phone}
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            phone: event
                              .target
                              .value,
                          }),
                        )
                      }
                      placeholder="+971..."
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Email
                    </label>

                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            email:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="supplier@example.com"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Tax Number
                    </label>

                    <input
                      value={form.taxNumber}
                      onChange={(event) =>
                        setForm(
                          (current) => ({
                            ...current,
                            taxNumber:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="TRN / Tax registration number"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Address
                  </label>

                  <textarea
                    value={form.address}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          address:
                            event.target
                              .value,
                        }),
                      )
                    }
                    rows={3}
                    placeholder="Supplier address"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Status
                  </label>

                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          status:
                            event.target
                              .value as
                              | "Active"
                              | "Inactive",
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="Active">
                      Active
                    </option>
                    <option value="Inactive">
                      Inactive
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowForm(false)
                  }
                  className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {editingSupplier
                    ? "Save Changes"
                    : "Add Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
