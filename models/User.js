const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'manager', 'agent', 'viewer'],
    default: 'agent'
  },
  company:   { type: String, default: '' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastLogin: { type: Date, default: null },
  // Language preference
  language:  { type: String, enum: ['en', 'hi', 'mr', 'gu', 'ta', 'te'], default: 'en' },
  // 2FA
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret:  { type: String, default: '' },
  // Password reset
  passwordResetToken:   { type: String, default: '' },
  passwordResetExpires: { type: Date, default: null }
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)
