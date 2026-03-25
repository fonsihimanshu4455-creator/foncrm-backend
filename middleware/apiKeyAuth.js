const crypto  = require('crypto')
const ApiKey  = require('../models/ApiKey')

/**
 * Middleware: authenticate via API key from header X-API-Key or query ?api_key=
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    const key = req.headers['x-api-key'] || req.query.api_key
    if (!key) return res.status(401).json({ message: 'API key required' })

    const keyHash = crypto.createHash('sha256').update(key).digest('hex')
    const apiKey  = await ApiKey.findOne({ keyHash, isActive: true })
    if (!apiKey) return res.status(401).json({ message: 'Invalid or inactive API key' })

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return res.status(401).json({ message: 'API key expired' })
    }

    // Attach company info to request
    req.apiKey  = apiKey
    req.company = apiKey.company

    // Update last used
    ApiKey.findByIdAndUpdate(apiKey._id, {
      lastUsedAt: new Date(),
      $inc: { requestCount: 1 }
    }).catch(() => {})

    next()
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

module.exports = apiKeyAuth
