// api/chat.js
// هذا الملف يشتغل على السيرفر فقط (Vercel) — المتصفح ما يشوف محتواه أبداً.
// مفتاح الـ API مخزن كمتغير بيئة (Environment Variable) وليس داخل الكود.
// يستخدم Google Gemini (له طبقة مجانية دائمة بدون بطاقة بنكية أو رصيد ينتهي).

const SYSTEM_PROMPT = `أنت المساعد الذكي الرسمي لموقع شركة "Uncoding"، شركة كويتية متخصصة في الحلول البرمجية وحلول الذكاء الاصطناعي.
خدمات الشركة:
- بناء مساعدين ذكاء اصطناعي مخصصين للشركات (يعرفون بيانات وخدمات كل عميل).
- تطوير أنظمة وتطبيقات وواجهات ويب مخصصة.
- ربط وأتمتة الأنظمة (واتساب، CRM، قواعد بيانات، إلخ).
رد دائماً باللهجة الخليجية الودودة والمهنية، بإيجاز ووضوح، وشجّع الزائر يتواصل عبر نموذج التواصل بالموقع لو أبدى اهتمام جاد. لا تختلق تفاصيل أسعار أو مواعيد محددة — قل إن فريق المبيعات يحدد التفاصيل بعد التواصل.`;

// موديل Gemini المجاني (Flash) — سريع ومناسب لأسئلة عامة عن الشركة
const MODEL = "gemini-2.0-flash";

// الحد اليومي المسموح لكل عنوان IP (طبقة حماية إضافية فوق حد Google نفسه)
const DAILY_LIMIT = 15;

// تخزين مؤقت بالذاكرة — يكفي لموقع صغير/متوسط.
global.__usageStore = global.__usageStore || {};

function getClientIp(req) {
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

  // تحويل صيغة الرسائل (role/content) إلى الصيغة اللي يفهمها Gemini (role/parts)
  const geminiContents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: geminiContents,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: 'صار خطأ من مزود الذكاء الاصطناعي.' });
      return;
    }

    const replyText =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      'عذراً، ما قدرت أرد الحين. جرب مرة ثانية.';

    global.__usageStore[usageKey] = currentCount + 1;

    // نرجّع بنفس الشكل اللي يتوقعه الفرونت إند (index.html) بدون ما نغيّره
    res.status(200).json({ content: [{ type: 'text', text: replyText }] });
  } catch (err) {
    res.status(500).json({ error: 'صار خطأ بالسيرفر. جرب مرة ثانية.' });
  }
};
