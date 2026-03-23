const express = require('express')
const router = express.Router()
const Lead = require('../models/Lead')
const { protect, allowRoles } = require('../middleware/authMiddleware')

// Leads lo — role ke hisaab se
router.get('/', protect, async (req, res) => {
  try {
    let leads
    if (['superadmin', 'admin'].includes(req.user.role)) {
      leads = await Lead.find()
    } else if (req.user.role === 'manager') {
      leads = await Lead.find({ company: req.user.company })
    } else {
      leads = await Lead.find({ assignedTo: req.user.id })
    }
    res.json(leads)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Lead banao
router.post('/', protect, async (req, res) => {
  try {
    const lead = await Lead.create({ ...req.body, createdBy: req.user.id })
    res.json(lead)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Lead delete
router.delete('/:id', protect, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    if (!['superadmin', 'admin', 'manager'].includes(req.user.role) &&
        lead.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' })
    }
    await Lead.findByIdAndDelete(req.params.id)
    res.json({ message: 'Lead deleted!' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
