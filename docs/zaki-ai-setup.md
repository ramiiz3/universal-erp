# Zaki AI (Gemini) deployment

The legacy ERP AI page invokes the Supabase Edge Function named `zaki-ai`.
It does not call a browser-side Gemini API or a `localhost:8787` service.

## Configure the Gemini secret

In the hosted Supabase project, open the Edge Function Secrets page and add:

- Key: `GEMINI_API_KEY`
- Value: the Gemini API key from Google AI Studio

Optionally set:

- Key: `GEMINI_MODEL`
- Value: `gemini-3.8-flash`

The function defaults to `gemini-3.8-flash` when `GEMINI_MODEL` is omitted.
Keep the Gemini key in Supabase Edge Function Secrets. Do not put it in a
`VITE_` variable, frontend source code, or a public repository. A Gemini key
previously stored in Render is no longer used by this architecture; remove
that unused Render variable after the Supabase secret is saved. If the key was
ever stored in a `VITE_` variable or exposed in a deployed browser bundle,
rotate it in Google AI Studio.

## Authentication and data

The frontend calls `supabase.functions.invoke("zaki-ai")` with the active
Supabase Auth session. The function verifies the user token through Supabase
Auth before sending the supplied ERP snapshot to Gemini. Requests without a
valid signed-in user are rejected. The function does not use a Supabase
service-role or secret key to read or modify ERP tables.

The current legacy AI page sends the current local ERP snapshot and up to eight
recent chat messages with each request. The snapshot is processed by Gemini
only to answer that request; it is not written to the ERP database by this
function. The function is read-only: it cannot create transactions, send
invoices, issue refunds, or change ERP records.

## Deployment

The function is declared in `supabase/config.toml` as
`[functions.zaki-ai]`. With Supabase GitHub integration enabled and
**Deploy to production** selected for `main`, changes pushed to `main` deploy
the declared Edge Function. Check the Supabase deployment log for the
`deploy` step before testing the live AI page.
