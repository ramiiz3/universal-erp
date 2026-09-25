import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Banknote,
  Camera,
  CheckCircle2,
  CreditCard,
  Landmark,
  Minus,
  Plus,
  Search,
  ScanLine,
  ShoppingCart,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { BrowserMultiFormatReader } from "@zxing/browser"
import { useERP, type PaymentMethod, type Product } from "../context/ERPContext"
import { getERPSettings } from "../lib/erpSettings"

type CartItem = {
  productId: string
  product: Product
  quantity: number
  unitPrice: number
}

export default function POS() {
  const navigate = useNavigate()
  const {
    products,
    customers,
    getProductStock,
    completeSale,
  } = useERP()

  const erpSettings = getERPSettings()

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
  const [customerId, setCustomerId] = useState("")
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(() => {
      const settings = getERPSettings()

      if (settings.payment.cash) return "Cash"
      if (settings.payment.card) return "Card"
      if (settings.payment.credit) return "Credit"
      return "Bank Transfer"
    })
  const [discount, setDiscount] = useState("")
  const [error, setError] = useState("")
  const [successInvoice, setSuccessInvoice] = useState("")
  const [cameraOpen, setCameraOpen] = useState(false)

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
      if (!query) return true

      return (
        product.name.toLowerCase().includes(query) ||
        product.barcode.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
      )
    })
  }, [products, search])

  const subtotal = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    )
  }, [cart])

  const discountAmount = useMemo(() => {
    const value = Number(discount) || 0
    return Math.min(Math.max(value, 0), subtotal)
  }, [discount, subtotal])

  const vatAmount = useMemo(() => {
    if (!subtotal) return 0

    let vat = 0

    for (const item of cart) {
      const lineSubtotal = item.quantity * item.unitPrice
      const lineDiscount =
        discountAmount > 0
          ? discountAmount * (lineSubtotal / subtotal)
          : 0

      const taxableAmount = Math.max(0, lineSubtotal - lineDiscount)

      vat += taxableAmount * (item.product.vatRate / 100)
    }

    return vat
  }, [cart, discountAmount, subtotal])

  const total = Math.max(
    0,
    Number((subtotal - discountAmount + vatAmount).toFixed(2)),
  )

  function handleBarcode(code: string) {
    const cleanCode = code.trim()
    if (!cleanCode) return

    setError("")

    const product = products.find(
      (item) =>
        item.barcode.trim().toLowerCase() === cleanCode.toLowerCase(),
    )

    if (!product) {
      setError(`No product found for barcode ${cleanCode}`)
      return
    }

    addToCart(product)
    setBarcode("")
    requestAnimationFrame(() => barcodeInputRef.current?.focus())
  }

  function addToCart(product: Product) {
    setError("")

    const stock = getProductStock(product.id)

    if (stock <= 0) {
      setError(`${product.name} is out of stock.`)
      return
    }

    setCart((current) => {
      const existing = current.find(
        (item) => item.productId === product.id,
      )

      if (!existing) {
        return [
          ...current,
          {
            productId: product.id,
            product,
            quantity: 1,
            unitPrice: product.sellingPrice,
          },
        ]
      }

      if (existing.quantity >= stock) {
        setError(
          `${product.name} only has ${stock} unit${
            stock === 1 ? "" : "s"
          } available.`,
        )
        return current
      }

      return current.map((item) =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      )
    })
  }

  function updateQuantity(productId: string, nextQuantity: number) {
    const product = products.find((item) => item.id === productId)
    if (!product) return

    const stock = getProductStock(productId)

    if (nextQuantity <= 0) {
      setCart((current) =>
        current.filter((item) => item.productId !== productId),
      )
      return
    }

    if (nextQuantity > stock) {
      setError(
        `${product.name} only has ${stock} unit${
          stock === 1 ? "" : "s"
        } available.`,
      )
      return
    }

    setError("")

    setCart((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: nextQuantity }
          : item,
      ),
    )
  }

  function removeItem(productId: string) {
    setCart((current) =>
      current.filter((item) => item.productId !== productId),
    )
  }

  function clearSale() {
    setCart([])
    setCustomerId("")
    setPaymentMethod("Cash")
    setDiscount("")
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

    try {
      const sale = completeSale({
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        customerId: customerId || null,
        paymentMethod,
        discount: discountAmount,
      })

      setSuccessInvoice(sale.invoiceNumber)
      clearSale()
    } catch (saleError) {
      setError(
        saleError instanceof Error
          ? saleError.message
          : "Could not complete the sale.",
      )
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Point of Sale
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Scan products, build the cart, select payment and complete the sale.
            </p>
          </div>

          <button
            type="button"
            onClick={clearSale}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            New Sale
          </button>
        </div>

        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <X className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-auto rounded-lg p-1 hover:bg-red-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_500px]">
          <div className="min-w-0">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="relative">
                  <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={barcodeInputRef}
                    value={barcode}
                    onChange={(event) => setBarcode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        handleBarcode(barcode)
                      }
                    }}
                    placeholder="Scan barcode with USB scanner..."
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setError("")
                    setCameraOpen(true)
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <Camera className="h-4 w-4" />
                  Camera Scan
                </button>
              </div>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products by name, SKU, barcode or category..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const stock = getProductStock(product.id)
                const inCart =
                  cart.find((item) => item.productId === product.id)
                    ?.quantity ?? 0

                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={stock <= 0}
                    onClick={() => addToCart(product)}
                    className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-medium text-slate-900">
                          {product.name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {product.category}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {product.unit}
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xl font-semibold text-slate-900">
                          AED {product.sellingPrice.toFixed(2)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Stock: {stock}
                          {inCart > 0 ? ` • In cart: ${inCart}` : ""}
                        </p>
                      </div>

                      <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white">
                        Add
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {filteredProducts.length === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">
                  No products found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Try another product name, SKU or barcode.
                </p>
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Current Sale
                  </h2>
                  <p className="text-xs text-slate-500">
                    {cart.length} item{cart.length === 1 ? "" : "s"}
                  </p>
                </div>

                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[450px] overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                  <ShoppingCart className="h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-medium text-slate-700">
                    Cart is empty
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    Scan a barcode or click a product to add it to the sale.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div
                      key={item.productId}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            {item.product.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            AED {item.unitPrice.toFixed(2)} × {item.quantity}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${item.product.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="inline-flex items-center rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.quantity - 1,
                              )
                            }
                            className="p-2 text-slate-500 hover:bg-slate-50"
                          >
                            <Minus className="h-4 w-4" />
                          </button>

                          <span className="min-w-10 text-center text-sm font-medium text-slate-800">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.quantity + 1,
                              )
                            }
                            className="p-2 text-slate-500 hover:bg-slate-50"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>

                        <p className="font-semibold text-slate-900">
                          AED{" "}
                          {(item.quantity * item.unitPrice).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-5">
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Customer
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="">Walk-in Customer</option>
                      {customers
                        .filter((customer) => customer.status === "Active")
                        .map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} — {customer.phone}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Discount
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    placeholder="0.00"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Payment Method
                  </label>

                  {enabledPaymentOptions.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {enabledPaymentOptions.map(
                        ({
                          method,
                          label,
                          icon: Icon,
                        }) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() =>
                              setPaymentMethod(
                                method,
                              )
                            }
                            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition ${
                              paymentMethod ===
                              method
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      No payment methods are enabled. Enable at least one in Settings.
                    </div>
                  )}
                </div>
              </div>

              <div className="my-5 border-t border-dashed border-slate-200" />

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>AED {subtotal.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Discount</span>
                  <span>- AED {discountAmount.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>VAT</span>
                  <span>AED {vatAmount.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between pt-2 text-lg font-semibold text-slate-900">
                  <span>Total</span>
                  <span>AED {total.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={cart.length === 0}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-5 w-5" />
                Complete Sale
              </button>
            </div>
          </aside>
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
