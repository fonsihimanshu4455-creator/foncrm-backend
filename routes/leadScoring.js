const express         = require('express')
const router          = express.Router()
const LeadScoringRule = require('../models/LeadScoringRule')
const Lead            = require('../models/Lead')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

// ── Helper: apply custom rules to a lead ─────────────────────────────────────
function applyRules(lead, rules) {
  let score = 0
  for (const rule of rules) {
    const leadVal = lead[rule.field]
    let match = false
    if (rule.operator === 'equals')   match = String(leadVal) === String(rule.value)
    if (rule.operator === 'contains') match = String(leadVal || '').toLowerCase().includes(String(rule.value).toLowerCase())
    if (rule.operator === 'exists')   match = !!leadVal
    if (rule.operator === 'gte')      match = Number(leadVal) >= Number(rule.value)
    if (rule.operator === 'lte')      match = Number(leadVal) <= Number(rule.value)
    if (match) score += rule.score || 0
  }
  return score
}

// ── List scoring rule sets ─────────────────────────────────────────────────────
router.get('/rules', protect, checkTrial, async (req, res) => {
  try {
    const rules = await LeadScoringRule.find({ company: req.user.company })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
    res.json(rules)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get single rule set ────────────────────────────────────────────────────────
router.get('/rules/:id', protect, checkTrial, async (req, res) => {
  try {
    const rule = await LeadScoringRule.findOne({ _id: req.params.id, company: req.user.company })
      .populate('createdBy', 'name email')
    if (!rule) return res.status(404).json({ message: 'Scoring rule not found' })
    res.json(rule)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create scoring rule set ────────────────────────────────────────────────────
router.post('/rules', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, rules, maxScore, isActive } = req.body
    const scoringRule = await LeadScoringRule.create({
      name, rules, maxScore,
      isActive: isActive !== undefined ? isActive : true,
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(scoringRule)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update scoring rule set ────────────────────────────────────────────────────
router.put('/rules/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const rule = await LeadScoringRule.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true, runValidators: true }
    )
    if (!rule) return res.status(404).json({ message: 'Scoring rule not found' })
    res.json(rule)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete scoring rule set ────────────────────────────────────────────────────
router.delete('/rules/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const rule = await LeadScoringRule.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!rule) return res.status(404).json({ message: 'Scoring rule not found' })
    res.json({ message: 'Scoring rule deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Score a single lead using active rule set ──────────────────────────────────
router.get('/score/:leadId', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.leadId)
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    // Built-in virtual score from the Lead model
    const builtInScore = lead.score

    // Custom rules score (uses first active rule set for this company)
    const ruleSet = await LeadScoringRule.findOne({ company: req.user.company, isActive: true })
    let customScore = null
    let breakdown   = []

    if (ruleSet) {
      const matchedRules = []
      for (const rule of ruleSet.rules) {
        const leadVal = lead[rule.field]
        let match = false
        if (rule.operator === 'equals')   match = String(leadVal) === String(rule.value)
        if (rule.operator === 'contains') match = String(leadVal || '').toLowerCase().includes(String(rule.value).toLowerCase())
        if (rule.operator === 'exists')   match = !!leadVal
        if (rule.operator === 'gte')      match = Number(leadVal) >= Number(rule.value)
        if (rule.operator === 'lte')      match = Number(leadVal) <= Number(rule.value)
        matchedRules.push({ ...rule.toObject(), matched: match })
      }
      customScore = Math.min(applyRules(lead, ruleSet.rules), ruleSet.maxScore || 100)
      breakdown   = matchedRules
    }

    res.json({
      leadId: lead._id,
      leadName: lead.name,
      builtInScore,
      customScore,
      activeRuleSet: ruleSet ? ruleSet.name : null,
      breakdown
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Bulk score leads and return ranked list ────────────────────────────────────
router.get('/ranked', protect, checkTrial, async (req, res) => {
  try {
    const { limit = 50 } = req.query
    const filter = { company: req.user.company }
    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name')
      .limit(Number(limit))

    const ruleSet = await LeadScoringRule.findOne({ company: req.user.company, isActive: true })

    const ranked = leads.map(lead => {
      const builtIn = lead.score
      const custom  = ruleSet
        ? Math.min(applyRules(lead, ruleSet.rules), ruleSet.maxScore || 100)
        : null
      return {
        _id:        lead._id,
        name:       lead.name,
        email:      lead.email,
        status:     lead.status,
        source:     lead.source,
        assignedTo: lead.assignedTo,
        builtInScore: builtIn,
        customScore:  custom,
        finalScore:   custom !== null ? custom : builtIn
      }
    }).sort((a, b) => b.finalScore - a.finalScore)

    res.json({ ranked, total: ranked.length, ruleSet: ruleSet?.name || 'built-in' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
