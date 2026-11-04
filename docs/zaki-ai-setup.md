# Zaki AI — cloud ERP data search and model fallback

Zaki AI is available inside the authenticated company workspace at
`/workspace/ai`. The legacy `/ai` navigation entry redirects to this page
after the user signs in and selects an active company.

## Required Supabase Edge Function secrets

In the hosted Supabase project, open Edge Function Secrets and add:

- `GEMINI_API_KEY`: Google AI Studio API key (primary provider).
- `OPENROUTER_API_KEY`: OpenRouter API key (free-model fallback).

Optional:

- `GEMINI_MODEL`: Gemini model ID. The function currently defaults to
  `gemini-3.8-flash`.
- `OPENROUTER_MODEL`: A free OpenRouter model slug. The function accepts
  `openrouter/free` or model IDs ending in `:free`; any paid model ID is
  replaced with `openrouter/free`.

Keep both provider keys in Supabase Edge Function Secrets. Never put them in a
`VITE_` variable, frontend code, Render environment variables, or the
repository. Do not add Supabase service-role or secret API keys for this feature.

OpenRouter free models are rate-limited and availability can vary. Its free
router selects only free models; it does not guarantee uninterrupted inference.

## Data access and security

The frontend invokes `supabase.functions.invoke("zaki-ai")` with the signed-in
user session, the selected company ID, the question, and recent chat history.
It does not send a browser localStorage snapshot.

The Edge Function:

1. Validates the caller's Supabase Auth access token.
2. Verifies an active membership for the requested company and derives branch
   assignments from the caller's membership rows.
3. Uses a Supabase client carrying the caller's JWT to query company tables.
   Row Level Security therefore remains in force. No service-role key is used.
4. Retrieves only the data domains relevant to the question, with bounded row
   limits: products, inventory lots, stock movements, sales/invoices, payment
   records, suppliers, purchase orders, and purchase lines.
5. Sends the question and retrieved records to Gemini. If Gemini is unavailable
   or fails, it tries the configured OpenRouter free model.

Contact fields are omitted unless the question explicitly asks for phone,
mobile, email, contact details, or address. The cloud schema currently has no
separate customer master table; customer lookup is based on customer snapshots
stored on cloud invoices. The assistant must disclose this limitation.

Zaki AI is read-only. It cannot create sales, receive purchases, change stock,
edit invoices, issue refunds, or send messages.

## Privacy and provider use

Questions and the retrieved records required to answer them are sent to the
configured AI provider. Gemini is primary; OpenRouter may receive the same
question and context when fallback is needed. Avoid asking for or sending
unnecessary sensitive personal or medical information.

## Deployment

The function is declared in `supabase/config.toml` as
`[functions.zaki-ai]`. With the Supabase GitHub integration enabled and
production deployment configured for `main`, pushing changes to `main`
deploys the updated function. Check the Supabase deployment log for the
function deploy step before testing the hosted AI page.
