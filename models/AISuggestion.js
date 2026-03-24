const mongoose = require('mongoose')

const aiSuggestionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['suggest_action', 'draft_message', 'predict_deal', 'summarize_lead', 'email_reply'],
    required: true
  },
  suggestion: { type: String, required: true },
  metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
  relatedLead:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  relatedDeal:  { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  relatedEmail: { type: mongoose.Schema.Types.ObjectId, ref: 'Email' },
  company:   { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('AISuggestion', aiSuggestionSchema)
