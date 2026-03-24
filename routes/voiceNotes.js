const express    = require('express')
const router     = express.Router()
const VoiceNote  = require('../models/VoiceNote')
const { protect }    = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')

// ── Create voice note ──────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const { url, duration, transcript, title, relatedLead, relatedDeal, relatedContact } = req.body
    if (!url) return res.status(400).json({ message: 'url is required' })

    const note = await VoiceNote.create({
      url, duration: duration || 0, transcript: transcript || '',
      title: title || '',
      relatedLead, relatedDeal, relatedContact,
      company:   req.user.company,
      createdBy: req.user._id
    })
    res.status(201).json(note)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── GET voice notes for a specific entity ─────────────────────────────────────
router.get('/:entityType/:entityId', protect, checkTrial, async (req, res) => {
  try {
    const { entityType, entityId } = req.params
    const fieldMap = { lead: 'relatedLead', deal: 'relatedDeal', contact: 'relatedContact' }
    const field = fieldMap[entityType]
    if (!field) return res.status(400).json({ message: 'entityType must be lead, deal, or contact' })

    const notes = await VoiceNote.find({ [field]: entityId, company: req.user.company })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })

    res.json({ voiceNotes: notes, count: notes.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update voice note (transcript/title) ──────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const { transcript, title } = req.body
    const note = await VoiceNote.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { transcript, title },
      { new: true }
    )
    if (!note) return res.status(404).json({ message: 'Voice note not found' })
    res.json(note)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete voice note ──────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const note = await VoiceNote.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!note) return res.status(404).json({ message: 'Voice note not found' })
    res.json({ message: 'Voice note deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
