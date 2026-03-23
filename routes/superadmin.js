const express = require('express')
const router = express.Router()
const Company = require('../models/Company')
const User = require('../models/User')
const Lead = require('../models/Lead')
const ActivityLog = require('../models/ActivityLog')
const { protect, allowRoles, logActivity } = require('../middleware/authMiddleware')

// ─── STATS ───────────────────────────────────────────────
router.get('/stats', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const totalCompanies = await Company.countDocuments()
    const activeCompanies = await Company.countDocuments({ isActive: true, planStatus: 'active' })
    const trialCompanies = await Company.countDocuments({ plan: 'trial' })
    const totalUsers = await User.countDocuments({ role: { $ne: 'superadmin' } })
    const totalLeads = await Lead.countDocuments()

    const planBreakdown = await Company.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } }
    ])

    const recentCompanies = await Company.find()
      .sort({ createdAt: -1 }).limit(5)

    res.json({
      totalCompanies,
      activeCompanies,
      trialCompanies,
      totalUsers,
      totalLeads,
      planBreakdown,
      recentCompanies
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── COMPANIES ───────────────────────────────────────────
router.get('/companies', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 })
    res.json(companies)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/companies', protect, allowRoles('superadmin'), logActivity('Company created'), async (req, res) => {
  try {
    const { name, email, phone, plan, maxUsers, address, industry, notes } = req.body
    const exists = await Company.findOne({ email })
    if (exists) return res.status(400).json({ message: 'Company already exists' })

    const trialDays = plan === 'trial' ? 14 : 365
    const company = await Company.create({
      name, email, phone: phone || '',
      plan: plan || 'trial',
      maxUsers: maxUsers || (plan === 'trial' ? 3 : plan === 'starter' ? 5 : plan === 'professional' ? 20 : 999),
      trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
      address: address || '',
      industry: industry || '',
      notes: notes || '',
      createdBy: req.user.id
    })
    res.json({ message: 'Company created!', company })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/companies/:id', protect, allowRoles('superadmin'), logActivity('Company updated'), async (req, res) => {
  try {
    const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true })
    res.json({ message: 'Company updated!', company })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/companies/:id/toggle', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
    company.isActive = !company.isActive
    company.planStatus = company.isActive ? 'active' : 'suspended'
    await company.save()
    res.json({ message: `Company ${company.isActive ? 'activated' : 'suspended'}`, company })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/companies/:id/plan', protect, allowRoles('superadmin'), logActivity('Plan changed'), async (req, res) => {
  try {
    const { plan, maxUsers, days } = req.body
    const update = {
      plan,
      maxUsers: maxUsers || (plan === 'trial' ? 3 : plan === 'starter' ? 5 : plan === 'professional' ? 20 : 999),
      planStatus: 'active',
      trialEndsAt: new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000)
    }
    const company = await Company.findByIdAndUpdate(req.params.id, update, { new: true })
    res.json({ message: 'Plan updated!', company })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/companies/:id', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    await Company.findByIdAndDelete(req.params.id)
    res.json({ message: 'Company deleted!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── ALL USERS ───────────────────────────────────────────
router.get('/users', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'superadmin' } })
      .select('-password').sort({ createdAt: -1 })
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── ACTIVITY LOGS ───────────────────────────────────────
router.get('/logs', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(100)
    res.json(logs)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/logs', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    await ActivityLog.deleteMany({})
    res.json({ message: 'Logs cleared!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GLOBAL SETTINGS ─────────────────────────────────────
router.get('/settings', protect, allowRoles('superadmin'), async (req, res) => {
  res.json({
    appName: 'FonCRM',
    version: '1.0.0',
    trialDays: 14,
    plans: {
      trial: { maxUsers: 3, days: 14, price: 0 },
      starter: { maxUsers: 5, days: 30, price: 999 },
      professional: { maxUsers: 20, days: 30, price: 2999 },
      enterprise: { maxUsers: 999, days: 365, price: 9999 },
    }
  })
})

module.exports = router
