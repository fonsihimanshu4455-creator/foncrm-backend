const express = require('express')
const router = express.Router()
const User = require('../models/User')
const Lead = require('../models/Lead')
const Company = require('../models/Company')
const bcrypt = require('bcryptjs')
const { protect, allowRoles } = require('../middleware/authMiddleware')

// ─── COMPANY INFO ─────────────────────────────────────────
router.get('/info', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const company = await Company.findOne({ 
      $or: [{ email: req.user.email }, { name: req.user.company }]
    })
    res.json(company || { name: req.user.company, plan: 'trial', planStatus: 'active', maxUsers: 3 })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── TEAM STATS ───────────────────────────────────────────
router.get('/stats', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const company = req.user.company

    const totalUsers = await User.countDocuments({ company, role: { $ne: 'superadmin' } })
    const activeUsers = await User.countDocuments({ company, isActive: true, role: { $ne: 'superadmin' } })
    const totalLeads = await Lead.countDocuments({ createdBy: { $exists: true } })
    const thisMonth = new Date(new Date().setDate(1))
    const leadsThisMonth = await Lead.countDocuments({ createdAt: { $gte: thisMonth } })

    const usersByRole = await User.aggregate([
      { $match: { company, role: { $ne: 'superadmin' } } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ])

    res.json({ totalUsers, activeUsers, totalLeads, leadsThisMonth, usersByRole })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── TEAM USERS ───────────────────────────────────────────
router.get('/team', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const users = await User.find({ 
      company: req.user.company,
      role: { $ne: 'superadmin' }
    }).select('-password').sort({ createdAt: -1 })
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/team', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ message: 'Sab fields bharo!' })

    const exists = await User.findOne({ email })
    if (exists) return res.status(400).json({ message: 'Email already registered!' })

    // Check company user limit
    const company = await Company.findOne({ name: req.user.company })
    if (company) {
      const currentUsers = await User.countDocuments({ company: req.user.company, isActive: true })
      if (currentUsers >= company.maxUsers) {
        return res.status(403).json({ message: `Plan limit! Max ${company.maxUsers} users allowed. Upgrade karo.` })
      }
    }

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name, email,
      password: hashed,
      role: role || 'agent',
      company: req.user.company,
      createdBy: req.user.id
    })
    res.json({ message: 'Team member add ho gaya!', user: { id: user._id, name: user.name, email: user.email, role: user.role } })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/team/:id/role', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, company: req.user.company })
    if (!user) return res.status(404).json({ message: 'User nahi mila ya alag company ka hai' })
    user.role = req.body.role
    await user.save()
    res.json({ message: 'Role update ho gaya!', user })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/team/:id/toggle', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, company: req.user.company })
    if (!user) return res.status(404).json({ message: 'User nahi mila' })
    user.isActive = !user.isActive
    await user.save()
    res.json({ message: `User ${user.isActive ? 'activate' : 'deactivate'} ho gaya!`, isActive: user.isActive })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/team/:id', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, company: req.user.company })
    if (!user) return res.status(404).json({ message: 'User nahi mila' })
    await User.findByIdAndDelete(req.params.id)
    res.json({ message: 'Team member delete ho gaya!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── LEADS OVERVIEW ───────────────────────────────────────
router.get('/leads-overview', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const allLeads = await Lead.find().sort({ createdAt: -1 }).limit(20)
    const statusCount = await Lead.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
    const sourceCount = await Lead.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ])
    res.json({ leads: allLeads, statusCount, sourceCount })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── REPORTS ──────────────────────────────────────────────
router.get('/reports', protect, allowRoles('admin', 'superadmin'), async (req, res) => {
  try {
    // Leads per month (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const leadsPerMonth = await Lead.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ])

    const topAgents = await Lead.aggregate([
      { $group: { _id: '$createdBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ])

    res.json({ leadsPerMonth, topAgents })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
