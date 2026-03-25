const mongoose = require('mongoose')

const subscriptionSchema = new mongoose.Schema({
  companyId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
  companyName:     { type: String, default: '' },
  plan:            { type: String, enum: ['trial', 'starter', 'professional', 'enterprise'], default: 'trial' },
  amount:          { type: Number, default: 0 },
  currency:        { type: String, default: 'INR' },
  billingCycle:    { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' },
  status:          { type: String, enum: ['active', 'cancelled', 'past_due', 'trialing'], default: 'trialing' },
  nextBillingDate: { type: Date },
  cancelledAt:     { type: Date },
  paymentMethod:   { type: String, enum: ['razorpay', 'bank_transfer', 'manual', 'free'], default: 'manual' },
  razorpaySubId:   { type: String, default: '' },
  transactionHistory: [{
    amount:      Number,
    currency:    { type: String, default: 'INR' },
    status:      { type: String, enum: ['success', 'failed', 'pending', 'refunded'] },
    razorpayOrderId:   String,
    razorpayPaymentId: String,
    plan:        String,
    paidAt:      { type: Date, default: Date.now }
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('Subscription', subscriptionSchema)
