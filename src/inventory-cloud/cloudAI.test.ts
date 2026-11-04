import { describe, expect, it } from "vitest"
import { buildCloudAIRequest, cloudAIProviderLabel } from "./cloudAI"

describe("buildCloudAIRequest", () => {
  it("requires a selected company and a non-empty question", () => {
    expect(() => buildCloudAIRequest("", "Show sales", [])).toThrow(/active company/)
    expect(() => buildCloudAIRequest("company-1", "   ", [])).toThrow(/Enter a question/)
  })

  it("trims the question and sends only the latest eight valid history messages", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      text: ` message ${index} `,
    }))
    history.push({ role: "user", text: " ".repeat(3) })

    const request = buildCloudAIRequest(" company-1 ", "  Show today's sales  ", history)

    expect(request.companyId).toBe("company-1")
    expect(request.message).toBe("Show today's sales")
    expect(request.history).toHaveLength(8)
    expect(request.history[0].text).toBe("message 2")
    expect(request.history[7].text).toBe("message 9")
  })

  it("rejects questions over 4,000 characters", () => {
    expect(() => buildCloudAIRequest("company-1", "x".repeat(4_001), []))
      .toThrow(/4,000 characters/)
  })

  it("removes invalid history entries", () => {
    const request = buildCloudAIRequest("company-1", "Find an invoice", [
      { role: "user", text: "valid" },
      { role: "system", text: "not allowed" } as never,
      { role: "assistant", text: " ".repeat(10) },
      { role: "user", text: "x".repeat(2_001) },
    ])
    expect(request.history).toEqual([{ role: "user", text: "valid" }])
  })
})

describe("cloudAIProviderLabel", () => {
  it("identifies the Gemini and free OpenRouter providers", () => {
    expect(cloudAIProviderLabel("Gemini")).toBe("Gemini")
    expect(cloudAIProviderLabel("OpenRouter")).toContain("free fallback")
    expect(cloudAIProviderLabel(undefined)).toBe("ERP assistant")
  })
})
