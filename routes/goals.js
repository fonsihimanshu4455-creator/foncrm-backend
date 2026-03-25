const express = require('express')
const router  = express.Router()
const Goal    = require('../models/Goal')
const Lead    = require('../models/Lead')
const Deal    = require('../models/Deal')
const Task    = require('../models/Task')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

// ── List goals ─────────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { period, type } = req.query
    const filter = { company: req.user.company }
    if (period) filter.period = period
    if (type)   filter.type   = type

    // Non-admins see only their own goals
    if (!['superadmin', 'admin', 'manager'].includes(req.user.role)) {
      filter.userId = req.user._id
    }

    const goals = await Goal.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
    res.json({ goals, total: goals.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Get single goal ────────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, company: req.user.company })
      .populate('userId', 'name email')
    if (!goal) return res.status(404).json({ message: 'Goal not found' })
    res.json(goal)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create goal ────────────────────────────────────────────────────────────────
router.post('/', protect, allowRoles('superadmin', 'admin', 'manager'), checkTrial, async (req, res) => {
  try {
    const { type, title, target, period, deadline, userId, teamId } = req.body
    if (!type || !target) return res.status(400).json({ message: 'type and target are required' })

    const goal = await Goal.create({
      type,
      title:    title  || `${type} goal`,
      target,
      current:  0,
      period:   period || 'monthly',
      deadline: deadline ? new Date(deadline) : undefined,
      userId:   userId || req.user._id,
      teamId,
      company:  req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(goal)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Update goal ────────────────────────────────────────────────────────────────
router.put('/:id', protect, allowRoles('superadmin', 'admin', 'manager'), checkTrial, async (req, res) => {
  try {
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true }
    )
    if (!goal) return res.status(404).json({ message: 'Goal not found' })
    res.json(goal)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Delete goal ────────────────────────────────────────────────────────────────
router.delete('/:id', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!goal) return res.status(404).json({ message: 'Goal not found' })
    res.json({ message: 'Goal deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Get progress for a goal (auto-calculated) ─────────────────────────────────
router.get('/:id/progress', protect, checkTrial, async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, company: req.user.company })
    if (!goal) return res.status(404).json({ message: 'Goal not found' })

    const now    = new Date()
    const period = goal.period
    let start    = new Date()

    if (period === 'weekly') {
      start = new Date(now); start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0)
    } else if (period === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (period === 'quarterly') {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
    } else if (period === 'yearly') {
      start = new Date(now.getFullYear(), 0, 1)
    }

    let current = 0
    const userFilter = goal.userId ? { assignedTo: goal.userId } : { company: req.user.company }

    switch (goal.type) {
      case 'leads':
        current = await Lead.countDocuments({ ...userFilter, createdAt: { $gte: start } })
        break
      case 'deals':
        current = await Deal.countDocuments({ ...userFilter, stage: 'won', updatedAt: { $gte: start } })
        break
      case 'revenue': {
        const rev = await Deal.aggregate([
          { $match: { company: req.user.company, stage: 'won', updatedAt: { $gte: start } } },
          { $group: { _id: null, total: { $sum: '$value' } } }
        ])
        current = rev[0]?.total || 0
        break
      }
      case 'tasks':
        current = await Task.countDocuments({ ...userFilter, status: 'completed', updatedAt: { $gte: start } })
        break
      default:
        current = goal.current
    }

    const percentage = goal.target > 0 ? Math.min(Math.round((current / goal.target) * 100), 100) : 0

    // Save snapshot to progress history
    await Goal.findByIdAndUpdate(goal._id, {
      current,
      $push: { progressHistory: { value: current, recordedAt: now } }
    })

    res.json({
      goalId:     goal._id,
      type:       goal.type,
      title:      goal.title,
      target:     goal.target,
      current,
      percentage,
      remaining:  Math.max(goal.target - current, 0),
      period,
      periodStart: start,
      status:     percentage >= 100 ? 'achieved' : percentage >= 75 ? 'on_track' : percentage >= 50 ? 'at_risk' : 'behind'
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Assign goal to user ────────────────────────────────────────────────────────
router.post('/:id/assign', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { userId } = req.body
    const goal = await Goal.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { userId },
      { new: true }
    ).populate('userId', 'name email')

    if (!goal) return res.status(404).json({ message: 'Goal not found' })
    res.json({ message: 'Goal assigned', goal })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
