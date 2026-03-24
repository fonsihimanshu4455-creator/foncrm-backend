const express  = require('express')
const router   = express.Router()
const Timeline = require('../models/Timeline')
const { protect }    = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')

// ── GET full timeline for a lead/deal/contact ─────────────────────────────────
router.get('/:entityType/:entityId', protect, checkTrial, async (req, res) => {
  try {
    const { entityType, entityId } = req.params
    const { page = 1, limit = 50 } = req.query

    const validTypes = ['lead', 'deal', 'contact']
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({ message: 'entityType must be lead, deal, or contact' })
    }

    const skip  = (page - 1) * limit
    const filter = { entityId, entityType }
    const total  = await Timeline.countDocuments(filter)
    const entries = await Timeline.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))

    res.json({ timeline: entries, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── POST manually add a timeline entry ────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const { entityId, entityType, action, description, metadata } = req.body
    if (!entityId || !entityType) {
      return res.status(400).json({ message: 'entityId and entityType are required' })
    }
    const entry = await Timeline.create({
      entityId, entityType,
      action:      action || 'note_added',
      description: description || '',
      metadata:    metadata || {},
      userId:      req.user._id,
      userName:    req.user.name,
      company:     req.user.company
    })
    res.status(201).json(entry)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
