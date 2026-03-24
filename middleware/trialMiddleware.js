const Company = require('../models/Company')

/**
 * Blocks requests if the user's company plan has expired or is suspended.
 * Superadmin always bypasses this check.
 * If the company is not found in DB, the request passes through (new users).
 */
const checkTrial = async (req, res, next) => {
  try {
    // Superadmin bypasses all plan checks
    if (req.user?.role === 'superadmin') return next()

    const companyName = req.user?.company
    if (!companyName) return next()

    const company = await Company.findOne({ name: companyName })
    if (!company) return next()

    // Suspended account
    if (!company.isActive || company.planStatus === 'suspended') {
      return res.status(403).json({
        message: 'Account suspended. Please contact support.',
        code: 'ACCOUNT_SUSPENDED'
      })
    }

    // Trial expired (auto-mark as expired)
    if (company.plan === 'trial' && company.trialEndsAt < new Date()) {
      if (company.planStatus !== 'expired') {
        company.planStatus = 'expired'
        await company.save()
      }
      return res.status(403).json({
        message: 'Trial expired. Please upgrade your plan.',
        code: 'TRIAL_EXPIRED',
        trialEndsAt: company.trialEndsAt
      })
    }

    // Paid plan expired
    if (company.planStatus === 'expired') {
      return res.status(403).json({
        message: 'Plan expired. Please renew.',
        code: 'PLAN_EXPIRED',
        trialEndsAt: company.trialEndsAt
      })
    }

    // Attach company data for downstream use
    req.companyData = company
    next()
  } catch (err) {
    // Don't block on DB errors — fail open
    next()
  }
}

module.exports = { checkTrial }
