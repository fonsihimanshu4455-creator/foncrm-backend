const mongoose = require('mongoose')

const inboxSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['whatsapp', 'email', 'call', 'note', 'sms'],
    default: 'note'
  },
  contactName:  { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  message:  { type: String, required: true },
  subject:  { type: String, default: '' },
  isRead:   { type: Boolean, default: false },
  readAt:   { type: Date, default: null },
  direction: { type: String, enum: ['inbound', 'outbound'], default: 'inbound' },
  relatedLead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  relatedContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  relatedDeal:    { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  company:   { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

inboxSchema.index({ company: 1, isRead: 1, createdAt: -1 })

module.exports = mongoose.model('Inbox', inboxSchema)
