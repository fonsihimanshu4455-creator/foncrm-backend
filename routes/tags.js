const express  = require('express')
const router   = express.Router()
const Lead     = require('../models/Lead')
const Contact  = require('../models/Contact')
const Deal     = require('../models/Deal')
const { protect }    = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')

// ── GET all unique tags across leads, contacts, deals ─────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const company = req.user.company
    const [leadTags, contactTags, dealTags] = await Promise.all([
      Lead.distinct('tags',    { company }),
      Contact.distinct('tags', { company }),
      Deal.distinct('tags',    { company })
    ])
    const all = [...new Set([...leadTags, ...contactTags, ...dealTags])]
      .filter(Boolean).sort()
    res.json({ tags: all, total: all.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET leads by tag ───────────────────────────────────────────────────────────
router.get('/leads/:tag', protect, checkTrial, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const filter = { company: req.user.company, tags: req.params.tag }
    const skip   = (page - 1) * limit
    const total  = await Lead.countDocuments(filter)
    const leads  = await Lead.find(filter)
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
    res.json({ leads, total, tag: req.params.tag, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET contacts by tag ────────────────────────────────────────────────────────
router.get('/contacts/:tag', protect, checkTrial, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const filter   = { company: req.user.company, tags: req.params.tag }
    const skip     = (page - 1) * limit
    const total    = await Contact.countDocuments(filter)
    const contacts = await Contact.find(filter)
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
    res.json({ contacts, total, tag: req.params.tag, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET deals by tag ───────────────────────────────────────────────────────────
router.get('/deals/:tag', protect, checkTrial, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const filter = { company: req.user.company, tags: req.params.tag }
    const skip   = (page - 1) * limit
    const total  = await Deal.countDocuments(filter)
    const deals  = await Deal.find(filter)
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
    res.json({ deals, total, tag: req.params.tag, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
