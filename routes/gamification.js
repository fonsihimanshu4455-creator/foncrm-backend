const express    = require('express')
const router     = express.Router()
const UserPoints = require('../models/UserPoints')
const User       = require('../models/User')
const { protect }    = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { allowRoles } = require('../middleware/authMiddleware')
const { ALL_BADGES, addPoints } = require('../utils/addPoints')

// ── GET leaderboard (top 10) ───────────────────────────────────────────────────
router.get('/leaderboard', protect, checkTrial, async (req, res) => {
  try {
    const docs = await UserPoints.find({ company: req.user.company })
      .populate('userId', 'name email role')
      .sort({ points: -1 })
      .limit(10)

    const leaderboard = docs.map((doc, i) => ({
      rank:          i + 1,
      userId:        doc.userId?._id,
      name:          doc.userId?.name || 'Unknown',
      email:         doc.userId?.email,
      role:          doc.userId?.role,
      points:        doc.points,
      weeklyPoints:  doc.weeklyPoints,
      monthlyPoints: doc.monthlyPoints,
      badges:        doc.badges
    }))

    res.json({ leaderboard })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET current user's stats ───────────────────────────────────────────────────
router.get('/my-stats', protect, checkTrial, async (req, res) => {
  try {
    let doc = await UserPoints.findOne({ userId: req.user._id || req.user.id })
    if (!doc) {
      doc = { points: 0, weeklyPoints: 0, monthlyPoints: 0, badges: [], rank: null, activityLog: [] }
    }

    // Calculate rank
    const rank = await UserPoints.countDocuments({
      company: req.user.company,
      points: { $gt: doc.points || 0 }
    }) + 1

    res.json({
      points:        doc.points || 0,
      weeklyPoints:  doc.weeklyPoints || 0,
      monthlyPoints: doc.monthlyPoints || 0,
      badges:        doc.badges || [],
      rank,
      recentActivity: (doc.activityLog || []).slice(-10).reverse()
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET all available badges ───────────────────────────────────────────────────
router.get('/badges', protect, async (req, res) => {
  res.json({ badges: ALL_BADGES })
})

// ── POST manually add points (admin only) ─────────────────────────────────────
router.post('/add-points', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { userId, action, points: customPoints, reason } = req.body
    if (!userId) return res.status(400).json({ message: 'userId required' })

    const targetUser = await User.findById(userId).select('name company')
    if (!targetUser) return res.status(404).json({ message: 'User not found' })

    if (action) {
      await addPoints(userId, targetUser.company, action)
    } else if (customPoints) {
      await UserPoints.findOneAndUpdate(
        { userId },
        {
          $inc: { points: customPoints, weeklyPoints: customPoints, monthlyPoints: customPoints },
          $setOnInsert: { userId, company: targetUser.company, badges: [] },
          $push: { activityLog: { action: reason || 'manual', points: customPoints, timestamp: new Date() } }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    }

    const updated = await UserPoints.findOne({ userId })
    res.json({ message: 'Points added', points: updated?.points, badges: updated?.badges })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Reset weekly points (admin) ────────────────────────────────────────────────
router.post('/reset-weekly', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    await UserPoints.updateMany({ company: req.user.company }, { weeklyPoints: 0 })
    res.json({ message: 'Weekly points reset for all users' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
