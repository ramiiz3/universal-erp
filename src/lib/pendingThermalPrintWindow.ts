let pendingPrintWindow: Window | null = null

export function reservePendingThermalPrintWindow(
  printWindow: Window | null,
) {
  if (
    pendingPrintWindow &&
    pendingPrintWindow !== printWindow &&
    !pendingPrintWindow.closed
  ) {
    pendingPrintWindow.close()
  }

  pendingPrintWindow = printWindow
}

export function takePendingThermalPrintWindow(): Window | null {
  const printWindow = pendingPrintWindow
  pendingPrintWindow = null

  if (!printWindow || printWindow.closed) return null
  return printWindow
}

export function closePendingThermalPrintWindow() {
  if (pendingPrintWindow && !pendingPrintWindow.closed) {
    pendingPrintWindow.close()
  }
  pendingPrintWindow = null
}
