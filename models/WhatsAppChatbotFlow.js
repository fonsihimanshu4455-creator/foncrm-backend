const mongoose = require('mongoose')

const whatsAppChatbotFlowSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  triggerKeyword: { type: String, default: '' },
  steps: [{
    stepId:   String,
    question: String,
    options:  [{ label: String, value: String, nextStepId: String }],
    action:   { type: String, enum: ['collect_name', 'collect_phone', 'collect_email', 'create_lead', 'end', 'custom'], default: 'custom' },
    message:  String
  }],
  startStepId: { type: String, default: '' },
  company:     { type: String, default: '' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('WhatsAppChatbotFlow', whatsAppChatbotFlowSchema)
