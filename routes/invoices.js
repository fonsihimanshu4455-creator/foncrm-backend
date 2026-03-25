const express = require('express')
const router  = express.Router()
const Invoice = require('../models/Invoice')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')

// ── List invoices ──────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { paidStatus, page = 1, limit = 20 } = req.query
    const filter = { company: req.user.company }
    if (paidStatus) filter.paidStatus = paidStatus

    const skip  = (page - 1) * limit
    const total = await Invoice.countDocuments(filter)
    const invoices = await Invoice.find(filter)
      .populate('relatedDeal', 'title')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))

    res.json({ invoices, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Get single invoice ─────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company })
      .populate('relatedDeal', 'title value')
      .populate('relatedLead', 'name email')
      .populate('createdBy', 'name email')
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' })
    res.json(invoice)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Create invoice ─────────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, clientAddress, GSTIN, sellerGSTIN,
            items, taxRate, paidStatus, dueDate, notes, relatedDeal, relatedLead } = req.body

    const invoice = new Invoice({
      clientName, clientEmail, clientPhone, clientAddress,
      GSTIN: GSTIN || '', sellerGSTIN: sellerGSTIN || '',
      items: items || [],
      taxRate: taxRate || 18,
      paidStatus: paidStatus || 'unpaid',
      dueDate, notes,
      relatedDeal, relatedLead,
      company:   req.user.company,
      createdBy: req.user._id
    })
    await invoice.save()   // pre-save hook generates invoiceNumber & calculates totals
    res.status(201).json(invoice)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Update invoice ─────────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company })
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' })
    Object.assign(invoice, req.body)
    await invoice.save()
    res.json(invoice)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Mark as paid ───────────────────────────────────────────────────────────────
router.patch('/:id/pay', protect, checkTrial, async (req, res) => {
  try {
    const { paidAmount } = req.body
    const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company })
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' })

    invoice.paidAmount = paidAmount || invoice.totalAmount
    invoice.paidStatus = invoice.paidAmount >= invoice.totalAmount ? 'paid'
      : invoice.paidAmount > 0 ? 'partial' : 'unpaid'
    await invoice.save()
    res.json(invoice)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── PDF data (JSON for frontend rendering) ────────────────────────────────────
router.get('/:id/pdf', protect, checkTrial, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, company: req.user.company })
      .populate('relatedDeal', 'title')
      .populate('createdBy', 'name email')
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' })

    res.json({
      invoiceData: invoice.toObject(),
      meta: {
        generatedAt: new Date(),
        generatedBy: req.user.name,
        template:    'gst_invoice_india'
      },
      seller: {
        name:    req.user.company,
        GSTIN:   invoice.sellerGSTIN || '',
        address: ''
      }
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Delete invoice ─────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const invoice = await Invoice.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' })
    res.json({ message: 'Invoice deleted' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
