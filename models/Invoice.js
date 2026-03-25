const mongoose = require('mongoose')

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true },
  clientName:    { type: String, required: true },
  clientEmail:   { type: String, default: '' },
  clientPhone:   { type: String, default: '' },
  clientAddress: { type: String, default: '' },
  GSTIN:         { type: String, default: '' },
  sellerGSTIN:   { type: String, default: '' },
  items: [{
    description: String,
    quantity:    { type: Number, default: 1 },
    unitPrice:   { type: Number, default: 0 },
    amount:      { type: Number, default: 0 }
  }],
  subtotal:     { type: Number, default: 0 },
  taxRate:      { type: Number, default: 18 },
  cgst:         { type: Number, default: 0 },
  sgst:         { type: Number, default: 0 },
  igst:         { type: Number, default: 0 },
  totalAmount:  { type: Number, default: 0 },
  paidStatus:   { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  paidAmount:   { type: Number, default: 0 },
  dueDate:      { type: Date },
  notes:        { type: String, default: '' },
  currency:     { type: String, default: 'INR' },
  relatedDeal:  { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  relatedLead:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  company:      { type: String, required: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

// Auto-generate invoice number before save
invoiceSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Invoice').countDocuments({ company: this.company })
    const year  = new Date().getFullYear()
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`
  }
  // Recalculate totals
  this.subtotal    = this.items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0)
  const taxAmt     = (this.subtotal * this.taxRate) / 100
  this.cgst        = taxAmt / 2
  this.sgst        = taxAmt / 2
  this.igst        = 0
  this.totalAmount = this.subtotal + taxAmt
  next()
})

module.exports = mongoose.model('Invoice', invoiceSchema)
