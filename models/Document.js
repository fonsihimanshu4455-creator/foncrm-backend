const mongoose = require('mongoose')

const documentSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  originalName: String,
  fileUrl:      { type: String, required: true },
  fileType:     String,
  fileSize:     Number,
  mimeType:     String,
  category: {
    type: String,
    enum: ['contract', 'proposal', 'invoice', 'presentation', 'other'],
    default: 'other'
  },
  description:    String,
  tags:           [String],
  isPublic:       { type: Boolean, default: false },
  downloadCount:  { type: Number, default: 0 },
  relatedLead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  relatedContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  relatedDeal:    { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  company:    String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('Document', documentSchema)
