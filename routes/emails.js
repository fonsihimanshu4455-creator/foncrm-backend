const express = require('express')
const router  = express.Router()
const crypto  = require('crypto')
const Email   = require('../models/Email')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')
const { getScopeFilter }      = require('../utils/scopeFilter')

// ── List emails ───────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { status, relatedLead, relatedContact, relatedDeal, page = 1, limit = 20 } = req.query
    const filter = { ...getScopeFilter(req.user), company: req.user.company }
    if (status)         filter.status = status
    if (relatedLead)    filter.relatedLead = relatedLead
    if (relatedContact) filter.relatedContact = relatedContact
    if (relatedDeal)    filter.relatedDeal = relatedDeal

    const skip  = (page - 1) * limit
    const total = await Email.countDocuments(filter)
    const emails = await Email.find(filter)
      .populate('relatedLead', 'name email')
      .populate('relatedContact', 'name email')
      .populate('relatedDeal', 'title value')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))

    res.json({ emails, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get single email ──────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const email = await Email.findById(req.params.id)
      .populate('relatedLead', 'name email')
      .populate('relatedContact', 'name email')
      .populate('relatedDeal', 'title value')
      .populate('createdBy', 'name email')
    if (!email) return res.status(404).json({ message: 'Email not found' })
    res.json(email)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create / send email ───────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const { subject, body, to, cc, bcc, from, status, template,
            relatedLead, relatedContact, relatedDeal, attachments } = req.body

    const trackingToken = crypto.randomBytes(24).toString('hex')

    const email = await Email.create({
      subject, body, to, cc, bcc, from, template, attachments,
      relatedLead, relatedContact, relatedDeal,
      status: status || 'sent',
      sentAt: status !== 'draft' ? new Date() : undefined,
      trackingToken,
      company:   req.user.company,
      createdBy: req.user._id
    })

    res.status(201).json({ email, trackingToken })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update email ──────────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const email = await Email.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true }
    )
    if (!email) return res.status(404).json({ message: 'Email not found' })
    res.json(email)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete email ──────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const email = await Email.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!email) return res.status(404).json({ message: 'Email not found' })
    res.json({ message: 'Email deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Track open (public — 1×1 transparent pixel) ───────────────────────────────
router.get('/track/:token', async (req, res) => {
  try {
    await Email.findOneAndUpdate(
      { trackingToken: req.params.token },
      { $inc: { openCount: 1 }, $set: { isOpened: true, openedAt: new Date() } }
    )
  } catch (_) { /* silent */ }

  // Return a 1×1 transparent GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': pixel.length, 'Cache-Control': 'no-cache' })
  res.end(pixel)
})

// ── Email stats ───────────────────────────────────────────────────────────────
router.get('/stats/overview', protect, checkTrial, async (req, res) => {
  try {
    const base = { company: req.user.company }
    const [total, sent, opened, draft] = await Promise.all([
      Email.countDocuments(base),
      Email.countDocuments({ ...base, status: 'sent' }),
      Email.countDocuments({ ...base, isOpened: true }),
      Email.countDocuments({ ...base, status: 'draft' })
    ])
    const openRate = sent ? Math.round((opened / sent) * 100) : 0
    res.json({ total, sent, opened, draft, openRate })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
