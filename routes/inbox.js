const express = require('express')
const router  = express.Router()
const Inbox   = require('../models/Inbox')
const { protect }    = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')

// ── GET inbox messages ─────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { type, isRead, relatedLead, page = 1, limit = 30 } = req.query
    const filter = { company: req.user.company }
    if (type)       filter.type    = type
    if (isRead !== undefined) filter.isRead = isRead === 'true'
    if (relatedLead) filter.relatedLead = relatedLead

    const skip  = (page - 1) * limit
    const total = await Inbox.countDocuments(filter)
    const messages = await Inbox.find(filter)
      .populate('relatedLead',    'name email status')
      .populate('relatedContact', 'name email')
      .populate('relatedDeal',    'title stage')
      .populate('createdBy',      'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))

    res.json({ messages, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET inbox stats (unread count by type) ────────────────────────────────────
router.get('/stats', protect, checkTrial, async (req, res) => {
  try {
    const base   = { company: req.user.company, isRead: false }
    const agg    = await Inbox.aggregate([
      { $match: base },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ])
    const stats  = { total: 0 }
    agg.forEach(g => { stats[g._id] = g.count; stats.total += g.count })
    res.json(stats)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET single message ─────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const msg = await Inbox.findOne({ _id: req.params.id, company: req.user.company })
      .populate('relatedLead', 'name email')
      .populate('relatedContact', 'name email')
      .populate('createdBy', 'name')
    if (!msg) return res.status(404).json({ message: 'Message not found' })
    res.json(msg)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── POST create inbox message ──────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const { type, contactName, contactPhone, contactEmail, message, subject,
            direction, relatedLead, relatedContact, relatedDeal } = req.body
    const msg = await Inbox.create({
      type, contactName, contactPhone, contactEmail, message, subject,
      direction: direction || 'outbound',
      relatedLead, relatedContact, relatedDeal,
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(msg)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── PUT mark single message as read ───────────────────────────────────────────
router.put('/:id/read', protect, checkTrial, async (req, res) => {
  try {
    const msg = await Inbox.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isRead: true, readAt: new Date() },
      { new: true }
    )
    if (!msg) return res.status(404).json({ message: 'Message not found' })
    res.json(msg)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── PUT mark all as read ───────────────────────────────────────────────────────
router.put('/read-all', protect, checkTrial, async (req, res) => {
  try {
    const { type } = req.query
    const filter = { company: req.user.company, isRead: false }
    if (type) filter.type = type
    const result = await Inbox.updateMany(filter, { isRead: true, readAt: new Date() })
    res.json({ message: `${result.modifiedCount} messages marked as read` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── DELETE message ─────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const msg = await Inbox.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!msg) return res.status(404).json({ message: 'Message not found' })
    res.json({ message: 'Message deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
