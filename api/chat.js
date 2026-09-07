// api/chat.js
// هذا الملف يشتغل على السيرفر فقط (Vercel) — المتصفح ما يشوف محتواه أبداً.
// مفتاح الـ API مخزن كمتغير بيئة (Environment Variable) وليس داخل الكود.

const SYSTEM_PROMPT = `أنت المساعد الذكي الرسمي لموقع شركة "Uncoding"، شركة كويتية متخصصة في الحلول البرمجية وحلول الذكاء الاصطناعي.
خدمات الشركة:
- بناء مساعدين ذكاء اصطناعي مخصصين للشركات (يعرفون بيانات وخدمات كل عميل).
- تطوير أنظمة وتطبيقات وواجهات ويب مخصصة.
- ربط وأتمتة الأنظمة (واتساب، CRM، قواعد بيانات، إلخ).
رد دائماً باللهجة الخليجية الودودة والمهنية، بإيجاز ووضوح، وشجّع الزائر يتواصل عبر نموذج التواصل بالموقع لو أبدى اهتمام جاد. لا تختلق تفاصيل أسعار أو مواعيد محددة — قل إن فريق المبيعات يحدد التفاصيل بعد التواصل.`;

// أرخص موديل مناسب لأسئلة عامة عن الشركة
const MODEL = "claude-haiku-4-5-20251001";

// الحد اليومي المسموح لكل عنوان IP
const DAILY_LIMIT = 15;

// تخزين مؤقت بالذاكرة — يكفي لموقع صغير/متوسط.
// ملاحظة: هذا يتصفّر أحياناً على Vercel (serverless "cold start").
// لحماية أدق وأدوم، يفضّل لاحقاً استخدام Upstash Redis (له باقة مجانية أيضاً) — نذكرها بالـ README.
global.__usageStore = global.__usageStore || {};

function getClientIp(req){
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = getClientIp(req);
  const today = new Date().toISOString().slice(0, 10);
  const usageKey = `${ip}_${today}`;

  const currentCount = global.__usageStore[usageKey] || 0;
  if (currentCount >= DAILY_LIMIT) {
    res.status(429).json({ error: 'تجاوزت الحد اليومي المسموح من هذا الجهاز. جرب بكرة.' });
    return;
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'لا توجد رسالة صالحة.' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: 'صار خطأ من مزود الذكاء الاصطناعي.' });
      return;
    }

    global.__usageStore[usageKey] = currentCount + 1;
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'صار خطأ بالسيرفر. جرب مرة ثانية.' });
  }
};
