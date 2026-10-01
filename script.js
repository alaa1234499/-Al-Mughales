// ==========================================
// script.js - جميع دوال مستشفى المغلس
// ==========================================

// ==========================================
// 1. المتغيرات العامة والإعدادات
// ==========================================

const _0x_u = atob("aHR0cHM6Ly93Y3Jub2Zta21vcnFsbXh6YWRrai5zdXBhYmFzZS5jbw==");
const _0x_k = "sb_publishable_xGG6Zdi5uo3sy_trep_GFQ_AAIduuZF";
let supabase;

let locks = { booking: false, consultation: false };
let processedEvents = new Set();
let currentStep = 0;

let realtimeManager = {
    patientChannel: null,
    doctorChannel: null,
    pharmacyChannel: null,
    currentPatient: null,
    adminChannel: null
};

const startEngine = () => {
    supabase = window.supabase.createClient(_0x_u, _0x_k);
};
startEngine();

// متغيرات لوحة الدكتور الجديدة
let currentSelectedPatientId = null;
let currentSelectedConsultId = null;
let doctorsPatientsList = [];
let doctorsConsultsList = [];
let appointmentToDeleteId = null;

// البيانات الأساسية

const hospitalData = {
    internal: ["باطنية عامة", "غدد صماء وسكري", "جهاز هضمي"],
    surgery: ["جراحة عامة", "جراحة عظام", "جراحة تجميل"],
    pediatrics: ["أطفال وحديثي ولادة", "تغذية أطفال"],
    heart: ["أمراض القلب", "قسطرة قلبية"]
};

const times = ["09:00 ص", "10:00 ص", "11:30 ص", "04:00 م", "05:30 م", "07:00 م", "08:30 م"];

let itiPatient;
let lastUpdateId = null;
let currentDoctorPatientIdDetail = null;
let appleMedsList = [];
let appleLabList = [];

// ===== متغيرات الأطباء =====
let doctorsList = [];
let selectedDoctorId = null;


// ==========================================
// 2. دوال حجز الموعد
// ==========================================

function setupAdminRealtime() {
    if (realtimeManager.adminChannel) supabase.removeChannel(realtimeManager.adminChannel);
    realtimeManager.adminChannel = supabase.channel('admin-global-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
            loadAppointmentsFromFirebase().then(() => { if (typeof render === 'function') render(); });
        }).subscribe();
}

window.loadAppointmentsFromFirebase = async () => {
    try {
        const { data, error } = await supabase     .from('appointments')     .select(`         id,         appointment_date,         appointment_time,         department,         service_type,         status,         doctor_id,         patients(name,phone)     `)     .order('appointment_date', { ascending: false });
        if (error) throw error;
        return data.map(item => ({
    id: item.id,
    name: item.patients.name,
    phone: item.patients.phone,
    department: item.department,
    service: item.service_type,
    date: item.appointment_date,
    fullDate: `${item.appointment_date} (${item.appointment_time})`,
    doctor_id: item.doctor_id
}));
    } catch(e) { console.error("Load Error:", e.message); return []; }
};

window.loginAdmin = async function(email, password) {
    const loginBtn = document.querySelector('#adminLoginForm .nav-btn');
    if (!email || !password) { showToast("يرجى إدخال البيانات", "error"); return; }
    loginBtn.disabled = true;
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> جاري التحقق...`;
    try {
        let finalEmail = email.includes('@') ? email.trim() : `${email.trim()}@clinic.com`;
        const { data, error } = await supabase.auth.signInWithPassword({ email: finalEmail, password: password });
        if (error) throw error;
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
        window.isAdminLoggedIn = true;
        setupAdminRealtime();
        renderAdminUI(true);
        showToast("✅ تم تسجيل الدخول بنجاح", "success");
    } catch (error) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = `دخول`;
        showToast("❌ بيانات الدخول غير صحيحة", "error");
    }
};

window.saveAppointmentToFirebase = async (appointmentData, requestId = null) => {
    if (locks.booking) {
        showToast("جاري معالجة طلب سابق، انتظر قليلاً", "error");
        return null;
    }
    try {
        locks.booking = true;
        const timeMatch = appointmentData.fullDate.match(/\(([^)]+)\)/);
        const appointmentTime = timeMatch ? timeMatch[1] : appointmentData.fullDate;
        let patientId = null;
        
        const { data: existingPatient, error: searchError } = await supabase
            .from('patients')
            .select('id')
            .eq('phone', appointmentData.phone)
            .maybeSingle();
        
        if (searchError) throw searchError;
        
        if (existingPatient) {
            patientId = existingPatient.id;
        } else {
            const { data: newPatient, error: insertError } = await supabase
                .from('patients')
                .insert({
                    name: appointmentData.name,
                    phone: appointmentData.phone,
                    service: appointmentData.service || 'غير محدد',
                    date: appointmentData.date || new Date().toISOString().split('T')[0]
                })
                .select('id')
                .single();
            
            if (insertError) throw insertError;
            patientId = newPatient.id;
        }
        
        // الحصول على doctor_id من التحديد
        const doctorSelect = document.getElementById('doctor-select');
        const doctorId = doctorSelect ? doctorSelect.value : null;
        
        const { data: appointment, error: aError } = await supabase
            .from('appointments')
            .insert({
                patient_id: patientId,
                appointment_date: appointmentData.date,
                appointment_time: appointmentTime,
                department: appointmentData.department,
                service_type: appointmentData.service,
                doctor_id: doctorId,
                status: 'قادم'
            })
            .select();
        
        if (aError) throw aError;
        
        await loadAppointmentsFromFirebase();
        if (typeof render === 'function') render();
        showToast("✅ تم حجز الموعد بنجاح", "success");
        return appointment[0].id;
    } catch (e) {
        console.error("خطأ تقني في الحجز:", e.message);
        showToast("حدث خطأ أثناء الحجز: " + e.message, "error");
        return null;
    } finally {
        locks.booking = false;
    }
};

window.deleteAppointmentFromFirebase = async (id) => {
    try {
        const { error } = await supabase.from('appointments').delete().eq('id', id);
        if (!error) { await loadAppointmentsFromFirebase(); if (typeof render === 'function') render(); }
        return !error;
    } catch (e) { return false; }
};

window.logoutAdmin = async () => {
    if (realtimeManager.adminChannel) { supabase.removeChannel(realtimeManager.adminChannel); realtimeManager.adminChannel = null; }
    await supabase.auth.signOut();
    window.isAdminLoggedIn = false;
    renderAdminUI(false);
    showToast("تم الخروج وتأمين الجلسة", "success");
};

supabase.auth.onAuthStateChange((event, session) => {
    window.isAdminLoggedIn = !!session;
    if (event === 'SIGNED_IN') { setupAdminRealtime(); renderAdminUI(true); }
});


// ==========================================
// دوال إدارة الأطباء (جديدة)
// ==========================================

// جلب الأطباء من قاعدة البيانات
async function loadDoctors() {
    try {
        const { data, error } = await supabase
            .from('doctors')
            .select('*')
            .eq('is_active', true)
            .order('name');
        
        if (error) throw error;
        doctorsList = data || [];
        return doctorsList;
    } catch (e) {
        console.error("خطأ في تحميل الأطباء:", e.message);
        return [];
    }
}

// تحديث قائمة الأطباء حسب القسم والتخصص
function updateDoctorsList() {
    const mainCat = document.getElementById('main-category');
    const subCat = document.getElementById('service-type');
    const doctorSelect = document.getElementById('doctor-select');
    const doctorBio = document.getElementById('doctor-bio');
    const doctorBioText = document.getElementById('doctor-bio-text');
    
    if (!doctorSelect) return;
    
    const selectedDept = mainCat.value;
    const selectedSpecialty = subCat.value;
    
    let filteredDoctors = doctorsList;
    
    // تصفية حسب القسم
    if (selectedDept) {
        filteredDoctors = filteredDoctors.filter(doc => doc.department === selectedDept);
    }
    
    // تصفية حسب التخصص (إذا كان هناك تخصص محدد)
    if (selectedSpecialty && selectedSpecialty !== 'اختر التخصص الدقيق...') {
        filteredDoctors = filteredDoctors.filter(doc => doc.specialty === selectedSpecialty);
    }
    
    doctorSelect.innerHTML = '<option value="">-- اختر الدكتور المناسب --</option>';
    
    if (filteredDoctors.length === 0) {
        doctorSelect.innerHTML += '<option value="" disabled>لا يوجد أطباء متاحون</option>';
        if (doctorBio) doctorBio.style.display = 'none';
        return;
    }
    
    filteredDoctors.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${doc.name} - ${doc.specialty}`;
        option.dataset.bio = doc.bio || '';
        doctorSelect.appendChild(option);
    });
    
    // عرض السيرة الذاتية عند اختيار طبيب
    doctorSelect.onchange = function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption && selectedOption.value) {
            const bio = selectedOption.dataset.bio || 'لا توجد معلومات إضافية';
            if (doctorBioText) doctorBioText.textContent = bio;
            if (doctorBio) doctorBio.style.display = 'block';
            selectedDoctorId = selectedOption.value;
        } else {
            if (doctorBio) doctorBio.style.display = 'none';
            selectedDoctorId = null;
        }
    };
}

// تهيئة الأطباء عند تحميل الصفحة
async function initDoctors() {
    await loadDoctors();
    updateDoctorsList();
}



// ==========================================
// 3. دوال الملف الطبي
// ==========================================

window.fetchFullPatientProfile = async (phone) => {
    try {
        const { data: patient, error: pError } = await supabase.from('patients').select('id, name, phone, created_at').eq('phone', phone).single();
        if (pError || !patient) { showToast("عذراً، لم يتم العثور على سجل بهذا الرقم", "error"); return null; }
        const { data: appointments, error: aError } =     await supabase         .from('appointments')         .select(`             id,             patient_id,             appointment_date,             appointment_time,             department,             service_type,             status,             created_at,             doctor_id         `)         .eq('patient_id', patient.id)         .order('appointment_date', { ascending: false });
        const { data: records, error: rError } = await supabase.from('medical_records').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false });
        const { data: consults, error: cError } = await supabase.from('consultations').select('*').eq('patient_phone', phone).order('created_at', { ascending: false });
        await renderPortalData(     patient,     appointments || [],     records || [],     consults || [] );
        setupPatientRealtime(phone);
        return { patient, appointments, records, consults };
    } catch (e) { console.error("Error fetching profile:", e.message); showToast("حدث خطأ أثناء تحميل الملف الطبي", "error"); return null; }
};

async function renderPortalData(patient, appointments, records, consults) {
    const firstName = patient.name.trim().split(' ')[0];
    document.getElementById('display-first-name').innerHTML = `مرحباً، ${firstName}`;
    document.getElementById('display-patient-name').innerHTML = `<i class="fas fa-id-card"></i> ${patient.name}`;
    document.getElementById('display-patient-phone').innerHTML = `<i class="fas fa-mobile-alt"></i> ${patient.phone}`;
    const visitsCount = appointments.length;
    document.getElementById('total-visits-count').innerText = visitsCount;
    document.getElementById('last-visit-date').innerText = visitsCount > 0 ? appointments[0].appointment_date : "لا يوجد";
    document.getElementById('consult-phone').value = patient.phone;
    
    const visitsContainer = document.getElementById('portal-visits');
    if (visitsCount === 0) {
        visitsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-times"></i><p>لا توجد زيارات سابقة</p></div>`;
    } else {
        // جلب أسماء الأطباء للمواعيد
        const doctorIds = [...new Set(appointments.map(apt => apt.doctor_id).filter(id => id))];
        let doctorsMap = {};
        if (doctorIds.length > 0) {

    const { data: doctors, error: doctorsError } =
        await supabase
            .from('doctors')
            .select('id, name')
            .in('id', doctorIds);

    if (doctorsError) {
        console.error(
            "خطأ في جلب أسماء الأطباء:",
            doctorsError
        );
    }

    if (doctors) {
        doctors.forEach(doc => {
            doctorsMap[doc.id] = doc.name;
        });
    }
}
        
        visitsContainer.innerHTML = appointments.map(apt => {
            const doctorName = apt.doctor_id ? (doctorsMap[apt.doctor_id] || 'غير محدد') : 'غير محدد';
            return `<div class="record-card">
                <div class="record-header">
                    <span class="record-date"><i class="far fa-calendar-alt"></i> ${apt.appointment_date}</span>
                    <span class="record-badge ${apt.status === 'مكتمل' ? 'completed' : 'pending'}">${apt.status || 'مكتمل'}</span>
                </div>
                <div class="record-body">
                    <p><i class="fas fa-hospital"></i> <strong>القسم:</strong> ${apt.department || 'غير محدد'}</p>
                    <p><i class="fas fa-stethoscope"></i> <strong>التخصص:</strong> ${apt.service_type || 'غير محدد'}</p>
                    <p><i class="fas fa-user-md"></i> <strong>الدكتور:</strong> ${doctorName}</p>
                    <p><i class="fas fa-clock"></i> <strong>الوقت:</strong> ${apt.appointment_time || 'غير محدد'}</p>
                </div>
            </div>`;
        }).join('');
    }
    
    const prescriptionsContainer = document.getElementById('portal-prescriptions');
    const medsRecords = records?.filter(r => r.prescribed_meds && r.prescribed_meds.length > 0) || [];
    if (medsRecords.length === 0) {
        prescriptionsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-pills"></i><p>لا توجد أدوية موصوفة</p></div>`;
    } else {
        // جلب أسماء الأطباء للسجلات
        const recordDoctorIds = [...new Set(medsRecords.map(r => r.doctor_id).filter(id => id))];
        let recordDoctorsMap = {};
        if (recordDoctorIds.length > 0) {
            supabase.from('doctors').select('id, name').in('id', recordDoctorIds).then(({data}) => {
                if (data) {
                    data.forEach(doc => { recordDoctorsMap[doc.id] = doc.name; });
                }
            });
        }
        
        prescriptionsContainer.innerHTML = medsRecords.map(rec => {
            const medsList = Array.isArray(rec.prescribed_meds) ? rec.prescribed_meds.join('، ') : rec.prescribed_meds;
            const doctorName = rec.doctor_id ? (recordDoctorsMap[rec.doctor_id] || rec.doctor_name || 'غير محدد') : (rec.doctor_name || 'غير محدد');
            return `<div class="record-card">
                <div class="record-header">
                    <span class="record-date"><i class="far fa-calendar-alt"></i> ${new Date(rec.created_at).toLocaleDateString('ar-EG')}</span>
                </div>
                <div class="record-body">
                    <p><i class="fas fa-prescription-bottle-alt"></i> <strong>الأدوية:</strong> ${medsList}</p>
                    <p><i class="fas fa-user-md"></i> <strong>الطبيب:</strong> ${doctorName}</p>
                </div>
            </div>`;
        }).join('');
    }
    
    const labContainer = document.getElementById('portal-lab');
    const labRecords = records?.filter(r => r.lab_results) || [];
    if (labRecords.length === 0) {
        labContainer.innerHTML = `<div class="empty-state"><i class="fas fa-microscope"></i><p>لا توجد نتائج مختبر</p></div>`;
    } else {
        labContainer.innerHTML = labRecords.map(rec => {
            const doctorName = rec.doctor_name || 'غير محدد';
            return `<div class="record-card">
                <div class="record-header">
                    <span class="record-date"><i class="far fa-calendar-alt"></i> ${new Date(rec.created_at).toLocaleDateString('ar-EG')}</span>
                </div>
                <div class="record-body">
                    <p><i class="fas fa-flask"></i> <strong>النتائج:</strong> ${rec.lab_results}</p>
                    <p><i class="fas fa-user-md"></i> <strong>الطبيب:</strong> ${doctorName}</p>
                </div>
            </div>`;
        }).join('');
    }
    
    renderConsultations(consults);
}

function renderConsultations(consults) {
    const list = document.getElementById('consults-history-list');
    const countBadge = document.getElementById('consults-count');
    if (!consults || consults.length === 0) {
        if (countBadge) countBadge.innerText = "0";
        if (list) list.innerHTML = `<div class="empty-consults"><i class="fas fa-comment-dots"></i><p>لا توجد استشارات سابقة.</p><span>ابدأ بطرح أول سؤال لك وسيقوم أطباؤنا بالرد عليك.</span></div>`;
        return;
    }
    if (countBadge) countBadge.innerText = consults.length;
    if (list) list.innerHTML = consults.map(c => { const isAnswered = c.answer && c.answer.trim() !== ""; return `<div class="consult-card ${isAnswered ? 'answered' : 'pending'}"><div class="q-box"><span class="label">سؤالك:</span><p class="q-text">${c.question}</p></div>${isAnswered ? `<div class="a-box"><span class="label">رد الاستشاري المسؤول:</span><p class="a-text">${c.answer}</p></div>` : ''}<div class="status-footer"><span class="time-tag"><i class="far fa-clock"></i> ${new Date(c.created_at).toLocaleDateString('ar-YE')}</span>${isAnswered ? `<span class="status-tag done"><i class="fas fa-check-circle"></i> تم الرد</span>` : `<span class="status-tag waiting"><i class="fas fa-hourglass-half"></i> بانتظار الرد...</span>`}</div></div>`; }).join('');
}

// ==========================================
// 4. دوال الإدارة العامة
// ==========================================

window.backToAdminMain = function() {
    document.getElementById('admin-dashboard-main').style.display = 'none';
    document.getElementById('doctor-panel').style.display = 'block';
    document.getElementById('pharmacist-panel').style.display = 'none';
    document.getElementById('doctor-main-dashboard').style.display = 'block';
    document.getElementById('doctor-patients-list-screen').style.display = 'none';
    document.getElementById('doctor-patient-detail-screen').style.display = 'none';
    document.getElementById('doctor-consults-list-screen').style.display = 'none';
    document.getElementById('doctor-consult-detail-screen').style.display = 'none';
    updateDoctorDashboardStats();
};

async function loadInventory() {
    const container = document.getElementById('inventory-cards-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل المخزون...</div>';
    try {
        const { data: inventory, error } = await supabase.from('pharmacy_inventory').select('*').order('med_name');
        if (error) throw error;
        if (!inventory || inventory.length === 0) { container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px;">📦 لا توجد أدوية في المخزون</div>'; return; }
        container.innerHTML = inventory.map(item => `<div class="med-card ${item.quantity < 10 ? 'low-stock' : ''}"><div class="med-info"><h4><i class="fas fa-capsules"></i> ${item.med_name}</h4><p>الكمية المتوفرة: <span class="${item.quantity < 5 ? 'text-danger' : ''}">${item.quantity}</span> ${item.unit || 'حبة'}</p><div class="price-tag">${item.price || 'غير محدد'} ريال</div></div><div class="med-actions"><button onclick="updateStock('${item.id}', ${item.quantity + 1})" title="إضافة"><i class="fas fa-plus"></i></button><button onclick="updateStock('${item.id}', ${item.quantity - 1})" title="خصم" ${item.quantity <= 0 ? 'disabled' : ''}><i class="fas fa-minus"></i></button></div></div>`).join('');
    } catch (error) { console.error("خطأ في تحميل المخزون:", error); container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #ef4444;">❌ خطأ في تحميل المخزون</div>'; }
}

window.updateStock = async function(id, newQuantity) {
    if (newQuantity < 0) { showToast("الكمية لا يمكن أن تكون أقل من صفر", "error"); return; }
    const { error } = await supabase.from('pharmacy_inventory').update({ quantity: newQuantity }).eq('id', id);
    if (error) showToast("خطأ في تحديث المخزون", "error");
    else { showToast("تم تحديث المخزون", "success"); loadInventory(); }
};

async function loadPrescriptionsForPharmacist() {
    const container = document.getElementById('prescriptions-cards-container');
    if (!container) return;
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الوصفات...</div>';
    try {
        const { data: prescriptions, error } = await supabase
            .from('medical_records')
            .select(`
                id,
                prescribed_meds,
                diagnosis,
                created_at,
                patients(id, name, phone),
                doctors(id, name)
            `)
            .not('prescribed_meds', 'is', null)
            .is('dispensed', false)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        if (!prescriptions || prescriptions.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px;">📦 لا توجد وصفات طبية حالياً</div>';
            return;
        }
        
        container.innerHTML = prescriptions.map(p => {
            const medsList = Array.isArray(p.prescribed_meds) ? p.prescribed_meds.join(' ، ') : (p.prescribed_meds || 'لا توجد أدوية');
            const patientName = p.patients?.name || 'غير معروف';
            const patientPhone = p.patients?.phone || 'غير متوفر';
            const doctorName = p.doctors?.name || 'غير محدد';
            const date = new Date(p.created_at).toLocaleDateString('ar-EG');
            const time = new Date(p.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'});
            
            return `<div class="prescription-card" style="animation: fadeIn 0.4s ease forwards;">
                <div class="card-info">
                    <p style="font-size: 0.75rem; color: var(--primary); font-weight: bold;">
                        <i class="far fa-clock"></i> ${time} - ${date}
                    </p>
                    <h4><i class="fas fa-user-medical"></i> ${patientName}</h4>
                    <p><i class="fas fa-phone"></i> ${patientPhone}</p>
                    <p><i class="fas fa-user-md"></i> <strong>الطبيب:</strong> ${doctorName}</p>
                    <p><i class="fas fa-stethoscope"></i> <strong>التشخيص:</strong> ${p.diagnosis || 'غير محدد'}</p>
                    <div class="med-tag">
                        <i class="fas fa-prescription-bottle-alt"></i> 
                        <strong>الأدوية:</strong> ${medsList}
                    </div>
                </div>
                <button class="nav-btn" style="width: 100%; margin-top: 15px; font-size: 0.8rem; height: 40px;" onclick="markPrescriptionAsDispensed('${p.id}')">
                    <i class="fas fa-check-circle"></i> تم الصرف
                </button>
            </div>`;
        }).join('');
    } catch (error) {
        console.error("خطأ في تحميل الوصفات:", error);
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #ef4444;">❌ خطأ في تحميل الوصفات</div>';
    }
}

window.markPrescriptionAsDispensed = async (prescriptionId) => {
    try {
        const { error } = await supabase.from('medical_records').update({ dispensed: true, dispensed_at: new Date().toISOString() }).eq('id', prescriptionId);
        if (error) throw error;
        showToast("✅ تم صرف الوصفة بنجاح", "success");
        loadPrescriptionsForPharmacist();
    } catch (error) { console.error("خطأ في صرف الوصفة:", error); showToast("❌ حدث خطأ أثناء صرف الوصفة", "error"); }
};

// ==========================================
// 5. دوال الصيدلي
// ==========================================

window.showPharmacistPanel = function() {
    document.getElementById('admin-dashboard-main').style.display = 'none';
    document.getElementById('doctor-panel').style.display = 'none';
    document.getElementById('pharmacist-panel').style.display = 'block';
    document.getElementById('inventory-panel').style.display = 'none';
    loadPrescriptionsForPharmacist();
};

// ==========================================
// 6. دوال التشغيل والتهيئة
// ==========================================

function updateSubSpecialties() {
    const mainCat = document.getElementById('main-category');
    const subCat = document.getElementById('service-type');
    if (!mainCat || !subCat) return;
    
    subCat.innerHTML = '<option value="">اختر التخصص الدقيق...</option>';
    if(mainCat.value && hospitalData[mainCat.value]) {
        hospitalData[mainCat.value].forEach(item => {
            let opt = document.createElement('option');
            opt.value = item;
            opt.innerHTML = item;
            subCat.appendChild(opt);
        });
    }
    
    // تحديث قائمة الأطباء عند تغيير القسم أو التخصص
    updateDoctorsList();
}

function switchPortalTab(tabId, event) {
    document.querySelectorAll('.p-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    const targetPane = document.getElementById('portal-' + tabId);
    if (targetPane) targetPane.classList.add('active');
}

function toggleFaq(el) {
    const item = el.parentElement;
    const answer = item.querySelector('.faq-answer');
    const isActive = item.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach(otherItem => {
        if (otherItem !== item) {
            otherItem.classList.remove('active');
            const otherAnswer = otherItem.querySelector('.faq-answer');
            if (otherAnswer) otherAnswer.style.maxHeight = null;
        }
    });
    if (isActive) {
        item.classList.remove('active');
        if (answer) answer.style.maxHeight = null;
    } else {
        item.classList.add('active');
        if (answer) answer.style.maxHeight = answer.scrollHeight + "px";
    }
}

function resetBookingForm() {
    document.getElementById('appointmentForm').reset();
    currentStep = 0;
    updateStepper();
    document.getElementById('pTime').value = "";
    document.getElementById('timeSlotsContainer').innerHTML = "";
    if (typeof render === 'function') render();
}

async function closeSuccessModal() {
    document.getElementById('successModal').style.display = 'none';
    showSection('home');
}

async function del(id) {
    appointmentToDeleteId = id;
    document.getElementById('deleteConfirmModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

window.renderAdminUI = function(isLoggedIn) {
    const loginForm = document.getElementById('adminLoginForm');
    const dashboard = document.getElementById('adminDashboard');
    const loginBtn = document.querySelector('#adminLoginForm .nav-btn');
    if (isLoggedIn) {
        loginForm.style.display = 'none';
        dashboard.style.display = 'block';
        render();
        loadPatientsList();
        loadInventoryApple();
    } else {
        loginForm.style.display = 'block';
        dashboard.style.display = 'none';
        if (loginBtn) { loginBtn.disabled = false; loginBtn.innerHTML = `دخول`; }
        if (document.getElementById('adminEmail')) document.getElementById('adminEmail').value = "";
        if (document.getElementById('adminPass')) document.getElementById('adminPass').value = "";
    }
};

function render() {
    loadAppointmentsFromFirebase().then(async list => {
        const query = document.getElementById('adminSearch').value.toLowerCase();
        const filter = document.getElementById('adminFilter').value;
        const container = document.getElementById('cardContainer');
        const today = new Date().toISOString().split('T')[0];
        
        document.getElementById('totalCount').innerText = list.length;
        document.getElementById('todayCount').innerText = list.filter(i => i.date === today).length;
        
        // جلب أسماء الأطباء
        const doctorIds = [...new Set(list.map(item => item.doctor_id).filter(id => id))];
        let doctorsMap = {};
        if (doctorIds.length > 0) {
            const { data: doctors } = await supabase
                .from('doctors')
                .select('id, name')
                .in('id', doctorIds);
            
            if (doctors) {
                doctors.forEach(doc => { doctorsMap[doc.id] = doc.name; });
            }
        }
        
        const filtered = list.filter(item => {
            const matchesSearch = (item.name && item.name.toLowerCase().includes(query)) ||
                                 (item.phone && item.phone.includes(query));
            const matchesFilter = filter === 'all' ||
                                 (item.service && item.service.includes(filter));
            return matchesSearch && matchesFilter;
        });
        
        if (filtered.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:50px;">لا توجد مواعيد</div>`;
            return;
        }
        
        container.innerHTML = filtered.map(item => {
            const isUpcoming = new Date(item.date) >= new Date(today);
            const doctorName = item.doctor_id ? (doctorsMap[item.doctor_id] || 'غير محدد') : 'غير محدد';
            
            return `<div class="booking-card" style="border-top: 5px solid ${isUpcoming ? 'var(--success)' : '#cbd5e1'}">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <b>${item.name || 'غير معروف'}</b>
                    <button onclick="del('${item.id}')" class="delete-btn"><i class="fas fa-trash"></i></button>
                </div>
                <p><i class="fas fa-stethoscope"></i> ${item.service || 'غير محدد'}</p>
                <p><i class="fas fa-user-md"></i> الدكتور: ${doctorName}</p>
                <p><i class="fas fa-calendar-alt"></i> ${item.fullDate || item.date || 'غير محدد'}</p>
                <p dir="ltr" style="text-align:right;"><i class="fas fa-phone"></i> ${item.phone || 'غير متوفر'}</p>
                <small style="color: var(--primary);"><i class="fas fa-cloud"></i> محفوظ في Supabase</small>
            </div>`;
        }).join('');
    }).catch(error => {
        console.error("خطأ في تحميل المواعيد:", error);
        document.getElementById('cardContainer').innerHTML = `<div style="text-align:center; padding:50px;">خطأ في تحميل البيانات</div>`;
    });
}

function exportToCSV() {
    const list = JSON.parse(localStorage.getItem('clinic_data')) || [];
    if(list.length === 0) return showToast("لا توجد حجوزات!", "error");
    let csv = "الاسم,الهاتف,العيادة,الموعد\n";
    list.forEach(i => csv += `${i.name},${i.phone},${i.service},${i.fullDate}\n`);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "حجوزات_مستشفى_المغلس.csv";
    link.click();
}

function showToast(msg, type="success", customColor=null) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.style.display = "block";
    t.style.background = customColor ? customColor : (type === "success" ? "var(--success)" : "#ef4444");
    setTimeout(() => t.style.display = "none", 3000);
}

function handleSocialClick(element, type, url) {
    const isAlreadyActive = element.classList.contains('active-link');
    document.querySelectorAll('.social-item').forEach(item => item.classList.remove('active-link'));
    if (isAlreadyActive) { window.open(url, '_blank'); }
    else {
        element.classList.add('active-link');
        let msg = "انقر مرة أخرى للفتح";
        let color = "var(--secondary)";
        if(type === 'wa') { msg = "انقر مرة أخرى لفتح واتساب"; color = "#25D366"; }
        else if(type === 'ig') { msg = "انقر مرة أخرى لفتح إنستجرام"; color = "linear-gradient(45deg, #f09433, #dc2743, #bc1888)"; }
        else if(type === 'fb') { msg = "انقر مرة أخرى لفتح فيسبوك"; color = "#1877F2"; }
        showToast(msg, "success", color);
    }
}

function showSkeletonLoaders() { const container = document.getElementById('cardContainer'); if (!container) return; container.innerHTML = `<div class="skeleton-card"><div class="skeleton-line" style="width: 50%; height: 20px;"></div><div class="skeleton-line" style="width: 80%; height: 15px;"></div><div class="skeleton-line" style="width: 70%; height: 15px;"></div></div><div class="skeleton-card"><div class="skeleton-line" style="width: 50%; height: 20px;"></div><div class="skeleton-line" style="width: 80%; height: 15px;"></div><div class="skeleton-line" style="width: 70%; height: 15px;"></div></div>`; }

window.addEventListener('load', async () => { showSkeletonLoaders(); if (typeof window.loadAppointmentsFromFirebase === 'function') { await window.loadAppointmentsFromFirebase(); render(); } });

function generateRequestId() { return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9); }

window.sendConsultation = async function() {
    if (locks.consultation) { showToast("جاري معالجة استشارة سابقة، انتظر قليلاً", "error"); return; }
    const btn = document.getElementById('btnSendConsult');
    const questionInput = document.getElementById('consult-question');
    const phone = document.getElementById('consult-phone').value;
    const question = questionInput.value.trim();
    if (!question) { showToast("فضلاً، اكتب استشارتك أولاً لمساعدتك", "error"); questionInput.parentElement.style.borderColor = "#ef4444"; setTimeout(() => questionInput.parentElement.style.borderColor = "", 2000); return; }
    locks.consultation = true;
    const originalBtnContent = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري إرسال استشارتك...`;
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0.8";
    try {
        const { data, error } = await supabase.from('consultations').insert([{ patient_phone: phone, question: question, status: 'pending' }]);
        if (error) throw error;
        showToast("تم إرسال استشارتك بنجاح! سيصلك الرد قريباً", "success");
        questionInput.value = "";
        if (window.fetchFullPatientProfile) window.fetchFullPatientProfile(phone);
    } catch (err) { console.error("Consultation Error:", err.message); showToast("عذراً، حدث خطأ تقني: " + err.message, "error"); }
    finally { btn.innerHTML = originalBtnContent; btn.style.pointerEvents = "auto"; btn.style.opacity = "1"; locks.consultation = false; }
};

document.addEventListener('click', function(event) { const socialItems = document.querySelectorAll('.social-item'); socialItems.forEach(item => { if (!item.contains(event.target)) item.classList.remove('active-link'); }); });

function prepareReview() {
    if(!document.getElementById('pDate').value) return false;
    const mainCat = document.getElementById('main-category');
    const subCat = document.getElementById('service-type');
    const doctorSelect = document.getElementById('doctor-select');
    
    if (!mainCat.value || !subCat.value) {
        showToast("يرجى اختيار القسم والتخصص الدقيق", "error");
        return false;
    }
    if (!doctorSelect || !doctorSelect.value) {
        showToast("يرجى اختيار الدكتور", "error");
        return false;
    }
    
    // الحصول على اسم الدكتور المختار
    const selectedDoctor = doctorsList.find(doc => doc.id === doctorSelect.value);
    const doctorName = selectedDoctor ? selectedDoctor.name : 'غير محدد';
    
    document.getElementById('revName').innerText = document.getElementById('pName').value;
    document.getElementById('revPhone').innerText = document.getElementById('pPhone').value;
    document.getElementById('revService').innerText = `${mainCat.options[mainCat.selectedIndex].text} - ${subCat.value}`;
    document.getElementById('revDoctor').innerText = doctorName;
    document.getElementById('revDateTime').innerText = document.getElementById('pDate').value + " | " + document.getElementById('pTime').value;
    return true;
}

function validateSpecialtyAndNext(idx) {
    const mainCat = document.getElementById('main-category');
    const subCat = document.getElementById('service-type');
    const doctorSelect = document.getElementById('doctor-select');
    
    if (!mainCat.value) {
        showToast("لطفاً، اختر القسم الرئيسي أولاً", "error");
        mainCat.classList.add('shake');
        setTimeout(() => mainCat.classList.remove('shake'), 500);
        return;
    }
    if (!subCat.value) {
        showToast("لطفاً، اختر التخصص الدقيق", "error");
        subCat.classList.add('shake');
        setTimeout(() => subCat.classList.remove('shake'), 500);
        return;
    }
    if (!doctorSelect || !doctorSelect.value) {
        showToast("لطفاً، اختر الدكتور المناسب", "error");
        if (doctorSelect) doctorSelect.classList.add('shake');
        setTimeout(() => {
            if (doctorSelect) doctorSelect.classList.remove('shake');
        }, 500);
        return;
    }
    nextStep(idx);
}

function validateDateTimeAndNext(idx) {
    const dateInput = document.getElementById('pDate');
    const timeValue = document.getElementById('pTime').value;
    const mainCat = document.getElementById('main-category');
    const subCat = document.getElementById('service-type');
    const doctorSelect = document.getElementById('doctor-select');
    if (!dateInput.value) { dateInput.classList.add('shake'); setTimeout(() => dateInput.classList.remove('shake'), 500); showToast("لطفاً، اختر تاريخ الموعد أولاً", "error"); return; }
    if (!timeValue) { const slots = document.getElementById('timeSlotsContainer'); slots.classList.add('shake'); setTimeout(() => slots.classList.remove('shake'), 500); showToast("لطفاً، حدد الوقت المناسب لك", "error"); return; }
    let rawPhone = document.getElementById('pPhone').value.replace(/\D/g, '');
    if (rawPhone.startsWith('0')) rawPhone = rawPhone.substring(1);
    let countryCode = '967';
    try { if (window.itiBooking && typeof window.itiBooking.getSelectedCountryData === 'function') countryCode = window.itiBooking.getSelectedCountryData().dialCode; } catch(e) {}
    const internationalPhone = '+' + countryCode + rawPhone;
    document.getElementById('revName').innerText = document.getElementById('pName').value;
    document.getElementById('revPhone').innerText = internationalPhone;
    document.getElementById('revService').innerText = `${mainCat.options[mainCat.selectedIndex].text} - ${subCat.value}`;
    if (!doctorSelect || !doctorSelect.value) {
    showToast("لطفاً، اختر الدكتور المناسب", "error");
    return;
}

const selectedOption =
    doctorSelect.options[doctorSelect.selectedIndex];

const doctorName =
    selectedOption.textContent
        .split(' - ')[0]
        .trim();

document.getElementById('revDoctor').innerText =
    doctorName;

selectedDoctorId = doctorSelect.value;
    document.getElementById('revDateTime').innerText = dateInput.value + " | " + timeValue;
    currentStep = idx;
    updateStepper();
}

function setupPatientRealtime(phone) {
    if (realtimeManager.currentPatient === phone && realtimeManager.patientChannel) return;
    if (realtimeManager.patientChannel) { realtimeManager.patientChannel.unsubscribe(); supabase.removeChannel(realtimeManager.patientChannel); }
    realtimeManager.currentPatient = phone;
    realtimeManager.patientChannel = supabase.channel(`patient-${phone}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'consultations', filter: `patient_phone=eq.${phone}` }, async (payload) => { if (processedEvents.has(payload.new.id)) return; if (payload.new.id === lastUpdateId) return; processedEvents.add(payload.new.id); lastUpdateId = payload.new.id; if (payload.new.answer) { const { data: updatedConsults } = await supabase.from('consultations').select('id, answer, created_at, question, status').eq('patient_phone', phone).order('created_at', { ascending: false }); renderConsultations(updatedConsults); showToast("✅ وصلك رد جديد من الطبيب", "success"); } }).subscribe();
}

function setupDoctorRealtime() { if (realtimeManager.doctorChannel) return; realtimeManager.doctorChannel = supabase.channel('doctor-consultations').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'consultations' }, payload => { if (document.getElementById('doctor-panel').style.display === 'block') { loadPendingConsultations(); showToast("لديك استشارة طبية جديدة بحاجة للرد!", "info"); } }).subscribe(); }

function setupPharmacyRealtime() { if (realtimeManager.pharmacyChannel) return; realtimeManager.pharmacyChannel = supabase.channel('pharmacy-records').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'medical_records' }, payload => { if (payload.new.prescribed_meds && document.getElementById('pharmacist-panel').style.display === 'block') { loadPrescriptionsForPharmacist(); showToast("وصفة طبية جديدة واردة إلى الصيدلية", "info"); } }).subscribe(); }

// دوال تهيئة الهاتف
function initLuxuryPhone() { const input = document.querySelector("#pPhone"); if (!input) return; const arabicCountries = ["ye","sa","ae","eg","qa","kw","om","bh","jo","lb","ps","iq","sy","ma","dz","tn","ly","sd","so","dj","km","mr"]; window.itiBooking = window.intlTelInput(input, { initialCountry: "ye", onlyCountries: arabicCountries, separateDialCode: true, autoPlaceholder: "aggressive", formatOnDisplay: true, dropdownContainer: document.body, utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@28.1.0/build/js/utils.js" }); input.addEventListener("countrychange", function() { input.placeholder = window.itiBooking.getPlaceholder(); }); }

function initPatientPhone() { const phoneInput = document.querySelector("#patientPhone"); if (!phoneInput) return; const arabicCountries = ["ye","sa","ae","eg","qa","kw","om","bh","jo","lb","ps","iq","sy","ma","dz","tn","ly","sd","so","dj","km","mr"]; itiPatient = window.intlTelInput(phoneInput, { initialCountry: "ye", onlyCountries: arabicCountries, separateDialCode: true, allowDropdown: true, autoPlaceholder: "polite", placeholderNumberType: "MOBILE", preferredCountries: ["ye","sa","ae","eg"], utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@28.1.0/build/js/utils.js" }); }

window.checkPatientLogin = async function() {
    const btn = document.getElementById('patientLoginBtn');
    const phoneInput = document.getElementById('patientPhone');
    const loginContainer = document.getElementById('patient-login-container');
    const portalContainer = document.getElementById('patient-main-portal');
    if (!phoneInput || !btn) { showToast("❌ خطأ داخلي", "error"); return; }
    let rawPhone = phoneInput.value.replace(/\D/g, '');
    if (rawPhone.startsWith('0')) rawPhone = rawPhone.substring(1);
    const yemeniRegex = /^(70|71|73|77|78)\d{7}$/;
    if (!yemeniRegex.test(rawPhone) && !rawPhone.startsWith('967')) { showToast("❌ رقم الهاتف غير صحيح", "error"); phoneInput.classList.add('shake'); setTimeout(() => phoneInput.classList.remove('shake'), 500); return; }
    let formattedPhone = rawPhone;
    if (!formattedPhone.startsWith('967')) formattedPhone = '+967' + rawPhone;
    else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;
    btn.disabled = true;
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> جاري التحميل...`;
    try {
        const { data: patients, error: checkError } = await supabase.from('patients').select('*').eq('phone', formattedPhone);
        if (checkError) throw checkError;
        if (!patients || patients.length === 0) { showToast("⚠️ هذا الرقم غير مسجل", "error"); return; }
        if (typeof window.fetchFullPatientProfile === 'function') await window.fetchFullPatientProfile(formattedPhone);
        loginContainer.style.display = 'none';
        portalContainer.style.display = 'block';
        showToast("✅ تم تحميل ملفك الطبي", "success");
    } catch (error) { showToast(`❌ خطأ تقني: ${error.message}`, "error"); }
    finally { btn.disabled = false; btn.innerHTML = originalBtnText; }
};

window.logoutPortal = function() {
    const loginContainer = document.getElementById('patient-login-container');
    const portalContainer = document.getElementById('patient-main-portal');
    const phoneInput = document.getElementById('patientPhone');
    if (loginContainer) loginContainer.style.display = 'block';
    if (portalContainer) portalContainer.style.display = 'none';
    if (phoneInput) phoneInput.value = '';
    if (itiPatient) { try { itiPatient.destroy(); } catch(e) {} }
    initPatientPhone();
    showToast("تم تسجيل الخروج", "success");
};

function validateAndNext(idx) {
    const name = document.getElementById('pName');
    const phoneInput = document.getElementById('pPhone');
    if (!name.checkValidity()) { name.reportValidity(); return; }
    if (!window.itiBooking) { showToast("مكتبة الهاتف لم تجهز بعد", "error"); return; }
    let isValid = false;
    try { isValid = window.itiBooking.isValidNumber(); } catch(e) { const rawPhone = phoneInput.value.replace(/\D/g, ''); isValid = rawPhone.length >= 7 && rawPhone.length <= 15; }
    if (isValid) { phoneInput.style.borderColor = "#f1f5f9"; nextStep(idx); }
    else { phoneInput.style.borderColor = "#ef4444"; showToast("رقم الهاتف غير صحيح", "error"); }
}

function nextStep(idx) { if(idx === 3) prepareReview(); currentStep = idx; updateStepper(); }
function prevStep(idx) { currentStep = idx; updateStepper(); }
function updateStepper() { const steps = document.querySelectorAll(".form-step"); steps.forEach((s, i) => s.classList.toggle("active", i === currentStep)); for(let i=1; i<=4; i++) { const circle = document.getElementById('s'+i); if(circle) { circle.classList.toggle('active', (i-1) === currentStep); circle.classList.toggle('completed', (i-1) < currentStep); } } document.getElementById("progressFill").style.width = (currentStep / 3 * 100) + "%"; }

const form = document.getElementById('appointmentForm');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalContent = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-circle-notch spinner-icon"></i> جاري تأكيد حجزك...`;
    const mainCat = document.getElementById('main-category');
    const subCat = document.getElementById('service-type');
    const mainDeptText = mainCat.options[mainCat.selectedIndex].text;
    const subDeptText = subCat.value;
    let rawPhone = document.getElementById('pPhone').value.replace(/\D/g, '');
    if (rawPhone.startsWith('0')) rawPhone = rawPhone.substring(1);
    let countryCode = '967';
    try { if (window.itiBooking && typeof window.itiBooking.getSelectedCountryData === 'function') countryCode = window.itiBooking.getSelectedCountryData().dialCode; } catch(e) {}
    const internationalPhone = '+' + countryCode + rawPhone;
    const appointmentData = { name: document.getElementById('pName').value, phone: internationalPhone, department: mainCat.options[mainCat.selectedIndex].text, service: subDeptText, mainDept: mainCat.value, date: document.getElementById('pDate').value, fullDate: document.getElementById('pDate').value + " (" + document.getElementById('pTime').value + ")" };
    try { if (typeof window.saveAppointmentToFirebase === 'function') { const realDocId = await window.saveAppointmentToFirebase(appointmentData); if(realDocId && realDocId !== "duplicate_handled") { await window.loadAppointmentsFromFirebase(); if(typeof confetti !== 'undefined') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#0284c7', '#10b981', '#FFD700'] }); document.getElementById('successModal').style.display = 'flex'; showToast(`تم تسجيل موعدك بنجاح في ${mainDeptText} - تخصص ${subDeptText}`, "success"); resetBookingForm(); } else if(realDocId === "duplicate_handled") { showToast("تم معالجة طلبك بنجاح", "success"); resetBookingForm(); } } } catch (error) { showToast("❌ حدث خطأ، حاول مرة أخرى", "error"); } finally { submitBtn.disabled = false; submitBtn.innerHTML = originalContent; }
});

function toggleDarkMode() { const body = document.body; const btn = document.getElementById('darkModeBtn'); body.classList.toggle('dark-mode'); btn.innerHTML = body.classList.contains('dark-mode') ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>'; localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light'); }

const todayLimit = new Date().toISOString().split('T')[0];
document.getElementById('pDate').setAttribute('min', todayLimit);

window.showSection = function(sectionId) {
    // Only switch the site's top-level pages. Never hide nested sections/components inside them.
    document.querySelectorAll('body > section').forEach(sec => { sec.classList.remove('active'); sec.style.display = 'none'; });
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
        document.querySelectorAll('.nav-links li a, .nav-item').forEach(item => item.classList.remove('active'));
        if (sectionId === 'home') document.getElementById('nav-home')?.classList.add('active');
        else if (sectionId === 'book') document.getElementById('nav-book')?.classList.add('active');
        else if (sectionId === 'patient-dashboard') document.getElementById('nav-dashboard')?.classList.add('active');
        else if (sectionId === 'health') document.getElementById('nav-health')?.classList.add('active');
        if (sectionId === 'book') initTimeSlots();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

function initTimeSlots() { const container = document.getElementById('timeSlotsContainer'); const selectedDate = document.getElementById('pDate').value; const currentService = document.getElementById('service-type').value; if(!container) return; loadAppointmentsFromFirebase().then(list => { container.innerHTML = times.map(t => { const isTaken = list.some(item => item.date === selectedDate && item.fullDate.includes(t) && item.service === currentService); return isTaken ? `<div class="time-slot disabled">${t}</div>` : `<div class="time-slot" onclick="selectTime(this, '${t}')">${t}</div>`; }).join(''); }); }
function selectTime(el, t) { if(el.classList.contains('disabled')) return; document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected')); el.classList.add('selected'); document.getElementById('pTime').value = t; }
function validateBookingDate(input) { const selected = new Date(input.value); if(selected.getDay() === 5) { showToast("المستشفى مغلقة يوم الجمعة، يرجى اختيار يوم آخر", "error"); input.value = ""; return; } initTimeSlots(); document.getElementById('pTime').value = ""; }

window.filterAppointments = function(filter) { document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active')); event.currentTarget.classList.add('active'); const filterSelect = document.getElementById('adminFilter'); if (filter === 'all') filterSelect.value = 'all'; else if (filter === 'باطنية') filterSelect.value = 'باطنية عامة'; else if (filter === 'جراحة') filterSelect.value = 'جراحة عامة'; else if (filter === 'أطفال') filterSelect.value = 'أطفال وحديثي ولادة'; else if (filter === 'قلب') filterSelect.value = 'أمراض القلب'; render(); };

async function loadPatientsList() {
    const container = document.getElementById('patients-list');
    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل المرضى...</div>';
    try {
        const { data: patients, error } = await supabase.from('patients').select(`id,name,phone,created_at,appointments(appointment_date, service_type)`).order('created_at', { ascending: false });
        if (error) throw error;
        if (!patients || patients.length === 0) { container.innerHTML = '<div class="empty-msg">لا يوجد مرضى مسجلين</div>'; return; }
        container.innerHTML = patients.map(p => { const lastAppointment = p.appointments && p.appointments.length > 0 ? p.appointments[0] : null; return `<div class="patient-item" onclick="showPatientRecords('${p.id}', '${p.name}')"><div><strong><i class="fas fa-user-circle"></i> ${p.name}</strong><p><i class="fas fa-phone"></i> ${p.phone}</p>${lastAppointment ? `<p><small><i class="fas fa-calendar-alt"></i> آخر موعد: ${lastAppointment.appointment_date}</small></p>` : ''}</div><i class="fas fa-chevron-left"></i></div>`; }).join('');
    } catch (error) { console.error("خطأ في تحميل المرضى:", error); container.innerHTML = '<div class="empty-msg">خطأ في تحميل البيانات</div>'; }
}

window.showPatientRecords = async function(patientId, patientName) {
    document.getElementById('selected-patient-name').innerText = patientName;
    document.getElementById('selected-patient-id').value = patientId;
    const { data: records, error } = await supabase.from('medical_records').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
    const container = document.getElementById('patient-records-list');
    if (!records || records.length === 0) container.innerHTML = '<p class="empty-msg">لا توجد سجلات سابقة</p>';
    else container.innerHTML = records.map(r => `<div class="record-summary"><small>${new Date(r.created_at).toLocaleDateString('ar-EG')}</small><p><strong>التشخيص:</strong> ${r.diagnosis || 'غير محدد'}</p></div>`).join('');
    document.getElementById('doctor-subpanel').style.display = 'block';
};

window.saveMedicalRecord = async function() {
    const patientId = document.getElementById('selected-patient-id').value;
    const diagnosis = document.getElementById('diagnosis-input').value;
    const prescribedMeds = document.getElementById('meds-input').value;
    const labResults = document.getElementById('lab-input').value;
    if (!diagnosis && !prescribedMeds && !labResults) { showToast("أدخل بيانات السجل الطبي على الأقل", "error"); return; }
    const medsArray = prescribedMeds ? prescribedMeds.split(',').map(med => med.trim()) : [];
    const { error } = await supabase.from('medical_records').insert([{ patient_id: patientId, diagnosis: diagnosis, prescribed_meds: medsArray, lab_results: labResults, doctor_name: 'أحمد المغلس' }]);
    if (error) showToast("خطأ في حفظ السجل", "error");
    else { showToast("تم حفظ السجل الطبي بنجاح", "success"); document.getElementById('diagnosis-input').value = ''; document.getElementById('meds-input').value = ''; document.getElementById('lab-input').value = ''; showPatientRecords(patientId, document.getElementById('selected-patient-name').innerText); showToast("تم إرسال الوصفة الطبية للصيدلية", "success"); }
};

async function loadPendingConsultations() {
    const { data: consultations, error } = await supabase.from('consultations').select('*').is('answer', null).order('created_at', { ascending: false });
    if (error) { showToast("خطأ في تحميل الاستشارات", "error"); return; }
    const container = document.getElementById('pending-consultations-list');
    if (!consultations || consultations.length === 0) container.innerHTML = '<p class="empty-msg">لا توجد استشارات جديدة.</p>';
    else container.innerHTML = consultations.map(con => `<div class="consultation-item" id="consult-${con.id}"><p><strong>من:</strong> ${con.patient_phone}</p><p><strong>السؤال:</strong> ${con.question}</p><textarea id="answer-${con.id}" placeholder="أدخل الرد هنا..." rows="3"></textarea><button class="nav-btn" onclick="submitConsultationAnswer('${con.id}')">إرسال الرد</button></div>`).join('');
}

window.submitConsultationAnswer = async function(consultationId) {
    const answer = document.getElementById(`answer-${consultationId}`).value;
    if (!answer) { showToast("يرجى كتابة الرد أولاً", "error"); return; }
    const { error } = await supabase.from('consultations').update({ answer: answer }).eq('id', consultationId);
    if (error) showToast("خطأ في حفظ الرد", "error");
    else { showToast("تم إرسال الرد بنجاح", "success"); document.getElementById(`consult-${consultationId}`).remove(); }
};

// ==========================================
// 7. دوال الدكتور - التصميم الكامل
// ==========================================

window.loadDoctorsPatientsListUI = async function() {
    const container = document.getElementById('doctor-patients-list-container');
    if(!container) return;
    container.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    try {
        const { data: patients, error } = await supabase.from('patients').select('id, name, phone, created_at').order('created_at', { ascending: false });
        if(error) throw error;
        if(patients.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px;">لا يوجد مرضى</div>'; return; }
        document.getElementById('doctor-patients-count-header').innerText = patients.length;
        
        const { data: appointments } = await supabase.from('appointments').select('patient_id, appointment_date');
        const aptMap = {};
        if(appointments) {
            appointments.forEach(apt => {
                if(!aptMap[apt.patient_id] || apt.appointment_date > aptMap[apt.patient_id]) aptMap[apt.patient_id] = apt.appointment_date;
            });
        }
        
        container.innerHTML = patients.map(p => {
            const lastApt = aptMap[p.id] || 'لا يوجد';
            return `
            <div class="modern-patient-card" onclick="openPatientDetailScreen('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.phone}')">
                <div class="patient-avatar-mini"><i class="fas fa-user"></i></div>
                <div class="patient-info-mini">
                    <h4>${p.name}</h4>
                    <p><i class="fas fa-phone-alt"></i> ${p.phone} <span class="last-visit-badge"><i class="fas fa-calendar-alt"></i> ${lastApt}</span></p>
                </div>
                <i class="fas fa-chevron-left" style="color: var(--primary);"></i>
            </div>`;
        }).join('');
        
        const searchInput = document.getElementById('doctor-patients-search');
        if(searchInput) {
            searchInput.oninput = (e) => {
                const val = e.target.value.toLowerCase();
                const filtered = patients.filter(p => p.name.toLowerCase().includes(val) || p.phone.includes(val));
                container.innerHTML = filtered.map(p => `<div class="modern-patient-card" onclick="openPatientDetailScreen('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.phone}')"><div class="patient-avatar-mini"><i class="fas fa-user"></i></div><div class="patient-info-mini"><h4>${p.name}</h4><p>${p.phone}</p></div><i class="fas fa-chevron-left"></i></div>`).join('');
            };
        }
    } catch(e) { container.innerHTML = '<div style="text-align:center; padding:40px;">خطأ في التحميل</div>'; }
};

window.openPatientDetailScreen = async function(id, name, phone) {
    currentDoctorPatientIdDetail = id;
    appleMedsList = [];
    appleLabList = [];
    
    document.getElementById('doctor-patients-list-screen').style.display = 'none';
    document.getElementById('doctor-patients-list-screen').classList.add('hidden');
    
    const detailScreen = document.getElementById('doctor-patient-detail-screen');
    detailScreen.style.display = 'block';
    detailScreen.classList.remove('hidden');
    detailScreen.style.animation = 'none';
    void detailScreen.offsetHeight;
    detailScreen.style.animation = 'slideUp .5s ease';
    
    document.getElementById('detail-patient-name').innerText = name;
    document.getElementById('detail-patient-phone').innerText = phone;
    
    const { data: records } = await supabase.from('medical_records').select('*').eq('patient_id', id).order('created_at', { ascending: false });
    
    let totalPrescriptions = 0;
    let totalLab = 0;
    let lastVisit = 'لا توجد';
    
    if (records && records.length > 0) {
        records.forEach(r => {
            if (r.prescribed_meds?.length > 0) totalPrescriptions++;
            if (r.lab_results) totalLab++;
        });
        const sorted = [...records].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        if (sorted[0]?.created_at) {
            lastVisit = new Date(sorted[0].created_at).toLocaleDateString('ar-EG');
        }
    }
    
    document.getElementById('detail-total-records').innerText = records?.length || 0;
    document.getElementById('detail-total-prescriptions').innerText = totalPrescriptions;
    document.getElementById('detail-total-lab').innerText = totalLab;
    document.getElementById('detail-last-visit').innerText = lastVisit;
    
    document.getElementById('show-history-apple').onclick = () => showAppleHistory(id);
    
    updateAppleMeds();
    updateAppleLab();
    
    document.getElementById('doctor-diagnosis-input-detail').value = '';
};

window.backToPatientsList = function() {
    document.getElementById('doctor-patient-detail-screen').style.display = 'none';
    document.getElementById('doctor-patient-detail-screen').classList.add('hidden');
    
    const listScreen = document.getElementById('doctor-patients-list-screen');
    listScreen.classList.remove('hidden');
    listScreen.style.display = 'block';
    listScreen.style.animation = 'none';
    void listScreen.offsetHeight;
    listScreen.style.animation = 'slideUp .5s ease';
    
    loadDoctorsPatientsListUI();
};

window.showAppleHistory = async function(patientId) {
    const panel = document.getElementById('history-panel-apple');
    if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = 'block';
    panel.innerHTML = '<div style="text-align:center; padding:40px; color: #8E8E93;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    
    const { data: records } = await supabase.from('medical_records').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
    
    if (!records || records.length === 0) {
        panel.innerHTML = `
            <div style="background: #F9F9FB; border-radius: 16px; padding: 24px; text-align: center;">
                <i class="fas fa-notes-medical" style="font-size: 32px; color: #C6C6C8; margin-bottom: 12px; display: block;"></i>
                <p style="color: #8E8E93; margin: 0;">لا توجد سجلات طبية سابقة</p>
                <button onclick="document.getElementById('history-panel-apple').style.display='none'" style="margin-top: 16px; background: #007AFF; border: none; padding: 8px 20px; border-radius: 30px; color: white; font-weight: 500; cursor: pointer;">إخفاء</button>
            </div>
        `;
        return;
    }
    
    panel.innerHTML = `
        <div style="background: #F9F9FB; border-radius: 16px; padding: 20px; border: 1px solid #E5E5EA;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #E5E5EA;">
                <h3 style="font-size: 17px; font-weight: 600; margin: 0; color: #1D1D1F;"><i class="fas fa-notes-medical" style="color: #007AFF;"></i> السجل الطبي</h3>
                <button onclick="document.getElementById('history-panel-apple').style.display='none'" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #8E8E93;">✕</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; max-height: 400px; overflow-y: auto;">
                ${records.map(r => `
                    <div style="background: #FFFFFF; border-radius: 14px; padding: 16px 20px; border: 1px solid rgba(0,0,0,0.03);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: #8E8E93;">
                            <span><i class="far fa-calendar-alt"></i> ${new Date(r.created_at).toLocaleDateString('ar-EG')}</span>
                            <span><i class="fas fa-user-md"></i> د. ${r.doctor_name || 'أحمد المغلس'}</span>
                        </div>
                        ${r.diagnosis ? `<div style="margin-bottom: 6px;"><strong style="color: #1D1D1F;">التشخيص:</strong> <span style="color: #1D1D1F;">${escapeHtml(r.diagnosis)}</span></div>` : ''}
                        ${r.prescribed_meds?.length ? `<div style="margin-bottom: 6px;"><strong style="color: #1D1D1F;">الأدوية:</strong> <span style="color: #1D1D1F;">${r.prescribed_meds.join('، ')}</span></div>` : ''}
                        ${r.lab_results ? `<div><strong style="color: #1D1D1F;">المختبر:</strong> <span style="color: #1D1D1F;">${escapeHtml(r.lab_results)}</span></div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
};

window.addMedicineToCurrentDetail = function() {
    const name = document.getElementById('new-med-name-detail')?.value.trim();
    const dose = document.getElementById('new-med-dose-detail')?.value.trim();
    const duration = document.getElementById('new-med-duration-detail')?.value.trim();
    if (!name) { showToast("يرجى إدخال اسم الدواء", "error"); return; }
    let med = name;
    if (dose) med += ` - ${dose}`;
    if (duration) med += ` (${duration})`;
    appleMedsList.push(med);
    updateAppleMeds();
    document.getElementById('new-med-name-detail').value = '';
    document.getElementById('new-med-dose-detail').value = '';
    document.getElementById('new-med-duration-detail').value = '';
};

function updateAppleMeds() {
    const container = document.getElementById('meds-list-apple');
    if (!container) return;
    if (appleMedsList.length === 0) {
        container.innerHTML = '<span style="color: #8E8E93; font-size: 14px;">لا توجد أدوية مضافة</span>';
        return;
    }
    container.innerHTML = appleMedsList.map((med, i) => `
        <span style="background: #F2F2F5; border-radius: 30px; padding: 8px 16px; font-size: 14px; display: inline-flex; align-items: center; gap: 10px; transition: all 0.15s ease;">
            <span>${escapeHtml(med)}</span>
            <i class="fas fa-times-circle" onclick="appleMedsList.splice(${i},1); updateAppleMeds(); document.getElementById('doctor-medicines-input-detail').value = appleMedsList.join(', ');" 
               style="color: #8E8E93; cursor: pointer; font-size: 12px;"></i>
        </span>
    `).join('');
    document.getElementById('doctor-medicines-input-detail').value = appleMedsList.join(', ');
}

function updateAppleLab() {
    const container = document.getElementById('lab-list-apple');
    if (!container) return;
    if (appleLabList.length === 0) {
        container.innerHTML = '<span style="color: #8E8E93; font-size: 14px;">لا توجد طلبات مختبر</span>';
        return;
    }
    container.innerHTML = appleLabList.map((test, i) => `
        <span style="background: #F2F2F5; border-radius: 30px; padding: 8px 16px; font-size: 14px; display: inline-flex; align-items: center; gap: 10px; transition: all 0.15s ease;">
            <span>${escapeHtml(test)}</span>
            <i class="fas fa-times-circle" onclick="appleLabList.splice(${i},1); updateAppleLab(); document.getElementById('doctor-lab-input-detail').value = appleLabList.join('، ');" 
               style="color: #8E8E93; cursor: pointer; font-size: 12px;"></i>
        </span>
    `).join('');
    document.getElementById('doctor-lab-input-detail').value = appleLabList.join('، ');
}

window.addLabTestToCurrentDetail = function() {
    const test = document.getElementById('new-lab-test-detail')?.value.trim();
    if (!test) { showToast("يرجى إدخال اسم الفحص", "error"); return; }
    appleLabList.push(test);
    updateAppleLab();
    document.getElementById('new-lab-test-detail').value = '';
};

window.savePatientRecordDetail = async function() {
    if (!currentDoctorPatientIdDetail) { showToast("لم يتم اختيار مريض", "error"); return; }
    const diagnosis = document.getElementById('doctor-diagnosis-input-detail')?.value || '';
    const meds = document.getElementById('doctor-medicines-input-detail')?.value || '';
    const lab = document.getElementById('doctor-lab-input-detail')?.value || '';
    
    if (!diagnosis && !meds && !lab) { showToast("أدخل بيانات السجل الطبي على الأقل", "error"); return; }
    
    const btn = document.getElementById('save-record-apple');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> جاري الحفظ...';
    btn.disabled = true;
    
    const medsArray = meds ? meds.split(',').map(m => m.trim()) : [];
    const { error } = await supabase.from('medical_records').insert({
        patient_id: currentDoctorPatientIdDetail,
        diagnosis: diagnosis,
        prescribed_meds: medsArray,
        lab_results: lab,
        doctor_name: 'أحمد المغلس'
    });
    
    if (error) {
        showToast("خطأ في حفظ السجل: " + error.message, "error");
    } else {
        showToast("✅ تم حفظ السجل الطبي بنجاح", "success");
        const name = document.getElementById('detail-patient-name').innerText;
        const phone = document.getElementById('detail-patient-phone').innerText;
        openPatientDetailScreen(currentDoctorPatientIdDetail, name, phone);
        document.getElementById('doctor-diagnosis-input-detail').value = '';
        appleMedsList = [];
        appleLabList = [];
        updateAppleMeds();
        updateAppleLab();
    }
    btn.innerHTML = originalText;
    btn.disabled = false;
};

window.showPatientsList = function() {
    document.getElementById('doctor-main-dashboard').style.display = 'none';
    document.getElementById('doctor-patients-list-screen').style.display = 'block';
    document.getElementById('doctor-patient-detail-screen').style.display = 'none';
    document.getElementById('doctor-consults-list-screen').style.display = 'none';
    document.getElementById('doctor-consult-detail-screen').style.display = 'none';
    loadDoctorsPatientsListUI();
};

window.showConsultsList = function() {
    document.getElementById('doctor-main-dashboard').style.display = 'none';
    document.getElementById('doctor-patients-list-screen').style.display = 'none';
    document.getElementById('doctor-patient-detail-screen').style.display = 'none';
    document.getElementById('doctor-consults-list-screen').style.display = 'block';
    document.getElementById('doctor-consult-detail-screen').style.display = 'none';
    loadDoctorsConsultsListUI();
};

window.backToDoctorMain = function() {
    document.getElementById('doctor-consults-list-screen').style.display = 'none';
    document.getElementById('doctor-consult-detail-screen').style.display = 'none';
    document.getElementById('doctor-main-dashboard').style.display = 'block';
    updateDoctorDashboardStats();
};

window.loadDoctorsConsultsListUI = async function() {
    const container = document.getElementById('doctor-consults-list-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    
    try {
        const { data: consultations, error } = await supabase
            .from('consultations')
            .select('*')
            .is('answer', null)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!consultations || consultations.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; background: var(--card-bg); border-radius: 24px;">
                    <i class="fas fa-comment-slash" style="font-size: 3rem; color: #94a3b8; margin-bottom: 15px; display: block;"></i>
                    <p style="color: var(--text-muted); font-size: 1.1rem;">لا توجد استشارات جديدة</p>
                </div>
            `;
            return;
        }
        
        document.getElementById('doctor-consults-count-header').innerText = consultations.length;
        
        container.innerHTML = consultations.map(consult => `
            <div onclick="openConsultDetail('${consult.id}', '${consult.patient_phone}', '${consult.question.replace(/'/g, "\\'")}')" 
                 style="background: var(--card-bg); border-radius: 20px; padding: 20px; cursor: pointer; border: 1px solid rgba(0,0,0,0.05); transition: all 0.3s ease; box-shadow: var(--shadow);">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="width: 50px; height: 50px; background: #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;">
                        <i class="fas fa-question" style="font-size: 1.3rem;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; color: var(--secondary); font-size: 1.05rem;">
                            <i class="fas fa-phone-alt" style="color: var(--primary); font-size: 0.85rem;"></i> ${consult.patient_phone}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            ${consult.question}
                        </div>
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 6px;">
                            <i class="far fa-clock"></i> ${new Date(consult.created_at).toLocaleDateString('ar-EG')}
                        </div>
                    </div>
                    <i class="fas fa-chevron-left" style="color: var(--primary);"></i>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error("خطأ في تحميل الاستشارات:", error);
        container.innerHTML = '<div style="text-align:center; padding:40px; color: #ef4444;">❌ خطأ في تحميل الاستشارات</div>';
    }
};

window.openConsultDetail = function(consultId, phone, question) {
    document.getElementById('doctor-consults-list-screen').style.display = 'none';
    
    const detailScreen = document.getElementById('doctor-consult-detail-screen');
    detailScreen.style.display = 'block';
    detailScreen.style.animation = 'slideUp .5s ease';
    detailScreen.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 0 20px;">
            <div style="margin-bottom: 20px; margin-top: 10px;">
                <button onclick="backToConsultsList()" style="background: rgba(0,122,255,0.08); border: none; padding: 8px 18px; border-radius: 20px; cursor: pointer; color: #007AFF; font-weight: 500; font-size: 14px; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-arrow-right" style="font-size: 12px;"></i> رجوع
                </button>
            </div>
            
            <div style="background: var(--card-bg); border-radius: 24px; padding: 30px; box-shadow: var(--shadow);">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                    <div style="width: 45px; height: 45px; background: #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                        <i class="fas fa-user"></i>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem;">رقم المريض: ${phone}</h3>
                        <small style="color: var(--text-muted);">استشارة طبية بحاجة للرد</small>
                    </div>
                </div>
                
                <div style="background: var(--bg); border-radius: 16px; padding: 20px; margin-bottom: 25px;">
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
                        <i class="fas fa-question-circle"></i> السؤال:
                    </div>
                    <p style="margin: 0; font-size: 1.05rem; line-height: 1.8; color: var(--secondary);">${question}</p>
                </div>
                
                <div>
                    <label style="display: block; font-weight: 700; margin-bottom: 10px; color: var(--secondary);">
                        <i class="fas fa-reply"></i> الرد على الاستشارة
                    </label>
                    <textarea id="consult-answer-text" style="width: 100%; padding: 16px; border-radius: 16px; border: 2px solid var(--copyright-border); background: var(--bg); min-height: 150px; font-size: 1rem; font-family: inherit; resize: vertical;" placeholder="اكتب ردك هنا..."></textarea>
                    <button onclick="submitConsultAnswer('${consultId}')" style="margin-top: 15px; background: var(--success); color: white; border: none; padding: 14px 35px; border-radius: 16px; font-weight: 700; cursor: pointer; font-size: 1rem; display: inline-flex; align-items: center; gap: 10px;">
                        <i class="fas fa-paper-plane"></i> إرسال الرد
                    </button>
                </div>
            </div>
        </div>
    `;
};

window.backToConsultsList = function() {
    document.getElementById('doctor-consult-detail-screen').style.display = 'none';
    document.getElementById('doctor-consults-list-screen').style.display = 'block';
    document.getElementById('doctor-consults-list-screen').style.animation = 'slideUp .5s ease';
    loadDoctorsConsultsListUI();
};

window.submitConsultAnswer = async function(consultId) {
    const answer = document.getElementById('consult-answer-text')?.value.trim();
    if (!answer) {
        showToast("يرجى كتابة الرد أولاً", "error");
        return;
    }
    
    const btn = document.querySelector('#doctor-consult-detail-screen button:last-child');
    const originalText = btn?.innerHTML || 'إرسال الرد';
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        btn.disabled = true;
    }
    
    try {
        const { error } = await supabase
            .from('consultations')
            .update({ answer: answer })
            .eq('id', consultId);
        
        if (error) throw error;
        
        showToast("✅ تم إرسال الرد بنجاح", "success");
        backToConsultsList();
        updateDoctorDashboardStats();
        
    } catch (error) {
        showToast("❌ خطأ في إرسال الرد: " + error.message, "error");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};

async function updateDoctorDashboardStats() {
    try {
        const { count: patientsCount } = await supabase.from('patients').select('*', { count: 'exact', head: true });
        const { count: consultsCount } = await supabase.from('consultations').select('*', { count: 'exact', head: true }).is('answer', null);
        
        const todayPatients = document.getElementById('doctor-today-patients');
        const newConsults = document.getElementById('doctor-new-consults');
        if (todayPatients) todayPatients.innerText = patientsCount || 0;
        if (newConsults) newConsults.innerText = consultsCount || 0;
        
        const patientsBadge = document.getElementById('doctor-patients-count-dash');
        const consultsBadge = document.getElementById('doctor-consults-count-dash');
        if (patientsBadge) patientsBadge.innerText = patientsCount || 0;
        if (consultsBadge) consultsBadge.innerText = consultsCount || 0;
        
        const consultsHeader = document.getElementById('doctor-consults-count-header');
        if (consultsHeader) consultsHeader.innerText = consultsCount || 0;
        
        const welcomeName = document.getElementById('doctor-welcome-name');
        if (welcomeName) welcomeName.innerText = 'د. أحمد المغلس';
        
    } catch(e) {}
}

window.showDoctorPanel = function() {
    document.getElementById('admin-dashboard-main').style.display = 'none';
    document.getElementById('doctor-panel').style.display = 'block';
    document.getElementById('pharmacist-panel').style.display = 'none';
    
    document.getElementById('doctor-main-dashboard').style.display = 'block';
    document.getElementById('doctor-patients-list-screen').style.display = 'none';
    document.getElementById('doctor-patient-detail-screen').style.display = 'none';
    document.getElementById('doctor-consults-list-screen').style.display = 'none';
    document.getElementById('doctor-consult-detail-screen').style.display = 'none';
    
    updateDoctorDashboardStats();
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==========================================
// 8. دوال لوحة المخزون - تصميم Apple
// ==========================================

window.showInventoryPanel = function() {
    document.getElementById('admin-dashboard-main').style.display = 'none';
    document.getElementById('doctor-panel').style.display = 'none';
    document.getElementById('pharmacist-panel').style.display = 'none';
    
    const panel = document.getElementById('inventory-panel');
    panel.style.display = 'block';
    panel.style.animation = 'fadeIn 0.5s ease';
    
    loadInventoryApple();
};

window.backFromInventory = function() {
    document.getElementById('inventory-panel').style.display = 'none';
    document.getElementById('admin-dashboard-main').style.display = 'block';
};

window.loadInventoryApple = async function() {
    const container = document.getElementById('inventory-cards-container');
    if (!container) return;
    
    container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #F9F9FB; border-radius: 18px;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid #E5E5EA; border-top-color: #007AFF; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <p style="color: #8E8E93; margin-top: 16px;">جاري تحميل المخزون...</p>
        </div>
    `;
    
    try {
        const { data: inventory, error } = await supabase
            .from('pharmacy_inventory')
            .select('*')
            .order('med_name');
            
        if (error) throw error;
        
        if (!inventory || inventory.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #F9F9FB; border-radius: 18px; border: 2px dashed #E5E5EA;">
                    <i class="fas fa-box-open" style="font-size: 48px; color: #C6C6C8; margin-bottom: 16px; display: block;"></i>
                    <h3 style="color: #1D1D1F; font-weight: 600; margin: 0;">المخزون فارغ</h3>
                    <p style="color: #8E8E93; margin: 8px 0 0 0;">لم يتم إضافة أي أدوية حتى الآن</p>
                </div>
            `;
            return;
        }
        
        const total = inventory.length;
        const lowStock = inventory.filter(item => item.quantity < 10).length;
        const inStock = inventory.filter(item => item.quantity >= 10).length;
        const totalValue = inventory.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
        
        document.getElementById('total-meds-count').innerText = total;
        document.getElementById('low-stock-count').innerText = lowStock;
        document.getElementById('in-stock-count').innerText = inStock;
        document.getElementById('total-value-count').innerText = totalValue.toLocaleString();
        
        container.innerHTML = inventory.map(item => {
            const isLowStock = item.quantity < 10;
            const isOutOfStock = item.quantity <= 0;
            const stockStatus = isOutOfStock ? 'نافذ' : (isLowStock ? 'منخفض' : 'متوفر');
            const statusClass = isOutOfStock ? 'out-of-stock' : (isLowStock ? 'low-stock' : '');
            
            return `
                <div class="med-card-apple ${statusClass}">
                    <div class="med-info" style="flex: 1; min-width: 0;">
                        <h4>${escapeHtml(item.med_name)}</h4>
                        <p>
                            الكمية: <strong style="color: ${isLowStock ? '#FF3B30' : '#1D1D1F'};">${item.quantity}</strong> ${item.unit || 'حبة'}
                            ${isLowStock ? `<span class="stock-badge low">⬇ ${stockStatus}</span>` : `<span class="stock-badge ok">✓ ${stockStatus}</span>`}
                        </p>
                        <div>
                            <span class="price-tag">${item.price || 'غير محدد'} ريال</span>
                        </div>
                    </div>
                    <div class="med-actions">
                        <button class="btn-add" onclick="updateStockApple('${item.id}', ${item.quantity + 1})" title="زيادة الكمية">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn-remove" onclick="updateStockApple('${item.id}', ${item.quantity - 1})" title="إنقاص الكمية" ${item.quantity <= 0 ? 'disabled' : ''}>
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error("خطأ في تحميل المخزون:", error);
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #FFF5F5; border-radius: 18px; border: 2px solid #FFE5E5;">
                <i class="fas fa-exclamation-circle" style="font-size: 48px; color: #FF3B30; margin-bottom: 16px; display: block;"></i>
                <h3 style="color: #1D1D1F; font-weight: 600; margin: 0;">خطأ في التحميل</h3>
                <p style="color: #8E8E93; margin: 8px 0 0 0;">يرجى المحاولة مرة أخرى</p>
            </div>
        `;
    }
};

window.updateStockApple = async function(id, newQuantity) {
    if (newQuantity < 0) {
        showToast("الكمية لا يمكن أن تكون أقل من صفر", "error");
        return;
    }
    
    try {
        const { error } = await supabase
            .from('pharmacy_inventory')
            .update({ quantity: newQuantity })
            .eq('id', id);
            
        if (error) throw error;
        
        showToast("✅ تم تحديث المخزون", "success");
        loadInventoryApple();
        
    } catch (error) {
        showToast("❌ خطأ في تحديث المخزون: " + error.message, "error");
    }
};

window.loadInventory = function() {
    loadInventoryApple();
};

// ==========================================
// 9. تشغيل التطبيق (DOMContentLoaded)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initPatientPhone();
    document.getElementById('currentYear').textContent = new Date().getFullYear();
    if(localStorage.getItem('theme') === 'dark') { document.body.classList.add('dark-mode'); document.getElementById('darkModeBtn').innerHTML = '<i class="fas fa-sun"></i>'; }
    setTimeout(() => { document.getElementById('mainFooter').classList.add('visible'); }, 300);
    initLuxuryPhone();
    setupDoctorRealtime();
    setupPharmacyRealtime();
    
    // ===== تهيئة الأطباء =====
    initDoctors();
    // ===== نهاية التهيئة =====
    
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('deleteConfirmModal').style.display = 'none';
            document.body.style.overflow = 'auto';
            appointmentToDeleteId = null;
        });
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async function() {
            if (!appointmentToDeleteId) return;
            const id = appointmentToDeleteId;
            const modal = document.getElementById('deleteConfirmModal');
            const btn = this;
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> جاري الحذف...`;
            if (typeof window.deleteAppointmentFromFirebase === 'function') {
                const success = await window.deleteAppointmentFromFirebase(id);
                if (success) {
                    await window.loadAppointmentsFromFirebase();
                    render();
                    showToast("🗑️ تم حذف السجل بنجاح", "success", "#ef4444");
                } else {
                    showToast("❌ فشل الاتصال، حاول لاحقاً", "error");
                }
            }
            if (modal) modal.style.display = 'none';
            document.body.style.overflow = 'auto';
            btn.disabled = false;
            btn.innerHTML = `نعم، احذف`;
            appointmentToDeleteId = null;
        });
    }
    
    showSection('home');
});

window.addEventListener('scroll', function() { const nav = document.getElementById('mainNav'); if (window.scrollY > 50) nav.classList.add('scrolled'); else nav.classList.remove('scrolled'); });
// =========================================================
// مركز صحتك الجديد — تفاعلات مستقلة وآمنة للواجهة العامة
// =========================================================
window.openHealthView = function(view) {
    const views = document.querySelectorAll('.health-view');
    const items = document.querySelectorAll('.health-command-item');
    views.forEach(v => { v.hidden = v.id !== `health-view-${view}`; v.classList.toggle('active', v.id === `health-view-${view}`); });
    items.forEach(btn => btn.classList.toggle('active', btn.dataset.healthView === view));
    const target = document.getElementById(`health-view-${view}`);
    if (target) {
        target.hidden = false;
        if (window.matchMedia('(max-width:700px)').matches) {
            setTimeout(() => target.scrollIntoView({behavior:'smooth', block:'start'}), 40);
        }
    }
};

window.healthV2BMI = function() {
    const weight = parseFloat(document.getElementById('health-v2-weight')?.value);
    const height = parseFloat(document.getElementById('health-v2-height')?.value);
    const out = document.getElementById('health-v2-bmi-result');
    if (!out) return;
    if (!weight || !height || weight <= 0 || height <= 0) { out.textContent = 'أدخل الوزن والطول أولًا.'; return; }
    const bmi = weight / Math.pow(height / 100, 2);
    let label = bmi < 18.5 ? 'أقل من النطاق المعتاد' : bmi < 25 ? 'ضمن النطاق المعتاد' : bmi < 30 ? 'أعلى من النطاق المعتاد' : 'مرتفع';
    out.innerHTML = `BMI: <strong>${bmi.toFixed(1)}</strong> — ${label}.`;
};

window.healthV2Water = function() {
    const weight = parseFloat(document.getElementById('health-v2-water')?.value);
    const out = document.getElementById('health-v2-water-result');
    if (!out) return;
    if (!weight || weight <= 0) { out.textContent = 'أدخل الوزن أولًا.'; return; }
    const liters = weight * 0.035;
    out.innerHTML = `تقدير تقريبي: <strong>${liters.toFixed(1)} لتر</strong> يوميًا. قد تختلف الحاجة حسب الطقس والنشاط والحالة الصحية.`;
};

window.setSleepPlan = function(type) {
    const out = document.getElementById('health-v2-sleep-result');
    if (!out) return;
    const plans = {
        adult: 'للبالغين: يستهدف كثير من البالغين عادةً نحو 7–9 ساعات من النوم المنتظم.',
        teen: 'للمراهقين: يحتاج كثير منهم عادةً نحو 8–10 ساعات من النوم المنتظم.',
        child: 'للأطفال: الاحتياج يختلف كثيرًا حسب العمر، لذلك يُفضّل الرجوع إلى إرشادات طبيب الأطفال.'
    };
    out.textContent = plans[type] || 'اختر الفئة العمرية لعرض النطاق الإرشادي.';
};

window.filterHealthV2 = function(query) {
    const q = String(query || '').trim().toLowerCase();
    const cards = document.querySelectorAll('#health-v2-library .health-knowledge-card');
    let visible = 0;
    cards.forEach(card => {
        const text = (card.dataset.healthV2 || '').toLowerCase() + ' ' + card.textContent.toLowerCase();
        const show = !q || text.includes(q);
        card.style.display = show ? '' : 'flex';
        if (!show) card.style.display = 'none'; else visible++;
    });
    const empty = document.getElementById('health-v2-empty');
    if (empty) empty.hidden = visible !== 0;
    document.querySelectorAll('.health-library-chips button').forEach(btn => btn.classList.toggle('active', btn.textContent.trim() === (q || 'الكل')));
    const search = document.getElementById('health-v2-search');
    if (search && search.value !== query && q !== '') search.value = query;
};

// =========================================================
// قسم صحتك — أدوات وتفاعل الواجهة العامة
// =========================================================
window.switchHealthTab = function(tabName, ev) {
    document.querySelectorAll('.health-tab').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.health-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.hidden = true;
    });
    const button = ev && ev.currentTarget ? ev.currentTarget : document.querySelector(`.health-tab[onclick*="'${tabName}'"]`);
    const panel = document.getElementById(`health-${tabName}`);
    if (button) {
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
    }
    if (panel) {
        panel.hidden = false;
        panel.classList.add('active');
    }
};

window.calculateBMI = function() {
    const weight = parseFloat(document.getElementById('health-weight')?.value);
    const heightCm = parseFloat(document.getElementById('health-height')?.value);
    const result = document.getElementById('bmi-result');
    if (!result) return;
    if (!Number.isFinite(weight) || !Number.isFinite(heightCm) || weight <= 0 || heightCm <= 0) {
        result.textContent = 'أدخل الوزن والطول بشكل صحيح أولاً.';
        return;
    }
    const heightM = heightCm / 100;
    const bmi = weight / (heightM * heightM);
    let label = 'ضمن النطاق المعتاد للبالغين';
    if (bmi < 18.5) label = 'أقل من 18.5';
    else if (bmi < 25) label = '18.5 إلى أقل من 25';
    else if (bmi < 30) label = '25 إلى أقل من 30';
    else label = '30 أو أكثر';
    result.innerHTML = `<strong>BMI: ${bmi.toFixed(1)}</strong><br>التصنيف التقريبي: ${label}. هذا المؤشر لا يكفي وحده لتقييم الحالة الصحية.`;
};

window.calculateWater = function() {
    const weight = parseFloat(document.getElementById('water-weight')?.value);
    const result = document.getElementById('water-result');
    if (!result) return;
    if (!Number.isFinite(weight) || weight <= 0) {
        result.textContent = 'أدخل الوزن بشكل صحيح أولاً.';
        return;
    }
    const ml = Math.round(weight * 30);
    result.innerHTML = `<strong>التقدير التقريبي: ${ml.toLocaleString('ar-YE')} مل يوميًا</strong><br>قد تختلف الحاجة حسب العمر والنشاط والطقس والحالة الصحية، وقد يوصي الطبيب بكمية مختلفة.`;
};

window.filterHealthLibrary = function(query) {
    const q = String(query || '').trim().toLowerCase();
    const cards = document.querySelectorAll('.health-library-card');
    let visible = 0;
    cards.forEach(card => {
        const haystack = `${card.textContent} ${card.getAttribute('data-health-search') || ''}`.toLowerCase();
        const show = !q || haystack.includes(q);
        card.style.display = show ? '' : 'none';
        if (show) visible++;
    });
    const empty = document.getElementById('health-library-empty');
    if (empty) empty.hidden = visible !== 0;
};

window.runHealthScreening = function() {
    const emergency = document.getElementById('screen-emergency')?.value;
    const worsening = document.getElementById('screen-worsening')?.value;
    const chronic = document.getElementById('screen-chronic')?.value;
    const wantsBook = document.getElementById('screen-book')?.value;
    const result = document.getElementById('health-screen-result');
    if (!result) return;
    if (!emergency || !worsening || !chronic || !wantsBook) {
        result.className = 'health-screen-result warning';
        result.textContent = 'أكمل الإجابات الأربع حتى يظهر التوجيه الأولي.';
        return;
    }
    if (emergency === 'yes') {
        result.className = 'health-screen-result warning';
        result.innerHTML = '<strong>تنبيه:</strong> الأعراض المذكورة قد تحتاج إلى تقييم عاجل. لا تعتمد على الموقع أو الاستشارة الإلكترونية في حالة الطوارئ، وتوجه إلى أقرب خدمة طوارئ أو اطلب المساعدة الطبية المحلية فورًا.';
        return;
    }
    if (worsening === 'yes' || wantsBook === 'yes') {
        result.className = 'health-screen-result normal';
        result.innerHTML = '<strong>التوجيه الأولي:</strong> يُستحسن حجز موعد ومناقشة الأعراض مع طبيب، خصوصًا إذا كانت جديدة أو تتفاقم. <button type="button" class="health-primary-btn" style="margin-top:12px" onclick="showSection(\'book\')">الانتقال إلى الحجز</button>';
        return;
    }
    if (chronic === 'yes') {
        result.className = 'health-screen-result info';
        result.innerHTML = '<strong>التوجيه الأولي:</strong> حافظ على المتابعة الدورية وخذ أدويتك كما وصفها الطبيب، ويمكنك حجز موعد إذا حان وقت المراجعة أو ظهرت أعراض جديدة.';
        return;
    }
    result.className = 'health-screen-result info';
    result.textContent = 'لا تظهر من إجاباتك الحالية علامة تستدعي توجيهًا عاجلًا. استمر في العادات الصحية والمتابعة الطبية عند الحاجة.';
};

window.submitHealthConsultation = async function(event) {
    if (event) event.preventDefault();
    const name = document.getElementById('health-consult-name')?.value.trim();
    const phone = document.getElementById('health-consult-phone')?.value.trim();
    const question = document.getElementById('health-consult-question')?.value.trim();
    const btn = document.getElementById('health-consult-submit');
    if (!name || !phone || !question) {
        showToast('يرجى إكمال الاسم ورقم الجوال والاستشارة', 'error');
        return false;
    }
    if (!supabase) {
        showToast('تعذر الاتصال بقاعدة البيانات الآن', 'error');
        return false;
    }
    if (locks.consultation) return false;
    locks.consultation = true;
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جاري الإرسال...'; }
    try {
        const cleanPhone = phone.replace(/\s+/g, ' ').trim();
        const { error } = await supabase.from('consultations').insert([{ patient_phone: cleanPhone, question: `الاسم: ${name}\n${question}`, status: 'pending' }]);
        if (error) throw error;
        showToast('تم إرسال استشارتك بنجاح، وسيتم متابعتها من القسم المختص', 'success');
        document.getElementById('healthQuickConsultForm')?.reset();
    } catch (error) {
        console.error('Health consultation error:', error);
        showToast('تعذر إرسال الاستشارة الآن، حاول مرة أخرى', 'error');
    } finally {
        locks.consultation = false;
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
    return false;
};

// =========================================================
// HEALTH OS v3 — تفاعلات مركز صحتك الجديد
// =========================================================
(function(){
  const views=['home','ai','tools','symptoms','learn','daily','visit','safety'];
  window.openHealthOS=function(view){
    if(!views.includes(view)) view='home';
    document.querySelectorAll('.health-os-view').forEach(v=>{
      const active=v.id===`health-os-${view}`;
      v.hidden=!active;
      v.classList.toggle('active',active);
    });
    document.querySelectorAll('.health-os-nav').forEach(b=>b.classList.toggle('active',b.dataset.healthOs===view));
    const main=document.querySelector('.health-os-main');
    if(main && window.matchMedia('(max-width:900px)').matches) main.scrollIntoView({behavior:'smooth',block:'start'});
  };

  const daily=[
    ['هل تستطيع أن تجعل اليوم أكثر صحة بـ 10 دقائق؟','اختر عادة صغيرة اليوم: مشي خفيف، كوب ماء، ترتيب وقت النوم أو كتابة سؤال صحي تريد معرفة إجابته.'],
    ['اجعل الحركة أسهل من التفكير فيها.','قسّم وقت الجلوس الطويل إلى فترات قصيرة من الحركة المناسبة لك بدل انتظار وقت رياضي مثالي.'],
    ['اسأل نفسك: ما الشيء الصحي الذي أؤجله؟','اكتب خطوة واحدة صغيرة تستطيع تنفيذها اليوم، واجعلها واضحة وقابلة للإنجاز.'],
    ['المعلومة الجيدة توفر عليك القلق.','بدل البحث العشوائي، اكتب سؤالك بوضوح واستفد من مكتبة مركز صحتك أو مساعدك الصحي.']
  ];
  let dailyIndex=Number(localStorage.getItem('mughales_health_daily_index')||0)%daily.length;
  window.healthNextDaily=function(){dailyIndex=(dailyIndex+1)%daily.length;localStorage.setItem('mughales_health_daily_index',dailyIndex);const [t,p]=daily[dailyIndex];const a=document.getElementById('health-daily-title'),b=document.getElementById('health-daily-text');if(a)a.textContent=t;if(b)b.textContent=p;};

  window.healthV3BMI=function(){
    const w=parseFloat(document.getElementById('health-v3-weight')?.value),h=parseFloat(document.getElementById('health-v3-height')?.value),o=document.getElementById('health-v3-bmi');
    if(!o)return;if(!w||!h||w<=0||h<=0){o.textContent='أدخل الوزن والطول أولًا.';return;}
    const bmi=w/Math.pow(h/100,2);let label=bmi<18.5?'أقل من النطاق المعتاد':bmi<25?'ضمن النطاق المعتاد':bmi<30?'أعلى من النطاق المعتاد':'مرتفع';o.innerHTML=`BMI <strong>${bmi.toFixed(1)}</strong> — ${label}.`;
  };
  window.healthV3Water=function(){const w=parseFloat(document.getElementById('health-v3-water')?.value),o=document.getElementById('health-v3-water-result');if(!o)return;if(!w||w<=0){o.textContent='أدخل الوزن أولًا.';return;}o.innerHTML=`تقدير تقريبي: <strong>${(w*.035).toFixed(1)} لتر</strong> يوميًا. قد تختلف الحاجة حسب الطقس والنشاط والحالة الصحية.`;};
  window.healthSleep=function(type){const o=document.getElementById('health-v3-sleep');if(!o)return;const x={adult:'للبالغين: كثير منهم يحتاجون عادةً نحو 7–9 ساعات.',teen:'للمراهقين: كثير منهم يحتاجون عادةً نحو 8–10 ساعات.',child:'للأطفال: الاحتياج يختلف حسب العمر، ويُفضّل الرجوع إلى إرشادات طبيب الأطفال.'};o.textContent=x[type]||'';};
  let timer=null,seconds=60;window.healthStartTimer=function(){const out=document.getElementById('healthTimer'),btn=document.getElementById('healthTimerBtn');if(!out||!btn)return;if(timer){clearInterval(timer);timer=null;}seconds=60;btn.disabled=true;const tick=()=>{out.textContent=`00:${String(seconds).padStart(2,'0')}`;if(seconds<=0){clearInterval(timer);timer=null;btn.disabled=false;btn.innerHTML='ابدأ دقيقة <i class="fas fa-play"></i>';out.textContent='انتهت الدقيقة ✓';return;}seconds--;};tick();timer=setInterval(tick,1000);};

  window.healthSymptom=function(title,text){const o=document.getElementById('healthSymptomResult');if(!o)return;o.hidden=false;o.innerHTML=`<b><i class="fas fa-circle-info"></i> ${title}</b><span>${text}</span>`;o.scrollIntoView({behavior:'smooth',block:'nearest'});};

  window.healthLibrarySearch=function(q){q=String(q||'').trim().toLowerCase();let n=0;document.querySelectorAll('#healthLibraryProGrid .health-article').forEach(c=>{const hay=(c.textContent+' '+(c.dataset.search||'')).toLowerCase();const show=!q||hay.includes(q);c.style.display=show?'':'none';if(show)n++;});document.getElementById('healthLibraryEmpty').hidden=n!==0;};
  window.healthLibraryFilter=function(cat,btn){document.querySelectorAll('.health-library-tags button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');const search=document.getElementById('healthProSearch');if(search)search.value='';let n=0;document.querySelectorAll('#healthLibraryProGrid .health-article').forEach(c=>{const show=cat==='all'||(c.dataset.cat||'').includes(cat);c.style.display=show?'':'none';if(show)n++;});document.getElementById('healthLibraryEmpty').hidden=n!==0;};

  const challenge=[['اشرب كوب ماء إضافيًا اليوم','اختر لحظة ثابتة خلال يومك واجعلها تذكيرًا بسيطًا بالماء.'],['خذ استراحة حركة قصيرة','بعد فترة من الجلوس، جرّب دقيقة حركة مناسبة لك.'],['اكتب سؤالًا صحيًا واحدًا','سؤال واضح واحد قد يكون أفضل من عشر عمليات بحث عشوائية.'],['جهّز معلومة لطبيبك','دوّن عرضًا مهمًا ومتى بدأ، إذا كنت تستعد لزيارة.']];
  let ci=Number(localStorage.getItem('mughales_health_challenge')||0)%challenge.length;function renderChallenge(){const [t,p]=challenge[ci];const a=document.getElementById('healthChallengeTitle'),b=document.getElementById('healthChallengeText'),n=document.getElementById('healthChallengeNumber');if(a)a.textContent=t;if(b)b.textContent=p;if(n)n.textContent=String(ci+1).padStart(2,'0');}function renderStreak(){const n=Number(localStorage.getItem('mughales_health_streak')||0);const o=document.getElementById('healthStreak');if(o)o.textContent=n;}
  window.healthCompleteChallenge=function(){const last=localStorage.getItem('mughales_health_challenge_date'),today=new Date().toISOString().slice(0,10);if(last!==today){localStorage.setItem('mughales_health_challenge_date',today);localStorage.setItem('mughales_health_streak',String(Number(localStorage.getItem('mughales_health_streak')||0)+1));renderStreak();}const btn=document.getElementById('healthChallengeBtn');if(btn){btn.innerHTML='تم الإنجاز ✓';btn.disabled=true;}ci=(ci+1)%challenge.length;localStorage.setItem('mughales_health_challenge',ci);setTimeout(()=>{renderChallenge();const b=document.getElementById('healthChallengeBtn');if(b){b.innerHTML='أنجزته <i class="fas fa-check"></i>';b.disabled=false;}},900);};
  window.healthResetStreak=function(){localStorage.removeItem('mughales_health_streak');localStorage.removeItem('mughales_health_challenge_date');renderStreak();};
  window.healthQuizAnswer=function(btn,correct){document.querySelectorAll('#healthQuizOptions button').forEach(b=>{b.disabled=true;b.classList.remove('correct','wrong');});btn.classList.add(correct?'correct':'wrong');const o=document.getElementById('healthQuizResult');if(o)o.textContent=correct?'إجابة صحيحة — الاستمرارية أهم من المثالية.':'ليست الأفضل؛ جرّب التفكير في عادة ثابتة يمكن تكرارها.';};

  let aiHistory=[];let aiBusy=false;
  function aiAdd(text,role){const box=document.getElementById('healthAIChat');if(!box)return;const row=document.createElement('div');row.className=`health-ai-message ${role}`;if(role==='bot')row.innerHTML=`<span class="health-ai-avatar"><i class="fas fa-sparkles"></i></span><div></div>`;else row.innerHTML='<div></div>';row.querySelector('div').textContent=text;box.appendChild(row);box.scrollTop=box.scrollHeight;return row;}
  window.healthAIQuick=function(prefix){const input=document.getElementById('healthAIInput');if(input){input.value=prefix;input.focus();}};
  window.healthAISend=async function(e){if(e)e.preventDefault();const input=document.getElementById('healthAIInput');const q=(input?.value||'').trim();if(!q||aiBusy)return false;aiBusy=true;input.value='';aiAdd(q,'user');aiHistory.push({role:'user',content:q});const typing=aiAdd('يكتب الآن…','bot');try{const endpoint=window.AL_MUGHALES_AI_ENDPOINT||'/api/ai';const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:`أنت مساعد صحي تثقيفي داخل مستشفى المغلس. أجب بالعربية وبوضوح. لا تشخّص، لا تصف جرعات أو أدوية علاجية، ولا تطمئن المستخدم في حالة طارئة. إذا ظهرت علامة طوارئ فاذكر ضرورة طلب مساعدة عاجلة. سؤال المستخدم: ${q}`,history:aiHistory.slice(-8)}),credentials:'omit'});let data={};try{data=await res.json();}catch(_){}if(!res.ok)throw new Error(data.error||'تعذر الاتصال');let ans=data.answer||data.response||data.result?.response||data.choices?.[0]?.message?.content;if(!ans)throw new Error('لم يصل رد مفهوم');if(typing?.parentNode)typing.parentNode.removeChild(typing);aiAdd(ans,'bot');aiHistory.push({role:'assistant',content:ans});}catch(err){if(typing?.parentNode)typing.parentNode.removeChild(typing);aiAdd('تعذر الاتصال بالمساعد الآن. جرّب مرة أخرى أو استخدم المكتبة الطبية.','bot');}finally{aiBusy=false;}return false;};

  document.addEventListener('DOMContentLoaded',function(){renderChallenge();renderStreak();const [t,p]=daily[dailyIndex];const a=document.getElementById('health-daily-title'),b=document.getElementById('health-daily-text');if(a)a.textContent=t;if(b)b.textContent=p;});
})();

/* =========================================================
   Health Center — 4 large tabs
   ========================================================= */
(function(){
  window.healthOpenTab=function(tab){
    const map={explore:'explore',assistant:'assistant',care:'care',learn:'learn'};
    if(!map[tab]) tab='explore';
    document.querySelectorAll('.health-v1-panel').forEach(p=>p.classList.toggle('active',p.id==='health-tab-'+tab));
    const panel=document.getElementById('health-tab-'+tab);
    if(panel) panel.scrollIntoView({behavior:'smooth',block:'center'});
  };
  window.healthV1ScrollBack=function(){
    const section=document.getElementById('health');
    if(section) section.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const daily4=[
    ['الماء عادة بسيطة','وزّع شرب الماء على يومك بدلًا من الانتظار حتى تشعر بالعطش.'],
    ['النوم جزء من صحتك','حاول تثبيت وقت نوم واستيقاظ مناسبين لك قدر الإمكان.'],
    ['الحركة لا تحتاج وقتًا طويلًا','استراحة حركة قصيرة خلال يومك أفضل من الجلوس المتواصل.'],
    ['اكتب سؤالك للطبيب','قبل موعدك، دوّن أهم سؤال حتى لا تنساه أثناء الزيارة.']
  ];
  let di4=Number(localStorage.getItem('mughales_health_daily4')||0)%daily4.length;
  function render4(){const a=document.getElementById('health4-daily-title'),b=document.getElementById('health4-daily-text');if(a&&b){a.textContent=daily4[di4][0];b.textContent=daily4[di4][1];}}
  window.health4NextDaily=function(){di4=(di4+1)%daily4.length;localStorage.setItem('mughales_health_daily4',String(di4));render4();};
  document.addEventListener('DOMContentLoaded',render4);
})();


/* =========================================================
   Health Center — agreed v1 interactions
   ========================================================= */
(function(){
  const bodyInfo={
    head:{tag:'الرأس',title:'الدماغ والجهاز العصبي',text:'الدماغ جزء أساسي من الجهاز العصبي، ويساهم في الحركة والإحساس والتفكير والذاكرة وتنظيم كثير من وظائف الجسم.'},
    chest:{tag:'الصدر',title:'القلب والرئتان',text:'يحتوي الصدر على أعضاء مهمة مثل القلب والرئتين. القلب يضخ الدم، والرئتان تساعدان الجسم على تبادل الأكسجين وثاني أكسيد الكربون.'},
    abdomen:{tag:'البطن',title:'الجهاز الهضمي وأعضاء أخرى',text:'توجد في البطن أعضاء متعددة، منها المعدة والأمعاء والكبد والبنكرياس. لكل عضو وظيفة مختلفة ضمن عمليات الهضم والاستقلاب.'},
    legs:{tag:'الساقان',title:'العضلات والعظام والحركة',text:'تساعد عضلات وعظام الساقين والمفاصل على الوقوف والمشي والحركة والتوازن، وتتأثر وظائفها بالنشاط والإصابات والحالة الصحية العامة.'}
  };
  window.healthOpenTab=function(tab){
    const allowed=['explore','assistant','care','learn'];
    if(!allowed.includes(tab)) tab='explore';
    document.querySelectorAll('.health-v1-panel').forEach(p=>p.classList.toggle('active',p.id==='health-tab-'+tab));
    const panel=document.getElementById('health-tab-'+tab);
    if(panel) setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),30);
  };
  window.healthV1ScrollBack=function(){
    const section=document.getElementById('health');
    if(section) section.scrollIntoView({behavior:'smooth',block:'start'});
  };
  window.healthBodyInfo=function(key){
    const item=bodyInfo[key], out=document.getElementById('healthBodyInfo');
    if(!item||!out) return;
    out.innerHTML=`<span>${item.tag}</span><h3>${item.title}</h3><p>${item.text}</p><div class="health-info-fact"><i class="fas fa-circle-info"></i><span>هذه معلومة تثقيفية عامة وليست تشخيصًا. إذا لديك أعراض أو قلق صحي فاستشر طبيبًا.</span></div>`;
    out.animate([{opacity:.55,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease-out'});
  };
  window.healthCalculateBMI=function(){
    const w=Number(document.getElementById('healthBMIWeight')?.value), h=Number(document.getElementById('healthBMIHeight')?.value), out=document.getElementById('healthBMIResult');
    if(!out) return;
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<50||h>250){out.textContent='أدخل الوزن والطول بشكل صحيح أولًا.';return;}
    const bmi=w/Math.pow(h/100,2);let label='ضمن النطاق المعتاد للبالغين';
    if(bmi<18.5) label='أقل من 18.5'; else if(bmi<25) label='18.5 إلى أقل من 25'; else if(bmi<30) label='25 إلى أقل من 30'; else label='30 أو أكثر';
    out.innerHTML=`<strong>BMI: ${bmi.toFixed(1)}</strong><br>التصنيف التقريبي: ${label}. هذا المؤشر لا يكفي وحده لتقييم الحالة الصحية.`;
  };
  window.healthCalculateWater=function(){
    const w=Number(document.getElementById('healthWaterWeight')?.value), out=document.getElementById('healthWaterResult');
    if(!out) return;
    if(!Number.isFinite(w)||w<=0){out.textContent='أدخل وزنك بشكل صحيح أولًا.';return;}
    const ml=Math.round(w*30);out.innerHTML=`<strong>التقدير التقريبي: ${ml.toLocaleString('ar-YE')} مل يوميًا</strong><br>قد تختلف الحاجة حسب العمر والنشاط والطقس والحالة الصحية.`;
  };
  window.healthSaveVisitNote=function(){
    const input=document.getElementById('healthVisitNote'), out=document.getElementById('healthVisitResult');
    if(!input||!out) return;
    const note=input.value.trim();
    if(!note){out.textContent='اكتب الملاحظة أولًا.';return;}
    try{localStorage.setItem('alMughalesHealthVisitNote',note);out.innerHTML='<strong>تم الحفظ على هذا الجهاز.</strong><br>لن يتم إرسال الملاحظة إلى المستشفى.';}catch(e){out.textContent='تعذر الحفظ على هذا الجهاز.';}
  };
  window.healthFilterLearn=function(cat,button){
    document.querySelectorAll('.health-learning-filters button').forEach(b=>b.classList.remove('active'));if(button)button.classList.add('active');
    document.querySelectorAll('#healthLearningGrid article').forEach(card=>{card.style.display=(cat==='all'||card.dataset.cat===cat)?'flex':'none';});
  };
  window.healthReadArticle=function(button){
    const card=button?.closest('article'), reader=document.getElementById('healthArticleReader');if(!card||!reader)return;
    document.getElementById('healthArticleCat').textContent=card.querySelector('span')?.textContent||'';
    document.getElementById('healthArticleTitle').textContent=card.querySelector('h3')?.textContent||'';
    document.getElementById('healthArticleText').textContent=card.querySelector('p')?.textContent||'';
    reader.hidden=false;reader.scrollIntoView({behavior:'smooth',block:'center'});
  };
  window.healthCloseArticle=function(){const r=document.getElementById('healthArticleReader');if(r)r.hidden=true;};
  window.healthAIQuick=function(q){const input=document.getElementById('healthAIInput');if(!input)return;input.value=q;input.focus();if(typeof window.healthAISend==='function'){setTimeout(()=>window.healthAISend(),30);}};
  document.addEventListener('DOMContentLoaded',function(){
    try{const saved=localStorage.getItem('alMughalesHealthVisitNote');if(saved){const input=document.getElementById('healthVisitNote');if(input)input.value=saved;}}catch(e){}
  });
})();
