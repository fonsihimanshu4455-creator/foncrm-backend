const express  = require('express')
const router   = express.Router()
const Lead     = require('../models/Lead')
const Deal     = require('../models/Deal')
const Contact  = require('../models/Contact')
const Task     = require('../models/Task')
const User     = require('../models/User')
const Subscription = require('../models/Subscription')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

// ── Cohort analysis ────────────────────────────────────────────────────────────
router.get('/cohort', protect, checkTrial, async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6
    const cohorts = []

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date()
      start.setMonth(start.getMonth() - i)
      start.setDate(1); start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)

      const newLeads = await Lead.countDocuments({
        company: req.user.company,
        createdAt: { $gte: start, $lt: end }
      })
      const converted = await Lead.countDocuments({
        company: req.user.company,
        createdAt: { $gte: start, $lt: end },
        status: 'won'
      })
      const revenue = await Deal.aggregate([
        { $match: { company: req.user.company, stage: 'won', createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$value' } } }
      ])

      cohorts.push({
        month: start.toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
        newLeads,
        converted,
        conversionRate: newLeads > 0 ? Math.round((converted / newLeads) * 100) : 0,
        revenue: revenue[0]?.total || 0
      })
    }

    res.json({ cohorts, months })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Revenue by source ──────────────────────────────────────────────────────────
router.get('/revenue-by-source', protect, checkTrial, async (req, res) => {
  try {
    const data = await Deal.aggregate([
      { $match: { company: req.user.company, stage: 'won' } },
      { $lookup: { from: 'leads', localField: 'relatedLead', foreignField: '_id', as: 'lead' } },
      { $unwind: { path: '$lead', preserveNullAndEmpty: true } },
      { $group: {
        _id: '$lead.source',
        totalRevenue: { $sum: '$value' },
        dealCount:    { $sum: 1 },
        avgDealSize:  { $avg: '$value' }
      }},
      { $sort: { totalRevenue: -1 } }
    ])

    const total = data.reduce((s, d) => s + d.totalRevenue, 0)
    const result = data.map(d => ({
      source:       d._id || 'Unknown',
      totalRevenue: Math.round(d.totalRevenue),
      dealCount:    d.dealCount,
      avgDealSize:  Math.round(d.avgDealSize),
      percentage:   total > 0 ? Math.round((d.totalRevenue / total) * 100) : 0
    }))

    res.json({ data: result, totalRevenue: Math.round(total) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Agent performance ──────────────────────────────────────────────────────────
router.get('/agent-performance', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { period = '30d' } = req.query
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
    const since = new Date(Date.now() - days * 86400000)

    const agents = await User.find({ company: req.user.company, role: { $in: ['agent', 'manager'] } })
      .select('name email role')

    const performance = await Promise.all(agents.map(async agent => {
      const [leadsAssigned, leadsWon, dealsWon, tasksCompleted, dealRevenue] = await Promise.all([
        Lead.countDocuments({ assignedTo: agent._id, createdAt: { $gte: since } }),
        Lead.countDocuments({ assignedTo: agent._id, status: 'won', updatedAt: { $gte: since } }),
        Deal.countDocuments({ assignedTo: agent._id, stage: 'won', updatedAt: { $gte: since } }),
        Task.countDocuments({ assignedTo: agent._id, status: 'completed', updatedAt: { $gte: since } }),
        Deal.aggregate([
          { $match: { assignedTo: agent._id, stage: 'won', updatedAt: { $gte: since } } },
          { $group: { _id: null, total: { $sum: '$value' } } }
        ])
      ])

      return {
        agent:          { id: agent._id, name: agent.name, email: agent.email, role: agent.role },
        leadsAssigned,
        leadsWon,
        conversionRate: leadsAssigned > 0 ? Math.round((leadsWon / leadsAssigned) * 100) : 0,
        dealsWon,
        tasksCompleted,
        revenue:        dealRevenue[0]?.total || 0
      }
    }))

    performance.sort((a, b) => b.revenue - a.revenue)
    res.json({ performance, period, days })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Deal velocity ──────────────────────────────────────────────────────────────
router.get('/deal-velocity', protect, checkTrial, async (req, res) => {
  try {
    const wonDeals = await Deal.find({ company: req.user.company, stage: 'won' })
      .select('title value createdAt updatedAt stageHistory')

    const velocities = wonDeals.map(d => {
      const days = Math.floor((new Date(d.updatedAt) - new Date(d.createdAt)) / 86400000)
      return { title: d.title, value: d.value, daysToClose: days, stageChanges: d.stageHistory?.length || 0 }
    })

    const avgDays = velocities.length > 0
      ? Math.round(velocities.reduce((s, v) => s + v.daysToClose, 0) / velocities.length)
      : 0

    const byStage = await Deal.aggregate([
      { $match: { company: req.user.company } },
      { $group: { _id: '$stage', count: { $sum: 1 }, avgValue: { $avg: '$value' } } }
    ])

    res.json({
      averageDaysToClose: avgDays,
      totalWonDeals:      velocities.length,
      velocityByDeal:     velocities.slice(0, 20),
      dealsByStage:       byStage
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Churn prediction ───────────────────────────────────────────────────────────
router.get('/churn-prediction', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    const sixtyDaysAgo  = new Date(Date.now() - 60 * 86400000)

    // Leads stagnant >30 days
    const stagnantLeads = await Lead.find({
      company: req.user.company,
      status:  { $nin: ['won', 'lost'] },
      updatedAt: { $lt: thirtyDaysAgo }
    }).select('name status updatedAt value assignedTo').populate('assignedTo', 'name').limit(50)

    // Deals not progressing >60 days
    const stagnantDeals = await Deal.find({
      company: req.user.company,
      stage:   { $nin: ['won', 'lost'] },
      updatedAt: { $lt: sixtyDaysAgo }
    }).select('title stage value updatedAt assignedTo').populate('assignedTo', 'name').limit(20)

    const riskScore = (stagnantLeads.length * 2 + stagnantDeals.length * 5)
    const riskLevel = riskScore > 100 ? 'High' : riskScore > 40 ? 'Medium' : 'Low'

    res.json({
      riskLevel,
      riskScore,
      stagnantLeads:  stagnantLeads.map(l => ({ id: l._id, name: l.name, status: l.status, daysSinceUpdate: Math.floor((Date.now() - new Date(l.updatedAt)) / 86400000), value: l.value, assignedTo: l.assignedTo?.name })),
      stagnantDeals:  stagnantDeals.map(d => ({ id: d._id, title: d.title, stage: d.stage, daysSinceUpdate: Math.floor((Date.now() - new Date(d.updatedAt)) / 86400000), value: d.value, assignedTo: d.assignedTo?.name })),
      recommendations: [
        stagnantLeads.length > 10 ? 'Assign dedicated follow-up tasks for stagnant leads' : null,
        stagnantDeals.length > 5  ? 'Review and close or re-engage stagnant deals' : null,
        'Schedule regular pipeline review meetings'
      ].filter(Boolean)
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Activity heatmap (day × hour) ─────────────────────────────────────────────
router.get('/heatmap', protect, checkTrial, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000)

    const leads = await Lead.find({ company: req.user.company, createdAt: { $gte: since } }).select('createdAt')
    const deals = await Deal.find({ company: req.user.company, createdAt: { $gte: since } }).select('createdAt')
    const tasks = await Task.find({ company: req.user.company, createdAt: { $gte: since } }).select('createdAt')

    // Build 7×24 grid (day 0=Sun, hour 0-23)
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0))

    ;[...leads, ...deals, ...tasks].forEach(doc => {
      const d = new Date(doc.createdAt)
      grid[d.getDay()][d.getHours()]++
    })

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const heatmap = grid.map((hours, dayIdx) => ({ day: days[dayIdx], hours }))

    res.json({ heatmap, since })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Funnel analysis ────────────────────────────────────────────────────────────
router.get('/funnel', protect, checkTrial, async (req, res) => {
  try {
    const company = req.user.company

    const [
      totalLeads, qualifiedLeads, contactedLeads, proposalLeads, wonLeads,
      totalDeals, proposalDeals, negotiationDeals, wonDeals
    ] = await Promise.all([
      Lead.countDocuments({ company }),
      Lead.countDocuments({ company, status: 'qualified' }),
      Lead.countDocuments({ company, status: { $in: ['contacted', 'qualified', 'proposal', 'won'] } }),
      Lead.countDocuments({ company, status: { $in: ['proposal', 'won'] } }),
      Lead.countDocuments({ company, status: 'won' }),
      Deal.countDocuments({ company }),
      Deal.countDocuments({ company, stage: { $in: ['proposal', 'negotiation', 'won'] } }),
      Deal.countDocuments({ company, stage: { $in: ['negotiation', 'won'] } }),
      Deal.countDocuments({ company, stage: 'won' })
    ])

    const funnel = [
      { stage: 'Total Leads',     count: totalLeads,     dropOff: 0 },
      { stage: 'Contacted',       count: contactedLeads, dropOff: totalLeads - contactedLeads },
      { stage: 'Qualified',       count: qualifiedLeads, dropOff: contactedLeads - qualifiedLeads },
      { stage: 'Proposal Sent',   count: proposalLeads,  dropOff: qualifiedLeads - proposalLeads },
      { stage: 'Won Leads',       count: wonLeads,       dropOff: proposalLeads - wonLeads },
      { stage: 'Deals Created',   count: totalDeals,     dropOff: 0 },
      { stage: 'Proposal/Nego',   count: proposalDeals,  dropOff: totalDeals - proposalDeals },
      { stage: 'Negotiation',     count: negotiationDeals, dropOff: proposalDeals - negotiationDeals },
      { stage: 'Won Deals',       count: wonDeals,       dropOff: negotiationDeals - wonDeals }
    ]

    const overallConversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0
    res.json({ funnel, overallConversion })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
