const express  = require('express')
const router   = express.Router()
const Lead     = require('../models/Lead')
const Contact  = require('../models/Contact')
const Deal     = require('../models/Deal')
const { protect, allowRoles } = require('../middleware/authMiddleware')

// ── Scan data health ───────────────────────────────────────────────────────────
router.get('/scan', protect, async (req, res) => {
  try {
    const company = req.user.company

    const [
      leadsNoEmail, leadsNoPhone, leadsNoValue,
      contactsNoEmail, contactsNoPhone,
      dealsNoProbability, dealsNoCloseDate,
      totalLeads, totalContacts, totalDeals
    ] = await Promise.all([
      Lead.countDocuments({ company, $or: [{ email: '' }, { email: { $exists: false } }] }),
      Lead.countDocuments({ company, $or: [{ phone: '' }, { phone: { $exists: false } }] }),
      Lead.countDocuments({ company, $or: [{ value: 0 }, { value: { $exists: false } }] }),
      Contact.countDocuments({ company, $or: [{ email: '' }, { email: { $exists: false } }] }),
      Contact.countDocuments({ company, $or: [{ phone: '' }, { phone: { $exists: false } }] }),
      Deal.countDocuments({ company, $or: [{ probability: 0 }, { probability: { $exists: false } }] }),
      Deal.countDocuments({ company, $or: [{ expectedCloseDate: null }, { expectedCloseDate: { $exists: false } }] }),
      Lead.countDocuments({ company }),
      Contact.countDocuments({ company }),
      Deal.countDocuments({ company })
    ])

    const issues = []
    if (leadsNoEmail    > 0) issues.push({ type: 'leads_no_email',         count: leadsNoEmail,        severity: 'medium', fix: 'Add email addresses to leads' })
    if (leadsNoPhone    > 0) issues.push({ type: 'leads_no_phone',         count: leadsNoPhone,        severity: 'medium', fix: 'Add phone numbers to leads' })
    if (leadsNoValue    > 0) issues.push({ type: 'leads_no_value',         count: leadsNoValue,        severity: 'low',    fix: 'Set estimated value for leads' })
    if (contactsNoEmail > 0) issues.push({ type: 'contacts_no_email',      count: contactsNoEmail,     severity: 'high',   fix: 'Add email addresses to contacts' })
    if (contactsNoPhone > 0) issues.push({ type: 'contacts_no_phone',      count: contactsNoPhone,     severity: 'medium', fix: 'Add phone numbers to contacts' })
    if (dealsNoProbability > 0) issues.push({ type: 'deals_no_probability', count: dealsNoProbability, severity: 'low',    fix: 'Set win probability for deals' })
    if (dealsNoCloseDate > 0) issues.push({ type: 'deals_no_close_date',   count: dealsNoCloseDate,    severity: 'medium', fix: 'Set expected close date for deals' })

    const healthScore = Math.max(0, 100 - (issues.reduce((s, i) => {
      return s + (i.severity === 'high' ? 10 : i.severity === 'medium' ? 5 : 2)
    }, 0)))

    res.json({
      healthScore,
      grade: healthScore >= 90 ? 'A' : healthScore >= 75 ? 'B' : healthScore >= 60 ? 'C' : 'D',
      issues,
      summary: { totalLeads, totalContacts, totalDeals },
      scannedAt: new Date()
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Find duplicate leads ───────────────────────────────────────────────────────
router.get('/duplicates', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    // Duplicate emails
    const emailDupes = await Lead.aggregate([
      { $match: { company: req.user.company, email: { $nin: ['', null] } } },
      { $group: { _id: '$email', count: { $sum: 1 }, leads: { $push: { id: '$_id', name: '$name', status: '$status', createdAt: '$createdAt' } } } },
      { $match: { count: { $gt: 1 } } },
      { $sort:  { count: -1 } },
      { $limit: 20 }
    ])

    // Duplicate phones
    const phoneDupes = await Lead.aggregate([
      { $match: { company: req.user.company, phone: { $nin: ['', null] } } },
      { $group: { _id: '$phone', count: { $sum: 1 }, leads: { $push: { id: '$_id', name: '$name', status: '$status', createdAt: '$createdAt' } } } },
      { $match: { count: { $gt: 1 } } },
      { $sort:  { count: -1 } },
      { $limit: 20 }
    ])

    // Duplicate contact emails
    const contactDupes = await Contact.aggregate([
      { $match: { company: req.user.company, email: { $nin: ['', null] } } },
      { $group: { _id: '$email', count: { $sum: 1 }, contacts: { $push: { id: '$_id', name: '$name' } } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 10 }
    ])

    res.json({
      leadEmailDuplicates:  emailDupes,
      leadPhoneDuplicates:  phoneDupes,
      contactEmailDuplicates: contactDupes,
      totalDuplicateGroups: emailDupes.length + phoneDupes.length + contactDupes.length
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Merge duplicate leads ──────────────────────────────────────────────────────
router.post('/merge', protect, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { primaryId, duplicateIds } = req.body
    if (!primaryId || !Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      return res.status(400).json({ message: 'primaryId and duplicateIds array required' })
    }

    const primary = await Lead.findOne({ _id: primaryId, company: req.user.company })
    if (!primary) return res.status(404).json({ message: 'Primary lead not found' })

    // Update tasks/deals/contacts pointing to duplicates → primary
    const Task    = require('../models/Task')
    const Timeline = require('../models/Timeline')

    await Promise.all([
      Task.updateMany(    { relatedLead: { $in: duplicateIds } }, { relatedLead: primaryId }),
      Timeline.updateMany({ entityId:    { $in: duplicateIds } }, { entityId:    primaryId }),
      Lead.deleteMany(    { _id: { $in: duplicateIds }, company: req.user.company })
    ])

    res.json({ message: `Merged ${duplicateIds.length} duplicate(s) into primary lead`, primaryId })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Fix missing data (bulk set defaults) ──────────────────────────────────────
router.post('/fix-missing', protect, allowRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const { entity, field, defaultValue } = req.body
    const allowed = {
      leads:    ['status', 'source', 'value'],
      contacts: ['company'],
      deals:    ['probability', 'stage']
    }

    if (!allowed[entity]?.includes(field)) {
      return res.status(400).json({ message: `Cannot auto-fix ${entity}.${field}` })
    }

    const Model  = entity === 'leads' ? Lead : entity === 'contacts' ? Contact : Deal
    const filter = { company: req.user.company, $or: [{ [field]: '' }, { [field]: null }, { [field]: { $exists: false } }] }
    const result = await Model.updateMany(filter, { [field]: defaultValue })

    res.json({ message: `Fixed ${result.modifiedCount} ${entity} with missing ${field}`, modifiedCount: result.modifiedCount })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
