const express       = require('express')
const router        = express.Router()
const AutomationRule = require('../models/AutomationRule')
const AutomationLog  = require('../models/AutomationLog')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

// ── List automation rules ──────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const rules = await AutomationRule.find({ company: req.user.company })
      .sort({ createdAt: -1 })
    res.json({ rules, total: rules.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Get single rule ────────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const rule = await AutomationRule.findOne({ _id: req.params.id, company: req.user.company })
    if (!rule) return res.status(404).json({ message: 'Automation rule not found' })
    res.json(rule)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create automation rule ─────────────────────────────────────────────────────
router.post('/', protect, allowRoles('superadmin', 'admin', 'manager'), checkTrial, async (req, res) => {
  try {
    const { name, trigger, actions, isActive } = req.body
    if (!name || !trigger || !actions?.length) {
      return res.status(400).json({ message: 'name, trigger, and actions are required' })
    }

    const rule = await AutomationRule.create({
      name,
      trigger,
      actions,
      isActive: isActive !== false,
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(rule)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Update automation rule ─────────────────────────────────────────────────────
router.put('/:id', protect, allowRoles('superadmin', 'admin', 'manager'), checkTrial, async (req, res) => {
  try {
    const rule = await AutomationRule.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true }
    )
    if (!rule) return res.status(404).json({ message: 'Automation rule not found' })
    res.json(rule)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Toggle active ──────────────────────────────────────────────────────────────
router.patch('/:id/toggle', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const rule = await AutomationRule.findOne({ _id: req.params.id, company: req.user.company })
    if (!rule) return res.status(404).json({ message: 'Automation rule not found' })
    rule.isActive = !rule.isActive
    await rule.save()
    res.json({ message: `Rule ${rule.isActive ? 'activated' : 'deactivated'}`, isActive: rule.isActive })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Delete automation rule ─────────────────────────────────────────────────────
router.delete('/:id', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const rule = await AutomationRule.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!rule) return res.status(404).json({ message: 'Automation rule not found' })
    res.json({ message: 'Automation rule deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Test run a rule manually ───────────────────────────────────────────────────
router.post('/:id/test', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const rule = await AutomationRule.findOne({ _id: req.params.id, company: req.user.company })
    if (!rule) return res.status(404).json({ message: 'Automation rule not found' })

    const actionsRun = []
    const errors     = []

    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case 'send_notification': {
            const Notification = require('../models/Notification')
            await Notification.create({
              user:    req.user._id,
              type:    'info',
              title:   'Automation Test',
              message: action.config?.message || `Test run of rule: ${rule.name}`,
              company: req.user.company
            })
            actionsRun.push({ type: action.type, status: 'success' })
            break
          }
          case 'create_task': {
            const Task = require('../models/Task')
            await Task.create({
              title:      action.config?.title || `Auto task: ${rule.name}`,
              description: action.config?.description || '',
              dueDate:    action.config?.dueDate ? new Date(Date.now() + (action.config.daysFromNow || 1) * 86400000) : undefined,
              status:     'pending',
              company:    req.user.company,
              createdBy:  req.user._id
            })
            actionsRun.push({ type: action.type, status: 'success' })
            break
          }
          default:
            actionsRun.push({ type: action.type, status: 'skipped', note: 'Action type simulated in test mode' })
        }
      } catch (actionErr) {
        errors.push({ type: action.type, error: actionErr.message })
        actionsRun.push({ type: action.type, status: 'error', error: actionErr.message })
      }
    }

    await AutomationLog.create({
      ruleId:       rule._id,
      triggerEvent: rule.trigger.event,
      status:       errors.length > 0 ? 'partial' : 'success',
      actionsRun,
      entityType:   'manual_test',
      company:      req.user.company
    })

    await AutomationRule.findByIdAndUpdate(rule._id, { $inc: { runCount: 1 } })

    res.json({ message: 'Test run complete', actionsRun, errors })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Automation logs ────────────────────────────────────────────────────────────
router.get('/logs/all', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { page = 1, limit = 20, ruleId } = req.query
    const filter = { company: req.user.company }
    if (ruleId) filter.ruleId = ruleId

    const skip  = (page - 1) * limit
    const total = await AutomationLog.countDocuments(filter)
    const logs  = await AutomationLog.find(filter)
      .populate('ruleId', 'name trigger')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
