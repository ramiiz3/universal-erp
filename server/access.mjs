export const COMPANY_ROLES = Object.freeze(["owner", "admin", "manager", "staff"]);

export function normalizeRole(value) {
  return COMPANY_ROLES.includes(value) ? value : null;
}

export function canReadCompany(role) {
  return normalizeRole(role) !== null;
}

export function canWriteRecords(role) {
  return ["owner", "admin", "manager"].includes(normalizeRole(role));
}

export function canDeleteRecords(role) {
  return ["owner", "admin"].includes(normalizeRole(role));
}

export function validateEntityType(value) {
  return typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 64 &&
    /^[a-z][a-z0-9_]*$/.test(value);
}

export function validateRecordId(value) {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    !/[\u0000-\u001f]/.test(value);
}

export function validateJsonValue(value, maxBytes = 1024 * 1024) {
  if (value === undefined) return false;
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" &&
      Buffer.byteLength(encoded, "utf8") <= maxBytes;
  } catch {
    return false;
  }
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
