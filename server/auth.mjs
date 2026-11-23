export function extractBearerToken(request) {
  const value = request.headers.authorization;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export async function verifySupabaseAccessToken(
  token,
  { supabaseUrl, publishableKey, fetchImpl = fetch },
) {
  if (!token || !supabaseUrl || !publishableKey) return null;

  let response;
  try {
    const base = supabaseUrl.replace(/\/+$/, "");
    response = await fetchImpl(base + "/auth/v1/user", {
      method: "GET",
      headers: {
        apikey: publishableKey,
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;
  let user;
  try {
    user = await response.json();
  } catch {
    return null;
  }
  if (
    !user ||
    typeof user.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)
  ) {
    return null;
  }

  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email.trim().toLowerCase() : null,
    emailConfirmedAt: typeof user.email_confirmed_at === "string"
      ? user.email_confirmed_at
      : typeof user.confirmed_at === "string" ? user.confirmed_at : null,
  };
}
