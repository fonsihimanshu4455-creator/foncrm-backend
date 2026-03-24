const mongoose = require('mongoose')

const webFormSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  fields: [{
    label:       String,
    fieldName:   String,
    type:        { type: String, enum: ['text', 'email', 'phone', 'select', 'textarea', 'checkbox', 'number'], default: 'text' },
    required:    { type: Boolean, default: false },
    options:     [String],   // for select fields
    placeholder: String,
    order:       Number
  }],
  settings: {
    successMessage: { type: String, default: 'Thank you! We will get back to you soon.' },
    redirectUrl:    String,
    autoAssignTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    leadSource:     { type: String, default: 'Web Form' },
    leadStatus:     { type: String, default: 'New' },
    notifyOnSubmit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  style: {
    primaryColor:    { type: String, default: '#6366f1' },
    backgroundColor: { type: String, default: '#ffffff' },
    fontFamily:      { type: String, default: 'Inter' }
  },
  embedToken:   { type: String, unique: true },
  isActive:     { type: Boolean, default: true },
  submitCount:  { type: Number, default: 0 },
  company:      String,
  companyId:    String,
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('WebForm', webFormSchema)
