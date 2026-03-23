const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { protect, allowRoles } = require('../middleware/authMiddleware')

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, company } = req.body
    const exists = await User.findOne({ email })
    if (exists) return res.status(400).json({ message: 'User already exists' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name, email,
      password: hashed,
      role: role || 'agent',
      company: company || ''
    })

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name, company: user.company },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email })
    if (!user) return res.status(400).json({ message: 'User not found' })
    if (!user.isActive) return res.status(403).json({ message: 'Account deactivated' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(400).json({ message: 'Wrong password' })

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name, company: user.company },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, company: user.company } })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Get all users — sirf superadmin aur admin
router.get('/users', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password')
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// User banao — sirf superadmin aur admin
router.post('/users/create', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const { name, email, password, role, company } = req.body
    const exists = await User.findOne({ email })
    if (exists) return res.status(400).json({ message: 'User already exists' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name, email,
      password: hashed,
      role: role || 'agent',
      company: company || '',
      createdBy: req.user.id
    })
    res.json({ message: 'User created!', user: { id: user._id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Role update — sirf superadmin
router.put('/users/:id/role', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role },
      { new: true }
    ).select('-password')
    res.json({ message: 'Role updated!', user })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// User activate/deactivate — sirf superadmin aur admin
router.put('/users/:id/toggle', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    user.isActive = !user.isActive
    await user.save()
    res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'}`, isActive: user.isActive })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// User delete — sirf superadmin
router.delete('/users/:id', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id)
    res.json({ message: 'User deleted!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
