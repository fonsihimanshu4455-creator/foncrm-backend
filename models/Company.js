const mongoose = require('mongoose')

const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: '' },
  plan: {
    type: String,
    enum: ['trial', 'starter', 'professional', 'enterprise'],
    default: 'trial'
  },
  planStatus: {
    type: String,
    enum: ['active', 'expired', 'suspended'],
    default: 'active'
  },
  trialEndsAt: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  maxUsers: { type: Number, default: 3 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  address: { type: String, default: '' },
  industry: { type: String, default: '' },
  notes: { type: String, default: '' },
  portalEnabled: { type: Boolean, default: false },
  portalToken:   { type: String, default: null },
}, { timestamps: true })

module.exports = mongoose.model('Company', companySchema)
