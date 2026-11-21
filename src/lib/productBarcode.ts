export type CompanyBarcodeIdentity = {
  companyName: string
  mobileNumber: string
}

export function normalizeBarcodeCompanyName(companyName: string): string {
  return companyName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 32)
}

export function normalizeBarcodeMobile(mobileNumber: string): string {
  return mobileNumber.replace(/\D/g, "")
}

/**
 * Builds an internal Code 128 value:
 * COMPANYNAME-MOBILEDIGITS-UNIQUEPRODUCTCODE
 *
 * This is an internal company barcode, not a GS1/EAN product identifier.
 */
export function buildCompanyProductBarcode(
  identity: CompanyBarcodeIdentity,
  uniqueProductCode: string,
): string {
  const company = normalizeBarcodeCompanyName(identity.companyName)
  const mobile = normalizeBarcodeMobile(identity.mobileNumber)
  const suffix = uniqueProductCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16)

  if (!company) throw new Error("Enter the company name before generating a barcode.")
  if (mobile.length < 7) throw new Error("Enter the company's mobile number in Settings before generating a barcode.")
  if (suffix.length < 6) throw new Error("A unique product code of at least six characters is required.")

  return `${company}-${mobile}-${suffix}`
}

export function generateCompanyProductBarcode(identity: CompanyBarcodeIdentity): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure barcode generation is unavailable in this browser. Enter a barcode manually.")
  }
  return buildCompanyProductBarcode(
    identity,
    globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8),
  )
}
