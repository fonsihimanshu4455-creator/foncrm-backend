const express = require('express')
const router = express.Router()
const Notification = require('../models/Notification')
const { protect } = require('../middleware/authMiddleware')

// ─── GET unread count (must be before /:id) ───────────────────────────────────
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user.id, isRead: false })
    res.json({ count })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET all notifications for current user ───────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query
    const filter = { user: req.user.id }
    if (unreadOnly === 'true') filter.isRead = false

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user.id, isRead: false })
    ])

    res.json({
      notifications,
      total,
      unreadCount,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PUT mark ALL as read ─────────────────────────────────────────────────────
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    )
    res.json({ message: 'All notifications marked as read' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PUT mark single as read ──────────────────────────────────────────────────
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { isRead: true, readAt: new Date() },
      { new: true }
    )
    if (!notif) return res.status(404).json({ message: 'Notification not found' })
    res.json(notif)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── DELETE all notifications for user ───────────────────────────────────────
router.delete('/', protect, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user.id })
    res.json({ message: 'All notifications cleared' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── DELETE single notification ───────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id })
    if (!notif) return res.status(404).json({ message: 'Notification not found' })
    res.json({ message: 'Notification deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
