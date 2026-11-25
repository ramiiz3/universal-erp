export function getSalePaymentDisplayLabel(
  payment: { paymentMethod: string; cardPaymentOption?: string | null },
): string {
  if (payment.paymentMethod === "Card" && payment.cardPaymentOption) {
    return `Card · ${payment.cardPaymentOption}`
  }
  return payment.paymentMethod
}
