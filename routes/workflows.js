const express    = require('express')
const router     = express.Router()
const Workflow   = require('../models/Workflow')
const WorkflowLog = require('../models/WorkflowLog')
const Lead       = require('../models/Lead')
const Task       = require('../models/Task')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')
const { getScopeFilter }      = require('../utils/scopeFilter')
const { notify }              = require('../utils/createNotification')

// ── List workflows ─────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { isActive, page = 1, limit = 20 } = req.query
    const filter = { company: req.user.company }
    if (isActive !== undefined) filter.isActive = isActive === 'true'

    const skip  = (page - 1) * limit
    const total = await Workflow.countDocuments(filter)
    const workflows = await Workflow.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))

    res.json({ workflows, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get single workflow ────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const workflow = await Workflow.findOne({ _id: req.params.id, company: req.user.company })
      .populate('createdBy', 'name email')
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' })
    res.json(workflow)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create workflow ────────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, description, trigger, actions, isActive } = req.body
    const workflow = await Workflow.create({
      name, description, trigger, actions,
      isActive: isActive !== undefined ? isActive : true,
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(workflow)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update workflow ────────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const workflow = await Workflow.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true, runValidators: true }
    )
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' })
    res.json(workflow)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Toggle active ──────────────────────────────────────────────────────────────
router.patch('/:id/toggle', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const workflow = await Workflow.findOne({ _id: req.params.id, company: req.user.company })
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' })
    workflow.isActive = !workflow.isActive
    await workflow.save()
    res.json({ isActive: workflow.isActive, message: `Workflow ${workflow.isActive ? 'activated' : 'deactivated'}` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete workflow ────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const workflow = await Workflow.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' })
    res.json({ message: 'Workflow deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Manually trigger workflow on a lead ───────────────────────────────────────
router.post('/:id/run', protect, checkTrial, async (req, res) => {
  try {
    const { leadId } = req.body
    const workflow = await Workflow.findOne({ _id: req.params.id, company: req.user.company, isActive: true })
    if (!workflow) return res.status(404).json({ message: 'Active workflow not found' })

    const lead = leadId ? await Lead.findById(leadId) : null
    const actionsExecuted = []

    for (const action of (workflow.actions || []).sort((a, b) => (a.order || 0) - (b.order || 0))) {
      try {
        if (action.type === 'create_task' && lead) {
          await Task.create({
            title:   action.config?.title || `Task from workflow: ${workflow.name}`,
            type:    action.config?.taskType || 'follow_up',
            dueDate: action.config?.dueDays
              ? new Date(Date.now() + action.config.dueDays * 86400000)
              : new Date(Date.now() + 86400000),
            priority:    action.config?.priority || 'medium',
            relatedLead: lead._id,
            assignedTo:  action.config?.assignTo || lead.assignedTo,
            company:     req.user.company,
            createdBy:   req.user._id
          })
          actionsExecuted.push({ action: action.type, status: 'success' })
        } else if (action.type === 'assign_lead' && lead && action.config?.assignTo) {
          await Lead.findByIdAndUpdate(lead._id, { assignedTo: action.config.assignTo })
          await notify({
            userId:  action.config.assignTo,
            title:   'Lead Assigned via Workflow',
            message: `Lead "${lead.name}" assigned by workflow "${workflow.name}"`,
            type:    'lead',
            relatedModel: 'Lead',
            relatedId: lead._id,
            company: req.user.company
          })
          actionsExecuted.push({ action: action.type, status: 'success' })
        } else if (action.type === 'send_notification') {
          const targetUser = action.config?.userId || req.user._id
          await notify({
            userId:  targetUser,
            title:   action.config?.title || 'Workflow Notification',
            message: action.config?.message || `Workflow "${workflow.name}" executed`,
            type:    'system',
            company: req.user.company
          })
          actionsExecuted.push({ action: action.type, status: 'success' })
        } else if (action.type === 'update_field' && lead && action.config?.field) {
          await Lead.findByIdAndUpdate(lead._id, { [action.config.field]: action.config.value })
          actionsExecuted.push({ action: action.type, status: 'success' })
        } else {
          actionsExecuted.push({ action: action.type, status: 'skipped' })
        }
      } catch (e) {
        actionsExecuted.push({ action: action.type, status: 'failed', error: e.message })
      }
    }

    await Workflow.findByIdAndUpdate(workflow._id, {
      $inc: { runCount: 1 },
      lastRunAt: new Date()
    })

    const log = await WorkflowLog.create({
      workflow:    workflow._id,
      triggerType: 'manual',
      triggerData: { triggeredBy: req.user._id, leadId },
      status:      actionsExecuted.every(a => a.status !== 'failed') ? 'success' : 'partial',
      actionsExecuted,
      relatedLead: leadId || undefined,
      company:     req.user.company
    })

    res.json({ message: 'Workflow executed', actionsExecuted, logId: log._id })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get workflow run logs ──────────────────────────────────────────────────────
router.get('/:id/logs', protect, checkTrial, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip  = (page - 1) * limit
    const filter = { workflow: req.params.id, company: req.user.company }
    const total = await WorkflowLog.countDocuments(filter)
    const logs  = await WorkflowLog.find(filter)
      .populate('relatedLead', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
