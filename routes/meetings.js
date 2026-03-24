const express  = require('express')
const router   = express.Router()
const Meeting  = require('../models/Meeting')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial }     = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')
const { notify }         = require('../utils/createNotification')

// ── List meetings ─────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { status, type, relatedLead, relatedDeal, relatedContact, from, to, page = 1, limit = 20 } = req.query
    const filter = { ...getScopeFilter(req.user), company: req.user.company }

    if (status)         filter.status = status
    if (type)           filter.type   = type
    if (relatedLead)    filter.relatedLead    = relatedLead
    if (relatedDeal)    filter.relatedDeal    = relatedDeal
    if (relatedContact) filter.relatedContact = relatedContact
    if (from || to) {
      filter.startTime = {}
      if (from) filter.startTime.$gte = new Date(from)
      if (to)   filter.startTime.$lte = new Date(to)
    }

    const skip  = (page - 1) * limit
    const total = await Meeting.countDocuments(filter)
    const meetings = await Meeting.find(filter)
      .populate('relatedLead',    'name email')
      .populate('relatedContact', 'name email')
      .populate('relatedDeal',    'title value')
      .populate('assignedTo',     'name email')
      .populate('createdBy',      'name')
      .sort({ startTime: 1 })
      .skip(skip).limit(Number(limit))

    res.json({ meetings, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Upcoming meetings (next N days) ───────────────────────────────────────────
router.get('/upcoming', protect, checkTrial, async (req, res) => {
  try {
    const days = Number(req.query.days) || 7
    const now  = new Date()
    const end  = new Date(now.getTime() + days * 86400000)

    const filter = {
      ...getScopeFilter(req.user),
      company:   req.user.company,
      status:    'scheduled',
      startTime: { $gte: now, $lte: end }
    }

    const meetings = await Meeting.find(filter)
      .populate('relatedLead',    'name')
      .populate('relatedContact', 'name')
      .populate('relatedDeal',    'title')
      .populate('assignedTo',     'name')
      .sort({ startTime: 1 })
      .limit(50)

    res.json({ meetings, count: meetings.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get single meeting ────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('relatedLead',    'name email')
      .populate('relatedContact', 'name email')
      .populate('relatedDeal',    'title value')
      .populate('assignedTo',     'name email')
      .populate('createdBy',      'name email')
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' })
    res.json(meeting)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create meeting ────────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const {
      title, description, startTime, endTime, location, meetingLink,
      type, attendees, reminder, notes,
      relatedLead, relatedContact, relatedDeal, assignedTo
    } = req.body

    const meeting = await Meeting.create({
      title, description, startTime, endTime, location, meetingLink,
      type, attendees, reminder, notes,
      relatedLead, relatedContact, relatedDeal,
      assignedTo: assignedTo || req.user._id,
      company:   req.user.company,
      createdBy: req.user._id
    })

    // Notify assigned user if different from creator
    if (assignedTo && assignedTo.toString() !== req.user.id) {
      await notify({
        userId:  assignedTo,
        title:   'Meeting Scheduled',
        message: `"${meeting.title}" scheduled for ${new Date(meeting.startTime).toLocaleString()}`,
        type:    'reminder',
        relatedModel: 'Meeting',
        relatedId: meeting._id,
        company: meeting.company
      })
    }

    const populated = await Meeting.findById(meeting._id)
      .populate('relatedLead', 'name')
      .populate('relatedContact', 'name')
      .populate('relatedDeal', 'title')
      .populate('assignedTo', 'name email')

    res.status(201).json(populated)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update meeting ────────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedTo', 'name email')
      .populate('relatedLead', 'name')
      .populate('relatedDeal', 'title')
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' })
    res.json(meeting)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update meeting status ─────────────────────────────────────────────────────
router.patch('/:id/status', protect, checkTrial, async (req, res) => {
  try {
    const { status, outcome } = req.body
    const update = { status }
    if (outcome) update.outcome = outcome

    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      update,
      { new: true }
    )
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' })
    res.json(meeting)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update attendee response ──────────────────────────────────────────────────
router.patch('/:id/attendees', protect, checkTrial, async (req, res) => {
  try {
    const { email, status } = req.body
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company })
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' })

    const attendee = meeting.attendees.find(a => a.email === email)
    if (!attendee) return res.status(404).json({ message: 'Attendee not found' })

    attendee.status = status
    await meeting.save()
    res.json(meeting)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete meeting ────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const meeting = await Meeting.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' })
    res.json({ message: 'Meeting deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Reminders due (meetings starting within minutesBefore) ───────────────────
router.get('/reminders/due', protect, checkTrial, async (req, res) => {
  try {
    const now      = new Date()
    const meetings = await Meeting.find({
      company:  req.user.company,
      status:   'scheduled',
      'reminder.enabled': true,
      startTime: { $gt: now }
    }).populate('assignedTo', 'name email')

    const due = meetings.filter(m => {
      const minutesBefore = m.reminder.minutesBefore || 30
      const diff = (new Date(m.startTime) - now) / 60000
      return diff <= minutesBefore
    })

    res.json({ due, count: due.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
