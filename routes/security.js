const express   = require('express')
const router    = express.Router()
const crypto    = require('crypto')
const speakeasy = require('speakeasy')
const User      = require('../models/User')
const Session   = require('../models/Session')
const { protect } = require('../middleware/authMiddleware')

// ── 2FA Setup: generate secret & QR URI ───────────────────────────────────────
router.post('/2fa/setup', protect, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name:   `FonCRM (${req.user.email})`,
      length: 20
    })

    // Store secret temporarily (not enabled yet until verified)
    await User.findByIdAndUpdate(req.user._id, { twoFactorSecret: secret.base32 })

    res.json({
      secret:    secret.base32,
      otpauthUrl: secret.otpauth_url,
      message:   'Scan QR with authenticator app, then verify with /2fa/verify'
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── 2FA Verify: confirm token to activate 2FA ────────────────────────────────
router.post('/2fa/verify', protect, async (req, res) => {
  try {
    const { token } = req.body
    const user = await User.findById(req.user._id)
    if (!user.twoFactorSecret) return res.status(400).json({ message: '2FA not set up. Call /2fa/setup first.' })

    const verified = speakeasy.totp.verify({
      secret:   user.twoFactorSecret,
      encoding: 'base32',
      token,
      window:   1
    })

    if (!verified) return res.status(400).json({ message: 'Invalid OTP token' })

    await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: true })
    res.json({ message: '2FA enabled successfully' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── 2FA Disable ───────────────────────────────────────────────────────────────
router.post('/2fa/disable', protect, async (req, res) => {
  try {
    const { token } = req.body
    const user = await User.findById(req.user._id)
    if (!user.twoFactorEnabled) return res.status(400).json({ message: '2FA is not enabled' })

    const verified = speakeasy.totp.verify({
      secret:   user.twoFactorSecret,
      encoding: 'base32',
      token,
      window:   1
    })
    if (!verified) return res.status(400).json({ message: 'Invalid OTP token' })

    await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: false, twoFactorSecret: '' })
    res.json({ message: '2FA disabled' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Sessions: list active sessions ────────────────────────────────────────────
router.get('/sessions', protect, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id, isActive: true })
      .select('-token')
      .sort({ createdAt: -1 })
    res.json({ sessions, total: sessions.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Sessions: revoke a session ────────────────────────────────────────────────
router.delete('/sessions/:id', protect, async (req, res) => {
  try {
    await Session.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isActive: false }
    )
    res.json({ message: 'Session revoked' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Sessions: revoke all other sessions ───────────────────────────────────────
router.delete('/sessions', protect, async (req, res) => {
  try {
    await Session.updateMany(
      { userId: req.user._id, isActive: true },
      { isActive: false }
    )
    res.json({ message: 'All sessions revoked' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Audit logs ─────────────────────────────────────────────────────────────────
router.get('/audit-logs', protect, async (req, res) => {
  try {
    const { page = 1, limit = 50, action } = req.query
    const ActivityLog = require('../models/ActivityLog')
    const filter = { company: req.user.company }
    if (action) filter.action = action

    const skip  = (page - 1) * limit
    const total = await ActivityLog.countDocuments(filter)
    const logs  = await ActivityLog.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Password reset: request ───────────────────────────────────────────────────
router.post('/password-reset', async (req, res) => {
  try {
    const { email } = req.body
    const user = await User.findOne({ email })
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' })

    const resetToken   = crypto.randomBytes(32).toString('hex')
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await User.findByIdAndUpdate(user._id, {
      passwordResetToken:   crypto.createHash('sha256').update(resetToken).digest('hex'),
      passwordResetExpires: resetExpires
    })

    // In production: send email with reset link containing resetToken
    res.json({
      message:    'Password reset email sent (configure SMTP to deliver)',
      resetToken, // only for dev/test — remove in production
      expiresAt:  resetExpires
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Password reset: verify & set new password ─────────────────────────────────
router.post('/password-reset/verify', async (req, res) => {
  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) return res.status(400).json({ message: 'token and newPassword required' })

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
    const user = await User.findOne({
      passwordResetToken:   hashedToken,
      passwordResetExpires: { $gt: new Date() }
    })

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' })

    const bcrypt = require('bcryptjs')
    const hashed = await bcrypt.hash(newPassword, 10)

    await User.findByIdAndUpdate(user._id, {
      password:             hashed,
      passwordResetToken:   undefined,
      passwordResetExpires: undefined
    })

    // Revoke all sessions for security
    await Session.updateMany({ userId: user._id }, { isActive: false })

    res.json({ message: 'Password reset successful. Please login again.' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
