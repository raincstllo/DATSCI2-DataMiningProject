// Rejects request data containing MongoDB operator keys (`$...`) or dotted keys,
// which could turn into NoSQL injection if they ever reached a query.
function hasUnsafeKey(value, depth = 0) {
  if (depth > 10) return true;
  if (Array.isArray(value)) return value.some((v) => hasUnsafeKey(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, v]) => key.startsWith('$') || key.includes('.') || hasUnsafeKey(v, depth + 1),
    );
  }
  return false;
}

function rejectOperatorKeys(req, res, next) {
  if (hasUnsafeKey(req.body) || hasUnsafeKey(req.query) || hasUnsafeKey(req.params)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  next();
}

module.exports = { rejectOperatorKeys };
