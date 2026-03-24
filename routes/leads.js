const express = require('express')
const router = express.Router()
const Lead = require('../models/Lead')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')
const { notify } = require('../utils/createNotification')

// ─── GET all leads (role-scoped, paginated, filterable) ───────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { status, source, search, page = 1, limit = 20 } = req.query
    const filter = getScopeFilter(req.user)

    if (status) filter.status = status
    if (source) filter.source = source
    if (search) {
      const rx = { $regex: search, $options: 'i' }
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name email')
        .populate('createdBy', 'name'),
      Lead.countDocuments(filter)
    ])

    res.json({ leads, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET single lead ──────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
    if (!lead) return res.status(404).json({ message: 'Lead not found' })
    res.json(lead)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── POST create lead ─────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.create({
      ...req.body,
      createdBy: req.user.id,
      company: req.user.company || ''
    })

    // Notify assigned user if different from creator
    if (lead.assignedTo && lead.assignedTo.toString() !== req.user.id) {
      await notify({
        userId: lead.assignedTo,
        title: 'New Lead Assigned',
        message: `Lead "${lead.name}" has been assigned to you`,
        type: 'lead',
        relatedModel: 'Lead',
        relatedId: lead._id,
        company: lead.company
      })
    }

    res.status(201).json(lead)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PUT update lead ──────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedTo', 'name email')
    if (!lead) return res.status(404).json({ message: 'Lead not found' })
    res.json(lead)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── DELETE lead ──────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    if (!['superadmin', 'admin', 'manager'].includes(req.user.role) &&
      lead.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' })
    }

    await Lead.findByIdAndDelete(req.params.id)
    res.json({ message: 'Lead deleted!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
