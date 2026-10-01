# ربط مساعد المغلس بالذكاء الاصطناعي الحقيقي

هذه الحزمة تحتوي على مشروع الموقع نفسه + Cloudflare Worker للمساعد.

## 1) أنشئ Worker

في Cloudflare افتح Workers & Pages ثم أنشئ Worker جديد، أو استخدم Wrangler.

## 2) اربط Workers AI

ملف `wrangler.toml` يحتوي بالفعل على:

```toml
[ai]
binding = "AI"
```

Cloudflare توثق أن هذا يجعل النموذج متاحًا داخل Worker عبر `env.AI.run()`. 

## 3) أضف متغيرات Worker

في إعدادات Worker أضف:

- `SUPABASE_URL` = رابط مشروع Supabase الموجود في `script.js`.
- `SUPABASE_PUBLISHABLE_KEY` = المفتاح publishable الموجود في `script.js`.

لا تضع service_role key في الموقع ولا في المتصفح.

## 4) انشر Worker

بعد نشره سيكون لديك رابط شبيه:

`https://al-mughales-ai.<اسم-حسابك>.workers.dev`

## 5) ضع الرابط في الموقع

في `index.html` ابحث عن:

```js
window.AL_MUGHALES_AI_ENDPOINT = "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev";
```

واستبدله برابط Worker الحقيقي.

## 6) اختبر

جرّب:
- ما هي أقسام المستشفى؟
- من أطباء الباطنية؟
- ما هي الأدوية المتوفرة؟
- كيف أحجز موعد؟
- عندي سؤال طبي عام...

## مهم عن المجانية

Workers AI لديه حاليًا حصة مجانية يومية مقدارها 10,000 Neurons على Workers Free. عند تجاوزها تفشل العمليات بدل تحويلك تلقائيًا إلى فاتورة مدفوعة على الخطة المجانية. الحدود والأسعار قد تتغير، لذلك راجع لوحة Cloudflare قبل الإطلاق العام.
