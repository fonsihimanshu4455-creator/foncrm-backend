const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const { protect } = require('../middleware/authMiddleware')
const { sendError } = require('../utils/errors')

// ─── GET /api/settings -> current user profile (no password) ──────────────────
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password')
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user)
  } catch (err) {
    sendError(res, err)
  }
})

// ─── PUT /api/settings {name,company,password?} -> update self, return {user} ──
router.put('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    const { name, company, password } = req.body
    if (name !== undefined) user.name = name
    if (company !== undefined) user.company = company
    if (password) {
      if (password.length < 4) {
        return res.status(400).json({ message: 'Password too short' })
      }
      user.password = await bcrypt.hash(password, 10)
    }

    await user.save()

    const safe = user.toObject()
    delete safe.password
    res.json({ user: safe })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
