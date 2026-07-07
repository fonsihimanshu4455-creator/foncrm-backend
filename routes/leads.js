const express = require('express')
const router = express.Router()
const Lead = require('../models/Lead')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')
const { notify } = require('../utils/createNotification')
const { sendError } = require('../utils/errors')

// ─── GET all leads (role-scoped, filterable) — returns a JSON array ────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { status, source, search } = req.query
    const filter = getScopeFilter(req.user)

    if (status) filter.status = status
    if (source) filter.source = source
    if (search) {
      const rx = { $regex: search, $options: 'i' }
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }]
    }

    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')

    res.json(leads)
  } catch (err) {
    sendError(res, err)
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
    sendError(res, err)
  }
})

// ─── POST create lead ─────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ message: 'name is required' })
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
    sendError(res, err)
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
    sendError(res, err)
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
    sendError(res, err)
  }
})

module.exports = router
