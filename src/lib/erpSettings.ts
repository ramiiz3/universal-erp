import { ERP_SETTINGS_STORAGE_KEY } from "./erpStorageKeys"

export type PaymentSettings = {
  cash: boolean
  card: boolean
  credit: boolean
  bankTransfer: boolean
}

export type LoyaltySettings = {
  enabled: boolean
  /** Points awarded for each unit of currency earned after discounts. */
  pointsPerCurrencyUnit: number
  /** Currency value of one redeemed point. */
  currencyPerPoint: number
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
  loyalty: LoyaltySettings
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
  loyalty: {
    enabled: false,
    pointsPerCurrencyUnit: 0.1,
    currencyPerPoint: 0.1,
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
      vatRate: Number(parsed.vatRate) > 0 ? String(parsed.vatRate) : "5",
      invoiceFooter: parsed.invoiceFooter === "Thank you for choosing Zaki Pharmacy."
        ? "Thank you for your business."
        : (parsed.invoiceFooter || DEFAULT_ERP_SETTINGS.invoiceFooter),
      payment: {
        ...DEFAULT_ERP_SETTINGS.payment,
        ...(parsed.payment || {}),
      },
      loyalty: {
        ...DEFAULT_ERP_SETTINGS.loyalty,
        ...(parsed.loyalty || {}),
        enabled: Boolean(parsed.loyalty?.enabled),
        pointsPerCurrencyUnit: Number.isFinite(Number(parsed.loyalty?.pointsPerCurrencyUnit))
          ? Math.max(0, Number(parsed.loyalty.pointsPerCurrencyUnit))
          : DEFAULT_ERP_SETTINGS.loyalty.pointsPerCurrencyUnit,
        currencyPerPoint: Number.isFinite(Number(parsed.loyalty?.currencyPerPoint))
          ? Math.max(0, Number(parsed.loyalty.currencyPerPoint))
          : DEFAULT_ERP_SETTINGS.loyalty.currencyPerPoint,
      },
    }
  } catch {
    return DEFAULT_ERP_SETTINGS
  }
}
