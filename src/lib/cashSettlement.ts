export type CashSettlement = {
  cashTendered: number
  changeDue: number
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Validates cash received and calculates the change returned to the customer. */
export function calculateCashSettlement(total: number, received: number): CashSettlement {
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Sale total must be a valid non-negative amount.")
  }
  if (!Number.isFinite(received) || received < 0) {
    throw new Error("Cash received must be a valid non-negative amount.")
  }

  const roundedTotal = roundMoney(total)
  const cashTendered = roundMoney(received)
  if (cashTendered < roundedTotal) {
    throw new Error("Cash received must be at least equal to the sale total.")
  }

  return {
    cashTendered,
    changeDue: roundMoney(cashTendered - roundedTotal),
  }
}
