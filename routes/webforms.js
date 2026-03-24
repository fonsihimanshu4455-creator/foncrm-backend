const express  = require('express')
const router   = express.Router()
const crypto   = require('crypto')
const WebForm  = require('../models/WebForm')
const Lead     = require('../models/Lead')
const { protect, allowRoles } = require('../middleware/authMiddleware')
const { checkTrial }          = require('../middleware/trialMiddleware')
const { notify }              = require('../utils/createNotification')

// ── List forms ────────────────────────────────────────────────────────────────
router.get('/', protect, checkTrial, async (req, res) => {
  try {
    const { isActive, page = 1, limit = 20 } = req.query
    const filter = { company: req.user.company }
    if (isActive !== undefined) filter.isActive = isActive === 'true'

    const skip  = (page - 1) * limit
    const total = await WebForm.countDocuments(filter)
    const forms = await WebForm.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))

    res.json({ forms, total, page: Number(page), pages: Math.ceil(total / limit) })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get single form ───────────────────────────────────────────────────────────
router.get('/:id', protect, checkTrial, async (req, res) => {
  try {
    const form = await WebForm.findOne({ _id: req.params.id, company: req.user.company })
      .populate('createdBy', 'name email')
      .populate('settings.autoAssignTo', 'name email')
    if (!form) return res.status(404).json({ message: 'Form not found' })
    res.json(form)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Create form ───────────────────────────────────────────────────────────────
router.post('/', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, description, fields, settings, style } = req.body

    const form = await WebForm.create({
      name, description, fields,
      settings: settings || {},
      style:    style || {},
      embedToken: crypto.randomBytes(32).toString('hex'),
      company:   req.user.company,
      companyId: req.user.company,
      createdBy: req.user._id
    })

    res.status(201).json(form)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Update form ───────────────────────────────────────────────────────────────
router.put('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const form = await WebForm.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      req.body,
      { new: true, runValidators: true }
    )
    if (!form) return res.status(404).json({ message: 'Form not found' })
    res.json(form)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Delete form ───────────────────────────────────────────────────────────────
router.delete('/:id', protect, checkTrial, allowRoles('superadmin', 'admin', 'manager'), async (req, res) => {
  try {
    const form = await WebForm.findOneAndDelete({ _id: req.params.id, company: req.user.company })
    if (!form) return res.status(404).json({ message: 'Form not found' })
    res.json({ message: 'Form deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Get embeddable snippet ─────────────────────────────────────────────────────
router.get('/:id/embed', protect, checkTrial, async (req, res) => {
  try {
    const form = await WebForm.findOne({ _id: req.params.id, company: req.user.company })
    if (!form) return res.status(404).json({ message: 'Form not found' })

    const baseUrl  = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`
    const embedUrl = `${baseUrl}/api/webforms/submit/${form.embedToken}`

    const snippet = `<!-- FonCRM Web Form: ${form.name} -->
<div id="foncrm-form-${form._id}"></div>
<script>
(function(){
  var f=document.getElementById('foncrm-form-${form._id}');
  var fields=${JSON.stringify(form.fields.map(fl => ({ label: fl.label, fieldName: fl.fieldName, type: fl.type, required: fl.required, options: fl.options, placeholder: fl.placeholder })))};
  var form=document.createElement('form');
  form.style.fontFamily='${form.style.fontFamily||'Inter'},sans-serif';
  form.style.background='${form.style.backgroundColor||'#ffffff'}';
  form.style.padding='24px';
  form.style.borderRadius='8px';
  fields.forEach(function(field){
    var wrapper=document.createElement('div');
    wrapper.style.marginBottom='16px';
    var label=document.createElement('label');
    label.textContent=field.label+(field.required?' *':'');
    label.style.display='block';
    label.style.marginBottom='4px';
    label.style.fontWeight='600';
    var input;
    if(field.type==='textarea'){input=document.createElement('textarea');input.rows=3;}
    else if(field.type==='select'){
      input=document.createElement('select');
      (field.options||[]).forEach(function(opt){var o=document.createElement('option');o.value=opt;o.textContent=opt;input.appendChild(o);});
    } else {input=document.createElement('input');input.type=field.type||'text';}
    input.name=field.fieldName;
    input.placeholder=field.placeholder||'';
    input.required=!!field.required;
    input.style.width='100%';input.style.padding='8px';input.style.border='1px solid #e2e8f0';input.style.borderRadius='4px';input.style.boxSizing='border-box';
    wrapper.appendChild(label);wrapper.appendChild(input);form.appendChild(wrapper);
  });
  var btn=document.createElement('button');
  btn.type='submit';btn.textContent='Submit';
  btn.style.background='${form.style.primaryColor||'#6366f1'}';btn.style.color='#fff';btn.style.padding='10px 24px';btn.style.border='none';btn.style.borderRadius='4px';btn.style.cursor='pointer';
  form.appendChild(btn);
  var msg=document.createElement('p');msg.style.display='none';msg.style.color='green';msg.style.marginTop='12px';
  form.appendChild(msg);
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var data={};
    new FormData(form).forEach(function(v,k){data[k]=v;});
    fetch('${embedUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json();})
      .then(function(){msg.textContent='${form.settings.successMessage||'Thank you! We will get back to you soon.'}';msg.style.display='block';form.reset();})
      .catch(function(){msg.textContent='Submission failed. Please try again.';msg.style.color='red';msg.style.display='block';});
  });
  f.appendChild(form);
})();
</script>`

    res.json({ embedToken: form.embedToken, submitUrl: embedUrl, snippet })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ── Public form submission (no auth) ─────────────────────────────────────────
router.post('/submit/:token', async (req, res) => {
  try {
    const form = await WebForm.findOne({ embedToken: req.params.token, isActive: true })
    if (!form) return res.status(404).json({ message: 'Form not found or inactive' })

    const data = req.body

    // Map form fields to lead fields
    const leadData = {
      source:    form.settings.leadSource || 'Web Form',
      status:    form.settings.leadStatus || 'New',
      company:   form.company,
      createdBy: form.createdBy
    }

    for (const field of form.fields) {
      const val = data[field.fieldName]
      if (!val) continue
      if (field.fieldName === 'name'  || field.label?.toLowerCase() === 'name')  leadData.name  = val
      if (field.fieldName === 'email' || field.label?.toLowerCase() === 'email') leadData.email = val
      if (field.fieldName === 'phone' || field.label?.toLowerCase() === 'phone') leadData.phone = val
      if (field.fieldName === 'notes' || field.label?.toLowerCase() === 'notes') leadData.notes = val
      if (field.fieldName === 'value' || field.label?.toLowerCase() === 'value') leadData.value = Number(val) || 0
    }

    if (!leadData.name) leadData.name = data.name || data.fullName || data.full_name || 'Form Submission'

    if (form.settings.autoAssignTo) leadData.assignedTo = form.settings.autoAssignTo

    const lead = await Lead.create(leadData)

    // Increment form submit count
    await WebForm.findByIdAndUpdate(form._id, { $inc: { submitCount: 1 } })

    // Notify users set to receive form submission alerts
    for (const userId of (form.settings.notifyOnSubmit || [])) {
      await notify({
        userId,
        title:   'New Form Submission',
        message: `"${form.name}" captured lead: ${lead.name}`,
        type:    'lead',
        relatedModel: 'Lead',
        relatedId: lead._id,
        company: form.company
      })
    }

    res.status(201).json({
      success: true,
      message: form.settings.successMessage || 'Thank you! We will get back to you soon.',
      redirectUrl: form.settings.redirectUrl || null
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
