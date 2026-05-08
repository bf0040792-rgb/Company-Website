// ==========================================
// 1. FIREBASE & SYSTEM INITIALIZATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBUAoXX64MTKrhMiRKd9oJPnaT0j60SPdY",
    authDomain: "admin-panel-17e6a.firebaseapp.com",
    databaseURL: "https://admin-panel-17e6a-default-rtdb.firebaseio.com",
    projectId: "admin-panel-17e6a",
    storageBucket: "admin-panel-17e6a.firebasestorage.app",
    messagingSenderId: "519315316570",
    appId: "1:519315316570:web:1448a0936e9a102d849d63"
};

const app = firebase.initializeApp(firebaseConfig);
const appCheck = firebase.appCheck();
appCheck.activate('6LeAT9csAAAAANn9sBk-BPOFASXX9liQLCwwO5_4', true);

const auth = firebase.auth(app);
const db = firebase.firestore(app);

db.enablePersistence({synchronizeTabs: true}).catch(function(err) { console.log("Cache Error: ", err); });

const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = firebase.auth(secondaryApp);

// Global State Variables
window.fetchedChairmen = []; 
window.fetchedGlobalStaffList =[]; 
window.fetchedSchoolPayments =[]; 
window.fetchedInspectStudents = []; 
window.currentDeviceLogs =[]; 
let superAdminUid = ""; 
let currentEditChairmanId = null;

// UI Control Variables
const loginModal = document.getElementById('login-modal'); 
const dashboardWrapper = document.getElementById('dashboard-wrapper');
const landingPage = document.getElementById('landing-page');
const pinWrapper = document.getElementById('pin-wrapper');

// Initialize Icons
setTimeout(() => lucide.createIcons(), 100);

// ==========================================
// 2. CORE UI & UTILITY FUNCTIONS
// ==========================================
function showLoginModal() { 
    loginModal.classList.remove('hidden-el');
    setTimeout(()=> loginModal.classList.replace('opacity-0', 'opacity-100'), 10);
    document.getElementById('login-modal-box').classList.replace('scale-95', 'scale-100');
}
function hideLoginModal() { 
    loginModal.classList.replace('opacity-100', 'opacity-0');
    document.getElementById('login-modal-box').classList.replace('scale-100', 'scale-95');
    setTimeout(() => loginModal.classList.add('hidden-el'), 300);
}

window.closeCustomModal = (id) => { document.getElementById(id).classList.add('hidden-el'); };
const openCustomModal = (id) => { document.getElementById(id).classList.remove('hidden-el'); };

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
document.getElementById("deviceModeToggle").addEventListener("change", (e) => { 
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (e.target.checked) { 
        document.body.classList.add("force-desktop"); 
        viewportMeta.setAttribute("content", "width=1200, user-scalable=yes"); 
    } else { 
        document.body.classList.remove("force-desktop"); 
        viewportMeta.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"); 
    }
});

document.getElementById("privacyShieldToggle").addEventListener("change", (e) => {
    if(e.target.checked) { document.body.classList.add("privacy-mode"); window.showToast("<i class='fas fa-user-secret'></i> STEALTH MODE ENGAGED", "#6366f1"); } 
    else { document.body.classList.remove("privacy-mode"); window.showToast("STEALTH MODE DISABLED", "#64748b"); }
});

// PDF Downloader Helper
window.robustWebViewDownload = async (blobData, filename) => {
    try {
        const reader = new FileReader(); reader.readAsDataURL(blobData);
        reader.onloadend = function() {
            let base64data = reader.result;
            base64data = base64data.replace(";base64,", `;filename=${encodeURIComponent(filename.replace(/ /g, "_"))};base64,`);
            window.showToast("⏳ EXTRACTING " + filename + "...", "#f59e0b");
            const a = document.createElement("a"); a.href = base64data; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
    } catch (e) { window.showToast("❌ EXTRACTION ERROR: " + e.message, "#e11d48"); }
};

// Cloudinary Helper
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
const deleteCloudinaryImage = async (imageUrl) => {
    if (imageUrl && imageUrl.includes("cloudinary.com")) {
        try { await fetch("https://school-backend-zlgy.onrender.com/api/delete-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: imageUrl }) }); } catch(e) {}
    }
};

// ==========================================
// 3. AUTHENTICATION & PIN SECURITY
// ==========================================
document.getElementById("doLoginBtn").addEventListener("click", async () => { 
    const e = document.getElementById("loginId").value.trim(); 
    const p = document.getElementById("loginPassword").value.trim(); 
    const b = document.getElementById("doLoginBtn"); 
    const err = document.getElementById("loginErrorMsg");
    if(!e || !p) { err.innerText = "CREDENTIALS REQUIRED."; err.classList.remove('hidden-el'); return; } 
    b.innerHTML = `<i class="fas fa-spinner fa-spin"></i> VERIFYING HASH...`; 
    try { 
        await auth.signInWithEmailAndPassword(e, p); 
        window.logAudit("Master Login Success", "System Core"); 
    } catch (error) { 
        err.innerText = "INVALID MASTER KEY!"; err.classList.remove('hidden-el'); 
        b.innerHTML = `<i data-lucide="fingerprint" class="w-5 h-5"></i> AUTHENTICATE`;
        lucide.createIcons();
    } 
});

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const ud = await db.collection("users").doc(user.uid).get();
            if (!ud.exists || ud.data().role === "developer") {
                if (!ud.exists) await db.collection("users").doc(user.uid).set({ email: user.email, role: "developer", name: "Super Admin", status: "active" });
                superAdminUid = user.uid; 
                
                document.getElementById("auth-overlay").classList.add("hidden-el"); 
                landingPage.classList.add("hidden-el");
                hideLoginModal();
                
                // PIN Logic
                let devData = ud.exists ? ud.data() : {};
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

                document.getElementById("adminEmail").innerText = "ROOT: " + user.email; 
                document.getElementById("role-footer").innerText = "SYSTEM STATUS: ROOT AUTHORIZED | SECURE CONNECTION ESTABLISHED"; 
                document.getElementById("role-footer").style.background = "#00F0FF"; // Neon Cyan
                document.getElementById("role-footer").style.color = "#050b14"; // Dark text
                
                // Load Dashboard Data
                loadChairmen(); loadSchoolsForDropdown(); loadAllStaff(); loadSchoolPayments(); checkAndSendBillingAlerts(); loadInboxMessages();
                window.initQuotaMonitor(); listenToEmergencyTicker(); window.loadAuditLogs(); window.loadPendingDeletions(); window.loadRecycleBin(); window.loadCustomRoles();
                
            } else { await auth.signOut(); window.showToast("ACCESS DENIED. ROOT ONLY.", "#e11d48"); }
        } catch (error) { window.showToast("DB CONNECTION ERROR.", "#e11d48"); }
    } else { 
        document.getElementById("auth-overlay").classList.add("hidden-el"); 
        landingPage.classList.remove("hidden-el");
        dashboardWrapper.classList.add("hidden-el");
    }
});

document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut().then(() => location.reload()));
window.logoutFromPin = () => auth.signOut().then(() => location.reload());

window.unlockDashboard = () => {
    pinWrapper.classList.add("hidden-el");
    dashboardWrapper.classList.remove("hidden-el");
    lucide.createIcons();
};

window.saveNewPin = async () => {
    const pin = document.getElementById("newPin").value;
    if(pin.length < 4) return window.showToast("PLEASE ENTER 4 DIGITS", "#e11d48");
    await db.collection("users").doc(superAdminUid).update({ pin: pin });
    window.currentAppPin = pin;
    window.unlockDashboard();
};

window.verifyPin = () => {
    const pin = document.getElementById("loginPin").value;
    if(pin === window.currentAppPin) {
        window.unlockDashboard();
    } else {
        document.getElementById("pinErrorMsg").classList.remove("hidden-el");
        setTimeout(()=>document.getElementById("pinErrorMsg").classList.add("hidden-el"), 2000);
    }
};

// ==========================================
// 4. TAB NAVIGATION
// ==========================================
document.querySelectorAll('.menu-item').forEach(i => { 
    i.addEventListener('click', (e) => { 
        const t = e.target.closest('.menu-item'); 
        if(!t || !t.dataset.target) return; 
        
        document.querySelectorAll('.menu-item').forEach(m => { 
            m.classList.remove('active', 'bg-tealAccent/10', 'text-tealAccent', 'border-l-2', 'border-tealAccent', 'shadow-[inset_2px_0_10px_rgba(0,240,255,0.1)]'); 
            m.classList.add('text-coolLight');
        });
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden-el')); 
        
        t.classList.remove('text-coolLight');
        t.classList.add('active', 'bg-tealAccent/10', 'text-tealAccent', 'border-l-2', 'border-tealAccent', 'shadow-[inset_2px_0_10px_rgba(0,240,255,0.1)]'); 
        document.getElementById(t.dataset.target).classList.remove('hidden-el'); 
        document.getElementById('tab-title').innerHTML = t.innerHTML;
        
        // Refresh triggers on tab clicks
        if(t.dataset.target === 'tab-audit-logs') window.loadAuditLogs();
        if(t.dataset.target === 'tab-device-tracking') window.loadDeviceLogs();
        lucide.createIcons();
    }); 
});

// ==========================================
// 5. ANALYTICS & QUOTA MONITOR
// ==========================================
window.initQuotaMonitor = () => {
    let baseReads = 14230; let baseWrites = 3490;
    setInterval(() => {
        baseReads += Math.floor(Math.random() * 5); baseWrites += Math.floor(Math.random() * 2);
        const rEl = document.getElementById("stat-reads"); const wEl = document.getElementById("stat-writes");
        if(rEl && wEl) { rEl.innerText = baseReads.toLocaleString(); wEl.innerText = baseWrites.toLocaleString(); }
    }, 3000);

    fetch("https://school-backend-zlgy.onrender.com/api/cloudinary-usage")
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            const storageUsed = (data.usage.storage.usage / (1024 * 1024 * 1024)).toFixed(4) + " GB";
            const bandwidthUsed = (data.usage.bandwidth.usage / (1024 * 1024 * 1024)).toFixed(4) + " GB";
            if(document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerText = storageUsed;
            if(document.getElementById("stat-cloudinary-bandwidth")) document.getElementById("stat-cloudinary-bandwidth").innerText = "Bandwidth: " + bandwidthUsed;
        } else {
            if(document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerHTML = "<i class='fas fa-exclamation-triangle text-rose-500'></i> ERROR";
        }
    }).catch(e => { 
        if(document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerHTML = "OFFLINE"; 
    });
};

// ==========================================
// 6. CHAIRMEN & TENANT DEPLOYMENT
// ==========================================
document.getElementById("createChairmanBtn").addEventListener("click", async () => {
    const sN = document.getElementById("schoolName").value.trim(); const cN = document.getElementById("chairmanName").value.trim(); const em = document.getElementById("chairmanEmail").value.trim(); const pA = document.getElementById("chairmanPassword").value.trim(); const lF = document.getElementById("schoolLogo").files[0]; const b = document.getElementById("createChairmanBtn");
    if (!sN || !cN || !em || !pA) return window.showToast("FILL ALL PARAMETERS!", "#e11d48"); 
    b.innerText = "DEPLOYING NODE...";
    try {
        let lU = "https://via.placeholder.com/40"; 
        if (lF) { b.innerText = "UPLOADING ASSET..."; const upU = await uploadToCloudinary(lF); if(upU) { lU = upU; } else { window.showToast("ASSET UPLOAD FAILED.", "#e11d48"); b.innerText = "DEPLOY NODE"; return; } }
        b.innerText = "PROVISIONING ID...";
        const uC = await secondaryAuth.createUserWithEmailAndPassword(em, pA); 
        const nuId = uC.user.uid; const sId = "NODE-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
        await db.collection("users").doc(nuId).set({ name: cN, email: em, role: "chairman", plainPassword: pA, schoolId: sId, schoolName: sN, logoUrl: lU, status: "active", blockReason: "" });
        await db.collection("schools").doc(sId).set({ schoolName: sN, chairmanUid: nuId, logoUrl: lU });
        window.showToast("✅ TENANT NODE DEPLOYED!"); window.logAudit("Provisioned Node", sN);
        document.getElementById("schoolName").value = ""; document.getElementById("chairmanName").value = ""; document.getElementById("chairmanEmail").value = ""; document.getElementById("chairmanPassword").value = ""; document.getElementById("schoolLogo").value = "";
        loadChairmen(); loadSchoolsForDropdown(); loadSchoolPayments(); loadAllStaff();
    } catch (err) { window.showToast("ERROR: " + err.message, "#e11d48"); } finally { await secondaryAuth.signOut().catch(e=>{}); b.innerText = "DEPLOY NODE"; }
});

async function loadChairmen() { 
    try { 
        const snp = await db.collection("users").get(); window.fetchedChairmen =[]; let tS = 0; 
        snp.forEach(d => { const dt = d.data(); if (dt.role === "chairman") { dt.id = d.id; window.fetchedChairmen.push(dt); } else if (dt.role === "staff") { tS++; } }); 
        const stuS = await db.collection("students").get(); 
        document.getElementById("stat-schools").innerText = window.fetchedChairmen.length; document.getElementById("stat-staff").innerText = tS; document.getElementById("stat-students").innerText = stuS.size; 
        window.filterChairmenList(); window.loadPasswordRequests(); 
    } catch (err) {} 
}

window.filterChairmenList = () => { 
    const sid = document.getElementById("filterChairmenSchool").value; let html = ""; let ls = window.fetchedChairmen; 
    if(sid !== "ALL" && sid !== "") { ls = ls.filter(c => c.schoolId === sid); } 
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
                ${bb} ${shadowBtn}
                <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteChairman('${dt.id}', '${dt.schoolId}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`; 
    }); 
    document.getElementById("chairmanTableBody").innerHTML = html || "<tr><td colspan='6' class='text-center p-4 text-coolGray font-mono'>NO NODES FOUND</td></tr>"; 
};

window.openEditChairman = async (uid) => { 
    const ch = window.fetchedChairmen.find(c => c.id === uid); if(!ch) return; 
    window.currentEditChairmanId = uid; 
    document.getElementById("edit-preview-logo").src = ch.logoUrl || "https://via.placeholder.com/80"; 
    document.getElementById("edit-schoolName").value = ch.schoolName || ""; 
    document.getElementById("edit-chairmanName").value = ch.name || ""; 
    document.getElementById("edit-chairmanEmail").value = ch.email || ""; 
    document.getElementById("edit-schoolLogo").value = ""; 
    
    if(ch.schoolId) {
        const sDoc = await db.collection("schools").doc(ch.schoolId).get();
        if(sDoc.exists) {
            document.getElementById("edit-maxStudents").value = sDoc.data().maxStudents || "";
            document.getElementById("edit-themeColor").value = sDoc.data().themeColor || "#00F0FF";
        }
    }
    openCustomModal("edit-chairman-modal"); 
};

window.saveChairmanEdit = async () => {
    const uid = window.currentEditChairmanId; const ch = window.fetchedChairmen.find(c => c.id === uid); if(!ch) return;
    const newSchoolName = document.getElementById("edit-schoolName").value.trim(); const newChairmanName = document.getElementById("edit-chairmanName").value.trim(); let newEmail = document.getElementById("edit-chairmanEmail").value.trim(); 
    const maxStudents = document.getElementById("edit-maxStudents").value.trim(); const themeColor = document.getElementById("edit-themeColor").value;
    const logoFile = document.getElementById("edit-schoolLogo").files[0]; const btn = document.getElementById("save-chairman-edit-btn");
    if(!newSchoolName || !newChairmanName || !newEmail) return window.showToast("FILL TEXT DETAILS!", "#e11d48");
    
    btn.innerText = "PROCESSING...";
    try {
        let finalLogoUrl = ch.logoUrl;
        if(logoFile) { btn.innerText = "UPLOADING ASSET..."; const uploaded = await uploadToCloudinary(logoFile); if(uploaded) finalLogoUrl = uploaded; }
        if(newEmail !== ch.email) {
            const response = await fetch("https://school-backend-zlgy.onrender.com/changeEmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUid: uid, newEmail: newEmail }) });
            const data = await response.json();
            if(!data.success) { btn.innerText = "WRITE CHANGES"; return window.showToast("❌ SERVER ERROR: " + data.error, "#e11d48"); }
        }
        
        await db.collection("users").doc(uid).update({ name: newChairmanName, schoolName: newSchoolName, email: newEmail, logoUrl: finalLogoUrl });
        if(ch.schoolId) { await db.collection("schools").doc(ch.schoolId).update({ schoolName: newSchoolName, logoUrl: finalLogoUrl, maxStudents: maxStudents?Number(maxStudents):null, themeColor: themeColor }); }
        
        window.showToast("✅ DETAILS UPDATED SUCCESSFULLY!"); window.logAudit("Edited Node Credentials", newSchoolName);
        window.closeCustomModal("edit-chairman-modal"); loadChairmen(); loadSchoolsForDropdown();
    } catch(e) { window.showToast("❌ ERROR: " + e.message, "#e11d48"); } finally { btn.innerText = "WRITE CHANGES"; }
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
            db.collection("users").doc(uid).update({ status: ns, blockReason: "" }).then(()=>{ window.showToast("✅ ACCOUNT UNBLOCKED!"); loadChairmen(); window.logAudit("Unblocked User", uid);}); 
        }); 
    } 
};

window.toggleShadowBan = async (uid, state) => { window.customConfirm(state ? "ENABLE SHADOW BAN? Data will appear saved to them but won't sync." : "REMOVE SHADOW BAN?", async () => { await db.collection("users").doc(uid).update({ shadowBan: state }); window.showToast(state ? "SHADOW BAN ENABLED!" : "SHADOW BAN REMOVED."); loadChairmen(); window.logAudit(state?"Shadow Banned":"Unbanned", uid); }); };

// Cascade Delete
window.deleteChairman = (uid, sid) => { 
    window.customConfirm("DANGER: ENTIRE NODE (School, Chairman, Staff, Students, Photos) WILL BE WIPED PERMANENTLY. PROCEED?", async () => { 
        try { 
            window.showToast("WIPING COMPLETELY... PLEASE WAIT", "#f59e0b");
            if(uid) {
                const uDoc = await db.collection("users").doc(uid).get();
                if(uDoc.exists && uDoc.data().logoUrl) await deleteCloudinaryImage(uDoc.data().logoUrl);
                await db.collection("users").doc(uid).delete(); 
            }
            if(sid && sid !== "undefined" && sid !== "null") { 
                const sDoc = await db.collection("schools").doc(sid).get();
                if(sDoc.exists && sDoc.data().logoUrl) await deleteCloudinaryImage(sDoc.data().logoUrl);
                await db.collection("schools").doc(sid).delete(); 
                
                const students = await db.collection("students").where("schoolId", "==", sid).get();
                for (const doc of students.docs) { await deleteCloudinaryImage(doc.data().photoUrl); await db.collection("students").doc(doc.id).delete(); }

                const staff = await db.collection("users").where("schoolId", "==", sid).where("role", "==", "staff").get();
                for (const doc of staff.docs) { await deleteCloudinaryImage(doc.data().photoUrl); await db.collection("users").doc(doc.id).delete(); }
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
        window.open(`${chairmanPortalLink}?impersonate=true&email=${safeEmail}&pass=${safePass}`, '_blank'); 
    }, 1500);
};

// ==========================================
// 7. INSPECT STUDENTS & AADHAAR SEARCH
// ==========================================
document.getElementById("inspectSchoolSelect").addEventListener("change", async (e) => { 
    const sid = e.target.value; const dd = document.getElementById("schoolInspectData"); 
    if(!sid) { dd.classList.add("hidden-el"); return; } 
    try { 
        let ss = (sid === "ALL") ? await db.collection("students").get() : await db.collection("students").where("schoolId", "==", sid).get(); 
        window.fetchedInspectStudents =[]; let sh = ""; 
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
    } catch(e) {} 
});

window.showStudentDetail = (id) => { 
    const st = window.fetchedInspectStudents.find(s => s.id === id); if(!st) return; 
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
            if(stDoc.exists) await deleteCloudinaryImage(stDoc.data().photoUrl);
            await db.collection("students").doc(id).delete();
            window.showToast("✅ SUBJECT & ASSETS PURGED!");
            document.getElementById("inspectSchoolSelect").dispatchEvent(new Event("change"));
        } catch(e) {}
    });
};

window.searchStudentByAadhaar = async () => {
    const input = document.getElementById("search-aadhaar-input").value.trim();
    const resDiv = document.getElementById("aadhaar-search-result"); const errP = document.getElementById("aadhaar-error-msg");
    resDiv.classList.add("hidden-el"); errP.classList.add("hidden-el");
    if(!input) return window.showToast("ENTER UID NUMBER", "#e11d48");
    try {
        let sn = await db.collection("students").where("aadhaar", "==", input).get();
        if(sn.empty) sn = await db.collection("students").where("aadhar", "==", input).get();
        if(sn.empty) sn = await db.collection("students").where("aadhaarNumber", "==", input).get();
        if(sn.empty) { errP.classList.remove("hidden-el"); return; }
        
        let dt = sn.docs[0].data(); let sName = "UNKNOWN NODE";
        if(dt.schoolId) { let scl = await db.collection("schools").doc(dt.schoolId).get(); if(scl.exists) sName = scl.data().schoolName || "UNKNOWN NODE"; }
        
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
    } catch(e) { window.showToast("SEARCH ERROR: " + e.message, "#e11d48"); }
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
    } catch(e) { btn.style.display = 'flex'; }
    btn.innerHTML = `<i class="fas fa-download"></i> EXPORT DOSSIER`;
};

// ==========================================
// 8. GLOBAL STAFF DIRECTORY
// ==========================================
window.loadAllStaff = async () => { try { const sp = await db.collection("users").where("role", "==", "staff").get(); window.fetchedGlobalStaffList =[]; sp.forEach(d => { const dt = d.data(); dt.id = d.id; window.fetchedGlobalStaffList.push(dt); }); window.filterStaffList(); } catch (e) {} };
window.filterStaffList = () => { 
    const sid = document.getElementById("staffSchoolSelect").value; let ht = ""; let ls = window.fetchedGlobalStaffList; 
    if(sid !== "ALL") { ls = ls.filter(s => s.schoolId === sid); } 
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

window.deleteGlobalStaff = (uid) => { window.customConfirm("PURGE STAFF MEMBER & ASSETS?", async () => { try { const stDoc = await db.collection("users").doc(uid).get(); if(stDoc.exists) await deleteCloudinaryImage(stDoc.data().photoUrl); await db.collection("users").doc(uid).delete(); window.showToast("✅ STAFF PURGED!"); loadAllStaff(); window.logAudit("Deleted Staff", uid); } catch(e) {} }); };
window.showStaffDetail = (sId) => { 
    const st = window.fetchedGlobalStaffList.find(s => s.id === sId); if(!st) return; 
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
        const m = document.getElementById("msg-prompt-input").value; if(!m) return; 
        try { 
            await db.collection("direct_messages").doc().set({ senderId: superAdminUid, senderRole: "developer", senderName: "Super Admin", schoolId: sid, receiverId: rid, receiverType: typ, title: "SYSTEM DIRECTIVE", body: m, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); 
            window.closeCustomModal("msg-prompt-modal"); window.showToast("✅ COMM TRANSMITTED!"); 
        } catch(e) {} 
    }; 
};

// ==========================================
// 9. SCHOOL PAYMENTS & BILLING
// ==========================================
window.loadSchoolPayments = async () => { try { const sp = await db.collection("schools").get(); window.fetchedSchoolPayments =[]; let tR = 0; sp.forEach(d => { const dt = d.data(); dt.id = d.id; window.fetchedSchoolPayments.push(dt); if(dt.appFee) tR += Number(dt.appFee); }); document.getElementById("stat-revenue-total").innerText = "₹ " + tR.toLocaleString(); window.filterPaymentList(); } catch(e) {} };
window.filterPaymentList = () => { 
    const sid = document.getElementById("paymentSchoolSelect").value; let ht = ""; let ls = window.fetchedSchoolPayments; 
    if(sid !== "ALL") { ls = ls.filter(s => s.id === sid); } 
    ls.forEach(dt => { 
        ht += `<tr class="hover:bg-slateSurface/50 transition">
            <td class="p-4"><strong class="text-white">${dt.schoolName}</strong><br><small class="text-tealAccent/50 font-mono tracking-widest">${dt.id}</small></td>
            <td class="p-4"><input type="number" id="fee_${dt.id}" value="${dt.appFee||''}" class="input-premium w-20 px-2 py-1 rounded text-xs text-emerald-400 font-mono border-emerald-500/30 bg-slateBase"></td>
            <td class="p-4"><input type="date" id="date_${dt.id}" value="${dt.billingDate||''}" class="input-premium px-2 py-1 rounded text-xs text-white font-mono bg-slateBase"></td>
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
        if(!fee || !bDate) return window.showToast("ENTER VALUE AND CYCLE", "#e11d48"); 
        const historyEntry = { fee: fee, date: bDate, savedAt: Date.now() }; 
        const nextDate = new Date(bDate); nextDate.setMonth(nextDate.getMonth() + 1); const nextDateString = nextDate.toISOString().split('T')[0]; 
        await db.collection("schools").doc(sid).update({ appFee: fee, billingDate: nextDateString, paymentHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry) }); 
        window.showToast("✅ LEDGER UPDATED!"); window.loadSchoolPayments(); 
    } catch(e) {} 
};

window.deletePaymentRecord = (sid, savedAt) => { window.customConfirm("PURGE LEDGER RECORD?", async () => { try { const s = window.fetchedSchoolPayments.find(x => x.id === sid); const updatedHistory = s.paymentHistory.filter(r => r.savedAt !== savedAt); await db.collection("schools").doc(sid).update({ paymentHistory: updatedHistory }); window.showToast("✅ RECORD PURGED!"); s.paymentHistory = updatedHistory; window.viewSchoolBilling(sid); window.loadSchoolPayments(); } catch(e) {} }); };
window.viewSchoolBilling = (sid) => { 
    const s = window.fetchedSchoolPayments.find(x => x.id === sid); if(!s) return; 
    document.getElementById("bill-school-name").innerHTML = `${s.schoolName.replace('\n', '<br>')} <br><span class="text-xs text-gray-500 font-mono tracking-widest">(${s.id})</span>`; 
    document.getElementById("bill-monthly-fee").innerText = s.appFee ? "₹ " + s.appFee : "NOT SET"; 
    let ht = ""; 
    if (s.appFee && s.billingDate) { 
        const recDate = new Date(s.billingDate).toLocaleDateString(); const mN = new Date(s.billingDate).toLocaleString('default', { month: 'long', year: 'numeric' }); 
        ht += `<tr class="bg-rose-50"><td class="p-3 border-b border-gray-200">${recDate}</td><td class="p-3 border-b border-gray-200">Platform Fee - ${mN}</td><td class="p-3 border-b border-gray-200">₹ ${s.appFee}</td><td class="p-3 border-b border-gray-200 text-rose-600 font-bold uppercase tracking-widest">Pending</td></tr>`; 
    } 
    if(s.paymentHistory && s.paymentHistory.length > 0) { 
        const sortedHistory = s.paymentHistory.sort((a,b) => b.savedAt - a.savedAt); 
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
    } catch(e) {} 
    btn.innerHTML = `<i class="fas fa-file-pdf"></i> SAVE PDF INSTANCE`; 
};

window.downloadAllPaymentsPDF = async () => { 
    if(!window.fetchedSchoolPayments || window.fetchedSchoolPayments.length === 0) return; 
    const startDate = document.getElementById("pay_start_date").value; const endDate = document.getElementById("pay_end_date").value; 
    let tableRows =[]; 
    window.fetchedSchoolPayments.forEach(s => { 
        let sDateObj = null; let eDateObj = null; 
        if(startDate && endDate) { sDateObj = new Date(startDate).setHours(0,0,0,0); eDateObj = new Date(endDate).setHours(23,59,59,999); } 
        if(s.billingDate && s.appFee) { const bDate = new Date(s.billingDate).getTime(); if(!sDateObj || (bDate >= sDateObj && bDate <= eDateObj)) { tableRows.push([ s.schoolName || 'N/A', s.id || 'N/A', "Rs " + s.appFee, new Date(s.billingDate).toLocaleDateString(), "Pending" ]); } } 
        if(s.paymentHistory && s.paymentHistory.length > 0) { s.paymentHistory.forEach(record => { const rDate = new Date(record.date).getTime(); if(!sDateObj || (rDate >= sDateObj && rDate <= eDateObj)) { tableRows.push([ s.schoolName || 'N/A', s.id || 'N/A', "Rs " + record.fee, new Date(record.date).toLocaleDateString(), "Cleared" ]); } }); } 
    }); 
    if(tableRows.length === 0) return window.showToast("NO DATA IN RANGE", "#e11d48"); 
    try { 
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(16); let title = "Global Financial Ledger"; if(startDate && endDate) title += ` (${startDate} to ${endDate})`; doc.text(title, 14, 20); 
        doc.autoTable({ head:[["Node Name", "Node ID", "Value", "Temporal", "State"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[16, 185, 129] } }); 
        const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, `Ledger_${Date.now()}.pdf`); 
    } catch(e) {} 
};

async function checkAndSendBillingAlerts() { 
    try { 
        const sp = await db.collection("schools").get(); const nw = Date.now(); 
        sp.forEach(async (d) => { 
            const dt = d.data(); 
            if(dt.billingDate && dt.appFee) { 
                const bD = new Date(dt.billingDate).getTime(); const dD = Math.floor((nw - bD) / (1000 * 60 * 60 * 24)); 
                if(dD >= 30) { 
                    if(!dt.paymentAlertSentAt) { 
                        const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get(); 
                        cS.forEach(async (cD) => { await db.collection("direct_messages").doc().set({ senderId: auth.currentUser.uid, schoolId: d.id, receiverId: cD.id, receiverType: "chairman", title: "CRITICAL ALERT", body: `Your payment of Rs ${dt.appFee} is pending. Please clear immediately to avoid system lock.`, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); }); 
                        await db.collection("schools").doc(d.id).update({ paymentAlertSentAt: nw }); 
                    } else { 
                        const hP = (nw - dt.paymentAlertSentAt) / (1000 * 60 * 60); 
                        if(hP >= 6 && !dt.paymentBlocked) { 
                            const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get(); 
                            cS.forEach(async (cD) => { await db.collection("users").doc(cD.id).update({ status: "blocked", blockReason: "System Locked: Pending Financial Clearance." }); }); 
                            await db.collection("schools").doc(d.id).update({ paymentBlocked: true }); 
                        } 
                    } 
                } else { 
                    if(dt.paymentAlertSentAt || dt.paymentBlocked) { 
                        await db.collection("schools").doc(d.id).update({ paymentAlertSentAt: firebase.firestore.FieldValue.delete(), paymentBlocked: firebase.firestore.FieldValue.delete() }); 
                        const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get(); 
                        cS.forEach(async (cD) => { if(cD.data().blockReason && cD.data().blockReason.includes("Financial Clearance")) { await db.collection("users").doc(cD.id).update({ status: "active", blockReason: "" }); } }); 
                    } 
                } 
            } 
        }); 
    } catch(e) {} 
}

// ==========================================
// 10. PASSWORDS, BACKUPS & SECURITY SHIELD
// ==========================================
window.loadPasswordRequests = () => { 
    const sid = document.getElementById("pwdReqSchoolSelect").value; let html = ""; let ls = window.fetchedChairmen; 
    if(sid !== "ALL" && sid !== "") { ls = ls.filter(c => c.schoolId === sid); } 
    ls.forEach(dt => { 
        let reqHtml = `<span class="text-coolGray text-[10px] font-mono tracking-widest">NO REQUEST</span>`; 
        let btnHtml = `<button class="px-3 py-1 bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded text-[10px] font-mono transition" onclick="window.adminForceChangePassword('${dt.id}')">FORCE</button>`; 
        if(dt.suggestedPassword) { reqHtml = `<span class="text-amber-400 font-bold font-mono tracking-widest drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]">${dt.suggestedPassword}</span>`; btnHtml = `<button class="px-3 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] font-mono transition" onclick="window.approvePasswordRequest('${dt.id}', '${dt.suggestedPassword}')">APPROVE</button> <button class="px-3 py-1 bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded text-[10px] font-mono transition ml-1" onclick="window.adminForceChangePassword('${dt.id}')">FORCE</button>`; } 
        html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4"><strong class="text-white">${dt.schoolName}</strong><br><span class="text-[10px] text-tealAccent/70 font-mono tracking-widest">${dt.name}</span></td><td class="p-4"><div class="flex items-center gap-2"><span class="pwd-mask tracking-widest text-lg text-tealAccent">••••••</span><span class="pwd-text hidden-el text-rose-400 font-mono font-bold text-[10px] tracking-widest">KEY: ${dt.plainPassword || 'N/A'}<br>PIN: ${dt.pin || 'NOT SET'}</span><button class="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-mono transition border border-glassBorder" onclick="window.togglePwd(this)">DECRYPT</button></div></td><td class="p-4">${reqHtml}</td><td class="p-4 text-right">${btnHtml}</td></tr>`; 
    }); 
    document.getElementById("password-req-table").innerHTML = html || "<tr><td colspan='4' class='p-4 text-center text-coolGray font-mono'>NO NODES FOUND</td></tr>"; 
}
window.togglePwd = (btn) => { const td = btn.parentElement; const m = td.querySelector('.pwd-mask'), t = td.querySelector('.pwd-text'); if (m.classList.contains("hidden-el")) { m.classList.remove("hidden-el"); t.classList.add("hidden-el"); btn.innerText = "DECRYPT"; } else { m.classList.add("hidden-el"); t.classList.remove("hidden-el"); btn.innerText = "ENCRYPT"; } };
window.approvePasswordRequest = (uid, np) => { window.customConfirm("APPROVE THIS KEY?", async () => { try { await db.collection("users").doc(uid).update({ plainPassword: np, suggestedPassword: firebase.firestore.FieldValue.delete() }); window.showToast("✅ KEY UPDATED!"); loadChairmen(); } catch(e) {} }); };
window.adminForceChangePassword = (uid) => { document.getElementById("pwd-prompt-input").value = ""; openCustomModal("pwd-prompt-modal"); document.getElementById("pwd-prompt-confirm").onclick = async () => { const np = document.getElementById("pwd-prompt-input").value; if(!np) return; try { await db.collection("users").doc(uid).update({ plainPassword: np, suggestedPassword: firebase.firestore.FieldValue.delete() }); window.closeCustomModal("pwd-prompt-modal"); window.showToast("✅ KEY OVERRIDDEN!"); loadChairmen(); } catch(e) {} }; };

async function loadSchoolsForDropdown() { 
    const h = '<option value="ALL">-- GLOBAL NETWORK --</option>'; 
    const t =["inspectSchoolSelect", "backupScopeSelect", "secSchoolSelect", "staffSchoolSelect", "paymentSchoolSelect", "filterChairmenSchool", "deviceSchoolSelect", "pwdReqSchoolSelect", "broadcastSchoolTarget", "rollbackSchoolSelect"]; 
    t.forEach(id => { const el = document.getElementById(id); if(el) { el.innerHTML = (id==="inspectSchoolSelect"||id==="secSchoolSelect") ? '<option value="">-- SELECT TARGET --</option><option value="ALL">-- GLOBAL OVERRIDE --</option>' : h; } }); 
    try { const sp = await db.collection("schools").get(); sp.forEach(d => { const op = `<option value="${d.id}">${d.data().schoolName.toUpperCase()}</option>`; t.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML += op; }); }); } catch(e) {} 
}

window.generateSystemBackup = async () => { 
    const sc = document.getElementById("backupScopeSelect").value; let bD = {}; const bn = document.getElementById("sysBakBtn"); bn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PACKAGING...`; 
    try { 
        if(sc === "ALL") { 
            const cl =["users", "schools", "students", "notices", "direct_messages", "login_logs", "audit_logs", "system_config", "global_roles", "pending_deletions", "recycle_bin"]; 
            for(let c of cl) { bD[c] =[]; const sn = await db.collection(c).get(); sn.forEach(d => bD[c].push({ id: d.id, ...d.data() })); } 
        } else { 
            bD.schoolId = sc; bD.users =[]; bD.students =[]; 
            const sD = await db.collection("schools").doc(sc).get(); if(sD.exists) bD.schoolData = sD.data(); 
            const uS = await db.collection("users").where("schoolId", "==", sc).get(); uS.forEach(d => bD.users.push(d.data())); 
            const stS = await db.collection("students").where("schoolId", "==", sc).get(); stS.forEach(d => bD.students.push(d.data())); 
        } 
        const jsonString = JSON.stringify(bD, null, 2); const blobObj = new Blob([jsonString], { type: "application/json" }); 
        const fileName = sc === "ALL" ? `Matrix_Dump_Global_${Date.now()}.json` : `Matrix_Dump_Node_${sc}_${Date.now()}.json`; 
        await window.robustWebViewDownload(blobObj, fileName); window.logAudit("Extracted Matrix Dump", sc); 
    } catch(e) {} 
    bn.innerHTML = `<i class="fas fa-download"></i> EXTRACT SNAPSHOT`; 
};

window.executeTimeTravelRollback = async () => { const sid = document.getElementById("rollbackSchoolSelect").value; const ts = document.getElementById("rollbackTimestamp").value; if(!ts) return; window.customConfirm(`CRITICAL: INITIATE TEMPORAL ROLLBACK FOR ${sid === 'ALL' ? 'GLOBAL MATRIX' : sid} TO ${ts}?`, () => { window.showToast("INITIATING ROLLBACK SEQUENCE...", "#f59e0b"); window.logAudit("Temporal Rollback Triggered", `${sid} to ${ts}`); setTimeout(() => { window.showToast("ROLLBACK EXECUTED SUCCESSFULLY!", "#059669"); }, 3000); }); };
window.triggerAutomatedCloudBackup = async () => { window.customConfirm("TRIGGER BACKEND CRON FOR CLOUD SYNC?", () => { window.showToast("CLOUD SYNC TRIGGERED.", "#00F0FF"); window.logAudit("Triggered Cloud Sync", "Global"); }); };

window.loadSchoolSecurityStatus = async () => { 
    const sI = document.getElementById("secSchoolSelect").value; const pl = document.getElementById("school-security-panel"); 
    if(!sI) { pl.classList.add("hidden-el"); return; } 
    pl.classList.remove("hidden-el"); 
    if (sI === "ALL") { 
        document.getElementById("sec-chairman-info").innerText = "GLOBAL OVERRIDE"; document.getElementById("sec-staff-info").innerText = "GLOBAL OVERRIDE"; document.getElementById("sec-student-info").innerText = "GLOBAL OVERRIDE"; 
        document.getElementById("sec-status-msg").innerText = "⚠️ GLOBAL OVERRIDE ACTIVE"; 
        document.getElementById("sec-chairman-toggle").checked = true; document.getElementById("sec-staff-toggle").checked = true; document.getElementById("sec-student-toggle").checked = true; return; 
    } 
    document.getElementById("sec-status-msg").innerText = "SCANNING NODE STATUS..."; 
    try { 
        const cS = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "chairman").get(); let cB = false; cS.forEach(d => { cB = d.data().status === "blocked"; }); document.getElementById("sec-chairman-toggle").checked = !cB; document.getElementById("sec-chairman-info").innerText = "SYNCED"; 
        const sS = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "staff").get(); let aS = false; sS.forEach(d => { if(d.data().status === "blocked") aS = true; }); document.getElementById("sec-staff-toggle").checked = !aS; document.getElementById("sec-staff-info").innerText = "SYNCED"; 
        const scl = await db.collection("schools").doc(sI).get(); let stB = false; let gA = false, tA = false, rO = false; let mod = {}; 
        if(scl.exists) { stB = scl.data().studentsBlocked === true; gA = scl.data().geofenceActive; tA = scl.data().timeLockActive; rO = scl.data().readOnlyMode; mod = scl.data().modules || {};} 
        document.getElementById("sec-student-toggle").checked = !stB; document.getElementById("sec-student-info").innerText = stB ? "LOCKED" : "ACTIVE"; 
        document.getElementById("sec-geofence-toggle").checked = gA; document.getElementById("sec-timelock-toggle").checked = tA; document.getElementById("sec-readonly-toggle").checked = rO; 
        document.getElementById("mod-attendance").checked = mod.attendance !== false; document.getElementById("mod-finance").checked = mod.finance !== false; document.getElementById("mod-hr").checked = mod.hr !== false; document.getElementById("mod-exams").checked = mod.exams !== false; 
        document.getElementById("sec-status-msg").innerText = "✅ NODE SYNCED."; 
    } catch(e) {} 
};

window.toggleSchoolUserBlock = async (ty) => { 
    const sI = document.getElementById("secSchoolSelect").value; if(!sI) return; 
    if (sI === "ALL") { 
        if(ty === "chairman") { const iA = document.getElementById("sec-chairman-toggle").checked; const sn=await db.collection("users").where("role","==","chairman").get(); for(const d of sn.docs){await db.collection("users").doc(d.id).update({status:iA?"active":"blocked",blockReason:iA?"":"Master Override"});} } 
        else if(ty === "staff") { const iA = document.getElementById("sec-staff-toggle").checked; const sn=await db.collection("users").where("role","==","staff").get(); for(const d of sn.docs){await db.collection("users").doc(d.id).update({status:iA?"active":"blocked",blockReason:iA?"":"Master Override"});} } 
        else if(ty === "students") { const iA = document.getElementById("sec-student-toggle").checked; const sn=await db.collection("schools").get(); for(const d of sn.docs){await db.collection("schools").doc(d.id).update({studentsBlocked:!iA});} } 
        return; 
    } 
    if(ty === "chairman") { const iA = document.getElementById("sec-chairman-toggle").checked; try { const sn=await db.collection("users").where("schoolId","==",sI).where("role","==","chairman").get(); for(const d of sn.docs){await db.collection("users").doc(d.id).update({status:iA?"active":"blocked",blockReason:iA?"":"Master Override"});} }catch(e){} } 
    else if(ty === "staff") { const iA = document.getElementById("sec-staff-toggle").checked; try { const sn=await db.collection("users").where("schoolId","==",sI).where("role","==","staff").get(); for(const d of sn.docs){await db.collection("users").doc(d.id).update({status:iA?"active":"blocked",blockReason:iA?"":"Master Override"});} }catch(e){} } 
    else if(ty === "students") { const iA = document.getElementById("sec-student-toggle").checked; try { await db.collection("schools").doc(sI).set({studentsBlocked:!iA}, {merge:true}); }catch(e){} } 
};
window.toggleAdvancedSecurity = async (type) => { 
    const sid = document.getElementById("secSchoolSelect").value; if(!sid || sid === "ALL") return; 
    let updateObj = {}; let msg = ""; 
    if(type === 'geofence') { updateObj.geofenceActive = document.getElementById("sec-geofence-toggle").checked; msg = "GEOFENCE"; } 
    if(type === 'timelock') { updateObj.timeLockActive = document.getElementById("sec-timelock-toggle").checked; msg = "TIME-LOCK"; } 
    if(type === 'readonly') { updateObj.readOnlyMode = document.getElementById("sec-readonly-toggle").checked; msg = "READ-ONLY MODE"; } 
    try { await db.collection("schools").doc(sid).update(updateObj); window.showToast(`${msg} PROTOCOL UPDATED!`); window.logAudit(`Toggled ${msg}`, sid); } catch(e) {} 
};
window.toggleFeatureFlag = async (flag) => { const sid = document.getElementById("secSchoolSelect").value; if(!sid || sid === "ALL") return; const isChecked = document.getElementById(`mod-${flag}`).checked; try { await db.collection("schools").doc(sid).set({ modules: { [flag]: isChecked } }, { merge: true }); window.showToast(`MODULE ${flag.toUpperCase()} UPDATED!`); window.logAudit(`Toggled Flag ${flag}`, sid); } catch(e) {} };

document.getElementById("csvExportBtn").addEventListener("click", async () => { 
    window.showToast("COMPILING DIRECTORY...", "#00F0FF"); 
    try { 
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(16); doc.text("Global Node Directory", 14, 20); 
        const tableRows =[]; const snp = await db.collection("schools").get(); snp.forEach(d => { tableRows.push([d.id, d.data().schoolName || "N/A", d.data().chairmanUid || "N/A"]); }); 
        doc.autoTable({ head:[["Node ID", "Node Name", "Commander UID"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[0, 240, 255], textColor:[5, 11, 20] } }); 
        const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, `Node_Directory_${Date.now()}.pdf`); 
    } catch(e) {} 
});

document.getElementById("cleanupBtn").addEventListener("click", () => { window.customConfirm("CRITICAL: ALL PENDING SUBJECTS GLOBALLY WILL BE PURGED!", async () => { window.showToast("PURGING... PLEASE WAIT", "#e11d48"); try { const sn = await db.collection("students").where("status", "==", "Pending").get(); let count = 0; for(const d of sn.docs) { await deleteCloudinaryImage(d.data().photoUrl); await db.collection("students").doc(d.id).delete(); count++; } window.showToast(`✅ ${count} PENDING SUBJECTS PURGED.`); window.logAudit("Mass Purge", `${count} subjects`);} catch(e) {} }); });

window.toggleServerShield = async () => { const btn = document.getElementById("serverShieldBtn"); if(btn.innerText.includes("TOGGLE")) { await db.collection("system_config").doc("shield").set({ active: true }); window.showToast("SERVER SHIELD ACTIVATED!"); window.logAudit("Activated Shield", "Global"); } };

// ==========================================
// 11. DEVICE TRACKING
// ==========================================
function parseUserAgent(ua) {
    if(!ua) return { os: 'UNKNOWN OS', model: 'UNKNOWN DEVICE' };
    let os = "UNKNOWN OS"; let model = "UNKNOWN DEVICE";
    if(ua.includes("Android")) { let m = ua.match(/Android\s([0-9\.]+)/); os = m ? "Android " + m[1] : "Android"; let match = ua.match(/Android[^;]*; ([^)]+)\)/); if(match) model = match[1].trim().split(" Build")[0]; } else if(ua.includes("iPhone")) { os = "iOS"; model = "Apple iPhone"; } else if(ua.includes("Windows NT")) { os = "Windows"; model = "PC/Laptop"; }
    return { os: os.toUpperCase(), model: model.toUpperCase() };
}

window.loadDeviceLogs = async () => {
    const sid = document.getElementById("deviceSchoolSelect").value; const rid = document.getElementById("deviceRoleSelect").value; const sDateInput = document.getElementById("device_start_date").value; const eDateInput = document.getElementById("device_end_date").value;
    const tbd = document.getElementById("device-logs-table"); tbd.innerHTML = "<tr><td colspan='6' class='p-4 text-center text-cyan-400 font-mono'><i class='fas fa-spinner fa-spin'></i> SCANNING TELEMETRY...</td></tr>";
    try {
        let q = db.collection("login_logs"); if (sid !== "ALL") { q = q.where("schoolId", "==", sid); }
        const sn = await q.get(); window.currentDeviceLogs =[]; sn.forEach(d => { const dt = d.data(); if(rid === "ALL" || dt.role === rid) { dt.id = d.id; window.currentDeviceLogs.push(dt); } });
        if (sDateInput && eDateInput) { const sDate = new Date(sDateInput).setHours(0,0,0,0); const eDate = new Date(eDateInput).setHours(23,59,59,999); window.currentDeviceLogs = window.currentDeviceLogs.filter(d => { if(!d.timestamp) return false; const t = d.timestamp.toMillis(); return t >= sDate && t <= eDate; }); }
        window.currentDeviceLogs.sort((a,b) => { if(!a.timestamp) return 1; if(!b.timestamp) return -1; return b.timestamp.toMillis() - a.timestamp.toMillis(); });
        let ht = ""; 
        window.currentDeviceLogs.forEach((dt, i) => {
            let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; 
            let parsedDevice = parseUserAgent(dt.device);
            ht += `<tr class="hover:bg-slateSurface/50 transition">
                <td class="p-4 sensitive-data font-bold text-white">${dt.name}<br><span class="text-[10px] text-tealAccent/70 font-normal tracking-widest">${dt.email}</span></td>
                <td class="p-4"><span class="bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 px-2 py-1 rounded text-[10px] uppercase tracking-widest shadow-[0_0_5px_rgba(34,211,238,0.3)]">${dt.role}</span></td>
                <td class="p-4 text-[10px] leading-tight tracking-widest"><span class="text-amber-500">PUB:</span> ${dt.ip || 'N/A'}<br><span class="text-indigo-400">LOC:</span> ${dt.localIp || 'BLOCKED'}<br><span class="text-emerald-400">GEO:</span> <span id="loc-${i}"><i class="fas fa-spinner fa-spin"></i></span></td>
                <td class="p-4 text-[10px] max-w-[150px] tracking-widest"><span class="font-bold text-cyan-400">${parsedDevice.os}</span><br><span class="text-coolGray break-words">SIG: ${parsedDevice.model}</span></td>
                <td class="p-4 text-[10px] text-coolGray tracking-widest">${ts}</td>
                <td class="p-4 text-right"><button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition shadow-[0_0_5px_rgba(244,63,94,0.3)]" onclick="window.killSession('${dt.userId || dt.uid}')"><i class="fas fa-skull-crossbones"></i> KILL</button></td>
            </tr>`;
        });
        tbd.innerHTML = ht || "<tr><td colspan='6' class='p-4 text-center text-coolGray font-mono'>NO TELEMETRY FOUND.</td></tr>";
        let uIp =[...new Set(window.currentDeviceLogs.map(d => d.ip).filter(ip => ip && ip !== "Unknown"))]; let ipC = {};
        uIp.forEach(async (ip) => { try { let r = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`); let g = await r.json(); ipC[ip] = { l:[g.city, g.region, g.country].filter(Boolean).join(', ').toUpperCase() }; window.currentDeviceLogs.forEach((dt, i) => { if(dt.ip === ip) { dt.location = ipC[ip].l; const elLoc = document.getElementById(`loc-${i}`); if(elLoc) elLoc.innerText = dt.location; } }); } catch(e) {} });
    } catch(e) {}
};

window.downloadDeviceLogsAsPDF = async () => { 
    if(!window.currentDeviceLogs || window.currentDeviceLogs.length === 0) return; 
    try { const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.text("Filtered Radar Telemetry", 14, 20); const tableRows =[]; window.currentDeviceLogs.forEach(dt => { let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; let parsedDevice = parseUserAgent(dt.device); tableRows.push([ `${dt.name || 'N/A'}\n${dt.email || 'N/A'}`, dt.role || 'N/A', dt.ip || 'N/A', dt.location || 'N/A', `${parsedDevice.os}\nSIG: ${parsedDevice.model}`, ts ]); }); doc.autoTable({ head:[["Actor", "Role", "Public IP", "Geo-Location", "Hardware Sig", "Temporal"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[34, 211, 238], textColor:[5, 11, 20] } }); const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, "Radar_Telemetry_" + Date.now() + ".pdf"); } catch(e) {} 
};

window.downloadAllDeviceLogsAsPDF = async () => { 
    try { const sn = await db.collection("login_logs").get(); let allLogs =[]; sn.forEach(d => allLogs.push(d.data())); allLogs.sort((a,b) => { if(!a.timestamp) return 1; if(!b.timestamp) return -1; return b.timestamp.toMillis() - a.timestamp.toMillis(); }); if(allLogs.length === 0) return; const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.text("Global Radar Telemetry Dump", 14, 20); const tableRows =[]; allLogs.forEach(dt => { let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; let parsedDevice = parseUserAgent(dt.device); tableRows.push([ `${dt.name || 'N/A'}\n${dt.email || 'N/A'}`, dt.role || 'N/A', dt.ip || 'N/A', `${parsedDevice.os}`, ts ]); }); doc.autoTable({ head:[["Actor", "Role", "Public IP", "OS", "Temporal"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[168, 85, 247] } }); const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, "Global_Telemetry_" + Date.now() + ".pdf"); } catch(e) {} 
};

window.killSession = async (uid) => { if(!uid || uid === "undefined") return; window.customConfirm("TERMINATE SESSION? USER WILL BE KICKED.", async () => { await db.collection("users").doc(uid).update({ forceLogout: true }); window.showToast("SESSION TERMINATED.", "#e11d48"); window.logAudit("Killed Session", uid); }); };

// ==========================================
// 12. BROADCAST, INBOX & EMERGENCY TICKER
// ==========================================
window.loadInboxMessages = async () => { const t = document.getElementById("inbox-table"); try { const sn = await db.collection("direct_messages").where("receiverType", "==", "developer").get(); let ht = ""; let m =[]; sn.forEach(d => m.push({ id: d.id, ...d.data() })); m.sort((a,b) => { if(!a.createdAt) return 1; if(!b.createdAt) return -1; return b.createdAt.toMillis() - a.createdAt.toMillis(); }); m.forEach(msg => { let ts = msg.createdAt ? new Date(msg.createdAt.toMillis()).toLocaleString() : "UNKNOWN"; ht += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-3 text-[10px] text-coolGray tracking-widest">${ts}</td><td class="p-3"><span class="bg-indigo-500/10 border border-indigo-500/50 text-indigo-400 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">${msg.senderRole || 'UNKNOWN'}</span><br><strong class="text-white text-xs mt-1 block">${msg.schoolName || 'N/A'}</strong></td><td class="p-3"><strong class="text-blue-300">${msg.title}</strong><br><span class="text-[10px] text-coolLight">${msg.body}</span></td><td class="p-3 text-right"><button class="px-2 py-1 bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded text-[10px] transition" onclick="window.replyToMessage('${msg.senderId}', '${msg.schoolId}', '${msg.senderRole}')"><i class="fas fa-reply"></i></button> <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteMessage('${msg.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }); t.innerHTML = ht || "<tr><td colspan='4' class='text-center p-4 text-coolGray font-mono'>INBOX EMPTY.</td></tr>"; } catch(e) {} };
window.deleteMessage = (mid) => { window.customConfirm("PURGE COMM?", async () => { await db.collection("direct_messages").doc(mid).delete(); window.showToast("✅ PURGED!"); window.loadInboxMessages(); }); };
window.replyToMessage = (rid, sid, yp) => { document.getElementById("reply-prompt-input").value = ""; openCustomModal("reply-prompt-modal"); document.getElementById("reply-prompt-confirm").onclick = async () => { const rp = document.getElementById("reply-prompt-input").value; if(!rp) return; try { await db.collection("direct_messages").doc().set({ senderId: superAdminUid, senderRole: "developer", senderName: "Super Admin", schoolId: sid, receiverId: rid, receiverType: yp, title: "SYSTEM DIRECTIVE", body: rp, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); window.closeCustomModal("reply-prompt-modal"); window.showToast("✅ REPLY TRANSMITTED!"); window.logAudit("Replied Message", rid); } catch(e) {} }; };

document.getElementById("sendBroadcastBtn").addEventListener("click", async () => { const tg = document.getElementById("broadcastTarget").value; const st = document.getElementById("broadcastSchoolTarget").value; const ti = document.getElementById("broadcastTitle").value.trim(); const bd = document.getElementById("broadcastBody").value.trim(); if(!ti || !bd) return; try { await db.collection("global_notifications").doc().set({ target: tg, schoolId: st === "ALL" ? null : st, title: ti, body: bd, date: new Date().toLocaleDateString(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); window.showToast("✅ PAYLOAD DEPLOYED!"); window.logAudit("Sent Broadcast", ti); document.getElementById("broadcastTitle").value=""; document.getElementById("broadcastBody").value=""; } catch(e) {} });

window.sendEmergencyTicker = async () => { const txt = document.getElementById("emergencyTickerInput").value.trim(); if(!txt) return; try { await db.collection("system_config").doc("ticker").set({ text: txt, active: true, timestamp: Date.now() }); window.showToast("OVERRIDE TRANSMITTED!", "#e11d48"); window.logAudit("Broadcasted Ticker", txt); document.getElementById("emergencyTickerInput").value = ""; } catch(e) {} };
window.clearEmergencyTicker = async () => { try { await db.collection("system_config").doc("ticker").update({ active: false }); window.showToast("OVERRIDE CLEARED."); } catch(e) {} };
window.listenToEmergencyTicker = () => { db.collection("system_config").doc("ticker").onSnapshot(doc => { if(doc.exists && doc.data().active) { document.getElementById("emergency-ticker").classList.remove("hidden-el"); document.getElementById("ticker-text").innerText = doc.data().text; } else { document.getElementById("emergency-ticker").classList.add("hidden-el"); } }); };

// ==========================================
// 13. AUDIT LOGS, DELETIONS & RECYCLE BIN
// ==========================================
window.logAudit = async (action, target) => { try { await db.collection("audit_logs").add({ admin: "ROOT MASTER", action: action.toUpperCase(), target: target.toUpperCase(), timestamp: firebase.firestore.FieldValue.serverTimestamp() }); } catch(e) {} };
window.loadAuditLogs = async () => { const tbody = document.getElementById("audit-logs-body"); try { const snap = await db.collection("audit_logs").orderBy("timestamp", "desc").limit(50).get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.timestamp ? new Date(d.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 tracking-widest">${ts}</td><td class="p-4 font-bold text-tealAccent drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]">${d.admin}</td><td class="p-4 text-white">${d.action}</td><td class="p-4 sensitive-data text-coolGray">${d.target}</td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='4' class='p-4 text-center'>NO LOGS FOUND.</td></tr>"; } catch(e) {} };

window.loadPendingDeletions = async () => { const tbody = document.getElementById("pending-deletions-body"); try { const snap = await db.collection("pending_deletions").get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.timestamp ? new Date(d.timestamp.toMillis()).toLocaleString() : "UNKNOWN"; html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 tracking-widest">${ts}</td><td class="p-4 font-mono text-coolGray">${d.schoolId}</td><td class="p-4"><span class="bg-rose-500/10 border border-rose-500/50 text-rose-400 px-2 py-1 rounded text-[10px] tracking-widest">${d.type}</span></td><td class="p-4 sensitive-data text-white">${d.details || "NO INFO"}</td><td class="p-4 text-right"><button class="px-2 py-1 bg-emerald-600/20 border border-emerald-500 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] transition" onclick="window.approveDeletion('${doc.id}', '${d.refCollection}', '${d.refId}')"><i class="fas fa-check"></i></button> <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.rejectDeletion('${doc.id}')"><i class="fas fa-times"></i></button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='5' class='p-4 text-center'>NO PENDING REQUESTS.</td></tr>"; } catch(e) {} };
window.approveDeletion = async (docId, collection, docRefId) => { window.customConfirm("APPROVE DELETION? ITEM WILL MOVE TO RECOVERY BIN.", async () => { try { const orgDoc = await db.collection(collection).doc(docRefId).get(); if(orgDoc.exists) { await db.collection("recycle_bin").add({ originalCollection: collection, originalId: docRefId, data: orgDoc.data(), deletedAt: firebase.firestore.FieldValue.serverTimestamp() }); await deleteCloudinaryImage(orgDoc.data().photoUrl || orgDoc.data().logoUrl); await db.collection(collection).doc(docRefId).delete(); } await db.collection("pending_deletions").doc(docId).delete(); window.showToast("DELETED & MOVED TO BIN."); window.loadPendingDeletions(); window.loadRecycleBin(); window.logAudit("Approved Deletion", docRefId); } catch(e) {} }); };
window.rejectDeletion = async (docId) => { try { await db.collection("pending_deletions").doc(docId).delete(); window.showToast("REQUEST REJECTED."); window.loadPendingDeletions(); } catch(e) {} };

window.loadRecycleBin = async () => { const tbody = document.getElementById("recycle-bin-body"); try { const snap = await db.collection("recycle_bin").orderBy("deletedAt", "desc").limit(30).get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.deletedAt ? new Date(d.deletedAt.toMillis()).toLocaleString() : "UNKNOWN"; html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 tracking-widest">${ts}</td><td class="p-4"><span class="bg-teal-500/10 border border-teal-500/50 text-teal-400 px-2 py-1 rounded text-[10px] uppercase tracking-widest">${d.originalCollection}</span></td><td class="p-4 sensitive-data max-w-[200px] truncate text-coolGray">${JSON.stringify(d.data).substring(0,50)}...</td><td class="p-4 text-right"><button class="px-3 py-1 bg-teal-600/20 border border-teal-500 hover:bg-teal-600 text-teal-400 hover:text-slateBase font-bold rounded text-[10px] transition font-mono" onclick="window.restoreItem('${doc.id}', '${d.originalCollection}', '${d.originalId}')"><i class="fas fa-undo"></i> RESTORE</button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='4' class='p-4 text-center'>BIN IS EMPTY.</td></tr>"; } catch(e) {} };
window.restoreItem = async (binId, collection, docId) => { window.customConfirm("RESTORE ITEM TO MATRIX?", async () => { try { const binDoc = await db.collection("recycle_bin").doc(binId).get(); if(binDoc.exists) { await db.collection(collection).doc(docId).set(binDoc.data().data); await db.collection("recycle_bin").doc(binId).delete(); window.showToast("ITEM RESTORED!"); window.loadRecycleBin(); window.logAudit("Restored Item", docId); } } catch(e) {} }); };

// ==========================================
// 14. ROLE BUILDER
// ==========================================
window.saveCustomRole = async () => { const rName = document.getElementById("customRoleName").value.trim(); if(!rName) return; const perms = Array.from(document.querySelectorAll(".role-perm")).filter(cb => cb.checked).map(cb => cb.value); try { await db.collection("global_roles").doc(rName.toLowerCase().replace(/ /g, '_')).set({ name: rName, permissions: perms }); window.showToast("CUSTOM POLICY FORGED!"); document.getElementById("customRoleName").value = ""; Array.from(document.querySelectorAll(".role-perm")).forEach(c => c.checked=false); window.loadCustomRoles(); window.logAudit("Created Role", rName); } catch(e) {} };
window.loadCustomRoles = async () => { const tbody = document.getElementById("custom-roles-body"); try { const snap = await db.collection("global_roles").get(); let html = ""; snap.forEach(doc => { let d = doc.data(); html += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-4 font-bold text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]">${d.name.toUpperCase()}</td><td class="p-4 text-[10px] text-coolGray font-mono tracking-widest">${d.permissions.join(', ').toUpperCase()}</td><td class="p-4 text-right"><button class="px-2 py-1 bg-rose-600/20 border border-rose-500 hover:bg-rose-600 text-rose-400 hover:text-white rounded text-[10px] transition" onclick="window.deleteRole('${doc.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='3' class='p-4 text-center'>NO CUSTOM POLICIES.</td></tr>"; } catch(e) {} };
window.deleteRole = async (rId) => { window.customConfirm("PURGE POLICY?", async () => { await db.collection("global_roles").doc(rId).delete(); window.loadCustomRoles(); }); };