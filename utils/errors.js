/**
 * Maps common Mongoose/validation errors to correct HTTP codes.
 * ValidationError / CastError -> 400, duplicate key -> 400, else 500.
 * Always responds with a consistent { message } body.
 */
const sendError = (res, err) => {
  if (err?.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0]
    return res.status(400).json({ message: first?.message || 'Validation failed' })
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path || 'id'}` })
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field'
    return res.status(400).json({ message: `Duplicate ${field}` })
  }
  return res.status(500).json({ message: err?.message || 'Internal server error' })
}

module.exports = { sendError }
