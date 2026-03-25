const express             = require('express')
const router              = express.Router()
const WhatsAppTemplate    = require('../models/WhatsAppTemplate')
const WhatsAppScheduled   = require('../models/WhatsAppScheduled')
const WhatsAppAutoReply   = require('../models/WhatsAppAutoReply')
const WhatsAppChatbotFlow = require('../models/WhatsAppChatbotFlow')
const Inbox               = require('../models/Inbox')
const { protect }         = require('../middleware/authMiddleware')
const { checkTrial }      = require('../middleware/trialMiddleware')
const { allowRoles }      = require('../middleware/authMiddleware')

// ────── BUILT-IN HINDI/HINGLISH TEMPLATES ─────────────────────────────────────
const BUILTIN_TEMPLATES = [
  { name: 'Namaskar Greeting',   language: 'hinglish', category: 'greeting',
    message: 'Namaskar {{Name}} ji, aapka inquiry mil gaya. Hum jaldi hi aapse contact karenge. Dhanyawad!',
    variables: ['Name'] },
  { name: 'Follow-up Soch',      language: 'hinglish', category: 'follow_up',
    message: 'Namaskar {{Name}} ji, hum aapke baare mein soch rahe the. Kya aap hamare products mein interested hain? Aaj hi baat karte hain!',
    variables: ['Name'] },
  { name: 'Special Offer',       language: 'hinglish', category: 'offer',
    message: 'Namaskar {{Name}} ji! Aaj ka special offer sirf aapke liye — {{OfferDetails}}. Yeh offer sirf {{Deadline}} tak valid hai. Abhi call karein!',
    variables: ['Name', 'OfferDetails', 'Deadline'] },
  { name: 'Proposal Follow-up',  language: 'hinglish', category: 'follow_up',
    message: 'Namaskar {{Name}} ji, follow up: Kya aap hamare proposal ke baare mein socha? Koi sawaal ho toh batayein, hum madad karne ke liye hamesha taiyaar hain.',
    variables: ['Name'] },
  { name: 'Meeting Reminder',    language: 'hinglish', category: 'reminder',
    message: 'Namaskar {{Name}} ji, yaad dila dein ki hamare beech meeting {{Date}} ko {{Time}} baje tay hui hai. Kripya samay par aa jayein.',
    variables: ['Name', 'Date', 'Time'] },
  { name: 'Diwali Wishes',       language: 'hi', category: 'greeting',
    message: 'नमस्कार {{Name}} जी! आपको और आपके परिवार को दीपावली की हार्दिक शुभकामनाएं। यह त्योहार आपके जीवन में खुशियां और समृद्धि लाए।',
    variables: ['Name'] },
  { name: 'Payment Reminder',    language: 'hinglish', category: 'reminder',
    message: 'Namaskar {{Name}} ji, aapki ₹{{Amount}} ki payment ki due date {{DueDate}} hai. Kripya samay par payment karein. Shukriya!',
    variables: ['Name', 'Amount', 'DueDate'] }
]

// ── GET built-in templates ─────────────────────────────────────────────────────
router.get('/templates/builtin', protect, async (req, res) => {
  res.json({ templates: BUILTIN_TEMPLATES, total: BUILTIN_TEMPLATES.length })
})

// ── GET all templates (company + built-in) ────────────────────────────────────
router.get('/templates', protect, checkTrial, async (req, res) => {
  try {
    const { language, category } = req.query
    const filter = { $or: [{ company: req.user.company }, { isBuiltIn: true }] }
    if (language) filter.language = language
    if (category) filter.category = category

    const templates = await WhatsAppTemplate.find(filter).sort({ isBuiltIn: -1, createdAt: -1 })
    res.json({ templates, total: templates.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create template ────────────────────────────────────────────────────────────
router.post('/templates', protect, checkTrial, async (req, res) => {
  try {
    const { name, message, variables, category, language } = req.body
    const template = await WhatsAppTemplate.create({
      name, message, variables: variables || [],
      category: category || 'custom',
      language:  language  || 'en',
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(template)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Update / Delete template ───────────────────────────────────────────────────
router.put('/templates/:id', protect, checkTrial, async (req, res) => {
  try {
    const t = await WhatsAppTemplate.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body, { new: true })
    if (!t) return res.status(404).json({ message: 'Template not found' })
    res.json(t)
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.delete('/templates/:id', protect, checkTrial, async (req, res) => {
  try {
    const t = await WhatsAppTemplate.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!t) return res.status(404).json({ message: 'Template not found' })
    res.json({ message: 'Template deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Broadcast: send to multiple contacts ──────────────────────────────────────
router.post('/broadcast', protect, checkTrial, async (req, res) => {
  try {
    const { message, recipients, templateId } = req.body
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ message: 'recipients array required' })
    }

    // Log each message to inbox (simulated send)
    const inboxDocs = recipients.map(r => ({
      type:         'whatsapp',
      contactName:  r.name  || 'Unknown',
      contactPhone: r.phone || '',
      message,
      direction:    'outbound',
      isRead:       true,
      relatedLead:  r.leadId || undefined,
      company:      req.user.company,
      createdBy:    req.user._id
    }))

    await Inbox.insertMany(inboxDocs)
    if (templateId) await WhatsAppTemplate.findByIdAndUpdate(templateId, { $inc: { usageCount: 1 } })

    res.json({ message: 'Broadcast queued', sentTo: recipients.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Schedule a WhatsApp message ────────────────────────────────────────────────
router.post('/scheduled', protect, checkTrial, async (req, res) => {
  try {
    const { message, recipients, scheduledAt, templateId } = req.body
    const scheduled = await WhatsAppScheduled.create({
      message, recipients: recipients || [],
      scheduledAt: new Date(scheduledAt),
      templateId,
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(scheduled)
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.get('/scheduled', protect, checkTrial, async (req, res) => {
  try {
    const msgs = await WhatsAppScheduled.find({ company: req.user.company }).sort({ scheduledAt: 1 })
    res.json({ scheduled: msgs, total: msgs.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.delete('/scheduled/:id', protect, checkTrial, async (req, res) => {
  try {
    await WhatsAppScheduled.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company, status: 'pending' },
      { status: 'cancelled' })
    res.json({ message: 'Scheduled message cancelled' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Auto-reply rules ───────────────────────────────────────────────────────────
router.get('/auto-reply-rules', protect, checkTrial, async (req, res) => {
  try {
    const rules = await WhatsAppAutoReply.find({ company: req.user.company }).sort({ priority: -1 })
    res.json({ rules, total: rules.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.post('/auto-reply-rules', protect, checkTrial, async (req, res) => {
  try {
    const rule = await WhatsAppAutoReply.create({ ...req.body, company: req.user.company, createdBy: req.user._id })
    res.status(201).json(rule)
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.put('/auto-reply-rules/:id', protect, checkTrial, async (req, res) => {
  try {
    const rule = await WhatsAppAutoReply.findOneAndUpdate({ _id: req.params.id, company: req.user.company }, req.body, { new: true })
    if (!rule) return res.status(404).json({ message: 'Rule not found' })
    res.json(rule)
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.delete('/auto-reply-rules/:id', protect, checkTrial, async (req, res) => {
  try {
    await WhatsAppAutoReply.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    res.json({ message: 'Auto-reply rule deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Chatbot flows ──────────────────────────────────────────────────────────────
router.get('/chatbot-flows', protect, checkTrial, async (req, res) => {
  try {
    const flows = await WhatsAppChatbotFlow.find({ company: req.user.company }).sort({ createdAt: -1 })
    res.json({ flows, total: flows.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.post('/chatbot-flows', protect, checkTrial, async (req, res) => {
  try {
    const flow = await WhatsAppChatbotFlow.create({ ...req.body, company: req.user.company, createdBy: req.user._id })
    res.status(201).json(flow)
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.put('/chatbot-flows/:id', protect, checkTrial, async (req, res) => {
  try {
    const flow = await WhatsAppChatbotFlow.findOneAndUpdate({ _id: req.params.id, company: req.user.company }, req.body, { new: true })
    if (!flow) return res.status(404).json({ message: 'Flow not found' })
    res.json(flow)
  } catch (err) { res.status(500).json({ message: err.message }) }
})
router.delete('/chatbot-flows/:id', protect, checkTrial, async (req, res) => {
  try {
    await WhatsAppChatbotFlow.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    res.json({ message: 'Chatbot flow deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Analytics ──────────────────────────────────────────────────────────────────
router.get('/analytics', protect, checkTrial, async (req, res) => {
  try {
    const filter = { company: req.user.company, type: 'whatsapp' }
    const [total, outbound, inbound, unread] = await Promise.all([
      Inbox.countDocuments(filter),
      Inbox.countDocuments({ ...filter, direction: 'outbound' }),
      Inbox.countDocuments({ ...filter, direction: 'inbound' }),
      Inbox.countDocuments({ ...filter, isRead: false })
    ])
    const templates  = await WhatsAppTemplate.countDocuments({ company: req.user.company })
    const broadcasts = await WhatsAppScheduled.countDocuments({ company: req.user.company, status: 'sent' })

    res.json({
      total, outbound, inbound, unread,
      templates, broadcastsSent: broadcasts,
      deliveryRate: total > 0 ? Math.round((outbound / total) * 100) : 0,
      readRate:     inbound > 0 ? Math.round(((inbound - unread) / inbound) * 100) : 0
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
