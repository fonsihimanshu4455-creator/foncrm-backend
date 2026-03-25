const express      = require('express')
const router       = express.Router()
const Subscription = require('../models/Subscription')
const Company      = require('../models/Company')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

const PLAN_PRICES  = { trial: 0, starter: 999, professional: 2999, enterprise: 9999 }
const PLAN_ANNUAL  = { trial: 0, starter: 9990, professional: 29990, enterprise: 99990 }

// ── List subscriptions (superadmin) ───────────────────────────────────────────
router.get('/', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const filter = req.user.role === 'superadmin' ? {} : { companyName: req.user.company }
    const subs   = await Subscription.find(filter)
      .populate('companyId', 'name email plan')
      .sort({ createdAt: -1 })
    res.json({ subscriptions: subs, total: subs.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Get subscription for current company ──────────────────────────────────────
router.get('/my', protect, checkTrial, async (req, res) => {
  try {
    const company = await Company.findOne({ name: req.user.company })
    if (!company) return res.status(404).json({ message: 'Company not found' })
    const sub = await Subscription.findOne({ companyId: company._id })
    res.json(sub || { plan: company.plan, status: company.planStatus })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create subscription ────────────────────────────────────────────────────────
router.post('/', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const { companyId, plan, billingCycle, paymentMethod } = req.body
    const company = await Company.findById(companyId)
    if (!company) return res.status(404).json({ message: 'Company not found' })

    const amount = billingCycle === 'yearly' ? PLAN_ANNUAL[plan] : PLAN_PRICES[plan]
    const nextBillingDate = billingCycle === 'yearly'
      ? new Date(Date.now() + 365 * 86400000)
      : new Date(Date.now() + 30 * 86400000)

    const sub = await Subscription.findOneAndUpdate(
      { companyId },
      { companyName: company.name, plan, amount, billingCycle, paymentMethod, status: 'active', nextBillingDate, createdBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    await Company.findByIdAndUpdate(companyId, { plan, planStatus: 'active' })
    res.status(201).json(sub)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Update subscription ────────────────────────────────────────────────────────
router.put('/:id', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const sub = await Subscription.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!sub) return res.status(404).json({ message: 'Subscription not found' })
    res.json(sub)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Manual plan upgrade ────────────────────────────────────────────────────────
router.post('/upgrade', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const { companyId, plan, billingCycle } = req.body
    const company = await Company.findById(companyId)
    if (!company) return res.status(404).json({ message: 'Company not found' })

    const amount = billingCycle === 'yearly' ? PLAN_ANNUAL[plan] : PLAN_PRICES[plan]
    const maxUsers = { trial: 3, starter: 5, professional: 20, enterprise: 999 }[plan] || 5

    await Company.findByIdAndUpdate(companyId, { plan, planStatus: 'active', maxUsers })
    const sub = await Subscription.findOneAndUpdate(
      { companyId },
      { plan, amount, billingCycle: billingCycle || 'monthly', status: 'active',
        nextBillingDate: new Date(Date.now() + 30 * 86400000),
        $push: { transactionHistory: { amount, status: 'success', plan, paidAt: new Date() } }
      },
      { upsert: true, new: true }
    )
    res.json({ message: `Company upgraded to ${plan}`, subscription: sub })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Revenue stats (MRR, ARR, churn) ──────────────────────────────────────────
router.get('/revenue-stats', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const active = await Subscription.find({ status: 'active' })
    const mrr    = active.reduce((s, sub) => {
      const monthly = sub.billingCycle === 'yearly' ? sub.amount / 12 : sub.amount
      return s + monthly
    }, 0)

    const cancelled  = await Subscription.countDocuments({ status: 'cancelled' })
    const total      = await Subscription.countDocuments()
    const churnRate  = total > 0 ? Math.round((cancelled / total) * 100) : 0

    const planBreakdown = await Subscription.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$plan', count: { $sum: 1 }, revenue: { $sum: '$amount' } } }
    ])

    res.json({
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      activeSubscriptions: active.length,
      churnRate,
      planBreakdown
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── List subscription invoices ─────────────────────────────────────────────────
router.get('/invoices', protect, allowRoles('superadmin'), async (req, res) => {
  try {
    const subs = await Subscription.find().populate('companyId', 'name email')
    const invoices = []
    subs.forEach(sub => {
      (sub.transactionHistory || []).forEach(tx => {
        invoices.push({
          company: sub.companyName,
          companyId: sub.companyId,
          plan: tx.plan,
          amount: tx.amount,
          status: tx.status,
          paidAt: tx.paidAt,
          razorpayOrderId: tx.razorpayOrderId,
          razorpayPaymentId: tx.razorpayPaymentId
        })
      })
    })
    invoices.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
    res.json({ invoices, total: invoices.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
