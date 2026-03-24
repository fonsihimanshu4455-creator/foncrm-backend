const express = require('express')
const router  = express.Router()
const Lead    = require('../models/Lead')
const Deal    = require('../models/Deal')
const Inbox   = require('../models/Inbox')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')
const { getScopeFilter }      = require('../utils/scopeFilter')
const { notify }              = require('../utils/createNotification')
const { addPoints }           = require('../utils/addPoints')
const { addTimeline }         = require('../utils/addTimeline')

// ─── Bulk update (before /:id to avoid conflict) ──────────────────────────────
router.post('/bulk-update', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { ids, update } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' })
    }
    const result = await Lead.updateMany({ _id: { $in: ids } }, update)
    res.json({ message: `${result.modifiedCount} leads updated` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── Bulk delete ───────────────────────────────────────────────────────────────
router.post('/bulk-delete', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' })
    }
    const result = await Lead.deleteMany({ _id: { $in: ids }, company: req.user.company })
    res.json({ message: `${result.deletedCount} leads deleted` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── Import leads (JSON array) ────────────────────────────────────────────────
router.post('/import', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { leads } = req.body
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'leads array required' })
    }
    const docs = leads.map(l => ({
      ...l,
      company:   l.company || req.user.company,
      createdBy: req.user._id
    }))
    const inserted = await Lead.insertMany(docs, { ordered: false })
    res.status(201).json({ message: `${inserted.length} leads imported`, count: inserted.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── Export leads ──────────────────────────────────────────────────────────────
router.get('/export', protect, checkTrial, async (req, res) => {
  try {
    const filter = { ...getScopeFilter(req.user), company: req.user.company }
    const leads  = await Lead.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy',  'name')
      .sort({ createdAt: -1 })
      .limit(5000)
    res.json({ leads, total: leads.length, exportedAt: new Date() })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET leads by tag ──────────────────────────────────────────────────────────
router.get('/by-tag/:tag', protect, checkTrial, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const filter = { ...getScopeFilter(req.user), company: req.user.company, tags: req.params.tag }
    const skip   = (parseInt(page) - 1) * parseInt(limit)
    const [leads, total] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
        .populate('assignedTo', 'name email'),
      Lead.countDocuments(filter)
    ])
    res.json({ leads, total, tag: req.params.tag, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET all leads (role-scoped, paginated, filterable) ───────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { status, source, search, tag, page = 1, limit = 20 } = req.query
    const filter = getScopeFilter(req.user)

    if (status) filter.status = status
    if (source) filter.source = source
    if (tag)    filter.tags   = tag
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
      company:   req.user.company || ''
    })

    // Notify assigned user if different from creator
    if (lead.assignedTo && lead.assignedTo.toString() !== req.user.id) {
      await notify({
        userId:  lead.assignedTo,
        title:   'New Lead Assigned',
        message: `Lead "${lead.name}" has been assigned to you`,
        type:    'lead',
        relatedModel: 'Lead',
        relatedId: lead._id,
        company:   lead.company
      })
    }

    // Auto-create inbox entry
    await Inbox.create({
      type:         'note',
      contactName:  lead.name,
      contactPhone: lead.phone || '',
      contactEmail: lead.email || '',
      message:      `New lead created from source: ${lead.source || 'Manual'}`,
      direction:    'inbound',
      relatedLead:  lead._id,
      company:      lead.company,
      createdBy:    req.user._id
    }).catch(() => {})

    // Timeline entry
    await addTimeline({
      entityId:    lead._id,
      entityType:  'lead',
      action:      'created',
      description: `Lead created by ${req.user.name}`,
      userId:      req.user._id,
      userName:    req.user.name,
      company:     lead.company,
      metadata:    { source: lead.source, status: lead.status }
    })

    // Award points
    await addPoints(req.user._id, req.user.company, 'lead_created')

    res.status(201).json(lead)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PUT update lead ──────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const prev = await Lead.findById(req.params.id)
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedTo', 'name email')
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    // Timeline: status change
    if (prev && req.body.status && req.body.status !== prev.status) {
      await addTimeline({
        entityId:    lead._id,
        entityType:  'lead',
        action:      'status_changed',
        description: `Status changed from ${prev.status} to ${lead.status}`,
        userId:      req.user._id,
        userName:    req.user.name,
        company:     lead.company,
        metadata:    { from: prev.status, to: lead.status }
      })
    }

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
