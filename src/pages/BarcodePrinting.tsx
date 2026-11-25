import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import {
  Barcode,
  Check,
  CheckSquare,
  CircleAlert,
  Printer,
  Search,
  Settings2,
  Tags,
  WandSparkles,
} from "lucide-react"
import JsBarcode from "jsbarcode"
import { useERP, type Product } from "../context/ERPContext"
import { getERPSettings } from "../lib/erpSettings"
import { generateCompanyProductBarcode } from "../lib/productBarcode"
import "./BarcodePrinting.css"

type LabelQueueItem = {
  product: Product
  barcode: string
  copies: number
}

type LabelSize = {
  id: string
  name: string
  width: number
  height: number
}

const LABEL_SIZES: LabelSize[] = [
  { id: "40x30", name: "40 × 30 mm", width: 40, height: 30 },
  { id: "50x25", name: "50 × 25 mm", width: 50, height: 25 },
  { id: "58x40", name: "58 × 40 mm", width: 58, height: 40 },
  { id: "30x20", name: "30 × 20 mm", width: 30, height: 20 },
]

function allProductCodes(product: Product): string[] {
  return [
    product.barcode,
    ...(product.alternateBarcodes ?? []),
    ...(product.packagings ?? []).map((packaging) => packaging.barcode ?? ""),
  ].map((code) => code.trim()).filter(Boolean)
}

function BarcodeGraphic({ value, height = 42 }: { value: string; height?: number }) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.replaceChildren()
    setError("")
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        lineColor: "#101820",
        background: "#ffffff",
        width: 1.6,
        height,
        margin: 2,
        displayValue: false,
      })
    } catch {
      setError("Invalid barcode value")
    }
  }, [value, height])

  return (
    <div className="barcode-graphic">
      {error ? <span className="text-xs text-red-600">{error}</span> : <svg ref={svgRef} aria-label={"Barcode " + value} role="img" />}
    </div>
  )
}

function PrintLabel({
  item,
  width,
  height,
  showName,
  showSku,
  showPrice,
}: {
  item: LabelQueueItem
  width: number
  height: number
  showName: boolean
  showSku: boolean
  showPrice: boolean
}) {
  const price = Number(item.product.sellingPrice || 0)
  return (
    <article
      className="barcode-roll-label"
      style={{ width: width + "mm", height: height + "mm" }}
    >
      {showName && <strong className="barcode-label-name">{item.product.name}</strong>}
      <BarcodeGraphic value={item.barcode} height={Math.max(25, Math.min(48, height * 1.12))} />
      <span className="barcode-label-value">{item.barcode}</span>
      <div className="barcode-label-bottom">
        {showSku && <span>{item.product.sku || item.product.category}</span>}
        {showPrice && <strong>AED {price.toFixed(2)}</strong>}
      </div>
    </article>
  )
}

export default function BarcodePrinting() {
  const { products, updateProduct } = useERP()
  const settings = useMemo(() => getERPSettings(), [])
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [copiesById, setCopiesById] = useState<Record<string, number>>({})
  const [queue, setQueue] = useState<LabelQueueItem[]>([])
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [sizeId, setSizeId] = useState("40x30")
  const [customWidth, setCustomWidth] = useState(40)
  const [customHeight, setCustomHeight] = useState(30)
  const [showName, setShowName] = useState(true)
  const [showSku, setShowSku] = useState(true)
  const [showPrice, setShowPrice] = useState(false)

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter((product) => product.productType !== "SERVICE")
      .filter((product) => !q || [
        product.name,
        product.sku,
        product.barcode,
        product.category,
        product.companyName ?? "",
        ...(product.alternateBarcodes ?? []),
      ].some((value) => value.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, query])

  const activeSize = LABEL_SIZES.find((size) => size.id === sizeId)
  const labelWidth = sizeId === "custom" ? customWidth : activeSize?.width ?? 40
  const labelHeight = sizeId === "custom" ? customHeight : activeSize?.height ?? 30
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id))
  const totalCopies = queue.reduce((sum, item) => sum + item.copies, 0)
  const missingBarcodeCount = selectedProducts.filter((product) => !product.barcode.trim()).length

  function toggleProduct(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id])
    setError("")
  }

  function selectVisible() {
    const visibleIds = filteredProducts.map((product) => product.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])])
  }

  function setCopies(id: string, value: number) {
    const safe = Math.max(1, Math.min(500, Math.floor(Number.isFinite(value) ? value : 1)))
    setCopiesById((current) => ({ ...current, [id]: safe }))
  }

  async function prepareLabels() {
    if (!selectedIds.length) {
      setError("Select at least one existing product.")
      return
    }
    if (labelWidth < 20 || labelWidth > 100 || labelHeight < 12 || labelHeight > 100) {
      setError("Label dimensions must be between 20–100 mm wide and 12–100 mm high.")
      return
    }

    setPreparing(true)
    setError("")
    setNotice("")
    const availableCodes = new Set(products.flatMap(allProductCodes).map((code) => code.toLowerCase()))
    const nextQueue: LabelQueueItem[] = []
    const failures: string[] = []

    try {
      for (const id of selectedIds) {
        const product = products.find((item) => item.id === id)
        if (!product) continue
        let barcode = product.barcode.trim()

        if (barcode) {
          const conflictingProducts = products.filter((other) =>
            other.id !== product.id &&
            allProductCodes(other).some((code) => code.toLowerCase() === barcode.toLowerCase()),
          )
          if (conflictingProducts.length) {
            failures.push(product.name + ": barcode is also assigned to " + conflictingProducts.map((item) => item.name).join(", "))
            continue
          }
        } else {
          try {
            let generated = ""
            for (let attempt = 0; attempt < 8; attempt++) {
              const candidate = generateCompanyProductBarcode({
                companyName: settings.businessName.trim() || "Zaki Pharmacy LLC",
                mobileNumber: settings.phone,
              })
              if (!availableCodes.has(candidate.toLowerCase())) {
                generated = candidate
                break
              }
            }
            if (!generated) throw new Error("Could not generate a unique code. Try again.")
            barcode = generated
            const updatedProduct = { ...product, barcode }
            updateProduct(product.id, updatedProduct)
            availableCodes.add(barcode.toLowerCase())
          } catch (generationError) {
            failures.push(product.name + ": " + (generationError instanceof Error ? generationError.message : String(generationError)))
            continue
          }
        }

        nextQueue.push({
          product: barcode === product.barcode ? product : { ...product, barcode },
          barcode,
          copies: copiesById[id] ?? 1,
        })
      }

      setQueue(nextQueue)
      if (failures.length) {
        setError("Some products were not added:\n" + failures.join("\n"))
      } else {
        setNotice(nextQueue.length + " product(s) ready. Any missing barcodes have been generated and saved to their product records.")
      }
      if (!nextQueue.length && !failures.length) setError("No selected products were available to prepare.")
    } finally {
      setPreparing(false)
    }
  }

  const printableLabels = useMemo(
    () => queue.flatMap((item) => Array.from({ length: item.copies }, (_, copyIndex) => ({ item, copyIndex }))),
    [queue],
  )

  function clearQueue() {
    setQueue([])
    setNotice("")
    setError("")
  }

  return (
    <section className="barcode-printing-page space-y-5 p-4 md:p-6">
      <header className="barcode-printing-hero">
        <div className="flex items-start gap-3">
          <div className="barcode-printing-hero-icon"><Barcode size={25} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/70">Inventory & operations</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Barcode Label Printing</h1>
            <p className="mt-1 max-w-2xl text-sm text-emerald-50/75">
              Select products already in your inventory, prepare their barcodes and print roll labels to attach to the physical packs.
            </p>
          </div>
        </div>
        <div className="barcode-printing-flow">
          <span><b>1</b> Select products</span><span><b>2</b> Set copies</span><span><b>3</b> Print & attach</span>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.8fr)]">
        <main className="space-y-4">
          <section className="barcode-panel overflow-hidden">
            <div className="barcode-panel-header">
              <div>
                <h2>Select existing inventory products</h2>
                <p>Barcodes are assigned to the product record, not created as separate products.</p>
              </div>
              <span className="barcode-count">{products.filter((product) => product.productType !== "SERVICE").length} products</span>
            </div>
            <div className="space-y-3 p-4">
              <label className="barcode-search">
                <Search size={17} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product name, SKU or existing barcode…" />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={selectVisible} className="barcode-secondary-button">
                  <CheckSquare size={15} /> Select all visible
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">{selectedIds.length} selected · {missingBarcodeCount} need a barcode</span>
              </div>
              <div className="barcode-product-list">
                {filteredProducts.map((product) => {
                  const selected = selectedIds.includes(product.id)
                  return (
                    <div key={product.id} className={"barcode-product-row" + (selected ? " is-selected" : "")}>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={selected} onChange={() => toggleProduct(product.id)} />
                        <span className="min-w-0">
                          <strong className="block truncate">{product.name}</strong>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {product.sku || "No SKU"} · {product.category || "Uncategorised"}
                          </span>
                          <span className="mt-1 block break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {product.barcode ? product.barcode : "Barcode not assigned yet"}
                          </span>
                        </span>
                      </label>
                      <div className="barcode-row-controls">
                        <label>
                          <span>Labels</span>
                          <input type="number" min="1" max="500" value={copiesById[product.id] ?? 1} onChange={(event) => setCopies(product.id, Number(event.target.value))} aria-label={"Label copies for " + product.name} />
                        </label>
                        {product.barcode
                          ? <span className="barcode-status-ready"><Check size={13} /> Ready</span>
                          : <span className="barcode-status-missing"><CircleAlert size={13} /> Generate</span>}
                      </div>
                    </div>
                  )
                })}
                {!filteredProducts.length && <div className="p-10 text-center text-sm text-slate-500">No matching inventory products.</div>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Missing barcodes are generated once and saved to the existing product.</p>
                <button type="button" onClick={prepareLabels} disabled={preparing || selectedIds.length === 0} className="barcode-primary-button">
                  {preparing ? <span className="barcode-spinner" /> : <WandSparkles size={16} />}
                  {preparing ? "Preparing…" : "Generate / prepare labels"}
                </button>
              </div>
              {error && <div role="alert" className="barcode-alert-error">{error}</div>}
              {notice && <div role="status" className="barcode-alert-success">{notice}</div>}
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="barcode-panel p-4">
            <div className="mb-4 flex items-center gap-2">
              <Settings2 size={17} className="text-emerald-700 dark:text-emerald-300" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Roll label settings</h2>
            </div>
            <label className="barcode-field-label">
              Label size
              <select value={sizeId} onChange={(event) => setSizeId(event.target.value)}>
                {LABEL_SIZES.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
                <option value="custom">Custom size…</option>
              </select>
            </label>
            {sizeId === "custom" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="barcode-field-label">Width (mm)<input type="number" min="20" max="100" value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} /></label>
                <label className="barcode-field-label">Height (mm)<input type="number" min="12" max="100" value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} /></label>
              </div>
            )}
            <div className="my-4 border-t border-slate-100 dark:border-slate-800" />
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Label content</p>
            <div className="space-y-3">
              <label className="barcode-toggle"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} /> Product name</label>
              <label className="barcode-toggle"><input type="checkbox" checked={showSku} onChange={(event) => setShowSku(event.target.checked)} /> SKU / product code</label>
              <label className="barcode-toggle"><input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} /> Selling price</label>
            </div>
            <div className="barcode-printer-note mt-4">
              <Printer size={17} />
              <p>In the print dialog, select your thermal roll printer and the same label size. Turn off “Fit to page” / scaling so the barcode prints at the configured physical size.</p>
            </div>
          </section>

          <section className="barcode-panel overflow-hidden">
            <div className="barcode-panel-header">
              <div>
                <h2>Print queue</h2>
                <p>{queue.length} product(s) · {totalCopies} sticker(s)</p>
              </div>
              {queue.length > 0 && <button type="button" onClick={clearQueue} className="barcode-text-button">Clear</button>}
            </div>
            {queue.length > 0 ? (
              <div className="space-y-3 p-4">
                {queue.map((item) => (
                  <div key={item.product.id} className="barcode-queue-item">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm">{item.product.name}</strong>
                      <span className="mt-1 block break-all font-mono text-[10px] text-slate-500">{item.barcode}</span>
                    </div>
                    <span className="barcode-copy-pill">× {item.copies}</span>
                  </div>
                ))}
                <div className="barcode-screen-preview">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Label preview</span><span>{labelWidth} × {labelHeight} mm</span></div>
                  <div className="barcode-screen-label" style={{ width: Math.min(100, labelWidth * 2.2) + "mm", minHeight: Math.max(70, labelHeight * 2) + "px" }}>
                    {showName && <strong>{queue[0].product.name}</strong>}
                    <BarcodeGraphic value={queue[0].barcode} />
                    <span>{queue[0].barcode}</span>
                    <div>{showSku && <span>{queue[0].product.sku}</span>}{showPrice && <b>AED {Number(queue[0].product.sellingPrice || 0).toFixed(2)}</b>}</div>
                  </div>
                </div>
                <button type="button" onClick={() => window.print()} className="barcode-print-button">
                  <Printer size={17} /> Print {totalCopies} labels
                </button>
              </div>
            ) : (
              <div className="p-7 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Tags size={21} /></div>
                <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Your label queue is empty</p>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Select existing products and prepare their barcode labels to see them here.</p>
              </div>
            )}
          </section>
        </aside>
      </div>

      <div
        className="barcode-print-root"
        aria-hidden="true"
        style={{ "--barcode-label-width": labelWidth + "mm", "--barcode-label-height": labelHeight + "mm" } as CSSProperties}
      >
        {printableLabels.map(({ item, copyIndex }) => (
          <PrintLabel
            key={item.product.id + "-" + copyIndex}
            item={item}
            width={labelWidth}
            height={labelHeight}
            showName={showName}
            showSku={showSku}
            showPrice={showPrice}
          />
        ))}
      </div>
    </section>
  )
}
