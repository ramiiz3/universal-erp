# Zaki AI (Gemini-only) deployment

Zaki AI uses Google Gemini as its only AI model provider. It does not call
OpenRouter or any other model provider.

The frontend invokes the Supabase Edge Function named `zaki-ai`. Gemini is
called only from that server-side function; the Gemini API key is never
exposed in browser code.

## Configure Gemini

In the hosted Supabase project, open **Edge Functions → Secrets** and add:

- Name: `GEMINI_API_KEY`
- Value: your Gemini API key from Google AI Studio

Optionally add:

- Name: `GEMINI_MODEL`
- Value: `gemini-3.8-flash`

The function defaults to `gemini-3.8-flash` when `GEMINI_MODEL` is omitted.
No OpenRouter key or model setting is required. A previously configured
`OPENROUTER_API_KEY` secret is unused by this version and may be removed
from Supabase Edge Function Secrets.

Keep the Gemini key only in Supabase Edge Function Secrets. Do not put it in
a `VITE_` variable, frontend source code, or a public repository. If the key
was ever stored in a `VITE_` variable or exposed in a deployed browser bundle,
rotate it in Google AI Studio.

## Temporary Gemini service errors

The Edge Function retries temporary network failures and Gemini HTTP 429,
500, 502, 503, and 504 responses up to three attempts, using bounded
exponential backoff. A daily quota-exceeded response is returned immediately;
retries cannot restore exhausted quota. Persistent service overload is
reported to the user rather than silently routing ERP data to another provider.

## Authentication and ERP data

The frontend calls `supabase.functions.invoke("zaki-ai")` with the active
Supabase Auth session. The function verifies the signed-in user through
Supabase Auth before reading company data. Cloud company data is queried with
that user's session, so Supabase row-level security and branch permissions
remain in force. The function does not use a Supabase service-role key.

When a cloud company is selected, the function retrieves relevant live ERP
records for that company. Otherwise, it uses the legacy ERP snapshot supplied
by the browser. The AI request and relevant business data are sent to Google
Gemini to generate the answer. Zaki AI is read-only: it cannot create
transactions, issue refunds, send invoices, or modify ERP records.

## Deployment

The function is declared in `supabase/config.toml` as
`[functions.zaki-ai]`. With Supabase GitHub integration enabled and
**Deploy to production** selected for `main`, changes pushed to `main`
deploy the declared Edge Function. Check the Supabase deployment log for the
function deployment before testing the live AI page.
