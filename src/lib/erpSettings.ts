export type PaymentSettings = {
  cash: boolean
  card: boolean
  credit: boolean
  bankTransfer: boolean
}

export type ERPSettings = {
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

export const DEFAULT_ERP_SETTINGS: ERPSettings = {
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

export function getERPSettings(): ERPSettings {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return DEFAULT_ERP_SETTINGS
    }

    const parsed = JSON.parse(raw)

    return {
      ...DEFAULT_ERP_SETTINGS,
      ...parsed,
      payment: {
        ...DEFAULT_ERP_SETTINGS.payment,
        ...(parsed.payment || {}),
      },
    }
  } catch {
    return DEFAULT_ERP_SETTINGS
  }
}
