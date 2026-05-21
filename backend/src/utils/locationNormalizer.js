function normalizeLocationValue(value) {
  if (value === undefined || value === null) return value;
  return String(value).trim().toUpperCase();
}

function normalizeOptionalLocationValue(value) {
  const normalized = normalizeLocationValue(value);
  return normalized || null;
}

module.exports = {
  normalizeLocationValue,
  normalizeOptionalLocationValue,
};
