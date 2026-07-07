const express = require('express')
const router = express.Router()
const Task = require('../models/Task')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { sendError } = require('../utils/errors')

// Tasks are personal to-dos. A user sees their own; superadmin sees all.
const taskScope = (user) =>
  user.role === 'superadmin' ? {} : { user: user.id }

// ─── GET all tasks -> [{ _id, text, done }] ───────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const tasks = await Task.find(taskScope(req.user))
      .sort({ createdAt: -1 })
      .select('text done')
    res.json(tasks)
  } catch (err) {
    sendError(res, err)
  }
})

// ─── POST create task { text } ────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const { text } = req.body
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'text is required' })
    }
    const task = await Task.create({
      text: text.trim(),
      done: false,
      user: req.user.id,
      company: req.user.company || ''
    })
    res.status(201).json({ _id: task._id, text: task.text, done: task.done })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── PUT toggle done ──────────────────────────────────────────────────────────
router.put('/:id/toggle', protect, checkTrial, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, ...taskScope(req.user) })
    if (!task) return res.status(404).json({ message: 'Task not found' })
    task.done = !task.done
    task.completedAt = task.done ? new Date() : null
    task.status = task.done ? 'completed' : 'pending'
    await task.save()
    res.json({ _id: task._id, text: task.text, done: task.done })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── DELETE task ──────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, ...taskScope(req.user) })
    if (!task) return res.status(404).json({ message: 'Task not found' })
    res.json({ message: 'Task deleted!' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
