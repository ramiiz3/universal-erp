export type ERPUnitCategory =
  | "Count"
  | "Weight"
  | "Volume"
  | "Length"
  | "Time"
  | "Service"
  | "Other"

export type ERPUnitDefinition = {
  id: string
  name: string
  symbol: string
  category: ERPUnitCategory
  decimalPrecision: number
  active: boolean
}

export const ERP_UNITS_STORAGE_KEY = "universal-erp-unit-definitions"
export const ERP_UNITS_EVENT = "universal-erp-units-updated"

const DEFAULT_UNITS: ERPUnitDefinition[] = [
  ["Piece", "pc", "Count", 0],
  ["Unit", "unit", "Count", 0],
  ["Pack", "pack", "Count", 0],
  ["Box", "box", "Count", 0],
  ["Carton", "ctn", "Count", 0],
  ["Strip", "strip", "Count", 0],
  ["Bottle", "btl", "Count", 0],
  ["Tube", "tube", "Count", 0],
  ["Set", "set", "Count", 0],
  ["Kilogram", "kg", "Weight", 3],
  ["Gram", "g", "Weight", 3],
  ["Tonne", "t", "Weight", 3],
  ["Litre", "L", "Volume", 3],
  ["Millilitre", "ml", "Volume", 3],
  ["Metre", "m", "Length", 3],
  ["Centimetre", "cm", "Length", 3],
  ["Hour", "hr", "Time", 2],
  ["Day", "day", "Time", 2],
  ["Service", "service", "Service", 2],
].map(([name, symbol, category, precision]) => ({
  id: `unit-${String(name).toLowerCase()}`,
  name: String(name),
  symbol: String(symbol),
  category: category as ERPUnitCategory,
  decimalPrecision: Number(precision),
  active: true,
}))

function normalise(value: string) {
  return value.trim().toLowerCase()
}

export function getERPUnits(existingUnits: string[] = []) {
  if (typeof window === "undefined") return DEFAULT_UNITS

  let units: ERPUnitDefinition[] = []

  try {
    const raw = localStorage.getItem(ERP_UNITS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null

    if (Array.isArray(parsed)) {
      units = parsed.filter(
        (item) =>
          item &&
          typeof item.name === "string" &&
          typeof item.symbol === "string",
      )
    }
  } catch {
    units = []
  }

  let changed = false

  if (units.length === 0) {
    units = [...DEFAULT_UNITS]
    changed = true
  }

  for (const name of existingUnits) {
    if (!name?.trim()) continue

    if (!units.some((unit) => normalise(unit.name) === normalise(name))) {
      units.push({
        id: `unit-existing-${normalise(name).replace(/\s+/g, "-")}`,
        name: name.trim(),
        symbol: name.trim(),
        category: "Other",
        decimalPrecision: 0,
        active: true,
      })
      changed = true
    }
  }

  if (changed) {
    localStorage.setItem(ERP_UNITS_STORAGE_KEY, JSON.stringify(units))
  }

  return units
}

export function saveERPUnits(units: ERPUnitDefinition[]) {
  localStorage.setItem(ERP_UNITS_STORAGE_KEY, JSON.stringify(units))
  window.dispatchEvent(new Event(ERP_UNITS_EVENT))
}

export function toBaseUnit(quantity: number, conversionFactor: number) {
  if (!Number.isFinite(quantity) || !Number.isFinite(conversionFactor) || conversionFactor <= 0) {
    throw new Error("Invalid quantity or unit conversion factor.")
  }
  return quantity * conversionFactor
}

export function fromBaseUnit(quantity: number, conversionFactor: number) {
  if (!Number.isFinite(quantity) || !Number.isFinite(conversionFactor) || conversionFactor <= 0) {
    throw new Error("Invalid quantity or unit conversion factor.")
  }
  return quantity / conversionFactor
}
