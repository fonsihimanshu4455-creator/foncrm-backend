const mongoose = require('mongoose')

const apiKeySchema = new mongoose.Schema({
  name:        { type: String, required: true },
  keyHash:     { type: String, required: true, unique: true },
  keyPrefix:   { type: String, required: true },        // first 8 chars for display
  company:     { type: String, required: true },
  companyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  scopes:      [{ type: String }],                      // ['leads:read', 'leads:write', ...]
  isActive:    { type: Boolean, default: true },
  lastUsedAt:  { type: Date },
  expiresAt:   { type: Date },
  requestCount:{ type: Number, default: 0 },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('ApiKey', apiKeySchema)
