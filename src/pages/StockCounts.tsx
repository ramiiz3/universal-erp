import { useMemo, useState } from "react"
import { useERP } from "../context/ERPContext"
import { calculateStockCountVariance, type StockCount } from "../lib/stockCounts"

function statusStyle(status: StockCount["status"]) {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
    case "REVIEW":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
    case "POSTED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    case "CANCELLED":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
  }
}

function statusLabel(status: StockCount["status"]) {
  return {
    DRAFT: "Draft",
    REVIEW: "Pending review",
    POSTED: "Posted",
    CANCELLED: "Cancelled",
  }[status]
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}

export default function StockCounts() {
  const {
    stockCounts,
    warehouses,
    storageLocations,
    createStockCount,
    updateStockCountLine,
    submitStockCount,
    postStockCount,
    cancelStockCount,
  } = useERP()

  const activeWarehouses = warehouses.filter((warehouse) => warehouse.active)
  const [selectedCountId, setSelectedCountId] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [newWarehouseId, setNewWarehouseId] = useState(
    () => activeWarehouses.find((warehouse) => warehouse.type === "MAIN")?.id ?? activeWarehouses[0]?.id ?? "",
  )
  const [newLocationId, setNewLocationId] = useState("")
  const [newNotes, setNewNotes] = useState("")

  const sortedCounts = useMemo(
    () => [...stockCounts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [stockCounts],
  )
  const selectedCount =
    sortedCounts.find((count) => count.id === selectedCountId) ?? sortedCounts[0]
  const activeLocations = storageLocations.filter(
    (location) => location.active && location.warehouseId === newWarehouseId,
  )
  const lines = selectedCount?.lines ?? []
  const countedLineCount = lines.filter((line) => line.countedQuantity !== null).length
  const varianceLines = lines.filter((line) => {
    const variance = calculateStockCountVariance(line)
    return variance !== null && variance !== 0
  }).length
  const absoluteVarianceUnits = lines.reduce((total, line) => {
    const variance = calculateStockCountVariance(line)
    return total + (variance === null ? 0 : Math.abs(variance))
  }, 0)

  function handleCreateCount() {
    if (!newWarehouseId) {
      window.alert("Select an active warehouse.")
      return
    }
    try {
      const created = createStockCount({
        warehouseId: newWarehouseId,
        locationId: newLocationId || null,
        notes: newNotes,
      })
      setSelectedCountId(created.id)
      setShowCreate(false)
      setNewLocationId("")
      setNewNotes("")
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  function handleSubmitForReview() {
    if (!selectedCount) return
    try {
      submitStockCount(selectedCount.id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  function handlePostCount() {
    if (!selectedCount) return
    const confirmed = window.confirm(
      `Post ${varianceLines} stock variances (${absoluteVarianceUnits} total units) for ${selectedCount.reference}? This will update inventory and write adjustment entries to the stock ledger.`,
    )
    if (!confirmed) return
    try {
      postStockCount(selectedCount.id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  function handleCancelCount() {
    if (!selectedCount) return
    if (!window.confirm(`Cancel ${selectedCount.reference}? No inventory quantities will be changed.`)) return
    try {
      cancelStockCount(selectedCount.id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Physical Stock Counts</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Count inventory by batch, review differences against book quantities, and post approved adjustments to the stock movement ledger.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={!activeWarehouses.length}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Start stock count
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total count sheets</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{stockCounts.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Draft counts</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{stockCounts.filter((count) => count.status === "DRAFT").length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Awaiting posting</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{stockCounts.filter((count) => count.status === "REVIEW").length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Posted counts</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{stockCounts.filter((count) => count.status === "POSTED").length}</p>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white">Count history</h2>
            <p className="mt-0.5 text-xs text-slate-500">Select a count sheet to review its batches.</p>
          </div>
          <div className="max-h-[650px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {sortedCounts.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">No stock counts created yet.</div>
            ) : sortedCounts.map((count) => (
              <button
                type="button"
                key={count.id}
                onClick={() => setSelectedCountId(count.id)}
                className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/70 ${selectedCount?.id === count.id ? "bg-emerald-50/70 dark:bg-emerald-950/20" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{count.reference}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle(count.status)}`}>{statusLabel(count.status)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{count.warehouseName}{count.locationId ? ` · ${count.locationName}` : " · All locations"}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDate(count.createdAt)} · {count.lines.length} batch lines</p>
              </button>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {!selectedCount ? (
            <div className="p-10 text-center">
              <h2 className="font-semibold text-slate-900 dark:text-white">Start your first stock count</h2>
              <p className="mt-2 text-sm text-slate-500">Choose a warehouse to create a batch-level count sheet. Creating a sheet does not change inventory.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedCount.reference}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(selectedCount.status)}`}>{statusLabel(selectedCount.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{selectedCount.warehouseName} · {selectedCount.locationId ? selectedCount.locationName : "All storage locations"}</p>
                  <p className="mt-1 text-xs text-slate-400">Created {formatDate(selectedCount.createdAt)}{selectedCount.postedAt ? ` · Posted ${formatDate(selectedCount.postedAt)}` : ""}</p>
                  {selectedCount.notes ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Notes: {selectedCount.notes}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedCount.status === "DRAFT" ? (
                    <button type="button" onClick={handleSubmitForReview} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600">Submit for review</button>
                  ) : null}
                  {selectedCount.status === "REVIEW" ? (
                    <button type="button" onClick={handlePostCount} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Post adjustments</button>
                  ) : null}
                  {selectedCount.status === "DRAFT" || selectedCount.status === "REVIEW" ? (
                    <button type="button" onClick={handleCancelCount} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel count</button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-3">
                <div><p className="text-xs text-slate-500">Lines counted</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{countedLineCount} / {lines.length}</p></div>
                <div><p className="text-xs text-slate-500">Lines with variance</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{varianceLines}</p></div>
                <div><p className="text-xs text-slate-500">Absolute variance units</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">{absoluteVarianceUnits}</p></div>
              </div>

              {selectedCount.status === "DRAFT" ? (
                <p className="border-b border-slate-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800 dark:border-slate-800 dark:bg-sky-950/30 dark:text-sky-200">
                  Enter the physical quantity for every batch. Saving counts does not change inventory; posting happens only after review.
                </p>
              ) : null}
              {selectedCount.status === "REVIEW" ? (
                <p className="border-b border-slate-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-slate-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Review the variances before posting. Posting updates the affected lots and creates adjustment entries in Stock Movement Ledger.
                </p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Product / SKU</th>
                      <th className="px-3 py-3 font-semibold">Batch / Expiry</th>
                      <th className="px-3 py-3 text-right font-semibold">Book qty</th>
                      <th className="px-3 py-3 text-right font-semibold">Counted qty</th>
                      <th className="px-3 py-3 text-right font-semibold">Variance</th>
                      <th className="px-4 py-3 font-semibold">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lines.map((line) => {
                      const variance = calculateStockCountVariance(line)
                      return (
                        <tr key={line.id} className="align-middle">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900 dark:text-white">{line.productName}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{line.sku || "No SKU"}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-slate-800 dark:text-slate-200">{line.batch || "—"}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{line.expiry || "No expiry"}</p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{line.systemQuantity} {line.unit}</td>
                          <td className="px-3 py-3 text-right">
                            {selectedCount.status === "DRAFT" ? (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                aria-label={`Counted quantity for ${line.productName}, batch ${line.batch}`}
                                value={line.countedQuantity ?? ""}
                                onChange={(event) => {
                                  const raw = event.target.value
                                  if (raw === "") {
                                    updateStockCountLine(selectedCount.id, line.id, null)
                                    return
                                  }
                                  const value = Number(raw)
                                  if (Number.isInteger(value) && value >= 0) {
                                    updateStockCountLine(selectedCount.id, line.id, value)
                                  }
                                }}
                                className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-right text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              />
                            ) : (
                              <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">{line.countedQuantity ?? "—"} {line.countedQuantity !== null ? line.unit : ""}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {variance === null ? <span className="text-slate-400">—</span> : (
                              <span className={`font-semibold ${variance > 0 ? "text-emerald-700 dark:text-emerald-400" : variance < 0 ? "text-rose-700 dark:text-rose-400" : "text-slate-500"}`}>
                                {variance > 0 ? "+" : ""}{variance} {line.unit}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{line.locationName || "Unassigned"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
                {selectedCount.status === "POSTED" ? "This count has been posted. Inventory changes are recorded in the stock movement ledger." : selectedCount.status === "CANCELLED" ? "This count was cancelled. Inventory quantities were not changed." : "Book quantities are the snapshot taken when this count was created. If inventory changes before posting, the system will block posting and require a fresh count."}
              </div>
            </>
          )}
        </section>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-stock-count-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="new-stock-count-title" className="text-lg font-semibold text-slate-900 dark:text-white">Start physical stock count</h2>
                <p className="mt-1 text-sm text-slate-500">A snapshot of current batch quantities will be created. Stock will not change.</p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">✕</button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Warehouse</span>
                <select value={newWarehouseId} onChange={(event) => { setNewWarehouseId(event.target.value); setNewLocationId("") }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
                  {activeWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Storage location</span>
                <select value={newLocationId} onChange={(event) => setNewLocationId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">All locations in this warehouse</option>
                  {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Count notes (optional)</span>
                <textarea value={newNotes} onChange={(event) => setNewNotes(event.target.value)} rows={3} placeholder="Reason, count team, or other notes" className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
              <button type="button" onClick={handleCreateCount} disabled={!newWarehouseId} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Create count sheet</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
