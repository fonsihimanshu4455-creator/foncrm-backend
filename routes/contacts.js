const express = require('express')
const router  = express.Router()
const Contact = require('../models/Contact')
const Task    = require('../models/Task')
const Deal    = require('../models/Deal')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')
const { getScopeFilter }      = require('../utils/scopeFilter')
const { notify }              = require('../utils/createNotification')

// ─── Bulk update (before /:id) ────────────────────────────────────────────────
router.post('/bulk-update', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { ids, update } = req.body
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids array required' })
    const result = await Contact.updateMany({ _id: { $in: ids } }, update)
    res.json({ message: `${result.modifiedCount} contacts updated` })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Import contacts ──────────────────────────────────────────────────────────
router.post('/import', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { contacts } = req.body
    if (!Array.isArray(contacts) || contacts.length === 0) return res.status(400).json({ message: 'contacts array required' })
    const docs = contacts.map(c => ({ ...c, company: c.company || req.user.company, createdBy: req.user._id }))
    const inserted = await Contact.insertMany(docs, { ordered: false })
    res.status(201).json({ message: `${inserted.length} contacts imported`, count: inserted.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── Export contacts ──────────────────────────────────────────────────────────
router.get('/export', protect, checkTrial, async (req, res) => {
  try {
    const filter = getScopeFilter(req.user)
    const contacts = await Contact.find(filter).populate('assignedTo', 'name email').populate('createdBy', 'name').sort({ createdAt: -1 }).limit(5000)
    res.json({ contacts, total: contacts.length, exportedAt: new Date() })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── GET contacts by tag ──────────────────────────────────────────────────────
router.get('/by-tag/:tag', protect, checkTrial, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const filter = { ...getScopeFilter(req.user), tags: req.params.tag }
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('assignedTo', 'name email'),
      Contact.countDocuments(filter)
    ])
    res.json({ contacts, total, tag: req.params.tag, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── GET all contacts ─────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { status, tag, search, page = 1, limit = 20 } = req.query
    const filter = getScopeFilter(req.user)
    if (status) filter.status = status
    if (tag) filter.tags = tag
    if (search) { const rx = { $regex: search, $options: 'i' }; filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { company: rx }, { jobTitle: rx }] }
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('assignedTo', 'name email').populate('createdBy', 'name'),
      Contact.countDocuments(filter)
    ])
    res.json({ contacts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── GET contact timeline ─────────────────────────────────────────────────────
router.get('/:id/timeline', protect, checkTrial, async (req, res) => {
  try {
    const [tasks, deals] = await Promise.all([
      Task.find({ relatedContact: req.params.id }).sort({ createdAt: -1 }).limit(30),
      Deal.find({ contact: req.params.id }).sort({ createdAt: -1 }).limit(20)
    ])
    const timeline = [
      ...tasks.map(t => ({ type: 'task', data: t, date: t.createdAt })),
      ...deals.map(d => ({ type: 'deal', data: d, date: d.createdAt }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date))
    res.json(timeline)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── GET single contact ───────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id).populate('assignedTo', 'name email').populate('createdBy', 'name').populate('relatedLeads', 'name status value').populate('relatedDeals', 'title value stage')
    if (!contact) return res.status(404).json({ message: 'Contact not found' })
    res.json(contact)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── POST create contact ──────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const contact = new Contact({ ...req.body, company: req.body.company || req.user.company || '', createdBy: req.user.id, assignedTo: req.body.assignedTo || req.user.id })
    await contact.save()
    if (contact.assignedTo && contact.assignedTo.toString() !== req.user.id) {
      await notify({ userId: contact.assignedTo, title: 'New Contact Assigned', message: `Contact "${contact.name}" has been assigned to you`, type: 'contact', relatedModel: 'Contact', relatedId: contact._id, company: contact.company })
    }
    res.status(201).json(contact)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── PUT update contact ───────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
    if (!contact) return res.status(404).json({ message: 'Contact not found' })
    Object.assign(contact, req.body)
    await contact.save()
    res.json(contact)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── PATCH bulk update ────────────────────────────────────────────────────────
router.patch('/bulk', protect, allowRoles('superadmin', 'admin', 'manager'), checkTrial, async (req, res) => {
  try {
    const { ids, update } = req.body
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids array required' })
    const result = await Contact.updateMany({ _id: { $in: ids } }, update)
    res.json({ message: `${result.modifiedCount} contacts updated` })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── DELETE contact ───────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
    if (!contact) return res.status(404).json({ message: 'Contact not found' })
    if (!['superadmin', 'admin', 'manager'].includes(req.user.role) && contact.createdBy?.toString() !== req.user.id) return res.status(403).json({ message: 'Access denied' })
    await Contact.findByIdAndDelete(req.params.id)
    res.json({ message: 'Contact deleted!' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
