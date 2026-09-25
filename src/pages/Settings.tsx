import { useState } from "react"
import type { FormEvent } from "react"
import {
  Banknote,
  Building2,
  CreditCard,
  FileText,
  Landmark,
  Save,
  Settings as SettingsIcon,
} from "lucide-react"

type PaymentSettings = {
  cash: boolean
  card: boolean
  credit: boolean
  bankTransfer: boolean
}

type SettingsData = {
  businessName: string
  tagline: string
  tradeLicenseNumber: string
  taxNumber: string
  country: string
  emirate: string
  poBox: string
  address: string
  phone: string
  email: string
  website: string
  currency: string
  vatRate: string
  invoicePrefix: string
  invoiceFooter: string
  vatRegistered: boolean
  payment: PaymentSettings
}

const STORAGE_KEY = "universal-erp-settings"

const defaultSettings: SettingsData = {
  businessName: "Zaki Pharmacy",
  tagline: "A Family Healthcare Destination",
  tradeLicenseNumber: "",
  taxNumber: "",
  country: "United Arab Emirates",
  emirate: "Dubai",
  poBox: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  currency: "AED",
  vatRate: "5",
  invoicePrefix: "INV",
  invoiceFooter:
    "Thank you for choosing Zaki Pharmacy.",
  vatRegistered: true,
  payment: {
    cash: true,
    card: true,
    credit: true,
    bankTransfer: true,
  },
}

function loadSettings(): SettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) return defaultSettings

    const parsed = JSON.parse(raw)

    return {
      ...defaultSettings,
      ...parsed,
      payment: {
        ...defaultSettings.payment,
        ...(parsed.payment || {}),
      },
    }
  } catch {
    return defaultSettings
  }
}

export default function Settings() {
  const [settings, setSettings] =
    useState<SettingsData>(loadSettings)

  const [saved, setSaved] = useState(false)

  function update(
    field: keyof SettingsData,
    value: string | boolean,
  ) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }))

    setSaved(false)
  }

  function updatePayment(
    field: keyof PaymentSettings,
    value: boolean,
  ) {
    setSettings((current) => ({
      ...current,
      payment: {
        ...current.payment,
        [field]: value,
      },
    }))

    setSaved(false)
  }

  function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault()

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings),
    )

    setSaved(true)

    window.setTimeout(() => {
      setSaved(false)
    }, 2500)
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1450px]">
        <div className="mb-7">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-slate-700" />

            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Settings
            </h1>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Zaki Pharmacy — Dubai business, tax, invoice and payment settings.
          </p>
        </div>

        {saved && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Settings saved successfully.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* BUSINESS */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                    <Building2 className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Business Information
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Zaki Pharmacy's official business details.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Business Name
                  </label>

                  <input
                    value={settings.businessName}
                    onChange={(event) =>
                      update(
                        "businessName",
                        event.target.value,
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Tagline
                  </label>

                  <input
                    value={settings.tagline}
                    onChange={(event) =>
                      update(
                        "tagline",
                        event.target.value,
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Trade License Number
                  </label>

                  <input
                    value={
                      settings.tradeLicenseNumber
                    }
                    onChange={(event) =>
                      update(
                        "tradeLicenseNumber",
                        event.target.value,
                      )
                    }
                    placeholder="Enter trade license number"
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    TRN / VAT Registration Number
                  </label>

                  <input
                    value={settings.taxNumber}
                    onChange={(event) =>
                      update(
                        "taxNumber",
                        event.target.value,
                      )
                    }
                    placeholder="Enter UAE TRN"
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Country
                  </label>

                  <input
                    value={settings.country}
                    disabled
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Emirate
                  </label>

                  <input
                    value={settings.emirate}
                    disabled
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    PO Box
                  </label>

                  <input
                    value={settings.poBox}
                    onChange={(event) =>
                      update(
                        "poBox",
                        event.target.value,
                      )
                    }
                    placeholder="PO Box"
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Phone
                  </label>

                  <input
                    value={settings.phone}
                    onChange={(event) =>
                      update(
                        "phone",
                        event.target.value,
                      )
                    }
                    placeholder="+971..."
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Email
                  </label>

                  <input
                    type="email"
                    value={settings.email}
                    onChange={(event) =>
                      update(
                        "email",
                        event.target.value,
                      )
                    }
                    placeholder="info@zaki..." 
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Website
                  </label>

                  <input
                    value={settings.website}
                    onChange={(event) =>
                      update(
                        "website",
                        event.target.value,
                      )
                    }
                    placeholder="https://..."
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Dubai Address
                  </label>

                  <textarea
                    value={settings.address}
                    onChange={(event) =>
                      update(
                        "address",
                        event.target.value,
                      )
                    }
                    rows={3}
                    placeholder="Shop / building / street / area / Dubai"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>
              </div>
            </div>

            {/* TAX */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
                    <Landmark className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Tax & VAT
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      UAE VAT configuration for Zaki Pharmacy.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Currency
                  </label>

                  <input
                    value={settings.currency}
                    disabled
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Default VAT Rate
                  </label>

                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={settings.vatRate}
                      onChange={(event) =>
                        update(
                          "vatRate",
                          event.target.value,
                        )
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 pr-10 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                    />

                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      %
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      VAT Registered
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Show VAT details on invoices.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      settings.vatRegistered
                    }
                    onChange={(event) =>
                      update(
                        "vatRegistered",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* INVOICE */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
                    <FileText className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Invoice Settings
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Configure Zaki Pharmacy invoice presentation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Invoice Prefix
                  </label>

                  <input
                    value={settings.invoicePrefix}
                    onChange={(event) =>
                      update(
                        "invoicePrefix",
                        event.target.value.toUpperCase(),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm uppercase outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Example Number
                  </label>

                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700">
                    {settings.invoicePrefix || "INV"}-2026-00001
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Invoice Footer
                  </label>

                  <textarea
                    value={settings.invoiceFooter}
                    onChange={(event) =>
                      update(
                        "invoiceFooter",
                        event.target.value,
                      )
                    }
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
                  />
                </div>
              </div>
            </div>

            {/* PAYMENT */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700">
                    <CreditCard className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Payment Methods
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Payment methods available to the cashier in POS.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                {[
                  {
                    key: "cash" as const,
                    label: "Cash",
                    description:
                      "Cash payment at the pharmacy counter.",
                    icon: Banknote,
                  },
                  {
                    key: "card" as const,
                    label: "Card",
                    description:
                      "Card terminal / bank card payment.",
                    icon: CreditCard,
                  },
                  {
                    key: "credit" as const,
                    label: "Credit",
                    description:
                      "Customer credit / receivable sale.",
                    icon: FileText,
                  },
                  {
                    key: "bankTransfer" as const,
                    label: "Bank Transfer",
                    description:
                      "Payment received by bank transfer.",
                    icon: Landmark,
                  },
                ].map((method) => {
                  const Icon = method.icon

                  return (
                    <label
                      key={method.key}
                      className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {method.label}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {method.description}
                          </p>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={
                          settings.payment[
                            method.key
                          ]
                        }
                        onChange={(event) =>
                          updatePayment(
                            method.key,
                            event.target.checked,
                          )
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#17221D] px-7 text-sm font-semibold text-white shadow-sm hover:bg-[#24342B]"
              >
                <Save className="h-4 w-4" />
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
