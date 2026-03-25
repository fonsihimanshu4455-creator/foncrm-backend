const express         = require('express')
const router          = express.Router()
const bcrypt          = require('bcryptjs')
const jwt             = require('jsonwebtoken')
const crypto          = require('crypto')
const Reseller        = require('../models/Reseller')
const ResellerBranding= require('../models/ResellerBranding')
const Company         = require('../models/Company')
const User            = require('../models/User')
const { protect, allowRoles } = require('../middleware/authMiddleware')

const RESELLER_SECRET = process.env.JWT_SECRET + '_reseller'

// Middleware: verify reseller JWT
const resellerAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'No token' })
  try {
    req.reseller = jwt.verify(token, RESELLER_SECRET)
    next()
  } catch { res.status(401).json({ message: 'Invalid reseller token' }) }
}

// ── Register reseller (superadmin only) ───────────────────────────────────────
router.post('/register', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const { name, email, password, phone, commissionRate, maxCompanies } = req.body
    const exists = await Reseller.findOne({ email })
    if (exists) return res.status(400).json({ message: 'Reseller already exists' })

    const hashed = await bcrypt.hash(password, 10)
    const reseller = await Reseller.create({
      name, email, password: hashed,
      phone: phone || '',
      commissionRate: commissionRate || 10,
      maxCompanies:   maxCompanies   || 10,
      createdBy: req.user._id
    })

    // Create default branding
    await ResellerBranding.create({ resellerId: reseller._id, appName: name })

    res.status(201).json({ message: 'Reseller registered', reseller: { id: reseller._id, name, email } })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Reseller login ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const reseller = await Reseller.findOne({ email, isActive: true })
    if (!reseller) return res.status(400).json({ message: 'Invalid credentials' })

    const match = await bcrypt.compare(password, reseller.password)
    if (!match) return res.status(400).json({ message: 'Invalid credentials' })

    const token = jwt.sign(
      { id: reseller._id, email: reseller.email, role: 'reseller', name: reseller.name },
      RESELLER_SECRET,
      { expiresIn: '7d' }
    )
    res.json({ token, reseller: { id: reseller._id, name: reseller.name, email: reseller.email, commissionRate: reseller.commissionRate } })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Reseller dashboard ─────────────────────────────────────────────────────────
router.get('/dashboard', resellerAuth, async (req, res) => {
  try {
    const reseller   = await Reseller.findById(req.reseller.id)
    const companies  = await Company.find({ resellerId: reseller._id })
    const companyIds = companies.map(c => c._id)
    const totalUsers = await User.countDocuments({ companyId: { $in: companyIds } })
    const branding   = await ResellerBranding.findOne({ resellerId: reseller._id })

    res.json({
      reseller:        { name: reseller.name, email: reseller.email, commissionRate: reseller.commissionRate },
      totalCompanies:  companies.length,
      totalUsers,
      totalRevenue:    reseller.totalRevenue,
      commissionEarned:Math.round(reseller.totalRevenue * reseller.commissionRate / 100),
      branding
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── List reseller's companies ──────────────────────────────────────────────────
router.get('/companies', resellerAuth, async (req, res) => {
  try {
    const companies = await Company.find({ resellerId: req.reseller.id })
      .sort({ createdAt: -1 })
    res.json({ companies, total: companies.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create company under reseller ──────────────────────────────────────────────
router.post('/companies', resellerAuth, async (req, res) => {
  try {
    const reseller = await Reseller.findById(req.reseller.id)
    const existing = await Company.countDocuments({ resellerId: reseller._id })
    if (existing >= reseller.maxCompanies) {
      return res.status(403).json({ message: `Reseller company limit (${reseller.maxCompanies}) reached` })
    }

    const { name, email, phone, plan, industry } = req.body
    const exists = await Company.findOne({ email })
    if (exists) return res.status(400).json({ message: 'Company email already registered' })

    const resellerToken = crypto.randomBytes(16).toString('hex')
    const company = await Company.create({
      name, email, phone: phone || '',
      plan: plan || 'starter',
      industry: industry || '',
      maxUsers: plan === 'starter' ? 5 : plan === 'professional' ? 20 : 999,
      trialEndsAt: new Date(Date.now() + 30 * 86400000),
      resellerId:   reseller._id,
      resellerToken
    })

    await Reseller.findByIdAndUpdate(reseller._id, { $inc: { totalSales: 1 } })

    res.status(201).json({ message: 'Company created', company })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Commission breakdown ───────────────────────────────────────────────────────
router.get('/commission', resellerAuth, async (req, res) => {
  try {
    const reseller  = await Reseller.findById(req.reseller.id)
    const companies = await Company.find({ resellerId: reseller._id }).select('name plan createdAt')

    const PLAN_PRICES = { trial: 0, starter: 999, professional: 2999, enterprise: 9999 }

    const breakdown = companies.map(c => {
      const monthlyRevenue = PLAN_PRICES[c.plan] || 0
      const commission     = Math.round(monthlyRevenue * reseller.commissionRate / 100)
      return { company: c.name, plan: c.plan, monthlyRevenue, commissionRate: reseller.commissionRate, commission, joinedAt: c.createdAt }
    })

    const totalMonthlyCommission = breakdown.reduce((s, b) => s + b.commission, 0)
    res.json({ breakdown, totalMonthlyCommission, commissionRate: reseller.commissionRate })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET branding ───────────────────────────────────────────────────────────────
router.get('/branding', resellerAuth, async (req, res) => {
  try {
    const branding = await ResellerBranding.findOne({ resellerId: req.reseller.id })
    res.json(branding || {})
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── PUT branding ───────────────────────────────────────────────────────────────
router.put('/branding', resellerAuth, async (req, res) => {
  try {
    const { logoUrl, primaryColor, appName, customDomain, supportEmail, faviconUrl, tagline } = req.body
    const branding = await ResellerBranding.findOneAndUpdate(
      { resellerId: req.reseller.id },
      { logoUrl, primaryColor, appName, customDomain, supportEmail, faviconUrl, tagline },
      { new: true, upsert: true }
    )
    res.json(branding)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── List all resellers (superadmin) ───────────────────────────────────────────
router.get('/', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const resellers = await Reseller.find().select('-password').sort({ createdAt: -1 })
    res.json({ resellers, total: resellers.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
