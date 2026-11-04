export type CloudAIMessage = {
  role: "user" | "assistant"
  text: string
}

export type CloudAIRequest = {
  companyId: string
  message: string
  history: CloudAIMessage[]
}

export function buildCloudAIRequest(
  companyId: string,
  message: string,
  history: CloudAIMessage[],
): CloudAIRequest {
  const normalizedCompanyId = companyId.trim()
  const normalizedMessage = message.trim()

  if (!normalizedCompanyId) {
    throw new Error("Select an active company before asking Zaki AI.")
  }
  if (!normalizedMessage) {
    throw new Error("Enter a question for Zaki AI.")
  }
  if (normalizedMessage.length > 4_000) {
    throw new Error("Keep your question under 4,000 characters.")
  }

  return {
    companyId: normalizedCompanyId,
    message: normalizedMessage,
    history: history
      .filter((item) => (
        (item.role === "user" || item.role === "assistant")
        && typeof item.text === "string"
        && item.text.trim().length > 0
        && item.text.length <= 2_000
      ))
      .slice(-8)
      .map((item) => ({ role: item.role, text: item.text.trim() })),
  }
}

export function cloudAIProviderLabel(provider: string | undefined) {
  if (provider === "OpenRouter") return "OpenRouter · free fallback"
  if (provider === "Gemini") return "Gemini"
  return "ERP assistant"
}
