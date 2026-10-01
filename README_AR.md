# مساعد المغلس الذكي — النسخة الجاهزة

هذه النسخة تربط موقع مستشفى المغلس التخصصي بـ Cloudflare Worker + Workers AI + Supabase.

## ما تم تجهيزه
- `index.html`: تمت إضافة واجهة المساعد ورابط Worker الحقيقي.
- `style.css`: تمت إضافة تنسيق المساعد فقط في نهاية الملف.
- `script.js`: محفوظ كما هو بدون تعديل.
- `cloudflare-worker/worker.js`: يستقبل أسئلة الموقع ويشغل Workers AI ويقرأ البيانات المسموح بها من Supabase.
- `cloudflare-worker/wrangler.toml`: اسم الـ Worker مضبوط على `al-mughales` ليتطابق مع اسم Worker الحالي في Cloudflare.

## إعداد Cloudflare المطلوب
يجب أن يكون Binding موجودًا باسم:
- `AI`

ويجب أن تكون Secrets في Production:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

لا تضع أي Secret داخل ملفات الموقع أو GitHub.

## النشر
بعد رفع ملفات هذه الحزمة إلى نفس مستودع GitHub المتصل بـ Cloudflare، سيعيد Cloudflare بناء الـ Worker.

عنوان Worker المستخدم داخل الموقع:
`https://al-mughales.alaamoghles.workers.dev`

## ملاحظة أمنية
المساعد مخصص للمعلومات العامة عن المستشفى. لا ترسل له بيانات المرضى أو السجلات الطبية الخاصة، ولا تستخدم `service_role` داخل الموقع أو Worker.
