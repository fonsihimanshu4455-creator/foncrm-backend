const express      = require('express')
const router       = express.Router()
const Anthropic    = require('@anthropic-ai/sdk')
const Lead         = require('../models/Lead')
const Deal         = require('../models/Deal')
const Email        = require('../models/Email')
const AISuggestion = require('../models/AISuggestion')
const { protect }  = require('../middleware/authMiddleware')
const { checkTrial } = require('../middleware/trialMiddleware')

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

async function ask(prompt) {
  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })
  return res.content[0].text
}

// ── GET all AI suggestions ─────────────────────────────────────────────────────
router.get('/suggestions', protect, checkTrial, async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query
    const filter = { company: req.user.company }
    if (type) filter.type = type
    const skip  = (page - 1) * limit
    const total = await AISuggestion.countDocuments(filter)
    const suggestions = await AISuggestion.find(filter)
      .populate('relatedLead', 'name status')
      .populate('relatedDeal', 'title stage')
      .sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
    res.json({ suggestions, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Suggest next best action for a lead ───────────────────────────────────────
router.get('/suggest-action/:leadId', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.leadId).populate('assignedTo', 'name')
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    const prompt = `You are a CRM sales assistant for FonCRM. Analyze this lead and suggest the single best next action the sales rep should take.

Lead Details:
- Name: ${lead.name}
- Status: ${lead.status}
- Source: ${lead.source}
- Value: ₹${lead.value}
- Has Email: ${!!lead.email}
- Has Phone: ${!!lead.phone}
- Notes: ${lead.notes || 'None'}
- Created: ${lead.createdAt ? new Date(lead.createdAt).toDateString() : 'Unknown'}
- Assigned To: ${lead.assignedTo?.name || 'Unassigned'}

Respond with:
1. Recommended Action (1 sentence)
2. Why (1-2 sentences)
3. Script/Template (2-3 sentences the rep can use)

Keep it concise and actionable.`

    const suggestion = await ask(prompt)

    const saved = await AISuggestion.create({
      type:        'suggest_action',
      suggestion,
      relatedLead: lead._id,
      metadata:    { leadStatus: lead.status, leadSource: lead.source },
      company:     req.user.company,
      createdBy:   req.user._id
    })

    res.json({ suggestion, id: saved._id })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Draft a WhatsApp / email message for a lead ────────────────────────────────
router.get('/draft-message/:leadId', protect, checkTrial, async (req, res) => {
  try {
    const { channel = 'whatsapp' } = req.query
    const lead = await Lead.findById(req.params.leadId)
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    const prompt = `You are a CRM sales assistant. Draft a ${channel} message to send to this lead.

Lead:
- Name: ${lead.name}
- Status: ${lead.status}
- Source: ${lead.source}
- Value: ₹${lead.value}
- Notes: ${lead.notes || 'None'}

Write a professional, friendly ${channel} message (${channel === 'whatsapp' ? '100–150 words, conversational' : '150–200 words, email format with subject line'}). Personalize it based on their profile. Do not use placeholder brackets like [Name] — use the actual name.`

    const suggestion = await ask(prompt)

    const saved = await AISuggestion.create({
      type:        'draft_message',
      suggestion,
      relatedLead: lead._id,
      metadata:    { channel },
      company:     req.user.company,
      createdBy:   req.user._id
    })

    res.json({ suggestion, channel, id: saved._id })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Predict win/loss for a deal ────────────────────────────────────────────────
router.get('/predict-deal/:dealId', protect, checkTrial, async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.dealId)
      .populate('assignedTo', 'name')
      .populate('contact', 'name')
    if (!deal) return res.status(404).json({ message: 'Deal not found' })

    const daysOpen = Math.floor((Date.now() - new Date(deal.createdAt)) / 86400000)

    const prompt = `You are a sales analytics AI. Predict the win/loss probability for this deal.

Deal:
- Title: ${deal.title}
- Value: ₹${deal.value}
- Stage: ${deal.stage}
- Current Probability: ${deal.probability}%
- Days Open: ${daysOpen}
- Expected Close: ${deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toDateString() : 'Not set'}
- Lost Reason (if any): ${deal.lostReason || 'N/A'}
- Notes: ${deal.notes || 'None'}
- Stage History: ${deal.stageHistory?.length || 0} stage changes

Respond with:
1. Win Probability: X% (your estimate)
2. Risk Level: Low / Medium / High
3. Key Risk Factors: (2-3 bullet points)
4. Recommended Actions: (2-3 bullet points)
5. Summary: (1 sentence)`

    const suggestion = await ask(prompt)

    const saved = await AISuggestion.create({
      type:        'predict_deal',
      suggestion,
      relatedDeal: deal._id,
      metadata:    { dealStage: deal.stage, daysOpen, dealValue: deal.value },
      company:     req.user.company,
      createdBy:   req.user._id
    })

    res.json({ suggestion, daysOpen, currentProbability: deal.probability, id: saved._id })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Full lead summary with insights ───────────────────────────────────────────
router.get('/summarize-lead/:leadId', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.leadId).populate('assignedTo', 'name')
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    const prompt = `You are a CRM analyst. Generate a comprehensive summary and insights for this lead.

Lead Profile:
- Name: ${lead.name}
- Email: ${lead.email || 'Not provided'}
- Phone: ${lead.phone || 'Not provided'}
- Status: ${lead.status}
- Source: ${lead.source}
- Value: ₹${lead.value}
- Notes: ${lead.notes || 'None'}
- Tags: ${lead.tags?.join(', ') || 'None'}
- Assigned To: ${lead.assignedTo?.name || 'Unassigned'}
- Created: ${new Date(lead.createdAt).toDateString()}

Generate:
1. Lead Summary (2-3 sentences overview)
2. Lead Quality Assessment: (Excellent/Good/Average/Poor) with reasoning
3. Engagement Potential: (High/Medium/Low) with reasoning
4. Key Insights: (3 bullet points)
5. Priority Actions: (3 bullet points ordered by importance)
6. Risk Factors: (if any)`

    const suggestion = await ask(prompt)

    const saved = await AISuggestion.create({
      type:        'summarize_lead',
      suggestion,
      relatedLead: lead._id,
      metadata:    { leadStatus: lead.status, leadScore: lead.score },
      company:     req.user.company,
      createdBy:   req.user._id
    })

    res.json({ suggestion, leadScore: lead.score, id: saved._id })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Suggest reply to an incoming email ────────────────────────────────────────
router.get('/email-reply/:emailId', protect, checkTrial, async (req, res) => {
  try {
    const email = await Email.findById(req.params.emailId)
      .populate('relatedLead', 'name status source value')
    if (!email) return res.status(404).json({ message: 'Email not found' })

    const prompt = `You are a CRM email assistant. Suggest a professional reply to this incoming email.

Original Email:
- Subject: ${email.subject}
- From: ${email.from || 'Unknown'}
- Body: ${email.body}

${email.relatedLead ? `Related Lead: ${email.relatedLead.name} (Status: ${email.relatedLead.status}, Value: ₹${email.relatedLead.value})` : ''}

Write a professional email reply that:
1. Acknowledges the email
2. Addresses the key points
3. Moves the conversation forward
4. Has a clear call-to-action

Include:
- Subject: Re: [subject]
- Full email body (150-250 words)
- Professional closing`

    const suggestion = await ask(prompt)

    const saved = await AISuggestion.create({
      type:         'email_reply',
      suggestion,
      relatedEmail: email._id,
      relatedLead:  email.relatedLead?._id,
      metadata:     { emailSubject: email.subject },
      company:      req.user.company,
      createdBy:    req.user._id
    })

    res.json({ suggestion, originalSubject: email.subject, id: saved._id })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
