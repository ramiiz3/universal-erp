const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    )
  }

  try {
    const body = await req.json()

    const {
      toEmail,
      toName,
      invoiceNumber,
      total,
      pdfBase64,
    } = body

    if (
      typeof toEmail !== "string" ||
      !toEmail.includes("@")
    ) {
      return jsonResponse(
        { error: "A valid customer email is required." },
        400,
      )
    }

    if (
      typeof invoiceNumber !== "string" ||
      !invoiceNumber.trim()
    ) {
      return jsonResponse(
        { error: "Invoice number is required." },
        400,
      )
    }

    if (
      typeof pdfBase64 !== "string" ||
      !pdfBase64
    ) {
      return jsonResponse(
        { error: "Invoice PDF is required." },
        400,
      )
    }

    if (pdfBase64.length > 10_000_000) {
      return jsonResponse(
        { error: "Invoice PDF is too large." },
        413,
      )
    }

    const brevoApiKey = Deno.env.get("BREVO_API_KEY")
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL")
    const senderName =
      Deno.env.get("BREVO_SENDER_NAME") ||
      "Al Khalis & Zaki Pharmacy"

    if (!brevoApiKey) {
      return jsonResponse(
        { error: "BREVO_API_KEY is not configured." },
        500,
      )
    }

    if (!senderEmail) {
      return jsonResponse(
        { error: "BREVO_SENDER_EMAIL is not configured." },
        500,
      )
    }

    const safeName =
      typeof toName === "string" && toName.trim()
        ? toName.trim()
        : "Customer"

    const safeInvoiceNumber = escapeHtml(invoiceNumber)
    const safeCustomerName = escapeHtml(safeName)
    const safeTotal = escapeHtml(
      typeof total === "string" ? total : String(total ?? ""),
    )

    const brevoResponse = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail,
          },

          to: [
            {
              email: toEmail,
              name: safeName,
            },
          ],

          subject:
            `Invoice ${invoiceNumber} - Al Khalis & Zaki Pharmacy`,

          htmlContent: `
            <!DOCTYPE html>
            <html>
              <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
                <div style="max-width:640px;margin:40px auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
                  <h2 style="margin:0 0 8px;font-size:24px;">
                    Al Khalis &amp; Zaki Pharmacy
                  </h2>

                  <p style="margin:0 0 28px;color:#64748b;">
                    Invoice
                  </p>

                  <p>
                    Hello ${safeCustomerName},
                  </p>

                  <p>
                    Thank you for your purchase from Al Khalis &amp; Zaki Pharmacy.
                  </p>

                  <div style="margin:24px 0;padding:20px;background:#f8fafc;border-radius:12px;">
                    <p style="margin:0 0 8px;">
                      <strong>Invoice:</strong> ${safeInvoiceNumber}
                    </p>

                    <p style="margin:0;">
                      <strong>Total:</strong> AED ${safeTotal}
                    </p>
                  </div>

                  <p>
                    Please find your invoice attached to this email as a PDF.
                  </p>

                  <p style="margin-top:32px;">
                    Regards,<br />
                    <strong>Al Khalis &amp; Zaki Pharmacy</strong>
                  </p>
                </div>
              </body>
            </html>
          `,

          attachment: [
            {
              content: pdfBase64,
              name: `${invoiceNumber}.pdf`,
            },
          ],
        }),
      },
    )

    const brevoData = await brevoResponse.json()

    if (!brevoResponse.ok) {
      console.error("Brevo error:", brevoData)

      return jsonResponse(
        {
          error:
            brevoData?.message ||
            "Brevo failed to send the invoice.",
        },
        502,
      )
    }

    return jsonResponse({
      success: true,
      messageId: brevoData.messageId ?? null,
    })
  } catch (error) {
    console.error("send-invoice error:", error)

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      500,
    )
  }
})
