const mongoose = require('mongoose')

const whatsAppAutoReplySchema = new mongoose.Schema({
  name:          { type: String, required: true },
  triggerKeyword:{ type: String, required: true },   // if message contains this
  matchType:     { type: String, enum: ['contains', 'exact', 'starts_with'], default: 'contains' },
  replyMessage:  { type: String, required: true },
  isActive:      { type: Boolean, default: true },
  priority:      { type: Number, default: 0 },
  triggerCount:  { type: Number, default: 0 },
  company:       { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('WhatsAppAutoReply', whatsAppAutoReplySchema)
