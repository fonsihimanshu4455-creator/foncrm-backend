/**
 * Request logging middleware — logs method, path, status, duration for every API call.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms   = Date.now() - start
    const line = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms) IP:${req.ip}`
    if (res.statusCode >= 500) console.error(line)
    else if (res.statusCode >= 400) console.warn(line)
    else console.log(line)
  })
  next()
}

module.exports = requestLogger
