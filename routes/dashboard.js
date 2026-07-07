const express = require('express')
const router = express.Router()
const Lead = require('../models/Lead')
const Deal = require('../models/Deal')
const Task = require('../models/Task')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')
const { sendError } = require('../utils/errors')

// ─── GET dashboard stats (frontend contract shape) ────────────────────────────
router.get('/stats', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [totalLeads, activeDealsAgg, wonMonthAgg, wonCount, latestLeads] = await Promise.all([
      Lead.countDocuments(filter),
      // Active pipeline value = deals not Won/Lost
      Deal.aggregate([
        { $match: { ...filter, stage: { $nin: ['Won', 'Lost'] } } },
        { $group: { _id: null, total: { $sum: '$value' } } }
      ]),
      // Won value this month
      Deal.aggregate([
        { $match: { ...filter, stage: 'Won', actualCloseDate: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$value' } } }
      ]),
      Deal.countDocuments({ ...filter, stage: 'Won' }),
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name email status source value')
    ])

    const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0

    res.json({
      totalLeads,
      activeDealsValue: activeDealsAgg[0]?.total || 0,
      wonThisMonthValue: wonMonthAgg[0]?.total || 0,
      conversionRate,
      latestLeads: latestLeads.map(l => ({
        _id: l._id,
        name: l.name,
        email: l.email,
        status: l.status,
        source: l.source,
        value: l.value
      }))
    })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── GET pipeline health score ────────────────────────────────────────────────
router.get('/pipeline-health', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)
    const now = new Date()
    const staleThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    const [totalActive, staleDeals, overdueFollowUps, highValueAtRisk] = await Promise.all([
      Deal.countDocuments({ ...filter, stage: { $nin: ['Won', 'Lost'] } }),
      Deal.countDocuments({ ...filter, stage: { $nin: ['Won', 'Lost'] }, updatedAt: { $lt: staleThreshold } }),
      Task.countDocuments({ ...filter, relatedDeal: { $exists: true, $ne: null }, dueDate: { $lt: now }, done: false }),
      Deal.countDocuments({ ...filter, stage: { $nin: ['Won', 'Lost'] }, value: { $gte: 50000 }, updatedAt: { $lt: staleThreshold } })
    ])

    let healthScore = 100
    if (totalActive > 0) {
      const staleRatio = staleDeals / totalActive
      const overdueRatio = overdueFollowUps / Math.max(totalActive, 1)
      healthScore = Math.max(0, Math.round(100 - (staleRatio * 50) - (overdueRatio * 30)))
    }

    const healthLabel =
      healthScore >= 75 ? 'Excellent' :
      healthScore >= 50 ? 'Good' :
      healthScore >= 25 ? 'Needs Attention' : 'Critical'

    res.json({ healthScore, healthLabel, totalActive, staleDeals, overdueFollowUps, highValueAtRisk })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── GET lead source analytics ────────────────────────────────────────────────
router.get('/source-analytics', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)

    const [leadSources, dealSources] = await Promise.all([
      Lead.aggregate([
        { $match: filter },
        { $group: { _id: '$source', count: { $sum: 1 }, totalValue: { $sum: '$value' } } },
        { $sort: { count: -1 } }
      ]),
      Deal.aggregate([
        { $match: { ...filter, stage: 'Won' } },
        { $group: { _id: '$source', wonCount: { $sum: 1 }, revenue: { $sum: '$value' } } },
        { $sort: { revenue: -1 } }
      ])
    ])

    res.json({ leadSources, dealSources })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
