const express  = require('express')
const router   = express.Router()
const Lead     = require('../models/Lead')
const Deal     = require('../models/Deal')
const Contact  = require('../models/Contact')
const apiKeyAuth = require('../middleware/apiKeyAuth')

// All public API routes require API key auth
router.use(apiKeyAuth)

// ── GET leads ─────────────────────────────────────────────────────────────────
router.get('/leads', async (req, res) => {
  try {
    if (!req.apiKey.scopes.includes('leads:read') && !req.apiKey.scopes.includes('*')) {
      return res.status(403).json({ message: 'Insufficient scope: leads:read required' })
    }
    const { status, page = 1, limit = 50 } = req.query
    const filter = { company: req.company.name }
    if (status) filter.status = status

    const skip  = (page - 1) * Math.min(limit, 100)
    const total = await Lead.countDocuments(filter)
    const leads = await Lead.find(filter)
      .select('name email phone status source value tags createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(Number(limit), 100))

    res.json({ leads, total, page: Number(page), pages: Math.ceil(total / Math.min(limit, 100)) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── POST lead ──────────────────────────────────────────────────────────────────
router.post('/leads', async (req, res) => {
  try {
    if (!req.apiKey.scopes.includes('leads:write') && !req.apiKey.scopes.includes('*')) {
      return res.status(403).json({ message: 'Insufficient scope: leads:write required' })
    }
    const { name, email, phone, source, value, notes, tags } = req.body
    if (!name) return res.status(400).json({ message: 'name is required' })

    const lead = await Lead.create({
      name,
      email:   email   || '',
      phone:   phone   || '',
      source:  source  || 'api',
      value:   value   || 0,
      notes:   notes   || '',
      tags:    tags    || [],
      status:  'new',
      company: req.company.name
    })

    res.status(201).json(lead)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET deals ─────────────────────────────────────────────────────────────────
router.get('/deals', async (req, res) => {
  try {
    if (!req.apiKey.scopes.includes('deals:read') && !req.apiKey.scopes.includes('*')) {
      return res.status(403).json({ message: 'Insufficient scope: deals:read required' })
    }
    const { stage, page = 1, limit = 50 } = req.query
    const filter = { company: req.company.name }
    if (stage) filter.stage = stage

    const deals = await Deal.find(filter)
      .select('title value stage probability expectedCloseDate createdAt')
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .skip((page - 1) * Math.min(limit, 100))

    const total = await Deal.countDocuments(filter)
    res.json({ deals, total })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET contacts ───────────────────────────────────────────────────────────────
router.get('/contacts', async (req, res) => {
  try {
    if (!req.apiKey.scopes.includes('contacts:read') && !req.apiKey.scopes.includes('*')) {
      return res.status(403).json({ message: 'Insufficient scope: contacts:read required' })
    }
    const { page = 1, limit = 50 } = req.query
    const filter = { company: req.company.name }

    const contacts = await Contact.find(filter)
      .select('name email phone company createdAt')
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 100))
      .skip((page - 1) * Math.min(limit, 100))

    const total = await Contact.countDocuments(filter)
    res.json({ contacts, total })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
