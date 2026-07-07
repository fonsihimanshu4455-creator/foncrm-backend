const express = require('express')
const router = express.Router()
const Deal = require('../models/Deal')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')
const { sendError } = require('../utils/errors')

// ─── GET /api/reports ─────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)

    const [wonAgg, lostCount, monthlyAgg] = await Promise.all([
      Deal.aggregate([
        { $match: { ...filter, stage: 'Won' } },
        { $group: { _id: null, revenue: { $sum: '$value' }, count: { $sum: 1 } } }
      ]),
      Deal.countDocuments({ ...filter, stage: 'Lost' }),
      // Won value grouped by month for the current year
      Deal.aggregate([
        { $match: { ...filter, stage: 'Won', actualCloseDate: { $gte: startOfYear } } },
        { $group: { _id: { $month: '$actualCloseDate' }, total: { $sum: '$value' } } }
      ])
    ])

    const totalRevenue = wonAgg[0]?.revenue || 0
    const dealsClosed = wonAgg[0]?.count || 0
    const avgDealSize = dealsClosed > 0 ? Math.round(totalRevenue / dealsClosed) : 0
    const winRate = (dealsClosed + lostCount) > 0
      ? Math.round((dealsClosed / (dealsClosed + lostCount)) * 100)
      : 0

    // 12 numbers, Jan..Dec (month index from Mongo is 1-based)
    const monthlyRevenue = Array(12).fill(0)
    monthlyAgg.forEach(m => { monthlyRevenue[m._id - 1] = m.total })

    res.json({ totalRevenue, dealsClosed, avgDealSize, winRate, monthlyRevenue })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
