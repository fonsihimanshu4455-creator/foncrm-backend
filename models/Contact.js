const mongoose = require('mongoose')

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  company: { type: String, default: '' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  jobTitle: { type: String, default: '' },
  status: {
    type: String,
    enum: ['prospect', 'active', 'customer', 'inactive', 'churned'],
    default: 'prospect'
  },
  source: { type: String, default: 'Manual' },
  tags: [{ type: String }],
  notes: { type: String, default: '' },
  website: { type: String, default: '' },
  linkedIn: { type: String, default: '' },
  twitter: { type: String, default: '' },
  address: { type: String, default: '' },
  lastContactedAt: { type: Date, default: null },
  leadScore: { type: Number, default: 0 },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  customFields: { type: Map, of: String, default: {} },
  relatedLeads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }],
  relatedDeals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Deal' }],
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })

// Auto-calculate lead score before save
contactSchema.pre('save', function (next) {
  let score = 0
  if (this.email) score += 15
  if (this.phone) score += 15
  if (this.jobTitle) score += 10
  if (this.company) score += 10
  if (this.notes) score += 5
  if (this.website || this.linkedIn) score += 5
  if (this.assignedTo) score += 10
  if (this.status === 'customer') score += 30
  else if (this.status === 'prospect' || this.status === 'active') score += 15
  this.leadScore = Math.min(score, 100)
  next()
})

module.exports = mongoose.model('Contact', contactSchema)
