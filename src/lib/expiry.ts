export function parseExpiryDate(value: string): Date | null {
  const trimmed = value?.trim?.() ?? ""

  if (!trimmed) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, month] = trimmed.split("-").map(Number)
    const parsed = new Date(year, month - 1, 1)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [monthText, yearText] = trimmed.split("/")
    const month = Number(monthText)
    const year = Number(yearText)
    const parsed = new Date(year, month - 1, 1)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [dayText, monthText, yearText] = trimmed.split("/")
    const parsed = new Date(Number(yearText), Number(monthText) - 1, Number(dayText))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatExpiryDisplay(value: string) {
  const trimmed = value?.trim?.() ?? ""

  if (!trimmed) {
    return "Not set"
  }

  const monthYear = /^\d{1,2}\/\d{4}$|^\d{4}-\d{2}$/.test(trimmed)
  const fullDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)

  const date = parseExpiryDate(trimmed)

  if (!date) {
    return trimmed
  }

  if (monthYear) {
    return date.toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    })
  }

  if (fullDate) {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function expiryWithinWindow(value: string, start: Date, end: Date) {
  const expiryDate = parseExpiryDate(value)

  if (!expiryDate) {
    return false
  }

  const startOfPeriod = new Date(start)
  startOfPeriod.setHours(0, 0, 0, 0)

  const endOfPeriod = new Date(end)
  endOfPeriod.setHours(23, 59, 59, 999)

  return expiryDate >= startOfPeriod && expiryDate <= endOfPeriod
}

export function normalizeExpiryValue(value: string) {
  const trimmed = value?.trim?.() ?? ""

  if (!trimmed) {
    return ""
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 7)
  }

  if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [month, year] = trimmed.split("/")
    return `${year}-${String(Number(month)).padStart(2, "0")}`
  }

  return trimmed
}
