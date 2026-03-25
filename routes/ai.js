const express        = require('express')
const router         = express.Router()
const Anthropic      = require('@anthropic-ai/sdk')
const Lead           = require('../models/Lead')
const Deal           = require('../models/Deal')
const Email          = require('../models/Email')
const AISuggestion   = require('../models/AISuggestion')
const AIChatHistory  = require('../models/AIChatHistory')
const { protect }    = require('../middleware/authMiddleware')
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

// ── AI Chat (conversational, with history) ────────────────────────────────────
router.post('/chat', protect, checkTrial, async (req, res) => {
  try {
    const { message, sessionId } = req.body
    if (!message) return res.status(400).json({ message: 'message is required' })

    // Load or create chat history
    let chatHistory = await AIChatHistory.findOne({
      userId: req.user._id,
      ...(sessionId ? { _id: sessionId } : {})
    }).sort({ updatedAt: -1 })

    if (!chatHistory) {
      chatHistory = await AIChatHistory.create({
        userId:   req.user._id,
        messages: [],
        context:  { company: req.user.company, userName: req.user.name }
      })
    }

    // Build messages for Claude
    const history = chatHistory.messages.slice(-10).map(m => ({
      role: m.role, content: m.content
    }))

    const systemPrompt = `You are FonCRM's AI assistant helping ${req.user.name} at ${req.user.company}.
You help with CRM tasks: analyzing leads, drafting messages, pipeline advice, sales coaching, and business insights.
Be concise, professional, and actionable. Use Indian business context when relevant.`

    const response = await ai.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [...history, { role: 'user', content: message }]
    })

    const reply = response.content[0].text

    // Save to history
    await AIChatHistory.findByIdAndUpdate(chatHistory._id, {
      $push: {
        messages: [
          { role: 'user',      content: message, timestamp: new Date() },
          { role: 'assistant', content: reply,   timestamp: new Date() }
        ]
      }
    })

    res.json({ reply, sessionId: chatHistory._id })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET chat sessions ─────────────────────────────────────────────────────────
router.get('/chat/sessions', protect, async (req, res) => {
  try {
    const sessions = await AIChatHistory.find({ userId: req.user._id })
      .select('messages context createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(20)
    res.json({ sessions, total: sessions.length })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Analyze pipeline ───────────────────────────────────────────────────────────
router.get('/analyze-pipeline', protect, checkTrial, async (req, res) => {
  try {
    const deals = await Deal.find({ company: req.user.company, stage: { $nin: ['won', 'lost'] } })
      .select('title value stage probability expectedCloseDate createdAt')

    const totalValue    = deals.reduce((s, d) => s + d.value, 0)
    const weightedValue = deals.reduce((s, d) => s + (d.value * (d.probability / 100)), 0)

    const stageBreakdown = deals.reduce((acc, d) => {
      acc[d.stage] = (acc[d.stage] || 0) + 1
      return acc
    }, {})

    const prompt = `You are a sales pipeline analyst. Analyze this pipeline data and provide insights.

Pipeline Summary:
- Total Active Deals: ${deals.length}
- Total Pipeline Value: ₹${totalValue.toLocaleString('en-IN')}
- Weighted Pipeline Value: ₹${Math.round(weightedValue).toLocaleString('en-IN')}
- Stage Breakdown: ${JSON.stringify(stageBreakdown)}
- Top 5 Deals: ${JSON.stringify(deals.slice(0, 5).map(d => ({ title: d.title, value: d.value, stage: d.stage, probability: d.probability })))}

Provide:
1. Pipeline Health Assessment (2-3 sentences)
2. Key Risks (3 bullet points)
3. Opportunities (3 bullet points)
4. Recommended Focus Areas (top 3 actions)
5. Forecast Confidence: Low/Medium/High`

    const analysis = await ask(prompt)

    res.json({
      analysis,
      metrics: {
        totalDeals: deals.length,
        totalValue: Math.round(totalValue),
        weightedValue: Math.round(weightedValue),
        stageBreakdown
      }
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Competitor analysis ────────────────────────────────────────────────────────
router.post('/competitor-analysis', protect, checkTrial, async (req, res) => {
  try {
    const { competitorName, context } = req.body
    if (!competitorName) return res.status(400).json({ message: 'competitorName is required' })

    const prompt = `You are a competitive intelligence analyst for a CRM system. Analyze the competitor and provide a battle card.

Competitor: ${competitorName}
Context: ${context || 'Indian SMB CRM market'}

Provide a competitive battle card:
1. Competitor Overview (2-3 sentences)
2. Their Key Strengths (3-4 bullet points)
3. Their Weaknesses (3-4 bullet points)
4. Our Differentiators vs ${competitorName} (4-5 bullet points)
5. Win Strategy when competing against them (3 tactical tips)
6. Key Questions to disqualify their strengths

Format as a practical sales battle card.`

    const analysis = await ask(prompt)

    const saved = await AISuggestion.create({
      type:      'competitor_analysis',
      suggestion: analysis,
      metadata:  { competitor: competitorName },
      company:   req.user.company,
      createdBy: req.user._id
    })

    res.json({ analysis, competitor: competitorName, id: saved._id })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Sentiment analysis ────────────────────────────────────────────────────────
router.post('/sentiment-analysis', protect, checkTrial, async (req, res) => {
  try {
    const { text, leadId } = req.body
    if (!text) return res.status(400).json({ message: 'text is required' })

    const prompt = `Analyze the sentiment and intent of this customer communication. Be concise.

Text: "${text}"

Respond with JSON only:
{
  "sentiment": "positive|negative|neutral",
  "score": 0-100,
  "intent": "buying|objecting|requesting_info|complaining|general",
  "urgency": "high|medium|low",
  "keyTopics": ["topic1", "topic2"],
  "recommendedResponse": "brief suggestion for how to respond",
  "buyingSignals": true/false
}`

    const raw = await ask(prompt)
    let parsed
    try {
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : { raw }
    } catch { parsed = { raw } }

    if (leadId) {
      await AISuggestion.create({
        type:       'sentiment_analysis',
        suggestion: JSON.stringify(parsed),
        relatedLead: leadId,
        metadata:   { text: text.slice(0, 200) },
        company:    req.user.company,
        createdBy:  req.user._id
      })
    }

    res.json({ sentiment: parsed, text: text.slice(0, 200) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Lead enrichment ───────────────────────────────────────────────────────────
router.post('/lead-enrichment/:leadId', protect, checkTrial, async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.leadId, company: req.user.company })
    if (!lead) return res.status(404).json({ message: 'Lead not found' })

    const prompt = `You are a lead research AI. Based on available info, enrich this lead profile with insights.

Lead Info:
- Name: ${lead.name}
- Email: ${lead.email || 'Unknown'}
- Phone: ${lead.phone || 'Unknown'}
- Source: ${lead.source}
- Notes: ${lead.notes || 'None'}
- Tags: ${lead.tags?.join(', ') || 'None'}

Generate enrichment insights (based on name/email patterns, not real-time web data):
1. Likely Industry: (educated guess based on available info)
2. Decision Maker Level: (C-level/Manager/Individual based on name patterns)
3. Engagement Approach: Best channel and tone to use
4. Personalization Tips: 3 specific ways to personalize outreach
5. Suggested Follow-up Sequence: 3-step sequence with timing
6. Red Flags: Any concerns based on available info`

    const enrichment = await ask(prompt)

    const saved = await AISuggestion.create({
      type:        'lead_enrichment',
      suggestion:  enrichment,
      relatedLead: lead._id,
      metadata:    { leadSource: lead.source },
      company:     req.user.company,
      createdBy:   req.user._id
    })

    res.json({ enrichment, leadId: lead._id, id: saved._id })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── Weekly AI report ───────────────────────────────────────────────────────────
router.get('/weekly-report', protect, checkTrial, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
    const company      = req.user.company

    const [newLeads, wonLeads, lostLeads, wonDeals, totalDealValue, newContacts] = await Promise.all([
      Lead.countDocuments({ company, createdAt: { $gte: sevenDaysAgo } }),
      Lead.countDocuments({ company, status: 'won',  updatedAt: { $gte: sevenDaysAgo } }),
      Lead.countDocuments({ company, status: 'lost', updatedAt: { $gte: sevenDaysAgo } }),
      Deal.countDocuments({ company, stage: 'won',   updatedAt: { $gte: sevenDaysAgo } }),
      Deal.aggregate([
        { $match: { company, stage: 'won', updatedAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$value' } } }
      ]),
      require('../models/Contact').countDocuments({ company, createdAt: { $gte: sevenDaysAgo } })
    ])

    const revenue = totalDealValue[0]?.total || 0

    const prompt = `You are a CRM analytics AI. Generate a weekly performance report summary.

Weekly Metrics (last 7 days):
- New Leads: ${newLeads}
- Leads Won: ${wonLeads}
- Leads Lost: ${lostLeads}
- Deals Closed: ${wonDeals}
- Revenue Closed: ₹${revenue.toLocaleString('en-IN')}
- New Contacts: ${newContacts}
- Conversion Rate: ${newLeads > 0 ? Math.round((wonLeads / newLeads) * 100) : 0}%

Generate:
1. Executive Summary (2-3 sentences)
2. Top Wins This Week
3. Areas Needing Attention
4. Next Week Priorities (3 action items)
5. Motivational message for the team

Keep it concise, data-driven, and actionable.`

    const report = await ask(prompt)

    res.json({
      report,
      metrics: {
        period: '7 days',
        newLeads, wonLeads, lostLeads, wonDeals,
        revenue: Math.round(revenue),
        newContacts,
        conversionRate: newLeads > 0 ? Math.round((wonLeads / newLeads) * 100) : 0
      },
      generatedAt: new Date()
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
