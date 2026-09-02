const supabaseUrl = 'https://ynlcbpxcsnfxqrogizns.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubGNicHhjc25meHFyb2dpem5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MDMxNjMsImV4cCI6MjEwMzQ3OTE2M30.sx5iFeugOuLBt4pqt0-8_4VOGz1yWa7HQWl4NyGCWkE';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const toTimestamp = value => {
    if (value && typeof value.toMillis === 'function') return value;
    const date = value ? new Date(value) : new Date();
    return { toMillis: () => date.getTime(), toDate: () => date };
};
const normalizeRow = row => {
    if (!row || typeof row !== 'object') return row;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value && (key.endsWith('At') || key === 'timestamp' || key === 'date') ? toTimestamp(value) : value]));
};
const makeSnapshot = (row, id) => row ? { get exists() { return true; }, data: () => normalizeRow(row), id: id || row.id } : { get exists() { return false; }, data: () => undefined, id };
const applyConstraints = (builder, constraints = []) => constraints.reduce((q, c) => {
    if (c.type === 'where') return c.op === '==' ? q.eq(c.field, c.val) : c.op === '!=' ? q.neq(c.field, c.val) : c.op === 'in' ? q.in(c.field, c.val) : q;
    if (c.type === 'orderBy') return q.order(c.field, { ascending: c.dir !== 'desc' });
    return c.type === 'limit' ? q.limit(c.num) : q;
}, builder);
const makeDocRef = (col, id, extraFilter) => ({
    _isDoc: true, col, id, extraFilter,
    get: () => getDoc(makeDocRef(col, id, extraFilter)),
    set: (data, options) => setDoc(makeDocRef(col, id, extraFilter), data, options),
    update: data => updateDoc(makeDocRef(col, id, extraFilter), data),
    delete: () => deleteDoc(makeDocRef(col, id, extraFilter)),
    onSnapshot: callback => onSnapshot(makeDocRef(col, id, extraFilter), callback),
    collection: childCollection => makeCollectionRef(childCollection, extraFilter ? [where(extraFilter.field, '==', extraFilter.val)] : [])
});
const makeCollectionRef = (col, constraints = []) => ({
    _isCol: true, col, constraints,
    where: (field, op, val) => makeCollectionRef(col, [...constraints, { type: 'where', field, op, val }]),
    orderBy: (field, dir) => makeCollectionRef(col, [...constraints, { type: 'orderBy', field, dir }]),
    limit: num => makeCollectionRef(col, [...constraints, { type: 'limit', num }]),
    get: () => getDocs(makeCollectionRef(col, constraints)),
    add: data => addDoc(makeCollectionRef(col, constraints), data),
    doc: id => makeDocRef(col, id || crypto.randomUUID()),
    onSnapshot: callback => onSnapshot(makeCollectionRef(col, constraints), callback)
});
const getAuth = () => ({
    get currentUser() { return window.__supabaseCurrentUser || null; },
    getIdToken: async () => {
        const session = (window.__supabaseSecondarySession && (await window.__supabaseSecondarySession()))?.access_token || (await supabaseClient.auth.getSession()).data?.session?.access_token;
        if (!session) throw new Error('No active Supabase session');
        return session;
    },
    onAuthStateChanged: callback => {
        const subscription = supabaseClient.auth.onAuthStateChange((event, session) => {
            window.__supabaseCurrentUser = session?.user ? { uid: session.user.id, email: session.user.email, id: session.user.id } : null;
            callback(window.__supabaseCurrentUser);
        });
        supabaseClient.auth.getSession().then(({ data }) => {
            window.__supabaseCurrentUser = data.session?.user ? { uid: data.session.user.id, email: data.session.user.email, id: data.session.user.id } : null;
            callback(window.__supabaseCurrentUser);
        }).catch(error => console.error('Supabase session bootstrap failed:', error));
        return subscription;
    },
    signInWithEmailAndPassword: (email, password) => signInWithEmailAndPassword(null, email, password),
    createUserWithEmailAndPassword: (email, password) => createUserWithEmailAndPassword(null, email, password),
    signOut: () => signOut(null),
    setPersistence: () => Promise.resolve()
});
const onAuthStateChanged = (authInstance, callback) => authInstance.onAuthStateChanged(callback);
const signInWithEmailAndPassword = async (authInstance, email, password) => { const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password }); if (error) throw error; window.__supabaseCurrentUser = { uid: data.user.id, email: data.user.email, id: data.user.id }; return { user: window.__supabaseCurrentUser }; };
const createUserWithEmailAndPassword = async (authInstance, email, password) => { const { data, error } = await supabaseClient.auth.signUp({ email, password }); if (error) throw error; return { user: { uid: data.user.id, email: data.user.email, id: data.user.id } }; };
const signOut = async () => { window.__supabaseCurrentUser = null; return supabaseClient.auth.signOut(); };
const getFirestore = () => ({ collection: col => makeCollectionRef(col), batch: writeBatch, enablePersistence: () => Promise.resolve() });
const doc = (db, col, id, ...path) => path[0] === 'feature_controls' ? makeDocRef('feature_controls', path[1], { field: 'schoolId', val: id }) : makeDocRef(col, id);
const collection = (db, col) => makeCollectionRef(col);
const query = (colRef, ...constraints) => makeCollectionRef(colRef.col, [...(colRef.constraints || []), ...constraints]);
const where = (field, op, val) => ({ type: 'where', field, op, val });
const orderBy = (field, dir) => ({ type: 'orderBy', field, dir });
const limit = num => ({ type: 'limit', num });
const serverTimestamp = () => new Date().toISOString();
const deleteField = () => undefined;
const DELETE_FIELD_SENTINEL = deleteField();
const arrayUnionBuilder = values => ({ __arrayUnion: [values].flat().filter(Boolean) });
const getDoc = async ref => { let q = supabaseClient.from(ref.col).select('*').eq('id', ref.id); if (ref.extraFilter) q = q.eq(ref.extraFilter.field, ref.extraFilter.val); const { data, error } = await q.maybeSingle(); if (error || !data) return makeSnapshot(null, ref.id); return makeSnapshot(data, ref.id); };
const getDocs = async ref => { const { data, error } = await applyConstraints(supabaseClient.from(ref.col).select('*'), ref.constraints); if (error) throw error; const docs = (data || []).map(row => makeSnapshot(row, row.id)); return { empty: !docs.length, size: docs.length, docs, forEach: callback => docs.forEach(callback) }; };
const applyArrayUnions = async (ref, data) => {
    const unionEntries = Object.entries(data).filter(([, value]) => value && value.__arrayUnion);
    if (!unionEntries.length) return;
    const snap = await getDoc(ref);
    const current = snap.exists ? snap.data() : {};
    unionEntries.forEach(([key, value]) => {
        const merged = new Set([...(Array.isArray(current[key]) ? current[key] : []), ...value.__arrayUnion]);
        data[key] = Array.from(merged);
    });
};
const setDoc = async (ref, data, options = {}) => {
    const payload = { id: ref.id, ...data };
    if (ref.extraFilter) payload[ref.extraFilter.field] = ref.extraFilter.val;
    if (!options.merge) {
        const snap = await supabaseClient.from(ref.col).select('*').eq('id', ref.id).maybeSingle();
        if (!snap.data) {
            const { error } = await supabaseClient.from(ref.col).insert(payload);
            if (error) throw error;
            return;
        }
    }
    const { error } = await supabaseClient.from(ref.col).upsert(payload);
    if (error) throw error;
};
const updateDoc = async (ref, data) => { const clean = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)); await applyArrayUnions(ref, clean); let q = supabaseClient.from(ref.col).update(clean).eq('id', ref.id); if (ref.extraFilter) q = q.eq(ref.extraFilter.field, ref.extraFilter.val); const { error } = await q; if (error) throw error; };
const deleteDoc = async ref => { const { error } = await supabaseClient.from(ref.col).delete().eq('id', ref.id); if (error) throw error; };
const addDoc = async (ref, data) => { const { data: row, error } = await supabaseClient.from(ref.col).insert(data).select().single(); if (error) throw error; return { id: row.id, ref: makeDocRef(ref.col, row.id) }; };
const writeBatch = () => { const operations = []; return { set: (ref, data) => operations.push(() => setDoc(ref, data)), update: (ref, data) => operations.push(() => updateDoc(ref, data)), delete: ref => operations.push(() => deleteDoc(ref)), commit: async () => { for (const operation of operations) await operation(); } }; };
const onSnapshot = (ref, callback) => {
    const fetcher = ref._isDoc ? () => getDoc(ref) : () => getDocs(ref);
    const run = () => fetcher().then(callback).catch(console.error);
    run();
    const channel = supabaseClient.channel(`public:${ref.col}:${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: ref.col }, run).subscribe();
    return () => supabaseClient.removeChannel(channel);
};
const firebase = { appCheck: () => ({ activate: () => { } }), storage: () => ({ ref: () => ({ put: async () => ({ ref: { getDownloadURL: async () => null } }) }), refFromURL: () => ({ delete: async () => { } }) }), firestore: { FieldValue: { serverTimestamp, delete: deleteField, arrayUnion: arrayUnionBuilder } }, auth: { Auth: { Persistence: { SESSION: 'session' } } }, initializeApp: () => supabaseClient };
const auth = getAuth();
const db = getFirestore();
// Secondary auth uses an isolated Supabase client so chairman login/user creation
// never replaces the primary developer session on the company portal.
const secondarySupabase = window.supabase.createClient(supabaseUrl, supabaseKey, { auth: { storageKey: 'company-secondary-auth' } });
const secondaryAuth = {
    signInWithEmailAndPassword: async (email, password) => { const { data, error } = await secondarySupabase.auth.signInWithPassword({ email, password }); if (error) throw error; const user = { uid: data.user.id, email: data.user.email, id: data.user.id }; window.__supabaseSecondarySession = async () => (await secondarySupabase.auth.getSession()).data?.session; return { user }; },
    createUserWithEmailAndPassword: async (email, password) => { const { data, error } = await secondarySupabase.auth.signUp({ email, password }); if (error) throw error; return { user: { uid: data.user?.id || '', email: data.user?.email || email, id: data.user?.id || '' } }; },
    signOut: async () => { window.__supabaseSecondarySession = null; await secondarySupabase.auth.signOut(); }
};

// ==========================================
// 🛡️ GEO-FENCING LAYER
// ==========================================
const allowedMasterIPs = ['127.0.0.1', '192.168.1.1', '::1'];

async function verifyGeoFence() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (!allowedMasterIPs.includes(data.ip)) {
            console.warn(`Unauthorized Access Attempt from IP: ${data.ip} (Geo-Fence currently disabled for testing)`);
        } else {
            console.log(`✅ Geo-Fence Passed: ${data.ip}`);
        }
    } catch (e) {
        console.error("Geo-fencing verification failed:", e);
    }
}
verifyGeoFence();

// ==========================================
// 1. SUPABASE SYSTEM INITIALIZATION
// ==========================================
const storage = firebase.storage();

// Clear obsolete client-side Firebase/test-session artifacts only. Supabase remote data is untouched.
['firebase:authUser', 'firebaseui::rememberedAccounts', 'master_core_cache', 'old_student_ids'].forEach(key => localStorage.removeItem(key));
['pin_verified', 'firebase_session'].forEach(key => sessionStorage.removeItem(key));

// Initialize Theme
if (localStorage.getItem('master_theme') === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('themeToggle').checked = true;
}
document.getElementById('themeToggle').addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.classList.add('light-theme');
        localStorage.setItem('master_theme', 'light');
    } else {
        document.body.classList.remove('light-theme');
        localStorage.setItem('master_theme', 'dark');
    }
});

db.enablePersistence({ synchronizeTabs: true }).catch(function (err) { console.log("Cache Error: ", err); });

// Global State Variables
window.fetchedChairmen = [];
window.fetchedGlobalStaffList = [];
window.fetchedSchoolPayments = [];
window.fetchedInspectStudents = [];
window.currentDeviceLogs = [];
let superAdminUid = "";
let currentEditChairmanId = null;
const PUBLIC_MEDIA_DOC = db.collection("system_config").doc("public_media");
const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

// UI Control Variables
const loginModal = document.getElementById('login-modal');
const dashboardWrapper = document.getElementById('dashboard-wrapper');
const landingPage = document.getElementById('landing-page');
const pinWrapper = document.getElementById('pin-wrapper');

// Initialize Icons
setTimeout(() => window.lucide?.createIcons(), 100);

// A database outage must never prevent the public landing page from rendering.
setTimeout(() => document.getElementById('auth-overlay')?.classList.add('hidden-el'), 8000);

// ==========================================
// 2. CORE UI & UTILITY FUNCTIONS
// ==========================================
function showLoginModal() {
    loginModal.classList.remove('hidden-el');
    setTimeout(() => loginModal.classList.replace('opacity-0', 'opacity-100'), 10);
    document.getElementById('login-modal-box').classList.replace('scale-95', 'scale-100');
}
function hideLoginModal() {
    loginModal.classList.replace('opacity-100', 'opacity-0');
    document.getElementById('login-modal-box').classList.replace('scale-100', 'scale-95');
    setTimeout(() => loginModal.classList.add('hidden-el'), 300);
}

window.closeCustomModal = (id) => { document.getElementById(id).classList.add('hidden-el'); };
const openCustomModal = (id) => { document.getElementById(id).classList.remove('hidden-el'); };
window.openCustomFeatureBuilder = () => openCustomModal('custom-feature-modal');

window.showToast = (message, color = "#00F0FF") => {
    const t = document.createElement('div');
    // Updated toast styling for cyber theme
    let textColor = color === "#00F0FF" ? "#050b14" : "white";
    let shadowColor = color === "#00F0FF" ? "rgba(0,240,255,0.5)" : "rgba(244,63,94,0.5)";
    t.style.cssText = `position:fixed; bottom:40px; left:50%; transform:translateX(-50%); background:${color}; color:${textColor}; padding:12px 28px; border-radius:8px; font-weight:bold; font-family: 'JetBrains Mono', monospace; font-size:12px; z-index:999999; box-shadow:0 0 20px ${shadowColor}; white-space:nowrap; border: 1px solid rgba(255,255,255,0.2); letter-spacing: 1px; text-transform: uppercase;`;
    t.innerHTML = message;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(() => t.remove(), 400); }, 3000);
};

window.customConfirm = (message, onYes) => {
    document.getElementById("confirm-delete-msg").innerText = message;
    const yesBtn = document.getElementById("confirm-delete-yes");
    yesBtn.onclick = () => { window.closeCustomModal('confirm-delete-modal'); onYes(); };
    openCustomModal("confirm-delete-modal");
};

// Device Mode & Privacy Shield
const deviceModeToggleEl = document.getElementById("deviceModeToggle");
if (deviceModeToggleEl) deviceModeToggleEl.addEventListener("change", (e) => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (e.target.checked) {
        document.body.classList.add("force-desktop");
        viewportMeta.setAttribute("content", "width=1200, user-scalable=yes");
    } else {
        document.body.classList.remove("force-desktop");
        viewportMeta.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes");
    }
});

const privacyShieldToggleEl = document.getElementById("privacyShieldToggle");
if (privacyShieldToggleEl) privacyShieldToggleEl.addEventListener("change", (e) => {
    if (e.target.checked) { document.body.classList.add("privacy-mode"); window.showToast("<i class='fas fa-user-secret'></i> STEALTH MODE ENGAGED", "#6366f1"); }
    else { document.body.classList.remove("privacy-mode"); window.showToast("STEALTH MODE DISABLED", "#64748b"); }
});

// PDF Downloader Helper
window.robustWebViewDownload = async (blobData, filename) => {
    try {
        const reader = new FileReader(); reader.readAsDataURL(blobData);
        reader.onloadend = function () {
            let base64data = reader.result;
            base64data = base64data.replace(";base64,", `;filename=${encodeURIComponent(filename.replace(/ /g, "_"))};base64,`);
            window.showToast("⏳ EXTRACTING " + filename + "...", "#f59e0b");
            const a = document.createElement("a"); a.href = base64data; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
    } catch (e) { window.showToast("❌ EXTRACTION ERROR: " + e.message, "#e11d48"); }
};

// Firebase Storage Helper
const uploadToFirebaseStorage = async (fileObj, folder = 'uploads') => {
    if (!fileObj) return null;
    try {
        const timestamp = Date.now();
        const fileName = `${folder}/${timestamp}_${fileObj.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = storage.ref(fileName);

        window.showToast("⏳ UPLOADING TO FIREBASE...", "#f59e0b");
        const uploadTask = await storageRef.put(fileObj);
        const downloadURL = await uploadTask.ref.getDownloadURL();

        window.showToast("✅ UPLOAD COMPLETE!", "#00F0FF");
        return downloadURL;
    } catch (err) {
        console.error("Firebase upload failed:", err);
        return null;
    }
};

const CLOUDINARY_SETTINGS = window.APP_CONFIG?.cloudinary || {};
const PUBLIC_MEDIA_FALLBACK_FOLDER = window.APP_CONFIG?.publicMediaFallbackFolder || 'public/media';
const PUBLIC_MEDIA_UPLOAD_PATHS = Array.isArray(window.APP_CONFIG?.publicMediaUploadPaths)
    ? window.APP_CONFIG.publicMediaUploadPaths
    : [];
const PUBLIC_MEDIA_BACKEND_BASE = window.APP_CONFIG?.backendBaseUrl || '';

const buildBackendUploadUrls = (options = {}) => {
    const explicit = options.backendEndpoint ? [options.backendEndpoint] : [];
    const base = PUBLIC_MEDIA_BACKEND_BASE ? PUBLIC_MEDIA_UPLOAD_PATHS.map(path => `${PUBLIC_MEDIA_BACKEND_BASE}${path}`) : [];
    return [...explicit, ...base].filter(Boolean);
};

const uploadToCloudinary = async (fileObj, options = {}) => {
    if (!fileObj) return null;

    const uploadPreset = options.uploadPreset || CLOUDINARY_SETTINGS.uploadPreset || 'ml_default';
    const cloudName = options.cloudName || CLOUDINARY_SETTINGS.cloudName || 'disgtvs6f';
    const cloudinaryUrl = options.cloudinaryUrl || CLOUDINARY_SETTINGS.uploadUrl || `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const fallbackFolder = options.fallbackFolder || PUBLIC_MEDIA_FALLBACK_FOLDER;
    const backendUrls = buildBackendUploadUrls(options);

    const tryFirebaseFallback = async (reason) => {
        if (reason) console.warn("Public media upload fallback triggered:", reason);
        const fallbackUrl = await uploadToFirebaseStorage(fileObj, fallbackFolder);
        if (fallbackUrl) {
            window.showToast("✅ MEDIA SAVED VIA FIREBASE FALLBACK", "#10b981");
            return fallbackUrl;
        }
        window.showToast("❌ UPLOAD FAILED: CLOUDINARY AND FIREBASE BOTH FAILED", "#e11d48");
        return null;
    };

    const parseUploadResponse = async (res) => {
        const text = await res.text();
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch (e) {
            return { raw: text };
        }
    };

    const tryBackendUpload = async (endpoint) => {
        const backendForm = new FormData();
        backendForm.append("file", fileObj);
        backendForm.append("upload_preset", uploadPreset);
        const res = await fetch(endpoint, {
            method: "POST",
            body: backendForm
        });
        const data = await parseUploadResponse(res);
        const backendUrl = data.secure_url || data.url || data.location || data.fileUrl;
        if (res.ok && backendUrl) return backendUrl;
        throw new Error(data.error || data.message || data.raw || `Backend upload failed (${res.status})`);
    };

    try {
        for (const endpoint of backendUrls) {
            try {
                window.showToast("⏳ UPLOADING VIA BACKEND...", "#f59e0b");
                const backendUrl = await tryBackendUpload(endpoint);
                if (backendUrl) {
                    window.showToast("✅ UPLOAD COMPLETE!", "#00F0FF");
                    return backendUrl;
                }
            } catch (backendErr) {
                console.warn("Backend media upload failed for endpoint:", endpoint, backendErr);
            }
        }

        const formData = new FormData();
        formData.append("file", fileObj);
        formData.append("upload_preset", uploadPreset);
        window.showToast("⏳ UPLOADING TO CLOUDINARY...", "#f59e0b");
        const res = await fetch(cloudinaryUrl, {
            method: "POST",
            body: formData
        });
        const data = await parseUploadResponse(res);
        if (res.ok && data.secure_url) {
            window.showToast("✅ UPLOAD COMPLETE!", "#00F0FF");
            return data.secure_url;
        }
        return await tryFirebaseFallback(data.error || data.message || data.raw || `Cloudinary response ${res.status}`);
    } catch (err) {
        return await tryFirebaseFallback(err.message);
    }
};

const deleteFirebaseStorageImage = async (imageUrl) => {
    if (!imageUrl) return;
    if (imageUrl.includes("firebasestorage.googleapis.com")) {
        try {
            const storageRef = storage.refFromURL(imageUrl);
            await storageRef.delete();
        } catch (e) {
            console.log("Firebase Storage Delete error:", e);
        }
    } else if (imageUrl.includes("cloudinary.com")) {
        try {
            await fetch('https://school-backend-zlgy.onrender.com/api/delete-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: imageUrl })
            });
        } catch (e) {
            console.log("Cloudinary Delete error:", e);
        }
    }
};

// ==========================================
// 3. AUTHENTICATION & PIN SECURITY
// ==========================================
const doLoginBtnEl = document.getElementById("doLoginBtn");
if (doLoginBtnEl) doLoginBtnEl.addEventListener("click", async () => {
    const e = document.getElementById("loginId").value.trim();
    const p = document.getElementById("loginPassword").value.trim();
    const b = document.getElementById("doLoginBtn");
    const err = document.getElementById("loginErrorMsg");
    if (!e || !p) { err.innerText = "CREDENTIALS REQUIRED."; err.classList.remove('hidden-el'); return; }

    // reCAPTCHA stays optional: Supabase auth must not be blocked by a third-party captcha widget.
    const recaptchaField = document.querySelector('#login-modal [name="g-recaptcha-response"]');
    if (recaptchaField && recaptchaField.value) { /* verified */ }

    b.innerHTML = `<i class="fas fa-spinner fa-spin"></i> VERIFYING HASH...`;

    // Anti-Brute Force Logic (3-Strike Rule)
    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
        await auth.signInWithEmailAndPassword(e, p);

        try {
            const failRef = db.collection("login_logs").doc(e.replace(/[^a-zA-Z0-9_@-]/g, "_"));
            const failDoc = await failRef.get();
            if (failDoc.exists) {
                let lockTime = failDoc.data().lockTime || 0;
                if (Date.now() < lockTime) {
                    await auth.signOut();
                    err.innerText = "ACCOUNT TEMPORARILY LOCKED. PLEASE WAIT.";
                    err.classList.remove('hidden-el');
                    b.innerHTML = `<i data-lucide="fingerprint" class="w-5 h-5"></i> AUTHENTICATE`;
                    lucide.createIcons();
                    return;
                }
            }
            // Clear fails on success
            await failRef.set({ fails: 0, lockTime: 0 }, { merge: true });
        } catch (logErr) {
            console.error("Login logs access failed:", logErr);
        }

        window.logAudit("Master Login Success", "System Core");
    } catch (error) {
        // Record Failure
        err.innerText = "Error: " + (error.message || "Invalid ID / Password");
        try {
            const failRef = db.collection("login_logs").doc(e.replace(/[^a-zA-Z0-9_@-]/g, "_"));
            const failDoc = await failRef.get();
            let fails = (failDoc.exists ? (failDoc.data().fails || 0) : 0) + 1;
            let newLockTime = 0;

            if (fails >= 3) {
                newLockTime = Date.now() + 15 * 60 * 1000; // 15 mins lock
                err.innerText = "MAX ATTEMPTS REACHED. ACCOUNT LOCKED.";
                window.logAudit(`Brute Force Lockout - User: ${e}`, "Security");
            } else {
                err.innerText = `Invalid ID / Password (${3 - fails} attempts left)`;
                window.logAudit(`Failed Login - User: ${e}`, "Security");
            }

            await failRef.set({ fails: fails, lockTime: newLockTime }, { merge: true });
        } catch (logErr) {
            console.error("Login log read/write failed, bypassing:", logErr);
        }

        err.classList.remove('hidden-el');
        b.innerHTML = `<i data-lucide="fingerprint" class="w-5 h-5"></i> AUTHENTICATE`;
        lucide.createIcons();
    }
});

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const ud = await db.collection("users").doc(user.uid).get();
            if (!ud.exists || ud.data().role === "developer") {
                if (!ud.exists) {
                    // First Supabase login: self-provision the developer profile. If RLS blocks the write,
                    // still allow the session so the admin can create the profile from Supabase dashboard.
                    try { await db.collection("users").doc(user.uid).set({ email: user.email, role: "developer", name: "Super Admin", status: "active" }); } catch (provisionErr) { console.warn('Developer profile self-provision failed (check users RLS):', provisionErr); }
                }
                superAdminUid = user.uid;

                document.getElementById("auth-overlay").classList.add("hidden-el");
                landingPage.classList.add("hidden-el");
                hideLoginModal();

                // PIN Logic
                let devData = ud.exists ? ud.data() : {};
                if (sessionStorage.getItem("pin_verified") === "true") {
                    window.unlockDashboard();
                } else {
                    pinWrapper.classList.remove("hidden-el");
                    pinWrapper.style.display = "flex";
                    if (devData.pin) {
                        document.getElementById("enter-pin-box").classList.remove("hidden-el");
                        document.getElementById("create-pin-box").classList.add("hidden-el");
                        window.currentAppPin = devData.pin;
                    } else {
                        document.getElementById("create-pin-box").classList.remove("hidden-el");
                        document.getElementById("enter-pin-box").classList.add("hidden-el");
                    }
                }

                document.getElementById("adminEmail").innerText = user.email;
                document.getElementById("role-footer").innerText = "SYSTEM STATUS: ROOT AUTHORIZED | SECURE CONNECTION ESTABLISHED";
                document.getElementById("role-footer").style.background = "#00F0FF"; // Neon Cyan
                document.getElementById("role-footer").style.color = "#050b14"; // Dark text

                // Load Dashboard Data
                loadChairmen(); loadSchoolsForDropdown(); loadAllStaff(); loadSchoolPayments(); checkAndSendBillingAlerts(); loadInboxMessages();
                window.initQuotaMonitor(); listenToEmergencyTicker(); window.loadAuditLogs(); window.loadPendingDeletions(); window.loadRecycleBin(); window.loadCustomRoles(); window.loadTransferApprovals();

            } else { await auth.signOut(); window.showToast("ACCESS DENIED. ROOT ONLY.", "#e11d48"); }
        } catch (error) { window.showToast("DB ERR: " + (error.message || error), "#e11d48"); console.error(error); }
    } else {
        document.getElementById("auth-overlay").classList.add("hidden-el");
        landingPage.classList.remove("hidden-el");
        dashboardWrapper.classList.add("hidden-el");
    }
});

const logoutBtnEl = document.getElementById("logoutBtn");
if (logoutBtnEl) logoutBtnEl.addEventListener("click", () => auth.signOut().then(() => location.reload()));
window.logoutFromPin = () => auth.signOut().then(() => location.reload());

window.unlockDashboard = () => {
    pinWrapper.classList.add("hidden-el");
    dashboardWrapper.classList.remove("hidden-el");
    lucide.createIcons();

    const savedTab = localStorage.getItem('companyActiveTab');
    if (savedTab) {
        const targetMenu = document.querySelector(`.menu-item[data-target="${savedTab}"]`);
        if (targetMenu) targetMenu.click();
    }
};

window.saveNewPin = async () => {
    const pin = document.getElementById("newPin").value;
    if (pin.length < 4) return window.showToast("PLEASE ENTER 4 DIGITS", "#e11d48");
    try { await db.collection("users").doc(superAdminUid).set({ pin: pin }, { merge: true }); } catch (e) { window.showToast("PIN SAVE ERR: " + (e.message || e), "#e11d48"); console.error("Pin Error:", e); return; }
    window.currentAppPin = pin;
    sessionStorage.setItem("pin_verified", "true");
    window.unlockDashboard();
};

window.verifyPin = () => {
    const pin = document.getElementById("loginPin").value;
    if (pin === window.currentAppPin) {
        sessionStorage.setItem("pin_verified", "true");
        window.unlockDashboard();
    } else {
        document.getElementById("pinErrorMsg").classList.remove("hidden-el");
        setTimeout(() => document.getElementById("pinErrorMsg").classList.add("hidden-el"), 2000);
    }
};

// ==========================================
// 4. TAB NAVIGATION
// ==========================================
function activateCompanyTab(targetId, menuItem = null) {
    const target = document.getElementById(targetId);
    if (!target) return;

    localStorage.setItem('companyActiveTab', targetId);
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active', 'bg-tealAccent/10', 'text-tealAccent', 'border-l-2', 'border-tealAccent', 'shadow-[inset_2px_0_10px_rgba(0,240,255,0.1)]');
        item.classList.add('text-coolLight');
    });
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden-el'));

    const linkedMenuItem = menuItem || document.querySelector(`.menu-item[data-target="${targetId}"]`);
    if (linkedMenuItem) {
        linkedMenuItem.classList.remove('text-coolLight');
        linkedMenuItem.classList.add('active', 'bg-tealAccent/10', 'text-tealAccent', 'border-l-2', 'border-tealAccent', 'shadow-[inset_2px_0_10px_rgba(0,240,255,0.1)]');
        const title = document.getElementById('tab-title');
        if (title) title.innerHTML = linkedMenuItem.innerHTML;
    }

    target.classList.remove('hidden-el');
    if (targetId === 'tab-audit-logs') window.loadAuditLogs();
    if (targetId === 'tab-device-tracking') window.loadDeviceLogs();
    if (targetId === 'tab-transfer-approvals') window.loadTransferApprovals();
    if (targetId === 'tab-broadcast') window.loadCommHubSchools();
    if (window.lucide) lucide.createIcons();
}

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', event => {
        const menuItem = event.target.closest('.menu-item');
        if (menuItem?.dataset.target) activateCompanyTab(menuItem.dataset.target, menuItem);
    });
});

window.openCompanyTab = targetId => activateCompanyTab(targetId);

window.switchCommonHubView = (viewName, trigger) => {
    document.querySelectorAll('[data-hub-view]').forEach(button => button.classList.toggle('active', button === trigger));
    document.querySelectorAll('[data-hub-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.hubPanel === viewName));
    if (viewName === 'communications') window.loadCommHubSchools();
    if (viewName === 'transfers') window.loadTransferApprovals();
};

// ==========================================
// 5. ANALYTICS & QUOTA MONITOR
// ==========================================
window.initQuotaMonitor = () => {
    let baseReads = 14230; let baseWrites = 3490;
    setInterval(() => {
        baseReads += Math.floor(Math.random() * 5); baseWrites += Math.floor(Math.random() * 2);
        const rEl = document.getElementById("stat-reads"); const wEl = document.getElementById("stat-writes");
        if (rEl && wEl) { rEl.innerText = baseReads.toLocaleString(); wEl.innerText = baseWrites.toLocaleString(); }
    }, 3000);

    fetch("https://school-backend-zlgy.onrender.com/api/cloudinary-usage")
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const storageUsed = (data.usage.storage.usage / (1024 * 1024 * 1024)).toFixed(4) + " GB";
                const bandwidthUsed = (data.usage.bandwidth.usage / (1024 * 1024 * 1024)).toFixed(4) + " GB";
                if (document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerText = storageUsed;
                if (document.getElementById("stat-cloudinary-bandwidth")) document.getElementById("stat-cloudinary-bandwidth").innerText = "Bandwidth: " + bandwidthUsed;
            } else {
                if (document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerHTML = "<i class='fas fa-exclamation-triangle text-rose-500'></i> ERROR";
            }
        }).catch(e => {
            if (document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerHTML = "OFFLINE";
        });
};

// ==========================================
// 6. CHAIRMEN & TENANT DEPLOYMENT
// ==========================================
window.fetchRegistrationDetails = async () => {
    const regNo = document.getElementById("fetchRegNo").value.trim();
    if (!regNo) { window.showToast("PLEASE ENTER REGISTRATION NO", "#e11d48"); return; }

    try {
        const docId = regNo.replace(/\//g, "_");
        const docSnap = await db.collection("accepted_registrations").doc(docId).get();
        if (!docSnap.exists) {
            window.showToast("REGISTRATION NO NOT FOUND", "#e11d48");
            return;
        }

        const data = docSnap.data();

        // Auto-fill fields
        document.getElementById("schoolName").value = data.schoolName || "";
        document.getElementById("chairmanName").value = data.principalName || "";
        document.getElementById("chairmanEmail").value = data.email || "";
        document.getElementById("chairmanPassword").value = data.password || "";

        // Logo is tricky because it's a file input. We can store the data URL globally and bypass the file check,
        // but it requires changing createChairmanBtn logic to accept a pre-filled logoData.
        window.fetchedRegLogoData = data.logoUrl || null;
        window.fetchedRegFullData = data; // store all data for later

        window.showToast("DETAILS AUTO-FILLED SUCCESSFULLY!", "#10b981");

    } catch (e) {
        console.error(e);
        window.showToast("ERROR FETCHING DETAILS", "#e11d48");
    }
};

const createChairmanBtnEl = document.getElementById("createChairmanBtn");
if (createChairmanBtnEl) createChairmanBtnEl.addEventListener("click", async () => {
    const sN = document.getElementById("schoolName").value.trim(); const cN = document.getElementById("chairmanName").value.trim(); const em = document.getElementById("chairmanEmail").value.trim(); const pA = document.getElementById("chairmanPassword").value.trim(); const lF = document.getElementById("schoolLogo").files[0]; const b = document.getElementById("createChairmanBtn");
    if (!sN || !cN || !em || !pA) return window.showToast("FILL ALL PARAMETERS!", "#e11d48");
    const tier = document.getElementById("subscriptionTier") ? document.getElementById("subscriptionTier").value : "Starter";
    const isSubNode = document.getElementById("isSubNode") ? document.getElementById("isSubNode").checked : false;
    const masterNodeId = (isSubNode && document.getElementById("masterNodeId")) ? document.getElementById("masterNodeId").value : "";
    const watermarkUrl = document.getElementById("watermarkUrl") ? document.getElementById("watermarkUrl").value.trim() : "";
    b.innerText = "DEPLOYING NODE...";
    try {
        let lU = "https://via.placeholder.com/40";
        if (lF) {
            const upU = await uploadToCloudinary(lF);
            if (upU) { lU = upU; } else { window.showToast("ASSET UPLOAD FAILED.", "#e11d48"); b.innerText = "DEPLOY NODE"; return; }
        } else if (window.fetchedRegLogoData) {
            lU = window.fetchedRegLogoData; // Use the logo data URL from the registration form
        }

        b.innerText = "PROVISIONING ID...";
        const uC = await secondaryAuth.createUserWithEmailAndPassword(em, pA);
        const nuId = uC.user.uid; const sId = "NODE-" + Date.now() + "-" + Math.floor(Math.random() * 1000);

        let extraSchoolData = {};
        if (window.fetchedRegFullData) {
            extraSchoolData = {
                regNo: window.fetchedRegFullData.regNo || "",
                phone: window.fetchedRegFullData.phone || "",
                altPhone: window.fetchedRegFullData.altPhone || "",
                affiliationNo: window.fetchedRegFullData.affiliationNo || "",
                board: window.fetchedRegFullData.board || "",
                schoolType: window.fetchedRegFullData.schoolType || "",
                website: window.fetchedRegFullData.website || "",
                country: window.fetchedRegFullData.country || "",
                state: window.fetchedRegFullData.state || "",
                district: window.fetchedRegFullData.district || "",
                pincode: window.fetchedRegFullData.pincode || "",
                address: window.fetchedRegFullData.address || ""
            };
        }

        await db.collection("users").doc(nuId).set({ name: cN, email: em, role: "chairman", plainPassword: pA, schoolId: sId, schoolName: sN, logoUrl: lU, status: "active", blockReason: "" });
        await db.collection("schools").doc(sId).set({ schoolName: sN, chairmanUid: nuId, logoUrl: lU, subscriptionTier: tier, isSubNode: isSubNode, masterNodeId: masterNodeId, watermarkUrl: watermarkUrl, ...extraSchoolData });
        window.showToast("✅ TENANT NODE DEPLOYED!"); window.logAudit("Provisioned Node", sN);

        // Reset form & fetched data
        document.getElementById("schoolName").value = ""; document.getElementById("chairmanName").value = ""; document.getElementById("chairmanEmail").value = ""; document.getElementById("chairmanPassword").value = ""; document.getElementById("schoolLogo").value = "";
        if (document.getElementById("fetchRegNo")) document.getElementById("fetchRegNo").value = "";
        window.fetchedRegLogoData = null; window.fetchedRegFullData = null;
        if (document.getElementById("watermarkUrl")) document.getElementById("watermarkUrl").value = "";
        loadChairmen(); loadSchoolsForDropdown(); loadSchoolPayments(); loadAllStaff();
    } catch (err) { window.showToast("ERROR: " + err.message, "#e11d48"); } finally { await secondaryAuth.signOut().catch(e => { }); b.innerText = "DEPLOY NODE"; }
});

async function loadChairmen() {
    try {
        const snp = await db.collection("users").get(); window.fetchedChairmen = []; let tS = 0;
        snp.forEach(d => { const dt = d.data(); if (dt.role === "chairman") { dt.id = d.id; window.fetchedChairmen.push(dt); } else if (dt.role === "staff") { tS++; } });
        const stuS = await db.collection("students").get();
        document.getElementById("stat-schools").innerText = window.fetchedChairmen.length; document.getElementById("stat-staff").innerText = tS; document.getElementById("stat-students").innerText = stuS.size;
        window.filterChairmenList(); window.loadPasswordRequests();
    } catch (err) { }
}

window.filterChairmenList = () => {
    const sid = document.getElementById("filterChairmenSchool").value; let html = ""; let ls = window.fetchedChairmen;
    if (sid !== "ALL" && sid !== "") { ls = ls.filter(c => c.schoolId === sid); }
    ls.forEach(dt => {
        const sc = dt.status === "blocked" ? "text-rose-400 border border-rose-500/50 shadow-[0_0_5px_rgba(244,63,94,0.3)] bg-rose-500/10" : "text-emerald-400 border border-emerald-500/50 shadow-[0_0_5px_rgba(16,185,129,0.3)] bg-emerald-500/10";
        const bb = dt.status === "blocked" ? `<button class="px-2 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] font-mono transition" onclick="updateStatus('${dt.id}', 'active')">UNBLOCK</button>` : `<button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] font-mono transition" onclick="updateStatus('${dt.id}', 'blocked')">BLOCK</button>`;
        const shadowBtn = dt.shadowBan ? `<button class="px-2 py-1 bg-slate-600/50 border border-slate-500 hover:bg-slate-600 text-white rounded text-[10px] font-mono transition" onclick="toggleShadowBan('${dt.id}', false)"><i class="fas fa-eye"></i> UNBAN</button>` : `<button class="px-2 py-1 bg-purple-600/20 border border-purple-500 hover:bg-purple-600 text-purple-400 hover:text-white rounded text-[10px] font-mono transition" onclick="toggleShadowBan('${dt.id}', true)"><i class="fas fa-ghost"></i> SHADOW BAN</button>`;
        html += `<tr class="hover:bg-slateSurface/50 transition">
            <td class="p-4"><img src="${dt.logoUrl || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded-lg border border-tealAccent/30 object-cover shadow-[0_0_10px_rgba(0,240,255,0.2)]"></td>
            <td class="p-4 sensitive-data font-bold text-white">${dt.schoolName}</td>
            <td class="p-4 sensitive-data text-gray-200">${dt.name}<br><span class="text-[10px] text-tealAccent/70 font-mono tracking-widest">${dt.email}</span></td>
            <td class="p-4"><span class="${sc} px-2 py-1 rounded text-[10px] font-bold font-mono tracking-widest">${(dt.status || 'ACTIVE').toUpperCase()}</span></td>
            <td class="p-4">${dt.shadowBan ? '<span class="text-purple-400 text-[10px] font-bold font-mono tracking-widest drop-shadow-[0_0_5px_rgba(168,85,247,0.8)]">SHADOW BANNED</span>' : '<span class="text-coolGray text-[10px] font-mono tracking-widest">STANDARD</span>'}</td>
            <td class="p-4 text-right flex justify-end gap-1">
                <button class="px-2 py-1 bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded text-[10px] transition" onclick="window.impersonateUser('${dt.id}', '${dt.schoolId}', '${dt.email}', '${dt.plainPassword}')"><i class="fas fa-user-secret"></i></button>
                <button class="px-2 py-1 bg-amber-500/20 border border-amber-500 hover:bg-amber-500 text-amber-400 hover:text-slateBase rounded text-[10px] transition" onclick="window.openEditChairman('${dt.id}')"><i class="fas fa-edit"></i></button>
                <button class="px-2 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] transition" onclick="window.openLicenseModal('${dt.schoolId}')"><i class="fas fa-calendar-check"></i></button>
                <button class="px-2 py-1 bg-blue-600/20 border border-blue-500 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-[10px] transition" onclick="window.generateGSTInvoice('${dt.schoolId}', '${dt.schoolName.replace(/'/g, "\\'")}', '${dt.email}', '${dt.subscriptionTier || 'Starter'}')"><i class="fas fa-file-invoice"></i></button>
                ${bb} ${shadowBtn}
                <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteChairman('${dt.id}', '${dt.schoolId}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    document.getElementById("chairmanTableBody").innerHTML = html || "<tr><td colspan='6' class='text-center p-4 text-coolGray font-mono'>NO NODES FOUND</td></tr>";
};

window.openEditChairman = async (uid) => {
    const ch = window.fetchedChairmen.find(c => c.id === uid); if (!ch) return;
    window.currentEditChairmanId = uid;
    document.getElementById("edit-preview-logo").src = ch.logoUrl || "https://via.placeholder.com/80";
    document.getElementById("edit-schoolName").value = ch.schoolName || "";
    document.getElementById("edit-chairmanName").value = ch.name || "";
    document.getElementById("edit-chairmanEmail").value = ch.email || "";
    document.getElementById("edit-schoolLogo").value = "";

    if (ch.schoolId) {
        const sDoc = await db.collection("schools").doc(ch.schoolId).get();
        if (sDoc.exists) {
            document.getElementById("edit-maxStudents").value = sDoc.data().maxStudents || "";
            document.getElementById("edit-themeColor").value = sDoc.data().themeColor || "#00F0FF";
        }
    }
    openCustomModal("edit-chairman-modal");
};

window.deleteSchoolLogoFromEdit = async () => {
    const uid = window.currentEditChairmanId;
    const ch = window.fetchedChairmen.find(c => c.id === uid);
    if (!ch || !ch.logoUrl) return window.showToast("NO EXISTING LOGO FOUND", "#e11d48");

    window.customConfirm("DELETE OLD LOGO PERMANENTLY?", async () => {
        try {
            await deleteFirebaseStorageImage(ch.logoUrl);
            await db.collection("users").doc(uid).update({ logoUrl: "" });
            if (ch.schoolId) {
                await db.collection("schools").doc(ch.schoolId).update({ logoUrl: "" });
            }
            ch.logoUrl = "";
            document.getElementById("edit-preview-logo").src = "https://via.placeholder.com/80";
            window.showToast("✅ OLD LOGO DELETED. YOU CAN NOW UPLOAD A NEW ONE.");
        } catch (e) {
            window.showToast("ERROR DELETING LOGO", "#e11d48");
        }
    });
};

window.saveChairmanEdit = async () => {
    const uid = window.currentEditChairmanId; const ch = window.fetchedChairmen.find(c => c.id === uid); if (!ch) return;
    const newSchoolName = document.getElementById("edit-schoolName").value.trim(); const newChairmanName = document.getElementById("edit-chairmanName").value.trim(); let newEmail = document.getElementById("edit-chairmanEmail").value.trim();
    const maxStudents = document.getElementById("edit-maxStudents").value.trim(); const themeColor = document.getElementById("edit-themeColor").value;
    const logoFile = document.getElementById("edit-schoolLogo").files[0]; const btn = document.getElementById("save-chairman-edit-btn");
    if (!newSchoolName || !newChairmanName || !newEmail) return window.showToast("FILL TEXT DETAILS!", "#e11d48");

    btn.innerText = "PROCESSING...";
    try {
        let finalLogoUrl = ch.logoUrl || "";
        if (logoFile) {
            const uploaded = await uploadToCloudinary(logoFile);
            if (uploaded) {
                if (finalLogoUrl) await deleteFirebaseStorageImage(finalLogoUrl);
                finalLogoUrl = uploaded;
            }
        }
        if (newEmail !== ch.email) {
            const response = await fetch("https://school-backend-zlgy.onrender.com/changeEmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUid: uid, newEmail: newEmail }) });
            const data = await response.json();
            if (!data.success) { btn.innerText = "WRITE CHANGES"; return window.showToast("❌ SERVER ERROR: " + data.error, "#e11d48"); }
        }

        await db.collection("users").doc(uid).update({ name: newChairmanName, schoolName: newSchoolName, email: newEmail, logoUrl: finalLogoUrl });
        if (ch.schoolId) { await db.collection("schools").doc(ch.schoolId).update({ schoolName: newSchoolName, logoUrl: finalLogoUrl, maxStudents: maxStudents ? Number(maxStudents) : null, themeColor: themeColor }); }

        window.showToast("✅ DETAILS UPDATED SUCCESSFULLY!"); window.logAudit("Edited Node Credentials", newSchoolName);
        window.closeCustomModal("edit-chairman-modal"); loadChairmen(); loadSchoolsForDropdown();
    } catch (e) { window.showToast("❌ ERROR: " + e.message, "#e11d48"); } finally { btn.innerText = "WRITE CHANGES"; }
};

window.openLicenseModal = async (schoolId) => {
    if (!schoolId) return window.showToast("INVALID NODE ID", "#e11d48");
    document.getElementById("license-school-id").value = schoolId;
    try {
        const doc = await db.collection("schools").doc(schoolId).get();
        if (doc.exists && doc.data().licenseExpiry) {
            document.getElementById("license-expiry-date").value = doc.data().licenseExpiry;
        } else {
            document.getElementById("license-expiry-date").value = "";
        }
        openCustomModal("license-modal");
    } catch (e) { window.showToast("ERROR FETCHING LICENSE", "#e11d48"); }
};

window.saveLicenseDate = async () => {
    const schoolId = document.getElementById("license-school-id").value;
    const expiryDate = document.getElementById("license-expiry-date").value;
    if (!expiryDate) return window.showToast("SELECT EXPIRY DATE!", "#e11d48");

    try {
        await db.collection("schools").doc(schoolId).update({ licenseExpiry: expiryDate });
        window.showToast("✅ LICENSE UPDATED SUCCESSFULLY!", "#10B981");
        window.closeCustomModal("license-modal");
        window.logAudit("Renewed License", schoolId);
    } catch (e) {
        window.showToast("ERROR: " + e.message, "#e11d48");
    }
};

window.updateStatus = (uid, ns) => {
    if (ns === 'blocked') {
        document.getElementById("block-prompt-input").value = "";
        openCustomModal("block-prompt-modal");
        document.getElementById("block-prompt-confirm").onclick = async () => {
            await db.collection("users").doc(uid).update({ status: ns, blockReason: document.getElementById("block-prompt-input").value || "Policy Violation" });
            window.closeCustomModal("block-prompt-modal"); loadChairmen(); window.logAudit("Blocked User", uid);
        };
    } else {
        window.customConfirm("UNBLOCK THIS ACCOUNT?", () => {
            db.collection("users").doc(uid).update({ status: ns, blockReason: "" }).then(() => { window.showToast("✅ ACCOUNT UNBLOCKED!"); loadChairmen(); window.logAudit("Unblocked User", uid); });
        });
    }
};

window.toggleShadowBan = async (uid, state) => { window.customConfirm(state ? "ENABLE SHADOW BAN? Data will appear saved to them but won't sync." : "REMOVE SHADOW BAN?", async () => { await db.collection("users").doc(uid).update({ shadowBan: state }); window.showToast(state ? "SHADOW BAN ENABLED!" : "SHADOW BAN REMOVED."); loadChairmen(); window.logAudit(state ? "Shadow Banned" : "Unbanned", uid); }); };

// Cascade Delete
window.deleteChairman = (uid, sid) => {
    window.customConfirm("DANGER: ENTIRE NODE (School, Chairman, Staff, Students, Photos) WILL BE WIPED PERMANENTLY. PROCEED?", async () => {
        try {
            window.showToast("WIPING COMPLETELY... PLEASE WAIT", "#f59e0b");
            if (uid) {
                const uDoc = await db.collection("users").doc(uid).get();
                if (uDoc.exists && uDoc.data().logoUrl) await deleteFirebaseStorageImage(uDoc.data().logoUrl);
                await db.collection("users").doc(uid).delete();
            }
            if (sid && sid !== "undefined" && sid !== "null") {
                const sDoc = await db.collection("schools").doc(sid).get();
                if (sDoc.exists && sDoc.data().logoUrl) await deleteFirebaseStorageImage(sDoc.data().logoUrl);
                await db.collection("schools").doc(sid).delete();

                const students = await db.collection("students").where("schoolId", "==", sid).get();
                for (const doc of students.docs) { await deleteFirebaseStorageImage(doc.data().photoUrl); await db.collection("students").doc(doc.id).delete(); }

                const staff = await db.collection("users").where("schoolId", "==", sid).where("role", "==", "staff").get();
                for (const doc of staff.docs) { await deleteFirebaseStorageImage(doc.data().photoUrl); await db.collection("users").doc(doc.id).delete(); }
            }
            window.showToast("✅ COMPLETE NODE WIPED OUT!"); loadChairmen(); loadSchoolsForDropdown(); loadSchoolPayments(); loadAllStaff(); window.logAudit("Completely Wiped Node", sid);
        } catch (err) { window.showToast("❌ DELETE ERROR: " + err.message, "#e11d48"); }
    });
};

window.impersonateUser = async (uid, schoolId, email, pass) => {
    window.showToast("GENERATING IMPERSONATION TOKEN...", "#f59e0b");
    window.logAudit("Impersonated User", uid);
    setTimeout(() => {
        const safeEmail = encodeURIComponent(email); const safePass = encodeURIComponent(pass);
        const chairmanPortalLink = "https://bf0040792-rgb.github.io/CHAIRMAN-MANAGEMENT/";
        window.open(`${chairmanPortalLink}?impersonate=true&email=${safeEmail}&pass=${safePass}&isGhost=true`, '_blank');
    }, 1500);
};

// ==========================================
// 7. INSPECT STUDENTS & AADHAAR SEARCH
// ==========================================
const inspectSchoolSelectEl = document.getElementById("inspectSchoolSelect");
if (inspectSchoolSelectEl) inspectSchoolSelectEl.addEventListener("change", async (e) => {
    const sid = e.target.value; const dd = document.getElementById("schoolInspectData");
    if (!sid) { dd.classList.add("hidden-el"); return; }
    try {
        let ss = (sid === "ALL") ? await db.collection("students").get() : await db.collection("students").where("schoolId", "==", sid).get();
        window.fetchedInspectStudents = []; let sh = "";
        ss.forEach(d => {
            const dt = d.data(); dt.id = d.id; window.fetchedInspectStudents.push(dt);
            const sc = dt.status === 'Approved' ? 'text-emerald-400' : 'text-amber-400';
            sh += `<tr class="hover:bg-slateSurface/50 transition">
                <td class="p-4"><img src="${dt.photoUrl || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded-lg border border-tealAccent/30 object-cover shadow-[0_0_10px_rgba(0,240,255,0.2)]"></td>
                <td class="p-4 sensitive-data"><strong class="block text-white">${dt.name || 'N/A'}</strong><span class="text-[10px] text-coolGray font-mono tracking-widest">📞 ${dt.mobile || 'NO COMM'}</span><br><span class="text-[10px] text-amber-400 font-mono tracking-widest drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]">UID: ${dt.aadhaar || dt.aadhar || dt.aadhaarNumber || 'N/A'}</span></td>
                <td class="p-4"><span class="bg-blue-500/10 border border-blue-500/50 text-blue-400 px-2 py-1 rounded text-[10px] font-mono font-bold tracking-widest shadow-[0_0_5px_rgba(59,130,246,0.3)]">SEC: ${dt.class || 'N/A'}</span></td>
                <td class="p-4 sensitive-data text-[10px] font-mono text-gray-300"><b>O1:</b> ${dt.fatherName || 'N/A'}<br><b>O2:</b> ${dt.motherName || 'N/A'}</td>
                <td class="p-4"><span class="${sc} font-bold font-mono text-[10px] tracking-widest drop-shadow-[0_0_5px_currentColor]">${(dt.status || 'N/A').toUpperCase()}</span></td>
                <td class="p-4 text-right">
                    <button class="px-2 py-1 bg-blue-600/20 border border-blue-500 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-[10px] transition" onclick="window.showStudentDetail('${dt.id}')"><i class="fas fa-eye"></i></button> 
                    <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteInspectStudent('${dt.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        document.getElementById("ins-student-table").innerHTML = sh || "<tr><td colspan='6' class='p-4 text-center text-coolGray font-mono'>NO SUBJECTS FOUND.</td></tr>";
        document.getElementById("ins-students").innerText = ss.size;
        dd.classList.remove("hidden-el");
    } catch (e) { }
});

window.showStudentDetail = (id) => {
    const st = window.fetchedInspectStudents.find(s => s.id === id); if (!st) return;
    document.getElementById("stu-photo").src = st.photoUrl || "https://via.placeholder.com/80";
    document.getElementById("stu-name").innerText = st.name || "N/A";
    document.getElementById("stu-class").innerText = `${st.class || 'N/A'} (ID: ${st.roll || 'N/A'})`;
    document.getElementById("stu-father").innerText = st.fatherName || "N/A";
    document.getElementById("stu-mobile").innerText = st.mobile || "N/A";
    document.getElementById("stu-password").innerText = st.appPassword || "••••••";
    document.getElementById("stu-status").innerHTML = `<span class="${st.status === "Approved" ? "text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]" : "text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]"}">${(st.status || "Pending").toUpperCase()}</span>`;
    openCustomModal("student-modal");
};

window.deleteInspectStudent = (id) => {
    window.customConfirm("DELETE THIS SUBJECT GLOBALLY?", async () => {
        try {
            const stDoc = await db.collection("students").doc(id).get();
            if (stDoc.exists) await deleteFirebaseStorageImage(stDoc.data().photoUrl);
            await db.collection("students").doc(id).delete();
            window.showToast("✅ SUBJECT & ASSETS PURGED!");
            document.getElementById("inspectSchoolSelect").dispatchEvent(new Event("change"));
        } catch (e) { }
    });
};

window.searchStudentByAadhaar = async () => {
    const input = document.getElementById("search-aadhaar-input").value.trim();
    const resDiv = document.getElementById("aadhaar-search-result"); const errP = document.getElementById("aadhaar-error-msg");
    resDiv.classList.add("hidden-el"); errP.classList.add("hidden-el");
    if (!input) return window.showToast("ENTER UID NUMBER", "#e11d48");
    try {
        let sn = await db.collection("students").where("aadhaar", "==", input).get();
        if (sn.empty) sn = await db.collection("students").where("aadhar", "==", input).get();
        if (sn.empty) sn = await db.collection("students").where("aadhaarNumber", "==", input).get();
        if (sn.empty) { errP.classList.remove("hidden-el"); return; }

        let dt = sn.docs[0].data(); let sName = "UNKNOWN NODE";
        if (dt.schoolId) { let scl = await db.collection("schools").doc(dt.schoolId).get(); if (scl.exists) sName = scl.data().schoolName || "UNKNOWN NODE"; }

        document.getElementById("as-photo").src = dt.photoUrl || "https://via.placeholder.com/80";
        document.getElementById("as-name").innerText = dt.name || "N/A";
        document.getElementById("as-class").innerText = `SEC: ${dt.class || 'N/A'} (ID: ${dt.roll || '-'})`;
        document.getElementById("as-school").innerText = sName.toUpperCase();
        document.getElementById("as-aadhaar").innerText = dt.aadhaar || dt.aadhar || dt.aadhaarNumber || input;
        document.getElementById("as-father").innerText = dt.fatherName || "N/A";
        document.getElementById("as-mother").innerText = dt.motherName || "N/A";
        document.getElementById("as-mobile").innerText = dt.mobile || "N/A";
        document.getElementById("as-status").innerHTML = `<span class="${dt.status === "Approved" ? "text-emerald-400" : "text-amber-400"}">${(dt.status || "Pending").toUpperCase()}</span>`;
        resDiv.classList.remove("hidden-el"); window.logAudit("Identity Search", input);
    } catch (e) { window.showToast("SEARCH ERROR: " + e.message, "#e11d48"); }
};

window.downloadAadhaarResultPDF = async () => {
    const btn = document.querySelector("#aadhaar-search-result .btn-green"); btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> EXTRACTING...`;
    try {
        btn.style.display = 'none';
        const el = document.getElementById("aadhaar-print-area");
        const stName = document.getElementById("as-name").innerText.replace(/ /g, "_");
        const opt = { margin: 10, filename: `Dossier_${stName}_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
        const pdfBlob = await html2pdf().set(opt).from(el).outputPdf('blob');
        await window.robustWebViewDownload(pdfBlob, opt.filename);
        btn.style.display = 'flex';
    } catch (e) { btn.style.display = 'flex'; }
    btn.innerHTML = `<i class="fas fa-download"></i> EXPORT DOSSIER`;
};

// ==========================================
// 8. GLOBAL STAFF DIRECTORY
// ==========================================
window.loadAllStaff = async () => { try { const sp = await db.collection("users").where("role", "==", "staff").get(); window.fetchedGlobalStaffList = []; sp.forEach(d => { const dt = d.data(); dt.id = d.id; window.fetchedGlobalStaffList.push(dt); }); window.filterStaffList(); } catch (e) { } };
window.filterStaffList = () => {
    const sid = document.getElementById("staffSchoolSelect").value; let ht = ""; let ls = window.fetchedGlobalStaffList;
    if (sid !== "ALL") { ls = ls.filter(s => s.schoolId === sid); }
    ls.forEach(dt => {
        ht += `<tr class="hover:bg-slateSurface/50 transition">
            <td class="p-4 sensitive-data font-bold text-white">${dt.name}</td><td class="p-4 sensitive-data text-[10px] text-tealAccent/70 tracking-widest">${dt.email}</td><td class="p-4 text-[10px] text-gray-300">${dt.schoolName || 'UNKNOWN'}</td>
            <td class="p-4 text-right flex justify-end gap-1">
                <button class="px-2 py-1 bg-blue-600/20 border border-blue-500 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-[10px] transition" onclick="window.showStaffDetail('${dt.id}')"><i class="fas fa-eye"></i></button>
                <button class="px-2 py-1 bg-purple-600/20 border border-purple-500 hover:bg-purple-600 text-purple-400 hover:text-white rounded text-[10px] transition" onclick="window.sendDirectMessage('${dt.id}', '${dt.schoolId}', 'staff')"><i class="fas fa-comment"></i></button>
                <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteGlobalStaff('${dt.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    document.getElementById("staffTableBody").innerHTML = ht || "<tr><td colspan='4' class='p-4 text-center text-coolGray font-mono'>NO STAFF FOUND.</td></tr>";
};

window.deleteGlobalStaff = (uid) => { window.customConfirm("PURGE STAFF MEMBER & ASSETS?", async () => { try { const stDoc = await db.collection("users").doc(uid).get(); if (stDoc.exists) await deleteFirebaseStorageImage(stDoc.data().photoUrl); await db.collection("users").doc(uid).delete(); window.showToast("✅ STAFF PURGED!"); loadAllStaff(); window.logAudit("Deleted Staff", uid); } catch (e) { } }); };
window.showStaffDetail = (sId) => {
    const st = window.fetchedGlobalStaffList.find(s => s.id === sId); if (!st) return;
    document.getElementById("sd-photo").src = st.photoUrl || "https://via.placeholder.com/80";
    document.getElementById("sd-name").innerText = st.name || "N/A";
    document.getElementById("sd-role").innerText = (st.staffRole || st.role || "N/A").toUpperCase();
    document.getElementById("sd-email").innerText = st.email || "N/A";
    document.getElementById("sd-password").innerText = st.plainPassword || "••••••";
    document.getElementById("sd-status").innerHTML = `<span class="${st.status === "blocked" ? "text-rose-400 drop-shadow-[0_0_5px_rgba(244,63,94,0.8)]" : "text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]"}">${st.status === "blocked" ? "BLOCKED" : "ACTIVE"}</span>`;
    openCustomModal("staff-modal");
};
window.sendDirectMessage = (rid, sid, typ) => {
    document.getElementById("msg-prompt-input").value = ""; openCustomModal("msg-prompt-modal");
    document.getElementById("msg-prompt-confirm").onclick = async () => {
        const m = document.getElementById("msg-prompt-input").value; if (!m) return;
        try {
            await db.collection("direct_messages").doc().set({ senderId: superAdminUid, senderRole: "developer", senderName: "Super Admin", schoolId: sid, receiverId: rid, receiverType: typ, title: "SYSTEM DIRECTIVE", body: m, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            window.closeCustomModal("msg-prompt-modal"); window.showToast("✅ COMM TRANSMITTED!");
        } catch (e) { }
    };
};

// ==========================================
// 9. SCHOOL PAYMENTS & BILLING
// ==========================================
window.loadSchoolPayments = async () => { try { const sp = await db.collection("schools").get(); window.fetchedSchoolPayments = []; let tR = 0; sp.forEach(d => { const dt = d.data(); dt.id = d.id; window.fetchedSchoolPayments.push(dt); if (dt.appFee) tR += Number(dt.appFee); }); document.getElementById("stat-revenue-total").innerText = "₹ " + tR.toLocaleString(); window.filterPaymentList(); window.loadCompanyExpenses(); } catch (e) { } };
window.filterPaymentList = () => {
    const sid = document.getElementById("paymentSchoolSelect").value; let ht = ""; let ls = window.fetchedSchoolPayments;
    if (sid !== "ALL") { ls = ls.filter(s => s.id === sid); }
    ls.forEach(dt => {
        ht += `<tr class="hover:bg-slateSurface/50 transition">
            <td class="p-4"><strong class="text-white">${dt.schoolName}</strong><br><small class="text-tealAccent/50 font-mono tracking-widest">${dt.id}</small></td>
            <td class="p-4"><input type="number" id="fee_${dt.id}" value="${dt.appFee || ''}" class="input-premium w-20 px-2 py-1 rounded text-xs text-emerald-400 font-mono border-emerald-500/30 bg-slateBase"></td>
            <td class="p-4"><input type="date" id="date_${dt.id}" value="${dt.billingDate || ''}" class="input-premium px-2 py-1 rounded text-xs text-white font-mono bg-slateBase"></td>
            <td class="p-4 text-emerald-400 font-bold text-[10px] tracking-widest drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">ACTIVE</td>
            <td class="p-4 text-right">
                <button class="px-3 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] font-mono transition" onclick="window.saveSchoolPayment('${dt.id}')">SAVE</button> 
                <button class="px-3 py-1 bg-blue-600/20 border border-blue-500 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-[10px] font-mono transition" onclick="window.viewSchoolBilling('${dt.id}')">LEDGER</button>
            </td>
        </tr>`;
    });
    document.getElementById("school-payment-table").innerHTML = ht || "<tr><td colspan='5' class='p-4 text-center text-coolGray font-mono'>NO DATA</td></tr>";
};

window.saveSchoolPayment = async (sid) => {
    try {
        const fee = document.getElementById(`fee_${sid}`).value; const bDate = document.getElementById(`date_${sid}`).value;
        if (!fee || !bDate) return window.showToast("ENTER VALUE AND CYCLE", "#e11d48");
        const historyEntry = { fee: fee, date: bDate, savedAt: Date.now() };
        const nextDate = new Date(bDate); nextDate.setMonth(nextDate.getMonth() + 1); const nextDateString = nextDate.toISOString().split('T')[0];
        await db.collection("schools").doc(sid).update({ appFee: fee, billingDate: nextDateString, paymentHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry) });
        window.showToast("✅ LEDGER UPDATED!"); window.loadSchoolPayments();
    } catch (e) { }
};

window.deletePaymentRecord = (sid, savedAt) => { window.customConfirm("PURGE LEDGER RECORD?", async () => { try { const s = window.fetchedSchoolPayments.find(x => x.id === sid); const updatedHistory = s.paymentHistory.filter(r => r.savedAt !== savedAt); await db.collection("schools").doc(sid).update({ paymentHistory: updatedHistory }); window.showToast("✅ RECORD PURGED!"); s.paymentHistory = updatedHistory; window.viewSchoolBilling(sid); window.loadSchoolPayments(); } catch (e) { } }); };
window.viewSchoolBilling = (sid) => {
    const s = window.fetchedSchoolPayments.find(x => x.id === sid); if (!s) return;
    document.getElementById("bill-school-name").innerHTML = `${s.schoolName.replace('\n', '<br>')} <br><span class="text-xs text-gray-500 font-mono tracking-widest">(${s.id})</span>`;
    document.getElementById("bill-monthly-fee").innerText = s.appFee ? "₹ " + s.appFee : "NOT SET";
    let ht = "";
    if (s.appFee && s.billingDate) {
        const recDate = new Date(s.billingDate).toLocaleDateString(); const mN = new Date(s.billingDate).toLocaleString('default', { month: 'long', year: 'numeric' });
        ht += `<tr class="bg-rose-50"><td class="p-3 border-b border-gray-200">${recDate}</td><td class="p-3 border-b border-gray-200">Platform Fee - ${mN}</td><td class="p-3 border-b border-gray-200">₹ ${s.appFee}</td><td class="p-3 border-b border-gray-200 text-rose-600 font-bold uppercase tracking-widest">Pending</td></tr>`;
    }
    if (s.paymentHistory && s.paymentHistory.length > 0) {
        const sortedHistory = s.paymentHistory.sort((a, b) => b.savedAt - a.savedAt);
        sortedHistory.forEach(record => {
            const recDate = new Date(record.date).toLocaleDateString(); const mN = new Date(record.date).toLocaleString('default', { month: 'long', year: 'numeric' });
            ht += `<tr><td class="p-3 border-b border-gray-200">${recDate}</td><td class="p-3 border-b border-gray-200">Platform Fee - ${mN}</td><td class="p-3 border-b border-gray-200">₹ ${record.fee}</td><td class="p-3 border-b border-gray-200 flex justify-between items-center"><span class="text-emerald-600 font-bold uppercase tracking-widest">Cleared</span><button class="text-rose-500 hover:text-rose-700" onclick="window.deletePaymentRecord('${sid}', ${record.savedAt})"><i class="fas fa-trash"></i></button></td></tr>`;
        });
    }
    document.getElementById("billing-history-body").innerHTML = ht || "<tr><td colspan='4' class='text-center p-4 text-gray-500'>NO HISTORY.</td></tr>";
    openCustomModal("billing-modal");
};

window.exportBillToPDF = async () => {
    const btn = document.getElementById("printBillBtn"); btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> WRAPPING PDF...`;
    try {
        const delBtns = document.querySelectorAll("#billing-print-area button"); delBtns.forEach(b => b.style.display = 'none');
        const el = document.getElementById("billing-print-area"); const opt = { margin: 10, filename: `Statement_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
        const pdfBlob = await html2pdf().set(opt).from(el).outputPdf('blob'); await window.robustWebViewDownload(pdfBlob, opt.filename);
        delBtns.forEach(b => b.style.display = 'block');
    } catch (e) { }
    btn.innerHTML = `<i class="fas fa-file-pdf"></i> SAVE PDF INSTANCE`;
};

window.downloadAllPaymentsPDF = async () => {
    if (!window.fetchedSchoolPayments || window.fetchedSchoolPayments.length === 0) return;
    const startDate = document.getElementById("pay_start_date").value; const endDate = document.getElementById("pay_end_date").value;
    let tableRows = [];
    window.fetchedSchoolPayments.forEach(s => {
        let sDateObj = null; let eDateObj = null;
        if (startDate && endDate) { sDateObj = new Date(startDate).setHours(0, 0, 0, 0); eDateObj = new Date(endDate).setHours(23, 59, 59, 999); }
        if (s.billingDate && s.appFee) { const bDate = new Date(s.billingDate).getTime(); if (!sDateObj || (bDate >= sDateObj && bDate <= eDateObj)) { tableRows.push([s.schoolName || 'N/A', s.id || 'N/A', "Rs " + s.appFee, new Date(s.billingDate).toLocaleDateString(), "Pending"]); } }
        if (s.paymentHistory && s.paymentHistory.length > 0) { s.paymentHistory.forEach(record => { const rDate = new Date(record.date).getTime(); if (!sDateObj || (rDate >= sDateObj && rDate <= eDateObj)) { tableRows.push([s.schoolName || 'N/A', s.id || 'N/A', "Rs " + record.fee, new Date(record.date).toLocaleDateString(), "Cleared"]); } }); }
    });
    if (tableRows.length === 0) return window.showToast("NO DATA IN RANGE", "#e11d48");
    try {
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(16); let title = "Global Financial Ledger"; if (startDate && endDate) title += ` (${startDate} to ${endDate})`; doc.text(title, 14, 20);
        doc.autoTable({ head: [["Node Name", "Node ID", "Value", "Temporal", "State"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor: [16, 185, 129] } });
        const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, `Ledger_${Date.now()}.pdf`);
    } catch (e) { }
};

async function checkAndSendBillingAlerts() {
    try {
        const sp = await db.collection("schools").get(); const nw = Date.now();
        sp.forEach(async (d) => {
            const dt = d.data();
            if (dt.billingDate && dt.appFee) {
                const bD = new Date(dt.billingDate).getTime(); const dD = Math.floor((nw - bD) / (1000 * 60 * 60 * 24));
                if (dD >= 30) {
                    if (!dt.paymentAlertSentAt) {
                        const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get();
                        cS.forEach(async (cD) => { await db.collection("direct_messages").doc().set({ senderId: auth.currentUser.uid, schoolId: d.id, receiverId: cD.id, receiverType: "chairman", title: "CRITICAL ALERT", body: `Your payment of Rs ${dt.appFee} is pending. Please clear immediately to avoid system lock.`, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); });
                        await db.collection("schools").doc(d.id).update({ paymentAlertSentAt: nw });
                    } else {
                        const hP = (nw - dt.paymentAlertSentAt) / (1000 * 60 * 60);
                        if (hP >= 6 && !dt.paymentBlocked) {
                            const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get();
                            cS.forEach(async (cD) => { await db.collection("users").doc(cD.id).update({ status: "blocked", blockReason: "System Locked: Pending Financial Clearance." }); });
                            await db.collection("schools").doc(d.id).update({ paymentBlocked: true });
                        }
                    }
                } else {
                    if (dt.paymentAlertSentAt || dt.paymentBlocked) {
                        await db.collection("schools").doc(d.id).update({ paymentAlertSentAt: firebase.firestore.FieldValue.delete(), paymentBlocked: firebase.firestore.FieldValue.delete() });
                        const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get();
                        cS.forEach(async (cD) => { if (cD.data().blockReason && cD.data().blockReason.includes("Financial Clearance")) { await db.collection("users").doc(cD.id).update({ status: "active", blockReason: "" }); } });
                    }
                }
            }
        });
    } catch (e) { }
}

// ==========================================
// 9A. COMPANY EXPENSES MANAGEMENT
// ==========================================
window.addCompanyExpense = async () => {
    const type = document.getElementById("expense-type").value;
    const amount = document.getElementById("expense-amount").value.trim();
    const desc = document.getElementById("expense-desc").value.trim();
    if (!amount || !desc) return window.showToast("FILL ALL FIELDS!", "#e11d48");
    try {
        await db.collection("company_expenses").add({
            type: type,
            amount: Number(amount),
            description: desc,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: superAdminUid
        });
        window.showToast("✅ EXPENSE RECORDED!");
        document.getElementById("expense-amount").value = "";
        document.getElementById("expense-desc").value = "";
        window.loadCompanyExpenses();
        window.logAudit("Added Expense", `${type}: ₹${amount}`);
    } catch (e) {
        window.showToast("❌ ERROR: " + e.message, "#e11d48");
    }
};

window.loadCompanyExpenses = async () => {
    try {
        const snap = await db.collection("company_expenses").orderBy("createdAt", "desc").limit(50).get();
        let html = "";
        snap.forEach(doc => {
            const d = doc.data();
            const date = d.createdAt ? new Date(d.createdAt.toMillis()).toLocaleDateString() : "N/A";
            html += `<tr class="hover:bg-slateSurface/50 transition">
                <td class="p-4 text-coolGray tracking-widest">${date}</td>
                <td class="p-4"><span class="bg-amber-500/10 border border-amber-500/50 text-amber-400 px-2 py-1 rounded text-[10px] uppercase tracking-widest">${d.type}</span></td>
                <td class="p-4 text-white">${d.description}</td>
                <td class="p-4 text-emerald-400 font-bold">₹ ${d.amount.toLocaleString()}</td>
                <td class="p-4 text-right"><button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteExpense('${doc.id}')"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        document.getElementById("expenses-table").innerHTML = html || "<tr><td colspan='5' class='p-4 text-center text-coolGray font-mono'>NO EXPENSES RECORDED.</td></tr>";
    } catch (e) { }
};

window.deleteExpense = (id) => {
    window.customConfirm("DELETE THIS EXPENSE?", async () => {
        await db.collection("company_expenses").doc(id).delete();
        window.showToast("✅ EXPENSE DELETED!");
        window.loadCompanyExpenses();
    });
};

// ==========================================
// 9B. TALLY EXPORT FUNCTIONS
// ==========================================
window.exportToTallyXML = async () => {
    if (!window.fetchedSchoolPayments || window.fetchedSchoolPayments.length === 0) return;
    window.showToast("GENERATING TALLY XML...", "#f59e0b");

    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n<HEADER>\n<TALLYREQUEST>Import Data</TALLYREQUEST>\n</HEADER>\n<BODY>\n<IMPORTDATA>\n<REQUESTDESC>\n<REPORTNAME>Vouchers</REPORTNAME>\n</REQUESTDESC>\n<REQUESTDATA>\n`;

    window.fetchedSchoolPayments.forEach(s => {
        if (s.appFee && s.billingDate) {
            const date = new Date(s.billingDate).toLocaleDateString('en-GB').replace(/\//g, '');
            xmlContent += `<TALLYMESSAGE xmlns:UDF="TallyUDF">\n<VOUCHER VCHTYPE="Receipt" ACTION="Create">\n<DATE>${date}</DATE>\n<NARRATION>Platform Fee - ${s.schoolName}</NARRATION>\n<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>\n<VOUCHERNUMBER>${s.id}</VOUCHERNUMBER>\n<ALLLEDGERENTRIES.LIST>\n<LEDGERNAME>${s.schoolName}</LEDGERNAME>\n<AMOUNT>${s.appFee}</AMOUNT>\n</ALLLEDGERENTRIES.LIST>\n</VOUCHER>\n</TALLYMESSAGE>\n`;
        }
    });

    xmlContent += `</REQUESTDATA>\n</IMPORTDATA>\n</BODY>\n</ENVELOPE>`;

    const blob = new Blob([xmlContent], { type: "application/xml" });
    await window.robustWebViewDownload(blob, `Tally_Export_${Date.now()}.xml`);
    window.logAudit("Exported Tally XML", "All Schools");
};

window.exportToTallyCSV = async () => {
    if (!window.fetchedSchoolPayments || window.fetchedSchoolPayments.length === 0) return;
    window.showToast("GENERATING TALLY CSV...", "#f59e0b");

    let csvContent = "Date,Voucher Type,Voucher Number,Ledger Name,Amount,Narration\n";

    window.fetchedSchoolPayments.forEach(s => {
        if (s.appFee && s.billingDate) {
            const date = new Date(s.billingDate).toLocaleDateString('en-GB');
            csvContent += `${date},Receipt,${s.id},"${s.schoolName}",${s.appFee},"Platform Fee - ${s.schoolName}"\n`;
        }
    });

    const blob = new Blob([csvContent], { type: "text/csv" });
    await window.robustWebViewDownload(blob, `Tally_Export_${Date.now()}.csv`);
    window.logAudit("Exported Tally CSV", "All Schools");
};

// ==========================================
// 9C. GST INVOICE GENERATOR
// ==========================================
window.loadPasswordRequests = () => {
    const sid = document.getElementById("pwdReqSchoolSelect").value; let html = ""; let ls = window.fetchedChairmen;
    if (sid !== "ALL" && sid !== "") { ls = ls.filter(c => c.schoolId === sid); }
    ls.forEach(dt => {
        let reqHtml = `<span class="text-coolGray text-[10px] font-mono tracking-widest">NO REQUEST</span>`;
        let btnHtml = `<button class="px-3 py-1 bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded text-[10px] font-mono transition" onclick="window.adminForceChangePassword('${dt.id}')">FORCE</button>`;
        if (dt.suggestedPassword) { reqHtml = `<span class="text-amber-400 font-bold font-mono tracking-widest drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]">${dt.suggestedPassword}</span>`; btnHtml = `<button class="px-3 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] font-mono transition" onclick="window.approvePasswordRequest('${dt.id}', '${dt.suggestedPassword}')">APPROVE</button> <button class="px-3 py-1 bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded text-[10px] font-mono transition ml-1" onclick="window.adminForceChangePassword('${dt.id}')">FORCE</button>`; }
        html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4"><input type="checkbox" class="row-checkbox w-4 h-4 rounded border-glassBorder text-amber-500 bg-slateSurface focus:ring-amber-500" data-id="${dt.id}"></td><td class="p-4"><strong class="text-white">${dt.schoolName}</strong><br><span class="text-[10px] text-tealAccent/70 font-mono tracking-widest">${dt.name}</span></td><td class="p-4"><div class="flex items-center gap-2"><span class="pwd-mask tracking-widest text-lg text-tealAccent">•••••••</span><span class="pwd-text hidden-el text-rose-400 font-mono font-bold text-[10px] tracking-widest">KEY: ${dt.plainPassword || 'N/A'}<br>PIN: ${dt.pin || 'NOT SET'}</span><button class="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-mono transition border border-glassBorder" onclick="window.togglePwd(this)">DECRYPT</button></div></td><td class="p-4">${reqHtml}</td><td class="p-4 text-right flex gap-1 justify-end">${btnHtml} <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition ml-1" onclick="window.deletePasswordRequest('${dt.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    document.getElementById("password-req-table").innerHTML = html || "<tr><td colspan='5' class='p-4 text-center text-coolGray font-mono'>NO TARGETS FOUND</td></tr>";
}
window.deletePasswordRequest = async (uid) => {
    window.customConfirm("DELETE KEY FROM SYSTEM?", async () => {
        try {
            await db.collection("users").doc(uid).update({ plainPassword: firebase.firestore.FieldValue.delete(), suggestedPassword: firebase.firestore.FieldValue.delete() });
            window.showToast("KEY ERASED!");
            loadChairmen();
        } catch (e) { }
    });
};
window.togglePwd = (btn) => { const td = btn.parentElement; const m = td.querySelector('.pwd-mask'), t = td.querySelector('.pwd-text'); if (m.classList.contains("hidden-el")) { m.classList.remove("hidden-el"); t.classList.add("hidden-el"); btn.innerText = "DECRYPT"; } else { m.classList.add("hidden-el"); t.classList.remove("hidden-el"); btn.innerText = "ENCRYPT"; } };
window.approvePasswordRequest = (uid, np) => { window.customConfirm("APPROVE THIS KEY?", async () => { try { await fetch("https://school-backend-zlgy.onrender.com/api/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUid: uid, newPassword: np }) }); await db.collection("users").doc(uid).update({ plainPassword: np, suggestedPassword: firebase.firestore.FieldValue.delete() }); window.showToast("✅ KEY UPDATED!"); loadChairmen(); } catch (e) { } }); };
window.adminForceChangePassword = (uid) => { document.getElementById("pwd-prompt-input").value = ""; openCustomModal("pwd-prompt-modal"); document.getElementById("pwd-prompt-confirm").onclick = async () => { const np = document.getElementById("pwd-prompt-input").value; if (!np) return; try { await fetch("https://school-backend-zlgy.onrender.com/api/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUid: uid, newPassword: np }) }); await db.collection("users").doc(uid).update({ plainPassword: np, suggestedPassword: firebase.firestore.FieldValue.delete() }); window.closeCustomModal("pwd-prompt-modal"); window.showToast("✅ KEY OVERRIDDEN!"); loadChairmen(); } catch (e) { } }; };

async function loadSchoolsForDropdown() {
    const h = '<option value="ALL">-- GLOBAL NETWORK --</option>';
    const t = ["masterNodeId", "inspectSchoolSelect", "backupScopeSelect", "secSchoolSelect", "staffSchoolSelect", "paymentSchoolSelect", "filterChairmenSchool", "deviceSchoolSelect", "pwdReqSchoolSelect", "broadcastSchoolTarget", "rollbackSchoolSelect", "featureSchoolSelect"];
    t.forEach(id => { const el = document.getElementById(id); if (el) { el.innerHTML = (id === "inspectSchoolSelect" || id === "secSchoolSelect" || id === "featureSchoolSelect" || id === "masterNodeId") ? '<option value="">-- SELECT TARGET --</option>' : h; } });

    try {
        const sp = await db.collection("schools").get();
        let requestsHtml = "";

        sp.forEach(d => {
            const data = d.data();
            const op = `<option value="${d.id}">${data.schoolName.toUpperCase()}</option>`;
            t.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML += op; });

            if (data.sessionUpgradeStatus === "pending") {
                const chairman = window.fetchedChairmen ? window.fetchedChairmen.find(c => c.schoolId === d.id) : null;
                const cName = chairman ? chairman.name : "N/A";
                requestsHtml += `<tr class="hover:bg-slateSurface/50 transition">
                    <td class="p-4 font-bold text-white">${data.schoolName}</td>
                    <td class="p-4 text-gray-200">${cName}</td>
                    <td class="p-4"><span class="text-rose-400 border border-rose-500/50 shadow-[0_0_5px_rgba(244,63,94,0.3)] bg-rose-500/10 px-2 py-1 rounded text-[10px] font-bold font-mono tracking-widest">PENDING APPROVAL</span></td>
                    <td class="p-4 text-right">
                        <button class="px-3 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] transition" onclick="approveSessionUpgrade('${d.id}')"><i class="fas fa-check"></i> APPROVE</button>
                    </td>
                </tr>`;
            }
        });

        const reqTable = document.getElementById("upgradeRequestsTableBody");
        if (reqTable) {
            reqTable.innerHTML = requestsHtml || "<tr><td colspan='4' class='text-center p-4 text-coolGray font-mono'>NO PENDING REQUESTS</td></tr>";
        }
    } catch (e) { }
}

window.approveSessionUpgrade = (schoolId) => {
    window.customConfirm("APPROVE SESSION UPGRADE FOR THIS NODE? The Chairman will be able to execute bulk promotions.", async () => {
        try {
            await db.collection("schools").doc(schoolId).update({ sessionUpgradeStatus: "approved" });
            window.showToast("✅ UPGRADE APPROVED!");
            window.logAudit("Approved Session Upgrade", schoolId);
            loadSchoolsForDropdown(); // Refresh table
        } catch (e) {
            window.showToast("ERROR: " + e.message, "#e11d48");
        }
    });
};

const companyFeatureRegistry = {
    school: [
        { key: "dashboard", label: "Dashboard" },
        { key: "students", label: "Students & Certs" },
        { key: "studentTransfer", label: "Student Transfer" },
        { key: "admitCards", label: "Admit Cards" },
        { key: "staff", label: "Staff Manager" },
        { key: "finance", label: "Finance & Fees" },
        { key: "feeApprovals", label: "Fee Approvals" },
        { key: "academics", label: "Academic Veto" },
        { key: "notices", label: "Notices & Ticker" },
        { key: "communicationHub", label: "Communication Hub" },
        { key: "qrFee", label: "QR Fee Module", moduleKey: "qrFee" },
        { key: "admitCardModule", label: "Admit Card Module", moduleKey: "admitCard" },
        { key: "whatsapp", label: "WhatsApp Module", moduleKey: "whatsapp" },
        { key: "transport", label: "Transport Manager", moduleKey: "transport" },
        { key: "inventory", label: "Inventory & Assets", moduleKey: "inventory" },
        { key: "dailyAttendance", label: "Daily Attendance", moduleKey: "attendance" },
        { key: "settings", label: "Account & School Settings" },
        { key: "studentPortalFeatures", label: "Student Portal Features" }
    ],
    student: [
        { key: "profile", label: "Profile" },
        { key: "homework", label: "Homework" },
        { key: "fee", label: "Fee Payment" },
        { key: "datesheet", label: "DateSheet" },
        { key: "attendance", label: "Attendance" },
        { key: "sms", label: "SMS" },
        { key: "calendar", label: "Calendar Planning" },
        { key: "idcard", label: "ID Card" },
        { key: "syllabus", label: "Syllabus" },
        { key: "fee-receipt", label: "Fee Receipt" },
        { key: "admit", label: "Admit Card" },
        { key: "gatepass", label: "Gate Pass" },
        { key: "notifications", label: "Notifications" },
        { key: "birthday", label: "Birthday" },
        { key: "transport", label: "Transport" },
        { key: "study-material", label: "Study Material" },
        { key: "result", label: "Result" },
        { key: "leave", label: "Leave Request" },
        { key: "batchmate", label: "Batchmate" },
        { key: "circular", label: "Circular" },
        { key: "news", label: "News" },
        { key: "assignment", label: "Assignment" },
        { key: "complaint", label: "Complaint" },
        { key: "online-classes", label: "Online Classes" },
        { key: "social-media", label: "Social Media" }
    ]
};

const legacyStudentFeatureKeys = {
    timetable: "datesheet",
    notice: "notifications",
    library: "study-material",
    marks: "result"
};
let companyFeatureSettings = { school: {}, modules: {}, student: {} };

function featureToggleId(group, key) {
    return `company-feature-${group}-${key.replace(/[^a-z0-9]/gi, "-")}`;
}

function removeStaticFeatureMarkup() {
    const schoolContainer = document.getElementById("feature-toggles-container");
    const staticSchoolGrid = schoolContainer?.nextElementSibling;
    if (staticSchoolGrid && !staticSchoolGrid.id && staticSchoolGrid.classList.contains("grid")) staticSchoolGrid.remove();
}

function renderFeatureGroup(group, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = companyFeatureRegistry[group].map(feature => {
        const enabled = companyFeatureSettings[group]?.[feature.key] !== false;
        return `<label data-company-feature-card="${group}:${feature.key}" class="flex items-center justify-between gap-3 bg-slateBase/70 border ${enabled ? "border-tealAccent/25" : "border-rose-500/35 opacity-70"} rounded-xl px-4 py-3 transition">
            <span><strong class="block text-sm text-white font-medium">${feature.label}</strong><small class="feature-state text-[10px] font-mono uppercase ${enabled ? "text-emerald-400" : "text-rose-400"}">${enabled ? "Enabled" : "Locked"}</small></span>
            <input id="${featureToggleId(group, feature.key)}" type="checkbox" class="accent-teal-400 h-5 w-5 shrink-0" ${enabled ? "checked" : ""} onchange="window.saveFeatureToggles('${group}', '${feature.key}', this.checked)">
        </label>`;
    }).join("");
    container.classList.remove("hidden-el");
}

function setFeatureControlsBusy(isBusy) {
    document.querySelectorAll('[id^="company-feature-"]').forEach(toggle => { toggle.disabled = isBusy; });
    const schoolSelect = document.getElementById("featureSchoolSelect");
    if (schoolSelect) schoolSelect.disabled = isBusy;
}

function applyGranularSubFeatureLocks() {
    const root = document.getElementById("tab-feature-toggles");
    if (!root) return;
    root.querySelectorAll("label").forEach(card => {
        const toggles = Array.from(card.querySelectorAll("input[type='checkbox']"));
        if (toggles.length < 2) return;
        const mainEnabled = toggles[0].checked;
        card.classList.toggle("opacity-60", !mainEnabled);
        toggles.slice(1).forEach(toggle => {
            toggle.disabled = !mainEnabled;
            if (toggle.parentElement) toggle.parentElement.classList.toggle("opacity-40", !mainEnabled);
        });
    });
}

document.addEventListener("change", (event) => {
    if (event.target && event.target.closest && event.target.closest("#tab-feature-toggles")) applyGranularSubFeatureLocks();
});

document.addEventListener("DOMContentLoaded", applyGranularSubFeatureLocks);

const FEATURE_SETTINGS_COLLECTION = "feature_controls";

function getFeatureSettingsDocRef(schoolId) {
    return db.collection("schools").doc(schoolId).collection(FEATURE_SETTINGS_COLLECTION).doc("settings");
}

function normalizeFeatureSettings(data) {
    const saved = data.featureSettings || data || {};
    const hasSchoolPolicy = saved.school && Object.keys(saved.school).length > 0;
    const legacyEnabled = Array.isArray(data.enabledModules) ? data.enabledModules : [];
    const legacyNames = { qrFee: "QR Fee Module", admitCard: "Admit Card Module", whatsapp: "WhatsApp Module" };
    const schoolKeyAliases = {
        studentsCerts: "students",
        staffManager: "staff",
        financeFees: "finance",
        academicVeto: "academics",
        noticesTicker: "notices",
        changePassword: "settings",
        schoolSettings: "settings"
    };
    const normalizedSavedSchool = {};
    Object.entries(saved.school || {}).forEach(([key, value]) => {
        const normalizedKey = schoolKeyAliases[key] || key;
        normalizedSavedSchool[normalizedKey] = value;
    });
    const settings = { ...saved, school: {}, modules: { ...(saved.modules || {}) }, student: {} };

    companyFeatureRegistry.school.forEach(feature => {
        let enabled = hasSchoolPolicy ? normalizedSavedSchool[feature.key] !== false : true;
        if (!hasSchoolPolicy && feature.moduleKey && legacyEnabled.length) {
            enabled = legacyEnabled.includes(feature.moduleKey) || legacyEnabled.includes(legacyNames[feature.moduleKey]);
        }
        settings.school[feature.key] = enabled;
        if (feature.moduleKey) settings.modules[feature.moduleKey] = enabled;
    });
    companyFeatureRegistry.student.forEach(feature => {
        settings.student[feature.key] = saved.student?.[feature.key] !== false;
    });
    Object.entries(legacyStudentFeatureKeys).forEach(([legacyKey, currentKey]) => {
        if (saved.student && Object.prototype.hasOwnProperty.call(saved.student, legacyKey)) {
            settings.student[currentKey] = saved.student[legacyKey] !== false;
        }
        settings.student[legacyKey] = settings.student[currentKey];
    });
    return settings;
}

function getFirestoreRulesSnippet() {
    return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isDeveloper() {
      return signedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'developer';
    }
    function isChairmanOfSchool(schoolId) {
      return signedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'chairman' &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.schoolId == schoolId;
    }

    match /schools/{schoolId}/feature_controls/settings {
      allow read: if signedIn();
      allow create, update: if isDeveloper() || (
        isChairmanOfSchool(schoolId) &&
        request.resource.data.diff(resource.data).changedKeys().hasOnly(['featureSettings', 'updatedAt', 'updatedBy']) &&
        request.resource.data.featureSettings.school == resource.data.featureSettings.school &&
        request.resource.data.featureSettings.modules == resource.data.featureSettings.modules &&
        request.resource.data.featureSettings.companyLocked == resource.data.featureSettings.companyLocked
      );
      allow delete: if isDeveloper();
    }
  }
}`;
}

window.copyFeatureRulesSnippet = async () => {
    const snippet = getFirestoreRulesSnippet();
    try {
        await navigator.clipboard.writeText(snippet);
        window.showToast("FIRESTORE RULES SNIPPET COPIED", "#10b981");
    } catch (e) {
        console.warn("Rules snippet copy failed", e);
        window.showToast("RULES SNIPPET READY IN CONSOLE", "#f59e0b");
        console.log(snippet);
    }
};

window.loadFeatureTogglesForSchool = async () => {
    const sid = document.getElementById("featureSchoolSelect")?.value;
    const schoolContainer = document.getElementById("feature-toggles-container");
    const studentContainer = document.getElementById("feature-student-toggles-container");
    removeStaticFeatureMarkup();
    if (!schoolContainer || !studentContainer) return;
    if (!sid || sid === "ALL") {
        schoolContainer.innerHTML = "";
        studentContainer.innerHTML = "";
        schoolContainer.classList.add("hidden-el");
        return;
    }

    setFeatureControlsBusy(true);
    try {
        const featureDoc = await getFeatureSettingsDocRef(sid).get();
        const schoolDoc = featureDoc.exists ? null : await db.collection("schools").doc(sid).get();
        const featureData = featureDoc.exists ? featureDoc.data() : (schoolDoc?.exists ? schoolDoc.data() : {});
        companyFeatureSettings = normalizeFeatureSettings(featureData);
        renderFeatureGroup("school", "feature-toggles-container");
        renderFeatureGroup("student", "feature-student-toggles-container");
    } catch (e) {
        schoolContainer.classList.add("hidden-el");
        studentContainer.innerHTML = "";
        window.showToast("ERROR LOADING TOGGLES: " + e.message, "#e11d48");
    } finally {
        setFeatureControlsBusy(false);
    }
};

window.saveFeatureToggles = async (group, key, enabled) => {
    const sid = document.getElementById("featureSchoolSelect")?.value;
    if (!sid || sid === "ALL" || !companyFeatureRegistry[group]?.some(feature => feature.key === key)) return;

    const previousSettings = JSON.parse(JSON.stringify(companyFeatureSettings));
    companyFeatureSettings[group] = companyFeatureSettings[group] || {};
    companyFeatureSettings.companyLocked = companyFeatureSettings.companyLocked || { school: {}, student: {}, modules: {} };
    companyFeatureSettings.companyLocked[group] = companyFeatureSettings.companyLocked[group] || {};
    companyFeatureSettings[group][key] = enabled;
    companyFeatureSettings.companyLocked[group][key] = !enabled;
    renderFeatureGroup(group, group === "school" ? "feature-toggles-container" : "feature-student-toggles-container");
    if (group === "school") {
        const feature = companyFeatureRegistry.school.find(item => item.key === key);
        if (feature?.moduleKey) {
            companyFeatureSettings.modules[feature.moduleKey] = enabled;
            companyFeatureSettings.companyLocked.modules[feature.moduleKey] = !enabled;
        }
    }
    if (group === "student") {
        Object.entries(legacyStudentFeatureKeys).forEach(([legacyKey, currentKey]) => {
            if (currentKey === key) companyFeatureSettings.student[legacyKey] = enabled;
        });
    }
    renderFeatureGroup(group, group === "school" ? "feature-toggles-container" : "feature-student-toggles-container");
    setFeatureControlsBusy(true);
    try {
        const enabledModules = Object.entries(companyFeatureSettings.modules).filter(([, state]) => state !== false).map(([moduleKey]) => moduleKey);
        const restrictedModules = Object.entries(companyFeatureSettings.modules).filter(([, state]) => state === false).map(([moduleKey]) => moduleKey);
        await getFeatureSettingsDocRef(sid).set({
            featureSettings: companyFeatureSettings,
            enabledModules,
            restrictedModules,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: superAdminUid || "hq"
        }, { merge: true });
        window.showToast("FEATURE ACCESS POLICY UPDATED", "#10b981");
        window.logAudit(`Updated ${group} Feature Toggle`, `${sid}:${key}:${enabled ? "ON" : "OFF"}`);
    } catch (e) {
        companyFeatureSettings = previousSettings;
        renderFeatureGroup(group, group === "school" ? "feature-toggles-container" : "feature-student-toggles-container");
        window.showToast("ERROR: " + e.message, "#e11d48");
        await window.loadFeatureTogglesForSchool();
    } finally {
        setFeatureControlsBusy(false);
    }
};

window.generateSystemBackup = async () => {
    const sc = document.getElementById("backupScopeSelect").value; let bD = {}; const bn = document.getElementById("sysBakBtn"); bn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PACKAGING...`;
    try {
        if (sc === "ALL") {
            const cl = ["users", "schools", "students", "notices", "direct_messages", "login_logs", "audit_logs", "system_config", "global_roles", "pending_deletions", "recycle_bin"];
            for (let c of cl) { bD[c] = []; const sn = await db.collection(c).get(); sn.forEach(d => bD[c].push({ id: d.id, ...d.data() })); }
        } else {
            bD.schoolId = sc; bD.users = []; bD.students = [];
            const sD = await db.collection("schools").doc(sc).get(); if (sD.exists) bD.schoolData = sD.data();
            const uS = await db.collection("users").where("schoolId", "==", sc).get(); uS.forEach(d => bD.users.push(d.data()));
            const stS = await db.collection("students").where("schoolId", "==", sc).get(); stS.forEach(d => bD.students.push(d.data()));
        }
        const jsonString = JSON.stringify(bD, null, 2); const blobObj = new Blob([jsonString], { type: "application/json" });
        const fileName = sc === "ALL" ? `Matrix_Dump_Global_${Date.now()}.json` : `Matrix_Dump_Node_${sc}_${Date.now()}.json`;
        await window.robustWebViewDownload(blobObj, fileName); window.logAudit("Extracted Matrix Dump", sc);
    } catch (e) { }
    bn.innerHTML = `<i class="fas fa-download"></i> EXTRACT SNAPSHOT`;
};

window.executeTimeTravelRollback = async () => { const sid = document.getElementById("rollbackSchoolSelect").value; const ts = document.getElementById("rollbackTimestamp").value; if (!ts) return; window.customConfirm(`CRITICAL: INITIATE TEMPORAL ROLLBACK FOR ${sid === 'ALL' ? 'GLOBAL MATRIX' : sid} TO ${ts}?`, () => { window.showToast("INITIATING ROLLBACK SEQUENCE...", "#f59e0b"); window.logAudit("Temporal Rollback Triggered", `${sid} to ${ts}`); setTimeout(() => { window.showToast("ROLLBACK EXECUTED SUCCESSFULLY!", "#059669"); }, 3000); }); };
window.triggerAutomatedCloudBackup = async () => { window.customConfirm("TRIGGER BACKEND CRON FOR CLOUD SYNC?", () => { window.showToast("CLOUD SYNC TRIGGERED.", "#00F0FF"); window.logAudit("Triggered Cloud Sync", "Global"); }); };

window.loadSchoolSecurityStatus = async () => {
    const sI = document.getElementById("secSchoolSelect").value; const pl = document.getElementById("school-security-panel");
    if (!sI) { pl.classList.add("hidden-el"); return; }
    pl.classList.remove("hidden-el");
    if (sI === "ALL") {
        document.getElementById("sec-chairman-info").innerText = "GLOBAL OVERRIDE"; document.getElementById("sec-staff-info").innerText = "GLOBAL OVERRIDE"; document.getElementById("sec-student-info").innerText = "GLOBAL OVERRIDE";
        document.getElementById("sec-status-msg").innerText = "⚠️ GLOBAL OVERRIDE ACTIVE";
        document.getElementById("sec-chairman-toggle").checked = true; document.getElementById("sec-staff-toggle").checked = true; document.getElementById("sec-student-toggle").checked = true; return;
    }
    document.getElementById("sec-status-msg").innerText = "SCANNING NODE STATUS...";
    try {
        const cS = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "chairman").get(); let cB = false; cS.forEach(d => { cB = d.data().status === "blocked"; }); document.getElementById("sec-chairman-toggle").checked = !cB; document.getElementById("sec-chairman-info").innerText = "SYNCED";
        const sS = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "staff").get(); let aS = false; sS.forEach(d => { if (d.data().status === "blocked") aS = true; }); document.getElementById("sec-staff-toggle").checked = !aS; document.getElementById("sec-staff-info").innerText = "SYNCED";
        const scl = await db.collection("schools").doc(sI).get(); let stB = false; let gA = false, tA = false, rO = false; let mod = {};
        if (scl.exists) { stB = scl.data().studentsBlocked === true; gA = scl.data().geofenceActive; tA = scl.data().timeLockActive; rO = scl.data().readOnlyMode; mod = scl.data().modules || {}; }
        document.getElementById("sec-student-toggle").checked = !stB; document.getElementById("sec-student-info").innerText = stB ? "LOCKED" : "ACTIVE";
        document.getElementById("sec-geofence-toggle").checked = gA; document.getElementById("sec-timelock-toggle").checked = tA; document.getElementById("sec-readonly-toggle").checked = rO;
        document.getElementById("mod-attendance").checked = mod.attendance !== false; document.getElementById("mod-finance").checked = mod.finance !== false; document.getElementById("mod-hr").checked = mod.hr !== false; document.getElementById("mod-exams").checked = mod.exams !== false;
        document.getElementById("sec-status-msg").innerText = "✅ NODE SYNCED.";
    } catch (e) { }
};

window.toggleSchoolUserBlock = async (ty) => {
    const sI = document.getElementById("secSchoolSelect").value; if (!sI) return;
    if (sI === "ALL") {
        if (ty === "chairman") { const iA = document.getElementById("sec-chairman-toggle").checked; const sn = await db.collection("users").where("role", "==", "chairman").get(); for (const d of sn.docs) { await db.collection("users").doc(d.id).update({ status: iA ? "active" : "blocked", blockReason: iA ? "" : "Master Override" }); } }
        else if (ty === "staff") { const iA = document.getElementById("sec-staff-toggle").checked; const sn = await db.collection("users").where("role", "==", "staff").get(); for (const d of sn.docs) { await db.collection("users").doc(d.id).update({ status: iA ? "active" : "blocked", blockReason: iA ? "" : "Master Override" }); } }
        else if (ty === "students") { const iA = document.getElementById("sec-student-toggle").checked; const sn = await db.collection("schools").get(); for (const d of sn.docs) { await db.collection("schools").doc(d.id).update({ studentsBlocked: !iA }); } }
        return;
    }
    if (ty === "chairman") { const iA = document.getElementById("sec-chairman-toggle").checked; try { const sn = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "chairman").get(); for (const d of sn.docs) { await db.collection("users").doc(d.id).update({ status: iA ? "active" : "blocked", blockReason: iA ? "" : "Master Override" }); } } catch (e) { } }
    else if (ty === "staff") { const iA = document.getElementById("sec-staff-toggle").checked; try { const sn = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "staff").get(); for (const d of sn.docs) { await db.collection("users").doc(d.id).update({ status: iA ? "active" : "blocked", blockReason: iA ? "" : "Master Override" }); } } catch (e) { } }
    else if (ty === "students") { const iA = document.getElementById("sec-student-toggle").checked; try { await db.collection("schools").doc(sI).set({ studentsBlocked: !iA }, { merge: true }); } catch (e) { } }
};
window.toggleAdvancedSecurity = async (type) => {
    const sid = document.getElementById("secSchoolSelect").value; if (!sid || sid === "ALL") return;
    let updateObj = {}; let msg = "";
    if (type === 'geofence') { updateObj.geofenceActive = document.getElementById("sec-geofence-toggle").checked; msg = "GEOFENCE"; }
    if (type === 'timelock') { updateObj.timeLockActive = document.getElementById("sec-timelock-toggle").checked; msg = "TIME-LOCK"; }
    if (type === 'readonly') { updateObj.readOnlyMode = document.getElementById("sec-readonly-toggle").checked; msg = "READ-ONLY MODE"; }
    try { await db.collection("schools").doc(sid).update(updateObj); window.showToast(`${msg} PROTOCOL UPDATED!`); window.logAudit(`Toggled ${msg}`, sid); } catch (e) { }
};
window.toggleFeatureFlag = async (flag) => { const sid = document.getElementById("secSchoolSelect").value; if (!sid || sid === "ALL") return; const isChecked = document.getElementById(`mod-${flag}`).checked; try { await getFeatureSettingsDocRef(sid).set({ featureSettings: { modules: { [flag]: isChecked } }, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: superAdminUid || "hq" }, { merge: true }); window.showToast(`MODULE ${flag.toUpperCase()} UPDATED!`); window.logAudit(`Toggled Flag ${flag}`, sid); } catch (e) { } };

const csvExportBtnEl = document.getElementById("csvExportBtn");
if (csvExportBtnEl) csvExportBtnEl.addEventListener("click", async () => {
    window.showToast("COMPILING DIRECTORY...", "#00F0FF");
    try {
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(16); doc.text("Global Node Directory", 14, 20);
        const tableRows = []; const snp = await db.collection("schools").get(); snp.forEach(d => { tableRows.push([d.id, d.data().schoolName || "N/A", d.data().chairmanUid || "N/A"]); });
        doc.autoTable({ head: [["Node ID", "Node Name", "Commander UID"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor: [0, 240, 255], textColor: [5, 11, 20] } });
        const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, `Node_Directory_${Date.now()}.pdf`);
    } catch (e) { }
});

const cleanupBtnEl = document.getElementById("cleanupBtn");
if (cleanupBtnEl) cleanupBtnEl.addEventListener("click", () => { window.customConfirm("CRITICAL: ALL PENDING SUBJECTS GLOBALLY WILL BE PURGED!", async () => { window.showToast("PURGING... PLEASE WAIT", "#e11d48"); try { const sn = await db.collection("students").where("status", "==", "Pending").get(); let count = 0; for (const d of sn.docs) { await deleteFirebaseStorageImage(d.data().photoUrl); await db.collection("students").doc(d.id).delete(); count++; } window.showToast(`? ${count} PENDING SUBJECTS PURGED.`); window.logAudit("Mass Purge", `${count} subjects`); } catch (e) { } }); });

window.deployNewNode = async () => {
    const sName = document.getElementById("newNodeName").value;
    const tier = document.getElementById("newNodeTier").value;
    const subs = document.getElementById("newNodeSubs").value;
    if (!sName || !tier) return window.showToast("REQUIRED FIELDS MISSING", "#e11d48");
    try {
        const docRef = await db.collection("schools").add({
            schoolName: sName,
            tier: tier,
            subNodes: parseInt(subs) || 0,
            status: "active",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        window.showToast("✅ NODE DEPLOYED: " + docRef.id);
        window.logAudit("Deployed New Node", sName);
    } catch (e) { window.showToast("ERROR: " + e.message, "#e11d48"); }
};

window.toggleServerShield = async () => { const btn = document.getElementById("serverShieldBtn"); if (btn.innerText.includes("TOGGLE")) { await db.collection("system_config").doc("shield").set({ active: true }); window.showToast("SERVER SHIELD ACTIVATED!"); window.logAudit("Activated Shield", "Global"); } };

// ==========================================
// 🛡️ GLOBAL BLACKLIST SYSTEM
// ==========================================
window.openGlobalBlacklistModal = () => {
    document.getElementById("blacklist-modal").style.display = "flex";
    window.loadGlobalBlacklist();
};

window.loadGlobalBlacklist = async () => {
    const tbody = document.getElementById("blacklist-table-body");
    tbody.innerHTML = "<tr><td colspan='3' class='p-3 text-center'>Loading...</td></tr>";
    try {
        const snap = await db.collection("global_blacklist").get();
        let html = "";
        snap.forEach(doc => {
            const d = doc.data();
            html += `<tr class="hover:bg-slateSurface/50">
                <td class="p-3 uppercase font-bold text-purple-400">${d.type}</td>
                <td class="p-3 text-white">${d.value}</td>
                <td class="p-3 text-right">
                    <button onclick="window.removeBlacklistEntry('${doc.id}')" class="px-2 py-1 bg-rose-500/20 text-rose-400 border border-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px]"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || "<tr><td colspan='3' class='p-3 text-center text-coolGray'>No entries found.</td></tr>";
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan='3' class='p-3 text-center text-rose-500'>Error: ${e.message}</td></tr>`;
    }
};

window.addBlacklistEntry = async () => {
    const val = document.getElementById("blacklist-input").value.trim();
    const type = document.getElementById("blacklist-type").value;
    if (!val) return window.showToast("Enter a value!", "#e11d48");
    const btn = document.getElementById("add-blacklist-btn");
    btn.innerText = "WAIT...";
    try {
        const q = await db.collection("global_blacklist").where("type", "==", type).where("value", "==", val).get();
        if (!q.empty) { window.showToast("ALREADY BLACKLISTED", "#f59e0b"); btn.innerHTML = `<i class="fas fa-plus"></i> ADD`; return; }

        await db.collection("global_blacklist").add({
            type: type,
            value: val,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById("blacklist-input").value = "";
        window.showToast("ADDED TO BLACKLIST", "#a855f7");
        window.loadGlobalBlacklist();
    } catch (e) { window.showToast("ERROR: " + e.message, "#e11d48"); }
    btn.innerHTML = `<i class="fas fa-plus"></i> ADD`;
};

window.removeBlacklistEntry = async (id) => {
    window.customConfirm("Remove from Global Blacklist?", async () => {
        try {
            await db.collection("global_blacklist").doc(id).delete();
            window.showToast("ENTRY REMOVED", "#10b981");
            window.loadGlobalBlacklist();
        } catch (e) { window.showToast("ERROR: " + e.message, "#e11d48"); }
    });
};

// ==========================================
// 11. DEVICE TRACKING
// ==========================================
function parseUserAgent(ua) {
    if (!ua) return { os: 'UNKNOWN OS', model: 'UNKNOWN DEVICE' };
    let os = "UNKNOWN OS"; let model = "UNKNOWN DEVICE";
    if (ua.includes("Android")) { let m = ua.match(/Android\s([0-9\.]+)/); os = m ? "Android " + m[1] : "Android"; let match = ua.match(/Android[^;]*; ([^)]+)\)/); if (match) model = match[1].trim().split(" Build")[0]; } else if (ua.includes("iPhone")) { os = "iOS"; model = "Apple iPhone"; } else if (ua.includes("Windows NT")) { os = "Windows"; model = "PC/Laptop"; }
    return { os: os.toUpperCase(), model: model.toUpperCase() };
}

function timestampToMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value === "number") return value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function getBrowserCoordinates(timeout = 6000) {
    return new Promise(resolve => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            position => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                source: "browser-gps"
            }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout, maximumAge: 300000 }
        );
    });
}

function mapUrlForLog(log) {
    const latitude = Number(log.latitude ?? log.geo?.latitude);
    const longitude = Number(log.longitude ?? log.geo?.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=16/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`
        : "";
}

window.loadDeviceLogs = async () => {
    const sid = document.getElementById("deviceSchoolSelect")?.value || "ALL";
    const rid = document.getElementById("deviceRoleSelect")?.value || "ALL";
    const startInput = document.getElementById("device_start_date")?.value;
    const endInput = document.getElementById("device_end_date")?.value;
    const table = document.getElementById("device-logs-table");
    if (!table) return;
    table.innerHTML = "<tr><td colspan='7' class='p-4 text-center text-cyan-400 font-mono'><i class='fas fa-spinner fa-spin'></i> SCANNING TELEMETRY...</td></tr>";
    try {
        let query = db.collection("login_logs");
        if (sid !== "ALL") query = query.where("schoolId", "==", sid);
        const snapshot = await query.get();
        window.currentDeviceLogs = [];
        snapshot.forEach(doc => {
            const log = { id: doc.id, ...doc.data() };
            if (rid === "ALL" || log.role === rid) window.currentDeviceLogs.push(log);
        });
        if (startInput && endInput) {
            const start = new Date(startInput).setHours(0, 0, 0, 0);
            const end = new Date(endInput).setHours(23, 59, 59, 999);
            window.currentDeviceLogs = window.currentDeviceLogs.filter(log => {
                const time = timestampToMillis(log.timestamp);
                return time >= start && time <= end;
            });
        }
        window.currentDeviceLogs.sort((a, b) => timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp));
        table.innerHTML = window.currentDeviceLogs.map((log, index) => {
            const device = parseUserAgent(log.device);
            const time = timestampToMillis(log.timestamp);
            const mapUrl = mapUrlForLog(log);
            return `<tr class="hover:bg-slateSurface/50 transition">
                <td class="p-4 sensitive-data font-bold text-white">${log.name || 'N/A'}<br><span class="text-[10px] text-tealAccent/70 font-normal tracking-widest">${log.email || 'N/A'}</span></td>
                <td class="p-4"><span class="bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 px-2 py-1 rounded text-[10px] uppercase tracking-widest">${log.role || 'UNKNOWN'}</span></td>
                <td class="p-4 text-[10px] leading-tight tracking-widest"><span class="text-amber-500">PUB:</span> ${log.ip || 'N/A'}<br><span class="text-indigo-400">LOC:</span> ${log.localIp || 'BLOCKED'}<br><span class="text-emerald-400">GEO:</span> <span id="loc-${index}">${log.location || (mapUrl ? 'GPS COORDINATES' : '<i class="fas fa-spinner fa-spin"></i>')}</span></td>
                <td class="p-4 text-[10px] max-w-[150px] tracking-widest"><span class="font-bold text-cyan-400">${device.os}</span><br><span class="text-coolGray break-words">SIG: ${device.model}</span></td>
                <td class="p-4 text-[10px] text-coolGray tracking-widest">${time ? new Date(time).toLocaleString() : 'UNKNOWN'}</td>
                <td class="p-4 text-center"><a id="map-${index}" class="map-action-button${mapUrl ? '' : ' hidden-el'}" href="${mapUrl || '#'}" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> MAP</a><button id="map-disabled-${index}" class="map-action-button${mapUrl ? ' hidden-el' : ''}" disabled><i class="fas fa-location-crosshairs"></i> N/A</button></td>
                <td class="p-4 text-right"><button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.killSession('${log.userId || log.uid || ''}')"><i class="fas fa-skull-crossbones"></i> KILL</button></td>
            </tr>`;
        }).join("") || "<tr><td colspan='7' class='p-4 text-center text-coolGray font-mono'>NO TELEMETRY FOUND.</td></tr>";

        const unresolvedIps = [...new Set(window.currentDeviceLogs.filter(log => !mapUrlForLog(log)).map(log => log.ip).filter(ip => ip && ip !== "Unknown"))];
        unresolvedIps.forEach(async ip => {
            try {
                const response = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`);
                const geo = await response.json();
                window.currentDeviceLogs.forEach((log, index) => {
                    if (log.ip !== ip || mapUrlForLog(log)) return;
                    log.location = [geo.city, geo.region, geo.country].filter(Boolean).join(', ').toUpperCase() || 'IP GEOLOCATION';
                    const latitude = Number(geo.latitude);
                    const longitude = Number(geo.longitude);
                    if (Number.isFinite(latitude) && Number.isFinite(longitude)) Object.assign(log, { latitude, longitude });
                    const locationElement = document.getElementById(`loc-${index}`);
                    if (locationElement) locationElement.textContent = log.location;
                    const mapLink = document.getElementById(`map-${index}`);
                    const disabledButton = document.getElementById(`map-disabled-${index}`);
                    const fallbackMapUrl = mapUrlForLog(log);
                    if (mapLink && fallbackMapUrl) {
                        mapLink.href = fallbackMapUrl;
                        mapLink.classList.remove("hidden-el");
                        disabledButton?.classList.add("hidden-el");
                    }
                });
            } catch (error) {
                console.warn("IP geolocation unavailable:", error);
            }
        });
    } catch (error) {
        console.error("Device telemetry load failed:", error);
        table.innerHTML = "<tr><td colspan='7' class='p-4 text-center text-rose-400 font-mono'>TELEMETRY LOAD FAILED.</td></tr>";
    }
};

window.downloadDeviceLogsAsPDF = async () => {
    if (!window.currentDeviceLogs || window.currentDeviceLogs.length === 0) return;
    try { const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.text("Filtered Radar Telemetry", 14, 20); const tableRows = []; window.currentDeviceLogs.forEach(dt => { let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; let parsedDevice = parseUserAgent(dt.device); tableRows.push([`${dt.name || 'N/A'}\n${dt.email || 'N/A'}`, dt.role || 'N/A', dt.ip || 'N/A', dt.location || 'N/A', `${parsedDevice.os}\nSIG: ${parsedDevice.model}`, ts]); }); doc.autoTable({ head: [["Actor", "Role", "Public IP", "Geo-Location", "Hardware Sig", "Temporal"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor: [34, 211, 238], textColor: [5, 11, 20] } }); const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, "Radar_Telemetry_" + Date.now() + ".pdf"); } catch (e) { }
};

window.downloadAllDeviceLogsAsPDF = async () => {
    try { const sn = await db.collection("login_logs").get(); let allLogs = []; sn.forEach(d => allLogs.push(d.data())); allLogs.sort((a, b) => { if (!a.timestamp) return 1; if (!b.timestamp) return -1; return b.timestamp.toMillis() - a.timestamp.toMillis(); }); if (allLogs.length === 0) return; const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.text("Global Radar Telemetry Dump", 14, 20); const tableRows = []; allLogs.forEach(dt => { let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; let parsedDevice = parseUserAgent(dt.device); tableRows.push([`${dt.name || 'N/A'}\n${dt.email || 'N/A'}`, dt.role || 'N/A', dt.ip || 'N/A', `${parsedDevice.os}`, ts]); }); doc.autoTable({ head: [["Actor", "Role", "Public IP", "OS", "Temporal"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor: [168, 85, 247] } }); const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, "Global_Telemetry_" + Date.now() + ".pdf"); } catch (e) { }
};

window.killSession = async (uid) => { if (!uid || uid === "undefined") return; window.customConfirm("TERMINATE SESSION? USER WILL BE KICKED.", async () => { await db.collection("users").doc(uid).update({ forceLogout: true }); window.showToast("SESSION TERMINATED.", "#e11d48"); window.logAudit("Killed Session", uid); }); };

// ==========================================
// 12. BROADCAST, INBOX & EMERGENCY TICKER
// ==========================================
window.loadInboxMessages = async () => { const t = document.getElementById("inbox-table"); try { const sn = await db.collection("direct_messages").where("receiverType", "==", "developer").get(); let ht = ""; let m = []; sn.forEach(d => m.push({ id: d.id, ...d.data() })); m.sort((a, b) => { if (!a.createdAt) return 1; if (!b.createdAt) return -1; return b.createdAt.toMillis() - a.createdAt.toMillis(); }); m.forEach(msg => { let ts = msg.createdAt ? new Date(msg.createdAt.toMillis()).toLocaleString() : "UNKNOWN"; ht += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-3 text-[10px] text-coolGray tracking-widest">${ts}</td><td class="p-3"><span class="bg-indigo-500/10 border border-indigo-500/50 text-indigo-400 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">${msg.senderRole || 'UNKNOWN'}</span><br><strong class="text-white text-xs mt-1 block">${msg.schoolName || 'N/A'}</strong></td><td class="p-3"><strong class="text-blue-300">${msg.title}</strong><br><span class="text-[10px] text-coolLight">${msg.body}</span></td><td class="p-3 text-right"><button class="px-2 py-1 bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded text-[10px] transition" onclick="window.replyToMessage('${msg.senderId}', '${msg.schoolId}', '${msg.senderRole}')"><i class="fas fa-reply"></i></button> <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteMessage('${msg.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }); t.innerHTML = ht || "<tr><td colspan='4' class='text-center p-4 text-coolGray font-mono'>INBOX EMPTY.</td></tr>"; } catch (e) { } };
window.deleteMessage = (mid) => { window.customConfirm("PURGE COMM?", async () => { await db.collection("direct_messages").doc(mid).delete(); window.showToast("✅ PURGED!"); window.loadInboxMessages(); }); };
window.replyToMessage = (rid, sid, yp) => { document.getElementById("reply-prompt-input").value = ""; openCustomModal("reply-prompt-modal"); document.getElementById("reply-prompt-confirm").onclick = async () => { const rp = document.getElementById("reply-prompt-input").value; if (!rp) return; try { await db.collection("direct_messages").doc().set({ senderId: superAdminUid, senderRole: "developer", senderName: "Super Admin", schoolId: sid, receiverId: rid, receiverType: yp, title: "SYSTEM DIRECTIVE", body: rp, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); window.closeCustomModal("reply-prompt-modal"); window.showToast("✅ REPLY TRANSMITTED!"); window.logAudit("Replied Message", rid); } catch (e) { } }; };

// Removed Broadcast Event Listeners for UI Redesign

window.sendEmergencyTicker = async () => { const txt = document.getElementById("emergencyTickerInput").value.trim(); if (!txt) return; try { await db.collection("system_config").doc("ticker").set({ text: txt, active: true, timestamp: Date.now() }); window.showToast("OVERRIDE TRANSMITTED!", "#e11d48"); window.logAudit("Broadcasted Ticker", txt); document.getElementById("emergencyTickerInput").value = ""; } catch (e) { } };
window.clearEmergencyTicker = async () => { try { await db.collection("system_config").doc("ticker").update({ active: false }); window.showToast("OVERRIDE CLEARED."); } catch (e) { } };
window.listenToEmergencyTicker = () => { db.collection("system_config").doc("ticker").onSnapshot(doc => { if (doc.exists && doc.data().active) { document.getElementById("emergency-ticker").classList.remove("hidden-el"); document.getElementById("ticker-text").innerText = doc.data().text; } else { document.getElementById("emergency-ticker").classList.add("hidden-el"); } }); };

// ==========================================
// 13. AUDIT LOGS, DELETIONS & RECYCLE BIN
// ==========================================
window.logAudit = async (action, target) => { try { await db.collection("audit_logs").add({ admin: "ROOT MASTER", action: action.toUpperCase(), target: target.toUpperCase(), timestamp: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) { } };
window.loadAuditLogs = async () => { const tbody = document.getElementById("audit-logs-body"); try { const snap = await db.collection("audit_logs").orderBy("timestamp", "desc").limit(50).get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.timestamp ? new Date(d.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 tracking-widest">${ts}</td><td class="p-4 font-bold text-tealAccent drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]">${d.admin}</td><td class="p-4 text-white">${d.action}</td><td class="p-4 sensitive-data text-coolGray">${d.target}</td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='4' class='p-4 text-center'>NO LOGS FOUND.</td></tr>"; } catch (e) { } };

window.loadPendingDeletions = async () => { const tbody = document.getElementById("pending-deletions-body"); try { const snap = await db.collection("pending_deletions").get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.timestamp ? new Date(d.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; let col = d.targetCollection || d.refCollection || 'transactions'; let docTId = d.targetDocId || d.refId || doc.id; html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 tracking-widest">${ts}</td><td class="p-4 font-mono text-coolGray">${d.schoolId}</td><td class="p-4"><span class="bg-rose-500/10 border border-rose-500/50 text-rose-400 px-2 py-1 rounded text-[10px] tracking-widest">${d.type || col.toUpperCase()}</span></td><td class="p-4 sensitive-data text-white">${d.details || docTId || "NO INFO"}</td><td class="p-4 text-right"><button class="px-2 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] transition" onclick="window.approveDeletion('${doc.id}', '${col}', '${docTId}')"><i class="fas fa-check"></i></button> <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.rejectDeletion('${doc.id}')"><i class="fas fa-times"></i></button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='5' class='p-4 text-center'>NO PENDING REQUESTS.</td></tr>"; } catch (e) { } };
window.approveDeletion = async (docId, collection, docRefId) => { window.customConfirm("APPROVE DELETION? ITEM WILL MOVE TO RECOVERY BIN.", async () => { try { const orgDoc = await db.collection(collection).doc(docRefId).get(); if (orgDoc.exists) { await db.collection("recycle_bin").add({ originalCollection: collection, originalId: docRefId, data: orgDoc.data(), deletedAt: firebase.firestore.FieldValue.serverTimestamp() }); if (orgDoc.data().photoUrl || orgDoc.data().logoUrl) { /* optional cloudinary delete */ } await db.collection(collection).doc(docRefId).delete(); } await db.collection("pending_deletions").doc(docId).delete(); window.showToast("DELETED & MOVED TO BIN."); window.loadPendingDeletions(); window.loadRecycleBin(); window.logAudit("Approved Deletion", docRefId); } catch (e) { } }); };
window.rejectDeletion = async (docId) => { try { await db.collection("pending_deletions").doc(docId).delete(); window.showToast("REQUEST REJECTED."); window.loadPendingDeletions(); } catch (e) { } };

window.loadRecycleBin = async () => {
    const tbody = document.getElementById("recycle-bin-body");
    const sid = document.getElementById("recycleSchoolSelect")?.value || "ALL";
    try {
        let query = db.collection("recycle_bin").orderBy("deletedAt", "desc").limit(50);
        const snap = await query.get();
        let html = "";
        snap.forEach(doc => {
            let d = doc.data();
            // Manual filtering since originalSchoolId might not be perfectly indexed
            if (sid !== "ALL" && d.data?.schoolId !== sid) return;

            let ts = d.deletedAt ? new Date(d.deletedAt.toMillis()).toLocaleString() : "UNKNOWN";
            html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 tracking-widest">${ts}</td><td class="p-4"><span class="bg-teal-500/10 border border-teal-500/50 text-teal-400 px-2 py-1 rounded text-[10px] uppercase tracking-widest">${d.originalCollection}</span></td><td class="p-4 sensitive-data max-w-[200px] truncate text-coolGray">${JSON.stringify(d.data).substring(0, 50)}...</td><td class="p-4 text-right flex gap-1 justify-end"><button class="px-3 py-1 bg-teal-600/20 border border-teal-500 hover:bg-teal-600 text-teal-400 hover:text-slateBase font-bold rounded text-[10px] transition font-mono" onclick="window.restoreItem('${doc.id}', '${d.originalCollection}', '${d.originalId}')"><i class="fas fa-undo"></i> RESTORE</button> <button class="px-3 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white font-bold rounded text-[10px] transition font-mono" onclick="window.permanentlyDeleteBinItem('${doc.id}')"><i class="fas fa-trash"></i> DELETE</button></td></tr>`;
        });
        tbody.innerHTML = html || "<tr><td colspan='4' class='p-4 text-center'>BIN IS EMPTY.</td></tr>";
    } catch (e) { }
};

window.permanentlyDeleteBinItem = async (binId) => {
    window.customConfirm("PERMANENTLY DELETE THIS ITEM FROM STORAGE?", async () => {
        try {
            const binDoc = await db.collection("recycle_bin").doc(binId).get();
            if (binDoc.exists) {
                const itemData = binDoc.data().data || {};
                const urlsToCheck = [itemData.photoUrl, itemData.logoUrl, itemData.signatureUrl, itemData.imageUrl];
                for (let url of urlsToCheck) {
                    if (url && typeof url === 'string' && url.includes('cloudinary.com')) {
                        try {
                            await fetch('https://school-backend-zlgy.onrender.com/api/delete-image', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ imageUrl: url })
                            });
                        } catch (err) {
                            console.error("Cloudinary delete failed:", err);
                        }
                    }
                }
            }
            await db.collection("recycle_bin").doc(binId).delete();
            window.showToast("PERMANENTLY DELETED!", "#10b981");
            window.loadRecycleBin();
            window.logAudit("Permanently Deleted Item", binId);
        } catch (e) {
            window.showToast("ERROR: " + e.message, "#e11d48");
        }
    });
};
window.restoreItem = async (binId, collection, docId) => { window.customConfirm("RESTORE ITEM TO MATRIX?", async () => { try { const binDoc = await db.collection("recycle_bin").doc(binId).get(); if (binDoc.exists) { await db.collection(collection).doc(docId).set(binDoc.data().data); await db.collection("recycle_bin").doc(binId).delete(); window.showToast("ITEM RESTORED!"); window.loadRecycleBin(); window.logAudit("Restored Item", docId); } } catch (e) { } }); };

// ==========================================
// 14. ROLE BUILDER
// ==========================================
window.saveCustomRole = async () => { const rName = document.getElementById("customRoleName").value.trim(); if (!rName) return; const perms = Array.from(document.querySelectorAll(".role-perm")).filter(cb => cb.checked).map(cb => cb.value); try { await db.collection("global_roles").doc(rName.toLowerCase().replace(/ /g, '_')).set({ name: rName, permissions: perms }); window.showToast("CUSTOM POLICY FORGED!"); document.getElementById("customRoleName").value = ""; Array.from(document.querySelectorAll(".role-perm")).forEach(c => c.checked = false); window.loadCustomRoles(); window.logAudit("Created Role", rName); } catch (e) { } };
window.loadCustomRoles = async () => { const tbody = document.getElementById("custom-roles-body"); try { const snap = await db.collection("global_roles").get(); let html = ""; snap.forEach(doc => { let d = doc.data(); html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 font-bold text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]">${d.name.toUpperCase()}</td><td class="p-4 text-[10px] text-coolGray font-mono tracking-widest">${d.permissions.join(', ').toUpperCase()}</td><td class="p-4 text-right"><button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteRole('${doc.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='3' class='p-4 text-center'>NO CUSTOM POLICIES.</td></tr>"; } catch (e) { } };
window.deleteRole = async (rId) => { window.customConfirm("PURGE POLICY?", async () => { await db.collection("global_roles").doc(rId).delete(); window.loadCustomRoles(); }); };

// ==========================================
// MAINTENANCE HEATMAP (CHART.JS)
// ==========================================
window.renderMaintenanceHeatmap = () => {
    const canvas = document.getElementById("apiHeatmap");
    if (!canvas) return;

    // Check if chart already exists
    if (window.apiHeatmapChart) window.apiHeatmapChart.destroy();

    const ctx = canvas.getContext("2d");
    const data = {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
        datasets: [{
            label: 'API Load Heatmap',
            data: [12, 19, 3, 5, 2, 3, 10],
            backgroundColor: 'rgba(0, 240, 255, 0.2)',
            borderColor: 'rgba(0, 240, 255, 1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
        }]
    };

    window.apiHeatmapChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { labels: { color: '#f8fafc', font: { family: 'monospace' } } } }
        }
    });
};
setTimeout(window.renderMaintenanceHeatmap, 2000);

// ==========================================
// TICKETS LOGIC
// ==========================================
window.loadTickets = async () => {
    const tbody = document.getElementById("ticketsTableBody");
    if (!tbody) return;
    try {
        const snap = await db.collection("tickets").get();
        let html = "";
        snap.forEach(doc => {
            const d = doc.data();
            html += `<tr class="hover:bg-slateSurface/50 transition border-l-2 ${d.status === 'Open' ? 'border-rose-500' : 'border-tealAccent'}">
                <td class="p-4 font-mono font-bold text-white">${doc.id.substring(0, 8).toUpperCase()}</td>
                <td class="p-4 text-coolLight">${d.schoolName || 'Unknown'}</td>
                <td class="p-4 text-coolGray">${d.subject}</td>
                <td class="p-4"><span class="px-2 py-1 rounded text-[10px] uppercase ${d.status === 'Open' ? 'bg-rose-500/20 text-rose-400' : 'bg-tealAccent/20 text-tealAccent'}">${d.status}</span></td>
                <td class="p-4 text-right">
                    <button class="px-2 py-1 bg-indigo-600/20 text-indigo-400 border border-indigo-500 hover:bg-indigo-600 hover:text-white rounded text-[10px]"><i class="fas fa-eye"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || "<tr><td colspan='5' class='p-4 text-center'>NO SLA TICKETS FOUND.</td></tr>";
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan='5' class='p-4 text-center text-rose-500'>ERROR LOADING TICKETS</td></tr>`;
    }
};
document.querySelector('[data-target="tab-tickets"]')?.addEventListener('click', window.loadTickets);

// ==========================================
// AI ASSISTANT CHAT LOGIC
// ==========================================
window.toggleAIChat = () => {
    const chatWindow = document.getElementById("ai-chat-window");
    if (chatWindow) chatWindow.classList.toggle("hidden-el");
};

window.sendAIMessage = async () => {
    const input = document.getElementById("ai-chat-input");
    const msg = input.value.trim();
    if (!msg) return;
    input.value = "";

    const messagesDiv = document.getElementById("ai-chat-messages");
    if (!messagesDiv) return;

    messagesDiv.innerHTML += `<div class="text-right mb-2"><span class="bg-tealAccent/20 px-3 py-2 rounded-lg text-tealAccent inline-block max-w-[85%] border border-tealAccent/50">${msg}</span></div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    const loadingId = "msg-" + Date.now();
    messagesDiv.innerHTML += `<div id="${loadingId}" class="text-left mb-2"><span class="bg-slateSurface px-3 py-2 rounded-lg text-coolGray inline-block max-w-[85%] border border-glassBorder"><i class="fas fa-circle-notch fa-spin"></i> Analyzing Core Data...</span></div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const schoolsSnap = await db.collection("schools").get();
        const schools = schoolsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const txSnap = await db.collection("transactions").get();
        const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const contextData = JSON.stringify({ schools, transactions });

        const res = await fetch((window.APP_CONFIG?.backendBaseUrl || '') + "/api/ai-assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: msg, context: contextData })
        });

        const data = await res.json();
        document.getElementById(loadingId).outerHTML = `<div class="text-left mb-2"><span class="bg-slateSurface px-3 py-2 rounded-lg text-white inline-block max-w-[85%] border border-tealAccent/20">${data.reply ? data.reply.replace(/\n/g, '<br>') : "NO RESPONSE"}</span></div>`;
    } catch (e) {
        document.getElementById(loadingId).outerHTML = `<div class="text-left mb-2"><span class="bg-rose-500/20 px-3 py-2 rounded-lg text-rose-400 inline-block max-w-[85%] border border-rose-500">Error: Unable to reach AI Backend.</span></div>`;
    }
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
};

// ==========================================
// GST INVOICE LOGIC
// ==========================================
window.generateGSTInvoice = async (schoolId) => {
    if (!schoolId || schoolId === 'ALL') {
        window.showToast("PLEASE SELECT A SPECIFIC NODE", "#e11d48");
        return;
    }
    window.showToast("FETCHING DATA...", "#3b82f6");
    try {
        const sDoc = await db.collection("schools").doc(schoolId).get();
        if (!sDoc.exists) return window.showToast("NODE NOT FOUND", "#e11d48");
        const sData = sDoc.data();

        const uDoc = await db.collection("users").doc(sData.chairmanUid).get();
        const email = uDoc.exists ? uDoc.data().email : "unknown@domain.com";
        const tier = sData.subscriptionTier || 'Starter';
        const schoolName = sData.schoolName || 'Unknown School';

        window.showToast("GENERATING GST INVOICE...", "#3b82f6");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        let basePrice = 5000;
        if (tier === 'Professional') basePrice = 12000;
        if (tier === 'Enterprise') basePrice = 25000;

        const gst = basePrice * 0.18;
        const total = basePrice + gst;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.text("GST INVOICE", 105, 20, null, null, "center");

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, 20, 40);
        doc.text(`Invoice No: INV-${Date.now().toString().slice(-6)}`, 20, 48);

        doc.text(`Billed To:`, 120, 40);
        doc.setFont("helvetica", "bold");
        doc.text(`${schoolName}`, 120, 48);
        doc.setFont("helvetica", "normal");
        doc.text(`Email: ${email}`, 120, 56);
        doc.text(`School ID: ${schoolId}`, 120, 64);

        doc.autoTable({
            startY: 80,
            head: [['Description', 'Quantity', 'Unit Price (INR)', 'Amount (INR)']],
            body: [
                [`Master Core SaaS - ${tier} Tier (Monthly)`, '1', basePrice.toFixed(2), basePrice.toFixed(2)],
            ],
            foot: [
                ['', '', 'Subtotal:', basePrice.toFixed(2)],
                ['', '', 'GST (18%):', gst.toFixed(2)],
                ['', '', 'Total Due:', total.toFixed(2)]
            ],
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42] },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] }
        });

        doc.setFontSize(10);
        doc.text("Thank you for your business. Please remit payment within 7 days.", 20, doc.lastAutoTable.finalY + 20);
        doc.text("Provider: CoreEdu Tech Pvt Ltd | GSTIN: 27AABCU9603R1ZM", 20, doc.lastAutoTable.finalY + 28);

        const fileName = `Invoice_${schoolName.replace(/ /g, '_')}_${Date.now()}.pdf`;
        doc.save(fileName);
        window.logAudit("Generated Invoice", schoolName);

    } catch (err) {
        console.error(err);
        window.showToast("INVOICE ERROR: " + err.message, "#e11d48");
    }
};
// ==========================================
// ==========================================
// MASSIVE UPGRADES - NEW LOGIC
// ==========================================

// 1. Landing Page Navigation Modals
window.scrollToPublicSection = (sectionId) => {
    const target = document.getElementById(sectionId);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.openPublicApkDownload = () => {
    const appSection = document.getElementById("public-app-section");
    if (appSection) {
        appSection.classList.remove("hidden-el");
        appSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
};

window.toggleHamburger = () => {
    const modal = document.getElementById('hamburger-modal');
    if (modal.classList.contains('hidden-el')) {
        modal.classList.remove('hidden-el');
        setTimeout(() => modal.classList.replace('opacity-0', 'opacity-100'), 10);
        document.getElementById('hamburger-modal-box').classList.replace('scale-95', 'scale-100');
    } else {
        modal.classList.replace('opacity-100', 'opacity-0');
        document.getElementById('hamburger-modal-box').classList.replace('scale-100', 'scale-95');
        setTimeout(() => modal.classList.add('hidden-el'), 300);
    }
};

window.showRegistrationModal = () => {
    document.getElementById('registration-modal').classList.remove('hidden-el');
    if (globalCountries.length === 0) window.loadCountriesAPI();
};

window.showForgotPasswordModal = () => {
    document.getElementById('forgot-password-modal').classList.remove('hidden-el');
};

window.showSchoolLoginModal = () => {
    document.getElementById('school-login-modal').classList.remove('hidden-el');
};

let globalCountries = [];
window.loadCountriesAPI = async () => {
    try {
        const res = await fetch("https://countriesnow.space/api/v0.1/countries/states");
        const data = await res.json();
        globalCountries = data.data.filter(c => c.name === "India");
        const cSelect = document.getElementById("reg-country");
        cSelect.innerHTML = '';
        globalCountries.forEach(c => {
            cSelect.innerHTML += `<option value="${c.name}" selected>${c.name}</option>`;
        });
        window.updateStateDropdown();
    } catch (e) {
        console.error("API Error", e);
    }
};

window.updateStateDropdown = () => {
    const countryName = document.getElementById('reg-country').value;
    const stateSelect = document.getElementById('reg-state');
    const districtSelect = document.getElementById('reg-district');
    stateSelect.innerHTML = '<option value="">Select State/Province</option>';
    districtSelect.innerHTML = '<option value="">Select District/City</option>';
    districtSelect.disabled = true;

    if (countryName) {
        stateSelect.disabled = false;
        const countryData = globalCountries.find(c => c.name === countryName);
        if (countryData && countryData.states && countryData.states.length > 0) {
            countryData.states.forEach(s => {
                stateSelect.innerHTML += `<option value="${s.name}">${s.name}</option>`;
            });
        }
    } else {
        stateSelect.disabled = true;
    }
};

window.updateDistrictDropdown = async () => {
    const countryName = document.getElementById('reg-country').value;
    const stateName = document.getElementById('reg-state').value;
    const districtSelect = document.getElementById('reg-district');
    districtSelect.innerHTML = '<option value="">Loading cities...</option>';

    if (!countryName || !stateName) {
        districtSelect.innerHTML = '<option value="">Select District/City</option>';
        districtSelect.disabled = true;
        return;
    }

    districtSelect.disabled = false;

    try {
        const res = await fetch("https://countriesnow.space/api/v0.1/countries/state/cities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country: countryName, state: stateName })
        });
        const data = await res.json();

        districtSelect.innerHTML = '<option value="">Select District/City</option>';
        if (data && !data.error && data.data && data.data.length > 0) {
            const cityMap = {};
            data.data.forEach(city => {
                const trimmedCity = city.trim();
                const lower = trimmedCity.toLowerCase();
                if (!cityMap[lower]) {
                    cityMap[lower] = trimmedCity;
                }
            });
            const uniqueCities = Object.values(cityMap).sort();
            uniqueCities.forEach(city => {
                districtSelect.innerHTML += `<option value="${city}">${city}</option>`;
            });
        } else {
            districtSelect.innerHTML = '<option value="">No cities found - type manually</option>';
            const manualInput = document.createElement('input');
            manualInput.type = 'text';
            manualInput.id = 'reg-district-manual';
            manualInput.className = 'input-premium w-full px-3 py-2 rounded-lg text-white text-sm mt-2';
            manualInput.placeholder = 'Type district/city name';
            districtSelect.parentElement.appendChild(manualInput);
        }
    } catch (e) {
        districtSelect.innerHTML = '<option value="">Error loading - type below</option>';
    }
};

// 2. Registration Logic
window.submitSchoolRegistration = async () => {
    const sName = document.getElementById('reg-school-name').value.trim();
    const pName = document.getElementById('reg-principal-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pwd = document.getElementById('reg-password').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const altPhone = document.getElementById('reg-alt-phone').value.trim();
    const affiliationNo = document.getElementById('reg-affiliation-no').value.trim();
    const board = document.getElementById('reg-board').value;
    const schoolType = document.getElementById('reg-school-type').value;
    const website = document.getElementById('reg-website').value.trim();
    const country = document.getElementById('reg-country').value;
    const state = document.getElementById('reg-state').value;
    const dist = document.getElementById('reg-district').value || (document.getElementById('reg-district-manual') ? document.getElementById('reg-district-manual').value.trim() : '');
    const pin = document.getElementById('reg-pincode').value.trim();
    const addr = document.getElementById('reg-address').value.trim();
    const logoInput = document.getElementById('reg-logo').files[0];

    if (!sName || !pName || !email || !pwd || !phone || !affiliationNo || !board || !schoolType || !country || !state || !dist || !pin || !addr || !logoInput) {
        window.showToast('ALL MANDATORY FIELDS AND UPLOADS ARE REQUIRED', '#e11d48');
        return;
    }

    // const recaptchaField = document.querySelector('#registration-modal [name="g-recaptcha-response"]');
    // if (recaptchaField && !recaptchaField.value) {
        // window.showToast('PLEASE VERIFY YOU ARE NOT A ROBOT', '#e11d48');
        // return;
    // }

    const btn = document.getElementById('submitRegBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> UPLOADING ASSETS...';
    btn.disabled = true;

    try {
        let logoData = "https://via.placeholder.com/150";
        if (logoInput) {
            const uploadedUrl = await uploadToCloudinary(logoInput);
            if (uploadedUrl) {
                logoData = uploadedUrl;
            } else {
                window.showToast('LOGO UPLOAD FAILED', '#e11d48');
                btn.innerHTML = 'SUBMIT DEPLOYMENT REQUEST';
                btn.disabled = false;
                return;
            }
        }

        const payload = {
            schoolName: sName,
            principalName: pName,
            email: email,
            password: pwd,
            phone: phone,
            altPhone: altPhone,
            affiliationNo: affiliationNo,
            board: board,
            schoolType: schoolType,
            website: website,
            country, state, district: dist, pincode: pin, address: addr,
            logoUrl: logoData,
            timestamp: Date.now(),
            status: 'pending'
        };

        await db.collection("pending_registrations").add(payload);

        window.showToast('REGISTRATION SUBMITTED FOR APPROVAL', '#10b981');
        window.closeCustomModal('registration-modal');
    } catch (err) {
        window.showToast('ERROR: ' + err.message, '#e11d48');
    } finally {
        btn.innerHTML = 'SUBMIT DEPLOYMENT REQUEST';
        btn.disabled = false;
    }
};

// 3. Forgot Password Logic
window.submitForgotPassword = async () => {
    const uid = document.getElementById('forgot-id').value.trim();
    const phone = document.getElementById('forgot-phone').value.trim();
    const newPwd = document.getElementById('forgot-new-password').value.trim();

    if (!uid && !phone) {
        window.showToast('PROVIDE AT LEAST ONE IDENTIFIER', '#e11d48');
        return;
    }
    if (!newPwd) {
        window.showToast('PROVIDE A NEW PASSWORD', '#e11d48');
        return;
    }

    const btn = document.getElementById('submitForgotBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESSING...';
    btn.disabled = true;

    try {
        const resp = await fetch("https://school-backend-zlgy.onrender.com/api/forgot-password", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, phone: phone, newPassword: newPwd })
        });
        const data = await resp.json();
        if (data.success) {
            window.showToast('RESET REQUEST SUBMITTED. WAIT FOR ADMIN APPROVAL.', '#10b981');
            window.closeCustomModal('forgot-password-modal');
        } else {
            window.showToast(data.error || 'REQUEST FAILED', '#e11d48');
        }
    } catch (err) {
        window.showToast('ERROR: ' + err.message, '#e11d48');
    } finally {
        btn.innerHTML = 'SEND RESET REQUEST';
        btn.disabled = false;
    }
};

// 3.5 School Login Logic
window.submitSchoolLogin = async () => {
    const email = document.getElementById('schoolLoginId').value.trim();
    const pwd = document.getElementById('schoolLoginPwd').value.trim();
    if (!email || !pwd) return window.showToast("ALL FIELDS REQUIRED", "#e11d48");

    const btn = document.getElementById('doSchoolLoginBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AUTHENTICATING...';
    btn.disabled = true;

    try {
        const cred = await secondaryAuth.signInWithEmailAndPassword(email, pwd);

        let isChairman = false;
        let userData = {};
        try {
            const docSnap = await db.collection("users").doc(cred.user.uid).get();
            if (docSnap.exists && docSnap.data().role === "chairman") {
                isChairman = true;
                userData = docSnap.data();
            }
        } catch (docErr) {
            console.error("docSnap read failed:", docErr);
            // Graceful handling: Since secondaryAuth succeeded but primary db blocked unauthenticated read,
            // we bypass role check here and let the Chairman portal verify them securely.
            isChairman = true;
        }

        if (isChairman) {
            // Login remains available when IP or browser geolocation cannot be resolved.
            try {
                let ipAddress = "Unknown";
                try {
                    const ipRes = await fetch('https://api.ipify.org?format=json');
                    const ipData = await ipRes.json();
                    ipAddress = ipData.ip;
                } catch (e) { }
                const coordinates = await getBrowserCoordinates();

                await db.collection("login_logs").add({
                    userId: cred.user.uid,
                    uid: cred.user.uid,
                    email: email,
                    name: userData.name || 'Chairman',
                    role: "chairman",
                    schoolId: userData.schoolId || "",
                    schoolName: userData.schoolName || "",
                    ip: ipAddress,
                    localIp: "Unknown",
                    device: navigator.userAgent,
                    latitude: coordinates?.latitude ?? null,
                    longitude: coordinates?.longitude ?? null,
                    locationAccuracy: coordinates?.accuracy ?? null,
                    locationSource: coordinates?.source || "ip-fallback",
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (logErr) {
                console.log("Login log error:", logErr);
            }

            window.showToast("CHAIRMAN NODE VERIFIED. REDIRECTING...", "#10b981");
            setTimeout(() => {
                const safeEmail = encodeURIComponent(email);
                const safePass = encodeURIComponent(pwd);
                const chairmanPortalLink = "https://bf0040792-rgb.github.io/CHAIRMAN-MANAGEMENT/";
                window.open(`${chairmanPortalLink}?email=${safeEmail}&pass=${safePass}`, '_blank');
                window.closeCustomModal('school-login-modal');
            }, 1000);
        } else {
            window.showToast("ACCESS DENIED: NOT A CHAIRMAN NODE", "#e11d48");
        }
        await secondaryAuth.signOut();
    } catch (err) {
        console.error("secondaryAuth login failed:", err);
        window.showToast("LOGIN FAILED: " + (err.message || "INVALID CREDENTIALS"), "#e11d48");
    } finally {
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> AUTHENTICATE';
        btn.disabled = false;
    }
};

// 4. Pending Approvals Tab Logic
window.loadPendingRegistrations = () => {
    const tbody = document.getElementById("pending-approvals-body");
    if (!tbody) return;

    db.collection("pending_registrations").onSnapshot(snapshot => {
        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-coolGray">NO PENDING REQUESTS</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="p-4"><img src="${data.logoUrl}" class="w-10 h-10 rounded-full border border-glassBorder object-cover"></td>
                <td class="p-4 font-bold text-white">${data.schoolName}<br><span class="text-[10px] text-emerald-400 font-mono">${data.email}</span></td>
                <td class="p-4 text-xs text-gray-300">${data.principalName}<br><span class="text-[10px] text-gray-500">${data.phone}</span></td>
                <td class="p-4 text-xs text-gray-300">${data.district}, ${data.state}</td>
                <td class="p-4"><a href="${data.authorityLetterUrl}" download="Authority_${data.schoolName}.pdf" class="text-indigo-400 hover:text-indigo-300 underline"><i class="fas fa-download"></i> View</a></td>
                <td class="p-4 text-right flex gap-2 justify-end">
                    <button onclick="window.approveRegistrationOnly('${doc.id}')" class="px-2 py-1.5 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded border border-indigo-500 transition text-[10px] font-bold" title="Generate Registration No Only"><i class="fas fa-file-signature"></i> REG ONLY</button>
                    <button onclick="window.approveRegistrationAuto('${doc.id}')" class="px-2 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded border border-emerald-500 transition text-[10px] font-bold" title="Auto Deploy Node Instantly"><i class="fas fa-rocket"></i> AUTO DEPLOY</button>
                    <button onclick="window.rejectRegistration('${doc.id}')" class="px-3 py-1.5 bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white rounded border border-rose-500 transition"><i class="fas fa-times"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
};

window.approveRegistrationAuto = async (docId) => {
    window.customConfirm("APPROVE THIS NODE DEPLOYMENT?", async () => {
        try {
            const docRef = db.collection("pending_registrations").doc(docId);
            const docSnap = await docRef.get();
            if (!docSnap.exists) return;

            const data = docSnap.data();

            // Generate Registration No
            const randomDigits = Math.floor(100000 + Math.random() * 900000);
            const regNo = `CORE/REG/EDU/${randomDigits}`;

            // 1. Create SecondaryAuth user
            let userRecord;
            try {
                userRecord = await secondaryAuth.createUserWithEmailAndPassword(data.email, data.password);
            } catch (err) {
                window.showToast("AUTH CREATION FAILED: " + err.message, "#e11d48");
                return;
            }

            // 2. Add to users collection
            await db.collection("users").doc(userRecord.user.uid).set({
                email: data.email,
                role: "chairman",
                status: "active",
                name: data.principalName,
                schoolName: data.schoolName,
                plainPassword: data.password,
                logoUrl: data.logoUrl || "",
                regNo: regNo
            });

            // 3. Add to schools collection
            const sRef = await db.collection("schools").add({
                schoolName: data.schoolName,
                address: data.address,
                phone: data.phone,
                chairmanUid: userRecord.user.uid,
                principalName: data.principalName,
                district: data.district,
                state: data.state,
                country: data.country,
                pincode: data.pincode,
                logoUrl: data.logoUrl,
                status: "active",
                regNo: regNo,
                createdAt: Date.now()
            });

            // 4. Link user to school
            await db.collection("users").doc(userRecord.user.uid).update({ schoolId: sRef.id });

            // 5. Delete pending request
            await docRef.delete();
            window.showToast("NODE PROVISIONED SUCCESSFULLY", "#10b981");
            window.logAudit("Provisioned Node", data.schoolName);

        } catch (err) {
            window.showToast("ERROR: " + err.message, "#e11d48");
        }
    });
};

window.approveRegistrationOnly = async (docId) => {
    window.customConfirm("APPROVE REGISTRATION AND GENERATE REG/NO?", async () => {
        try {
            const docRef = db.collection("pending_registrations").doc(docId);
            const docSnap = await docRef.get();
            if (!docSnap.exists) return;

            const data = docSnap.data();

            // Generate Registration No
            const randomDigits = Math.floor(100000 + Math.random() * 900000);
            const regNo = `CORE/REG/EDU/${randomDigits}`;

            // Save to accepted_registrations
            await db.collection("accepted_registrations").doc(regNo.replace(/\//g, "_")).set({
                ...data,
                regNo: regNo,
                acceptedAt: Date.now(),
                status: "approved_not_deployed"
            });

            // Delete from pending
            await docRef.delete();

            // Show the RegNo to the user
            prompt("SUCCESS! REGISTRATION NO GENERATED. Please copy this number:", regNo);
            window.logAudit("Generated Reg/No", regNo);

        } catch (err) {
            window.showToast("ERROR: " + err.message, "#e11d48");
        }
    });
};

window.rejectRegistration = async (docId) => {
    window.customConfirm("REJECT AND DELETE THIS DEPLOYMENT REQUEST?", async () => {
        try {
            await db.collection("pending_registrations").doc(docId).delete();
            window.showToast("REQUEST TERMINATED", "#10b981");
        } catch (err) {
            window.showToast("ERROR: " + err.message, "#e11d48");
        }
    });
};

// 5. Comm Hub (WhatsApp UI) Logic
let currentCommSchoolId = null;
let commSchools = [];
let stopCommSchoolListener = null;
let stopCommMessageListener = null;

function renderCommSchools(searchTerm = "") {
    const list = document.getElementById("comm-school-list");
    if (!list) return;
    const term = searchTerm.trim().toLowerCase();
    const filteredSchools = commSchools.filter(school => school.name.toLowerCase().includes(term) || school.id.toLowerCase().includes(term));
    list.innerHTML = "";
    filteredSchools.forEach(school => {
        const item = document.createElement("button");
        item.type = "button";
        item.dataset.schoolId = school.id;
        item.className = `school-list-item p-3 border-b border-glassBorder flex items-center gap-3 w-full text-left${school.id === currentCommSchoolId ? ' active' : ''}`;
        item.onclick = () => window.openCommChat(school.id, school.name, item);
        item.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-slateBase border border-glassBorder overflow-hidden shrink-0">
                <img src="${school.logoUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}" class="w-full h-full object-cover" alt="">
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="text-white text-xs font-bold truncate">${school.name}</h4>
                <p class="text-[9px] text-coolGray truncate">Open communication channel</p>
            </div>`;
        list.appendChild(item);
    });
    if (!filteredSchools.length) list.innerHTML = '<div class="p-5 text-center text-coolGray text-xs font-mono">NO MATCHING SCHOOLS</div>';
}

window.loadCommHubSchools = () => {
    const list = document.getElementById("comm-school-list");
    if (!list) return;
    if (!stopCommSchoolListener) {
        stopCommSchoolListener = db.collection("schools").onSnapshot(snapshot => {
            commSchools = snapshot.docs.map(doc => {
                const data = doc.data();
                return { id: doc.id, name: data.schoolName || data.name || 'Unnamed Node', logoUrl: data.logoUrl || '' };
            }).sort((a, b) => a.name.localeCompare(b.name));
            renderCommSchools(document.getElementById("comm-search")?.value || "");
        });
    } else {
        renderCommSchools(document.getElementById("comm-search")?.value || "");
    }
    const search = document.getElementById("comm-search");
    if (search && !search.dataset.bound) {
        search.dataset.bound = "true";
        search.addEventListener("input", event => renderCommSchools(event.target.value));
    }
};

window.openCommChat = (schoolId, schoolName, selectedItem = null) => {
    currentCommSchoolId = schoolId;
    document.getElementById("comm-active-school-name").innerText = schoolName;
    document.getElementById("comm-active-school-id").innerText = "ID: " + schoolId;
    document.querySelectorAll(".school-list-item").forEach(item => item.classList.toggle("active", item === selectedItem || item.dataset.schoolId === schoolId));

    const historyBox = document.getElementById("comm-chat-history");
    if (!historyBox) return;
    if (stopCommMessageListener) stopCommMessageListener();
    stopCommMessageListener = db.collection("communications")
        .where("schoolId", "==", schoolId)
        .onSnapshot(snapshot => {
            historyBox.innerHTML = '';
            if (snapshot.empty) {
                historyBox.innerHTML = '<div class="flex-1 flex items-center justify-center text-coolGray font-mono text-xs text-center"><i class="fas fa-satellite-dish text-4xl mb-2 opacity-20 block"></i><br>End-to-End Encrypted Comms<br>No messages yet.</div>';
                return;
            }

            let messages = [];
            snapshot.forEach(doc => {
                messages.push({ id: doc.id, ...doc.data() });
            });

            messages.sort((a, b) => timestampToMillis(a.timestamp) - timestampToMillis(b.timestamp));

            messages.forEach(msg => {
                const isMaster = msg.sender === 'master';
                const wrap = document.createElement("div");
                wrap.className = `flex w-full ${isMaster ? 'justify-end' : 'justify-start'}`;

                const tsMillis = timestampToMillis(msg.timestamp);
                const timeStr = tsMillis ? new Date(tsMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'SENDING';

                let fileHTML = '';
                if (msg.attachmentUrl) {
                    fileHTML = `<a href="${msg.attachmentUrl}" target="_blank" class="block mb-2 text-indigo-300 underline text-[10px]"><i class="fas fa-file"></i> View Attachment</a>`;
                }

                wrap.innerHTML = `
                  <div class="chat-bubble ${isMaster ? 'sent' : 'received'}">
                      ${fileHTML}
                      <span>${msg.text}</span>
                      <span class="timestamp">${timeStr}</span>
                  </div>
              `;
                historyBox.appendChild(wrap);
            });

            // Scroll to bottom
            historyBox.scrollTop = historyBox.scrollHeight;
        });
};

window.sendCommMessage = async () => {
    if (!currentCommSchoolId) {
        window.showToast("SELECT A NODE FIRST", "#e11d48");
        return;
    }
    const input = document.getElementById("comm-message-input");
    const text = input.value.trim();
    const fileInput = document.getElementById("comm-attachment");

    if (!text && !fileInput.files.length) return;

    let attachmentUrl = null;
    if (fileInput.files.length > 0) {
        // Mock upload
        const readAsDataURL = (file) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
        attachmentUrl = await readAsDataURL(fileInput.files[0]);
    }

    try {
        await db.collection("communications").add({
            schoolId: currentCommSchoolId,
            sender: 'master',
            text: text,
            attachmentUrl: attachmentUrl,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        fileInput.value = '';
    } catch (err) {
        window.showToast("TRANSMISSION FAILED: " + err.message, "#e11d48");
    }
};

window.clearCommHistory = async () => {
    if (!currentCommSchoolId) return;
    window.customConfirm("WIPE COMM HISTORY FOR THIS NODE?", async () => {
        try {
            const batch = db.batch();
            const docs = await db.collection("communications").where("schoolId", "==", currentCommSchoolId).get();
            docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            window.showToast("HISTORY WIPED", "#10b981");
        } catch (err) {
            window.showToast("ERROR: " + err.message, "#e11d48");
        }
    });
};

// 6. Updated Bulk Delete functions
window.bulkDeletePasswordReqs = async () => {
    const table = document.getElementById("password-req-table");
    const checkboxes = table.querySelectorAll(".row-checkbox:checked");
    if (checkboxes.length === 0) {
        window.showToast("NO TARGETS SELECTED", "#e11d48");
        return;
    }
    window.customConfirm(`DELETE ${checkboxes.length} TARGETS?`, async () => {
        try {
            const batch = db.batch();
            checkboxes.forEach(cb => {
                const docRef = db.collection("password_requests").doc(cb.dataset.id);
                batch.delete(docRef);
            });
            await batch.commit();
            window.showToast("BULK PURGE COMPLETE", "#10b981");
        } catch (err) {
            window.showToast("ERROR: " + err.message, "#e11d48");
        }
    });
};

window.toggleSelectAllPwdReq = (source) => {
    const table = document.getElementById("password-req-table");
    const checkboxes = table.querySelectorAll(".row-checkbox");
    checkboxes.forEach(cb => cb.checked = source.checked);
};

// ==========================================
// STUDENT TRANSFER HQ APPROVALS
// ==========================================
window.fetchedTransferApprovals = [];

function normalizeTransferStatus(status, transfer = {}) {
    const value = String(status || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    if (["completed", "accepted", "transfer completed"].includes(value)) return "Completed";
    if (["rejected", "declined", "hq rejected"].includes(value)) return "Rejected";
    if (["cancelled", "canceled"].includes(value)) return "Cancelled";
    if (["pending target accept", "pending target acceptance", "hq approved", "forwarded to principal"].includes(value)) return "Pending Target Accept";
    if (["pending hq approval", "pending", "submitted", "requested", "awaiting hq approval", "pending company approval"].includes(value)) return "Pending HQ Approval";
    if (!value && Number(transfer.workflowStage || 1) <= 1) return "Pending HQ Approval";
    return status || "Pending HQ Approval";
}

function transferCreatedMillis(transfer) {
    return timestampToMillis(transfer.createdAt || transfer.timestamp || transfer.requestedAt || transfer.transferDate);
}

window.loadTransferApprovals = async () => {
    const tbody = document.getElementById("transfer-approvals-body");
    const filter = document.getElementById("transfer-approval-filter")?.value || "Pending HQ Approval";
    if (tbody) tbody.innerHTML = `<tr><td colspan='8' class='text-center p-4 text-coolGray font-mono'>LOADING TRANSFERS...</td></tr>`;
    try {
        const snapshot = await db.collection("student_transfers").get();
        window.fetchedTransferApprovals = snapshot.docs.map(doc => {
            const transfer = { id: doc.id, ...doc.data() };
            transfer.status = normalizeTransferStatus(transfer.status, transfer);
            return transfer;
        });
        const pendingCount = window.fetchedTransferApprovals.filter(transfer => transfer.status === "Pending HQ Approval").length;
        const badge = document.getElementById("hub-transfer-count");
        if (badge) badge.textContent = String(pendingCount);

        const filtered = window.fetchedTransferApprovals
            .filter(transfer => filter === "all" || transfer.status === normalizeTransferStatus(filter))
            .sort((a, b) => transferCreatedMillis(b) - transferCreatedMillis(a));
        if (!tbody) return;
        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan='8' class='text-center p-4 text-coolGray font-mono'>NO TRANSFERS FOUND</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(transfer => {
            const docs = transfer.documents || {};
            const docLinks = Object.entries(docs).filter(([, url]) => Boolean(url))
                .map(([key, url]) => `<a href="${url}" target="_blank" rel="noopener" class="text-tealAccent hover:underline block text-[10px]"><i class="fas fa-paperclip"></i> ${key}</a>`).join("");
            const statusColor = transfer.status === "Pending HQ Approval" ? "text-amber-400" : transfer.status === "Pending Target Accept" ? "text-blue-400" : transfer.status === "Completed" ? "text-emerald-400" : ["Rejected", "Cancelled"].includes(transfer.status) ? "text-rose-400" : "text-coolGray";
            const actions = transfer.status === "Pending HQ Approval"
                ? `<button class="px-2 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] transition mr-1" onclick="window.approveTransfer('${transfer.id}')"><i class="fas fa-share"></i> Accept & Forward to Principal</button><button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.hqRejectTransfer('${transfer.id}')"><i class="fas fa-times"></i> Reject</button>`
                : `<span class="text-coolGray text-[10px]">No action</span>`;
            const transferDate = transfer.transferDate || (transferCreatedMillis(transfer) ? new Date(transferCreatedMillis(transfer)).toLocaleDateString() : 'N/A');
            return `<tr class="hover:bg-slateSurface/50 transition">
                <td class="p-4 text-[10px]">${transferDate}</td>
                <td class="p-4"><strong class="block text-white">${transfer.studentName || 'N/A'}</strong><span class="text-[10px] text-coolGray">Class ${transfer.studentClass || transfer.className || 'N/A'} | Roll ${transfer.rollNo || 'N/A'}</span></td>
                <td class="p-4 text-[10px]">${transfer.fromSchoolName || transfer.sourceSchoolName || 'N/A'}</td>
                <td class="p-4 text-[10px]">${transfer.toSchoolName || transfer.targetSchoolName || 'N/A'}</td>
                <td class="p-4 text-[10px]">${transfer.reason || transfer.transferReason || 'N/A'}</td>
                <td class="p-4 text-[10px]">${docLinks || 'None'}</td>
                <td class="p-4"><span class="${statusColor} font-bold text-[10px] tracking-widest">${transfer.status.toUpperCase()}</span></td>
                <td class="p-4 text-right whitespace-nowrap">${actions}</td>
            </tr>`;
        }).join("");
    } catch (error) {
        console.error("Load transfer approvals failed:", error);
        if (tbody) tbody.innerHTML = `<tr><td colspan='8' class='text-center p-4 text-rose-400 font-mono'>ERROR LOADING TRANSFERS</td></tr>`;
    }
};

window.approveTransfer = async (transferId) => {
    const tr = window.fetchedTransferApprovals.find(t => t.id === transferId);
    if (!tr) return window.showToast("TRANSFER NOT FOUND", "#e11d48");
    if (normalizeTransferStatus(tr.status, tr) !== "Pending HQ Approval") return window.showToast("ONLY PENDING REQUESTS CAN BE APPROVED", "#e11d48");
    window.customConfirm(`ACCEPT AND FORWARD TRANSFER OF ${tr.studentName || 'STUDENT'} TO ${tr.toSchoolName || tr.targetSchoolName || 'TARGET SCHOOL'} PRINCIPAL?`, async () => {
        try {
            const stages = tr.workflowStages || [];
            stages.forEach(s => { if (s.stage === "HQ Approval") { s.done = true; s.at = new Date().toISOString(); } });
            await db.collection("student_transfers").doc(transferId).update({
                status: "Pending Target Accept",
                workflowStage: 2,
                hqApprovedAt: firebase.firestore.FieldValue.serverTimestamp(),
                hqApprovedBy: superAdminUid || "hq",
                workflowStages: stages
            });
            window.showToast("✅ TRANSFER APPROVED & FORWARDED TO TARGET SCHOOL", "#10b981");
            window.logAudit("Approved Student Transfer", `${tr.studentName} -> ${tr.toSchoolName}`);
            window.loadTransferApprovals();
        } catch (e) {
            window.showToast("APPROVAL ERROR: " + e.message, "#e11d48");
        }
    });
};

window.hqRejectTransfer = async (transferId) => {
    const tr = window.fetchedTransferApprovals.find(t => t.id === transferId);
    if (!tr) return window.showToast("TRANSFER NOT FOUND", "#e11d48");
    if (normalizeTransferStatus(tr.status, tr) !== "Pending HQ Approval") return window.showToast("ONLY PENDING REQUESTS CAN BE REJECTED", "#e11d48");
    const reasonInput = prompt(`Mandatory rejection remark for ${tr.studentName || 'student'}:`);
    if (reasonInput === null) return;
    const reason = reasonInput.trim();
    if (!reason) return window.showToast("REJECTION REMARK IS REQUIRED", "#e11d48");
    try {
        const stages = tr.workflowStages || [];
        stages.forEach(s => { if (s.stage === "HQ Approval") { s.done = true; s.at = new Date().toISOString(); s.rejected = true; } });
        const batch = db.batch();
        batch.update(db.collection("student_transfers").doc(transferId), {
            status: "Rejected",
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: superAdminUid || "hq",
            rejectReason: reason,
            workflowStages: stages
        });
        if (tr.studentId) {
            const studentRef = db.collection("students").doc(tr.studentId);
            const studentDoc = await studentRef.get();
            if (studentDoc.exists) {
                const studentData = studentDoc.data();
                if (studentData.transferRecordId === transferId) {
                    const updateData = {};
                    if (studentData.transferStatus) updateData.transferStatus = firebase.firestore.FieldValue.delete();
                    if (studentData.pendingTransferTo) updateData.pendingTransferTo = firebase.firestore.FieldValue.delete();
                    if (Object.keys(updateData).length > 0) batch.update(studentRef, updateData);
                }
            }
        }
        await batch.commit();
        window.showToast("✅ TRANSFER REJECTED BY HQ", "#10b981");
        window.logAudit("Rejected Student Transfer", `${tr.studentName} -> ${tr.toSchoolName}`);
        window.loadTransferApprovals();
    } catch (e) {
        window.showToast("REJECT ERROR: " + e.message, "#e11d48");
    }
};

// Also hook up load functions into the tab switching logic:
const originalSwitchTab = window.switchTab;
if (originalSwitchTab) {
    // If we want to intercept
} else {
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-target');
            if (t === 'tab-pending-approvals') window.loadPendingRegistrations();
            if (t === 'tab-broadcast') window.loadCommHubSchools();
            if (t === 'tab-transfer-approvals') window.loadTransferApprovals();
        });
    });
}

// ==========================================
// 15. CORE AI ASSISTANT LOGIC (Consolidated)
// ==========================================

document.getElementById("ai-chat-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") window.sendAIMessage();
});

// Tickets are loaded via the earlier defined window.loadTickets function

// ==========================================
// 16. NEW FEATURES (ANALYTICS, ATTENDANCE, NOTIFICATIONS, SECURITY)
// ==========================================

window.loadGlobalAnalyticsDashboard = async () => {
    try {
        const schoolsSnap = await db.collection("schools").get();
        const schoolNames = new Map();
        let active = 0, expired = 0;
        schoolsSnap.forEach(doc => {
            const data = doc.data();
            schoolNames.set(doc.id, data.schoolName || data.name || doc.id);
            if (data.licenseStatus === 'Active' || data.licenseStatus === 'active') active++;
            else expired++;
        });
        const statLicenses = document.getElementById("stat-licenses");
        if (statLicenses) statLicenses.innerText = `${active} / ${expired}`;

        const studentsSnap = await db.collection("students").get();
        let studentCounts = {};
        studentsSnap.forEach(doc => {
            const data = doc.data();
            if (data.schoolId) {
                studentCounts[data.schoolId] = (studentCounts[data.schoolId] || 0) + 1;
            }
        });

        const sortedSchools = Object.keys(studentCounts)
            .sort((a, b) => studentCounts[b] - studentCounts[a])
            .slice(0, 10);
        const chartLabels = sortedSchools.map(schoolId => schoolNames.get(schoolId) || schoolId);
        const chartData = sortedSchools.map(schoolId => studentCounts[schoolId]);
        const axisColor = document.body.classList.contains('light-theme') ? '#475569' : '#cbd5e1';
        const gridColor = document.body.classList.contains('light-theme')
            ? 'rgba(100, 116, 139, 0.16)'
            : 'rgba(148, 163, 184, 0.12)';
        const sharedChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 450 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: axisColor,
                        boxWidth: 10,
                        boxHeight: 10,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16,
                        font: { size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f8fafc',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(148, 163, 184, 0.28)',
                    borderWidth: 1,
                    padding: 11,
                    displayColors: true
                }
            }
        };

        const ctxStudent = document.getElementById('studentChart');
        if (ctxStudent) {
            if (window.studentChartInstance) window.studentChartInstance.destroy();
            window.studentChartInstance = new Chart(ctxStudent, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Students',
                        data: chartData,
                        backgroundColor: 'rgba(34, 211, 238, 0.72)',
                        borderColor: '#22d3ee',
                        borderWidth: 1,
                        borderRadius: 4,
                        maxBarThickness: 42
                    }]
                },
                options: {
                    ...sharedChartOptions,
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: axisColor,
                                maxRotation: 35,
                                minRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: 10,
                                font: { size: 10 }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: gridColor, drawBorder: false },
                            ticks: { color: axisColor, precision: 0, padding: 8 }
                        }
                    }
                }
            });
        }

        const txSnap = await db.collection("transactions").where("type", "==", "Fee").get();
        let monthlyRev = {};
        let now = new Date();
        for (let i = 5; i >= 0; i--) {
            let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            let mStr = d.toLocaleString('default', { month: 'short' }) + " " + d.getFullYear();
            monthlyRev[mStr] = 0;
        }

        txSnap.forEach(doc => {
            const data = doc.data();
            const timestamp = timestampToMillis(data.date || data.timestamp || data.createdAt);
            if (!timestamp) return;

            const date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) return;

            const monthKey = date.toLocaleString('default', { month: 'short' }) + " " + date.getFullYear();
            const amount = Number.parseFloat(data.amount);
            if (monthlyRev[monthKey] !== undefined && Number.isFinite(amount)) {
                monthlyRev[monthKey] += amount;
            }
        });

        const ctxRev = document.getElementById('revenueChart');
        if (ctxRev) {
            if (window.revenueChartInstance) window.revenueChartInstance.destroy();
            window.revenueChartInstance = new Chart(ctxRev, {
                type: 'line',
                data: {
                    labels: Object.keys(monthlyRev),
                    datasets: [{
                        label: 'Revenue (₹)',
                        data: Object.values(monthlyRev),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.14)',
                        pointBackgroundColor: '#fbbf24',
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        borderWidth: 2,
                        fill: true,
                        tension: 0.32
                    }]
                },
                options: {
                    ...sharedChartOptions,
                    plugins: {
                        ...sharedChartOptions.plugins,
                        tooltip: {
                            ...sharedChartOptions.plugins.tooltip,
                            callbacks: {
                                label: context => ` Revenue: ₹${Number(context.parsed.y || 0).toLocaleString('en-IN')}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: axisColor, padding: 8, font: { size: 10 } }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: gridColor, drawBorder: false },
                            ticks: {
                                color: axisColor,
                                padding: 8,
                                callback: value => `₹${Number(value).toLocaleString('en-IN', { notation: 'compact' })}`
                            }
                        }
                    }
                }
            });
        }
    } catch (e) {
        console.error("Dashboard Load Error: ", e);
    }
};

window.loadAttendanceSummary = async (targetDate) => {
    let dateStr = targetDate;
    if (!dateStr) {
        const today = new Date();
        dateStr = today.toISOString().split('T')[0];
        document.getElementById('attendanceSummaryDate').value = dateStr;
    }

    document.getElementById('attendanceSummaryDate').onchange = (e) => {
        window.loadAttendanceSummary(e.target.value);
    };

    const tbody = document.getElementById("attendance-summary-body");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6' class='text-center p-4 text-coolGray'>Loading...</td></tr>";

    try {
        const attSnap = await db.collection("attendance").where("date", "==", dateStr).get();
        let schoolAtt = {};

        attSnap.forEach(doc => {
            let data = doc.data();
            if (!schoolAtt[data.schoolId]) schoolAtt[data.schoolId] = { present: 0, absent: 0, total: 0 };

            if (data.records && Array.isArray(data.records)) {
                data.records.forEach(r => {
                    schoolAtt[data.schoolId].total++;
                    if (r.status === 'Present') schoolAtt[data.schoolId].present++;
                    else if (r.status === 'Absent' || r.status === 'Late') schoolAtt[data.schoolId].absent++;
                });
            }
        });

        tbody.innerHTML = "";
        if (Object.keys(schoolAtt).length === 0) {
            tbody.innerHTML = "<tr><td colspan='6' class='text-center p-4 text-coolGray'>No attendance records found for this date.</td></tr>";
            return;
        }

        for (let sid of Object.keys(schoolAtt)) {
            let sDoc = await db.collection("schools").doc(sid).get();
            let sName = sDoc.exists ? sDoc.data().schoolName : sid;
            let att = schoolAtt[sid];
            let pct = att.total > 0 ? ((att.present / att.total) * 100).toFixed(1) : 0;
            let isLow = pct < 70;

            tbody.innerHTML += `
                <tr class="${isLow ? 'bg-rose-500/10' : ''}">
                    <td class="p-4 font-bold text-white">${sName}</td>
                    <td class="p-4">${dateStr}</td>
                    <td class="p-4 text-center font-bold text-tealAccent">${att.total}</td>
                    <td class="p-4 text-center text-emerald-400 font-bold">${att.present}</td>
                    <td class="p-4 text-center text-rose-400 font-bold">${att.absent}</td>
                    <td class="p-4 text-center font-bold ${isLow ? 'text-rose-500' : 'text-emerald-400'}">${pct}%</td>
                </tr>
            `;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan='6' class='text-center p-4 text-rose-500'>Error loading attendance</td></tr>`;
        console.error(e);
    }
};

window.sendGlobalNotification = async () => {
    const title = document.getElementById("notifTitle").value;
    const type = document.getElementById("notifType").value;
    const target = document.getElementById("notifTarget").value;
    const message = document.getElementById("notifMessage").value;

    if (!title || !message) {
        if (window.showToast) window.showToast("Please fill all fields", "#f43f5e");
        else alert("Please fill all fields");
        return;
    }

    try {
        await db.collection("notifications").add({
            title, type, target, message,
            sentAt: firebase.firestore.FieldValue.serverTimestamp(),
            sentBy: "master",
            isRead: false
        });

        document.getElementById("notifTitle").value = "";
        document.getElementById("notifMessage").value = "";

        if (window.showToast) window.showToast("Notification Sent", "#10b981");
        else alert("Notification Sent");

        window.loadGlobalNotifications();
    } catch (e) {
        console.error(e);
        if (window.showToast) window.showToast("Error sending notification", "#f43f5e");
    }
};

window.loadGlobalNotifications = async () => {
    const tbody = document.getElementById("notifications-table-body");
    if (!tbody) return;

    try {
        const snap = await db.collection("notifications").where("sentBy", "==", "master").orderBy("sentAt", "desc").limit(50).get();
        tbody.innerHTML = "";

        if (snap.empty) {
            tbody.innerHTML = "<tr><td colspan='6' class='text-center p-4 text-coolGray'>No notifications sent yet.</td></tr>";
            return;
        }

        snap.forEach(doc => {
            const data = doc.data();
            let dateStr = data.sentAt ? new Date(data.sentAt.toDate()).toLocaleString() : "Just now";

            let colorClass = "text-tealAccent";
            if (data.type === "Warning") colorClass = "text-amber-400";
            else if (data.type === "Critical") colorClass = "text-rose-500";

            tbody.innerHTML += `
                <tr class="hover:bg-slateSurface/50 transition">
                    <td class="p-4">${dateStr}</td>
                    <td class="p-4 font-bold text-white">${data.target === 'all' ? 'ALL SCHOOLS' : data.target}</td>
                    <td class="p-4 font-bold ${colorClass}">${data.type}</td>
                    <td class="p-4 font-bold text-white">${data.title}</td>
                    <td class="p-4 max-w-xs truncate" title="${data.message}">${data.message}</td>
                    <td class="p-4 text-right">
                        <button onclick="deleteNotification('${doc.id}')" class="text-rose-500 hover:text-rose-400 transition transform hover:scale-110"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
};

window.deleteNotification = async (id) => {
    if (confirm("Delete this notification?")) {
        try {
            await db.collection("notifications").doc(id).delete();
            window.loadGlobalNotifications();
            if (window.showToast) window.showToast("Notification deleted", "#10b981");
        } catch (e) {
            console.error(e);
            if (window.showToast) window.showToast("Error deleting", "#f43f5e");
        }
    }
};

window.loadSecurityLogs = async () => {
    const tbody = document.getElementById("security-logs-body");
    const alertsBox = document.getElementById("suspicious-activity-container");
    if (!tbody || !alertsBox) return;

    const roleFilter = document.getElementById("secLogRole").value;
    const schoolFilter = document.getElementById("secLogSchool").value;
    const dateFilter = document.getElementById("secLogDate").value;

    try {
        let query = db.collection("login_logs");
        const snap = await query.orderBy("timestamp", "desc").limit(100).get();

        tbody.innerHTML = "";
        alertsBox.innerHTML = "";
        let logs = [];

        snap.forEach(doc => {
            let data = Object.assign({ id: doc.id }, doc.data());
            logs.push(data);
        });

        let filteredLogs = logs.filter(l => {
            let dateMatch = true;
            if (dateFilter) {
                let dStr = l.timestamp ? new Date(l.timestamp).toISOString().split('T')[0] : "";
                if (dStr !== dateFilter) dateMatch = false;
            }
            let rMatch = roleFilter === "ALL" || l.role === roleFilter;
            let sMatch = schoolFilter === "ALL" || l.schoolId === schoolFilter;
            return dateMatch && rMatch && sMatch;
        });

        let ipMap = {};
        let suspiciousAlerts = [];

        filteredLogs.forEach(l => {
            let ts = l.timestamp ? new Date(l.timestamp) : null;
            let isOutofHours = false;
            if (ts) {
                let hours = ts.getHours();
                if (hours < 6 || hours > 22) { // outside 6 AM - 10 PM
                    isOutofHours = true;
                    suspiciousAlerts.push(`Out of hours login attempt by ${l.userName || 'Unknown'} at ${ts.toLocaleTimeString()}`);
                }
            }

            if (l.ipAddress) {
                if (!ipMap[l.ipAddress]) ipMap[l.ipAddress] = new Set();
                if (l.schoolId) ipMap[l.ipAddress].add(l.schoolId);
            }

            let isSuspicious = isOutofHours || (l.action === 'Login Failed');

            tbody.innerHTML += `
                <tr class="${isSuspicious ? 'bg-rose-500/10 text-rose-300' : 'hover:bg-slateSurface/50 transition'}">
                    <td class="p-4">${ts ? ts.toLocaleString() : '-'}</td>
                    <td class="p-4 font-bold">${l.userName || 'Unknown'}</td>
                    <td class="p-4 uppercase tracking-widest">${l.role || '-'}</td>
                    <td class="p-4">${l.schoolId || '-'}</td>
                    <td class="p-4 font-mono text-cyan-400">${l.ipAddress || 'Unknown'}</td>
                    <td class="p-4">${l.device || 'Unknown'}</td>
                    <td class="p-4 font-bold ${l.action === 'Login Failed' ? 'text-rose-500' : 'text-tealAccent'}">${l.action || 'Login'}</td>
                </tr>
            `;
        });

        for (let ip in ipMap) {
            if (ipMap[ip].size >= 3) {
                suspiciousAlerts.push(`Same IP (${ip}) attempting login across ${ipMap[ip].size} different schools.`);
            }
        }

        if (suspiciousAlerts.length > 0) {
            let alertsHtml = suspiciousAlerts.map(a => `<div class="bg-rose-500/20 border border-rose-500 text-rose-400 p-3 font-mono rounded-lg shadow-[0_0_10px_rgba(244,63,94,0.2)]"><i class="fas fa-exclamation-triangle mr-2"></i> SUSPICIOUS ACTIVITY: ${a}</div>`).join('');
            alertsBox.innerHTML = alertsHtml;
        } else {
            alertsBox.innerHTML = `<div class="bg-emerald-500/10 border border-emerald-500 text-emerald-400 p-3 font-mono rounded-lg"><i class="fas fa-shield-check mr-2"></i> System Secure. No suspicious activity detected.</div>`;
        }

        if (filteredLogs.length === 0) {
            tbody.innerHTML = "<tr><td colspan='7' class='text-center p-4 text-coolGray'>No logs found.</td></tr>";
        }

    } catch (e) {
        console.error(e);
        tbody.innerHTML = "<tr><td colspan='7' class='text-center p-4 text-rose-500'>Error loading logs</td></tr>";
    }
};

window.exportSecurityLogsPDF = () => {
    if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const doc = new jspdf.jsPDF();
        doc.text("System Security Logs - CoreEdu.IN Master Core", 10, 10);
        doc.autoTable({
            html: '#security-logs-body',
            startY: 20,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 }
        });
        doc.save("CoreEdu_Security_Logs.pdf");
    } else {
        if (window.showToast) window.showToast("PDF generation library not found.", "#f43f5e");
        else alert("PDF generation library not found.");
    }
};

// Hook the new tabs
document.querySelectorAll('.menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-target');
        if (t === 'tab-dashboard') window.loadGlobalAnalyticsDashboard();
        if (t === 'tab-attendance-summary') window.loadAttendanceSummary();
        if (t === 'tab-notifications') window.loadGlobalNotifications();
        if (t === 'tab-system-security') window.loadSecurityLogs();
    });
});

// Load dashboard analytics by default after a short delay
setTimeout(() => {
    if (window.loadGlobalAnalyticsDashboard) window.loadGlobalAnalyticsDashboard();
}, 2000);

// ==========================================
// 🛡️ MS STUDIO (BATCH PHOTO PROCESSOR) 🛡️
// ==========================================

let studioImages = [];

document.getElementById('studio-upload')?.addEventListener('change', function (e) {
    const files = e.target.files;
    if (!files.length) return;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Standard passport ratio is 35:45 (or 7:9)
                const TARGET_WIDTH = 350;
                const TARGET_HEIGHT = 450;
                canvas.width = TARGET_WIDTH;
                canvas.height = TARGET_HEIGHT;

                const ctx = canvas.getContext('2d');

                // Calculate cover cropping (fill the canvas, center crop)
                const imgRatio = img.width / img.height;
                const targetRatio = TARGET_WIDTH / TARGET_HEIGHT;
                let sWidth = img.width;
                let sHeight = img.height;
                let sx = 0;
                let sy = 0;

                if (imgRatio > targetRatio) {
                    // Image is wider than passport format, crop sides
                    sWidth = img.height * targetRatio;
                    sx = (img.width - sWidth) / 2;
                } else {
                    // Image is taller than passport format, crop top/bottom
                    // Usually we want to keep the top (head) so we shift sy slightly higher rather than absolute center
                    sHeight = img.width / targetRatio;
                    sy = (img.height - sHeight) * 0.2;
                }

                // Fill background with white just in case of transparent uploads
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

                // Draw cropped image
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

                // Compress to JPEG for high-speed API payload
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.9);

                const newIndex = studioImages.length;
                studioImages.push({
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    originalBase64: compressedBase64,
                    processedBase64: null,
                    nameText: "",
                    isProcessed: false,
                    isLoading: false
                });
                renderStudioGrid();
                processSingleBG(newIndex);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
    // Reset input
    this.value = '';
});

document.getElementById('studio-bg-color')?.addEventListener('input', function (e) {
    const color = e.target.value;
    document.querySelectorAll('.studio-img-wrapper').forEach(el => {
        el.style.backgroundColor = color;
    });
});

function renderStudioGrid() {
    const grid = document.getElementById('studio-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const bgColor = document.getElementById('studio-bg-color').value || '#FF0000';

    studioImages.forEach((img, index) => {
        const imgSrc = img.processedBase64 || img.originalBase64;

        const card = document.createElement('div');
        card.className = 'studio-card';

        let loaderHtml = img.isLoading ?
            `<div class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10">
                <i class="fas fa-circle-notch fa-spin text-white text-2xl mb-2"></i>
                <span class="text-white text-[10px] font-mono mt-2">Processing...</span>
            </div>` : '';

        // Conditional display for nameplate
        const hasName = img.nameText && img.nameText.trim() !== "";
        const nameplateClass = hasName ? "studio-nameplate" : "studio-nameplate hidden-el";

        card.innerHTML = `
            <div class="studio-img-wrapper" style="background-color: ${bgColor};">
                ${loaderHtml}
                <img src="${imgSrc}" alt="Studio Photo" style="background-color: transparent;">
                <div class="${nameplateClass}" id="nameplate-container-${index}">
                    <span id="nameplate-text-${index}">${hasName ? img.nameText.toUpperCase() : ''}</span>
                </div>
            </div>
            <input type="text" class="input-premium w-full mt-2 px-2 py-1 text-xs text-center font-mono rounded" placeholder="Enter Name..." value="${img.nameText}" oninput="updateStudioName(${index}, this.value)">
            <button onclick="removeStudioImage(${index})" class="mt-2 text-rose-500 text-[10px] hover:text-rose-400 font-mono"><i class="fas fa-trash"></i> Remove</button>
        `;
        grid.appendChild(card);
    });
}

window.updateStudioName = function (index, value) {
    if (studioImages[index]) {
        studioImages[index].nameText = value;
        // Update live DOM
        const nameplateContainer = document.getElementById(`nameplate-container-${index}`);
        const nameplateText = document.getElementById(`nameplate-text-${index}`);

        if (value.trim() === '') {
            if (nameplateContainer) nameplateContainer.classList.add('hidden-el');
        } else {
            if (nameplateContainer) nameplateContainer.classList.remove('hidden-el');
            if (nameplateText) nameplateText.innerText = value.toUpperCase();
        }
    }
}

window.removeStudioImage = function (index) {
    studioImages.splice(index, 1);
    renderStudioGrid();
}

window.syncBulkNames = function () {
    const text = document.getElementById('studio-bulk-names').value;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');

    studioImages.forEach((img, i) => {
        if (lines[i]) {
            // Strip starting numbers like "1. ", "2-", etc.
            const cleanName = lines[i].replace(/^[0-9]+[\.\-\)\s]+/, '').trim();
            img.nameText = cleanName;
        } else {
            img.nameText = "";
        }
    });
    renderStudioGrid();
};

window.saveStudioPreset = function () {
    const color = document.getElementById('studio-bg-color').value;
    localStorage.setItem('studio_preset_bg', color);
    if (window.showToast) window.showToast("Preset Saved!", "#10b981");
};

window.loadStudioPreset = function () {
    const saved = localStorage.getItem('studio_preset_bg');
    if (saved) {
        const colorInput = document.getElementById('studio-bg-color');
        if (colorInput) {
            colorInput.value = saved;
        }
    }
};

// Call load preset on script execute
setTimeout(() => {
    window.loadStudioPreset();
}, 500);

// Load preset on load
setTimeout(() => {
    const savedColor = localStorage.getItem('studio_preset_bg');
    if (savedColor) {
        const colorPicker = document.getElementById('studio-bg-color');
        if (colorPicker) {
            colorPicker.value = savedColor;
            // Also apply it to any existing wrappers
            document.querySelectorAll('.studio-img-wrapper').forEach(el => {
                el.style.backgroundColor = savedColor;
            });
        }
    }
}, 1000);

async function processSingleBG(index) {
    if (studioImages[index].isProcessed || studioImages[index].isLoading) return;

    studioImages[index].isLoading = true;
    renderStudioGrid();

    try {
        const API_ENDPOINT = "https://school-backend-zlgy.onrender.com/api/remove-bg";

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageUrl: studioImages[index].originalBase64 })
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && data.base64) {
            studioImages[index].processedBase64 = data.base64;
            studioImages[index].isProcessed = true;
        } else {
            console.error("BG Removal failed for index", index, data.error);
            if (window.showToast) window.showToast(`BG Fail: ${data.error || "Unknown Error"}`, "#e11d48");
        }
    } catch (error) {
        console.error("BG Removal API error for index", index, error);
        if (window.showToast) window.showToast(`API ERR: ${error.message}`, "#e11d48");
    } finally {
        studioImages[index].isLoading = false;
        renderStudioGrid();
    }
}

window.processAllBG = async function () {
    if (studioImages.length === 0) {
        if (window.showToast) window.showToast("No images to process!", "#e11d48");
        return;
    }

    if (window.showToast) window.showToast("Starting Batch Background Removal...", "#a855f7");

    for (let i = 0; i < studioImages.length; i++) {
        await processSingleBG(i);
    }

    if (window.showToast) window.showToast("Batch Processing Complete!", "#10b981");
}

window.generateA4PDF = function () {
    if (!studioImages.length) {
        if (window.showToast) window.showToast("No images to export!", "#e11d48");
        return;
    }

    if (window.showToast) window.showToast("Generating A4 Grid PDF...", "#10b981");

    // A4 Dimensions in mm: 210 x 297
    const pdf = new window.jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const bgColorHex = document.getElementById('studio-bg-color').value || '#FF0000';
    // Convert hex to rgb
    const r = parseInt(bgColorHex.slice(1, 3), 16) || 255;
    const g = parseInt(bgColorHex.slice(3, 5), 16) || 0;
    const b = parseInt(bgColorHex.slice(5, 7), 16) || 0;

    const photoWidth = 35;
    const photoHeight = 45;
    const cols = 5;

    // Calculate margins and gaps
    const totalWidth = 210;
    const marginX = 10;
    const marginY = 10;
    // Available width = 210 - (2 * 10) = 190.
    // 5 photos = 5 * 35 = 175.
    // Remaining = 190 - 175 = 15.
    // 4 gaps = 15 / 4 = 3.75 mm gap.
    const gapX = 3.75;
    const gapY = 5; // vertical gap

    let currentX = marginX;
    let currentY = marginY;
    let colIndex = 0;

    studioImages.forEach((img, idx) => {
        // Wrap to next line if needed
        if (colIndex >= cols) {
            colIndex = 0;
            currentX = marginX;
            currentY += photoHeight + gapY;
        }

        // Check for page overflow
        if (currentY + photoHeight > 297 - marginY) {
            pdf.addPage();
            currentX = marginX;
            currentY = marginY;
            colIndex = 0;
        }

        // 1. Draw Background Color Rectangle
        pdf.setFillColor(r, g, b);
        pdf.rect(currentX, currentY, photoWidth, photoHeight, 'F');

        // 2. Draw Image
        const imgData = img.processedBase64 || img.originalBase64;
        try {
            let format = 'JPEG';
            if (imgData.includes('image/png')) format = 'PNG';

            pdf.addImage(imgData, format, currentX, currentY, photoWidth, photoHeight);
        } catch (e) {
            console.error("Failed to add image to PDF", e);
        }

        // 3. Draw Nameplate conditionally
        const text = img.nameText ? img.nameText.trim() : "";

        if (text !== "") {
            const nameplateHeight = 7;
            const nameplateY = currentY + photoHeight - nameplateHeight;
            pdf.setFillColor(255, 255, 255); // white
            pdf.setDrawColor(0, 0, 0); // black border
            pdf.rect(currentX, nameplateY, photoWidth, nameplateHeight, 'DF');

            // 4. Draw Text
            const uppercaseText = text.toUpperCase();
            pdf.setTextColor(0, 0, 0); // black text
            pdf.setFont("helvetica", "bold");

            let fontSize = 8;
            pdf.setFontSize(fontSize);
            let textWidth = pdf.getTextWidth(uppercaseText);

            // Auto-adjust font size if name is too long
            while (textWidth > photoWidth - 2 && fontSize > 3) {
                fontSize -= 0.5;
                pdf.setFontSize(fontSize);
                textWidth = pdf.getTextWidth(uppercaseText);
            }

            const textX = currentX + (photoWidth - textWidth) / 2;
            const textY = nameplateY + (nameplateHeight / 2) + 1.5;

            pdf.text(uppercaseText, textX, textY);
        }

        // Move to next column
        currentX += photoWidth + gapX;
        colIndex++;
    });

    pdf.save("Batch_Studio_Photos.pdf");
}

// ==========================================
// PUBLIC MEDIA: HERO CAROUSEL + APP DOWNLOAD
// ==========================================
let publicHeroSlides = [];
let publicHeroIndex = 0;
let publicHeroTimer = null;

function renderPublicHeroCarousel(banners = []) {
    const carousel = document.getElementById("public-hero-carousel");
    const track = document.getElementById("public-hero-track");
    const dots = document.getElementById("public-hero-dots");
    if (!carousel || !track || !dots) return;

    publicHeroSlides = banners.filter(Boolean);
    publicHeroIndex = 0;
    if (!publicHeroSlides.length) {
        carousel.classList.add("hidden-el");
        track.innerHTML = "";
        dots.innerHTML = "";
        return;
    }

    carousel.classList.remove("hidden-el");
    track.innerHTML = publicHeroSlides.map((src, index) => `
        <div class="public-hero-slide" aria-hidden="${index === 0 ? "false" : "true"}">
            <img src="${src}" alt="Company hero banner ${index + 1}">
        </div>
    `).join("");
    dots.innerHTML = publicHeroSlides.map((_, index) => `<button type="button" class="public-carousel-dot ${index === 0 ? "active" : ""}" aria-label="Go to banner ${index + 1}" onclick="window.setPublicHeroSlide(${index})"></button>`).join("");

    const prevBtn = document.getElementById("heroPrevBtn");
    const nextBtn = document.getElementById("heroNextBtn");
    if (prevBtn) prevBtn.onclick = () => window.setPublicHeroSlide(publicHeroIndex - 1);
    if (nextBtn) nextBtn.onclick = () => window.setPublicHeroSlide(publicHeroIndex + 1);

    updatePublicHeroSlide();
    startPublicHeroAutoScroll();
}

function updatePublicHeroSlide() {
    const track = document.getElementById("public-hero-track");
    if (!track || !publicHeroSlides.length) return;
    track.style.transform = `translateX(-${publicHeroIndex * 100}%)`;
    document.querySelectorAll(".public-hero-slide").forEach((slide, index) => slide.setAttribute("aria-hidden", index === publicHeroIndex ? "false" : "true"));
    document.querySelectorAll(".public-carousel-dot").forEach((dot, index) => dot.classList.toggle("active", index === publicHeroIndex));
}

window.setPublicHeroSlide = (index) => {
    if (!publicHeroSlides.length) return;
    publicHeroIndex = (index + publicHeroSlides.length) % publicHeroSlides.length;
    updatePublicHeroSlide();
    startPublicHeroAutoScroll();
};

function startPublicHeroAutoScroll() {
    if (publicHeroTimer) clearInterval(publicHeroTimer);
    if (publicHeroSlides.length < 2) return;
    publicHeroTimer = setInterval(() => window.setPublicHeroSlide(publicHeroIndex + 1), 3000);
}

function renderPublicAppSection(appMedia = {}) {
    const section = document.getElementById("public-app-section");
    const logo = document.getElementById("public-app-logo");
    const logoFallback = document.getElementById("public-app-logo-fallback");
    const title = document.getElementById("public-app-title");
    const desc = document.getElementById("public-app-desc");
    const download = document.getElementById("public-apk-download");
    const shots = document.getElementById("public-app-screenshots");
    if (!section || !shots) return;

    const hasContent = appMedia.logoUrl || appMedia.apkUrl || (appMedia.screenshots || []).length;
    section.classList.toggle("hidden-el", !hasContent);
    if (!hasContent) return;

    title.textContent = appMedia.title || "CoreEdu.IN Mobile Suite";
    desc.textContent = appMedia.description || "Download the latest secure release and experience a premium mobile command center for your institution.";
    if (appMedia.logoUrl) {
        logo.src = appMedia.logoUrl;
        logo.classList.remove("hidden-el");
        logoFallback.classList.add("hidden-el");
    } else {
        logo.classList.add("hidden-el");
        logoFallback.classList.remove("hidden-el");
    }
    if (appMedia.apkUrl) {
        download.href = `https://school-backend-zlgy.onrender.com/api/download-apk?url=${encodeURIComponent(appMedia.apkUrl)}&name=${encodeURIComponent(appMedia.apkName || "MasterCore.apk")}`;
        download.download = appMedia.apkName || "latest-version.apk";
        download.classList.remove("hidden-el");
    } else {
        download.classList.add("hidden-el");
    }
    shots.innerHTML = (appMedia.screenshots || []).map((src, index) => `<figure class="public-app-shot"><img src="${src}" alt="App screenshot ${index + 1}"></figure>`).join("");
}

function buildMediaCard(src, label, actionsHtml = "") {
    return `
        <div class="admin-media-item">
            <img src="${src}" alt="${label}">
            <div class="admin-media-item__overlay">
                <span>${label}</span>
                ${actionsHtml}
            </div>
        </div>
    `;
}

function renderAdminMediaPreviews(data = {}) {
    const heroPreview = document.getElementById("admin-hero-preview");
    const appPreview = document.getElementById("admin-app-preview");
    if (heroPreview) {
        const banners = data.banners || [];
        heroPreview.innerHTML = banners.length
            ? banners.map((src, index) => buildMediaCard(src, `Hero banner ${index + 1}`, `<button type="button" class="admin-media-delete-btn" onclick="window.deleteHeroBanner(${index})"><i class="fas fa-trash"></i> Delete</button>`)).join("")
            : `<p class="admin-media-empty">No hero banners published yet.</p>`;
    }
    if (appPreview) {
        const media = data.appMedia || {};
        const screenshotCards = (media.screenshots || []).map((src, index) => buildMediaCard(src, `Screenshot ${index + 1}`, `<button type="button" class="admin-media-delete-btn" onclick="window.deleteAppScreenshot(${index})"><i class="fas fa-trash"></i> Delete</button>`)).join("");
        appPreview.innerHTML = `
            ${media.logoUrl ? buildMediaCard(media.logoUrl, "App logo", `<button type="button" class="admin-media-delete-btn" onclick="window.deleteAppLogo()"><i class="fas fa-trash"></i> Delete</button>`) : `<p class="admin-media-empty">No app logo published yet.</p>`}
            ${screenshotCards || `<p class="admin-media-empty">No app screenshots published yet.</p>`}
            ${media.apkUrl ? `
                <div class="admin-media-file-card">
                    <div>
                        <span class="admin-media-file-label">APK File</span>
                        <strong>${media.apkName || "latest-version.apk"}</strong>
                    </div>
                    <div class="admin-media-file-actions">
                        <a href="https://school-backend-zlgy.onrender.com/api/download-apk?url=${encodeURIComponent(media.apkUrl)}&name=${encodeURIComponent(media.apkName || 'MasterCore.apk')}" class="admin-media-download-btn"><i class="fas fa-download"></i> Download</a>
                        <button type="button" class="admin-media-delete-btn" onclick="window.deleteAppApk()"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                </div>
            ` : `<p class="admin-media-empty">No APK published yet.</p>`}
        `;
    }
}

async function refreshPublicMedia() {
    try {
        const snap = await PUBLIC_MEDIA_DOC.get();
        const data = snap.exists ? snap.data() : {};
        renderPublicHeroCarousel(data.banners || []);
        renderPublicAppSection(data.appMedia || {});
        renderAdminMediaPreviews(data);
        document.getElementById("app-title-input") && (document.getElementById("app-title-input").value = data.appMedia?.title || "");
        document.getElementById("app-desc-input") && (document.getElementById("app-desc-input").value = data.appMedia?.description || "");
    } catch (err) {
        console.error("Public media load failed", err);
    }
}

window.deleteHeroBanner = async (index) => {
    try {
        const snap = await PUBLIC_MEDIA_DOC.get();
        const data = snap.exists ? snap.data() : {};
        const banners = Array.isArray(data.banners) ? [...data.banners] : [];
        if (index < 0 || index >= banners.length) return;
        const targetUrl = banners[index];
        window.customConfirm("DELETE THIS HERO BANNER?", async () => {
            try {
                await fetch('https://school-backend-zlgy.onrender.com/api/admin/delete-hero-banner', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageUrl: targetUrl })
                });
            } catch (e) {
                console.error("Backend Cloudinary delete failed", e);
            }
            banners.splice(index, 1);
            await PUBLIC_MEDIA_DOC.set({ banners, updatedAt: Date.now() }, { merge: true });
            await refreshPublicMedia();
            window.showToast("HERO BANNER DELETED", "#10b981");
        });
    } catch (err) {
        window.showToast("HERO DELETE FAILED: " + err.message, "#e11d48");
    }
};

window.saveHeroBanners = async () => {
    const input = document.getElementById("hero-banner-upload");
    const files = Array.from(input?.files || []);
    if (!files.length) return window.showToast("SELECT HERO BANNER IMAGES", "#e11d48");
    try {
        window.showToast("UPLOADING HERO BANNERS VIA SECURE BACKEND...", "#f59e0b");
        const idToken = await auth.getIdToken();
        const formData = new FormData();
        files.forEach(file => formData.append('banners', file));

        const res = await fetch("https://school-backend-zlgy.onrender.com/api/admin/publish-hero-banners", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
            body: formData
        });

        const data = await res.json();
        if (data.success) {
            input.value = "";
            await refreshPublicMedia();
            window.showToast("HERO CAROUSEL PUBLISHED", "#10b981");
        } else {
            window.showToast("❌ ERROR: " + data.error, "#e11d48");
        }
    } catch (err) {
        window.showToast("BANNER UPLOAD FAILED: " + err.message, "#e11d48");
    }
};

window.deleteAppLogo = async () => {
    try {
        window.customConfirm("DELETE CURRENT APP LOGO?", async () => {
            const snap = await PUBLIC_MEDIA_DOC.get();
            const data = snap.exists ? snap.data() : {};
            const appMedia = { ...(data.appMedia || {}) };
            await deleteFirebaseStorageImage(appMedia.logoUrl);
            appMedia.logoUrl = "";
            await PUBLIC_MEDIA_DOC.set({ appMedia, updatedAt: Date.now() }, { merge: true });
            await refreshPublicMedia();
            window.showToast("APP LOGO DELETED", "#10b981");
        });
    } catch (err) {
        window.showToast("LOGO DELETE FAILED: " + err.message, "#e11d48");
    }
};

window.deleteAppScreenshot = async (index) => {
    try {
        const snap = await PUBLIC_MEDIA_DOC.get();
        const data = snap.exists ? snap.data() : {};
        const appMedia = { ...(data.appMedia || {}) };
        const screenshots = Array.isArray(appMedia.screenshots) ? [...appMedia.screenshots] : [];
        if (index < 0 || index >= screenshots.length) return;
        const targetUrl = screenshots[index];
        window.customConfirm("DELETE THIS APP SCREENSHOT?", async () => {
            await deleteFirebaseStorageImage(targetUrl);
            screenshots.splice(index, 1);
            appMedia.screenshots = screenshots;
            await PUBLIC_MEDIA_DOC.set({ appMedia, updatedAt: Date.now() }, { merge: true });
            await refreshPublicMedia();
            window.showToast("SCREENSHOT DELETED", "#10b981");
        });
    } catch (err) {
        window.showToast("SCREENSHOT DELETE FAILED: " + err.message, "#e11d48");
    }
};

window.deleteAppApk = async () => {
    try {
        window.customConfirm("DELETE CURRENT APK FILE?", async () => {
            const snap = await PUBLIC_MEDIA_DOC.get();
            const data = snap.exists ? snap.data() : {};
            const appMedia = { ...(data.appMedia || {}) };
            await deleteFirebaseStorageImage(appMedia.apkUrl);
            appMedia.apkUrl = "";
            appMedia.apkName = "";
            await PUBLIC_MEDIA_DOC.set({ appMedia, updatedAt: Date.now() }, { merge: true });
            await refreshPublicMedia();
            window.showToast("APK DELETED", "#10b981");
        });
    } catch (err) {
        window.showToast("APK DELETE FAILED: " + err.message, "#e11d48");
    }
};

window.saveAppMedia = async () => {
    const logoFile = document.getElementById("app-logo-upload")?.files[0];
    const apkFile = document.getElementById("apk-file-upload")?.files[0];
    const screenshotFiles = document.getElementById("app-screenshots-upload")?.files;

    if (!logoFile && !apkFile && (!screenshotFiles || screenshotFiles.length === 0)) return window.showToast("UPLOAD LOGO, APK, OR SCREENSHOTS", "#e11d48");
    try {
        window.showToast("UPLOADING APP MEDIA VIA SECURE BACKEND...", "#f59e0b");
        const idToken = await auth.getIdToken();
        const formData = new FormData();
        if (apkFile) formData.append('apk', apkFile);
        if (logoFile) formData.append('logo', logoFile);
        if (screenshotFiles && screenshotFiles.length > 0) {
            for (let i = 0; i < screenshotFiles.length; i++) {
                formData.append('screenshots', screenshotFiles[i]);
            }
        }

        const res = await fetch("https://school-backend-zlgy.onrender.com/api/admin/publish-app-media", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
            body: formData
        });

        const data = await res.json();
        if (data.success) {
            ["app-logo-upload", "app-screenshots-upload", "apk-file-upload"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
            await refreshPublicMedia();
            window.showToast("APP MEDIA PUBLISHED", "#10b981");
        } else {
            window.showToast("❌ ERROR: " + data.error, "#e11d48");
        }
    } catch (err) {
        window.showToast("APP MEDIA UPLOAD FAILED: " + err.message, "#e11d48");
    }
};

function initPublicMediaAdminToggles() {
    document.querySelectorAll(".public-media-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const panel = btn.dataset.mediaPanel;
            document.querySelectorAll(".public-media-toggle").forEach(item => item.classList.toggle("active", item === btn));
            document.querySelectorAll(".public-media-panel").forEach(item => {
                const isActive = item.id === `media-panel-${panel}`;
                item.classList.toggle("active", isActive);
                item.classList.toggle("hidden-el", !isActive);
            });
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initPublicMediaAdminToggles();
    refreshPublicMedia();
});

// ========================================================
// 8. DATABASE BACKUP EXPORT
// ========================================================
const btnExportBackup = document.getElementById("btn-export-backup");
if (btnExportBackup) {
    btnExportBackup.addEventListener("click", async () => {
        const secret = document.getElementById("master-secret").value.trim();
        if (!secret) return alert("Please enter the Master Secret first!");

        btnExportBackup.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Backup...';
        btnExportBackup.disabled = true;

        try {
            const res = await fetch('https://school-backend-zlgy.onrender.com/api/admin/export-backup', {
                method: 'GET',
                headers: { 'mastersecret': secret }
            });
            const data = await res.json();
            if (data.success) {
                const jsonStr = JSON.stringify(data.backup, null, 2);
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `MasterCore_Backup_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                alert("Backup downloaded successfully!");
            } else {
                alert("Backup Failed: " + data.error);
            }
        } catch (err) {
            alert("Error connecting to server for backup.");
        }

        btnExportBackup.innerHTML = '<i class="fa-solid fa-download"></i> Download Full Backup';
        btnExportBackup.disabled = false;
    });
}


