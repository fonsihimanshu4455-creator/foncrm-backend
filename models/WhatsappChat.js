const mongoose = require('mongoose')

// A WhatsApp conversation thread (DB-backed; no live WA integration required).
const whatsappChatSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, default: '' },
  lastMsg: { type: String, default: '' },
  time: { type: Date, default: null },
  unread: { type: Number, default: 0 },
  company: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

module.exports = mongoose.model('WhatsappChat', whatsappChatSchema)
