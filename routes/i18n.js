const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const User    = require('../models/User')
const { protect } = require('../middleware/authMiddleware')

const SUPPORTED_LANGS = ['en', 'hi', 'mr', 'gu', 'ta', 'te']

// ── GET locale strings ─────────────────────────────────────────────────────────
router.get('/:lang', (req, res) => {
  const { lang } = req.params
  if (!SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      message: `Unsupported language. Supported: ${SUPPORTED_LANGS.join(', ')}`
    })
  }

  try {
    const localePath = path.join(__dirname, '..', 'locales', `${lang}.json`)
    const data = fs.readFileSync(localePath, 'utf8')
    res.json(JSON.parse(data))
  } catch (err) {
    // Fallback to English if file missing
    try {
      const enPath = path.join(__dirname, '..', 'locales', 'en.json')
      const data = fs.readFileSync(enPath, 'utf8')
      res.json(JSON.parse(data))
    } catch {
      res.status(500).json({ message: 'Locale file not found' })
    }
  }
})

// ── GET supported languages ────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    supported: [
      { code: 'en', name: 'English',    nativeName: 'English' },
      { code: 'hi', name: 'Hindi',      nativeName: 'हिन्दी' },
      { code: 'mr', name: 'Marathi',    nativeName: 'मराठी' },
      { code: 'gu', name: 'Gujarati',   nativeName: 'ગુજરાતી' },
      { code: 'ta', name: 'Tamil',      nativeName: 'தமிழ்' },
      { code: 'te', name: 'Telugu',     nativeName: 'తెలుగు' }
    ]
  })
})

// ── Update user's preferred language ──────────────────────────────────────────
router.put('/user/language', protect, async (req, res) => {
  try {
    const { language } = req.body
    if (!SUPPORTED_LANGS.includes(language)) {
      return res.status(400).json({ message: `Unsupported language. Supported: ${SUPPORTED_LANGS.join(', ')}` })
    }
    await User.findByIdAndUpdate(req.user._id, { language })
    res.json({ message: `Language updated to ${language}` })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
