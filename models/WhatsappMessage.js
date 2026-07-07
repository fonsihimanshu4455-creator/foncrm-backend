const mongoose = require('mongoose')

// A single message inside a WhatsApp chat thread.
const whatsappMessageSchema = new mongoose.Schema({
  chat: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappChat', required: true },
  from: { type: String, enum: ['me', 'them'], default: 'me' },
  text: { type: String, required: true },
  time: { type: Date, default: Date.now },
  company: { type: String, default: '' },
}, { timestamps: true })

module.exports = mongoose.model('WhatsappMessage', whatsappMessageSchema)
