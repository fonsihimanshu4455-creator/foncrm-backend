const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { sendError } = require('../utils/errors')

const ROLES = ['superadmin', 'admin', 'manager', 'agent', 'viewer']

// Shape a user document exactly as the frontend expects.
const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  company: u.company
})

const signToken = (user) => jwt.sign(
  { id: user._id, role: user.role, name: user.name, company: user.company },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
)

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, company } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' })
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }
    const exists = await User.findOne({ email })
    if (exists) return res.status(400).json({ message: 'User already exists' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name, email,
      password: hashed,
      role: role || 'agent',
      company: company || ''
    })

    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (err) {
    sendError(res, err)
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

    user.lastLogin = new Date()
    await user.save()

    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (err) {
    sendError(res, err)
  }
})

// Get all users — sirf superadmin aur admin
router.get('/users', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const filter = req.user.role === 'superadmin' ? {} : { company: req.user.company }
    const users = await User.find(filter).select('-password')
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// User banao — sirf superadmin aur admin
router.post('/users/create', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const { name, email, password, role, company } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' })
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }
    const exists = await User.findOne({ email })
    if (exists) return res.status(400).json({ message: 'User already exists' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name, email,
      password: hashed,
      role: role || 'agent',
      // admins can only create users inside their own company
      company: req.user.role === 'superadmin' ? (company || '') : req.user.company,
      createdBy: req.user.id
    })
    res.json({ message: 'User created!', user: publicUser(user) })
  } catch (err) {
    sendError(res, err)
  }
})

// Role update — sirf superadmin
router.put('/users/:id/role', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    if (!ROLES.includes(req.body.role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role },
      { new: true }
    ).select('-password')
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ message: 'Role updated!', user })
  } catch (err) {
    sendError(res, err)
  }
})

// User activate/deactivate — sirf superadmin aur admin
router.put('/users/:id/toggle', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    user.isActive = !user.isActive
    await user.save()
    res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'}`, isActive: user.isActive })
  } catch (err) {
    sendError(res, err)
  }
})

// User delete — sirf superadmin
router.delete('/users/:id', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json({ message: 'User deleted!' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
