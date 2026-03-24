const express = require('express')
const router = express.Router()
const Task = require('../models/Task')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')
const { notify } = require('../utils/createNotification')

// ─── GET overdue count (must be before /:id) ──────────────────────────────────
router.get('/overdue/count', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user, {
      dueDate: { $lt: new Date() },
      status: { $nin: ['completed', 'cancelled'] }
    })
    const count = await Task.countDocuments(filter)
    res.json({ count })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PATCH bulk complete (must be before /:id routes) ────────────────────────
router.patch('/bulk/complete', protect, checkTrial, async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' })
    }
    const result = await Task.updateMany(
      { _id: { $in: ids } },
      { status: 'completed', completedAt: new Date() }
    )
    res.json({ message: `${result.modifiedCount} tasks completed` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET all tasks (role-scoped, paginated) ───────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { status, priority, type, overdue, page = 1, limit = 20 } = req.query
    const filter = getScopeFilter(req.user)

    if (status) filter.status = status
    if (priority) filter.priority = priority
    if (type) filter.type = type
    if (overdue === 'true') {
      filter.dueDate = { $lt: new Date() }
      filter.status = { $nin: ['completed', 'cancelled'] }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .sort({ priority: -1, dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name email')
        .populate('relatedLead', 'name')
        .populate('relatedDeal', 'title')
        .populate('relatedContact', 'name'),
      Task.countDocuments(filter)
    ])

    res.json({ tasks, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET single task ──────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .populate('relatedLead', 'name status')
      .populate('relatedDeal', 'title value stage')
      .populate('relatedContact', 'name email')
    if (!task) return res.status(404).json({ message: 'Task not found' })
    res.json(task)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── POST create task ─────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const task = await Task.create({
      ...req.body,
      company: req.user.company || '',
      createdBy: req.user.id,
      assignedTo: req.body.assignedTo || req.user.id
    })

    if (task.assignedTo && task.assignedTo.toString() !== req.user.id) {
      const duePart = task.dueDate ? ` — Due: ${new Date(task.dueDate).toDateString()}` : ''
      await notify({
        userId: task.assignedTo,
        title: 'New Task Assigned',
        message: `"${task.title}" [${task.priority}]${duePart}`,
        type: 'task',
        priority: task.priority === 'urgent' ? 'high' : 'medium',
        relatedModel: 'Task',
        relatedId: task._id,
        company: task.company
      })
    }

    res.status(201).json(task)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PUT update task ──────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
    if (!task) return res.status(404).json({ message: 'Task not found' })

    if (req.body.status === 'completed' && task.status !== 'completed') {
      req.body.completedAt = new Date()
    }

    Object.assign(task, req.body)
    await task.save()
    res.json(task)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PATCH quick complete ─────────────────────────────────────────────────────
router.patch('/:id/complete', protect, checkTrial, async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', completedAt: new Date() },
      { new: true }
    )
    if (!task) return res.status(404).json({ message: 'Task not found' })
    res.json({ message: 'Task completed!', task })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── DELETE task ──────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
    if (!task) return res.status(404).json({ message: 'Task not found' })

    if (!['superadmin', 'admin', 'manager'].includes(req.user.role) &&
      task.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' })
    }

    await Task.findByIdAndDelete(req.params.id)
    res.json({ message: 'Task deleted!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
