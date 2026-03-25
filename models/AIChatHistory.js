const mongoose = require('mongoose')

const aiChatHistorySchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: String, default: '' },
  title:   { type: String, default: 'New Chat' },
  messages: [{
    role:      { type: String, enum: ['user', 'assistant'], required: true },
    content:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    metadata:  { type: mongoose.Schema.Types.Mixed, default: {} }  // CRM data returned
  }],
  context: { type: String, default: '' }   // 'leads', 'deals', 'pipeline', etc.
}, { timestamps: true })

module.exports = mongoose.model('AIChatHistory', aiChatHistorySchema)
