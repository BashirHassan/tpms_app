function normalizeLocationValue(value) {
  if (value === undefined || value === null) return value;
  return String(value).trim().toUpperCase();
}

function normalizeOptionalLocationValue(value) {
  const normalized = normalizeLocationValue(value);
  return normalized || null;
}

// School names follow the same convention: upper-case, single-spaced
function normalizeSchoolName(value) {
  if (value === undefined || value === null) return value;
  return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
}

module.exports = {
  normalizeLocationValue,
  normalizeOptionalLocationValue,
  normalizeSchoolName,
};
