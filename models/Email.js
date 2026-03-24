const mongoose = require('mongoose')

const emailSchema = new mongoose.Schema({
  subject:  { type: String, required: true },
  body:     { type: String, required: true },
  from:     String,
  to:       [String],
  cc:       [String],
  bcc:      [String],
  status:   { type: String, enum: ['draft', 'sent', 'failed'], default: 'draft' },
  sentAt:   Date,
  openedAt: Date,
  openCount:     { type: Number, default: 0 },
  isOpened:      { type: Boolean, default: false },
  trackingToken: { type: String, unique: true, sparse: true },
  template: String,
  attachments: [{ name: String, url: String, size: Number }],
  relatedLead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  relatedContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  relatedDeal:    { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  company:   String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('Email', emailSchema)
