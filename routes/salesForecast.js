const express      = require('express')
const router       = express.Router()
const SalesForecast = require('../models/SalesForecast')
const Deal         = require('../models/Deal')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

// ── List forecasts ─────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { year } = req.query
    const filter = { company: req.user.company }
    if (year) filter.year = Number(year)

    const forecasts = await SalesForecast.find(filter)
      .populate('createdBy', 'name')
      .sort({ year: -1, month: -1 })

    res.json(forecasts)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get forecast for a specific month/year ────────────────────────────────────
router.get('/:year/:month', protect, checkTrial, async (req, res) => {
  try {
    const { year, month } = req.params
    const forecast = await SalesForecast.findOne({
      company: req.user.company,
      year:  Number(year),
      month: Number(month)
    }).populate('createdBy', 'name email')

    if (!forecast) return res.status(404).json({ message: 'Forecast not found for this period' })
    res.json(forecast)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create or upsert monthly target ───────────────────────────────────────────
router.post('/', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { month, year, target, currency, notes } = req.body

    const forecast = await SalesForecast.findOneAndUpdate(
      { company: req.user.company, month: Number(month), year: Number(year) },
      {
        target: Number(target),
        currency: currency || 'INR',
        notes,
        createdBy: req.user._id
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )

    res.status(201).json(forecast)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update forecast ────────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const forecast = await SalesForecast.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true, runValidators: true }
    )
    if (!forecast) return res.status(404).json({ message: 'Forecast not found' })
    res.json(forecast)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete forecast ────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const forecast = await SalesForecast.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!forecast) return res.status(404).json({ message: 'Forecast not found' })
    res.json({ message: 'Forecast deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Pipeline value summary for a month/year ──────────────────────────────────
router.get('/pipeline/:year/:month', protect, checkTrial, async (req, res) => {
  try {
    const { year, month } = req.params
    const y = Number(year)
    const m = Number(month)

    const startDate = new Date(y, m - 1, 1)
    const endDate   = new Date(y, m, 0, 23, 59, 59)

    const [forecast, pipelineAgg] = await Promise.all([
      SalesForecast.findOne({ company: req.user.company, year: y, month: m }),
      Deal.aggregate([
        {
          $match: {
            company: req.user.company,
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$stage',
            count: { $sum: 1 },
            totalValue: { $sum: '$value' },
            weightedValue: {
              $sum: {
                $multiply: ['$value', { $divide: [{ $ifNull: ['$probability', 50] }, 100] }]
              }
            }
          }
        }
      ])
    ])

    const totalPipelineValue  = pipelineAgg.reduce((s, g) => s + g.totalValue, 0)
    const weightedPipelineValue = pipelineAgg.reduce((s, g) => s + g.weightedValue, 0)
    const wonDeals = pipelineAgg.find(g => g._id === 'won')
    const actualRevenue = wonDeals ? wonDeals.totalValue : 0
    const target = forecast ? forecast.target : 0
    const achievementPct = target > 0 ? Math.round((actualRevenue / target) * 100) : null

    res.json({
      year: y,
      month: m,
      target,
      currency: forecast?.currency || 'INR',
      actualRevenue,
      achievementPct,
      totalPipelineValue,
      weightedPipelineValue: Math.round(weightedPipelineValue),
      stageBreakdown: pipelineAgg
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Annual overview ───────────────────────────────────────────────────────────
router.get('/annual/:year', protect, checkTrial, async (req, res) => {
  try {
    const year = Number(req.params.year)
    const startDate = new Date(year, 0, 1)
    const endDate   = new Date(year, 11, 31, 23, 59, 59)

    const [forecasts, wonDealsAgg] = await Promise.all([
      SalesForecast.find({ company: req.user.company, year }),
      Deal.aggregate([
        {
          $match: {
            company: req.user.company,
            stage: 'won',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
            revenue: { $sum: '$value' },
            count:   { $sum: 1 }
          }
        }
      ])
    ])

    const months = Array.from({ length: 12 }, (_, i) => {
      const m       = i + 1
      const fc      = forecasts.find(f => f.month === m)
      const actual  = wonDealsAgg.find(a => a._id === m)
      const target  = fc ? fc.target : 0
      const revenue = actual ? actual.revenue : 0
      return {
        month: m,
        target,
        revenue,
        achievementPct: target > 0 ? Math.round((revenue / target) * 100) : null
      }
    })

    const totalTarget  = months.reduce((s, m) => s + m.target, 0)
    const totalRevenue = months.reduce((s, m) => s + m.revenue, 0)

    res.json({
      year,
      totalTarget,
      totalRevenue,
      overallAchievementPct: totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 100) : null,
      months
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
