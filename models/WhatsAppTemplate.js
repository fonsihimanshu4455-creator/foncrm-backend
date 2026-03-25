const mongoose = require('mongoose')

const whatsAppTemplateSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  message:   { type: String, required: true },
  variables: [{ type: String }],       // e.g. ['Name', 'Company']
  category:  {
    type: String,
    enum: ['greeting', 'follow_up', 'offer', 'reminder', 'custom'],
    default: 'custom'
  },
  language:  { type: String, enum: ['en', 'hi', 'hinglish'], default: 'en' },
  isActive:  { type: Boolean, default: true },
  isBuiltIn: { type: Boolean, default: false },
  usageCount:{ type: Number, default: 0 },
  company:   { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('WhatsAppTemplate', whatsAppTemplateSchema)
