const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Lead = require('../models/Lead')

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'No token' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}

// Get all leads
router.get('/', auth, async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 })
    res.json(leads)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Add lead
router.post('/', auth, async (req, res) => {
  try {
    const lead = await Lead.create(req.body)
    res.json(lead)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Update lead
router.put('/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true })
    res.json(lead)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Delete lead
router.delete('/:id', auth, async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id)
    res.json({ message: 'Lead deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router