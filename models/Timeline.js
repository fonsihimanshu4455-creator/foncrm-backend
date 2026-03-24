const mongoose = require('mongoose')

const timelineSchema = new mongoose.Schema({
  entityId:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  entityType: { type: String, enum: ['lead', 'deal', 'contact'], required: true },
  action: {
    type: String,
    enum: [
      'created', 'status_changed', 'stage_changed', 'note_added',
      'email_sent', 'whatsapp_sent', 'meeting_scheduled', 'meeting_completed',
      'task_created', 'task_completed', 'deal_created', 'deal_won', 'deal_lost',
      'lead_converted', 'field_updated', 'document_attached', 'voice_note_added',
      'score_updated', 'assigned', 'tag_added'
    ],
    default: 'field_updated'
  },
  description: { type: String, default: '' },
  metadata:    { type: mongoose.Schema.Types.Mixed, default: {} },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:    { type: String, default: '' },
  company:     { type: String, default: '' }
}, { timestamps: true })

timelineSchema.index({ entityId: 1, entityType: 1, createdAt: -1 })

module.exports = mongoose.model('Timeline', timelineSchema)
