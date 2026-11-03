import {
  AlertTriangle,
  Barcode,
  Download,
  FileSpreadsheet,
  Package,
  Plus,
  Search,
  ScanLine,
  Upload,
  X,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import {
  useERP,
  type InventoryLot,
  type Product,
} from "../context/ERPContext"
import {
  buildInventoryExportRows,
  detectInventoryHeaderRow,
  detectInventoryColumnMapping,
  INVENTORY_COLUMNS,
  inventoryRowsToCsv,
  previewInventoryImport,
  type InventoryColumnMapping,
  type InventoryImportMode,
  type InventoryImportResult,
} from "../lib/inventoryTransfer"
import {
  expiryWithinWindow,
  formatExpiryDisplay,
  normalizeExpiryValue,
  parseExpiryDate,
} from "../lib/expiry"

function money(value: number) {
  return `AED ${value.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function importMoney(value: number | undefined) {
  if (value === undefined) return "—"
  return money(value)
}

function formatDate(value: string) {
  return formatExpiryDisplay(value)
}

function expiringWithin90Days(
  date: string,
) {
  const expiry = parseExpiryDate(date)
  const today = new Date()

  if (!expiry) {
    return false
  }

  const limit = new Date(today)
  limit.setDate(limit.getDate() + 90)

  return expiryWithinWindow(date, today, limit)
}

type ParsedWorkbook = {
  sheetNames: string[]
  sheets: Record<string, unknown[][]>
}

const EMPTY_SHEET_ROWS: unknown[][] = []
const EMPTY_ROW: unknown[] = []

export default function Inventory() {
  const [search, setSearch] = useState("")
  const [showReceive, setShowReceive] =
    useState(false)

  const [selectedLot, setSelectedLot] =
    useState<InventoryLot | null>(null)

  const [scannerValue, setScannerValue] =
    useState("")

  const [scannedProductId, setScannedProductId] =
    useState<string | null>(null)

  const [batch, setBatch] = useState("")
  const [expiry, setExpiry] = useState("")
  const [quantity, setQuantity] = useState("")
  const [purchasePrice, setPurchasePrice] =
    useState("")
  const [newProductName, setNewProductName] =
    useState("")
  const [newCategory, setNewCategory] =
    useState("")
  const [newSKU, setNewSKU] =
    useState("")
  const [sellingPrice, setSellingPrice] =
    useState("")
  const [vatRate, setVatRate] =
    useState("5")
  const [unit, setUnit] =
    useState("Pack")
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportError, setExportError] = useState("")
  const [importWorkbook, setImportWorkbook] = useState<ParsedWorkbook | null>(null)
  const [selectedSheet, setSelectedSheet] = useState("")
  const [headerRowIndex, setHeaderRowIndex] = useState(0)
  const [columnMapping, setColumnMapping] = useState<InventoryColumnMapping>({})
  const [importMode, setImportMode] = useState<InventoryImportMode>("merge")
  const [importFileName, setImportFileName] = useState("")
  const [importError, setImportError] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<InventoryImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    products,
    inventoryLots,
    receiveStock,
    addProductAndReceive,
    addProduct,
    updateProduct,
    adjustStock,
    getProductStock,
    importInventory,
  } = useERP()

  const [productForm, setProductForm] = useState({
    name: "",
    category: "",
    sku: "",
    barcode: "",
    purchasePrice: "",
    sellingPrice: "",
    minimumStock: "0",
    vatRate: "5",
    unit: "Pack",
    openingQuantity: "0",
    openingBatch: "",
    openingExpiry: "",
    openingPurchasePrice: "",
  })

  const productMap = useMemo(
    () =>
      new Map(
        products.map((product) => [
          product.id,
          product,
        ]),
      ),
    [products],
  )

  // previously we filtered lots for the lot-centric view; Inventory is now product-centric

    const filteredProducts = useMemo(() => {
      const q = search.trim().toLowerCase()

      if (!q) return products

      return products.filter((product) => {
        const matchesProduct =
          product.name.toLowerCase().includes(q) ||
          product.sku.toLowerCase().includes(q) ||
          product.barcode.toLowerCase().includes(q) ||
          product.category.toLowerCase().includes(q)

        const matchesBatch = inventoryLots.some(
          (lot) =>
            lot.productId === product.id &&
            lot.batch.toLowerCase().includes(q),
        )

        return matchesProduct || matchesBatch
      })
    }, [products, inventoryLots, search])

    const [showAdd, setShowAdd] = useState(false)
    const [showEdit, setShowEdit] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [showAdjust, setShowAdjust] = useState(false)
    const [adjustProductId, setAdjustProductId] = useState<string | null>(null)
    const [adjustLotId, setAdjustLotId] = useState<string | null>(null)
    const [adjustQty, setAdjustQty] = useState("")
    const [adjustReason, setAdjustReason] = useState("Stock Count")

    const [showProductLots, setShowProductLots] = useState<string | null>(null)

  const totalUnits = inventoryLots.reduce(
    (sum, lot) =>
      sum + lot.quantity,
    0,
  )

  const inventoryValue = inventoryLots.reduce(
    (sum, lot) =>
      sum +
      lot.quantity *
        lot.purchasePrice,
    0,
  )

  const lowStockProducts = products.filter(
    (product) => {
      const stock =
        getProductStock(product.id)

      return (
        stock > 0 &&
        stock <= product.minimumStock
      )
    },
  )

  const outOfStockProducts =
    products.filter(
      (product) =>
        getProductStock(product.id) === 0,
    )


  const expiringSoon = inventoryLots.filter(
    (lot) =>
      lot.quantity > 0 &&
      expiringWithin90Days(lot.expiry),
  ).length

  const activeSheetRows = importWorkbook?.sheets[selectedSheet] ?? EMPTY_SHEET_ROWS
  const importHeaders = activeSheetRows[headerRowIndex] ?? EMPTY_ROW
  const selectedHeaderDetection = useMemo(
    () => detectInventoryHeaderRow([importHeaders]),
    [importHeaders],
  )
  const importPreview = useMemo(
    () =>
      importWorkbook
        ? previewInventoryImport(
            activeSheetRows.slice(headerRowIndex + 1),
            columnMapping,
            headerRowIndex + 2,
            selectedHeaderDetection?.isZakiStockSummary ?? false,
          )
        : { records: [], invalidRows: [], duplicateRows: [] },
    [activeSheetRows, columnMapping, headerRowIndex, importWorkbook, selectedHeaderDetection],
  )
  const importProductCount = new Set(
    importPreview.records.map((record) => record.productKey),
  ).size
  const importBatchCount = importPreview.records.filter(
    (record) => record.forceNewLot || record.quantity > 0 || record.batch || record.expiry,
  ).length
  const importDataRowCount =
    importPreview.records.length +
    importPreview.invalidRows.length +
    importPreview.duplicateRows.length

  const scannedProduct =
    scannedProductId
      ? products.find(
          (product) =>
            product.id ===
            scannedProductId,
        ) ?? null
      : null

  function resetReceiveForm() {
    setScannerValue("")
    setScannedProductId(null)
    setBatch("")
    setExpiry("")
    setQuantity("")
    setPurchasePrice("")
  }

  function openReceiveStock() {
    resetReceiveForm()
    setShowReceive(true)
  }

  function openImport() {
    setShowImport(true)
    setImportWorkbook(null)
    setSelectedSheet("")
    setHeaderRowIndex(0)
    setColumnMapping({})
    setImportError("")
    setImportResult(null)
    setImportMode("merge")
  }

  async function handleImportFile(file?: File) {
    if (!file) return

    setImportError("")
    setImportResult(null)
    setImportFileName(file.name)
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv")
      if (!isCsv && !/\.(xls|xlsx)$/i.test(file.name)) {
        throw new Error("Choose an .xls, .xlsx or .csv file.")
      }
      const input = isCsv ? await file.text() : await file.arrayBuffer()
      const workbook = XLSX.read(input, {
        type: isCsv ? "string" : "array",
        raw: isCsv,
      })
      if (workbook.SheetNames.length === 0) {
        throw new Error("The selected file does not contain any worksheets.")
      }

      const sheets: Record<string, unknown[][]> = {}
      for (const sheetName of workbook.SheetNames) {
        sheets[sheetName] = XLSX.utils.sheet_to_json<unknown[]>(
          workbook.Sheets[sheetName],
          { header: 1, raw: true, defval: "", blankrows: true },
        )
      }
      const firstSheet = workbook.SheetNames[0]
      const firstRows = sheets[firstSheet] ?? []
      const detectedHeader = detectInventoryHeaderRow(firstRows)
      const headerRowIndex = detectedHeader?.rowIndex ?? 0
      const headers = firstRows[headerRowIndex] ?? []
      setImportWorkbook({ sheetNames: workbook.SheetNames, sheets })
      setSelectedSheet(firstSheet)
      setHeaderRowIndex(headerRowIndex)
      setColumnMapping(detectedHeader?.mapping ?? detectInventoryColumnMapping(headers))
    } catch (error) {
      setImportWorkbook(null)
      setImportError(
        `Could not read ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  function selectImportSheet(sheetName: string) {
    const sheetRows = importWorkbook?.sheets[sheetName] ?? []
    const detectedHeader = detectInventoryHeaderRow(sheetRows)
    setSelectedSheet(sheetName)
    setHeaderRowIndex(detectedHeader?.rowIndex ?? 0)
    setColumnMapping(
      detectedHeader?.mapping ?? detectInventoryColumnMapping(sheetRows[0] ?? []),
    )
  }

  function selectHeaderRow(index: number) {
    setHeaderRowIndex(index)
    const detectedHeader = detectInventoryHeaderRow([activeSheetRows[index] ?? []])
    setColumnMapping(detectedHeader?.mapping ?? detectInventoryColumnMapping(activeSheetRows[index] ?? []))
  }

  function downloadInventory(format: "csv" | "xlsx") {
    setExportError("")
    try {
      const rows = buildInventoryExportRows(products, inventoryLots)
      const filename = `inventory-${new Date().toISOString().slice(0, 10)}`
      if (format === "csv") {
        const blob = new Blob([`\uFEFF${inventoryRowsToCsv(rows)}`], {
          type: "text/csv;charset=utf-8",
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = `${filename}.csv`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      } else {
        const worksheet = XLSX.utils.aoa_to_sheet(rows)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory")
        XLSX.writeFile(workbook, `${filename}.xlsx`)
      }
    } catch (error) {
      setExportError(
        `Could not export inventory: ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
    setShowExport(false)
  }

  async function confirmImport() {
    if (importPreview.invalidRows.length > 0) {
      setImportError("Fix or remove every invalid row before importing.")
      return
    }
    if (importPreview.records.length === 0) {
      setImportError("There are no valid inventory rows to import.")
      return
    }
    const duplicateNotice = importPreview.duplicateRows.length
      ? ` ${importPreview.duplicateRows.length} duplicate row(s) will be skipped.`
      : ""
    const modeLabel = importMode === "merge" ? "Merge" : "Replace Existing Stock"
    if (!window.confirm(
      `${modeLabel} ${importPreview.records.length} inventory row(s) for ${importProductCount} product(s)?${duplicateNotice} A recoverable backup will be created before saving.`,
    )) {
      return
    }

    setImporting(true)
    setImportError("")
    try {
      const result = await importInventory(importPreview.records, importMode)
      setImportResult(result)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setImporting(false)
    }
  }

    function openAddProduct() {
        setEditingProduct(null)
        setProductForm({
          name: "",
          category: "",
          sku: "",
          barcode: "",
          purchasePrice: "",
          sellingPrice: "",
          minimumStock: "0",
          vatRate: "5",
          unit: "Pack",
          openingQuantity: "0",
          openingBatch: "",
          openingExpiry: "",
          openingPurchasePrice: "",
        })
        setShowAdd(true)
    }

    function openEditProduct(product: Product) {
        setEditingProduct(product)
        setProductForm({
          name: product.name,
          category: product.category,
          sku: product.sku,
          barcode: product.barcode,
          purchasePrice: String(product.purchasePrice),
          sellingPrice: String(product.sellingPrice),
          minimumStock: String(product.minimumStock),
          vatRate: String(product.vatRate),
          unit: product.unit,
          openingQuantity: "0",
          openingBatch: "",
          openingExpiry: "",
          openingPurchasePrice: "",
        })
        setShowEdit(true)
    }

    function saveProduct(form: Omit<Product, "id">, opening?: { quantity: number; batch: string; expiry: string; purchasePrice: number } | null) {
      if (editingProduct) {
        updateProduct(editingProduct.id, form)
        setShowEdit(false)
        return
      }

      // create new product, optionally create opening stock
      if (opening && opening.quantity > 0) {
        addProductAndReceive(form, opening.batch, opening.expiry, opening.quantity, opening.purchasePrice)
      } else {
        addProduct(form)
      }

      setShowAdd(false)
    }

    function openAdjust(productId: string) {
      setAdjustProductId(productId)
      setAdjustLotId(null)
      setAdjustQty("")
      setAdjustReason("Stock Count")
      setShowAdjust(true)
    }

    function doAdjust() {
      if (!adjustProductId) return

      const delta = Number(adjustQty)
      if (!Number.isInteger(delta)) {
        window.alert("Enter a whole number quantity.")
        return
      }

      try {
        adjustStock(adjustProductId, adjustLotId, delta, adjustReason)
        window.alert("Stock adjusted.")
        setShowAdjust(false)
      } catch (err: any) {
        window.alert(err?.message ?? String(err))
      }
    }

  function closeReceiveStock() {
    setShowReceive(false)
    resetReceiveForm()
  }

  function handleBarcodeScan(
    value: string,
  ) {
    const barcode = value.trim()

    if (!barcode) {
      return
    }

    const product = products.find(
      (item) =>
        item.barcode === barcode,
    )

    if (!product) {
      // New product flow: keep barcode and prepare new product form
      setScannerValue(barcode)
      setScannedProductId(null)

      setNewProductName("")
      setNewCategory("")
      setNewSKU("")
      setSellingPrice("")
      setVatRate("5")
      setUnit("Pack")
      setPurchasePrice("")

      setBatch("")
      setExpiry("")
      setQuantity("")

      return
    }

    setScannerValue(product.barcode)
    setScannedProductId(product.id)

    setPurchasePrice(String(product.purchasePrice))

    setBatch("")
    setExpiry("")
    setQuantity("")
  }

  function receive() {
    // If existing product flow
    if (scannedProduct) {
      if (!batch.trim()) {
        window.alert(
          "Batch number is required.",
        )
        return
      }

      if (!expiry) {
        window.alert(
          "Expiry date is required.",
        )
        return
      }

      const qty = Number(quantity)

      if (!qty || qty <= 0) {
        window.alert(
          "Enter a valid quantity greater than zero.",
        )
        return
      }

      const cost =
        Number(purchasePrice) ||
        scannedProduct.purchasePrice

      receiveStock(
        scannedProduct.id,
        batch,
        expiry,
        qty,
        cost,
      )

      window.alert(
        `${qty} units received for ${scannedProduct.name}.`,
      )

      closeReceiveStock()

      return
    }

    // New product flow
    const barcode = scannerValue.trim()

    if (!barcode) {
      window.alert("Scan a product first.")
      return
    }

    if (!newProductName.trim()) {
      window.alert("Product name is required.")
      return
    }

    if (!batch.trim()) {
      window.alert("Batch number is required.")
      return
    }

    if (!expiry) {
      window.alert("Expiry date is required.")
      return
    }

    const qty = Number(quantity)

    if (!qty || qty <= 0) {
      window.alert(
        "Enter a valid quantity greater than zero.",
      )
      return
    }

    const pPrice = Number(purchasePrice)
    const sPrice = Number(sellingPrice)

    if (!Number.isFinite(pPrice)) {
      window.alert("Purchase price is required.")
      return
    }

    if (!Number.isFinite(sPrice)) {
      window.alert("Selling price is required.")
      return
    }

    try {
      const result = addProductAndReceive(
        {
          name: newProductName.trim(),
          category: newCategory.trim(),
          sku: newSKU.trim(),
          barcode,
          purchasePrice: pPrice,
          sellingPrice: sPrice,
          minimumStock: 0,
          vatRate: Number(vatRate) || 5,
          unit: unit || "Pack",
        },
        batch,
        expiry,
        qty,
        pPrice,
      )

      window.alert(
        `${qty} units created and received for ${result.product.name}.`,
      )

      closeReceiveStock()
    } catch (err: any) {
      window.alert(err?.message ?? String(err))
    }
    // done
  }

  return (
    <section className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            Inventory
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Track stock, batches, expiry dates and stock levels.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openImport}
            className="flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Upload size={17} />
            Import Inventory
          </button>
          <button
            type="button"
            onClick={() => {
              setExportError("")
              setShowExport(true)
            }}
            className="flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Download size={17} />
            Export Inventory
          </button>
          <button
            type="button"
            onClick={openReceiveStock}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <ScanLine size={17} />
            Receive Stock
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title="Products"
          value={String(
            products.length,
          )}
        />

        <SummaryCard
          title="Total Units"
          value={String(totalUnits)}
        />

        <SummaryCard
          title="Stock Value"
          value={money(inventoryValue)}
        />

        <SummaryCard
          title="Low Stock"
          value={String(
            lowStockProducts.length,
          )}
        />

        <SummaryCard
          title="Expiring Soon"
          value={String(
            expiringSoon,
          )}
        />
      </div>

      {(lowStockProducts.length > 0 ||
        outOfStockProducts.length > 0) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 md:flex-row md:items-center">
          <AlertTriangle
            size={20}
            className="text-amber-600"
          />

          <div>
            <div className="font-semibold">
              Inventory attention required
            </div>

            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {
                lowStockProducts.length
              }{" "}
              low-stock product
              {lowStockProducts.length ===
              1
                ? ""
                : "s"} and{" "}
              {
                outOfStockProducts.length
              }{" "}
              out-of-stock product
              {outOfStockProducts.length ===
              1
                ? ""
                : "s"}.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search by product, SKU, barcode or batch..."
            className="h-11 w-full rounded-xl border bg-white pl-10 pr-4 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between p-4">
          <div className="flex gap-2">
            <button onClick={openReceiveStock} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><ScanLine size={16}/> Receive Stock</button>
            <button onClick={openAddProduct} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"><Plus size={14}/> Add Product</button>
          </div>

          <div className="text-sm text-slate-500">Showing {filteredProducts.length} products</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
              <tr className="text-left">
                <th className="px-5 py-4 font-medium text-slate-500">Product</th>
                <th className="px-5 py-4 font-medium text-slate-500">SKU</th>
                <th className="px-5 py-4 font-medium text-slate-500">Barcode</th>
                <th className="px-5 py-4 font-medium text-slate-500">Category</th>
                <th className="px-5 py-4 font-medium text-slate-500">Purchase Price</th>
                <th className="px-5 py-4 font-medium text-slate-500">Selling Price</th>
                <th className="px-5 py-4 font-medium text-slate-500">Stock</th>
                <th className="px-5 py-4 font-medium text-slate-500">Status</th>
                <th className="px-5 py-4 text-right font-medium text-slate-500">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => {
                const stock = getProductStock(product.id)
                const status = stock === 0 ? "Out of Stock" : stock <= product.minimumStock ? "Low Stock" : "In Stock"

                return (
                  <tr key={product.id} className="border-b last:border-b-0 dark:border-slate-800">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"><Package size={18}/></div>
                        <div>
                          <div className="font-semibold">{product.name}</div>
                          <div className="text-xs text-slate-500">{product.unit}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">{product.sku || product.id}</td>
                    <td className="px-5 py-4 font-mono text-xs">{product.barcode}</td>
                    <td className="px-5 py-4">{product.category}</td>
                    <td className="px-5 py-4">{money(product.purchasePrice)}</td>
                    <td className="px-5 py-4">{money(product.sellingPrice)}</td>
                    <td className="px-5 py-4 font-semibold">{stock}</td>
                    <td className="px-5 py-4">{status}</td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setScannedProductId(product.id); openReceiveStock() }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Receive Stock">Receive</button>
                        <button onClick={() => openAdjust(product.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Adjust Stock">Adjust</button>
                        <button onClick={() => openEditProduct(product)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Edit Product">Edit</button>
                        <button onClick={() => setShowProductLots(product.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="View Lots">Lots</button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-500">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h3 className="text-lg font-semibold">Import Inventory</h3>
                <p className="mt-1 text-sm text-slate-500">Review and validate the spreadsheet before saving.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close import dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                className="hidden"
                onChange={(event) => {
                  void handleImportFile(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <FileSpreadsheet size={17} />
                  Choose Excel or CSV file
                </button>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {importFileName || "No file selected"}
                </span>
                <span className="text-xs text-slate-500">Supports .xls, .xlsx and .csv</span>
              </div>

              {importWorkbook && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {importWorkbook.sheetNames.length > 1 && (
                      <label className="space-y-2">
                        <span className="text-sm font-medium">Worksheet</span>
                        <select
                          value={selectedSheet}
                          onChange={(event) => selectImportSheet(event.target.value)}
                          className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                        >
                          {importWorkbook.sheetNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="space-y-2">
                      <span className="text-sm font-medium">Column headings are on row</span>
                      <select
                        value={headerRowIndex}
                        onChange={(event) => selectHeaderRow(Number(event.target.value))}
                        className="h-10 w-full rounded-lg border bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                      >
                        {activeSheetRows.slice(0, 20).map((row, index) => (
                          <option key={index} value={index}>
                            {index + 1}: {row.map((cell) => String(cell ?? "").trim()).filter(Boolean).slice(0, 4).join(" · ") || "(blank row)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {selectedHeaderDetection && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">
                      Headings detected on row {headerRowIndex + 1}
                      {selectedHeaderDetection.isZakiStockSummary
                        ? " · ZAKI PHARMACY STOCK SUMMARY layout · each source row imports as a separate lot"
                        : " · column positions, including blank spacer columns, are retained"}
                    </p>
                  )}

                  <section className="rounded-xl border p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="font-semibold">Map spreadsheet columns</h4>
                      <p className="text-xs text-slate-500">Product name and stock quantity are required. Unmapped or blank optional fields are left unchanged on existing products.</p>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {INVENTORY_COLUMNS.map(({ key, label }) => (
                        <label key={key} className="space-y-1.5">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
                          <select
                            value={columnMapping[key] == null ? "" : String(columnMapping[key])}
                            onChange={(event) => setColumnMapping((current) => ({
                              ...current,
                              [key]: event.target.value === "" ? null : Number(event.target.value),
                            }))}
                            className="h-9 w-full rounded-lg border bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="">Not mapped</option>
                            {importHeaders.map((header, index) => (
                              <option key={index} value={index}>
                                {String.fromCharCode(65 + index)} · {String(header ?? "").trim() || `Column ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </section>

                  <fieldset className="grid gap-3 md:grid-cols-2">
                    <legend className="mb-2 text-sm font-semibold">Import mode</legend>
                    <label className="flex cursor-pointer gap-3 rounded-xl border p-4 dark:border-slate-700">
                      <input type="radio" name="inventory-import-mode" value="merge" checked={importMode === "merge"} onChange={() => setImportMode("merge")} />
                      <span>
                        <span className="block text-sm font-semibold">Merge</span>
                        <span className="text-xs text-slate-500">Update matching products and add imported quantities to matching lots, except exported lot IDs which update as a snapshot.</span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer gap-3 rounded-xl border p-4 dark:border-slate-700">
                      <input type="radio" name="inventory-import-mode" value="replace" checked={importMode === "replace"} onChange={() => setImportMode("replace")} />
                      <span>
                        <span className="block text-sm font-semibold">Replace Existing Stock</span>
                        <span className="text-xs text-slate-500">Set existing lot quantities to zero, then apply the imported stock. Products, lots, sales and purchase history are retained.</span>
                      </span>
                    </label>
                  </fieldset>

                  <section className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
                    <h4 className="font-semibold">Import preview</h4>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                      <div><span className="text-slate-500">Products</span><div className="font-semibold">{importProductCount}</div></div>
                      <div><span className="text-slate-500">Data rows / separate lots</span><div className="font-semibold">{importDataRowCount} / {importBatchCount}</div></div>
                      <div><span className="text-slate-500">Stock quantity</span><div className="font-semibold">{importPreview.records.reduce((sum, record) => sum + record.quantity, 0)}</div></div>
                      <div><span className="text-slate-500">Invalid / duplicate rows</span><div className="font-semibold">{importPreview.invalidRows.length} / {importPreview.duplicateRows.length}</div></div>
                    </div>
                    {importPreview.records.length > 0 && (
                      <div className="mt-4 max-h-56 overflow-auto rounded-lg border dark:border-slate-700">
                        <table className="w-full min-w-[980px] text-left text-xs">
                          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                            <tr>{["Row", "Product", "Barcode / SKU", "Batch", "Expiry", "Quantity", "COST (Purchase / Unit)", "TOTAL (Purchase Value)", "S PRICE (Selling / Unit)", "TOTAL (Selling Value)"].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
                          </thead>
                          <tbody>
                            {importPreview.records.slice(0, 30).map((record) => (
                              <tr key={record.rowNumber} className="border-t dark:border-slate-800">
                                <td className="px-3 py-2">{record.rowNumber}</td>
                                <td className="px-3 py-2">{record.product.name}</td>
                                <td className="px-3 py-2">{record.product.barcode || record.product.sku || "—"}</td>
                                <td className="px-3 py-2">{record.batch || "Not provided"}</td>
                                <td className="px-3 py-2">{record.expiry || "—"}</td>
                                <td className="px-3 py-2">{record.quantity}</td>
                                <td className="px-3 py-2">{importMoney(record.lotPurchasePrice ?? record.product.purchasePrice)}</td>
                                <td className="px-3 py-2">{importMoney(record.lotTotalPurchaseValue)}</td>
                                <td className="px-3 py-2">{importMoney(record.lotSellingPrice ?? record.product.sellingPrice)}</td>
                                <td className="px-3 py-2">{importMoney(record.lotTotalSellingValue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {importPreview.records.length > 30 && <p className="p-2 text-center text-xs text-slate-500">Showing first 30 valid rows.</p>}
                      </div>
                    )}
                    {(importPreview.invalidRows.length > 0 || importPreview.duplicateRows.length > 0) && (
                      <div className="mt-3 max-h-36 space-y-1 overflow-auto text-xs">
                        {importPreview.invalidRows.map((issue) => <p key={`invalid-${issue.rowNumber}`} className="text-red-700 dark:text-red-400">Row {issue.rowNumber}: {issue.message}</p>)}
                        {importPreview.duplicateRows.map((issue) => <p key={`duplicate-${issue.rowNumber}`} className="text-amber-700 dark:text-amber-400">Row {issue.rowNumber}: {issue.message}</p>)}
                      </div>
                    )}
                  </section>
                </>
              )}

              {importError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{importError}</p>}
              {importResult && (
                <div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <p className="font-semibold">Inventory import completed. A recoverable backup was saved before the update.</p>
                  <p className="mt-1">Products: {importResult.createdProducts} created, {importResult.updatedProducts} updated. Lots: {importResult.createdLots} created, {importResult.updatedLots} updated. Imported stock quantity: {importResult.totalImportedQuantity}.</p>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4 dark:border-slate-800">
                <button type="button" onClick={() => setShowImport(false)} className="rounded-xl border px-4 py-2.5 text-sm dark:border-slate-700">
                  {importResult ? "Done" : "Cancel"}
                </button>
                {importWorkbook && !importResult && (
                  <button
                    type="button"
                    disabled={importing || importPreview.records.length === 0 || importPreview.invalidRows.length > 0}
                    onClick={() => void confirmImport()}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importing ? "Importing…" : `Import ${importPreview.records.length} rows`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">Export Inventory</h3>
                <p className="mt-1 text-sm text-slate-500">{products.length} products, including zero-stock products and individual lots.</p>
              </div>
              <button type="button" onClick={() => setShowExport(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close export dialog"><X size={18} /></button>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <button type="button" onClick={() => downloadInventory("xlsx")} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"><FileSpreadsheet size={17} />Download Excel</button>
              <button type="button" onClick={() => downloadInventory("csv")} className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><Download size={17} />Download CSV</button>
            </div>
            {exportError && <p role="alert" className="mx-5 mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{exportError}</p>}
          </div>
        </div>
      )}

      {showReceive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">
                  Receive Stock
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Scan a product barcode to begin receiving stock.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeReceiveStock
                }
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <label className="text-sm font-medium">
                  Scan Barcode
                </label>

                <div className="relative mt-2">
                  <Barcode
                    size={19}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    autoFocus
                    value={scannerValue}
                    onChange={(event) =>
                      setScannerValue(
                        event.target.value,
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key ===
                        "Enter"
                      ) {
                        handleBarcodeScan(
                          scannerValue,
                        )
                      }
                    }}
                    placeholder="Scan barcode and press Enter..."
                    className="h-12 w-full rounded-xl border bg-white pl-10 pr-4 font-mono text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  USB/Bluetooth scanners work when this field is focused.
                </p>
              </div>

              {scannedProduct ? (
                <>
                  <div className="rounded-2xl border bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Product Found
                        </div>

                        <div className="mt-1 text-lg font-semibold">
                          {
                            scannedProduct.name
                          }
                        </div>

                        <div className="mt-1 text-sm text-slate-500">
                          {
                            scannedProduct.sku
                          }{" "}
                          ·{" "}
                          {
                            scannedProduct.barcode
                          }
                        </div>
                      </div>

                      <div className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        Current Stock:{" "}
                        {
                          getProductStock(
                            scannedProduct.id,
                          )
                        }
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
                    Enter the batch and expiry from the shipment you are receiving. A new batch creates a separate inventory lot.
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Batch Number"
                      value={batch}
                      onChange={setBatch}
                      placeholder="e.g. PDX9832"
                    />

                    <Field
                      label="Expiry Month/Year"
                      value={normalizeExpiryValue(expiry)}
                      onChange={setExpiry}
                      type="month"
                    />

                    <Field
                      label="Quantity Received"
                      value={quantity}
                      onChange={setQuantity}
                      type="number"
                      placeholder="50"
                    />

                    <Field
                      label="Purchase Price"
                      value={purchasePrice}
                      onChange={setPurchasePrice}
                      type="number"
                      placeholder="10.00"
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    New Product
                  </div>

                  <div className="mt-3 text-lg font-semibold">
                    Create product for barcode {scannerValue}
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Product Name" value={newProductName} onChange={setNewProductName} />
                    <Field label="Category" value={newCategory} onChange={setNewCategory} />
                    <Field label="SKU" value={newSKU} onChange={setNewSKU} placeholder="Auto-generated" />
                    <Field label="Barcode" value={scannerValue} onChange={setScannerValue} />
                    <Field label="Purchase Price" value={purchasePrice} onChange={setPurchasePrice} type="number" />
                    <Field label="Selling Price" value={sellingPrice} onChange={setSellingPrice} type="number" />
                    <Field label="VAT Rate" value={vatRate} onChange={setVatRate} type="number" />
                    <Field label="Unit" value={unit} onChange={setUnit} />
                    <Field label="Batch Number" value={batch} onChange={setBatch} />
                    <Field label="Expiry Month/Year" value={normalizeExpiryValue(expiry)} onChange={setExpiry} type="month" />
                    <Field label="Quantity Received" value={quantity} onChange={setQuantity} type="number" />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t pt-5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={
                    closeReceiveStock
                  }
                  className="rounded-xl border px-4 py-2.5 text-sm dark:border-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!(scannedProduct || scannerValue)}
                  onClick={receive}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={17} />
                  {scannedProduct ? "Receive Stock" : "Create & Receive Stock"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">Add Product</h3>
                <p className="mt-1 text-sm text-slate-500">Create a new product. Optionally add opening stock.</p>
              </div>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
            </div>

            <div className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product Name" value={productForm.name} onChange={(v) => setProductForm({...productForm, name: v})} />
                <Field label="Category" value={productForm.category} onChange={(v) => setProductForm({...productForm, category: v})} />
                <Field label="SKU" value={productForm.sku} onChange={(v) => setProductForm({...productForm, sku: v})} placeholder="Auto-generated" />
                <Field label="Barcode" value={productForm.barcode} onChange={(v) => setProductForm({...productForm, barcode: v})} />
                <Field label="Purchase Price" value={productForm.purchasePrice} onChange={(v) => setProductForm({...productForm, purchasePrice: v})} type="number" />
                <Field label="Selling Price" value={productForm.sellingPrice} onChange={(v) => setProductForm({...productForm, sellingPrice: v})} type="number" />
                <Field label="Minimum Stock" value={productForm.minimumStock} onChange={(v) => setProductForm({...productForm, minimumStock: v})} type="number" />
                <Field label="VAT Rate" value={productForm.vatRate} onChange={(v) => setProductForm({...productForm, vatRate: v})} type="number" />
              </div>

              <div className="mt-4 border-t pt-4">
                <div className="text-sm text-slate-600">Opening Stock (optional)</div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Quantity" value={productForm.openingQuantity} onChange={(v) => setProductForm({...productForm, openingQuantity: v})} type="number" />
                  <Field label="Batch" value={productForm.openingBatch} onChange={(v) => setProductForm({...productForm, openingBatch: v})} />
                  <Field label="Expiry Month/Year" value={normalizeExpiryValue(productForm.openingExpiry)} onChange={(v) => setProductForm({...productForm, openingExpiry: v})} type="month" />
                  <Field label="Purchase Price" value={productForm.openingPurchasePrice} onChange={(v) => setProductForm({...productForm, openingPurchasePrice: v})} type="number" />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowAdd(false)} className="rounded-xl border px-4 py-2.5 text-sm">Cancel</button>
                <button onClick={() => {
                  const form = {
                    name: productForm.name.trim(),
                    category: productForm.category.trim(),
                    sku: productForm.sku.trim(),
                    barcode: productForm.barcode.trim(),
                    purchasePrice: Number(productForm.purchasePrice) || 0,
                    sellingPrice: Number(productForm.sellingPrice) || 0,
                    minimumStock: Number(productForm.minimumStock) || 0,
                    vatRate: Number(productForm.vatRate) || 5,
                    unit: productForm.unit || "Pack",
                  }

                  const openingQty = Number(productForm.openingQuantity || 0)
                  const opening = openingQty > 0 ? { quantity: openingQty, batch: productForm.openingBatch, expiry: productForm.openingExpiry, purchasePrice: Number(productForm.openingPurchasePrice) || form.purchasePrice } : null

                  saveProduct(form, opening)
                }} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Create Product</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEdit && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">Edit Product</h3>
                <p className="mt-1 text-sm text-slate-500">Update product details.</p>
              </div>
              <button type="button" onClick={() => setShowEdit(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
            </div>

            <div className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product Name" value={productForm.name} onChange={(v) => setProductForm({...productForm, name: v})} />
                <Field label="Category" value={productForm.category} onChange={(v) => setProductForm({...productForm, category: v})} />
                <Field label="SKU" value={productForm.sku} onChange={(v) => setProductForm({...productForm, sku: v})} />
                <Field label="Barcode" value={productForm.barcode} onChange={(v) => setProductForm({...productForm, barcode: v})} />
                <Field label="Purchase Price" value={productForm.purchasePrice} onChange={(v) => setProductForm({...productForm, purchasePrice: v})} type="number" />
                <Field label="Selling Price" value={productForm.sellingPrice} onChange={(v) => setProductForm({...productForm, sellingPrice: v})} type="number" />
                <Field label="Minimum Stock" value={productForm.minimumStock} onChange={(v) => setProductForm({...productForm, minimumStock: v})} type="number" />
                <Field label="VAT Rate" value={productForm.vatRate} onChange={(v) => setProductForm({...productForm, vatRate: v})} type="number" />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowEdit(false)} className="rounded-xl border px-4 py-2.5 text-sm">Cancel</button>
                <button onClick={() => {
                  const form = {
                    name: productForm.name.trim(),
                    category: productForm.category.trim(),
                    sku: productForm.sku.trim(),
                    barcode: productForm.barcode.trim(),
                    purchasePrice: Number(productForm.purchasePrice) || 0,
                    sellingPrice: Number(productForm.sellingPrice) || 0,
                    minimumStock: Number(productForm.minimumStock) || 0,
                    vatRate: Number(productForm.vatRate) || 5,
                    unit: productForm.unit || "Pack",
                  }

                  saveProduct(form, null)
                }} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">Adjust Stock</h3>
              </div>
              <button type="button" onClick={() => setShowAdjust(false)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
            </div>

            <div className="p-5">
              <div className="grid gap-3">
                <label className="space-y-2"><span className="text-sm font-medium">Quantity Delta (use negative to reduce)</span><input type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="h-11 w-full rounded-xl border px-3 text-sm outline-none"/></label>
                <label className="space-y-2"><span className="text-sm font-medium">Reason</span><input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="h-11 w-full rounded-xl border px-3 text-sm outline-none"/></label>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowAdjust(false)} className="rounded-xl border px-4 py-2.5 text-sm">Cancel</button>
                <button onClick={() => { doAdjust() }} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showProductLots && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">Lots</h3>
                <p className="mt-1 text-sm text-slate-500">Showing lots for product</p>
              </div>
              <button type="button" onClick={() => setShowProductLots(null)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
            </div>

            <div className="p-5">
              <div className="grid gap-3">
                {inventoryLots.filter(l => l.productId === showProductLots).map(l => (
                  <div key={l.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Batch {l.batch}</div>
                      <div className="text-sm text-slate-500">{formatDate(l.expiry)}</div>
                    </div>

                    <div className="mt-2 text-sm">Qty: {l.quantity} · Cost: {importMoney(l.purchasePrice)}{l.sellingPrice === undefined ? "" : ` · Selling: ${importMoney(l.sellingPrice)}`}</div>
                    {(l.totalPurchaseValue !== undefined || l.totalSellingValue !== undefined) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {l.totalPurchaseValue === undefined ? "" : `Purchase value: ${importMoney(l.totalPurchaseValue)}`}
                        {l.totalPurchaseValue !== undefined && l.totalSellingValue !== undefined ? " · " : ""}
                        {l.totalSellingValue === undefined ? "" : `Selling value: ${importMoney(l.totalSellingValue)}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b p-5 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold">
                  Inventory Lot
                </h3>

                <p className="text-sm text-slate-500">
                  {
                    productMap.get(
                      selectedLot.productId,
                    )?.name
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedLot(
                    null,
                  )
                }
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Detail
                label="Batch"
                value={
                  selectedLot.batch
                }
              />

              <Detail
                label="Expiry"
                value={formatDate(
                  selectedLot.expiry,
                )}
              />

              <Detail
                label="Lot Quantity"
                value={String(
                  selectedLot.quantity,
                )}
              />

              <Detail
                label="Purchase Price"
                value={money(
                  selectedLot.purchasePrice,
                )}
              />
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
  value: string
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-slate-500">
        {title}
      </div>

      <div className="mt-3 text-2xl font-bold">
        {value}
      </div>
    </div>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
      <div className="text-xs text-slate-500">
        {label}
      </div>

      <div className="mt-1 font-semibold">
        {value}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value,
          )
        }
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950"
      />
    </label>
  )
}
