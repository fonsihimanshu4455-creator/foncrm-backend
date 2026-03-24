const express = require('express')
const router  = express.Router()
const Deal    = require('../models/Deal')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')
const { getScopeFilter }      = require('../utils/scopeFilter')
const { notify }              = require('../utils/createNotification')
const { addPoints }           = require('../utils/addPoints')
const { addTimeline }         = require('../utils/addTimeline')

// ─── GET pipeline view (must be before /:id) ─────────────────────────────────
router.get('/pipeline', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)

    const [pipeline, forecastData] = await Promise.all([
      Deal.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$stage',
            count: { $sum: 1 },
            totalValue: { $sum: '$value' },
            avgValue: { $avg: '$value' },
            deals: { $push: { _id: '$_id', title: '$title', value: '$value', probability: '$probability', assignedTo: '$assignedTo' } }
          }
        }
      ]),
      Deal.aggregate([
        { $match: { ...filter, stage: { $nin: ['won', 'lost'] } } },
        {
          $group: {
            _id: null,
            forecast: { $sum: { $multiply: ['$value', { $divide: ['$probability', 100] }] } }
          }
        }
      ])
    ])

    const stages = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']
    const stageMap = {}
    stages.forEach(s => { stageMap[s] = { count: 0, totalValue: 0, avgValue: 0, deals: [] } })
    pipeline.forEach(p => { stageMap[p._id] = p })

    const pipelineValue = pipeline
      .filter(p => !['won', 'lost'].includes(p._id))
      .reduce((sum, p) => sum + (p.totalValue || 0), 0)

    res.json({
      stages: stageMap,
      pipelineValue,
      revenueForecast: Math.round(forecastData[0]?.forecast || 0)
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET all deals (role-scoped, paginated) ───────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { stage, minValue, maxValue, search, page = 1, limit = 20 } = req.query
    const filter = getScopeFilter(req.user)

    if (stage) filter.stage = stage
    if (minValue || maxValue) {
      filter.value = {}
      if (minValue) filter.value.$gte = parseInt(minValue)
      if (maxValue) filter.value.$lte = parseInt(maxValue)
    }
    if (search) {
      const rx = { $regex: search, $options: 'i' }
      filter.$or = [{ title: rx }, { notes: rx }]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [deals, total] = await Promise.all([
      Deal.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name email')
        .populate('contact', 'name email'),
      Deal.countDocuments(filter)
    ])

    res.json({ deals, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET single deal ──────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('contact', 'name email phone')
      .populate('relatedLead', 'name status')
      .populate('createdBy', 'name')
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
    res.json(deal)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── POST create deal ─────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const deal = new Deal({
      ...req.body,
      company: req.body.company || req.user.company || '',
      createdBy: req.user.id,
      assignedTo: req.body.assignedTo || req.user.id
    })
    deal._changedBy = req.user.id
    await deal.save()

    if (deal.assignedTo && deal.assignedTo.toString() !== req.user.id) {
      await notify({
        userId: deal.assignedTo,
        title: 'New Deal Assigned',
        message: `Deal "${deal.title}" worth ₹${deal.value.toLocaleString()} assigned to you`,
        type: 'deal',
        priority: 'high',
        relatedModel: 'Deal',
        relatedId: deal._id,
        company: deal.company
      })
    }

    res.status(201).json(deal)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PUT update deal ──────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })

    const prevStage = deal.stage
    Object.assign(deal, req.body)
    deal._changedBy = req.user.id
    await deal.save()

    // Notify on won + award points + timeline
    if (req.body.stage && req.body.stage !== prevStage) {
      await addTimeline({
        entityId:    deal._id,
        entityType:  'deal',
        action:      'stage_changed',
        description: `Stage changed from ${prevStage} to ${deal.stage}`,
        userId:      req.user._id,
        userName:    req.user.name,
        company:     deal.company,
        metadata:    { from: prevStage, to: deal.stage }
      })

      if (req.body.stage === 'won') {
        await notify({
          userId:   deal.createdBy,
          title:    'Deal Won!',
          message:  `"${deal.title}" marked as WON — ₹${deal.value.toLocaleString()}`,
          type:     'deal',
          priority: 'high',
          relatedModel: 'Deal',
          relatedId: deal._id,
          company:   deal.company
        })
        await addPoints(req.user._id, req.user.company, 'deal_won')
      }
    }

    res.json(deal)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PATCH quick stage change ─────────────────────────────────────────────────
router.patch('/:id/stage', protect, checkTrial, async (req, res) => {
  try {
    const { stage, lostReason } = req.body
    if (!stage) return res.status(400).json({ message: 'stage required' })

    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })

    deal.stage = stage
    if (lostReason) deal.lostReason = lostReason
    deal._changedBy = req.user.id
    await deal.save()

    res.json({ message: 'Stage updated!', deal })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PATCH bulk update ────────────────────────────────────────────────────────
router.patch('/bulk', protect, allowRoles('superadmin', 'admin', 'manager'), checkTrial, async (req, res) => {
  try {
    const { ids, update } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' })
    }
    const result = await Deal.updateMany({ _id: { $in: ids } }, update)
    res.json({ message: `${result.modifiedCount} deals updated` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── DELETE deal ──────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })

    if (!['superadmin', 'admin', 'manager'].includes(req.user.role) &&
      deal.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' })
    }

    await Deal.findByIdAndDelete(req.params.id)
    res.json({ message: 'Deal deleted!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
