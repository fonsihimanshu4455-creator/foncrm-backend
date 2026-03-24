const mongoose = require('mongoose')

const voiceNoteSchema = new mongoose.Schema({
  url:        { type: String, required: true },
  duration:   { type: Number, default: 0 },       // in seconds
  transcript: { type: String, default: '' },
  title:      { type: String, default: '' },
  relatedLead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  relatedDeal:    { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  relatedContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  company:   { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true })

module.exports = mongoose.model('VoiceNote', voiceNoteSchema)
