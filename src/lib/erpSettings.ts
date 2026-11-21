import { ERP_SETTINGS_STORAGE_KEY } from "./erpStorageKeys"

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

export const DEFAULT_ERP_SETTINGS: ERPSettings = {
  businessName: "Zaki Pharmacy LLC",
  tagline: "",
  tradeLicenseNumber: "",
  taxNumber: "",
  country: "United Arab Emirates",
  emirate: "",
  poBox: "",
  address: "",
  phone: "+97156 217 1051",
  email: "",
  website: "",
  currency: "AED",
  vatRate: "5",
  invoicePrefix: "INV",
  invoiceFooter:
    "Thank you for your business.",
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
      localStorage.getItem(ERP_SETTINGS_STORAGE_KEY)

    if (!raw) {
      return DEFAULT_ERP_SETTINGS
    }

    const parsed = JSON.parse(raw)

    return {
      ...DEFAULT_ERP_SETTINGS,
      ...parsed,
      businessName: parsed.businessName === "Zaki Pharmacy" ? "Zaki Pharmacy LLC" : (parsed.businessName || DEFAULT_ERP_SETTINGS.businessName),
      phone: !String(parsed.phone ?? "").trim() || String(parsed.phone).trim() === "067446775"
        ? DEFAULT_ERP_SETTINGS.phone
        : String(parsed.phone).trim(),
      tagline: parsed.tagline === "A Family Healthcare Destination" ? "" : (parsed.tagline || ""),
      emirate: parsed.emirate === "Dubai" ? "" : (parsed.emirate || ""),
      invoiceFooter: parsed.invoiceFooter === "Thank you for choosing Zaki Pharmacy."
        ? "Thank you for your business."
        : (parsed.invoiceFooter || DEFAULT_ERP_SETTINGS.invoiceFooter),
      payment: {
        ...DEFAULT_ERP_SETTINGS.payment,
        ...(parsed.payment || {}),
      },
    }
  } catch {
    return DEFAULT_ERP_SETTINGS
  }
}
