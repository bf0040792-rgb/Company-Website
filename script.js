// FIREBASE INITIALIZATION
const firebaseConfig = {
    apiKey: "AIzaSyBUAoXX64MTKrhMiRKd9oJPnaT0j60SPdY",
    authDomain: "admin-panel-17e6a.firebaseapp.com",
    databaseURL: "https://admin-panel-17e6a-default-rtdb.firebaseio.com",
    projectId: "admin-panel-17e6a",
    storageBucket: "admin-panel-17e6a.firebasestorage.app",
    messagingSenderId: "519315316570",
    appId: "1:519315316570:web:1448a0936e9a102d849d63"
};
firebase.initializeApp(firebaseConfig);

const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = secondaryApp.auth();
const appCheck = firebase.appCheck();
appCheck.activate('6LeAT9csAAAAANn9sBk-BPOFASXX9liQLCwwO5_4', true);

const db = firebase.firestore();
const auth = firebase.auth();

let currentUserRole = "unknown";
let currentPrivileges = {};

window.globalSchoolsData = []; // Cached for Omni-Search and Universal Selectors
window.globalUsersData = [];

// INITIALIZE ICONS
lucide.createIcons();

// UI HELPERS (Unchanged)
function toggleDrawer() { 
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('side-drawer-overlay');
    if (drawer.classList.contains('translate-x-full')) {
        overlay.classList.remove('hidden-el');
        void overlay.offsetWidth;
        overlay.classList.remove('opacity-0'); overlay.classList.add('opacity-100');
        drawer.classList.remove('translate-x-full');
    } else {
        overlay.classList.remove('opacity-100'); overlay.classList.add('opacity-0');
        drawer.classList.add('translate-x-full');
        setTimeout(() => { overlay.classList.add('hidden-el'); }, 300);
    }
}
function openLoginFromDrawer() { toggleDrawer(); setTimeout(() => { showLoginModal(); }, 300); }
function showLoginModal() { 
    const m = document.getElementById('login-modal'); m.classList.remove('hidden-el');
    setTimeout(()=> m.classList.replace('opacity-0', 'opacity-100'), 10);
    document.getElementById('login-modal-box').classList.replace('scale-95', 'scale-100');
}
function hideLoginModal() { 
    const m = document.getElementById('login-modal');
    m.classList.replace('opacity-100', 'opacity-0');
    document.getElementById('login-modal-box').classList.replace('scale-100', 'scale-95');
    setTimeout(() => m.classList.add('hidden-el'), 300);
}
function openNewSchoolModal() { document.getElementById('new-school-modal').classList.remove('hidden-el'); }
function closeNewSchoolModal() { document.getElementById('new-school-modal').classList.add('hidden-el'); }
function showToast(msg) { alert(msg); } // Placeholder for custom toast

// TAB LOGIC + UNIVERSAL SELECTOR REFRESH
function switchTab(tabId) {
    const targetEl = document.getElementById(tabId);
    if(targetEl && targetEl.classList.contains('auth-guarded')) {
        const reqPriv = targetEl.dataset.privilege;
        if(currentUserRole !== 'root' && !currentPrivileges[reqPriv]) {
            showToast("Access Denied: You lack privileges for this module.", true); return;
        }
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden-el'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-slateSurface', 'text-white', 'border-indigo-500/30', 'text-indigo-300');
        btn.classList.add('text-coolLight');
        if(btn.dataset.target === tabId) {
            btn.classList.add('bg-slateSurface', 'text-white');
            if(tabId==='override') btn.classList.add('border', 'border-indigo-500/30', 'text-indigo-300');
        }
    });
    targetEl.classList.remove('hidden-el');
    
    if(tabId === 'analytics') loadFinancials();
    if(tabId === 'tenants') loadSchools();
    if(tabId === 'override') populateUniversalSelectors();
    if(tabId === 'billing') { populateUniversalSelectors(); loadBilling(); }
    if(tabId === 'admins') loadAdmins();
    if(tabId === 'surveillance') loadSurveillance();
    if(tabId === 'veto') loadRecycleBin();
    if(tabId === 'broadcast') populateUniversalSelectors();
    if(tabId === 'audit') loadAuditLog();
    if(tabId === 'keymaker') populateUniversalSelectors();
    
    lucide.createIcons();
}

// OMNI-SEARCH RADAR SYSTEM
async function populateGlobalCache() {
    const sSnap = await db.collection("schools").where("deleted", "!=", true).get();
    window.globalSchoolsData = sSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
    const uSnap = await db.collection("users").where("deleted", "!=", true).get();
    window.globalUsersData = uSnap.docs.map(d => ({id: d.id, ...d.data()}));
}

function performOmniSearch(query) {
    const resultsBox = document.getElementById('omniSearchResults');
    if(!query || query.length < 2) { resultsBox.classList.add('hidden-el'); return; }
    
    query = query.toLowerCase();
    let resultsHTML = '';
    
    // Search Schools
    const matchingSchools = window.globalSchoolsData.filter(s => s.schoolName?.toLowerCase().includes(query) || s.id.toLowerCase().includes(query));
    matchingSchools.forEach(s => {
        resultsHTML += `<div class="p-3 border-b border-glassBorder hover:bg-slateSurface cursor-pointer transition" onclick="switchTab('override'); document.getElementById('uniSelectorOverride').value='${s.id}'; loadOverrideData('${s.id}')">
            <p class="text-sm font-bold text-white"><i data-lucide="building" class="w-3 h-3 inline text-indigo-400 mr-1"></i> ${s.schoolName}</p>
            <p class="text-[10px] text-coolGray">Tenant ID: ${s.id}</p>
        </div>`;
    });

    // Search Users / Admins / IPs
    const matchingUsers = window.globalUsersData.filter(u => u.email?.toLowerCase().includes(query) || u.name?.toLowerCase().includes(query) || u.role?.toLowerCase().includes(query));
    matchingUsers.forEach(u => {
        resultsHTML += `<div class="p-3 border-b border-glassBorder hover:bg-slateSurface cursor-pointer transition">
            <p class="text-sm font-bold text-white"><i data-lucide="user" class="w-3 h-3 inline text-tealAccent mr-1"></i> ${u.name || 'Unknown'}</p>
            <p class="text-[10px] text-coolGray">${u.role.toUpperCase()} | ${u.email}</p>
        </div>`;
    });

    if(resultsHTML === '') resultsHTML = `<div class="p-4 text-center text-sm text-coolGray">No omni-search results found.</div>`;
    
    resultsBox.innerHTML = resultsHTML;
    resultsBox.classList.remove('hidden-el');
    lucide.createIcons();
}
// Close dropdown when clicking outside
document.addEventListener('click', (e) => { if(e.target.id !== 'omniSearchInput') document.getElementById('omniSearchResults').classList.add('hidden-el'); });


// UNIVERSAL TARGET SELECTOR POPULATOR
function populateUniversalSelectors() {
    let options = `<option value="ALL">All Tenants</option>`;
    window.globalSchoolsData.forEach(s => { options += `<option value="${s.id}">${s.schoolName} (${s.id})</option>`; });
    
    const selectors = ['uniSelectorBilling', 'uniSelectorKeymaker', 'uniSelectorBroadcast'];
    selectors.forEach(id => {
        const el = document.getElementById(id);
        if(el) { const prev = el.value; el.innerHTML = options; if(prev) el.value = prev; }
    });

    // Override needs an empty default
    let overOptions = `<option value="">-- Select Target School --</option>`;
    window.globalSchoolsData.forEach(s => { overOptions += `<option value="${s.id}">${s.schoolName}</option>`; });
    const overSel = document.getElementById('uniSelectorOverride');
    if(overSel) { const p = overSel.value; overSel.innerHTML = overOptions; if(p) overSel.value = p; }
}


// SHADOW LOGIN (IMPERSONATION)
function impersonateUser(uid, email) {
    if(confirm(`SHADOW LOGIN WARNING: You are about to enter the live environment as ${email}. All actions will be attributed to them. Proceed?`)) {
        logMasterAction(`Shadow Login Executed`, uid);
        // Assuming your Chairman portal reads a specific localStorage key if set by God mode:
        localStorage.setItem("godModeImpersonationUID", uid);
        window.open('/admin.html', '_blank'); // Opens their panel
        showToast("Impersonation token generated. Opening portal...");
    }
}


// AUTH & RBAC
async function loginRoot() {
    const e = document.getElementById("adminEmail").value.trim();
    const p = document.getElementById("adminPass").value.trim();
    const btn = document.getElementById("loginBtn");
    const err = document.getElementById("err");
    if(!e || !p) return;

    btn.innerHTML = `Verifying...`;
    try {
        const userCredential = await auth.signInWithEmailAndPassword(e, p);
        const user = userCredential.user;
        const ud = await db.collection("users").doc(user.uid).get();
        if(ud.exists && (ud.data().role === "developer" || ud.data().role === "super_admin")) {
            currentUserRole = ud.data().role === "developer" ? "root" : "l2";
            currentPrivileges = ud.data().privileges || {};
            
            document.getElementById("activeAdminEmail").innerText = user.email;
            document.getElementById("activeAdminRole").innerText = currentUserRole === "root" ? "Level 0 Auth" : "Level 1/2 Auth";
            
            await populateGlobalCache(); // Init caches
            await logMasterAction("Authentication Initialized", user.email);
            document.getElementById("landing-page").classList.add("hidden-el");
            document.getElementById("login-modal").classList.add("hidden-el");
            document.getElementById("dashboard").classList.remove("hidden-el");
            
            enforceSidebarUI();
            switchTab('analytics');
        } else {
            await auth.signOut();
            throw new Error("Account lacks infrastructure authorization.");
        }
    } catch(error) { err.classList.remove('hidden-el'); document.getElementById("errText").innerText = error.message; }
    btn.innerHTML = `<i data-lucide="fingerprint" class="w-5 h-5"></i> Authenticate`; lucide.createIcons();
}

function enforceSidebarUI() { /* Unchanged from previous */ }
function logoutAdmin() { auth.signOut().then(() => location.reload()); }
async function logMasterAction(action, target = "System", actor = auth.currentUser?.email) {
    try { await db.collection("audit_logs").add({ action, admin: actor, target: target, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); } catch(e) {}
}

const convertToBase64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result); r.onerror = (e) => rej(e); });
const uploadToCloudinary = async (fileObj) => { /* Same as previous Cloudinary mock logic */ return "https://via.placeholder.com/80"; };

// 1. ANALYTICS
async function loadFinancials() {
    let mrr = 0, activeCount = 0;
    window.globalSchoolsData.forEach(s => {
        if(s.status !== 'suspended') activeCount++;
        if(s.appFee) mrr += Number(s.appFee);
    });
    document.getElementById('stat-revenue').innerText = `₹ ${mrr.toLocaleString()}`;
    document.getElementById('stat-tenants').innerText = activeCount;
    document.getElementById('stat-students').innerText = "Loading..."; // Normally would fetch students count
}

// 2. TENANT MANAGEMENT & TRUE SOFT DELETE
async function loadSchools() {
    await populateGlobalCache(); // refresh cache
    const tbody = document.getElementById("schools-table-body");
    tbody.innerHTML = '';
    
    window.globalSchoolsData.forEach(data => {
        const cData = window.globalUsersData.find(u => u.schoolId === data.id && u.role === 'chairman') || {};
        const isSuspended = data.status === 'suspended';
        const statusHtml = isSuspended ? `<span class="text-rose-500 text-xs font-bold">SUSPENDED</span>` : `<span class="text-tealAccent text-xs font-bold">ACTIVE</span>`;

        tbody.innerHTML += `
            <tr class="hover:bg-slateBase/50 transition">
                <td class="px-6 py-4 flex items-center gap-3">
                    <img src="${data.logoUrl || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded-full border border-glassBorder object-cover">
                    <div><p class="font-bold text-white">${data.schoolName}</p><p class="text-[10px] text-coolGray font-mono">${data.id}</p></div>
                </td>
                <td class="px-6 py-4">
                    <p class="text-sm text-gray-300">${cData.name || 'N/A'}</p>
                    <p class="text-xs text-coolGray">${cData.email || 'N/A'}</p>
                </td>
                <td class="px-6 py-4">${statusHtml}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="impersonateUser('${cData.id}', '${cData.email}')" class="text-indigo-400 p-2 hover:bg-slateSurface rounded" title="Shadow Login"><i data-lucide="log-in" class="w-4 h-4"></i></button>
                    ${isSuspended ? `<button onclick="toggleKillSwitch('${data.id}', false)" class="text-teal-500 p-2"><i data-lucide="unlock" class="w-4 h-4"></i></button>` : `<button onclick="toggleKillSwitch('${data.id}', true)" class="text-amber-500 p-2"><i data-lucide="skull" class="w-4 h-4"></i></button>`}
                    <button onclick="softDeleteTenant('${data.id}', '${cData.id || ''}')" class="text-red-600 hover:text-red-400 p-2" title="Move to Bin"><i data-lucide="trash" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `;
    });
    lucide.createIcons();
}

async function createSchool() { /* Unchanged deployment logic */ }
async function toggleKillSwitch(schoolId, suspend) {
    if(suspend && !confirm("WARNING: Disabling tenant database access is immediate. Proceed?")) return;
    try {
        await db.collection('schools').doc(schoolId).update({ status: suspend ? 'suspended' : 'active' });
        await logMasterAction(`Kill-Switch ${suspend ? 'ENGAGED' : 'DISENGAGED'}`, schoolId);
        loadSchools();
    } catch(e) {}
}

async function softDeleteTenant(schoolId, chairmanId) {
    if(!confirm("SOFT DELETE: This will move the tenant to the 30-Day Master Recycle Bin. They will lose access immediately. Proceed?")) return;
    try {
        const ts = firebase.firestore.FieldValue.serverTimestamp();
        // Move to Recycle State
        if(chairmanId) await db.collection("users").doc(chairmanId).update({ deleted: true, deletedAt: ts });
        await db.collection("schools").doc(schoolId).update({ deleted: true, deletedAt: ts, status: 'suspended' });
        
        await logMasterAction(`Soft-Deleted Tenant`, schoolId);
        loadSchools();
    } catch(e){}
}

// TENANT OVERRIDE ENGINE
function loadOverrideData(schoolId) {
    const form = document.getElementById('overrideForm');
    if(!schoolId) { form.classList.add('hidden-el'); return; }
    
    const sData = window.globalSchoolsData.find(s => s.id === schoolId);
    const cData = window.globalUsersData.find(u => u.schoolId === schoolId && u.role === 'chairman') || {};
    
    document.getElementById('overrideSchoolId').value = schoolId;
    document.getElementById('overrideChairId').value = cData.id || '';
    document.getElementById('overName').value = sData.schoolName || '';
    document.getElementById('overEmail').value = cData.email || '';
    document.getElementById('overPass').value = ''; // Don't show plain pass usually, allow override
    
    form.classList.remove('hidden-el');
}

async function executeOverride() {
    const sid = document.getElementById('overrideSchoolId').value;
    const cid = document.getElementById('overrideChairId').value;
    const nName = document.getElementById('overName').value;
    const nEmail = document.getElementById('overEmail').value;
    const nPass = document.getElementById('overPass').value;
    
    try {
        let updates = { schoolName: nName };
        const logo = document.getElementById("overLogo").files[0];
        if(logo) { updates.logoUrl = await uploadToCloudinary(logo); }
        await db.collection('schools').doc(sid).update(updates);
        
        if(cid && nEmail) {
            let cUpdates = { email: nEmail };
            if(nPass) cUpdates.plainPassword = nPass; // Mocking pass change. Real auth needs server function.
            await db.collection('users').doc(cid).update(cUpdates);
        }
        
        showToast("Override Successful.");
        await logMasterAction("Force Overwrite Engine Used", sid);
        populateGlobalCache();
    } catch(e) { showToast("Error: " + e.message); }
}

// 3. BILLING (With filtering)
function filterBillingTable(sid) {
    const tbody = document.getElementById("billing-table-body");
    tbody.innerHTML = '';
    const filtered = sid === "ALL" ? window.globalSchoolsData : window.globalSchoolsData.filter(s => s.id === sid);
    
    filtered.forEach(data => {
        tbody.innerHTML += `
            <tr class="hover:bg-slateBase/50 transition">
                <td class="px-6 py-3 font-bold text-white">${data.schoolName}</td>
                <td class="px-6 py-3"><input type="number" id="fee_${data.id}" value="${data.appFee||''}" class="input-premium px-2 py-1 rounded text-sm w-24 text-white"></td>
                <td class="px-6 py-3"><input type="date" id="date_${data.id}" value="${data.billingDate||''}" class="input-premium px-2 py-1 rounded text-sm text-white"></td>
                <td class="px-6 py-3 text-right"><button onclick="savePayment('${data.id}')" class="px-3 py-1 bg-tealAccent hover:bg-tealHover text-white rounded text-xs font-bold">Save</button></td>
            </tr>
        `;
    });
}
async function loadBilling() { filterBillingTable("ALL"); }
async function savePayment(sid) {
    const fee = document.getElementById(`fee_${sid}`).value;
    const bDate = document.getElementById(`date_${sid}`).value;
    await db.collection("schools").doc(sid).update({ appFee: fee, billingDate: bDate });
    showToast("Billing settings saved."); logMasterAction("Updated Billing", sid);
}

// 4. L2 SUPER ADMINS
async function loadAdmins() { /* Same as previous version */ }
async function createSuperAdmin() { /* Same as previous version */ }

// 5. SURVEILLANCE
async function loadSurveillance() {
    const tbody = document.getElementById("surveillance-table-body");
    try {
        const snap = await db.collection("login_logs").orderBy("timestamp", "desc").limit(50).get();
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data(); const ts = d.timestamp ? d.timestamp.toDate().toLocaleString() : "Unknown";
            tbody.innerHTML += `
                <tr class="hover:bg-slateBase/50 transition">
                    <td class="px-6 py-3"><p class="text-white">${d.name||'Unknown'}</p><p class="text-xs opacity-50">${d.email||''}</p></td>
                    <td class="px-6 py-3"><span class="bg-slateSurface px-2 py-1 rounded text-[10px] uppercase">${d.role||'user'}</span></td>
                    <td class="px-6 py-3"><p class="text-teal-400">${d.ip||'Unknown IP'}</p><p class="text-[10px]">${ts}</p></td>
                    <td class="px-6 py-3 text-xs text-gray-400 break-words max-w-[150px]">${d.device||'Unknown Device'}</td>
                    <td class="px-6 py-3"><button onclick="killSession('${d.uid || d.userId}')" class="bg-rose-500/20 text-rose-500 p-1.5 rounded hover:bg-rose-500 hover:text-white transition"><i data-lucide="power" class="w-4 h-4"></i></button></td>
                </tr>
            `;
        });
        lucide.createIcons();
    } catch(e) {}
}
async function killSession(uid) {
    if(!uid) return;
    if(confirm("Force remote logout for this user globally?")) {
        await db.collection("users").doc(uid).update({ forceLogout: true });
        logMasterAction("Killed Session", uid);
    }
}

// 6. MASTER RECYCLE BIN (True Soft Deletes)
async function loadRecycleBin() {
    const tbody = document.getElementById("recycle-bin-body");
    try {
        // Fetch soft-deleted schools
        const sSnap = await db.collection("schools").where("deleted", "==", true).get();
        // Fetch soft-deleted users (chairmen, staff)
        const uSnap = await db.collection("users").where("deleted", "==", true).get();
        
        let html = "";
        sSnap.forEach(doc => {
            const d = doc.data(); const dateStr = d.deletedAt ? d.deletedAt.toDate().toLocaleDateString() : 'Unknown';
            html += `<tr><td class="p-4 text-xs font-bold text-amber-500">TENANT NODE</td><td class="p-4 text-xs text-white">${d.schoolName}</td><td class="p-4 text-xs text-coolGray">${dateStr}</td><td class="p-4 text-right"><button onclick="restoreItem('schools','${doc.id}')" class="text-indigo-400 mr-3">Restore</button><button onclick="hardDelete('schools','${doc.id}')" class="text-rose-500">Purge</button></td></tr>`;
        });
        uSnap.forEach(doc => {
            const d = doc.data(); const dateStr = d.deletedAt ? d.deletedAt.toDate().toLocaleDateString() : 'Unknown';
            html += `<tr><td class="p-4 text-xs font-bold text-tealAccent">USER (${d.role})</td><td class="p-4 text-xs text-white">${d.email}</td><td class="p-4 text-xs text-coolGray">${dateStr}</td><td class="p-4 text-right"><button onclick="restoreItem('users','${doc.id}')" class="text-indigo-400 mr-3">Restore</button><button onclick="hardDelete('users','${doc.id}')" class="text-rose-500">Purge</button></td></tr>`;
        });
        
        tbody.innerHTML = html || "<tr><td colspan='4' class='p-6 text-center text-coolGray'>Bin is empty.</td></tr>";
    } catch(e) {}
}
async function restoreItem(collection, id) { 
    await db.collection(collection).doc(id).update({ deleted: firebase.firestore.FieldValue.delete(), deletedAt: firebase.firestore.FieldValue.delete(), status: 'active' }); 
    showToast("Item restored."); loadRecycleBin(); logMasterAction(`Restored from Bin`, id);
}
async function hardDelete(collection, id) { 
    if(confirm("IRREVERSIBLE ACTION: Permanently wipe this data from Firebase?")) {
        await db.collection(collection).doc(id).delete(); showToast("Purged."); loadRecycleBin(); logMasterAction(`Hard Purged`, id);
    }
}

// 7. BROADCAST
async function sendBroadcast() {
    const target = document.getElementById('uniSelectorBroadcast').value;
    const type = document.getElementById('alertType').value;
    const msg = document.getElementById('alertMsg').value;
    if(!msg) return;
    
    // In a real app, target logic directs to specific docs. Mocked for global structure:
    if(type === 'ticker') {
        await db.collection("system_config").doc("ticker").set({ text: msg, target: target, active: true, timestamp: Date.now() });
    } else {
        await db.collection("global_notifications").doc().set({ title: "God Level Broadcast", body: msg, target: target, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    showToast("Transmitted!");
    logMasterAction(`Sent Broadcast [${type}] to [${target}]`);
    document.getElementById('alertMsg').value = '';
}

// 8. AUDIT
async function loadAuditLog() { /* Unchanged from previous version */ }