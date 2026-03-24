const express  = require('express')
const router   = express.Router()
const Company  = require('../models/Company')
const Deal     = require('../models/Deal')
const Document = require('../models/Document')
const Timeline = require('../models/Timeline')

// All portal routes are PUBLIC (no auth) — access is gated by portalToken

// ── GET deals for company portal ──────────────────────────────────────────────
router.get('/:token/deals', async (req, res) => {
  try {
    const company = await Company.findOne({ portalToken: req.params.token, portalEnabled: true })
    if (!company) return res.status(404).json({ message: 'Portal not found or disabled' })

    const deals = await Deal.find({ company: company.name })
      .select('title stage value probability expectedCloseDate updatedAt')
      .sort({ updatedAt: -1 })
      .limit(50)

    res.json({ company: company.name, deals, total: deals.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET activity timeline for company portal ──────────────────────────────────
router.get('/:token/timeline', async (req, res) => {
  try {
    const company = await Company.findOne({ portalToken: req.params.token, portalEnabled: true })
    if (!company) return res.status(404).json({ message: 'Portal not found or disabled' })

    // Return recent timeline entries for this company (sanitized)
    const entries = await Timeline.find({ company: company.name })
      .select('action description entityType createdAt userName')
      .sort({ createdAt: -1 })
      .limit(30)

    res.json({ company: company.name, timeline: entries })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET public documents for company portal ───────────────────────────────────
router.get('/:token/documents', async (req, res) => {
  try {
    const company = await Company.findOne({ portalToken: req.params.token, portalEnabled: true })
    if (!company) return res.status(404).json({ message: 'Portal not found or disabled' })

    const docs = await Document.find({ company: company.name, isPublic: true })
      .select('name originalName fileUrl fileType fileSize category description createdAt')
      .sort({ createdAt: -1 })

    res.json({ company: company.name, documents: docs, total: docs.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
