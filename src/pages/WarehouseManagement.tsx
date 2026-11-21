import { useState } from "react"
import type { ReactNode } from "react"
import {
  Edit3,
  MapPin,
  Plus,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react"
import {
  useERP,
  type Warehouse,
  type WarehouseType,
  type StorageLocation,
} from "../context/ERPContext"

const emptyWarehouse = {
  code: "",
  name: "",
  type: "BRANCH" as WarehouseType,
  address: "",
  manager: "",
  phone: "",
}

const emptyLocation = {
  warehouseId: "",
  code: "",
  name: "",
  zone: "",
  rack: "",
  shelf: "",
  bin: "",
  active: true,
}

export default function WarehouseManagement() {
  const {
    warehouses,
    storageLocations,
    inventoryLots,
    createWarehouse,
    updateWarehouse,
    createStorageLocation,
    updateStorageLocation,
  } = useERP()

  const [tab, setTab] = useState<"warehouses" | "locations">("warehouses")
  const [warehouseModal, setWarehouseModal] = useState(false)
  const [locationModal, setLocationModal] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<string | null>(null)
  const [editingLocation, setEditingLocation] = useState<string | null>(null)
  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouse)
  const [locationForm, setLocationForm] = useState({
    ...emptyLocation,
    warehouseId: warehouses.find((item) => item.active)?.id ?? "",
  })
  const [error, setError] = useState("")

  const activeWarehouses = warehouses.filter((item) => item.active)

  const totalStock = inventoryLots.reduce(
    (sum, lot) => sum + lot.quantity,
    0,
  )

  const stockByWarehouse = warehouses.map((warehouse) => {
    const lots = inventoryLots.filter(
      (lot) => lot.warehouseId === warehouse.id,
    )

    return {
      warehouse,
      quantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
      productCount: new Set(
        lots.filter((lot) => lot.quantity > 0).map((lot) => lot.productId),
      ).size,
    }
  })

  function openAddWarehouse() {
    setEditingWarehouse(null)
    setWarehouseForm(emptyWarehouse)
    setError("")
    setWarehouseModal(true)
  }

  function openEditWarehouse(item: Warehouse) {
    setEditingWarehouse(item.id)
    setWarehouseForm({
      code: item.code,
      name: item.name,
      type: item.type,
      address: item.address,
      manager: item.manager,
      phone: item.phone,
    })
    setError("")
    setWarehouseModal(true)
  }

  function saveWarehouse() {
    try {
      if (editingWarehouse) {
        updateWarehouse(editingWarehouse, warehouseForm)
      } else {
        createWarehouse({ ...warehouseForm, active: true })
      }

      setWarehouseModal(false)
      setEditingWarehouse(null)
      setError("")
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not save warehouse.")
    }
  }

  function toggleWarehouse(item: Warehouse) {
    try {
      updateWarehouse(item.id, { active: !item.active })
      setError("")
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not update warehouse.")
    }
  }

  function openAddLocation() {
    setEditingLocation(null)
    setLocationForm({
      ...emptyLocation,
      warehouseId: activeWarehouses[0]?.id ?? "",
    })
    setError("")
    setLocationModal(true)
  }

  function openEditLocation(item: StorageLocation) {
    setEditingLocation(item.id)
    setLocationForm({
      warehouseId: item.warehouseId,
      code: item.code,
      name: item.name,
      zone: item.zone,
      rack: item.rack,
      shelf: item.shelf,
      bin: item.bin,
      active: item.active,
    })
    setError("")
    setLocationModal(true)
  }

  function saveLocation() {
    try {
      if (editingLocation) {
        updateStorageLocation(editingLocation, locationForm)
      } else {
        createStorageLocation(locationForm)
      }

      setLocationModal(false)
      setEditingLocation(null)
      setError("")
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not save location.")
    }
  }

  function toggleLocation(item: StorageLocation) {
    try {
      updateStorageLocation(item.id, { active: !item.active })
      setError("")
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not update location.")
    }
  }

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Warehouses & Locations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage warehouses, storage locations and stock distribution.
          </p>
        </div>

        <button
          type="button"
          onClick={tab === "warehouses" ? openAddWarehouse : openAddLocation}
          disabled={tab === "locations" && activeWarehouses.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Plus size={17} />
          {tab === "warehouses" ? "Add Warehouse" : "Add Location"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard title="Total Warehouses" value={warehouses.length} />
        <SummaryCard title="Active Warehouses" value={activeWarehouses.length} />
        <SummaryCard title="Storage Locations" value={storageLocations.length} />
        <SummaryCard title="Total Base Stock" value={totalStock} />
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <TabButton
          active={tab === "warehouses"}
          onClick={() => setTab("warehouses")}
        >
          <WarehouseIcon size={16} className="mr-2 inline" />
          Warehouses
        </TabButton>

        <TabButton
          active={tab === "locations"}
          onClick={() => setTab("locations")}
        >
          <MapPin size={16} className="mr-2 inline" />
          Storage Locations
        </TabButton>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {tab === "warehouses" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70">
                <tr>
                  <th className="px-5 py-4">Warehouse</th>
                  <th className="px-5 py-4">Code</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Products</th>
                  <th className="px-5 py-4 text-right">Stock</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stockByWarehouse.map(({ warehouse, quantity, productCount }) => (
                  <tr key={warehouse.id}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {warehouse.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {warehouse.manager || warehouse.address || "No additional details"}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-medium">{warehouse.code}</td>
                    <td className="px-5 py-4">{warehouse.type}</td>
                    <td className="px-5 py-4">{productCount}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">
                      {quantity.toLocaleString()}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        warehouse.active
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                        {warehouse.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditWarehouse(warehouse)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Edit warehouse"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleWarehouse(warehouse)}
                          className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {warehouse.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "locations" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/70">
                <tr>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">Code</th>
                  <th className="px-5 py-4">Warehouse</th>
                  <th className="px-5 py-4">Zone / Rack</th>
                  <th className="px-5 py-4">Shelf / Bin</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {storageLocations.map((location) => (
                  <tr key={location.id}>
                    <td className="px-5 py-4 font-semibold text-slate-900 dark:text-white">
                      {location.name}
                    </td>
                    <td className="px-5 py-4">{location.code}</td>
                    <td className="px-5 py-4">
                      {warehouses.find((item) => item.id === location.warehouseId)?.name ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4">
                      {[location.zone, location.rack].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-5 py-4">
                      {[location.shelf, location.bin].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-5 py-4">
                      {location.active ? "Active" : "Inactive"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditLocation(location)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Edit location"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleLocation(location)}
                          className="rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          {location.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {storageLocations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      No storage locations configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {warehouseModal && (
        <Modal
          title={editingWarehouse ? "Edit Warehouse" : "Add Warehouse"}
          onClose={() => setWarehouseModal(false)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Warehouse Name" value={warehouseForm.name} onChange={(value) => setWarehouseForm({ ...warehouseForm, name: value })} />
            <InputField label="Warehouse Code" value={warehouseForm.code} onChange={(value) => setWarehouseForm({ ...warehouseForm, code: value })} />

            <label className="space-y-2">
              <span className="block text-sm font-medium">Warehouse Type</span>
              <select
                value={warehouseForm.type}
                onChange={(event) => setWarehouseForm({ ...warehouseForm, type: event.target.value as WarehouseType })}
                className="h-11 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="MAIN">Main</option>
                <option value="BRANCH">Branch</option>
                <option value="STORE">Store</option>
                <option value="TRANSIT">Transit</option>
              </select>
            </label>

            <InputField label="Manager" value={warehouseForm.manager} onChange={(value) => setWarehouseForm({ ...warehouseForm, manager: value })} />
            <InputField label="Phone" value={warehouseForm.phone} onChange={(value) => setWarehouseForm({ ...warehouseForm, phone: value })} />

            <div className="sm:col-span-2">
              <InputField label="Address" value={warehouseForm.address} onChange={(value) => setWarehouseForm({ ...warehouseForm, address: value })} />
            </div>
          </div>

          <FormActions onCancel={() => setWarehouseModal(false)} onSave={saveWarehouse} />
        </Modal>
      )}

      {locationModal && (
        <Modal
          title={editingLocation ? "Edit Storage Location" : "Add Storage Location"}
          onClose={() => setLocationModal(false)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 sm:col-span-2">
              <span className="block text-sm font-medium">Warehouse</span>
              <select
                value={locationForm.warehouseId}
                onChange={(event) => setLocationForm({ ...locationForm, warehouseId: event.target.value })}
                className="h-11 w-full rounded-xl border px-3 dark:border-slate-700 dark:bg-slate-950"
              >
                {activeWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                ))}
              </select>
            </label>

            <InputField label="Location Name" value={locationForm.name} onChange={(value) => setLocationForm({ ...locationForm, name: value })} />
            <InputField label="Location Code" value={locationForm.code} onChange={(value) => setLocationForm({ ...locationForm, code: value })} />
            <InputField label="Zone" value={locationForm.zone} onChange={(value) => setLocationForm({ ...locationForm, zone: value })} />
            <InputField label="Rack" value={locationForm.rack} onChange={(value) => setLocationForm({ ...locationForm, rack: value })} />
            <InputField label="Shelf" value={locationForm.shelf} onChange={(value) => setLocationForm({ ...locationForm, shelf: value })} />
            <InputField label="Bin" value={locationForm.bin} onChange={(value) => setLocationForm({ ...locationForm, bin: value })} />
          </div>

          <FormActions onCancel={() => setLocationModal(false)} onSave={saveLocation} />
        </Modal>
      )}
    </section>
  )
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-semibold ${
        active
          ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400"
          : "text-slate-500"
      }`}
    >
      {children}
    </button>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-5 p-5">{children}</div>
      </div>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  )
}

function FormActions({
  onCancel,
  onSave,
}: {
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="flex justify-end gap-3 pt-3">
      <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-2.5 text-sm font-medium dark:border-slate-700">
        Cancel
      </button>
      <button type="button" onClick={onSave} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
        Save
      </button>
    </div>
  )
}
