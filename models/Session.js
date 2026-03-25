const mongoose = require('mongoose')

const sessionSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:      { type: String, required: true, unique: true },
  device:     { type: String, default: 'Unknown' },
  browser:    { type: String, default: '' },
  ip:         { type: String, default: '' },
  isActive:   { type: Boolean, default: true },
  lastActive: { type: Date, default: Date.now },
  expiresAt:  { type: Date, required: true }
}, { timestamps: true })

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
sessionSchema.index({ userId: 1, isActive: 1 })

module.exports = mongoose.model('Session', sessionSchema)
