const express  = require('express')
const router   = express.Router()
const Document = require('../models/Document')
const { protect } = require('../middleware/authMiddleware')
const { checkTrial }     = require('../middleware/trialMiddleware')
const { getScopeFilter } = require('../utils/scopeFilter')

// ── List documents ────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { category, relatedLead, relatedContact, relatedDeal, search, page = 1, limit = 20 } = req.query
    const filter = { ...getScopeFilter(req.user), company: req.user.company }

    if (category)       filter.category       = category
    if (relatedLead)    filter.relatedLead    = relatedLead
    if (relatedContact) filter.relatedContact = relatedContact
    if (relatedDeal)    filter.relatedDeal    = relatedDeal
    if (search) {
      const rx = { $regex: search, $options: 'i' }
      filter.$or = [{ name: rx }, { description: rx }, { tags: rx }]
    }

    const skip  = (page - 1) * limit
    const total = await Document.countDocuments(filter)
    const documents = await Document.find(filter)
      .populate('relatedLead',    'name email')
      .populate('relatedContact', 'name email')
      .populate('relatedDeal',    'title value')
      .populate('uploadedBy',     'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))

    res.json({ documents, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get single document ───────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('relatedLead',    'name email')
      .populate('relatedContact', 'name email')
      .populate('relatedDeal',    'title value')
      .populate('uploadedBy',     'name email')
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    res.json(doc)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create document record ────────────────────────────────────────────────────
// NOTE: Actual file upload/storage is expected to be handled by a third-party
// service (S3, Cloudinary, etc). This endpoint stores the metadata + URL.
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const {
      name, originalName, fileUrl, fileType, fileSize, mimeType,
      category, description, tags, isPublic,
      relatedLead, relatedContact, relatedDeal
    } = req.body

    if (!name)    return res.status(400).json({ message: 'Document name is required' })
    if (!fileUrl) return res.status(400).json({ message: 'fileUrl is required' })

    const doc = await Document.create({
      name, originalName, fileUrl, fileType, fileSize, mimeType,
      category: category || 'other',
      description,
      tags: tags || [],
      isPublic: isPublic || false,
      relatedLead, relatedContact, relatedDeal,
      company:    req.user.company,
      uploadedBy: req.user._id
    })

    const populated = await Document.findById(doc._id)
      .populate('relatedLead',    'name')
      .populate('relatedContact', 'name')
      .populate('relatedDeal',    'title')
      .populate('uploadedBy',     'name')

    res.status(201).json(populated)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update document metadata ──────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true, runValidators: true }
    ).populate('uploadedBy', 'name')
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    res.json(doc)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Track download (increment counter) ───────────────────────────────────────
router.patch('/:id/download', protect, checkTrial, async (req, res) => {
  try {
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $inc: { downloadCount: 1 } },
      { new: true }
    )
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    res.json({ fileUrl: doc.fileUrl, downloadCount: doc.downloadCount })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete document ───────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, async (req, res) => {
  try {
    const doc = await Document.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!doc) return res.status(404).json({ message: 'Document not found' })
    res.json({ message: 'Document deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Documents attached to a specific lead ────────────────────────────────────
router.get('/lead/:leadId', protect, checkTrial, async (req, res) => {
  try {
    const docs = await Document.find({
      company:     req.user.company,
      relatedLead: req.params.leadId
    }).populate('uploadedBy', 'name').sort({ createdAt: -1 })
    res.json({ documents: docs, count: docs.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Documents attached to a specific deal ────────────────────────────────────
router.get('/deal/:dealId', protect, checkTrial, async (req, res) => {
  try {
    const docs = await Document.find({
      company:     req.user.company,
      relatedDeal: req.params.dealId
    }).populate('uploadedBy', 'name').sort({ createdAt: -1 })
    res.json({ documents: docs, count: docs.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Documents attached to a specific contact ─────────────────────────────────
router.get('/contact/:contactId', protect, checkTrial, async (req, res) => {
  try {
    const docs = await Document.find({
      company:        req.user.company,
      relatedContact: req.params.contactId
    }).populate('uploadedBy', 'name').sort({ createdAt: -1 })
    res.json({ documents: docs, count: docs.length })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
