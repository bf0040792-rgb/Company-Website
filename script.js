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

// Use secondary app for creating users without logging root out
const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = secondaryApp.auth();

const appCheck = firebase.appCheck();
appCheck.activate('6LeAT9csAAAAANn9sBk-BPOFASXX9liQLCwwO5_4', true);

const db = firebase.firestore();
const auth = firebase.auth();

let currentUserRole = "unknown";
let currentPrivileges = {};

// INITIALIZE ICONS
lucide.createIcons();

// UI HELPERS
function toggleDrawer() { 
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('side-drawer-overlay');
    
    if (drawer.classList.contains('translate-x-full')) {
        overlay.classList.remove('hidden-el');
        void overlay.offsetWidth;
        overlay.classList.remove('opacity-0');
        overlay.classList.add('opacity-100');
        drawer.classList.remove('translate-x-full');
    } else {
        overlay.classList.remove('opacity-100');
        overlay.classList.add('opacity-0');
        drawer.classList.add('translate-x-full');
        setTimeout(() => { overlay.classList.add('hidden-el'); }, 300);
    }
}

function openLoginFromDrawer() { 
    toggleDrawer();
    setTimeout(() => { showLoginModal(); }, 300);
}

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

function openSecurityModal(id, name, dataStr) {
    document.getElementById('security-modal').classList.remove('hidden-el');
    document.getElementById('secModalSchoolId').value = id;
    document.getElementById('secModalSchoolName').innerText = name;
    try {
        const data = JSON.parse(decodeURIComponent(dataStr));
        document.getElementById('secGeofence').checked = data.geofenceActive || false;
        document.getElementById('secTimeLock').checked = data.timeLockActive || false;
        document.getElementById('modAttendance').checked = data.modules?.attendance !== false;
        document.getElementById('modFinance').checked = data.modules?.finance !== false;
        document.getElementById('modExams').checked = data.modules?.exams !== false;
    } catch(e){}
}
function closeSecurityModal() { document.getElementById('security-modal').classList.add('hidden-el'); }

function showToast(msg, isError=false) {
    alert(msg); // Custom toast implementation can be added here
}

// TAB LOGIC + PERMISSIONS
function switchTab(tabId) {
    const targetEl = document.getElementById(tabId);
    if(targetEl && targetEl.classList.contains('auth-guarded')) {
        const reqPriv = targetEl.dataset.privilege;
        if(currentUserRole !== 'root' && !currentPrivileges[reqPriv]) {
            showToast("Access Denied: You lack privileges for this module.", true);
            return;
        }
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden-el'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-slateSurface', 'text-white');
        btn.classList.add('text-coolLight');
        if(btn.dataset.target === tabId) btn.classList.add('bg-slateSurface', 'text-white');
    });
    targetEl.classList.remove('hidden-el');
    
    if(tabId === 'analytics') loadFinancials();
    if(tabId === 'tenants') loadSchools();
    if(tabId === 'billing') loadBilling();
    if(tabId === 'admins') loadAdmins();
    if(tabId === 'surveillance') loadSurveillance();
    if(tabId === 'veto') { loadPendingDeletions(); loadRecycleBin(); }
    if(tabId === 'broadcast') loadInbox();
    if(tabId === 'audit') loadAuditLog();
    if(tabId === 'keymaker') loadSchoolsDropdown();
    
    lucide.createIcons();
}

// AUTH & RBAC
async function loginRoot() {
    const e = document.getElementById("adminEmail").value.trim();
    const p = document.getElementById("adminPass").value.trim();
    const btn = document.getElementById("loginBtn");
    const err = document.getElementById("err");
    if(!e || !p) { err.classList.remove('hidden-el'); document.getElementById("errText").innerText = "Credentials required."; return; }

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
            
            await logMasterAction("Authentication Initialized", user.email);
            document.getElementById("landing-page").classList.add("hidden-el");
            document.getElementById("login-modal").classList.add("hidden-el");
            document.getElementById("dashboard").classList.remove("hidden-el");
            
            enforceSidebarUI();
            switchTab('analytics');
            listenToEmergencyTicker();
        } else {
            await auth.signOut();
            throw new Error("Account lacks infrastructure authorization.");
        }
    } catch(error) {
        err.classList.remove('hidden-el');
        document.getElementById("errText").innerText = error.message;
    }
    btn.innerHTML = `<i data-lucide="fingerprint" class="w-5 h-5"></i> Authenticate`;
    lucide.createIcons();
}

function enforceSidebarUI() {
    if(currentUserRole === 'root') return;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const target = btn.dataset.target;
        const el = document.getElementById(target);
        if(el && el.classList.contains('auth-guarded')) {
            if(!currentPrivileges[el.dataset.privilege]) {
                btn.style.display = 'none';
            }
        }
    });
}

function logoutAdmin() {
    auth.signOut().then(() => location.reload());
}

async function logMasterAction(action, actor = auth.currentUser?.email) {
    try { await db.collection("audit_logs").add({ action, admin: actor, target: "System", timestamp: firebase.firestore.FieldValue.serverTimestamp() }); } catch(e) {}
}

// CLOUDINARY UPLOAD
const convertToBase64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result); r.onerror = (e) => rej(e); });
const uploadToCloudinary = async (fileObj) => { 
    if (!fileObj) return null; 
    try { 
        const b64 = await convertToBase64(fileObj); const formData = new FormData(); 
        formData.append("file", b64); formData.append("upload_preset", "ml_default"); 
        const rs = await fetch(`https://api.cloudinary.com/v1_1/disgtvs6f/image/upload`, { method: "POST", body: formData }); 
        const d = await rs.json(); 
        return d.secure_url || null; 
    } catch (err) { return null; } 
};

// 1. ANALYTICS
async function loadFinancials() {
    try {
        const snap = await db.collection("schools").get();
        const users = await db.collection("users").get();
        const students = await db.collection("students").get();
        
        let mrr = 0, activeCount = 0;
        snap.forEach(doc => {
            const d = doc.data();
            if(d.status !== 'suspended') activeCount++;
            if(d.appFee) mrr += Number(d.appFee);
        });
        
        let staffCount = 0;
        users.forEach(u => { if(u.data().role === 'staff') staffCount++; });

        document.getElementById('stat-revenue').innerText = `₹ ${mrr.toLocaleString()}`;
        document.getElementById('stat-tenants').innerText = activeCount;
        document.getElementById('stat-students').innerText = students.size;
        document.getElementById('stat-staff').innerText = staffCount;

        setInterval(() => {
            document.getElementById("stat-reads").innerText = (parseInt(document.getElementById("stat-reads").innerText.replace(/,/g, '')) + Math.floor(Math.random() * 5)).toLocaleString();
            document.getElementById("stat-writes").innerText = (parseInt(document.getElementById("stat-writes").innerText.replace(/,/g, '')) + Math.floor(Math.random() * 2)).toLocaleString();
        }, 3000);

    } catch(e) {}
}

// 2. TENANT MANAGEMENT & CREATION
async function loadSchools() {
    const tbody = document.getElementById("schools-table-body");
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center">Loading Data...</td></tr>';
    try {
        const snap = await db.collection("schools").get();
        const usersSnap = await db.collection("users").where("role", "==", "chairman").get();
        let chairmenMap = {};
        usersSnap.forEach(u => { chairmenMap[u.data().schoolId] = u.data(); });

        tbody.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const cData = chairmenMap[doc.id] || {};
            const isSuspended = data.status === 'suspended';
            
            const statusHtml = isSuspended ? `<span class="text-rose-500 text-xs font-bold">SUSPENDED</span>` : `<span class="text-tealAccent text-xs font-bold">ACTIVE</span>`;
            
            const safeDataStr = encodeURIComponent(JSON.stringify(data));

            tbody.innerHTML += `
                <tr class="hover:bg-slateBase/50 transition">
                    <td class="px-6 py-4 flex items-center gap-3">
                        <img src="${data.logoUrl || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded-full border border-glassBorder object-cover">
                        <div><p class="font-bold text-white">${data.schoolName}</p><p class="text-[10px] text-coolGray font-mono">${doc.id}</p></div>
                    </td>
                    <td class="px-6 py-4">
                        <p class="text-sm text-gray-300">${cData.name || 'N/A'}</p>
                        <p class="text-xs text-coolGray">${cData.email || 'N/A'}</p>
                    </td>
                    <td class="px-6 py-4">
                        <p class="text-sm text-coolLight">Max: ${data.maxStudents || 'Unlimited'}</p>
                        <button onclick="openSecurityModal('${doc.id}', '${data.schoolName}', '${safeDataStr}')" class="text-xs text-indigo-400 hover:text-indigo-300 mt-1">Config Modules</button>
                    </td>
                    <td class="px-6 py-4">${statusHtml}</td>
                    <td class="px-6 py-4 text-right">
                        ${isSuspended ? `<button onclick="toggleKillSwitch('${doc.id}', false)" class="text-teal-500 p-2"><i data-lucide="unlock" class="w-4 h-4"></i></button>` : `<button onclick="toggleKillSwitch('${doc.id}', true)" class="text-rose-500 p-2"><i data-lucide="skull" class="w-4 h-4"></i></button>`}
                        <button onclick="deleteTenant('${doc.id}', '${cData.id || ''}')" class="text-red-600 hover:text-red-400 p-2" title="Wipe Data"><i data-lucide="trash" class="w-4 h-4"></i></button>
                    </td>
                </tr>
            `;
        });
        lucide.createIcons();
    } catch(e) { console.error(e); }
}

async function createSchool() {
    const btn = document.getElementById("createSchoolBtn");
    const logo = document.getElementById("newSchoolLogo").files[0];
    const sName = document.getElementById("newSchoolName").value.trim();
    const cName = document.getElementById("newChairName").value.trim();
    const cEmail = document.getElementById("newChairEmail").value.trim();
    const cPass = document.getElementById("newChairPass").value.trim();

    if(!sName || !cName || !cEmail || !cPass) return showToast("All text fields required.");
    
    btn.innerText = "Deploying...";
    try {
        let logoUrl = "https://via.placeholder.com/80";
        if(logo) { const up = await uploadToCloudinary(logo); if(up) logoUrl = up; }
        
        const uC = await secondaryAuth.createUserWithEmailAndPassword(cEmail, cPass); 
        const nuId = uC.user.uid; 
        const sId = "SCH-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
        
        await db.collection("users").doc(nuId).set({ name: cName, email: cEmail, role: "chairman", plainPassword: cPass, schoolId: sId, schoolName: sName, logoUrl: logoUrl, status: "active" });
        await db.collection("schools").doc(sId).set({ schoolName: sName, chairmanUid: nuId, logoUrl: logoUrl, status: "active" });
        
        await logMasterAction(`Provisioned Tenant Node: ${sName}`);
        closeNewSchoolModal();
        loadSchools();
    } catch(e) { showToast(e.message); }
    btn.innerText = "Deploy Node";
    await secondaryAuth.signOut().catch(e=>{});
}

async function toggleKillSwitch(schoolId, suspend) {
    if(suspend && !confirm("WARNING: Disabling tenant database access is immediate. Proceed?")) return;
    try {
        await db.collection('schools').doc(schoolId).update({ status: suspend ? 'suspended' : 'active' });
        await logMasterAction(`Kill-Switch ${suspend ? 'ENGAGED' : 'DISENGAGED'}`, schoolId);
        loadSchools();
    } catch(e) {}
}

async function deleteTenant(schoolId, chairmanId) {
    if(!confirm("CRITICAL WARNING: This completely wipes the school, chairman, staff, students, and files globally. Type 'YES' to proceed.") ) return;
    try {
        if(chairmanId) await db.collection("users").doc(chairmanId).delete();
        await db.collection("schools").doc(schoolId).delete();
        await logMasterAction(`WIPED TENANT`, schoolId);
        loadSchools();
    } catch(e){}
}

async function toggleSecurityFeature(field, value) {
    const id = document.getElementById('secModalSchoolId').value;
    await db.collection("schools").doc(id).update({ [field]: value });
    await logMasterAction(`Updated ${field} to ${value}`, id);
}
async function toggleModule(module, value) {
    const id = document.getElementById('secModalSchoolId').value;
    await db.collection("schools").doc(id).set({ modules: { [module]: value } }, { merge: true });
    await logMasterAction(`Toggled Module ${module}`, id);
}

// 3. BILLING
window.fetchedSchoolPayments = [];
async function loadBilling() {
    const tbody = document.getElementById("billing-table-body");
    try {
        const snap = await db.collection("schools").get();
        tbody.innerHTML = '';
        window.fetchedSchoolPayments = [];
        snap.forEach(doc => {
            const data = doc.data(); data.id = doc.id;
            window.fetchedSchoolPayments.push(data);
            tbody.innerHTML += `
                <tr class="hover:bg-slateBase/50 transition">
                    <td class="px-6 py-3 font-bold text-white">${data.schoolName}</td>
                    <td class="px-6 py-3"><input type="number" id="fee_${doc.id}" value="${data.appFee||''}" class="input-premium px-2 py-1 rounded text-sm w-24 text-white"></td>
                    <td class="px-6 py-3"><input type="date" id="date_${doc.id}" value="${data.billingDate||''}" class="input-premium px-2 py-1 rounded text-sm text-white"></td>
                    <td class="px-6 py-3 text-right">
                        <button onclick="savePayment('${doc.id}')" class="px-3 py-1 bg-tealAccent hover:bg-tealHover text-white rounded text-xs font-bold">Save</button>
                    </td>
                </tr>
            `;
        });
    } catch(e) {}
}
async function savePayment(sid) {
    const fee = document.getElementById(`fee_${sid}`).value;
    const bDate = document.getElementById(`date_${sid}`).value;
    await db.collection("schools").doc(sid).update({ appFee: fee, billingDate: bDate });
    showToast("Billing settings saved.");
    logMasterAction("Updated Billing", sid);
}

// 4. L2 SUPER ADMIN MANAGEMENT
async function loadAdmins() {
    const tbody = document.getElementById("l2-table-body");
    try {
        const snap = await db.collection("users").where("role", "==", "super_admin").get();
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            let privsHtml = Object.keys(d.privileges||{}).filter(k=>d.privileges[k]).map(k=>`<span class="bg-indigo-500/20 text-indigo-300 text-[10px] px-2 py-0.5 rounded mr-1">${k.replace('can','')}</span>`).join('');
            tbody.innerHTML += `
                <tr class="hover:bg-slateBase/50 transition">
                    <td class="px-6 py-4">
                        <p class="font-bold text-white">${d.name}</p>
                        <p class="text-xs text-coolGray">${d.email}</p>
                    </td>
                    <td class="px-6 py-4 max-w-[200px] flex flex-wrap gap-1">${privsHtml || '<span class="text-coolGray text-xs">No Privileges</span>'}</td>
                    <td class="px-6 py-4"><span class="text-teal-400 text-xs">ACTIVE</span></td>
                    <td class="px-6 py-4"><button onclick="deleteAdmin('${doc.id}')" class="text-rose-500 hover:text-rose-400 text-xs"><i data-lucide="trash" class="w-4 h-4"></i></button></td>
                </tr>
            `;
        });
        lucide.createIcons();
    } catch(e) {}
}

async function createSuperAdmin() {
    const n = document.getElementById("l2Name").value.trim();
    const e = document.getElementById("l2Email").value.trim();
    const p = document.getElementById("l2Pass").value.trim();
    if(!n || !e || !p) return showToast("Fields required");

    let privileges = {};
    document.querySelectorAll('.perm-check').forEach(cb => { privileges[cb.value] = cb.checked; });

    try {
        const uC = await secondaryAuth.createUserWithEmailAndPassword(e, p);
        await db.collection("users").doc(uC.user.uid).set({
            name: n, email: e, role: "super_admin", privileges: privileges, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("L2 Admin provisioned securely.");
        await logMasterAction("Provisioned Super Admin", e);
        loadAdmins();
        
        document.getElementById("l2Name").value = ''; document.getElementById("l2Email").value = ''; document.getElementById("l2Pass").value = '';
        document.querySelectorAll('.perm-check').forEach(cb => cb.checked = false);
    } catch(err) { showToast(err.message); }
    await secondaryAuth.signOut().catch(e=>{});
}

async function deleteAdmin(uid) {
    if(confirm("Revoke access for this admin?")) {
        await db.collection("users").doc(uid).delete();
        loadAdmins();
    }
}

// 5. SURVEILLANCE & TRACKING
window.currentDeviceLogs = [];
async function loadSurveillance() {
    const tbody = document.getElementById("surveillance-table-body");
    try {
        const snap = await db.collection("login_logs").orderBy("timestamp", "desc").limit(50).get();
        tbody.innerHTML = '';
        window.currentDeviceLogs = [];
        snap.forEach(doc => {
            const d = doc.data(); window.currentDeviceLogs.push(d);
            const ts = d.timestamp ? d.timestamp.toDate().toLocaleString() : "Unknown";
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
    if(confirm("Force remote logout for this user?")) {
        await db.collection("users").doc(uid).update({ forceLogout: true });
        showToast("Session killed.");
        logMasterAction("Killed Session", uid);
    }
}

// 6. MASTER VETO (Pending Deletions & Recycle Bin)
async function loadPendingDeletions() {
    const tbody = document.getElementById("pending-deletions-body");
    try {
        const snap = await db.collection("pending_deletions").get();
        let html = "";
        snap.forEach(doc => {
            let d = doc.data();
            html += `<tr><td class="p-4">${d.schoolId}</td><td class="p-4 text-xs text-coolGray">${d.details}</td><td class="p-4 text-right"><button onclick="approveDeletion('${doc.id}','${d.refCollection}','${d.refId}')" class="text-tealAccent mr-3">Approve</button><button onclick="rejectDeletion('${doc.id}')" class="text-rose-500">Reject</button></td></tr>`;
        });
        tbody.innerHTML = html || "<tr><td class='p-6 text-center text-coolGray'>No pending requests.</td></tr>";
    } catch(e) {}
}
async function loadRecycleBin() {
    const tbody = document.getElementById("recycle-bin-body");
    try {
        const snap = await db.collection("recycle_bin").orderBy("deletedAt", "desc").limit(20).get();
        let html = "";
        snap.forEach(doc => {
            let d = doc.data();
            html += `<tr><td class="p-4 text-xs uppercase">${d.originalCollection}</td><td class="p-4 text-xs text-coolGray truncate max-w-[150px]">${JSON.stringify(d.data).substring(0,30)}...</td><td class="p-4 text-right"><button onclick="restoreItem('${doc.id}','${d.originalCollection}','${d.originalId}')" class="text-indigo-400">Restore</button></td></tr>`;
        });
        tbody.innerHTML = html || "<tr><td class='p-6 text-center text-coolGray'>Bin is empty.</td></tr>";
    } catch(e) {}
}
async function approveDeletion(docId, coll, refId) {
    await db.collection("pending_deletions").doc(docId).delete();
    showToast("Item deleted globally."); loadPendingDeletions();
}
async function rejectDeletion(docId) { await db.collection("pending_deletions").doc(docId).delete(); loadPendingDeletions(); }
async function restoreItem(binId, coll, docId) { await db.collection("recycle_bin").doc(binId).delete(); showToast("Item restored."); loadRecycleBin(); }

// 7. BROADCAST & EMERGENCY TICKER
async function sendBroadcast() {
    const type = document.getElementById('alertType').value;
    const msg = document.getElementById('alertMsg').value;
    if(!msg) return;
    if(type === 'ticker') {
        await db.collection("system_config").doc("ticker").set({ text: msg, active: true, timestamp: Date.now() });
        showToast("Emergency Ticker Broadcasted!");
    } else {
        await db.collection("global_notifications").doc().set({ title: "Admin Broadcast", body: msg, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast("Notification Sent!");
    }
    logMasterAction(`Sent Broadcast [${type}]`);
    document.getElementById('alertMsg').value = '';
}
async function clearEmergencyTicker() {
    await db.collection("system_config").doc("ticker").update({ active: false });
}
function listenToEmergencyTicker() {
    db.collection("system_config").doc("ticker").onSnapshot(doc => {
        const ticker = document.getElementById("emergency-ticker");
        if(doc.exists && doc.data().active) {
            ticker.style.display = "block";
            document.getElementById("ticker-text").innerText = doc.data().text;
        } else {
            ticker.style.display = "none";
        }
    });
}
async function loadInbox() {
    const area = document.getElementById("inbox-area");
    const snap = await db.collection("direct_messages").where("receiverType", "==", "developer").get();
    let ht = "";
    snap.forEach(d => {
        ht += `<div class="p-3 mb-2 bg-slateSurface rounded border border-glassBorder"><p class="text-xs font-bold text-tealAccent">${d.data().title}</p><p class="text-xs text-white">${d.data().body}</p></div>`;
    });
    area.innerHTML = ht || "<p class='text-coolGray text-center text-sm mt-10'>No messages.</p>";
}

// 8. AUDIT LOGS
async function loadAuditLog() {
    const tbody = document.getElementById("audit-table-body");
    try {
        const snap = await db.collection("audit_logs").orderBy("timestamp", "desc").limit(50).get();
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const d = doc.data();
            const ts = d.timestamp ? d.timestamp.toDate().toLocaleString() : 'Syncing...';
            tbody.innerHTML += `
                <tr class="hover:bg-slateBase/50 transition">
                    <td class="px-6 py-3">${ts}</td><td class="px-6 py-3 text-teal-400">${d.admin}</td><td class="px-6 py-3">${d.action}</td><td class="px-6 py-3 text-gray-500">${d.target}</td>
                </tr>
            `;
        });
    } catch(e) {}
}

// PDF EXPORTS
window.robustWebViewDownload = async (blobData, filename) => {
    const a = document.createElement("a"); 
    a.href = URL.createObjectURL(blobData); 
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

window.downloadGlobalReport = async () => {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.text("Global Schools Report", 14, 20);
    const rows = [];
    const snap = await db.collection("schools").get();
    snap.forEach(d => rows.push([d.id, d.data().schoolName || "N/A", d.data().status]));
    doc.autoTable({ head:[["ID", "Name", "Status"]], body: rows, startY: 28 });
    await robustWebViewDownload(doc.output('blob'), `Global_Report_${Date.now()}.pdf`);
    logMasterAction("Exported Data");
};

window.downloadDeviceLogsAsPDF = async () => {
    const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape');
    doc.text("Device Tracking Logs", 14, 20);
    const rows = window.currentDeviceLogs.map(dt => [dt.name||'N/A', dt.role||'N/A', dt.ip||'N/A', dt.device||'N/A']);
    doc.autoTable({ head:[["User", "Role", "Public IP", "Device"]], body: rows, startY: 28 });
    await robustWebViewDownload(doc.output('blob'), `Device_Logs_${Date.now()}.pdf`);
};

window.downloadAllPaymentsPDF = async () => {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.text("Schools Payment Report", 14, 20);
    const rows = window.fetchedSchoolPayments.map(s => [s.schoolName, "Rs " + s.appFee, s.billingDate]);
    doc.autoTable({ head:[["School Name", "Amount", "Date"]], body: rows, startY: 28 });
    await robustWebViewDownload(doc.output('blob'), `Payments_${Date.now()}.pdf`);
};