import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Banknote,
  Camera,
  CheckCircle2,
  CreditCard,
  Landmark,
  ChevronDown,
  Search,
  ScanLine,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { BrowserMultiFormatReader } from "@zxing/browser"
import { useERP, type PaymentMethod, type Product } from "../context/ERPContext"
import { reservePendingThermalPrintWindow, closePendingThermalPrintWindow } from "../lib/pendingThermalPrintWindow"
import { getERPSettings } from "../lib/erpSettings"
import {
  allocateSaleLots,
  calculateLotSaleTotals,
  getSaleableInventoryLots,
  isInventoryLotExpired,
  sortInventoryLotsByFEFO,
} from "../lib/saleLotAllocation"

type CartItem = {
  lineId: string
  productId: string
  product: Product
  quantity: number
  unitPrice: number
  packageId?: string
  sellingUnit: string
  conversionFactor: number
}

type SelectedProductPackaging =
  NonNullable<Product["packagings"]>[number]

type UnitChoice = {
  id: string
  name: string
  unit: string
  conversionFactor: number
  sellingPrice: number
  packaging?: SelectedProductPackaging
}

function formatQuantity(value: number) {
  return Number(value.toFixed(3)).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })
}

function wholePackagesInLot(quantity: number, conversionFactor: number) {
  if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) return 0
  return Math.floor((quantity + 1e-9) / conversionFactor)
}

export default function POS() {
  const navigate = useNavigate()
  const { products, inventoryLots, customers, warehouses, completeSale } = useERP()

  const erpSettings = getERPSettings()
  const activeWarehouses = warehouses.filter((item) => item.active)

  const enabledPaymentOptions: {
    method: PaymentMethod
    label: string
    icon: typeof Banknote
  }[] = [
    erpSettings.payment.cash
      ? {
          method: "Cash",
          label: "Cash",
          icon: Banknote,
        }
      : null,
    erpSettings.payment.card
      ? {
          method: "Card",
          label: "Card",
          icon: CreditCard,
        }
      : null,
    erpSettings.payment.credit
      ? {
          method: "Credit",
          label: "Credit",
          icon: UserRound,
        }
      : null,
    erpSettings.payment.bankTransfer
      ? {
          method: "Bank Transfer",
          label: "Bank Transfer",
          icon: Landmark,
        }
      : null,
  ].filter(
    (
      option,
    ): option is {
      method: PaymentMethod
      label: string
      icon: typeof Banknote
    } => Boolean(option),
  )

  const [search, setSearch] = useState("")
  const [barcode, setBarcode] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [warehouseId, setWarehouseId] = useState(
    () => warehouses.find((item) => item.active && item.type === "MAIN")?.id ??
      warehouses.find((item) => item.active)?.id ?? "",
  )
  const [customerId, setCustomerId] = useState("")
  const [walkInName, setWalkInName] = useState("")
  const [walkInPhone, setWalkInPhone] = useState("")
  const [walkInEmail, setWalkInEmail] = useState("")
  const [invoiceNotes, setInvoiceNotes] = useState("")
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState("0")
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(() => {
      const settings = getERPSettings()

      if (settings.payment.cash) return "Cash"
      if (settings.payment.card) return "Card"
      if (settings.payment.credit) return "Credit"
      return "Bank Transfer"
    })
  const [discount, setDiscount] = useState("")
  const [cashTendered, setCashTendered] = useState("")
  const [error, setError] = useState("")
  const [successInvoice, setSuccessInvoice] = useState("")
  const [cameraOpen, setCameraOpen] = useState(false)
  const [uomPickerLineId, setUomPickerLineId] = useState<string | null>(null)

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    barcodeInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!cameraOpen || !videoRef.current) return

    let cancelled = false

    const startScanner = async () => {
      try {
        if (!readerRef.current) {
          readerRef.current = new BrowserMultiFormatReader()
        }

        controlsRef.current = await readerRef.current.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (cancelled || !result) return

            const code = result.getText().trim()

            if (code) {
              handleBarcode(code)
              setCameraOpen(false)
            }
          },
        )
      } catch {
        setError("Could not access the camera. Please allow camera permission.")
      }
    }

    startScanner()

    return () => {
      cancelled = true

      try {
        controlsRef.current?.stop()
      } catch {}

      controlsRef.current = null
    }
  }, [cameraOpen])

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()

    return products.filter((product) => {
      if (product.status === "INACTIVE" || product.status === "DISCONTINUED") return false
      if (!query) return true

      return (
        product.name.toLowerCase().includes(query) ||
        product.barcode.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        (product.genericName ?? "").toLowerCase().includes(query) ||
        (product.companyName ?? "").toLowerCase().includes(query) ||
        (product.brand ?? "").toLowerCase().includes(query)
      )
    })
  }, [products, search])

  const saleAllocationPreview = useMemo(
    () =>
      allocateSaleLots(
        cart.map((item) => ({
          product: item.product,
          requestId: item.lineId,
          warehouseId,
          quantity: item.quantity * item.conversionFactor,
          saleUnitConversionFactor: item.conversionFactor,
          unitPrice: item.unitPrice / item.conversionFactor,
          unitPriceOverride: true,
        })),
        inventoryLots,
      ),
    [cart, inventoryLots, warehouseId],
  )
  const lotPricedLines = saleAllocationPreview.lines

  const selectedCustomer = customers.find((customer) => customer.id === customerId)
  const loyaltySettings = erpSettings.loyalty
  const requestedLoyaltyPoints = Math.max(0, Math.floor(Number(loyaltyPointsToRedeem) || 0))
  const effectiveLoyaltyPointsRedeemed = loyaltySettings.enabled && paymentMethod !== "Credit" && selectedCustomer
    ? Math.min(requestedLoyaltyPoints, selectedCustomer.loyaltyPoints ?? 0)
    : 0
  const loyaltyDiscountEstimate = Number((effectiveLoyaltyPointsRedeemed * loyaltySettings.currencyPerPoint).toFixed(2))

  const saleTotals = useMemo(
    () => calculateLotSaleTotals(
      lotPricedLines,
      (Number(discount) || 0) + loyaltyDiscountEstimate,
    ),
    [discount, lotPricedLines, loyaltyDiscountEstimate],
  )
  const { subtotal, discount: discountAmount, vat: vatAmount } = saleTotals
  const total = Math.max(0, Number(saleTotals.total.toFixed(2)))
  const estimatedLoyaltyPoints = loyaltySettings.enabled && selectedCustomer && paymentMethod !== "Credit"
    ? Math.max(0, Math.floor(Math.max(0, subtotal - discountAmount) * loyaltySettings.pointsPerCurrencyUnit))
    : 0

  function handleBarcode(code: string) {
    const cleanCode = code.trim()
    if (!cleanCode) return

    setError("")
    const normalizedCode = cleanCode.toLowerCase()
    const product = products.find((item) =>
      item.barcode.trim().toLowerCase() === normalizedCode ||
      (item.alternateBarcodes || []).some((value) => value.trim().toLowerCase() === normalizedCode) ||
      (item.packagings || []).some((packaging) =>
        packaging.barcode?.trim().toLowerCase() === normalizedCode,
      ),
    )

    if (!product) {
      setError(`No product found for barcode ${cleanCode}`)
      return
    }
    if (product.status === "INACTIVE" || product.status === "DISCONTINUED") {
      setError(`${product.name} is archived or discontinued and cannot be sold.`)
      return
    }

    const matchedPackage = product.packagings?.find((packaging) =>
      packaging.barcode?.trim().toLowerCase() === normalizedCode,
    )

    // A pack barcode adds that exact selling unit. A product barcode adds
    // the stock unit; the cashier can change the UOM in the invoice row.
    if (matchedPackage) addToCart(product, matchedPackage, 1)
    else addToCart(product)

    setBarcode("")
    requestAnimationFrame(() => barcodeInputRef.current?.focus())
  }

  function getUnitChoices(product: Product): UnitChoice[] {
    const stockUnit = product.unit?.trim() || "Unit"
    return [
      {
        id: "",
        name: stockUnit,
        unit: stockUnit,
        conversionFactor: 1,
        sellingPrice: product.sellingPrice,
      },
      ...(product.packagings ?? [])
        .filter((packaging) => packaging.salesEnabled)
        .map((packaging) => ({
          id: packaging.id,
          name: packaging.name || packaging.unit,
          unit: packaging.unit || packaging.name,
          conversionFactor: packaging.conversionFactor,
          sellingPrice: packaging.sellingPrice ?? product.sellingPrice * packaging.conversionFactor,
          packaging,
        })),
    ]
  }

  function getSaleRequests(items: CartItem[]) {
    return items.map((item) => ({
      product: item.product,
      requestId: item.lineId,
      warehouseId,
      quantity: item.quantity * item.conversionFactor,
      saleUnitConversionFactor: item.conversionFactor,
      unitPrice: item.unitPrice / item.conversionFactor,
      unitPriceOverride: true,
    }))
  }

  function getAvailableLotsForLine(productId: string, excludedLineId?: string) {
    const otherLines = cart.filter(
      (item) => item.productId === productId && item.lineId !== excludedLineId,
    )
    const otherAllocation = allocateSaleLots(
      getSaleRequests(otherLines),
      inventoryLots,
    )
    if (otherAllocation.unallocated.length > 0) return []
    return sortInventoryLotsByFEFO(
      otherAllocation.updatedLots.filter((lot) =>
        lot.productId === productId &&
        lot.warehouseId === warehouseId &&
        lot.quantity > 0,
      ),
    )
  }

  function getAvailableUomQuantity(
    productId: string,
    conversionFactor: number,
    excludedLineId?: string,
  ) {
    return getAvailableLotsForLine(productId, excludedLineId)
      .filter((lot) => !isInventoryLotExpired(lot))
      .reduce((sum, lot) => sum + wholePackagesInLot(lot.quantity, conversionFactor), 0)
  }

  function addToCart(
    product: Product,
    selectedPackage?: SelectedProductPackaging,
    requestedQuantity = 1,
    forceNewLine = false,
  ): boolean {
    if (product.status === "INACTIVE" || product.status === "DISCONTINUED") {
      setError(`${product.name} is archived or discontinued and cannot be sold.`)
      return false
    }
    if (!product.unit?.trim()) {
      setError(`${product.name} has no inventory unit. Open Product Master and set the outer stock unit (for example Box) before selling it.`)
      return false
    }
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      setError("Enter a whole quantity greater than zero.")
      return false
    }
    if (selectedPackage && !selectedPackage.salesEnabled) {
      setError(`${selectedPackage.name} is not enabled for sales.`)
      return false
    }

    let effectivePackage = selectedPackage
    let factor = effectivePackage?.conversionFactor ?? 1
    if (!effectivePackage) {
      const baseAvailable = getAvailableUomQuantity(product.id, 1)
      if (baseAvailable < requestedQuantity) {
        const fallback = getUnitChoices(product)
          .filter((choice) => choice.packaging)
          .sort((left, right) => right.conversionFactor - left.conversionFactor)
          .find((choice) => getAvailableUomQuantity(product.id, choice.conversionFactor) >= requestedQuantity)
        if (fallback?.packaging) effectivePackage = fallback.packaging
        factor = effectivePackage?.conversionFactor ?? 1
      }
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      setError("This product has an invalid selling-unit conversion.")
      return false
    }

    const packagePrice = effectivePackage?.sellingPrice ??
      product.sellingPrice * factor
    const existing = forceNewLine ? undefined : cart.find((item) =>
      item.productId === product.id &&
      (item.packageId ?? "") === (effectivePackage?.id ?? ""),
    )
    const lineId = existing?.lineId ??
      `POS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const nextCart = existing
      ? cart.map((item) =>
          item.lineId === existing.lineId
            ? { ...item, quantity: item.quantity + requestedQuantity }
            : item,
        )
      : [
          ...cart,
          {
            lineId,
            productId: product.id,
            product,
            quantity: requestedQuantity,
            unitPrice: packagePrice,
            packageId: effectivePackage?.id,
            sellingUnit: effectivePackage?.unit ?? product.unit,
            conversionFactor: factor,
          },
        ]

    const productAllocation = allocateSaleLots(
      getSaleRequests(nextCart.filter((item) => item.productId === product.id)),
      inventoryLots,
    )
    if (productAllocation.unallocated.length > 0) {
      const available = getAvailableUomQuantity(product.id, factor, existing?.lineId)
      setError(`Not enough stock to add ${requestedQuantity} ${selectedPackage?.unit ?? product.unit}. Available for this selling unit: ${available}.`)
      return false
    }

    setCart(nextCart)
    setUomPickerLineId(selectedPackage ? null : lineId)
    setError("")
    return true
  }

  function selectCartUom(lineId: string, choice: UnitChoice) {
    const currentLine = cart.find((item) => item.lineId === lineId)
    if (!currentLine) return
    if (!Number.isFinite(choice.conversionFactor) || choice.conversionFactor <= 0) {
      setError("This selling unit has an invalid stock conversion.")
      return
    }

    const nextCart = cart.map((item) =>
      item.lineId === lineId
        ? {
            ...item,
            packageId: choice.packaging?.id,
            sellingUnit: choice.unit,
            conversionFactor: choice.conversionFactor,
            unitPrice: choice.sellingPrice,
          }
        : item,
    )
    const productAllocation = allocateSaleLots(
      getSaleRequests(nextCart.filter((item) => item.productId === currentLine.productId)),
      inventoryLots,
    )
    if (productAllocation.unallocated.length > 0) {
      const available = getAvailableUomQuantity(
        currentLine.productId,
        choice.conversionFactor,
        lineId,
      )
      setError(`Only ${available} complete ${choice.unit} unit(s) are available after the other lines in this sale.`)
      return
    }

    setCart(nextCart)
    setUomPickerLineId(null)
    setError("")
  }

  function updateQuantity(lineId: string, nextQuantity: number) {
    const cartItem = cart.find((item) => item.lineId === lineId)
    if (!cartItem) return

    if (!Number.isInteger(nextQuantity)) {
      setError("Quantity must be a whole number.")
      return
    }
    if (nextQuantity <= 0) {
      setCart((current) => current.filter((item) => item.lineId !== lineId))
      setUomPickerLineId(null)
      return
    }

    const nextCart = cart.map((item) =>
      item.lineId === lineId ? { ...item, quantity: nextQuantity } : item,
    )
    const productAllocation = allocateSaleLots(
      getSaleRequests(nextCart.filter((item) => item.productId === cartItem.productId)),
      inventoryLots,
    )
    if (productAllocation.unallocated.length > 0) {
      const available = getAvailableUomQuantity(
        cartItem.productId,
        cartItem.conversionFactor,
        lineId,
      )
      setError(`Only ${available} complete ${cartItem.sellingUnit} unit(s) are available.`)
      return
    }

    setError("")
    setCart(nextCart)
  }

  function removeItem(lineId: string) {
    setCart((current) => current.filter((item) => item.lineId !== lineId))
    setUomPickerLineId(null)
  }

  function clearSale() {
    setCart([])
    setUomPickerLineId(null)
    setCustomerId("")
    setWalkInName("")
    setWalkInPhone("")
    setWalkInEmail("")
    setInvoiceNotes("")
    setLoyaltyPointsToRedeem("0")
    setPaymentMethod("Cash")
    setDiscount("")
    setCashTendered("")
    setError("")
    setBarcode("")
    requestAnimationFrame(() => barcodeInputRef.current?.focus())
  }

  function handleCompleteSale() {
    setError("")

    if (cart.length === 0) {
      setError("Add at least one product to the sale.")
      return
    }

    if (
      !enabledPaymentOptions.some(
        (option) =>
          option.method === paymentMethod,
      )
    ) {
      setError(
        "The selected payment method is disabled in Settings.",
      )
      return
    }

    if (paymentMethod === "Credit" && !customerId) {
      setError("Select a customer before completing a credit sale.")
      return
    }
    if (requestedLoyaltyPoints > 0 && !loyaltySettings.enabled) {
      setError("The loyalty programme is not enabled. Ask the owner to enable it in Settings.")
      return
    }
    if (requestedLoyaltyPoints > 0 && !selectedCustomer) {
      setError("Select a registered customer before redeeming loyalty points.")
      return
    }
    if (requestedLoyaltyPoints > 0 && paymentMethod === "Credit") {
      setError("Loyalty points can only be redeemed on a settled sale.")
      return
    }
    if (requestedLoyaltyPoints > (selectedCustomer?.loyaltyPoints ?? 0)) {
      setError("The selected customer does not have enough loyalty points.")
      return
    }
    if ((Number(discount) || 0) + loyaltyDiscountEstimate > subtotal + 0.001) {
      setError("Discount and loyalty redemption cannot exceed the sale subtotal.")
      return
    }

    let cashTenderedAmount: number | undefined
    if (paymentMethod === "Cash") {
      cashTenderedAmount = cashTendered.trim() === ""
        ? saleTotals.total
        : Number(cashTendered)
      if (!Number.isFinite(cashTenderedAmount) || cashTenderedAmount < saleTotals.total) {
        setError("Cash received must be a valid amount at least equal to the sale total.")
        return
      }
    }

    // Reserve the thermal print window during the checkout click.
    // This avoids popup blockers when the saved invoice opens.
    const reservedPrintWindow = window.open("", "_blank")
    reservePendingThermalPrintWindow(reservedPrintWindow)

    try {
      const sale = completeSale({
        warehouseId,
        items: cart.map((item) => ({
          productId: item.productId,
          requestId: item.lineId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          packageId: item.packageId,
        })),
        customerId: customerId || null,
        customerName: selectedCustomer?.name || walkInName.trim() || "Walk-in Customer",
        customerPhone: selectedCustomer?.phone || walkInPhone.trim(),
        customerEmail: selectedCustomer?.email || walkInEmail.trim(),
        notes: invoiceNotes.trim(),
        loyaltyPointsRedeemed: effectiveLoyaltyPointsRedeemed,
        paymentMethod,
        cashTendered: cashTenderedAmount,
        discount: Number(discount) || 0,
      })

      setSuccessInvoice(sale.invoiceNumber)
      clearSale()

      // Sale is saved before opening its printable A4 invoice.
      navigate(
        `/invoices/${encodeURIComponent(sale.invoiceNumber)}?autoprint=1`,
      )
    } catch (saleError) {
      closePendingThermalPrintWindow()
      setError(
        saleError instanceof Error
          ? saleError.message
          : "Could not complete the sale.",
      )
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-3 md:p-5">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-6 w-6 text-slate-700" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Sales / POS</h1>
              <p className="text-xs text-slate-500">Scan or search a medicine, then select its UOM directly in the invoice row.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-600" htmlFor="pos-warehouse">Warehouse</label>
            <select
              id="pos-warehouse"
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value)
                setError("")
              }}
              className="h-10 min-w-[210px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              {activeWarehouses.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={clearSale}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              New Sale
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <X className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} className="ml-auto rounded p-1 hover:bg-red-100" aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(290px,0.85fr)_minmax(0,1.65fr)]">
        <div className="space-y-4 xl:sticky xl:top-4">
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(320px,2fr)_auto]">
            <div>
              <label htmlFor="pos-barcode" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Barcode</label>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="pos-barcode"
                  ref={barcodeInputRef}
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      handleBarcode(barcode)
                    }
                  }}
                  placeholder="Scan product or pack barcode"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="pos-product-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Find medicine / product</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="pos-product-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Type product name, generic name, SKU or barcode..."
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setError("")
                  setCameraOpen(true)
                }}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 lg:w-auto"
              >
                <Camera className="h-4 w-4" />
                Camera Scan
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>{search.trim() ? "Search results" : "Quick Add Products"}</span>
              <span>{search.trim() ? filteredProducts.length : filteredProducts.filter((product) =>
                getSaleableInventoryLots(inventoryLots, product.id, warehouseId)
                  .some((lot) => lot.quantity > 0),
              ).length} product(s)</span>
            </div>
            {filteredProducts.length > 0 ? (
              <div className="grid max-h-[calc(100vh-340px)] grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                {(search.trim()
                  ? filteredProducts.slice(0, 12)
                  : filteredProducts.filter((product) =>
                      getSaleableInventoryLots(inventoryLots, product.id, warehouseId)
                        .some((lot) => lot.quantity > 0),
                    ).slice(0, 8)
                ).map((product) => {
                  const stock = getSaleableInventoryLots(inventoryLots, product.id, warehouseId)
                    .reduce((sum, lot) => sum + lot.quantity, 0)
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={stock <= 0 || !product.unit?.trim()}
                      onClick={() => {
                        if (addToCart(product, undefined, 1, true)) setSearch("")
                      }}
                      className="flex min-h-[116px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50/60 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">{product.name}</span>
                        <span className="block truncate text-xs text-slate-500">{product.genericName || product.category} · {product.sku || product.barcode}</span>
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-medium text-slate-600">{formatQuantity(stock)} {product.unit || "unit"}</span>
                        <span className="rounded-md bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white">Add</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="px-3 py-4 text-sm text-slate-500">
                {search.trim() ? "No matching product found." : "No active products found. Add products in Product Master first."}
              </p>
            )}
            {!search.trim() && filteredProducts.length > 0 && !filteredProducts.some((product) =>
              getSaleableInventoryLots(inventoryLots, product.id, warehouseId).some((lot) => lot.quantity > 0),
            ) && (
              <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No active products have available stock in this warehouse. Receive stock or choose another warehouse.
              </p>
            )}
          </div>
        </section>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-4">
        <section className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Current Sale</h2>
              <p className="text-xs text-slate-500">{cart.length} line(s) · Select a product above or scan a barcode, then choose its UOM in the row.</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Invoice date</p>
              <p className="text-sm font-semibold text-slate-800">{new Date().toLocaleString()}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-xs 2xl:text-sm">
              <thead className="bg-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-3">Code</th>
                  <th className="border-b border-slate-200 px-3 py-3">Product</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">Qty</th>
                  <th className="border-b border-slate-200 px-3 py-3">UOM</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">Price</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">P_Qty</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">Amount</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">VAT%</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">VAT</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-right">Line Total</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      <ShoppingCart className="mx-auto h-9 w-9 text-slate-300" />
                      <p className="mt-3 font-semibold text-slate-700">Ready to start billing</p>
                      <p className="mt-1 text-xs text-slate-500">Choose a medicine from Quick Add Products above, type its name in search, or scan its barcode. It will appear here for quantity and UOM selection.</p>
                    </td>
                  </tr>
                ) : (
                  cart.map((item) => {
                    const itemLines = lotPricedLines.filter((line) => line.requestId === item.lineId)
                    const amount = itemLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
                    const effectiveAmount = itemLines.length > 0 ? amount : item.quantity * item.unitPrice
                    const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0
                    const vatRate = item.product.vatApplicable === false ? 0 : item.product.vatRate
                    const lineVat = effectiveAmount * (1 - discountRatio) * vatRate / 100
                    const lineTotal = effectiveAmount * (1 - discountRatio) + lineVat
                    // Use the post-invoice stock balance for the row P_Qty.
                    const remainingLotsAfterInvoice = getSaleableInventoryLots(
                      saleAllocationPreview.updatedLots,
                      item.productId,
                      warehouseId,
                    )
                    const pQty = remainingLotsAfterInvoice.reduce(
                      (sum, lot) => sum + wholePackagesInLot(lot.quantity, item.conversionFactor),
                      0,
                    )
                    const choices = getUnitChoices(item.product)
                    const selectedChoice = choices.find((choice) => choice.id === (item.packageId ?? "")) ?? choices[0]
                    const productLots = getAvailableLotsForLine(item.productId, item.lineId)
                    const currentLineAllocatedByLot = new Map<string, number>()
                    for (const allocation of itemLines) {
                      currentLineAllocatedByLot.set(
                        allocation.lotId,
                        (currentLineAllocatedByLot.get(allocation.lotId) ?? 0) + allocation.quantity,
                      )
                    }
                    const eligibleLotForCurrentUnit = productLots.find((lot) =>
                      !isInventoryLotExpired(lot) &&
                      Boolean(lot.expiry) &&
                      wholePackagesInLot(lot.quantity, item.conversionFactor) > 0,
                    )?.id

                    return (
                      <Fragment key={item.lineId}>
                        <tr className="align-middle hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{item.product.sku || item.product.barcode || "—"}</td>
                          <td className="min-w-[210px] px-3 py-3">
                            <p className="font-semibold text-slate-900">{item.product.name}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">{item.product.genericName || item.product.category}</p>
                            {itemLines.length > 0 ? (
                              <div className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                                {itemLines.map((line, index) => (
                                  <p key={`${item.lineId}-${line.lotId}-${index}`}>
                                    FEFO: {line.supplierName || "Supplier not recorded"} · {line.batch || "No batch"} · Exp {line.expiry || "not recorded"} · {formatQuantity(line.quantity / item.conversionFactor)} {item.sellingUnit}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 text-[10px] text-amber-700">Stock batch allocation pending</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <input
                              aria-label={`Quantity of ${item.product.name}`}
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(event) => {
                                const raw = event.target.value
                                if (/^\d+$/.test(raw)) updateQuantity(item.lineId, Number(raw))
                              }}
                              className="h-9 w-20 rounded-md border border-slate-200 bg-white px-2 text-right text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500"
                            />
                          </td>
                          <td className="relative px-3 py-3">
                            <button
                              type="button"
                              aria-expanded={uomPickerLineId === item.lineId}
                              onClick={() => setUomPickerLineId((current) => current === item.lineId ? null : item.lineId)}
                              className={`inline-flex min-w-[104px] items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-bold ${uomPickerLineId === item.lineId ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-800 hover:border-emerald-500"}`}
                            >
                              {item.sellingUnit}
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-slate-800">AED {item.unitPrice.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right">
                            <span className={pQty > 0 ? "font-semibold text-emerald-700" : "font-medium text-slate-400"}>{formatQuantity(pQty)}</span>
                            <span className="ml-1 text-[10px] text-slate-400">{item.sellingUnit}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-slate-700">AED {effectiveAmount.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right text-slate-600">{vatRate.toFixed(2)}%</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-slate-600">AED {lineVat.toFixed(2)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-slate-900">AED {lineTotal.toFixed(2)}</td>
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(item.lineId)}
                              aria-label={`Remove ${item.product.name}`}
                              className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>

                        {uomPickerLineId === item.lineId && (
                          <tr className="bg-emerald-50/40">
                            <td colSpan={11} className="px-3 py-3">
                              <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(480px,1.1fr)]">
                                <section className="overflow-hidden rounded-lg border border-emerald-200 bg-white">
                                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                                    <div>
                                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Unit of Measurement</h3>
                                      <p className="mt-0.5 text-[10px] text-slate-500">Choose the quantity the customer wants to buy</p>
                                    </div>
                                    <button type="button" onClick={() => setUomPickerLineId(null)} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label="Close UOM options">
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-[minmax(100px,1fr)_100px_90px] gap-2 border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                    <span>UOM</span><span className="text-right">Price</span><span className="text-right">P_Qty</span>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {choices.map((choice) => {
                                      // Keep selection availability before this line so the cashier
                                      // can change UOM, but display the remaining post-line P_Qty.
                                      const availableBeforeCurrentLine = getAvailableUomQuantity(item.productId, choice.conversionFactor, item.lineId)
                                      const available = Math.max(0, availableBeforeCurrentLine - item.quantity)
                                      const valid = Number.isFinite(choice.conversionFactor) && choice.conversionFactor > 0
                                      const selected = choice.id === (item.packageId ?? "")
                                      return (
                                        <button
                                          key={choice.id || "stock-unit"}
                                          type="button"
                                          disabled={!valid || availableBeforeCurrentLine < item.quantity}
                                          onClick={() => selectCartUom(item.lineId, choice)}
                                          className={`grid w-full grid-cols-[minmax(100px,1fr)_100px_90px] items-center gap-2 px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                                        >
                                          <span className="flex items-center gap-2 font-semibold text-slate-800">
                                            <span>{choice.name}</span>
                                            {selected && <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[9px] font-bold text-white">SELECTED</span>}
                                          </span>
                                          <span className="text-right font-semibold text-slate-700">AED {choice.sellingPrice.toFixed(2)}</span>
                                          <span className="text-right font-bold text-emerald-700">{available}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                  {choices.length === 1 && (
                                    <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-900">
                                      Smaller units are not configured yet. Edit this medicine in Product Master and add Strip / Sachet / Tablet under its outer stock unit.
                                    </p>
                                  )}
                                </section>

                                <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                  <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Supplier stock & expiry (FEFO)</h3>
                                    <p className="mt-0.5 text-[10px] text-slate-500">All supplier batches for this medicine, ordered by earliest expiry first.</p>
                                  </div>
                                  <div className="grid grid-cols-[minmax(110px,1fr)_90px_100px_74px_74px] gap-2 border-b border-slate-200 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                    <span>Supplier</span><span>Batch / GRN</span><span>Expiry</span><span className="text-right">Stock</span><span className="text-right">P_Qty</span>
                                  </div>
                                  {productLots.length > 0 ? (
                                    <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto">
                                      {productLots.map((lot) => {
                                        const expired = isInventoryLotExpired(lot)
                                        const allocatedFromThisLot = currentLineAllocatedByLot.get(lot.id) ?? 0
                                        const lotQuantityAfterInvoice = Math.max(0, lot.quantity - allocatedFromThisLot)
                                        const lotPackagesRemaining = wholePackagesInLot(lotQuantityAfterInvoice, selectedChoice?.conversionFactor ?? 1)
                                        const sellFirst = !expired && lot.expiry && lot.id === eligibleLotForCurrentUnit
                                        return (
                                          <div key={lot.id} className={`grid grid-cols-[minmax(110px,1fr)_90px_100px_74px_74px] gap-2 px-3 py-2 text-[10px] ${expired ? "bg-red-50/70" : sellFirst ? "bg-emerald-50/70" : "bg-white"}`}>
                                            <span className="min-w-0">
                                              <span className="block truncate font-semibold text-slate-700">{lot.supplierName || "Supplier not recorded"}</span>
                                              <span className="block truncate text-[9px] text-slate-400">{lot.supplierId || ""}</span>
                                            </span>
                                            <span className="min-w-0">
                                              <span className="block truncate text-slate-700">{lot.batch || "—"}</span>
                                              <span className="block truncate text-[9px] text-slate-400">{lot.grnNumber || "—"}</span>
                                            </span>
                                            <span className={expired ? "font-semibold text-red-700" : "text-slate-600"}>{lot.expiry || "Not recorded"}</span>
                                            <span className="text-right font-medium text-slate-700">{formatQuantity(lot.quantity)}</span>
                                            <span className={`text-right font-bold ${expired ? "text-red-600" : "text-emerald-700"}`}>{expired ? "BLOCKED" : lotPackagesRemaining}</span>
                                            <span className="col-span-5 -mt-1 text-[9px] font-semibold">
                                              {expired ? <span className="text-red-700">Expired · Do not sell</span> : sellFirst ? <span className="text-emerald-700">Sell this batch first · FEFO</span> : !lot.expiry ? <span className="text-amber-700">Expiry date missing</span> : <span className="text-slate-400">Next by expiry</span>}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <p className="px-3 py-5 text-center text-xs text-slate-500">No supplier batch stock recorded in this warehouse.</p>
                                  )}
                                </section>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                                <span>Changing UOM updates this invoice line, selling price, available quantity, batch allocation and stock deduction together.</span>
                                <button type="button" onClick={() => setUomPickerLineId(null)} className="font-semibold text-emerald-700 hover:underline">Close UOM picker</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
              {cart.length > 0 && (
                <tfoot className="bg-slate-50">
                  <tr className="font-semibold text-slate-800">
                    <td colSpan={6} className="px-3 py-3 text-right">Subtotal</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">AED {subtotal.toFixed(2)}</td>
                    <td></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">AED {vatAmount.toFixed(2)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-slate-900">AED {saleTotals.total.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {saleAllocationPreview.unallocated.length > 0 && (
            <p className="border-t border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              There is not enough complete, non-expired stock for one or more invoice lines. Adjust quantities or UOM before completing the sale.
            </p>
          )}
        </section>

        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Customer
              <select
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value)
                  setLoyaltyPointsToRedeem("0")
                }}
                className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case text-slate-800"
              >
                <option value="">Walk-in Customer</option>
                {customers.filter((customer) => customer.status === "Active").map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name} — {customer.phone}</option>
                ))}
              </select>
            </label>
            {selectedCustomer ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs md:col-span-2">
                <p className="font-semibold text-slate-800">{selectedCustomer.name}</p>
                <p className="mt-1 text-slate-600">{selectedCustomer.phone || "No mobile"} · {selectedCustomer.email || "No email"}</p>
                <p className="mt-1 text-[10px] text-emerald-700">These registered customer details will be copied onto the invoice.</p>
              </div>
            ) : (
              <div className="grid gap-2 rounded-lg border border-slate-200 p-3 md:col-span-2 sm:grid-cols-3">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer name
                  <input value={walkInName} onChange={(event) => setWalkInName(event.target.value)} placeholder="Optional walk-in name" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-xs font-normal normal-case text-slate-800"/>
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mobile
                  <input value={walkInPhone} onChange={(event) => setWalkInPhone(event.target.value)} placeholder="Mobile number" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-xs font-normal normal-case text-slate-800"/>
                </label>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email
                  <input type="email" value={walkInEmail} onChange={(event) => setWalkInEmail(event.target.value)} placeholder="Email address" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-xs font-normal normal-case text-slate-800"/>
                </label>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Discount (AED)
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, subtotal - loyaltyDiscountEstimate)}
                  step="0.01"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  placeholder="0.00"
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case text-slate-800"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Invoice comment
                <textarea
                  value={invoiceNotes}
                  onChange={(event) => setInvoiceNotes(event.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Optional note for this invoice"
                  className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-800"
                />
              </label>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800">Loyalty programme</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {loyaltySettings.enabled
                      ? selectedCustomer
                        ? `Balance: ${selectedCustomer.loyaltyPoints ?? 0} points · Estimated earn: ${estimatedLoyaltyPoints} points`
                        : "Select a registered customer to earn or redeem points."
                      : "Not enabled. The owner can configure this in Settings."}
                  </p>
                </div>
                <label className="text-xs font-semibold text-slate-600">
                  Redeem points
                  <input
                    type="number"
                    min="0"
                    step="1"
                    max={selectedCustomer?.loyaltyPoints ?? 0}
                    disabled={!loyaltySettings.enabled || !selectedCustomer || paymentMethod === "Credit"}
                    value={loyaltyPointsToRedeem}
                    onChange={(event) => setLoyaltyPointsToRedeem(event.target.value)}
                    className="mt-1 h-9 w-28 rounded-md border border-slate-200 bg-white px-2 text-right text-sm disabled:bg-slate-100"
                  />
                </label>
              </div>
              {loyaltyDiscountEstimate > 0 && (
                <p className="mt-2 text-[11px] font-medium text-emerald-700">Loyalty discount: AED {loyaltyDiscountEstimate.toFixed(2)}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment method</p>
              <div className="flex flex-wrap gap-2">
                {enabledPaymentOptions.map(({ method, label, icon: Icon }) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold ${paymentMethod === method ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Icon className="h-4 w-4" />{label}
                  </button>
                ))}
              </div>
            </div>
            {paymentMethod === "Cash" && (
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cash received
                <input
                  type="number"
                  min={saleTotals.total}
                  step="0.01"
                  value={cashTendered}
                  onChange={(event) => setCashTendered(event.target.value)}
                  placeholder={saleTotals.total.toFixed(2)}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case text-slate-800"
                />
              </label>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>AED {subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-600"><span>Discount & loyalty</span><span>- AED {discountAmount.toFixed(2)}</span></div>
              {effectiveLoyaltyPointsRedeemed > 0 && (
                <div className="flex justify-between text-xs text-emerald-700"><span>Points redeemed</span><span>{effectiveLoyaltyPointsRedeemed}</span></div>
              )}
              <div className="flex justify-between text-slate-600"><span>VAT</span><span>AED {vatAmount.toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-900"><span>Total</span><span>AED {total.toFixed(2)}</span></div>
            </div>
            <button
              type="button"
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || saleAllocationPreview.unallocated.length > 0 || enabledPaymentOptions.length === 0}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 className="h-5 w-5" /> Complete Sale & Generate Invoice
            </button>
          </div>
        </section>
        </div>
        </div>
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Scan Barcode
                </h3>
                <p className="text-xs text-slate-500">
                  Point the camera at a product barcode.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-black p-4">
              <video
                ref={videoRef}
                className="aspect-video w-full rounded-xl object-cover"
                muted
                playsInline
              />
            </div>

            <div className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500">
              <ScanLine className="h-4 w-4" />
              Camera scanning is active.
            </div>
          </div>
        </div>
      )}

      {successInvoice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>

            <h3 className="mt-4 text-xl font-semibold text-slate-900">
              Sale Completed
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              The sale has been recorded and inventory has been updated.
            </p>

            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Invoice Number
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {successInvoice}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSuccessInvoice("")
                  clearSale()
                }}
                className="h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                New Sale
              </button>

              <button
                type="button"
                onClick={() => {
                  setSuccessInvoice("")
                  navigate("/sales")
                }}
                className="h-11 rounded-xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-800"
              >
                View Sales
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
