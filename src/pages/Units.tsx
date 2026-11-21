import { useEffect, useMemo, useState } from "react"
import { Edit3, Plus, Trash2, X, Package, Ruler } from "lucide-react"
import { useERP, type ProductPackaging } from "../context/ERPContext"
import {
  getERPUnits,
  saveERPUnits,
  ERP_UNITS_EVENT,
  type ERPUnitDefinition,
  type ERPUnitCategory,
} from "../lib/erpUnits"

const categories: ERPUnitCategory[] = [
  "Count", "Weight", "Volume", "Length", "Time", "Service", "Other",
]

const emptyUnit = {
  name: "",
  symbol: "",
  category: "Count" as ERPUnitCategory,
  decimalPrecision: "0",
}

const emptyPackage = {
  name: "",
  unit: "",
  conversionFactor: "1",
  barcode: "",
  purchasePrice: "",
  sellingPrice: "",
  purchaseEnabled: true,
  salesEnabled: true,
}

export default function Units() {
  const { products, updateProduct } = useERP()

  const [tab, setTab] = useState<"units" | "packaging">("units")
  const [units, setUnits] = useState<ERPUnitDefinition[]>([])
  const [unitForm, setUnitForm] = useState(emptyUnit)
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [showUnitForm, setShowUnitForm] = useState(false)

  const [productId, setProductId] = useState(products[0]?.id || "")
  const [packageForm, setPackageForm] = useState(emptyPackage)
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null)
  const [showPackageForm, setShowPackageForm] = useState(false)

  const [search, setSearch] = useState("")

  useEffect(() => {
    const refresh = () => {
      setUnits(getERPUnits(products.map((product) => product.unit)))
    }
    refresh()
    window.addEventListener(ERP_UNITS_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(ERP_UNITS_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [products])

  useEffect(() => {
    if (!products.some((product) => product.id === productId)) {
      setProductId(products[0]?.id || "")
    }
  }, [products, productId])

  const currentProduct = products.find((product) => product.id === productId)

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase()
    return units.filter((unit) =>
      !q ||
      unit.name.toLowerCase().includes(q) ||
      unit.symbol.toLowerCase().includes(q) ||
      unit.category.toLowerCase().includes(q),
    )
  }, [units, search])

  function persistUnits(next: ERPUnitDefinition[]) {
    setUnits(next)
    saveERPUnits(next)
  }

  function openAddUnit() {
    setEditingUnitId(null)
    setUnitForm(emptyUnit)
    setShowUnitForm(true)
  }

  function openEditUnit(unit: ERPUnitDefinition) {
    setEditingUnitId(unit.id)
    setUnitForm({
      name: unit.name,
      symbol: unit.symbol,
      category: unit.category,
      decimalPrecision: String(unit.decimalPrecision),
    })
    setShowUnitForm(true)
  }

  function saveUnit() {
    const name = unitForm.name.trim()
    const symbol = unitForm.symbol.trim()

    if (!name || !symbol) {
      window.alert("Unit name and symbol are required.")
      return
    }

    if (
      !Number.isInteger(Number(unitForm.decimalPrecision)) ||
      Number(unitForm.decimalPrecision) < 0 ||
      Number(unitForm.decimalPrecision) > 6
    ) {
      window.alert("Decimal precision must be between 0 and 6.")
      return
    }

    const duplicate = units.some((unit) =>
      unit.id !== editingUnitId &&
      (
        unit.name.toLowerCase() === name.toLowerCase() ||
        unit.symbol.toLowerCase() === symbol.toLowerCase()
      ),
    )

    if (duplicate) {
      window.alert("A unit with this name or symbol already exists.")
      return
    }

    const editing = units.find((unit) => unit.id === editingUnitId)
    const inUse = editing && products.some((product) =>
      product.unit.toLowerCase() === editing.name.toLowerCase() ||
      (product.packagings || []).some(
        (item) => item.unit.toLowerCase() === editing.name.toLowerCase(),
      ),
    )

    if (inUse && editing && editing.name.toLowerCase() !== name.toLowerCase()) {
      window.alert("This unit is already used by products or packaging. Create a new unit instead of renaming it.")
      return
    }

    const record: ERPUnitDefinition = {
      id: editingUnitId || `unit-${Date.now()}`,
      name,
      symbol,
      category: unitForm.category,
      decimalPrecision: Number(unitForm.decimalPrecision),
      active: editing?.active ?? true,
    }

    const next = editingUnitId
      ? units.map((unit) => unit.id === editingUnitId ? record : unit)
      : [...units, record]

    persistUnits(next)
    setShowUnitForm(false)
    setEditingUnitId(null)
    setUnitForm(emptyUnit)
  }

  function toggleUnit(unit: ERPUnitDefinition) {
    const next = units.map((item) =>
      item.id === unit.id ? { ...item, active: !item.active } : item,
    )
    persistUnits(next)
  }

  function openAddPackage() {
    setEditingPackageId(null)
    setPackageForm({
      ...emptyPackage,
      unit: units.find((unit) => unit.active)?.name || currentProduct?.unit || "",
    })
    setShowPackageForm(true)
  }

  function openEditPackage(item: ProductPackaging) {
    setEditingPackageId(item.id)
    setPackageForm({
      name: item.name,
      unit: item.unit,
      conversionFactor: String(item.conversionFactor),
      barcode: item.barcode || "",
      purchasePrice: item.purchasePrice == null ? "" : String(item.purchasePrice),
      sellingPrice: item.sellingPrice == null ? "" : String(item.sellingPrice),
      purchaseEnabled: item.purchaseEnabled,
      salesEnabled: item.salesEnabled,
    })
    setShowPackageForm(true)
  }

  function savePackage() {
    if (!currentProduct) return

    const name = packageForm.name.trim()
    const factor = Number(packageForm.conversionFactor)

    if (!name || !packageForm.unit) {
      window.alert("Package name and unit are required.")
      return
    }

    if (!Number.isFinite(factor) || factor <= 0) {
      window.alert("Conversion factor must be greater than zero.")
      return
    }

    if (!packageForm.purchaseEnabled && !packageForm.salesEnabled) {
      window.alert("Enable purchasing, sales, or both for this package.")
      return
    }

    const barcode = packageForm.barcode.trim()
    if (barcode) {
      const duplicate = products.some((product) => {
        const codes = [
          product.barcode,
          ...(product.alternateBarcodes || []),
          ...(product.packagings || [])
            .filter((item) => item.id !== editingPackageId)
            .map((item) => item.barcode || ""),
        ]
        return codes.some(
          (code) => code && code.trim().toLowerCase() === barcode.toLowerCase(),
        )
      })

      if (duplicate) {
        window.alert("This barcode is already assigned to a product or package.")
        return
      }
    }

    const item: ProductPackaging = {
      id: editingPackageId || `packaging-${Date.now()}`,
      name,
      unit: packageForm.unit,
      conversionFactor: factor,
      barcode: barcode || undefined,
      purchasePrice: packageForm.purchasePrice.trim()
        ? Number(packageForm.purchasePrice) : undefined,
      sellingPrice: packageForm.sellingPrice.trim()
        ? Number(packageForm.sellingPrice) : undefined,
      purchaseEnabled: packageForm.purchaseEnabled,
      salesEnabled: packageForm.salesEnabled,
    }

    if (
      (item.purchasePrice != null && (!Number.isFinite(item.purchasePrice) || item.purchasePrice < 0)) ||
      (item.sellingPrice != null && (!Number.isFinite(item.sellingPrice) || item.sellingPrice < 0))
    ) {
      window.alert("Package prices must be valid non-negative numbers.")
      return
    }

    const existing = currentProduct.packagings || []
    const nextPackages = editingPackageId
      ? existing.map((pkg) => pkg.id === editingPackageId ? item : pkg)
      : [...existing, item]

    updateProduct(currentProduct.id, {
      ...currentProduct,
      packagings: nextPackages,
    })

    setShowPackageForm(false)
    setEditingPackageId(null)
    setPackageForm(emptyPackage)
  }

  function deletePackage(item: ProductPackaging) {
    if (!currentProduct) return
    if (!window.confirm(`Remove packaging "${item.name}" from ${currentProduct.name}?`)) return

    updateProduct(currentProduct.id, {
      ...currentProduct,
      packagings: (currentProduct.packagings || []).filter(
        (pkg) => pkg.id !== item.id,
      ),
    })
  }

  const packageCount = products.reduce(
    (total, product) => total + (product.packagings || []).length,
    0,
  )

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          Units & Packaging
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Manage measurement units and product-specific purchase and sales packages.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Units of Measure" value={units.length} />
        <SummaryCard title="Active Units" value={units.filter((unit) => unit.active).length} />
        <SummaryCard title="Product Packages" value={packageCount} />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setTab("units")}
          className={`px-4 py-3 text-sm font-semibold ${
            tab === "units"
              ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "text-slate-500"
          }`}
        >
          <Ruler className="mr-2 inline" size={16} />
          Units of Measure
        </button>
        <button
          type="button"
          onClick={() => setTab("packaging")}
          className={`px-4 py-3 text-sm font-semibold ${
            tab === "packaging"
              ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "text-slate-500"
          }`}
        >
          <Package className="mr-2 inline" size={16} />
          Product Packaging
        </button>
      </div>

      {tab === "units" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search units..."
              className="h-11 w-full max-w-sm rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={openAddUnit}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Plus size={17} /> Add Unit
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70">
                  <tr>
                    <th className="px-5 py-4">Unit</th>
                    <th className="px-5 py-4">Symbol</th>
                    <th className="px-5 py-4">Category</th>
                    <th className="px-5 py-4">Decimal Precision</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUnits.map((unit) => (
                    <tr key={unit.id}>
                      <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">{unit.name}</td>
                      <td className="px-5 py-4">{unit.symbol}</td>
                      <td className="px-5 py-4">{unit.category}</td>
                      <td className="px-5 py-4">{unit.decimalPrecision}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          unit.active
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}>
                          {unit.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openEditUnit(unit)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Edit unit">
                            <Edit3 size={16} />
                          </button>
                          <button type="button" onClick={() => toggleUnit(unit)} className="rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                            {unit.active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUnits.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No units found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "packaging" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block w-full max-w-md space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Select Product</span>
              <select
                value={productId}
                onChange={(event) => {
                  setProductId(event.target.value)
                  setShowPackageForm(false)
                  setEditingPackageId(null)
                }}
                className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.sku || "No SKU"})</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!currentProduct}
              onClick={openAddPackage}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus size={17} /> Add Packaging
            </button>
          </div>

          {currentProduct && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-semibold text-slate-900 dark:text-white">{currentProduct.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                Base inventory unit: <strong>{currentProduct.unit}</strong>. Stock quantities remain stored in this unit.
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70">
                  <tr>
                    <th className="px-5 py-4">Package</th>
                    <th className="px-5 py-4">Package Unit</th>
                    <th className="px-5 py-4">Conversion to Base Unit</th>
                    <th className="px-5 py-4">Barcode</th>
                    <th className="px-5 py-4">Use</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(currentProduct?.packagings || []).map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">{item.name}</td>
                      <td className="px-5 py-4">{item.unit}</td>
                      <td className="px-5 py-4">1 {item.unit} = {item.conversionFactor} {currentProduct?.unit}</td>
                      <td className="px-5 py-4">{item.barcode || "—"}</td>
                      <td className="px-5 py-4 text-xs">
                        {item.purchaseEnabled && "Purchase"}
                        {item.purchaseEnabled && item.salesEnabled && " / "}
                        {item.salesEnabled && "Sales"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openEditPackage(item)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Edit package"><Edit3 size={16} /></button>
                          <button type="button" onClick={() => deletePackage(item)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30" title="Remove package"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!currentProduct || !currentProduct.packagings?.length) && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">No product packaging configured for this product.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {showPackageForm && currentProduct && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {editingPackageId ? "Edit Packaging" : "Add Product Packaging"}
                </h3>
                <button type="button" onClick={() => setShowPackageForm(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Package Name" value={packageForm.name} onChange={(value) => setPackageForm({ ...packageForm, name: value })} placeholder="e.g. Carton of 12" />
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Package Unit</span>
                  <select value={packageForm.unit} onChange={(event) => setPackageForm({ ...packageForm, unit: event.target.value })} className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950">
                    {units.filter((unit) => unit.active).map((unit) => <option key={unit.id} value={unit.name}>{unit.name} ({unit.symbol})</option>)}
                    {!units.some((unit) => unit.name === packageForm.unit) && packageForm.unit && <option value={packageForm.unit}>{packageForm.unit}</option>}
                  </select>
                </label>
                <InputField label={`Base units per package (${currentProduct.unit})`} value={packageForm.conversionFactor} onChange={(value) => setPackageForm({ ...packageForm, conversionFactor: value })} placeholder="e.g. 12" type="number" />
                <InputField label="Package Barcode (optional)" value={packageForm.barcode} onChange={(value) => setPackageForm({ ...packageForm, barcode: value })} placeholder="Package barcode" />
                <InputField label="Purchase Price (optional)" value={packageForm.purchasePrice} onChange={(value) => setPackageForm({ ...packageForm, purchasePrice: value })} placeholder="0.00" type="number" />
                <InputField label="Selling Price (optional)" value={packageForm.sellingPrice} onChange={(value) => setPackageForm({ ...packageForm, sellingPrice: value })} placeholder="0.00" type="number" />
              </div>

              <div className="mt-4 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={packageForm.purchaseEnabled} onChange={(event) => setPackageForm({ ...packageForm, purchaseEnabled: event.target.checked })} />
                  Available for purchasing
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={packageForm.salesEnabled} onChange={(event) => setPackageForm({ ...packageForm, salesEnabled: event.target.checked })} />
                  Available for sales
                </label>
              </div>

              <p className="mt-4 text-sm text-slate-500">
                Conversion preview: 1 {packageForm.unit || "package"} = {Number(packageForm.conversionFactor) || 0} {currentProduct.unit}
              </p>

              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setShowPackageForm(false)} className="rounded-xl border px-4 py-2.5 text-sm font-medium dark:border-slate-700">Cancel</button>
                <button type="button" onClick={savePackage} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Save Packaging</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showUnitForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingUnitId ? "Edit Unit" : "Add Unit"}
              </h3>
              <button type="button" onClick={() => setShowUnitForm(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <InputField label="Unit Name" value={unitForm.name} onChange={(value) => setUnitForm({ ...unitForm, name: value })} placeholder="e.g. Piece" />
              <InputField label="Symbol" value={unitForm.symbol} onChange={(value) => setUnitForm({ ...unitForm, symbol: value })} placeholder="e.g. pc" />
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Unit Category</span>
                <select value={unitForm.category} onChange={(event) => setUnitForm({ ...unitForm, category: event.target.value as ERPUnitCategory })} className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950">
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <InputField label="Decimal Precision (0–6)" value={unitForm.decimalPrecision} onChange={(value) => setUnitForm({ ...unitForm, decimalPrecision: value })} type="number" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowUnitForm(false)} className="rounded-xl border px-4 py-2.5 text-sm font-medium dark:border-slate-700">Cancel</button>
                <button type="button" onClick={saveUnit} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Save Unit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{value.toLocaleString()}</p>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type={type}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  )
}
