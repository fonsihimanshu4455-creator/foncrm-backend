const mongoose = require('mongoose')

const integrationSchema = new mongoose.Schema({
  companyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  company:    { type: String, default: '' },
  type: {
    type: String,
    enum: ['google_sheets', 'webhook', 'zapier', 'slack', 'whatsapp', 'email_smtp', 'razorpay', 'custom'],
    required: true
  },
  name:       { type: String, default: '' },
  config:     { type: mongoose.Schema.Types.Mixed, default: {} },
  isActive:   { type: Boolean, default: true },
  lastSync:   { type: Date },
  syncCount:  { type: Number, default: 0 },
  webhookUrl: { type: String, default: '' },
  events:     [{ type: String }],   // which events trigger this integration
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('Integration', integrationSchema)
