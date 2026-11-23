import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  canDeleteRecords, canReadCompany, canWriteRecords, normalizeEmail,
  validateEntityType, validateJsonValue, validateRecordId,
} from "./access.mjs";
import { extractBearerToken } from "./auth.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 1024 * 1024;

function send(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body is too large."), { status: 413 });
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must contain valid JSON."), { status: 400 });
  }
}

function safeCompanyInput(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const legalName = typeof body.legalName === "string" ? body.legalName.trim() : "";
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : "";
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const taxRate = Number(body.taxRate ?? 0);
  const invoicePrefix = typeof body.invoicePrefix === "string" ? body.invoicePrefix.trim() : "INV";
  if (name.length < 2 || name.length > 200) throw Object.assign(new Error("Company name must contain 2–200 characters."), { status: 400 });
  if (legalName.length < 2 || legalName.length > 250) throw Object.assign(new Error("Legal name must contain 2–250 characters."), { status: 400 });
  if (!/^[A-Z]{2}$/.test(country)) throw Object.assign(new Error("Country must be a 2-letter ISO country code."), { status: 400 });
  if (!/^[A-Z]{3}$/.test(currency)) throw Object.assign(new Error("Currency must be a 3-letter ISO code."), { status: 400 });
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw Object.assign(new Error("Tax rate must be between 0 and 100."), { status: 400 });
  if (!/^[A-Za-z0-9_-]{1,12}$/.test(invoicePrefix)) throw Object.assign(new Error("Invoice prefix may contain 1–12 letters, numbers, underscores or hyphens."), { status: 400 });
  return {
    name, legalName, country, currency, taxRate, invoicePrefix,
    address: typeof body.address === "string" ? body.address.trim().slice(0, 1000) : "",
    phone: typeof body.phone === "string" ? body.phone.trim().slice(0, 60) : "",
    email: normalizeEmail(body.email) ?? "",
    taxRegistrationNumber: typeof body.taxRegistrationNumber === "string" ? body.taxRegistrationNumber.trim().slice(0, 100) : "",
    invoiceFooter: typeof body.invoiceFooter === "string" ? body.invoiceFooter.trim().slice(0, 2000) : "",
  };
}

function createInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

async function withUserTransaction(pool, userId, callback) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('erp.user_id', $1, true)", [userId]);
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function getMembership(client, userId, companyId) {
  const result = await client.query(
    "select m.company_id, m.role, m.branch_id, c.name as company_name, c.currency, c.country " +
    "from public.erp_company_memberships m " +
    "join public.erp_companies c on c.id = m.company_id " +
    "where m.user_id = $1 and m.company_id = $2 and m.status = 'active' limit 1",
    [userId, companyId],
  );
  return result.rows[0] ?? null;
}

function createRateLimiter({ windowMs = 60_000, max = 180 } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (buckets.size > 5000) {
        for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
      }
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  };
}

export function createApp({ pool, authenticate, frontendOrigin = "" }) {
  if (!pool || typeof authenticate !== "function") {
    throw new TypeError("createApp requires a PostgreSQL pool and an authentication function.");
  }
  const allowOrigin = new Set(
    (frontendOrigin || "http://localhost:5173,http://127.0.0.1:5173")
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
  const rateLimit = createRateLimiter();

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && allowOrigin.has(origin)) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "Origin");
      response.setHeader("access-control-allow-headers", "authorization,content-type");
      response.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    }
    if (request.method === "OPTIONS") {
      response.writeHead(origin && !allowOrigin.has(origin) ? 403 : 204);
      return response.end();
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const ip = request.socket.remoteAddress ?? "unknown";
    if (!rateLimit(ip)) return send(response, 429, { error: "Too many requests. Please try again shortly." });

    try {
      if (request.method === "GET" && pathname === "/health/live") {
        return send(response, 200, { status: "ok", service: "universal-erp-api" });
      }
      if (request.method === "GET" && pathname === "/health/ready") {
        await pool.query("select 1");
        return send(response, 200, { status: "ready", database: "connected" });
      }
      if (!pathname.startsWith("/api/v1/")) return send(response, 404, { error: "Route not found." });

      const token = extractBearerToken(request);
      if (!token) return send(response, 401, { error: "Sign in to continue." });
      const user = await authenticate(token);
      if (!user?.id || !UUID_RE.test(user.id)) {
        return send(response, 401, { error: "Your session is invalid or has expired. Please sign in again." });
      }

      if (request.method === "GET" && pathname === "/api/v1/me") {
        const memberships = await withUserTransaction(pool, user.id, async (client) => {
          const result = await client.query(
            "select m.company_id, m.role, m.branch_id, m.joined_at, " +
            "c.name as company_name, c.legal_name, c.country, c.currency " +
            "from public.erp_company_memberships m " +
            "join public.erp_companies c on c.id = m.company_id " +
            "where m.user_id = $1 and m.status = 'active' order by c.name",
            [user.id],
          );
          return result.rows;
        });
        return send(response, 200, { user: { id: user.id, email: user.email }, companies: memberships });
      }

      if (request.method === "POST" && pathname === "/api/v1/companies") {
        const input = safeCompanyInput(await readJson(request));
        const companyId = await withUserTransaction(pool, user.id, async (client) => {
          const result = await client.query(
            "select erp_private.create_company_with_owner($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as company_id",
            [
              input.name, input.legalName, input.country, input.currency,
              input.taxRate, input.address, input.phone, input.email,
              input.taxRegistrationNumber, input.invoicePrefix, input.invoiceFooter, "Main",
            ],
          );
          return result.rows[0]?.company_id;
        });
        if (!companyId) throw new Error("Company registration could not be completed.");
        return send(response, 201, { companyId, role: "owner" });
      }

      if (request.method === "POST" && pathname === "/api/v1/invitations/accept") {
        const body = await readJson(request);
        const rawToken = typeof body.token === "string" ? body.token : "";
        if (rawToken.length < 32 || rawToken.length > 200) throw Object.assign(new Error("Invitation token is invalid."), { status: 400 });
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const email = normalizeEmail(user.email);
        if (!email) throw Object.assign(new Error("Your signed-in account has no verified email address."), { status: 400 });
        const accepted = await withUserTransaction(pool, user.id, async (client) => {
          const result = await client.query(
            "select erp_private.accept_company_invitation($1,$2,$3) as company_id",
            [tokenHash, user.id, email],
          );
          return result.rows[0]?.company_id;
        });
        if (!accepted) throw Object.assign(new Error("The invitation is invalid, expired, already used, or addressed to another email."), { status: 400 });
        return send(response, 200, { companyId: accepted, accepted: true });
      }

      const invitationMatch = /^\/api\/v1\/companies\/([0-9a-f-]+)\/invitations$/.exec(pathname);
      if (invitationMatch) {
        const companyId = invitationMatch[1];
        if (!UUID_RE.test(companyId)) return send(response, 400, { error: "Company identifier is invalid." });
        if (request.method !== "POST") return send(response, 405, { error: "Method not allowed." });
        const body = await readJson(request);
        const email = normalizeEmail(body.email);
        const role = body.role;
        if (!email) throw Object.assign(new Error("Enter a valid employee email address."), { status: 400 });
        if (!["admin", "manager", "staff"].includes(role)) throw Object.assign(new Error("Choose an employee role: admin, manager or staff."), { status: 400 });

        const invite = await withUserTransaction(pool, user.id, async (client) => {
          const membership = await getMembership(client, user.id, companyId);
          if (!membership || !["owner", "admin"].includes(membership.role)) {
            throw Object.assign(new Error("Only a company owner or admin can invite employees."), { status: 403 });
          }
          await client.query("select set_config('erp.company_id', $1, true)", [companyId]);
          const tokenData = createInvitationToken();
          const result = await client.query(
            "insert into public.erp_company_invitations " +
            "(company_id, email, role, token_hash, invited_by, expires_at) " +
            "values ($1,$2,$3,$4,$5,now() + interval '7 days') " +
            "returning id, email, role, expires_at",
            [companyId, email, role, tokenData.tokenHash, user.id],
          );
          await client.query(
            "insert into public.erp_audit_events (company_id, actor_user_id, action, entity_type, entity_id, metadata) " +
            "values ($1,$2,'employee.invited','company_invitation',$3,$4::jsonb)",
            [companyId, user.id, result.rows[0].id, JSON.stringify({ email, role })],
          );
          return { ...result.rows[0], token: tokenData.token };
        });
        const base = frontendOrigin.split(",")[0]?.trim() || "http://localhost:5173";
        const acceptUrl = base.replace(/\/+$/, "") + "/auth/accept-invite?token=" + encodeURIComponent(invite.token);
        return send(response, 201, {
          invitation: {
            id: invite.id, email: invite.email, role: invite.role,
            expiresAt: invite.expires_at, acceptUrl,
          },
          delivery: "copy_link",
        });
      }

      const recordMatch = /^\/api\/v1\/companies\/([0-9a-f-]+)\/records(?:\/([a-z][a-z0-9_]{1,63})(?:\/([^/]+))?)?$/.exec(pathname);
      if (!recordMatch) return send(response, 404, { error: "Route not found." });
      const [, companyId, entityType, recordId] = recordMatch;
      if (!UUID_RE.test(companyId)) return send(response, 400, { error: "Company identifier is invalid." });
      if (entityType && !validateEntityType(entityType)) return send(response, 400, { error: "Record type is invalid." });
      let decodedId = null;
      try { decodedId = recordId ? decodeURIComponent(recordId) : null; } catch {
        return send(response, 400, { error: "Record identifier is invalid." });
      }
      if (decodedId && !validateRecordId(decodedId)) return send(response, 400, { error: "Record identifier is invalid." });

      const result = await withUserTransaction(pool, user.id, async (client) => {
        const membership = await getMembership(client, user.id, companyId);
        if (!membership || !canReadCompany(membership.role)) {
          throw Object.assign(new Error("You do not have access to this company."), { status: 403 });
        }
        await client.query("select set_config('erp.company_id', $1, true)", [companyId]);
        await client.query("select set_config('erp.role', $1, true)", [membership.role]);

        if (request.method === "GET" && entityType && decodedId) {
          const row = await client.query(
            "select entity_type, record_id, data, revision, created_at, updated_at " +
            "from public.erp_company_records where company_id=$1 and entity_type=$2 and record_id=$3",
            [companyId, entityType, decodedId],
          );
          return { status: row.rowCount ? 200 : 404, body: row.rowCount ? row.rows[0] : { error: "Record not found." } };
        }

        if (request.method === "GET" && entityType) {
          const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
          const rows = await client.query(
            "select entity_type, record_id, data, revision, created_at, updated_at " +
            "from public.erp_company_records where company_id=$1 and entity_type=$2 " +
            "order by updated_at desc limit $3",
            [companyId, entityType, limit],
          );
          return { status: 200, body: { records: rows.rows } };
        }

        if (request.method === "PUT" && entityType && decodedId) {
          if (!canWriteRecords(membership.role)) throw Object.assign(new Error("Your company role is read-only."), { status: 403 });
          const body = await readJson(request);
          if (!validateJsonValue(body.data)) throw Object.assign(new Error("Record data is missing or exceeds the 1 MB limit."), { status: 400 });
          const current = await client.query(
            "select revision from public.erp_company_records where company_id=$1 and entity_type=$2 and record_id=$3 for update",
            [companyId, entityType, decodedId],
          );
          let saved;
          if (!current.rowCount) {
            if (body.expectedRevision !== undefined && body.expectedRevision !== 0) {
              throw Object.assign(new Error("This record changed elsewhere. Refresh and try again."), { status: 409 });
            }
            const inserted = await client.query(
              "insert into public.erp_company_records " +
              "(company_id, entity_type, record_id, data, revision, created_by, updated_by) " +
              "values ($1,$2,$3,$4::jsonb,1,$5,$5) " +
              "on conflict (company_id,entity_type,record_id) do nothing " +
              "returning entity_type, record_id, data, revision, created_at, updated_at",
              [companyId, entityType, decodedId, JSON.stringify(body.data), user.id],
            );
            if (!inserted.rowCount) throw Object.assign(new Error("This record was created by another user. Refresh before editing."), { status: 409 });
            saved = inserted.rows[0];
          } else {
            if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== Number(current.rows[0].revision)) {
              throw Object.assign(new Error("This record changed elsewhere. Refresh before saving your changes."), { status: 409 });
            }
            const updated = await client.query(
              "update public.erp_company_records set data=$4::jsonb, revision=revision+1, updated_by=$5, updated_at=now() " +
              "where company_id=$1 and entity_type=$2 and record_id=$3 and revision=$6 " +
              "returning entity_type, record_id, data, revision, created_at, updated_at",
              [companyId, entityType, decodedId, JSON.stringify(body.data), user.id, body.expectedRevision],
            );
            if (!updated.rowCount) throw Object.assign(new Error("This record changed elsewhere. Refresh before saving your changes."), { status: 409 });
            saved = updated.rows[0];
          }
          await client.query(
            "insert into public.erp_audit_events (company_id, actor_user_id, action, entity_type, entity_id) values ($1,$2,$3,$4,$5)",
            [companyId, user.id, current.rowCount ? "record.updated" : "record.created", entityType, decodedId],
          );
          return { status: 200, body: saved };
        }

        if (request.method === "DELETE" && entityType && decodedId) {
          if (!canDeleteRecords(membership.role)) throw Object.assign(new Error("Only the owner or an admin can delete records."), { status: 403 });
          const deleted = await client.query(
            "delete from public.erp_company_records where company_id=$1 and entity_type=$2 and record_id=$3 returning record_id",
            [companyId, entityType, decodedId],
          );
          if (deleted.rowCount) {
            await client.query(
              "insert into public.erp_audit_events (company_id, actor_user_id, action, entity_type, entity_id) values ($1,$2,'record.deleted',$3,$4)",
              [companyId, user.id, entityType, decodedId],
            );
          }
          return { status: deleted.rowCount ? 200 : 404, body: deleted.rowCount ? { deleted: true } : { error: "Record not found." } };
        }

        return { status: 405, body: { error: "Method not allowed." } };
      });
      return send(response, result.status, result.body);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status >= 500) {
        console.error("ERP API request failed:", error);
        return send(response, 500, { error: "The server could not complete this request." });
      }
      return send(response, status, { error: error.message || "Request failed." });
    }
  });
}
