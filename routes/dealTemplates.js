const express      = require('express')
const router       = express.Router()
const DealTemplate = require('../models/DealTemplate')
const Deal         = require('../models/Deal')
const Lead         = require('../models/Lead')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')
const { addTimeline }         = require('../utils/addTimeline')
const { addPoints }           = require('../utils/addPoints')

// ── List templates ─────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const templates = await DealTemplate.find({ company: req.user.company, isActive: true })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
    res.json({ templates, total: templates.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get single template ────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const t = await DealTemplate.findOne({ _id: req.params.id, company: req.user.company })
    if (!t) return res.status(404).json({ message: 'Template not found' })
    res.json(t)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create template ────────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, description, defaultValue, estimatedDays, stages, tags, products } = req.body
    const t = await DealTemplate.create({
      name, description, defaultValue, estimatedDays, stages, tags, products,
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(t)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update template ────────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const t = await DealTemplate.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true, runValidators: true }
    )
    if (!t) return res.status(404).json({ message: 'Template not found' })
    res.json(t)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete template ────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const t = await DealTemplate.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!t) return res.status(404).json({ message: 'Template not found' })
    res.json({ message: 'Template deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Clone a deal ───────────────────────────────────────────────────────────────
router.post('/deals/:id/clone', protect, checkTrial, async (req, res) => {
  try {
    const original = await Deal.findOne({ _id: req.params.id, company: req.user.company })
    if (!original) return res.status(404).json({ message: 'Deal not found' })

    const cloneData = original.toObject()
    delete cloneData._id
    delete cloneData.createdAt
    delete cloneData.updatedAt
    delete cloneData.stageHistory
    cloneData.title     = req.body.title || `${original.title} (Copy)`
    cloneData.stage     = 'new'
    cloneData.probability = 10
    cloneData.actualCloseDate = null
    cloneData.createdBy = req.user._id
    cloneData.stageHistory = []

    const clone = new Deal(cloneData)
    clone._changedBy = req.user._id
    await clone.save()

    res.status(201).json({ message: 'Deal cloned', deal: clone })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Convert lead to deal ───────────────────────────────────────────────────────
router.post('/leads/:id/convert-to-deal', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, company: req.user.company })
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    const { title, templateId, value, expectedCloseDate } = req.body

    let dealData = {
      title:    title || `Deal from ${lead.name}`,
      value:    value || lead.value || 0,
      stage:    'new',
      source:   lead.source || 'Manual',
      notes:    lead.notes || '',
      tags:     lead.tags || [],
      company:  req.user.company,
      assignedTo: lead.assignedTo || req.user._id,
      createdBy:  req.user._id,
      relatedLead: lead._id,
      expectedCloseDate: expectedCloseDate || null
    }

    // Apply template defaults if provided
    if (templateId) {
      const tmpl = await DealTemplate.findOne({ _id: templateId, company: req.user.company })
      if (tmpl) {
        dealData.value    = dealData.value || tmpl.defaultValue
        dealData.products = tmpl.products || []
      }
    }

    const deal = new Deal(dealData)
    deal._changedBy = req.user._id
    await deal.save()

    // Mark lead as converted (Hot = actively pursuing)
    await Lead.findByIdAndUpdate(lead._id, { status: 'Hot' })

    await addTimeline({
      entityId:    lead._id,
      entityType:  'lead',
      action:      'lead_converted',
      description: `Lead converted to deal: "${deal.title}"`,
      userId:      req.user._id,
      userName:    req.user.name,
      company:     req.user.company,
      metadata:    { dealId: deal._id, dealTitle: deal.title }
    })

    await addPoints(req.user._id, req.user.company, 'lead_converted')

    res.status(201).json({ message: 'Lead converted to deal', deal })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
