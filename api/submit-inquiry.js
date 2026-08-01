// Serverless function for Vercel: api/submit-inquiry.js
// Use with Node 18+ on Vercel. Uses Supabase service_role to insert rows server-side.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // REQUIRED (keep secret)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';        // optional
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@nskglobalfoods.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'srikanthnaga86@gmail.com'; // default
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';   // optional
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';     // optional
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || ''; // e.g. 'whatsapp:+1415XXXXXXX'
const ADMIN_WHATSAPP_TO = process.env.ADMIN_WHATSAPP_TO || 'whatsapp:+918008972911'; // default

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    // Honeypot
    if (body['bot-field']) return res.status(400).json({ error: 'Bot detected' });

    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const requirements = (body.requirements || '').trim();
    const company = (body.company || '').trim();
    const country = (body.country || '').trim();

    if (!name || !email || !requirements) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert into Supabase (server-side, uses service_role)
    const insertPayload = { name, email, company, country, requirements };
    const { data, error: insertError } = await supabase
      .from('buyer_inquiries')
      .insert([insertPayload])
      .select()
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({ error: 'Database insert failed' });
    }

    // Notification text
    const shortDate = new Date().toLocaleString();
    const messageText = `New buyer inquiry\n\nName: ${name}\nEmail: ${email}\nCompany: ${company}\nCountry: ${country}\nRequirements: ${requirements}\nDate: ${shortDate}\n\n(From: website)`;

    // Send Email via SendGrid (if configured)
    if (SENDGRID_API_KEY) {
      try {
        const emailBody = {
          personalizations: [{ to: [{ email: ADMIN_EMAIL }], subject: 'New Buyer Inquiry - NSK Global Foods' }],
          from: { email: FROM_EMAIL, name: 'NSK Global Foods' },
          content: [{ type: 'text/plain', value: messageText }]
        };

        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailBody)
        });
      } catch (err) {
        console.error('SendGrid error', err);
      }
    }

    // Send WhatsApp via Twilio (if configured)
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM && ADMIN_WHATSAPP_TO) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const params = new URLSearchParams();
        params.append('From', TWILIO_WHATSAPP_FROM);
        params.append('To', ADMIN_WHATSAPP_TO);
        params.append('Body', `New inquiry: ${name} (${email}). ${requirements.substring(0, 200)}...`);

        await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });
      } catch (err) {
        console.error('Twilio error', err);
      }
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('handler exception', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
