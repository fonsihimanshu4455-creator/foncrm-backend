const mongoose = require('mongoose')

const whatsAppScheduledSchema = new mongoose.Schema({
  message:      { type: String, required: true },
  recipients:   [{ name: String, phone: String, leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' } }],
  scheduledAt:  { type: Date, required: true },
  status:       { type: String, enum: ['pending', 'sent', 'failed', 'cancelled'], default: 'pending' },
  sentAt:       { type: Date },
  templateId:   { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppTemplate' },
  sentCount:    { type: Number, default: 0 },
  failedCount:  { type: Number, default: 0 },
  company:      { type: String, default: '' },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('WhatsAppScheduled', whatsAppScheduledSchema)
