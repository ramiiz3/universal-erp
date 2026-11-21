import { useEffect, useState } from "react"
import { Edit3, Plus, Trash2, X } from "lucide-react"
import { useERP } from "../context/ERPContext"
import {
  getProductCategories,
  saveProductCategories,
  PRODUCT_CATEGORIES_EVENT,
  type ProductCategory,
} from "../lib/productCategories"

export default function Categories() {
  const { products } = useERP()

  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [subcategoriesText, setSubcategoriesText] = useState("")

  useEffect(() => {
    const refresh = () => {
      setCategories(getProductCategories(products))
    }

    refresh()
    window.addEventListener(PRODUCT_CATEGORIES_EVENT, refresh)
    window.addEventListener("storage", refresh)

    return () => {
      window.removeEventListener(PRODUCT_CATEGORIES_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [products])

  const activeCount = categories.filter((item) => item.active).length

  function openAdd() {
    setEditingId(null)
    setName("")
    setSubcategoriesText("")
    setShowForm(true)
  }

  function openEdit(category: ProductCategory) {
    setEditingId(category.id)
    setName(category.name)
    setSubcategoriesText(category.subcategories.join("\n"))
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setName("")
    setSubcategoriesText("")
  }

  function saveCategory() {
    const cleanName = name.trim()

    if (!cleanName) {
      window.alert("Category name is required.")
      return
    }

    const current = categories.find((item) => item.id === editingId)

    const duplicate = categories.some(
      (item) =>
        item.id !== editingId &&
        item.name.toLowerCase() === cleanName.toLowerCase(),
    )

    if (duplicate) {
      window.alert("This category already exists.")
      return
    }

    const subcategories = Array.from(
      new Map(
        subcategoriesText
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => [item.toLowerCase(), item]),
      ).values(),
    )

    if (current) {
      const categoryIsUsed = products.some(
        (product) =>
          product.category.toLowerCase() === current.name.toLowerCase(),
      )

      if (
        categoryIsUsed &&
        current.name.toLowerCase() !== cleanName.toLowerCase()
      ) {
        window.alert(
          "This category is already assigned to products. Reassign those products before renaming it.",
        )
        return
      }

      const removedSubcategoryInUse = products.some(
        (product) =>
          product.category.toLowerCase() === current.name.toLowerCase() &&
          Boolean(product.subcategory) &&
          !subcategories.some(
            (item) =>
              item.toLowerCase() === product.subcategory?.toLowerCase(),
          ),
      )

      if (removedSubcategoryInUse) {
        window.alert(
          "One or more subcategories are assigned to products. Reassign those products before removing them.",
        )
        return
      }
    }

    const next = current
      ? categories.map((item) =>
          item.id === editingId
            ? { ...item, name: cleanName, subcategories }
            : item,
        )
      : [
          ...categories,
          {
            id: `category-${Date.now()}`,
            name: cleanName,
            subcategories,
            active: true,
          },
        ]

    setCategories(next)
    saveProductCategories(next)
    closeForm()
  }

  function toggleStatus(category: ProductCategory) {
    const next = categories.map((item) =>
      item.id === category.id
        ? { ...item, active: !item.active }
        : item,
    )

    setCategories(next)
    saveProductCategories(next)
  }

  function deleteCategory(category: ProductCategory) {
    const assignedProducts = products.filter(
      (product) =>
        product.category.toLowerCase() === category.name.toLowerCase(),
    )

    if (assignedProducts.length > 0) {
      window.alert(
        `Cannot delete this category. ${assignedProducts.length} product(s) are assigned to it.`,
      )
      return
    }

    if (!window.confirm(`Delete category "${category.name}"?`)) return

    const next = categories.filter((item) => item.id !== category.id)
    setCategories(next)
    saveProductCategories(next)
  }

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Categories & Subcategories
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Organise product records using centrally managed categories.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus size={17} />
          Add Category
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Total Categories" value={categories.length} />
        <SummaryCard title="Active Categories" value={activeCount} />
        <SummaryCard
          title="Products Assigned"
          value={products.filter((product) => product.category).length}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70">
              <tr>
                <th className="px-5 py-4">Category</th>
                <th className="px-5 py-4">Subcategories</th>
                <th className="px-5 py-4">Products</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map((category) => {
                const assigned = products.filter(
                  (product) =>
                    product.category.toLowerCase() ===
                    category.name.toLowerCase(),
                ).length

                return (
                  <tr key={category.id}>
                    <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                      {category.name}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {category.subcategories.length
                        ? category.subcategories.join(", ")
                        : "—"}
                    </td>
                    <td className="px-5 py-4 tabular-nums">{assigned}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          category.active
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {category.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(category)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-slate-800"
                          title="Edit category"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(category)}
                          className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {category.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          title="Delete category"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                    No categories created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? "Edit Category" : "Add Category"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Category Name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter category name"
                  className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Subcategories
                </span>
                <textarea
                  value={subcategoriesText}
                  onChange={(event) => setSubcategoriesText(event.target.value)}
                  rows={5}
                  placeholder={"One subcategory per line\nExample:\nTablets\nSyrups\nCapsules"}
                  className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                />
                <span className="text-xs text-slate-500">
                  Enter one per line or separate them with commas.
                </span>
              </label>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-xl border px-4 py-2.5 text-sm font-medium dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveCategory}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Save Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryCard({
  title,
  value,
}: {
  title: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
        {value.toLocaleString()}
      </p>
    </div>
  )
}
