const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_MESSAGE_CHARS = 1200;
const MAX_HISTORY = 8;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const buckets = new Map();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function allowed(ip) {
  const now = Date.now();
  const old = buckets.get(ip);
  if (!old || now - old.startedAt >= RATE_WINDOW_MS) {
    buckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (old.count >= MAX_REQUESTS_PER_WINDOW) return false;
  old.count += 1;
  return true;
}

async function supabaseGet(env, table, select, query = '') {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status}`);
  return res.json();
}

async function getHospitalContext(env) {
  const [doctorsResult, inventoryResult] = await Promise.allSettled([
    supabaseGet(env, 'doctors', 'id,name,specialty,department,is_active', '&is_active=eq.true&order=name.asc&limit=100'),
    supabaseGet(env, 'pharmacy_inventory', 'med_name,unit,quantity,price', '&quantity=gt.0&order=med_name.asc&limit=100')
  ]);
  const doctors = doctorsResult.status === 'fulfilled' ? doctorsResult.value : [];
  const inventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value : [];

  return {
    hospital: 'مستشفى المغلس التخصصي',
    departments: {
      'الباطنية': ['باطنية عامة', 'غدد صماء وسكري', 'جهاز هضمي'],
      'الجراحة': ['جراحة عامة', 'جراحة عظام', 'جراحة تجميل'],
      'الأطفال': ['أطفال وحديثي ولادة', 'تغذية أطفال'],
      'القلب': ['أمراض القلب', 'قسطرة قلبية']
    },
    doctors: doctors.map(d => ({ name: d.name, specialty: d.specialty ?? null, department: d.department ?? null })),
    pharmacy: inventory.map(x => ({ name: x.med_name, unit: x.unit ?? 'حبة', available: Number(x.quantity ?? 0), price: x.price ?? null })),
    booking: 'الحجز يتم من واجهة الموقع الحالية باختيار القسم والتخصص والطبيب والتاريخ والوقت ثم إدخال بيانات المريض.'
  };
}

function systemPrompt(context) {
  return `أنت «مساعد المغلس»، المساعد الرسمي داخل موقع مستشفى المغلس التخصصي.
تحدث بالعربية الواضحة والطبيعية، ويمكنك فهم اللهجة اليمنية البسيطة.
مهمتك مساعدة زائر الموقع في معلومات المستشفى العامة، الأقسام، الأطباء، الخدمات، الصيدلية، وطريقة الحجز.
قواعد مهمة:
1) لا تخترع طبيبًا أو قسمًا أو سعرًا أو دواءً غير موجود في البيانات.
2) لا تكشف بيانات المرضى أو السجلات الطبية أو أرقام الهواتف أو أي معلومات خاصة.
3) لا تشخّص المرض ولا تستبدل الطبيب. عند السؤال الطبي أعطِ معلومات عامة وآمنة، واذكر متى يلزم التواصل مع طبيب أو الطوارئ.
4) إذا لم تجد المعلومة في السياق، قل بوضوح إنك لا تملكها بدل التخمين.
5) لا تدّعي أنك نفذت حجزًا أو ألغيت موعدًا ما لم ينفذ الموقع ذلك فعليًا.
6) كن مختصرًا ومفيدًا، واستخدم نقاطًا عند الحاجة.

بيانات المستشفى الحالية:
${JSON.stringify(context, null, 2)}`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!allowed(ip)) return json({ error: 'تم الوصول إلى الحد المؤقت للطلبات. حاول بعد قليل.' }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'طلب غير صالح.' }, 400); }

    const message = cleanText(body?.message);
    if (!message) return json({ error: 'اكتب سؤالك أولاً.' }, 400);
    if (message.length > MAX_MESSAGE_CHARS) return json({ error: `الرسالة طويلة جدًا. الحد ${MAX_MESSAGE_CHARS} حرف.` }, 400);

    let context;
    try {
      context = await getHospitalContext(env);
    } catch (e) {
      return json({ error: 'تعذر قراءة بيانات المستشفى مؤقتًا.' }, 502);
    }

    const history = Array.isArray(body?.history)
      ? body.history.slice(-MAX_HISTORY).map(x => ({
          role: x?.role === 'assistant' ? 'assistant' : 'user',
          content: cleanText(x?.content).slice(0, 1200)
        })).filter(x => x.content)
      : [];

    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          { role: 'system', content: systemPrompt(context) },
          ...history,
          { role: 'user', content: message }
        ],
        max_tokens: 500,
        temperature: 0.2
      });
      const answer = cleanText(result?.response || result?.choices?.[0]?.message?.content);
      if (!answer) return json({ error: 'لم يصل رد مفهوم من النموذج.' }, 502);
      return json({ answer });
    } catch (e) {
      return json({ error: 'تعذر تشغيل نموذج الذكاء الاصطناعي الآن.' }, 503);
    }
  }
};
