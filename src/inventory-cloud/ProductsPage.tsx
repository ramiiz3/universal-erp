import { useMemo, useRef, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"
import { Download, FileSpreadsheet, Search, Upload, X } from "lucide-react"
import * as XLSX from "xlsx"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { createSubmissionLock, type ProductInput } from "./domain"
import { useCloudInventory, type CloudProduct } from "./CloudInventoryContext"
import { saveProductWorkflow, setProductArchiveWorkflow } from "./workflows"
import { previewCloudCatalogImport, type CloudCatalogImportIssue, type CloudCatalogImportRow } from "./catalogImport"

const EMPTY_PRODUCT: ProductInput = {
  name: "",
  sku: "",
  barcode: "",
  description: "",
  category: "",
  manufacturer: "",
  unit: "each",
  purchasePrice: "0",
  sellingPrice: "0",
  minimumStock: "0",
  vatRate: "0",
}

const PRODUCT_FIELDS: { key: keyof ProductInput; label: string; type?: string }[] = [
  { key: "name", label: "Product name" },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "category", label: "Category" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "unit", label: "Unit of measurement" },
  { key: "purchasePrice", label: "Purchase cost", type: "number" },
  { key: "sellingPrice", label: "Default selling price", type: "number" },
  { key: "minimumStock", label: "Low-stock threshold", type: "number" },
  { key: "vatRate", label: "VAT rate (%)", type: "number" },
]

function formFor(product?: CloudProduct): ProductInput {
  if (!product) return EMPTY_PRODUCT
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    category: product.category,
    manufacturer: product.manufacturer ?? "",
    unit: product.unit,
    purchasePrice: String(product.purchase_price),
    sellingPrice: String(product.selling_price),
    minimumStock: String(product.minimum_stock),
    vatRate: String(product.vat_rate),
  }
}

export default function ProductsPage() {
  const { activeCompany, memberships, user } = useAuth()
  const { companyId, products, warehouses, lots, loading, error, refresh } = useCloudInventory()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState("active")
  const [warehouseId, setWarehouseId] = useState("")
  const [editing, setEditing] = useState<CloudProduct | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [details, setDetails] = useState<CloudProduct | null>(null)
  const [form, setForm] = useState<ProductInput>(EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)
  const [pageError, setPageError] = useState("")
  const [message, setMessage] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [importFileName, setImportFileName] = useState("")
  const [importRows, setImportRows] = useState<CloudCatalogImportRow[]>([])
  const [importIssues, setImportIssues] = useState<CloudCatalogImportIssue[]>([])
  const [importDuplicates, setImportDuplicates] = useState<CloudCatalogImportIssue[]>([])
  const [importWarehouseId, setImportWarehouseId] = useState("")
  const [importRequestId, setImportRequestId] = useState("")
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState("")
  const [importResult, setImportResult] = useState<{
    rowsImported: number
    createdProducts: number
    matchedProducts: number
    createdLots: number
    updatedLots: number
    openingStockQuantity: number
  } | null>(null)
  const submitLock = useRef(createSubmissionLock())
  const canManageProducts = memberships.some((membership) =>
    membership.companyId === companyId &&
    membership.branchId === null &&
    ["owner", "admin", "manager", "inventory_manager"].includes(membership.roleKey),
  )

  const categories = useMemo(() =>
    [...new Set(products.map((product) => product.category.trim()).filter(Boolean))].sort(),
  [products])
  const visibleProducts = useMemo(() => {
    const text = query.trim().toLocaleLowerCase()
    return products.filter((product) => {
      if (status === "active" && !product.is_active) return false
      if (status === "archived" && product.is_active) return false
      if (category && product.category !== category) return false
      if (warehouseId && !lots.some((lot) => lot.product_id === product.id && lot.warehouse_id === warehouseId)) return false
      return !text || [product.name, product.sku, product.barcode]
        .some((value) => value.toLocaleLowerCase().includes(text))
    })
  }, [products, lots, query, category, status, warehouseId])

  function openImport() {
    setShowImport(true)
    setImportFileName("")
    setImportRows([])
    setImportIssues([])
    setImportDuplicates([])
    setImportError("")
    setImportResult(null)
    setImportWarehouseId(warehouses.find((warehouse) => warehouse.is_default)?.id ?? warehouses[0]?.id ?? "")
    setImportRequestId(globalThis.crypto.randomUUID())
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setImportError("")
    setImportResult(null)
    setImportRows([])
    setImportIssues([])
    setImportDuplicates([])
    setImportFileName(file.name)
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Import file must be 10 MB or smaller.")
      }
      const isCsv = file.name.toLowerCase().endsWith(".csv")
      if (!isCsv && !/\.(xls|xlsx)$/i.test(file.name)) {
        throw new Error("Choose an .xls, .xlsx or .csv file.")
      }
      const source = isCsv ? await file.text() : await file.arrayBuffer()
      const workbook = XLSX.read(source, {
        type: isCsv ? "string" : "array",
        raw: isCsv,
        cellDates: true,
      })
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) throw new Error("The selected workbook has no worksheets.")
      const rows = XLSX.utils.sheet_to_json<unknown[]>(
        workbook.Sheets[firstSheet],
        { header: 1, raw: false, defval: "", blankrows: false },
      )
      const preview = previewCloudCatalogImport(rows)
      setImportRows(preview.rows)
      setImportIssues(preview.issues)
      setImportDuplicates(preview.duplicateRows)
      setImportRequestId(globalThis.crypto.randomUUID())
      if (preview.rows.length === 0 && preview.issues.length === 0) {
        setImportError("No product rows were found in the first worksheet.")
      }
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function downloadImportTemplate() {
    const rows = [[
      "Product Name", "SKU", "Barcode", "Category", "Manufacturer", "Description",
      "Unit", "Purchase Price", "Selling Price", "Minimum Stock", "VAT Rate",
      "Batch", "Expiry Date", "Stock Quantity", "Lot Purchase Price", "Lot Selling Price",
    ]]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Products")
    XLSX.writeFile(workbook, "universal-erp-product-import-template.xlsx")
  }

  async function confirmImport() {
    const client = supabase
    if (!client || !activeCompany || !user) return
    setImportError("")
    setImportResult(null)
    if (importIssues.length > 0) {
      setImportError("Fix every invalid row in the spreadsheet, then upload the corrected file.")
      return
    }
    if (!importRows.length) {
      setImportError("Choose a spreadsheet containing at least one valid product row.")
      return
    }
    const stockRows = importRows.filter((row) => row.stockQuantity > 0).length
    if (stockRows > 0 && !importWarehouseId) {
      setImportError("Opening stock is included. Create a warehouse first, then select it here before importing.")
      return
    }

    setImporting(true)
    try {
      const { data, error: rpcError } = await client.rpc("import_company_catalog", {
        p_company_id: activeCompany.companyId,
        p_warehouse_id: stockRows > 0 ? importWarehouseId : null,
        p_rows: importRows.map((row) => ({
          name: row.name,
          sku: row.sku,
          barcode: row.barcode,
          category: row.category,
          manufacturer: row.manufacturer,
          description: row.description,
          unit: row.unit,
          purchasePrice: row.purchasePrice,
          sellingPrice: row.sellingPrice,
          minimumStock: row.minimumStock,
          vatRate: row.vatRate,
          batch: row.batch,
          expiry: row.expiry,
          stockQuantity: row.stockQuantity,
          lotPurchasePrice: row.lotPurchasePrice,
          lotSellingPrice: row.lotSellingPrice,
        })),
        p_request_id: importRequestId,
      })
      if (rpcError) throw rpcError
      setImportResult(data as typeof importResult)
      await refresh()
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setImporting(false)
    }
  }

  function startCreate() {
    setEditing(null)
    setForm(EMPTY_PRODUCT)
    setPageError("")
    setShowForm(true)
  }

  function startEdit(product: CloudProduct) {
    setEditing(product)
    setForm(formFor(product))
    setPageError("")
    setShowForm(true)
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = supabase
    if (!client || !activeCompany || !user) return
    setPageError("")
    setMessage("")
    setSaving(true)
    try {
      await submitLock.current(async () => {
        await saveProductWorkflow({
          insert: async (row) => {
            const { error: insertError } = await client.from("products").insert(row)
            if (insertError) throw insertError
          },
          update: async (productId, targetCompanyId, values) => {
            const { error: updateError } = await client.from("products")
              .update(values)
              .eq("company_id", targetCompanyId)
              .eq("id", productId)
            if (updateError) throw updateError
          },
          setActive: async (productId, targetCompanyId, isActive) => {
            const { error: updateError } = await client.from("products")
              .update({ is_active: isActive })
              .eq("company_id", targetCompanyId)
              .eq("id", productId)
            if (updateError) throw updateError
          },
        }, activeCompany.companyId, user.id, form, editing?.id)
        setShowForm(false)
        setMessage(editing ? "Product updated." : "Product created.")
        await refresh()
      })
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  async function setProductActive(product: CloudProduct, isActive: boolean) {
    const client = supabase
    if (!client || !activeCompany) return
    setPageError("")
    setMessage("")
    setSaving(true)
    try {
      await submitLock.current(async () => {
        await setProductArchiveWorkflow({
          setActive: async (productId, targetCompanyId, active) => {
            const { error: updateError } = await client.from("products")
              .update({ is_active: active })
              .eq("company_id", targetCompanyId)
              .eq("id", productId)
            if (updateError) throw updateError
          },
        }, activeCompany.companyId, product.id, isActive)
        setMessage(isActive ? "Product reactivated." : "Product archived. Stock history is retained.")
        if (details?.id === product.id) setDetails({ ...product, is_active: isActive })
        await refresh()
      })
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{activeCompany?.companyName} · company-scoped cloud catalog</p>
        </div>
        {canManageProducts && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openImport} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><Upload className="h-4 w-4" /> Import Excel / CSV</button>
          <button type="button" onClick={startCreate} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Create product</button>
        </div>}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative sm:col-span-2">
          <span className="sr-only">Search products</span>
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU, barcode" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <label>
          <span className="sr-only">Filter category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter product status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="active">Active products</option>
            <option value="archived">Archived products</option>
            <option value="all">All products</option>
          </select>
        </label>
        <label className="sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Filter products by warehouse</span>
          <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <option value="">All warehouses</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {pageError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading ? <p className="rounded-xl border bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">Loading company products…</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              <tr><th className="p-3">Product</th><th className="p-3">SKU / Barcode</th><th className="p-3">Category</th><th className="p-3">Default price</th><th className="p-3">Stock</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => {
                const stock = lots.filter((lot) => lot.product_id === product.id && (!warehouseId || lot.warehouse_id === warehouseId)).reduce((sum, lot) => sum + Number(lot.quantity), 0)
                return (
                  <tr key={product.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-3"><button type="button" onClick={() => setDetails(product)} className="text-left font-medium text-emerald-800 hover:underline dark:text-emerald-300">{product.name}</button><div className="text-xs text-slate-500">{product.manufacturer || product.unit}</div></td>
                    <td className="p-3">{product.sku || "—"}<div className="text-xs text-slate-500">{product.barcode || "—"}</div></td>
                    <td className="p-3">{product.category || "Uncategorized"}</td>
                    <td className="p-3">{Number(product.selling_price).toFixed(2)} {activeCompany?.currency}</td>
                    <td className="p-3">{stock} {product.unit}</td>
                    <td className="p-3">{product.is_active ? "Active" : "Archived"}</td>
                    <td className="p-3">
                      {canManageProducts && <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(product)} className="text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-300">Edit</button>
                        <button type="button" disabled={saving} onClick={() => void setProductActive(product, !product.is_active)} className="text-xs font-medium text-rose-700 hover:underline disabled:opacity-50">{product.is_active ? "Archive" : "Reactivate"}</button>
                      </div>}
                    </td>
                  </tr>
                )
              })}
              {!visibleProducts.length && <tr><td colSpan={7} className="p-8 text-center text-sm text-slate-500">No products match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/50 p-4">
          <section className="my-auto max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Import company products and opening stock</h2>
                <p className="mt-1 text-sm text-slate-500">Upload Excel or CSV. Existing products are matched by barcode, SKU or name and are not overwritten.</p>
              </div>
              <button type="button" onClick={() => setShowImport(false)} aria-label="Close import" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                <span><span className="block">Choose Excel or CSV file</span><span className="text-xs font-normal text-slate-500">{importFileName || "Supports .xls, .xlsx and .csv · first worksheet is read"}</span></span>
                <input type="file" accept=".xls,.xlsx,.csv" className="sr-only" onChange={(event) => void handleImportFile(event)} />
              </label>
              <button type="button" onClick={downloadImportTemplate} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700"><Download className="h-4 w-4" /> Download template</button>
            </div>

            {importRows.length > 0 && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Valid rows</p><p className="text-xl font-semibold">{importRows.length}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Distinct products</p><p className="text-xl font-semibold">{new Set(importRows.map((row) => row.productKey)).size}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Opening stock lots</p><p className="text-xl font-semibold">{importRows.filter((row) => row.stockQuantity > 0).length}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">Total opening quantity</p><p className="text-xl font-semibold">{importRows.reduce((total, row) => total + row.stockQuantity, 0)}</p></div>
                </div>
                {importRows.some((row) => row.stockQuantity > 0) && (
                  <label className="mt-4 block max-w-xl text-sm font-medium">Import opening stock into warehouse
                    <select value={importWarehouseId} onChange={(event) => setImportWarehouseId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
                      <option value="">Select warehouse</option>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                    </select>
                    {!warehouses.length && <span className="mt-1 block text-xs font-normal text-amber-700">No warehouse exists yet. Create one in Warehouses before importing stock. You can still import products without stock.</span>}
                  </label>
                )}
                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800"><tr>
                      <th className="p-2">Row</th><th className="p-2">Product</th><th className="p-2">SKU / Barcode</th><th className="p-2">Category</th><th className="p-2">Unit</th><th className="p-2">Purchase</th><th className="p-2">Selling</th><th className="p-2">Batch / Expiry</th><th className="p-2">Opening qty</th>
                    </tr></thead>
                    <tbody>{importRows.slice(0, 20).map((row) => <tr key={row.rowNumber} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-2">{row.rowNumber}</td><td className="p-2 font-medium">{row.name}</td><td className="p-2">{row.sku || "—"} / {row.barcode || "—"}</td><td className="p-2">{row.category || "—"}</td><td className="p-2">{row.unit}</td><td className="p-2">{row.purchasePrice}</td><td className="p-2">{row.sellingPrice}</td><td className="p-2">{row.batch || "—"} / {row.expiry || "—"}</td><td className="p-2">{row.stockQuantity}</td>
                    </tr>)}</tbody>
                  </table>
                  {importRows.length > 20 && <p className="p-2 text-center text-xs text-slate-500">Showing first 20 of {importRows.length} valid rows.</p>}
                </div>
              </>
            )}

            {(importIssues.length > 0 || importDuplicates.length > 0) && (
              <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                {importIssues.map((issue) => <p key={`invalid-${issue.rowNumber}`}>Row {issue.rowNumber}: {issue.message}</p>)}
                {importDuplicates.map((issue) => <p key={`duplicate-${issue.rowNumber}`}>Row {issue.rowNumber}: {issue.message}</p>)}
                {importIssues.length > 0 && <p className="font-semibold">Correct invalid rows in the source file before importing. Duplicate lot rows are skipped.</p>}
              </div>
            )}
            {importError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{importError}</p>}
            {importResult && (
              <div role="status" className="mt-4 rounded-lg border border-emerald-200 p-3 text-sm dark:border-emerald-900">
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">Import completed successfully.</p>
                <p className="mt-1">Rows: {importResult.rowsImported} · Products created: {importResult.createdProducts} · Existing products matched: {importResult.matchedProducts} · Lots created: {importResult.createdLots} · Existing lots updated: {importResult.updatedLots} · Opening stock: {importResult.openingStockQuantity}</p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setShowImport(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-700">{importResult ? "Done" : "Cancel"}</button>
              {!importResult && <button type="button" disabled={importing || importRows.length === 0 || importIssues.length > 0 || !importRequestId} onClick={() => void confirmImport()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{importing ? "Importing…" : `Import ${importRows.length} rows`}</button>}
            </div>
          </section>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={(event) => void saveProduct(event)} className="my-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-semibold">{editing ? "Edit product" : "Create product"}</h2>
            <p className="mt-1 text-xs text-slate-500">SKU and barcode uniqueness is enforced per company by the database.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PRODUCT_FIELDS.map(({ key, label, type }) => (
                <label key={key} className="text-sm font-medium">
                  {label}
                  <input required={key === "name" || key === "unit"} type={type ?? "text"} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} max={key === "vatRate" ? "100" : undefined} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
              ))}
              <label className="text-sm font-medium sm:col-span-2">Description
                <textarea maxLength={5000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
            </div>
            {pageError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save product"}</button>
            </div>
          </form>
        </div>
      )}

      {details && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null) }}>
          <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-semibold">{details.name}</h2><p className="text-sm text-slate-500">{details.category || "Uncategorized"}</p></div>
              <button type="button" onClick={() => setDetails(null)} className="text-sm text-slate-500">Close</button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <dt className="text-slate-500">SKU</dt><dd>{details.sku || "—"}</dd>
              <dt className="text-slate-500">Barcode</dt><dd>{details.barcode || "—"}</dd>
              <dt className="text-slate-500">Manufacturer</dt><dd>{details.manufacturer || "—"}</dd>
              <dt className="text-slate-500">Unit</dt><dd>{details.unit}</dd>
              <dt className="text-slate-500">Purchase cost</dt><dd>{Number(details.purchase_price).toFixed(2)}</dd>
              <dt className="text-slate-500">Default selling price</dt><dd>{Number(details.selling_price).toFixed(2)}</dd>
              <dt className="text-slate-500">VAT</dt><dd>{Number(details.vat_rate)}%</dd>
              <dt className="text-slate-500">Status</dt><dd>{details.is_active ? "Active" : "Archived"}</dd>
              <dt className="text-slate-500">Description</dt><dd className="whitespace-pre-wrap">{details.description || "—"}</dd>
            </dl>
          </section>
        </div>
      )}
    </section>
  )
}
