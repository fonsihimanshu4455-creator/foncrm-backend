const express = require('express')
const router = express.Router()
const Lead = require('../models/Lead')
const Deal = require('../models/Deal')
const Contact = require('../models/Contact')
const Task = require('../models/Task')
const ActivityLog = require('../models/ActivityLog')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')

// ─── GET comprehensive dashboard stats ────────────────────────────────────────
router.get('/stats', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    const [
      totalLeads,
      totalDeals,
      totalContacts,
      totalTasks,
      leadsThisMonth,
      leadsLastMonth,
      leadsThisWeek,
      dealsWon,
      dealsLost,
      pendingTasks,
      overdueTasks,
      tasksDueToday,
      pipelineData,
      forecastData,
      leadsByStatus,
      dealsByStage,
      recentActivity,
      topPerformers
    ] = await Promise.all([
      Lead.countDocuments(filter),
      Deal.countDocuments(filter),
      Contact.countDocuments(filter),
      Task.countDocuments(filter),
      Lead.countDocuments({ ...filter, createdAt: { $gte: startOfMonth } }),
      Lead.countDocuments({ ...filter, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
      Lead.countDocuments({ ...filter, createdAt: { $gte: startOfWeek } }),
      Deal.countDocuments({ ...filter, stage: 'won' }),
      Deal.countDocuments({ ...filter, stage: 'lost' }),
      Task.countDocuments({ ...filter, status: { $in: ['pending', 'in_progress'] } }),
      Task.countDocuments({ ...filter, dueDate: { $lt: now }, status: { $nin: ['completed', 'cancelled'] } }),
      Task.countDocuments({ ...filter, dueDate: { $gte: startOfToday, $lte: endOfToday }, status: { $nin: ['completed', 'cancelled'] } }),
      // Active pipeline value
      Deal.aggregate([
        { $match: { ...filter, stage: { $nin: ['won', 'lost'] } } },
        { $group: { _id: null, total: { $sum: '$value' } } }
      ]),
      // Probability-weighted revenue forecast
      Deal.aggregate([
        { $match: { ...filter, stage: { $nin: ['won', 'lost'] } } },
        { $group: { _id: null, forecast: { $sum: { $multiply: ['$value', { $divide: ['$probability', 100] }] } } } }
      ]),
      // Leads breakdown by status
      Lead.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Deals breakdown by stage
      Deal.aggregate([
        { $match: filter },
        { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$value' } } }
      ]),
      // Recent activity log
      ActivityLog.find(req.user.role === 'superadmin' ? {} : { company: req.user.company })
        .sort({ createdAt: -1 })
        .limit(10),
      // Top performers (agents by won deals)
      Deal.aggregate([
        { $match: { ...filter, stage: 'won' } },
        { $group: { _id: '$assignedTo', wonDeals: { $sum: 1 }, totalValue: { $sum: '$value' } } },
        { $sort: { wonDeals: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmpty: true } },
        { $project: { wonDeals: 1, totalValue: 1, 'user.name': 1, 'user.email': 1 } }
      ])
    ])

    const conversionRate = totalDeals > 0 ? Math.round((dealsWon / totalDeals) * 100) : 0
    const leadGrowth = leadsLastMonth > 0
      ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100)
      : null

    res.json({
      // Core counts
      totalLeads,
      totalDeals,
      totalContacts,
      totalTasks,

      // Lead metrics
      leadsThisMonth,
      leadsLastMonth,
      leadsThisWeek,
      leadGrowth,           // % vs last month (null if no data)

      // Deal metrics
      dealsWon,
      dealsLost,
      conversionRate,       // %
      pipelineValue: pipelineData[0]?.total || 0,
      revenueForecast: Math.round(forecastData[0]?.forecast || 0),

      // Task metrics
      pendingTasks,
      overdueTasks,
      tasksDueToday,

      // Breakdown charts
      leadsByStatus,
      dealsByStage,

      // Activity & people
      recentActivity,
      topPerformers
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET pipeline health score (unique feature) ───────────────────────────────
router.get('/pipeline-health', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)
    const now = new Date()
    const staleThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    const [totalActive, staleDeals, overdueFollowUps, highValueAtRisk] = await Promise.all([
      Deal.countDocuments({ ...filter, stage: { $nin: ['won', 'lost'] } }),
      Deal.countDocuments({ ...filter, stage: { $nin: ['won', 'lost'] }, updatedAt: { $lt: staleThreshold } }),
      Task.countDocuments({ ...filter, relatedDeal: { $exists: true, $ne: null }, dueDate: { $lt: now }, status: { $nin: ['completed', 'cancelled'] } }),
      Deal.countDocuments({ ...filter, stage: { $nin: ['won', 'lost'] }, value: { $gte: 50000 }, updatedAt: { $lt: staleThreshold } })
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

    res.json({
      healthScore,
      healthLabel,
      totalActive,
      staleDeals,
      overdueFollowUps,
      highValueAtRisk
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET lead source analytics (unique feature) ───────────────────────────────
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
        { $match: { ...filter, stage: 'won' } },
        { $group: { _id: '$source', wonCount: { $sum: 1 }, revenue: { $sum: '$value' } } },
        { $sort: { revenue: -1 } }
      ])
    ])

    res.json({ leadSources, dealSources })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
