const express = require('express')
const router  = express.Router()
const Lead    = require('../models/Lead')
const Deal    = require('../models/Deal')
const Task    = require('../models/Task')
const User    = require('../models/User')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

function dateRange(req) {
  const { from, to } = req.query
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000)
  const end   = to   ? new Date(to)   : new Date()
  return { $gte: start, $lte: end }
}

// ── Sales performance per agent ────────────────────────────────────────────────
router.get('/sales-performance', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const company = req.user.company
    const range   = dateRange(req)

    const [users, leadsAgg, dealsAgg] = await Promise.all([
      User.find({ company, role: { $ne: 'superadmin' } }).select('name email role'),
      Lead.aggregate([
        { $match: { company, createdAt: range } },
        { $group: { _id: '$createdBy', leadsAdded: { $sum: 1 } } }
      ]),
      Deal.aggregate([
        { $match: { company, createdAt: range } },
        {
          $group: {
            _id:         '$assignedTo',
            totalDeals:  { $sum: 1 },
            wonDeals:    { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, 1, 0] } },
            lostDeals:   { $sum: { $cond: [{ $eq: ['$stage', 'lost'] }, 1, 0] } },
            totalRevenue:{ $sum: { $cond: [{ $eq: ['$stage', 'won'] }, '$value', 0] } },
            pipelineValue:{ $sum: { $cond: [{ $nin: ['$stage', ['won', 'lost']] }, '$value', 0] } }
          }
        }
      ])
    ])

    const leadsMap = {}
    leadsAgg.forEach(l => { leadsMap[l._id?.toString()] = l.leadsAdded })

    const dealsMap = {}
    dealsAgg.forEach(d => { dealsMap[d._id?.toString()] = d })

    const performance = users.map(u => {
      const uid = u._id.toString()
      const d   = dealsMap[uid] || {}
      const leadsAdded = leadsMap[uid] || 0
      const totalDeals = d.totalDeals || 0
      const wonDeals   = d.wonDeals   || 0
      return {
        userId:          u._id,
        name:            u.name,
        email:           u.email,
        role:            u.role,
        leadsAdded,
        totalDeals,
        wonDeals,
        lostDeals:       d.lostDeals || 0,
        totalRevenue:    d.totalRevenue || 0,
        pipelineValue:   d.pipelineValue || 0,
        conversionRate:  totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0
      }
    }).sort((a, b) => b.totalRevenue - a.totalRevenue)

    res.json({ performance, period: { from: req.query.from, to: req.query.to } })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Pipeline analysis ──────────────────────────────────────────────────────────
router.get('/pipeline-analysis', protect, checkTrial, async (req, res) => {
  try {
    const filter = { company: req.user.company }

    const [stageAgg, stageHistoryAgg] = await Promise.all([
      Deal.aggregate([
        { $match: filter },
        {
          $group: {
            _id:        '$stage',
            count:      { $sum: 1 },
            totalValue: { $sum: '$value' },
            avgValue:   { $avg: '$value' },
            avgDaysOpen: {
              $avg: {
                $divide: [
                  { $subtract: [new Date(), '$createdAt'] },
                  86400000
                ]
              }
            }
          }
        }
      ]),
      Deal.aggregate([
        { $match: { ...filter, stage: { $nin: ['won', 'lost'] } } },
        {
          $project: {
            stage: 1,
            daysInStage: {
              $divide: [{ $subtract: [new Date(), '$updatedAt'] }, 86400000]
            }
          }
        },
        { $group: { _id: '$stage', avgDaysInStage: { $avg: '$daysInStage' } } }
      ])
    ])

    const stages = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']
    const stageMap = {}
    stages.forEach(s => { stageMap[s] = { count: 0, totalValue: 0, avgValue: 0, avgDaysOpen: 0, avgDaysInStage: 0 } })
    stageAgg.forEach(s => { stageMap[s._id] = { ...stageMap[s._id], ...s, _id: undefined } })
    stageHistoryAgg.forEach(s => {
      if (stageMap[s._id]) stageMap[s._id].avgDaysInStage = Math.round(s.avgDaysInStage || 0)
    })

    // Bottleneck = stage with highest avg days
    const activeStages = ['new', 'qualified', 'proposal', 'negotiation']
    const bottleneck = activeStages.reduce((max, s) =>
      (stageMap[s].avgDaysInStage > (stageMap[max]?.avgDaysInStage || 0)) ? s : max
    , activeStages[0])

    const totalPipelineValue = activeStages.reduce((sum, s) => sum + (stageMap[s].totalValue || 0), 0)
    const weightedForecast = Object.values(stageAgg)
      .filter(s => !['won', 'lost'].includes(s._id))
      .reduce((sum, s) => {
        const prob = { new: 0.1, qualified: 0.25, proposal: 0.5, negotiation: 0.75 }[s._id] || 0
        return sum + (s.totalValue * prob)
      }, 0)

    res.json({ stages: stageMap, bottleneck, totalPipelineValue, weightedForecast: Math.round(weightedForecast) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Lead sources breakdown with conversion rates ──────────────────────────────
router.get('/lead-sources', protect, checkTrial, async (req, res) => {
  try {
    const company = req.user.company
    const [leadSources, dealSources] = await Promise.all([
      Lead.aggregate([
        { $match: { company } },
        { $group: { _id: '$source', totalLeads: { $sum: 1 }, hotLeads: { $sum: { $cond: [{ $eq: ['$status', 'Hot'] }, 1, 0] } }, totalValue: { $sum: '$value' } } }
      ]),
      Deal.aggregate([
        { $match: { company } },
        { $group: { _id: '$source', totalDeals: { $sum: 1 }, wonDeals: { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, 1, 0] } }, totalRevenue: { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, '$value', 0] } } } }
      ])
    ])

    const dealsMap = {}
    dealSources.forEach(d => { dealsMap[d._id] = d })

    const sources = leadSources.map(l => {
      const d = dealsMap[l._id] || {}
      return {
        source:         l._id || 'Unknown',
        totalLeads:     l.totalLeads,
        hotLeads:       l.hotLeads,
        totalValue:     l.totalValue,
        totalDeals:     d.totalDeals || 0,
        wonDeals:       d.wonDeals || 0,
        totalRevenue:   d.totalRevenue || 0,
        conversionRate: l.totalLeads > 0 ? Math.round(((d.wonDeals || 0) / l.totalLeads) * 100) : 0
      }
    }).sort((a, b) => b.totalRevenue - a.totalRevenue)

    res.json({ sources })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Activity report ────────────────────────────────────────────────────────────
router.get('/activity-report', protect, checkTrial, async (req, res) => {
  try {
    const company = req.user.company
    const range   = dateRange(req)
    const { groupBy = 'day' } = req.query

    const dateFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-W%U' : '%Y-%m-%d'

    const [leadsAgg, dealsAgg, tasksAgg] = await Promise.all([
      Lead.aggregate([
        { $match: { company, createdAt: range } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Deal.aggregate([
        { $match: { company, createdAt: range } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$stage', 'won'] }, '$value', 0] } } } },
        { $sort: { _id: 1 } }
      ]),
      Task.aggregate([
        { $match: { company: company, createdAt: range } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, created: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
        { $sort: { _id: 1 } }
      ])
    ])

    res.json({
      leads:  leadsAgg,
      deals:  dealsAgg,
      tasks:  tasksAgg,
      period: { from: req.query.from, to: req.query.to, groupBy }
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Revenue forecast (pipeline × win probability) ─────────────────────────────
router.get('/revenue-forecast', protect, checkTrial, async (req, res) => {
  try {
    const filter = { company: req.user.company, stage: { $nin: ['won', 'lost'] } }

    const pipeline = await Deal.aggregate([
      { $match: filter },
      {
        $group: {
          _id:           '$stage',
          count:         { $sum: 1 },
          totalValue:    { $sum: '$value' },
          weightedValue: {
            $sum: {
              $multiply: ['$value', { $divide: [{ $ifNull: ['$probability', 10] }, 100] }]
            }
          },
          deals: {
            $push: {
              _id:         '$_id',
              title:       '$title',
              value:       '$value',
              probability: '$probability',
              expectedCloseDate: '$expectedCloseDate'
            }
          }
        }
      }
    ])

    const totalPipelineValue  = pipeline.reduce((s, g) => s + g.totalValue, 0)
    const totalWeightedValue  = pipeline.reduce((s, g) => s + g.weightedValue, 0)

    // Monthly breakdown of expected closes
    const monthlyForecast = await Deal.aggregate([
      { $match: { ...filter, expectedCloseDate: { $ne: null } } },
      {
        $group: {
          _id:           { $dateToString: { format: '%Y-%m', date: '$expectedCloseDate' } },
          count:         { $sum: 1 },
          totalValue:    { $sum: '$value' },
          weightedValue: { $sum: { $multiply: ['$value', { $divide: [{ $ifNull: ['$probability', 10] }, 100] }] } }
        }
      },
      { $sort: { _id: 1 } }
    ])

    res.json({
      pipeline,
      totalPipelineValue,
      totalWeightedValue:  Math.round(totalWeightedValue),
      monthlyForecast,
      forecastAccuracy: 'Based on current stage probabilities'
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
