const express     = require('express')
const router      = express.Router()
const crypto      = require('crypto')
const Integration = require('../models/Integration')
const ApiKey      = require('../models/ApiKey')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

// ── List integrations ──────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const company = await require('../models/Company').findOne({ name: req.user.company })
    const integrations = await Integration.find({ companyId: company?._id })
      .select('-config.accessToken -config.refreshToken')
      .sort({ createdAt: -1 })
    res.json({ integrations, total: integrations.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create / upsert integration ────────────────────────────────────────────────
router.post('/', protect, allowRoles('superadmin', 'admin'), checkTrial, async (req, res) => {
  try {
    const { type, config, webhookUrl, events } = req.body
    const Company = require('../models/Company')
    const company = await Company.findOne({ name: req.user.company })
    if (!company) return res.status(404).json({ message: 'Company not found' })

    const integration = await Integration.findOneAndUpdate(
      { companyId: company._id, type },
      { config: config || {}, webhookUrl, events: events || [], isActive: true, lastSync: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    res.status(201).json(integration)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Google Sheets sync (simulated) ────────────────────────────────────────────
router.post('/google-sheets/sync', protect, checkTrial, async (req, res) => {
  try {
    const { sheetId, range, data } = req.body
    // Simulate sync — in production this would call Google Sheets API
    const rowCount = Array.isArray(data) ? data.length : 0
    const Company = require('../models/Company')
    const company = await Company.findOne({ name: req.user.company })
    if (company) {
      await Integration.findOneAndUpdate(
        { companyId: company._id, type: 'google_sheets' },
        { lastSync: new Date(), 'config.sheetId': sheetId, 'config.range': range },
        { upsert: true }
      )
    }
    res.json({
      message:   'Google Sheets sync initiated',
      sheetId,
      range:     range || 'Sheet1!A1',
      rowsSynced: rowCount,
      note:      'Configure GOOGLE_SHEETS_API_KEY in env for live sync'
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Webhook CRUD ───────────────────────────────────────────────────────────────
router.get('/webhooks', protect, checkTrial, async (req, res) => {
  try {
    const Company = require('../models/Company')
    const company = await Company.findOne({ name: req.user.company })
    const webhooks = await Integration.find({ companyId: company?._id, type: 'webhook' })
      .select('webhookUrl events isActive createdAt lastSync')
    res.json({ webhooks, total: webhooks.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.post('/webhooks', protect, allowRoles('superadmin', 'admin'), checkTrial, async (req, res) => {
  try {
    const { webhookUrl, events, secret } = req.body
    const Company = require('../models/Company')
    const company = await Company.findOne({ name: req.user.company })
    if (!company) return res.status(404).json({ message: 'Company not found' })

    const webhook = await Integration.create({
      companyId:  company._id,
      type:       'webhook',
      webhookUrl,
      events:     events || ['lead.created', 'deal.won'],
      config:     { secret: secret || crypto.randomBytes(16).toString('hex') },
      isActive:   true
    })
    res.status(201).json(webhook)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.delete('/webhooks/:id', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    await Integration.findByIdAndDelete(req.params.id)
    res.json({ message: 'Webhook deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Zapier trigger (incoming from Zapier) ────────────────────────────────────
router.post('/zapier/trigger', async (req, res) => {
  try {
    const { apiKey, event, payload } = req.body
    if (!apiKey) return res.status(401).json({ message: 'API key required' })

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
    const key = await ApiKey.findOne({ keyHash, isActive: true })
    if (!key) return res.status(401).json({ message: 'Invalid API key' })

    await ApiKey.findByIdAndUpdate(key._id, { $inc: { requestCount: 1 }, lastUsed: new Date() })

    // Process event
    let result = { received: true, event, timestamp: new Date() }

    if (event === 'lead.create' && payload) {
      const Lead = require('../models/Lead')
      const Company = require('../models/Company')
      const company = await Company.findById(key.companyId)
      if (company) {
        const lead = await Lead.create({
          name:    payload.name    || 'Zapier Lead',
          email:   payload.email   || '',
          phone:   payload.phone   || '',
          source:  'zapier',
          status:  'new',
          company: company.name
        })
        result.leadId = lead._id
      }
    }

    res.json(result)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── API Keys CRUD ──────────────────────────────────────────────────────────────
router.get('/api-keys', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const Company = require('../models/Company')
    const company = await Company.findOne({ name: req.user.company })
    const keys = await ApiKey.find({ companyId: company?._id })
      .select('-keyHash')
      .sort({ createdAt: -1 })
    res.json({ keys, total: keys.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.post('/api-keys', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const { name, scopes } = req.body
    const Company = require('../models/Company')
    const company = await Company.findOne({ name: req.user.company })
    if (!company) return res.status(404).json({ message: 'Company not found' })

    const rawKey   = `fon_${crypto.randomBytes(24).toString('hex')}`
    const keyHash  = crypto.createHash('sha256').update(rawKey).digest('hex')
    const keyPrefix = rawKey.slice(0, 8)

    const apiKey = await ApiKey.create({
      companyId: company._id,
      name:      name || 'API Key',
      keyHash,
      keyPrefix,
      scopes:    scopes || ['leads:read', 'leads:write', 'deals:read'],
      createdBy: req.user._id
    })

    res.status(201).json({
      message:  'API key created — save this key, it won\'t be shown again',
      apiKey:   rawKey,
      id:       apiKey._id,
      keyPrefix,
      scopes:   apiKey.scopes
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

router.delete('/api-keys/:id', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    await ApiKey.findByIdAndUpdate(req.params.id, { isActive: false })
    res.json({ message: 'API key revoked' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
