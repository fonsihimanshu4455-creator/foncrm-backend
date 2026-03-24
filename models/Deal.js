const mongoose = require('mongoose')

const stageProbability = {
  new: 10,
  qualified: 25,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0
}

const dealSchema = new mongoose.Schema({
  title: { type: String, required: true },
  value: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  stage: {
    type: String,
    enum: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
    default: 'new'
  },
  probability: { type: Number, default: 10 },
  expectedCloseDate: { type: Date, default: null },
  actualCloseDate: { type: Date, default: null },
  lostReason: { type: String, default: '' },
  notes: { type: String, default: '' },
  tags: [{ type: String }],
  source: { type: String, default: 'Manual' },
  company: { type: String, default: '' },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
  relatedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  stageHistory: [{
    stage: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    _id: false
  }],
  products: [{
    name: String,
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 }
  }],
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } })

// Virtual: total products value
dealSchema.virtual('productsTotal').get(function () {
  if (!this.products || this.products.length === 0) return 0
  return this.products.reduce((sum, p) => sum + (p.price * p.quantity), 0)
})

// Auto-set probability and close date on stage change
dealSchema.pre('save', function (next) {
  if (this.isModified('stage')) {
    this.probability = stageProbability[this.stage] ?? 10
    if (this.stage === 'won' || this.stage === 'lost') {
      this.actualCloseDate = new Date()
    }
    this.stageHistory.push({
      stage: this.stage,
      changedAt: new Date(),
      changedBy: this._changedBy || null
    })
  }
  next()
})

module.exports = mongoose.model('Deal', dealSchema)
