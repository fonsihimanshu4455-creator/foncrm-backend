const mongoose = require('mongoose')

const meetingSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: String,
  startTime:   { type: Date, required: true },
  endTime:     { type: Date, required: true },
  location:    String,
  meetingLink: String,
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'], default: 'scheduled' },
  type:   { type: String, enum: ['call', 'video', 'in_person', 'demo', 'follow_up'], default: 'call' },
  attendees: [{
    name:   String,
    email:  String,
    status: { type: String, enum: ['invited', 'accepted', 'declined'], default: 'invited' }
  }],
  reminder: {
    enabled:       { type: Boolean, default: true },
    minutesBefore: { type: Number, default: 30 }
  },
  notes:   String,
  outcome: String,
  relatedLead:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  relatedContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  relatedDeal:    { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  company:    String,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true })

module.exports = mongoose.model('Meeting', meetingSchema)
