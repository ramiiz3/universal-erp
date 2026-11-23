import { useEffect, useRef, useState } from "react"
import JsBarcode from "jsbarcode"

type BarcodePreviewProps = {
  value: string
  className?: string
}

export default function BarcodePreview({ value, className = "" }: BarcodePreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.replaceChildren()
    setError("")
    if (!value.trim()) return

    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        lineColor: "#111827",
        background: "#ffffff",
        width: 1.7,
        height: 54,
        margin: 8,
        displayValue: true,
        font: "monospace",
        fontSize: 11,
        textMargin: 4,
      })
    } catch {
      setError("This value cannot be rendered as a Code 128 barcode.")
    }
  }, [value])

  if (!value.trim()) return null

  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 ${className}`}>
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : (
        <svg ref={svgRef} role="img" aria-label={`Barcode ${value}`} className="mx-auto h-auto max-w-full" />
      )}
      <p className="mt-1 break-all text-center text-[10px] text-slate-500">Internal Code 128 barcode</p>
    </div>
  )
}
