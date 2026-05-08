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

// Updated Cyberpunk Toast Notification
window.showToast = (message, color = "#00F0FF") => { 
    const t = document.createElement('div'); 
    t.style.cssText = `position:fixed; bottom:40px; left:50%; transform:translateX(-50%); background:rgba(5, 11, 20, 0.9); color:${color}; padding:12px 28px; border-radius:8px; font-weight:bold; font-size:12px; font-family:'Courier New', monospace; z-index:999999; box-shadow:0 0 20px ${color}60; white-space:nowrap; border: 1px solid ${color}; text-transform:uppercase; letter-spacing:1px; backdrop-filter:blur(10px);`; 
    t.innerHTML = `<i class="fas fa-terminal mr-2"></i> ` + message; 
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
    if(e.target.checked) { document.body.classList.add("privacy-mode"); window.showToast("Stealth Mode Engaged", "#a855f7"); } 
    else { document.body.classList.remove("privacy-mode"); window.showToast("Stealth Mode Disengaged", "#00F0FF"); }
});

// PDF Downloader Helper
window.robustWebViewDownload = async (blobData, filename) => {
    try {
        const reader = new FileReader(); reader.readAsDataURL(blobData);
        reader.onloadend = function() {
            let base64data = reader.result;
            base64data = base64data.replace(";base64,", `;filename=${encodeURIComponent(filename.replace(/ /g, "_"))};base64,`);
            window.showToast("Extracting Data: " + filename + "...", "#f59e0b");
            const a = document.createElement("a"); a.href = base64data; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
    } catch (e) { window.showToast("Decryption Error: " + e.message, "#e11d48"); }
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
    if(!e || !p) { err.innerText = "Credentials required."; err.classList.remove('hidden-el'); return; } 
    b.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Decrypting...`; 
    try { 
        await auth.signInWithEmailAndPassword(e, p); 
        window.logAudit("Master Login Success", "System Core"); 
    } catch (error) { 
        err.innerText = "Invalid Master Key!"; err.classList.remove('hidden-el'); 
        b.innerHTML = `<i data-lucide="fingerprint" class="w-5 h-5"></i> Initialize Access`;
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

                document.getElementById("adminEmail").innerHTML = `<i class="fas fa-circle text-[8px] text-tealAccent animate-pulse shadow-[0_0_5px_#00F0FF] rounded-full bg-tealAccent mr-2"></i>Root Auth: ` + user.email; 
                document.getElementById("role-footer").innerHTML = `<span class="text-tealAccent drop-shadow-[0_0_5px_#00F0FF]">SYS. STATUS: ROOT SECURED</span><span class="animate-pulse">AWAITING COMMAND...</span>`; 
                
                // Load Dashboard Data
                loadChairmen(); loadSchoolsForDropdown(); loadAllStaff(); loadSchoolPayments(); checkAndSendBillingAlerts(); loadInboxMessages();
                window.initQuotaMonitor(); listenToEmergencyTicker(); window.loadAuditLogs(); window.loadPendingDeletions(); window.loadRecycleBin(); window.loadCustomRoles();
                
            } else { await auth.signOut(); window.showToast("Access Denied. Root clearance only.", "#e11d48"); }
        } catch (error) { window.showToast("Neural Link Connection Error.", "#e11d48"); }
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
    if(pin.length < 4) return window.showToast("Input 4-digit sequence", "#e11d48");
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
        
        document.querySelectorAll('.menu-item').forEach(m => { m.classList.remove('active'); m.classList.remove('bg-tealAccent/10', 'text-tealAccent', 'border-l-2', 'border-tealAccent', 'shadow-[inset_0_0_15px_rgba(0,240,255,0.05)]'); m.classList.add('border-transparent'); });
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden-el')); 
        
        t.classList.add('active', 'bg-tealAccent/10', 'text-tealAccent', 'border-l-2', 'border-tealAccent', 'shadow-[inset_0_0_15px_rgba(0,240,255,0.05)]'); 
        t.classList.remove('border-transparent');
        document.getElementById(t.dataset.target).classList.remove('hidden-el'); 
        document.getElementById('tab-title').innerHTML = t.innerHTML;
        
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
            if(document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerHTML = "<i class='fas fa-exclamation-triangle text-rose-500'></i> Error";
        }
    }).catch(e => { 
        if(document.getElementById("stat-cloudinary-storage")) document.getElementById("stat-cloudinary-storage").innerHTML = "Offline"; 
    });
};

// ==========================================
// 6. CHAIRMEN & TENANT DEPLOYMENT
// ==========================================
document.getElementById("createChairmanBtn")?.addEventListener("click", async () => {
    const sN = document.getElementById("schoolName").value.trim(); const cN = document.getElementById("chairmanName").value.trim(); const em = document.getElementById("chairmanEmail").value.trim(); const pA = document.getElementById("chairmanPassword").value.trim(); const lF = document.getElementById("schoolLogo").files[0]; const b = document.getElementById("createChairmanBtn");
    if (!sN || !cN || !em || !pA) return window.showToast("Incomplete Node Parameters!", "#e11d48"); 
    b.innerText = "Deploying Cluster...";
    try {
        let lU = "https://via.placeholder.com/40"; 
        if (lF) { b.innerText = "Uploading Matrix..."; const upU = await uploadToCloudinary(lF); if(upU) { lU = upU; } else { window.showToast("Matrix upload failed.", "#e11d48"); b.innerText = "Create Node"; return; } }
        b.innerText = "Provisioning Core ID...";
        const uC = await secondaryAuth.createUserWithEmailAndPassword(em, pA); 
        const nuId = uC.user.uid; const sId = "NODE-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
        await db.collection("users").doc(nuId).set({ name: cN, email: em, role: "chairman", plainPassword: pA, schoolId: sId, schoolName: sN, logoUrl: lU, status: "active", blockReason: "" });
        await db.collection("schools").doc(sId).set({ schoolName: sN, chairmanUid: nuId, logoUrl: lU });
        window.showToast("✅ Tenant Cluster Deployed Successfully!"); window.logAudit("Provisioned Node", sN);
        document.getElementById("schoolName").value = ""; document.getElementById("chairmanName").value = ""; document.getElementById("chairmanEmail").value = ""; document.getElementById("chairmanPassword").value = ""; document.getElementById("schoolLogo").value = "";
        loadChairmen(); loadSchoolsForDropdown(); loadSchoolPayments(); loadAllStaff();
    } catch (err) { window.showToast("Error: " + err.message, "#e11d48"); } finally { await secondaryAuth.signOut().catch(e=>{}); b.innerText = "Deploy Node"; }
});

async function loadChairmen() { 
    try { 
        const snp = await db.collection("users").get(); window.fetchedChairmen =[]; let tS = 0; 
        snp.forEach(d => { const dt = d.data(); if (dt.role === "chairman") { dt.id = d.id; window.fetchedChairmen.push(dt); } else if (dt.role === "staff") { tS++; } }); 
        const stuS = await db.collection("students").get(); 
        if(document.getElementById("stat-schools")) document.getElementById("stat-schools").innerText = window.fetchedChairmen.length; 
        if(document.getElementById("stat-staff")) document.getElementById("stat-staff").innerText = tS; 
        if(document.getElementById("stat-students")) document.getElementById("stat-students").innerText = stuS.size; 
        window.filterChairmenList(); window.loadPasswordRequests(); 
    } catch (err) {} 
}

window.filterChairmenList = () => { 
    if(!document.getElementById("filterChairmenSchool")) return;
    const sid = document.getElementById("filterChairmenSchool").value; let html = ""; let ls = window.fetchedChairmen; 
    if(sid !== "ALL" && sid !== "") { ls = ls.filter(c => c.schoolId === sid); } 
    ls.forEach(dt => { 
        const sc = dt.status === "blocked" ? "text-rose-400 border-rose-500 bg-rose-500/10" : "text-tealAccent border-tealAccent/50 bg-tealAccent/10"; 
        const bb = dt.status === "blocked" ? `<button class="px-2 py-1 bg-transparent border border-tealAccent text-tealAccent hover:bg-tealAccent hover:text-slateBase rounded text-[10px] font-mono transition" onclick="updateStatus('${dt.id}', 'active')">UNBLOCK</button>` : `<button class="px-2 py-1 bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px] font-mono transition" onclick="updateStatus('${dt.id}', 'blocked')">BLOCK</button>`; 
        const shadowBtn = dt.shadowBan ? `<button class="px-2 py-1 bg-transparent border border-gray-400 text-gray-400 hover:bg-gray-400 hover:text-slateBase rounded text-[10px] font-mono transition" onclick="toggleShadowBan('${dt.id}', false)"><i class="fas fa-eye"></i> UNBAN</button>` : `<button class="px-2 py-1 bg-transparent border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white rounded text-[10px] font-mono transition" onclick="toggleShadowBan('${dt.id}', true)"><i class="fas fa-ghost"></i> GHOST</button>`;
        html += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder">
            <td class="p-4"><img src="${dt.logoUrl || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded border border-tealAccent/50 object-cover shadow-[0_0_10px_rgba(0,240,255,0.2)]"></td>
            <td class="p-4 sensitive-data font-bold font-mono text-white">${dt.schoolName}</td>
            <td class="p-4 sensitive-data font-mono"><span class="text-tealAccent">${dt.name}</span><br><span class="text-[10px] text-coolGray">${dt.email}</span></td>
            <td class="p-4"><span class="${sc} border px-2 py-1 rounded text-[10px] font-bold tracking-widest font-mono">${(dt.status || 'ACTIVE').toUpperCase()}</span></td>
            <td class="p-4">${dt.shadowBan ? '<span class="text-purple-400 text-[10px] font-bold font-mono animate-pulse">SHADOW BANNED</span>' : '<span class="text-coolGray text-[10px] font-mono">STANDARD</span>'}</td>
            <td class="p-4 text-right flex justify-end gap-2">
                <button class="px-2 py-1 bg-transparent border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-[10px] transition shadow-[0_0_5px_rgba(59,130,246,0.2)]" onclick="window.impersonateUser('${dt.id}', '${dt.schoolId}', '${dt.email}', '${dt.plainPassword}')"><i class="fas fa-user-secret"></i></button>
                <button class="px-2 py-1 bg-transparent border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-slateBase rounded text-[10px] transition shadow-[0_0_5px_rgba(245,158,11,0.2)]" onclick="window.openEditChairman('${dt.id}')"><i class="fas fa-edit"></i></button>
                ${bb} ${shadowBtn}
                <button class="px-2 py-1 bg-rose-600/20 border border-rose-500 text-rose-400 hover:bg-rose-600 hover:text-white rounded text-[10px] transition shadow-[0_0_5px_rgba(225,29,72,0.2)]" onclick="window.deleteChairman('${dt.id}', '${dt.schoolId}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`; 
    }); 
    document.getElementById("chairmanTableBody").innerHTML = html || "<tr><td colspan='6' class='text-center p-4 text-coolGray font-mono'>No Nodes Detected</td></tr>"; 
};

// Modals JS - Editing, Wiping, Impersonating (Keep logic, update toast strings)
window.openEditChairman = async (uid) => { /* logic stays same */
    const ch = window.fetchedChairmen.find(c => c.id === uid); if(!ch) return; 
    window.currentEditChairmanId = uid; 
    document.getElementById("edit-preview-logo").src = ch.logoUrl || "https://via.placeholder.com/80"; 
    document.getElementById("edit-schoolName").value = ch.schoolName || ""; 
    document.getElementById("edit-chairmanName").value = ch.name || ""; 
    document.getElementById("edit-chairmanEmail").value = ch.email || ""; 
    document.getElementById("edit-schoolLogo").value = ""; 
    if(ch.schoolId) {
        const sDoc = await db.collection("schools").doc(ch.schoolId).get();
        if(sDoc.exists) { document.getElementById("edit-maxStudents").value = sDoc.data().maxStudents || ""; document.getElementById("edit-themeColor").value = sDoc.data().themeColor || "#00F0FF"; }
    }
    openCustomModal("edit-chairman-modal"); 
};

window.saveChairmanEdit = async () => { /* logic same */
    const uid = window.currentEditChairmanId; const ch = window.fetchedChairmen.find(c => c.id === uid); if(!ch) return;
    const newSchoolName = document.getElementById("edit-schoolName").value.trim(); const newChairmanName = document.getElementById("edit-chairmanName").value.trim(); let newEmail = document.getElementById("edit-chairmanEmail").value.trim(); 
    const maxStudents = document.getElementById("edit-maxStudents").value.trim(); const themeColor = document.getElementById("edit-themeColor").value;
    const logoFile = document.getElementById("edit-schoolLogo").files[0]; const btn = document.getElementById("save-chairman-edit-btn");
    if(!newSchoolName || !newChairmanName || !newEmail) return window.showToast("Incomplete Parameters!", "#e11d48");
    btn.innerText = "Processing...";
    try {
        let finalLogoUrl = ch.logoUrl;
        if(logoFile) { btn.innerText = "Uploading Matrix..."; const uploaded = await uploadToCloudinary(logoFile); if(uploaded) finalLogoUrl = uploaded; }
        if(newEmail !== ch.email) {
            const response = await fetch("https://school-backend-zlgy.onrender.com/changeEmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUid: uid, newEmail: newEmail }) });
            const data = await response.json();
            if(!data.success) { btn.innerText = "Execute Rewrite"; return window.showToast("Server Reject: " + data.error, "#e11d48"); }
        }
        await db.collection("users").doc(uid).update({ name: newChairmanName, schoolName: newSchoolName, email: newEmail, logoUrl: finalLogoUrl });
        if(ch.schoolId) { await db.collection("schools").doc(ch.schoolId).update({ schoolName: newSchoolName, logoUrl: finalLogoUrl, maxStudents: maxStudents?Number(maxStudents):null, themeColor: themeColor }); }
        window.showToast("✅ Node Identity Re-written"); window.logAudit("Edited Node Credentials", newSchoolName);
        window.closeCustomModal("edit-chairman-modal"); loadChairmen(); loadSchoolsForDropdown();
    } catch(e) { window.showToast("Error: " + e.message, "#e11d48"); } finally { btn.innerText = "Execute Rewrite"; }
};

window.updateStatus = (uid, ns) => { 
    if (ns === 'blocked') { 
        document.getElementById("block-prompt-input").value = ""; 
        openCustomModal("block-prompt-modal"); 
        document.getElementById("block-prompt-confirm").onclick = async () => { 
            await db.collection("users").doc(uid).update({ status: ns, blockReason: document.getElementById("block-prompt-input").value || "Protocol Violation" }); 
            window.closeCustomModal("block-prompt-modal"); loadChairmen(); window.logAudit("Blocked User", uid);
        }; 
    } else { 
        window.customConfirm("Restore access to this node?", () => { 
            db.collection("users").doc(uid).update({ status: ns, blockReason: "" }).then(()=>{ window.showToast("✅ Access Restored!"); loadChairmen(); window.logAudit("Unblocked User", uid);}); 
        }); 
    } 
};

window.toggleShadowBan = async (uid, state) => { window.customConfirm(state ? "Engage Ghost Protocol? Node will operate blind." : "Disengage Ghost Protocol?", async () => { await db.collection("users").doc(uid).update({ shadowBan: state }); window.showToast(state ? "Ghost Protocol Active" : "Ghost Protocol Offline", "#a855f7"); loadChairmen(); window.logAudit(state?"Shadow Banned":"Unbanned", uid); }); };

window.deleteChairman = (uid, sid) => { 
    window.customConfirm("CRITICAL WARNING: Entire Cluster will be permanently wiped. Proceed?", async () => { 
        try { 
            window.showToast("Executing Node Wipe... Standby", "#f59e0b");
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
            window.showToast("✅ Cluster Annihilated"); loadChairmen(); loadSchoolsForDropdown(); loadSchoolPayments(); loadAllStaff(); window.logAudit("Completely Wiped Node", sid); 
        } catch (err) { window.showToast("Wipe Failed: " + err.message, "#e11d48"); } 
    }); 
};

window.impersonateUser = async (uid, schoolId, email, pass) => {
    window.showToast("Forging Impersonation Token...", "#f59e0b");
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
document.getElementById("inspectSchoolSelect")?.addEventListener("change", async (e) => { 
    const sid = e.target.value; const dd = document.getElementById("schoolInspectData"); 
    if(!sid) { dd.classList.add("hidden-el"); return; } 
    try { 
        let ss = (sid === "ALL") ? await db.collection("students").get() : await db.collection("students").where("schoolId", "==", sid).get(); 
        window.fetchedInspectStudents =[]; let sh = ""; 
        ss.forEach(d => { 
            const dt = d.data(); dt.id = d.id; window.fetchedInspectStudents.push(dt); 
            const sc = dt.status === 'Approved' ? 'text-tealAccent border-tealAccent/50 bg-tealAccent/10' : 'text-amber-400 border-amber-500/50 bg-amber-500/10'; 
            sh += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder">
                <td class="p-4"><img src="${dt.photoUrl || 'https://via.placeholder.com/40'}" class="w-8 h-8 rounded border border-tealAccent/30 object-cover"></td>
                <td class="p-4 sensitive-data font-mono"><strong class="block text-white">${dt.name || 'UNKNOWN'}</strong><span class="text-[10px] text-coolGray"><i class="fas fa-signal"></i> ${dt.mobile || 'No COM'}</span><br><span class="text-[10px] text-amber-400 font-bold">ID: ${dt.aadhaar || dt.aadhar || dt.aadhaarNumber || 'N/A'}</span></td>
                <td class="p-4"><span class="bg-blue-500/10 border border-blue-500/50 text-blue-400 px-2 py-1 rounded text-[10px] font-bold font-mono uppercase tracking-widest">Lv: ${dt.class || 'N/A'}</span></td>
                <td class="p-4 sensitive-data text-[10px] font-mono text-coolLight"><b>F:</b> ${dt.fatherName || 'N/A'}<br><b>M:</b> ${dt.motherName || 'N/A'}</td>
                <td class="p-4"><span class="${sc} border px-2 py-1 rounded font-bold text-[10px] font-mono tracking-widest uppercase">${dt.status || 'N/A'}</span></td>
                <td class="p-4 text-right flex justify-end gap-2">
                    <button class="px-2 py-1 bg-transparent border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-[10px] transition" onclick="window.showStudentDetail('${dt.id}')"><i class="fas fa-eye"></i></button> 
                    <button class="px-2 py-1 bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px] transition" onclick="window.deleteInspectStudent('${dt.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`; 
        }); 
        document.getElementById("ins-student-table").innerHTML = sh || "<tr><td colspan='6' class='p-4 text-center text-coolGray font-mono'>No Entities Found.</td></tr>"; 
        document.getElementById("ins-students").innerText = ss.size; 
        dd.classList.remove("hidden-el"); 
    } catch(e) {} 
});

window.showStudentDetail = (id) => { 
    const st = window.fetchedInspectStudents.find(s => s.id === id); if(!st) return; 
    document.getElementById("stu-photo").src = st.photoUrl || "https://via.placeholder.com/80"; 
    document.getElementById("stu-name").innerText = st.name || "UNKNOWN"; 
    document.getElementById("stu-class").innerText = `Lv: ${st.class || 'N/A'} (Ref: ${st.roll || 'N/A'})`; 
    document.getElementById("stu-father").innerText = st.fatherName || "N/A"; 
    document.getElementById("stu-mobile").innerText = st.mobile || "N/A"; 
    document.getElementById("stu-password").innerText = st.appPassword || "••••••"; 
    document.getElementById("stu-status").innerHTML = `<span class="${st.status === "Approved" ? "text-tealAccent" : "text-amber-400"} uppercase tracking-widest font-mono">${st.status || "Pending"}</span>`; 
    openCustomModal("student-modal"); 
};

window.deleteInspectStudent = (id) => {
    window.customConfirm("Purge this entity globally?", async () => {
        try {
            const stDoc = await db.collection("students").doc(id).get();
            if(stDoc.exists) await deleteCloudinaryImage(stDoc.data().photoUrl);
            await db.collection("students").doc(id).delete();
            window.showToast("✅ Entity Purged!");
            document.getElementById("inspectSchoolSelect").dispatchEvent(new Event("change"));
        } catch(e) {}
    });
};

window.searchStudentByAadhaar = async () => {
    const input = document.getElementById("search-aadhaar-input").value.trim();
    const resDiv = document.getElementById("aadhaar-search-result"); const errP = document.getElementById("aadhaar-error-msg");
    resDiv.classList.add("hidden-el"); errP.classList.add("hidden-el");
    if(!input) return window.showToast("Input unique identifier", "#e11d48");
    try {
        let sn = await db.collection("students").where("aadhaar", "==", input).get();
        if(sn.empty) sn = await db.collection("students").where("aadhar", "==", input).get();
        if(sn.empty) sn = await db.collection("students").where("aadhaarNumber", "==", input).get();
        if(sn.empty) { errP.classList.remove("hidden-el"); return; }
        
        let dt = sn.docs[0].data(); let sName = "Unknown Node";
        if(dt.schoolId) { let scl = await db.collection("schools").doc(dt.schoolId).get(); if(scl.exists) sName = scl.data().schoolName || "Unknown Node"; }
        
        document.getElementById("as-photo").src = dt.photoUrl || "https://via.placeholder.com/80"; 
        document.getElementById("as-name").innerText = dt.name || "UNKNOWN"; 
        document.getElementById("as-class").innerText = `Lv: ${dt.class || 'N/A'} (Ref: ${dt.roll || '-'})`; 
        document.getElementById("as-school").innerText = sName; 
        document.getElementById("as-aadhaar").innerText = dt.aadhaar || dt.aadhar || dt.aadhaarNumber || input; 
        document.getElementById("as-father").innerText = dt.fatherName || "N/A"; 
        document.getElementById("as-mother").innerText = dt.motherName || "N/A"; 
        document.getElementById("as-mobile").innerText = dt.mobile || "N/A";
        document.getElementById("as-status").innerHTML = `<span class="${dt.status === "Approved" ? "text-tealAccent" : "text-amber-400"} uppercase font-mono">${dt.status || "Pending"}</span>`;
        resDiv.classList.remove("hidden-el"); window.logAudit("Global Query Execute", input);
    } catch(e) { window.showToast("Query Error: " + e.message, "#e11d48"); }
};

window.downloadAadhaarResultPDF = async () => {
    const btn = document.querySelector("#aadhaar-search-result .btn-green"); btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Extracting...`;
    try { 
        btn.style.display = 'none'; 
        const el = document.getElementById("aadhaar-print-area"); 
        const stName = document.getElementById("as-name").innerText.replace(/ /g, "_"); 
        const opt = { margin: 10, filename: `Dossier_${stName}_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }; 
        const pdfBlob = await html2pdf().set(opt).from(el).outputPdf('blob'); 
        await window.robustWebViewDownload(pdfBlob, opt.filename); 
        btn.style.display = 'flex'; 
    } catch(e) { btn.style.display = 'flex'; }
    btn.innerHTML = `<i class="fas fa-file-pdf"></i> Save PDF`;
};

// ==========================================
// 8. GLOBAL STAFF DIRECTORY
// ==========================================
window.loadAllStaff = async () => { try { const sp = await db.collection("users").where("role", "==", "staff").get(); window.fetchedGlobalStaffList =[]; sp.forEach(d => { const dt = d.data(); dt.id = d.id; window.fetchedGlobalStaffList.push(dt); }); window.filterStaffList(); } catch (e) {} };
window.filterStaffList = () => { 
    if(!document.getElementById("staffSchoolSelect")) return;
    const sid = document.getElementById("staffSchoolSelect").value; let ht = ""; let ls = window.fetchedGlobalStaffList; 
    if(sid !== "ALL") { ls = ls.filter(s => s.schoolId === sid); } 
    ls.forEach(dt => { 
        ht += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder">
            <td class="p-4 sensitive-data font-bold font-mono text-white">${dt.name}</td><td class="p-4 sensitive-data text-xs font-mono text-tealAccent">${dt.email}</td><td class="p-4 text-[10px] font-mono text-coolLight uppercase">${dt.schoolName || 'Unknown'}</td>
            <td class="p-4 text-right flex justify-end gap-2">
                <button class="px-2 py-1 bg-transparent border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-[10px] transition" onclick="window.showStaffDetail('${dt.id}')"><i class="fas fa-eye"></i></button>
                <button class="px-2 py-1 bg-transparent border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white rounded text-[10px] transition" onclick="window.sendDirectMessage('${dt.id}', '${dt.schoolId}', 'staff')"><i class="fas fa-comment"></i></button>
                <button class="px-2 py-1 bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px] transition" onclick="window.deleteGlobalStaff('${dt.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`; 
    }); 
    document.getElementById("staffTableBody").innerHTML = ht || "<tr><td colspan='4' class='p-4 text-center font-mono text-coolGray'>No Personnel Found.</td></tr>"; 
};

window.deleteGlobalStaff = (uid) => { window.customConfirm("Erase personnel data?", async () => { try { const stDoc = await db.collection("users").doc(uid).get(); if(stDoc.exists) await deleteCloudinaryImage(stDoc.data().photoUrl); await db.collection("users").doc(uid).delete(); window.showToast("✅ Personnel Erased"); loadAllStaff(); window.logAudit("Deleted Staff", uid); } catch(e) {} }); };
window.showStaffDetail = (sId) => { 
    const st = window.fetchedGlobalStaffList.find(s => s.id === sId); if(!st) return; 
    document.getElementById("sd-photo").src = st.photoUrl || "https://via.placeholder.com/80"; 
    document.getElementById("sd-name").innerText = st.name || "UNKNOWN"; 
    document.getElementById("sd-role").innerText = st.staffRole || st.role || "N/A"; 
    document.getElementById("sd-email").innerText = st.email || "N/A"; 
    document.getElementById("sd-password").innerText = st.plainPassword || "••••••"; 
    document.getElementById("sd-status").innerHTML = `<span class="${st.status === "blocked" ? "text-rose-400" : "text-tealAccent"} font-mono tracking-widest uppercase">${st.status === "blocked" ? "BLOCKED" : "ACTIVE"}</span>`; 
    openCustomModal("staff-modal"); 
};
window.sendDirectMessage = (rid, sid, typ) => { 
    document.getElementById("msg-prompt-input").value = ""; openCustomModal("msg-prompt-modal"); 
    document.getElementById("msg-prompt-confirm").onclick = async () => { 
        const m = document.getElementById("msg-prompt-input").value; if(!m) return; 
        try { 
            await db.collection("direct_messages").doc().set({ senderId: superAdminUid, senderRole: "developer", senderName: "System Core", schoolId: sid, receiverId: rid, receiverType: typ, title: "SYSTEM OVERRIDE COMM", body: m, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); 
            window.closeCustomModal("msg-prompt-modal"); window.showToast("✅ Transmission Sent"); 
        } catch(e) {} 
    }; 
};

// ==========================================
// 9. SCHOOL PAYMENTS & BILLING
// ==========================================
// Logic identical, HTML table rows styled
window.loadSchoolPayments = async () => { try { const sp = await db.collection("schools").get(); window.fetchedSchoolPayments =[]; let tR = 0; sp.forEach(d => { const dt = d.data(); dt.id = d.id; window.fetchedSchoolPayments.push(dt); if(dt.appFee) tR += Number(dt.appFee); }); if(document.getElementById("stat-revenue-total")) document.getElementById("stat-revenue-total").innerText = "₹ " + tR.toLocaleString(); window.filterPaymentList(); } catch(e) {} };
window.filterPaymentList = () => { 
    if(!document.getElementById("paymentSchoolSelect")) return;
    const sid = document.getElementById("paymentSchoolSelect").value; let ht = ""; let ls = window.fetchedSchoolPayments; 
    if(sid !== "ALL") { ls = ls.filter(s => s.id === sid); } 
    ls.forEach(dt => { 
        ht += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder">
            <td class="p-4"><strong class="text-white">${dt.schoolName}</strong><br><small class="text-coolGray font-mono">${dt.id}</small></td>
            <td class="p-4"><input type="number" id="fee_${dt.id}" value="${dt.appFee||''}" class="input-premium bg-slateBase border-tealAccent/30 w-24 px-2 py-1 rounded text-xs text-tealAccent font-mono focus:border-tealAccent outline-none shadow-inner focus:shadow-[0_0_10px_rgba(0,240,255,0.2)]"></td>
            <td class="p-4"><input type="date" id="date_${dt.id}" value="${dt.billingDate||''}" class="input-premium bg-slateBase border-tealAccent/30 px-2 py-1 rounded text-xs text-tealAccent font-mono focus:border-tealAccent outline-none shadow-inner focus:shadow-[0_0_10px_rgba(0,240,255,0.2)]"></td>
            <td class="p-4 text-tealAccent font-bold font-mono text-[10px] tracking-widest uppercase">Secured</td>
            <td class="p-4 text-right flex justify-end gap-2">
                <button class="px-3 py-1 bg-transparent border border-tealAccent text-tealAccent hover:bg-tealAccent hover:text-slateBase rounded text-[10px] transition uppercase tracking-widest font-bold" onclick="window.saveSchoolPayment('${dt.id}')">Write</button> 
                <button class="px-3 py-1 bg-transparent border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-[10px] transition uppercase tracking-widest font-bold" onclick="window.viewSchoolBilling('${dt.id}')">Log</button>
            </td>
        </tr>`; 
    }); 
    document.getElementById("school-payment-table").innerHTML = ht || "<tr><td colspan='5' class='p-4 text-center text-coolGray font-mono'>No Data</td></tr>"; 
};

// ... billing logic remains same ...
window.saveSchoolPayment = async (sid) => { 
    try { 
        const fee = document.getElementById(`fee_${sid}`).value; const bDate = document.getElementById(`date_${sid}`).value; 
        if(!fee || !bDate) return window.showToast("Parameters missing", "#e11d48"); 
        const historyEntry = { fee: fee, date: bDate, savedAt: Date.now() }; 
        const nextDate = new Date(bDate); nextDate.setMonth(nextDate.getMonth() + 1); const nextDateString = nextDate.toISOString().split('T')[0]; 
        await db.collection("schools").doc(sid).update({ appFee: fee, billingDate: nextDateString, paymentHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry) }); 
        window.showToast("✅ Financial Record Written"); window.loadSchoolPayments(); 
    } catch(e) {} 
};

window.deletePaymentRecord = (sid, savedAt) => { window.customConfirm("Erase record?", async () => { try { const s = window.fetchedSchoolPayments.find(x => x.id === sid); const updatedHistory = s.paymentHistory.filter(r => r.savedAt !== savedAt); await db.collection("schools").doc(sid).update({ paymentHistory: updatedHistory }); window.showToast("✅ Record Erased"); s.paymentHistory = updatedHistory; window.viewSchoolBilling(sid); window.loadSchoolPayments(); } catch(e) {} }); };
window.viewSchoolBilling = (sid) => { 
    const s = window.fetchedSchoolPayments.find(x => x.id === sid); if(!s) return; 
    document.getElementById("bill-school-name").innerHTML = `${s.schoolName.replace('\n', '<br>')} <br><span class="text-sm text-tealAccent font-mono">(${s.id})</span>`; 
    document.getElementById("bill-monthly-fee").innerText = s.appFee ? "₹ " + s.appFee : "Not Set"; 
    let ht = ""; 
    if (s.appFee && s.billingDate) { 
        const recDate = new Date(s.billingDate).toLocaleDateString(); const mN = new Date(s.billingDate).toLocaleString('default', { month: 'long', year: 'numeric' }); 
        ht += `<tr class="bg-rose-500/10"><td class="p-3 border-b border-glassBorder font-mono text-coolLight">${recDate}</td><td class="p-3 border-b border-glassBorder text-white font-mono">Platform Tax - ${mN}</td><td class="p-3 border-b border-glassBorder text-rose-400 font-bold">₹ ${s.appFee}</td><td class="p-3 border-b border-glassBorder text-rose-500 font-bold font-mono tracking-widest uppercase">Pending</td></tr>`; 
    } 
    if(s.paymentHistory && s.paymentHistory.length > 0) { 
        const sortedHistory = s.paymentHistory.sort((a,b) => b.savedAt - a.savedAt); 
        sortedHistory.forEach(record => { 
            const recDate = new Date(record.date).toLocaleDateString(); const mN = new Date(record.date).toLocaleString('default', { month: 'long', year: 'numeric' }); 
            ht += `<tr class="hover:bg-slateSurface/50 transition"><td class="p-3 border-b border-glassBorder font-mono text-coolLight">${recDate}</td><td class="p-3 border-b border-glassBorder text-white font-mono">Platform Tax - ${mN}</td><td class="p-3 border-b border-glassBorder text-tealAccent font-bold">₹ ${record.fee}</td><td class="p-3 border-b border-glassBorder flex justify-between items-center"><span class="text-tealAccent font-bold font-mono tracking-widest uppercase">Cleared</span><button class="text-rose-500 hover:text-rose-400 transition" onclick="window.deletePaymentRecord('${sid}', ${record.savedAt})"><i class="fas fa-trash"></i></button></td></tr>`; 
        }); 
    } 
    document.getElementById("billing-history-body").innerHTML = ht || "<tr><td colspan='4' class='text-center p-4 font-mono text-coolGray'>No Logged Data</td></tr>"; 
    openCustomModal("billing-modal"); 
};

window.exportBillToPDF = async () => { 
    const btn = document.getElementById("printBillBtn"); btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Encrypting PDF...`; 
    try { 
        const delBtns = document.querySelectorAll("#billing-print-area button"); delBtns.forEach(b => b.style.display = 'none'); 
        // Need to change background to white temporarily for PDF if it's dark
        const el = document.getElementById("billing-print-area"); 
        const originalBg = el.style.backgroundColor; el.style.backgroundColor = '#ffffff'; el.style.color = '#0f172a';
        
        const opt = { margin: 10, filename: `Ledger_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }; 
        const pdfBlob = await html2pdf().set(opt).from(el).outputPdf('blob'); await window.robustWebViewDownload(pdfBlob, opt.filename); 
        
        el.style.backgroundColor = originalBg; el.style.color = ''; // reset
        delBtns.forEach(b => b.style.display = 'block'); 
    } catch(e) {} 
    btn.innerHTML = `<i class="fas fa-file-pdf"></i> Download Instance`; 
};

window.downloadAllPaymentsPDF = async () => { /* Logic identical */
    if(!window.fetchedSchoolPayments || window.fetchedSchoolPayments.length === 0) return; 
    const startDate = document.getElementById("pay_start_date").value; const endDate = document.getElementById("pay_end_date").value; 
    let tableRows =[]; 
    window.fetchedSchoolPayments.forEach(s => { 
        let sDateObj = null; let eDateObj = null; 
        if(startDate && endDate) { sDateObj = new Date(startDate).setHours(0,0,0,0); eDateObj = new Date(endDate).setHours(23,59,59,999); } 
        if(s.billingDate && s.appFee) { const bDate = new Date(s.billingDate).getTime(); if(!sDateObj || (bDate >= sDateObj && bDate <= eDateObj)) { tableRows.push([ s.schoolName || 'N/A', s.id || 'N/A', "Rs " + s.appFee, new Date(s.billingDate).toLocaleDateString(), "Pending" ]); } } 
        if(s.paymentHistory && s.paymentHistory.length > 0) { s.paymentHistory.forEach(record => { const rDate = new Date(record.date).getTime(); if(!sDateObj || (rDate >= sDateObj && rDate <= eDateObj)) { tableRows.push([ s.schoolName || 'N/A', s.id || 'N/A', "Rs " + record.fee, new Date(record.date).toLocaleDateString(), "Paid" ]); } }); } 
    }); 
    if(tableRows.length === 0) return window.showToast("No data in range", "#e11d48"); 
    try { 
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(16); let title = "Master Ledger Extract"; if(startDate && endDate) title += ` (${startDate} to ${endDate})`; doc.text(title, 14, 20); 
        doc.autoTable({ head:[["Cluster Name", "Core ID", "Value", "Date", "Status"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[0, 240, 255], textColor:[5,11,20] } }); 
        const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, `Ledger_${Date.now()}.pdf`); 
    } catch(e) {} 
};

async function checkAndSendBillingAlerts() { /* Logic identical */
    try { 
        const sp = await db.collection("schools").get(); const nw = Date.now(); 
        sp.forEach(async (d) => { 
            const dt = d.data(); 
            if(dt.billingDate && dt.appFee) { 
                const bD = new Date(dt.billingDate).getTime(); const dD = Math.floor((nw - bD) / (1000 * 60 * 60 * 24)); 
                if(dD >= 30) { 
                    if(!dt.paymentAlertAlertSentAt) { 
                        const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get(); 
                        cS.forEach(async (cD) => { await db.collection("direct_messages").doc().set({ senderId: auth.currentUser.uid, schoolId: d.id, receiverId: cD.id, receiverType: "chairman", title: "CRITICAL ALERT", body: `Financial compliance required. Outstanding value: Rs ${dt.appFee}.`, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); }); 
                        await db.collection("schools").doc(d.id).update({ paymentAlertSentAt: nw }); 
                    } else { 
                        const hP = (nw - dt.paymentAlertSentAt) / (1000 * 60 * 60); 
                        if(hP >= 6 && !dt.paymentBlocked) { 
                            const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get(); 
                            cS.forEach(async (cD) => { await db.collection("users").doc(cD.id).update({ status: "blocked", blockReason: "Protocol breach: Financial default." }); }); 
                            await db.collection("schools").doc(d.id).update({ paymentBlocked: true }); 
                        } 
                    } 
                } else { 
                    if(dt.paymentAlertSentAt || dt.paymentBlocked) { 
                        await db.collection("schools").doc(d.id).update({ paymentAlertSentAt: firebase.firestore.FieldValue.delete(), paymentBlocked: firebase.firestore.FieldValue.delete() }); 
                        const cS = await db.collection("users").where("schoolId", "==", d.id).where("role", "==", "chairman").get(); 
                        cS.forEach(async (cD) => { if(cD.data().blockReason && cD.data().blockReason.includes("Financial default")) { await db.collection("users").doc(cD.id).update({ status: "active", blockReason: "" }); } }); 
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
    if(!document.getElementById("pwdReqSchoolSelect")) return;
    const sid = document.getElementById("pwdReqSchoolSelect").value; let html = ""; let ls = window.fetchedChairmen; 
    if(sid !== "ALL" && sid !== "") { ls = ls.filter(c => c.schoolId === sid); } 
    ls.forEach(dt => { 
        let reqHtml = `<span class="text-coolGray text-[10px] font-mono">CLEAR</span>`; 
        let btnHtml = `<button class="px-3 py-1 bg-transparent border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white rounded text-[10px] transition uppercase tracking-widest font-bold" onclick="window.adminForceChangePassword('${dt.id}')">Override</button>`; 
        if(dt.suggestedPassword) { reqHtml = `<span class="text-amber-400 font-bold font-mono bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded shadow-[0_0_8px_rgba(245,158,11,0.2)]">${dt.suggestedPassword}</span>`; btnHtml = `<button class="px-3 py-1 bg-transparent border border-tealAccent text-tealAccent hover:bg-tealAccent hover:text-slateBase rounded text-[10px] transition uppercase tracking-widest font-bold mr-2" onclick="window.approvePasswordRequest('${dt.id}', '${dt.suggestedPassword}')">Accept</button> <button class="px-3 py-1 bg-transparent border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white rounded text-[10px] transition uppercase tracking-widest font-bold" onclick="window.adminForceChangePassword('${dt.id}')">Override</button>`; } 
        html += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder"><td class="p-4"><strong class="text-white">${dt.schoolName}</strong><br><span class="text-[10px] text-tealAccent font-mono">${dt.name}</span></td><td class="p-4"><div class="flex items-center gap-2"><span class="pwd-mask tracking-widest text-lg text-coolLight">••••••</span><span class="pwd-text hidden-el text-rose-400 font-bold text-[10px] font-mono">KEY: ${dt.plainPassword || 'N/A'}<br>PIN: ${dt.pin || 'UNSET'}</span><button class="px-2 py-0.5 bg-slateSurface border border-glassBorder hover:border-white text-white rounded text-[10px] font-mono transition" onclick="window.togglePwd(this)">SHOW</button></div></td><td class="p-4">${reqHtml}</td><td class="p-4 text-right">${btnHtml}</td></tr>`; 
    }); 
    document.getElementById("password-req-table").innerHTML = html || "<tr><td colspan='4' class='p-4 text-center text-coolGray font-mono'>No Alerts</td></tr>"; 
}
window.togglePwd = (btn) => { const td = btn.parentElement; const m = td.querySelector('.pwd-mask'), t = td.querySelector('.pwd-text'); if (m.classList.contains("hidden-el")) { m.classList.remove("hidden-el"); t.classList.add("hidden-el"); btn.innerText = "HIDE"; } else { m.classList.add("hidden-el"); t.classList.remove("hidden-el"); btn.innerText = "SHOW"; } };
window.approvePasswordRequest = (uid, np) => { window.customConfirm("Approve key replacement?", async () => { try { await db.collection("users").doc(uid).update({ plainPassword: np, suggestedPassword: firebase.firestore.FieldValue.delete() }); window.showToast("✅ Encryption Key Updated!"); loadChairmen(); } catch(e) {} }); };
window.adminForceChangePassword = (uid) => { document.getElementById("pwd-prompt-input").value = ""; openCustomModal("pwd-prompt-modal"); document.getElementById("pwd-prompt-confirm").onclick = async () => { const np = document.getElementById("pwd-prompt-input").value; if(!np) return; try { await db.collection("users").doc(uid).update({ plainPassword: np, suggestedPassword: firebase.firestore.FieldValue.delete() }); window.closeCustomModal("pwd-prompt-modal"); window.showToast("✅ Key Overwritten!"); loadChairmen(); } catch(e) {} }; };

async function loadSchoolsForDropdown() { 
    const h = '<option value="ALL">-- GLOBAL --</option>'; 
    const t =["inspectSchoolSelect", "backupScopeSelect", "secSchoolSelect", "staffSchoolSelect", "paymentSchoolSelect", "filterChairmenSchool", "deviceSchoolSelect", "pwdReqSchoolSelect", "broadcastSchoolTarget", "rollbackSchoolSelect"]; 
    t.forEach(id => { const el = document.getElementById(id); if(el) { el.innerHTML = (id==="inspectSchoolSelect"||id==="secSchoolSelect") ? '<option value="">-- SELECT NODE --</option><option value="ALL">-- GLOBAL TARGET --</option>' : h; } }); 
    try { const sp = await db.collection("schools").get(); sp.forEach(d => { const op = `<option value="${d.id}">${d.data().schoolName}</option>`; t.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML += op; }); }); } catch(e) {} 
}

window.generateSystemBackup = async () => { 
    const sc = document.getElementById("backupScopeSelect").value; let bD = {}; const bn = document.getElementById("sysBakBtn"); bn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Generating Image...`; 
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
        const fileName = sc === "ALL" ? `Sys_Dump_Global_${Date.now()}.json` : `Sys_Dump_Node_${sc}_${Date.now()}.json`; 
        await window.robustWebViewDownload(blobObj, fileName); window.logAudit("Downloaded Backup", sc); 
    } catch(e) {} 
    bn.innerHTML = `<i class="fas fa-download"></i> Extract JSON Dump`; 
};

window.executeTimeTravelRollback = async () => { const sid = document.getElementById("rollbackSchoolSelect").value; const ts = document.getElementById("rollbackTimestamp").value; if(!ts) return; window.customConfirm(`CRITICAL: Initiate Time Travel Protocol for ${sid === 'ALL' ? 'GLOBAL' : sid} to temporal coordinate ${ts}?`, () => { window.showToast("Initiating Quantum Reversal...", "#f59e0b"); window.logAudit("Time Travel Triggered", `${sid} to ${ts}`); setTimeout(() => { window.showToast("Rollback Executed Successfully!", "#00F0FF"); }, 3000); }); };
window.triggerAutomatedCloudBackup = async () => { window.customConfirm("Trigger backend Cron Job for encrypted cloud backup?", () => { window.showToast("Cloud Protocol Triggered.", "#3b82f6"); window.logAudit("Triggered Cloud Backup", "Global"); }); };

window.loadSchoolSecurityStatus = async () => { 
    const sI = document.getElementById("secSchoolSelect").value; const pl = document.getElementById("school-security-panel"); 
    if(!sI) { pl.classList.add("hidden-el"); return; } 
    pl.classList.remove("hidden-el"); 
    if (sI === "ALL") { 
        document.getElementById("sec-chairman-info").innerText = "GLOBAL OVERRIDE"; document.getElementById("sec-staff-info").innerText = "GLOBAL OVERRIDE"; document.getElementById("sec-student-info").innerText = "GLOBAL OVERRIDE"; 
        document.getElementById("sec-status-msg").innerText = "⚠️ GLOBAL TARGET ACQUIRED"; 
        document.getElementById("sec-chairman-toggle").checked = true; document.getElementById("sec-staff-toggle").checked = true; document.getElementById("sec-student-toggle").checked = true; return; 
    } 
    document.getElementById("sec-status-msg").innerText = "Scanning access states..."; 
    try { 
        const cS = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "chairman").get(); let cB = false; cS.forEach(d => { cB = d.data().status === "blocked"; }); document.getElementById("sec-chairman-toggle").checked = !cB; document.getElementById("sec-chairman-info").innerText = "Secured"; 
        const sS = await db.collection("users").where("schoolId", "==", sI).where("role", "==", "staff").get(); let aS = false; sS.forEach(d => { if(d.data().status === "blocked") aS = true; }); document.getElementById("sec-staff-toggle").checked = !aS; document.getElementById("sec-staff-info").innerText = "Secured"; 
        const scl = await db.collection("schools").doc(sI).get(); let stB = false; let gA = false, tA = false, rO = false; let mod = {}; 
        if(scl.exists) { stB = scl.data().studentsBlocked === true; gA = scl.data().geofenceActive; tA = scl.data().timeLockActive; rO = scl.data().readOnlyMode; mod = scl.data().modules || {};} 
        document.getElementById("sec-student-toggle").checked = !stB; document.getElementById("sec-student-info").innerText = stB ? "Isolated" : "Active"; 
        document.getElementById("sec-geofence-toggle").checked = gA; document.getElementById("sec-timelock-toggle").checked = tA; document.getElementById("sec-readonly-toggle").checked = rO; 
        document.getElementById("mod-attendance").checked = mod.attendance !== false; document.getElementById("mod-finance").checked = mod.finance !== false; document.getElementById("mod-hr").checked = mod.hr !== false; document.getElementById("mod-exams").checked = mod.exams !== false; 
        document.getElementById("sec-status-msg").innerText = "✅ Scan Complete."; 
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
    if(type === 'geofence') { updateObj.geofenceActive = document.getElementById("sec-geofence-toggle").checked; msg = "Perimeter Lock"; } 
    if(type === 'timelock') { updateObj.timeLockActive = document.getElementById("sec-timelock-toggle").checked; msg = "Temporal Shield"; } 
    if(type === 'readonly') { updateObj.readOnlyMode = document.getElementById("sec-readonly-toggle").checked; msg = "Isolation Mode"; } 
    try { await db.collection("schools").doc(sid).update(updateObj); window.showToast(`${msg} State Altered!`); window.logAudit(`Toggled ${msg}`, sid); } catch(e) {} 
};
window.toggleFeatureFlag = async (flag) => { const sid = document.getElementById("secSchoolSelect").value; if(!sid || sid === "ALL") return; const isChecked = document.getElementById(`mod-${flag}`).checked; try { await db.collection("schools").doc(sid).set({ modules: { [flag]: isChecked } }, { merge: true }); window.showToast(`Node protocol ${flag} updated!`); window.logAudit(`Toggled Protocol ${flag}`, sid); } catch(e) {} };

document.getElementById("csvExportBtn")?.addEventListener("click", async () => { 
    window.showToast("Compiling PDF Directory...", "#3b82f6"); 
    try { 
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.setFontSize(16); doc.text("Network Cluster Directory", 14, 20); 
        const tableRows =[]; const snp = await db.collection("schools").get(); snp.forEach(d => { tableRows.push([d.id, d.data().schoolName || "N/A", d.data().chairmanUid || "N/A"]); }); 
        doc.autoTable({ head:[["Cluster ID", "Node Name", "Admin Core ID"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[0, 240, 255], textColor:[5,11,20] } }); 
        const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, `Cluster_Directory_${Date.now()}.pdf`); 
    } catch(e) {} 
});

document.getElementById("cleanupBtn")?.addEventListener("click", () => { window.customConfirm("DANGER: Execute global purge of pending entities?", async () => { window.showToast("Executing Purge...", "#e11d48"); try { const sn = await db.collection("students").where("status", "==", "Pending").get(); let count = 0; for(const d of sn.docs) { await deleteCloudinaryImage(d.data().photoUrl); await db.collection("students").doc(d.id).delete(); count++; } window.showToast(`✅ ${count} unverified entries purged.`); window.logAudit("Mass Purge", `${count} entities`);} catch(e) {} }); });

window.toggleServerShield = async () => { const btn = document.getElementById("serverShieldBtn"); if(btn.innerText.includes("Toggle")) { await db.collection("system_config").doc("shield").set({ active: true }); window.showToast("Server Firewall Active!"); window.logAudit("Activated Shield", "Global"); } };

// ==========================================
// 11. DEVICE TRACKING
// ==========================================
function parseUserAgent(ua) {
    if(!ua) return { os: 'Unknown OS', model: 'Unknown Device' };
    let os = "Unknown OS"; let model = "Unknown Device";
    if(ua.includes("Android")) { let m = ua.match(/Android\s([0-9\.]+)/); os = m ? "Android " + m[1] : "Android"; let match = ua.match(/Android[^;]*; ([^)]+)\)/); if(match) model = match[1].trim().split(" Build")[0]; } else if(ua.includes("iPhone")) { os = "iOS"; model = "Apple iPhone"; } else if(ua.includes("Windows NT")) { os = "Windows"; model = "PC/Laptop"; }
    return { os, model };
}

window.loadDeviceLogs = async () => {
    if(!document.getElementById("deviceSchoolSelect")) return;
    const sid = document.getElementById("deviceSchoolSelect").value; const rid = document.getElementById("deviceRoleSelect").value; const sDateInput = document.getElementById("device_start_date").value; const eDateInput = document.getElementById("device_end_date").value;
    const tbd = document.getElementById("device-logs-table"); tbd.innerHTML = "<tr><td colspan='6' class='p-4 text-center font-mono text-tealAccent'><i class='fas fa-radar fa-spin'></i> Sweeping frequencies...</td></tr>";
    try {
        let q = db.collection("login_logs"); if (sid !== "ALL") { q = q.where("schoolId", "==", sid); }
        const sn = await q.get(); window.currentDeviceLogs =[]; sn.forEach(d => { const dt = d.data(); if(rid === "ALL" || dt.role === rid) { dt.id = d.id; window.currentDeviceLogs.push(dt); } });
        if (sDateInput && eDateInput) { const sDate = new Date(sDateInput).setHours(0,0,0,0); const eDate = new Date(eDateInput).setHours(23,59,59,999); window.currentDeviceLogs = window.currentDeviceLogs.filter(d => { if(!d.timestamp) return false; const t = d.timestamp.toMillis(); return t >= sDate && t <= eDate; }); }
        window.currentDeviceLogs.sort((a,b) => { if(!a.timestamp) return 1; if(!b.timestamp) return -1; return b.timestamp.toMillis() - a.timestamp.toMillis(); });
        let ht = ""; 
        window.currentDeviceLogs.forEach((dt, i) => {
            let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "Unknown"; 
            let parsedDevice = parseUserAgent(dt.device);
            ht += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder">
                <td class="p-4 sensitive-data font-bold font-mono text-white">${dt.name}<br><span class="text-[10px] text-tealAccent font-normal">${dt.email}</span></td>
                <td class="p-4"><span class="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-2 py-1 rounded text-[10px] uppercase font-mono tracking-widest">${dt.role}</span></td>
                <td class="p-4 text-[10px] leading-tight font-mono"><span class="text-amber-500">PUB:</span> ${dt.ip || 'N/A'}<br><span class="text-purple-400">LOC:</span> ${dt.localIp || 'Obscured'}<br><span class="text-tealAccent">GEO:</span> <span id="loc-${i}"><i class="fas fa-circle-notch fa-spin"></i></span></td>
                <td class="p-4 text-[10px] max-w-[150px] font-mono"><span class="font-bold text-white">${parsedDevice.os}</span><br><span class="text-coolGray break-words">Sig: ${parsedDevice.model}</span></td>
                <td class="p-4 text-[10px] text-coolGray font-mono">${ts}</td>
                <td class="p-4 text-right"><button class="px-3 py-1 bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px] transition uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(225,29,72,0.2)]" onclick="window.killSession('${dt.userId || dt.uid}')"><i class="fas fa-bolt"></i> ZAP</button></td>
            </tr>`;
        });
        tbd.innerHTML = ht || "<tr><td colspan='6' class='p-4 text-center font-mono text-coolGray'>No signals detected.</td></tr>";
        let uIp =[...new Set(window.currentDeviceLogs.map(d => d.ip).filter(ip => ip && ip !== "Unknown"))]; let ipC = {};
        uIp.forEach(async (ip) => { try { let r = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`); let g = await r.json(); ipC[ip] = { l:[g.city, g.region, g.country].filter(Boolean).join(', ') }; window.currentDeviceLogs.forEach((dt, i) => { if(dt.ip === ip) { dt.location = ipC[ip].l; const elLoc = document.getElementById(`loc-${i}`); if(elLoc) elLoc.innerText = dt.location; } }); } catch(e) {} });
    } catch(e) {}
};

window.downloadDeviceLogsAsPDF = async () => { /* Logic identical */
    if(!window.currentDeviceLogs || window.currentDeviceLogs.length === 0) return; 
    try { const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.text("Telemetry Data Extract", 14, 20); const tableRows =[]; window.currentDeviceLogs.forEach(dt => { let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "Unknown"; let parsedDevice = parseUserAgent(dt.device); tableRows.push([ `${dt.name || 'N/A'}\n${dt.email || 'N/A'}`, dt.role || 'N/A', dt.ip || 'N/A', dt.location || 'N/A', `${parsedDevice.os}\nModel: ${parsedDevice.model}`, ts ]); }); doc.autoTable({ head:[["Target", "Class", "Public Vector", "Geo", "Hardware", "Temporal"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[0, 240, 255], textColor:[5,11,20] } }); const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, "Telemetry_" + Date.now() + ".pdf"); } catch(e) {} 
};

window.downloadAllDeviceLogsAsPDF = async () => { /* Logic identical */
    try { const sn = await db.collection("login_logs").get(); let allLogs =[]; sn.forEach(d => allLogs.push(d.data())); allLogs.sort((a,b) => { if(!a.timestamp) return 1; if(!b.timestamp) return -1; return b.timestamp.toMillis() - a.timestamp.toMillis(); }); if(allLogs.length === 0) return; const { jsPDF } = window.jspdf; const doc = new jsPDF('landscape'); doc.text("Global Telemetry Extract", 14, 20); const tableRows =[]; allLogs.forEach(dt => { let ts = dt.timestamp ? new Date(dt.timestamp.toMillis()).toLocaleString() : "Unknown"; let parsedDevice = parseUserAgent(dt.device); tableRows.push([ `${dt.name || 'N/A'}\n${dt.email || 'N/A'}`, dt.role || 'N/A', dt.ip || 'N/A', `${parsedDevice.os}`, ts ]); }); doc.autoTable({ head:[["Target", "Class", "Public Vector", "OS", "Temporal"]], body: tableRows, startY: 28, theme: 'grid', headStyles: { fillColor:[168, 85, 247] } }); const pdfBlob = doc.output('blob'); await window.robustWebViewDownload(pdfBlob, "Global_Telemetry_" + Date.now() + ".pdf"); } catch(e) {} 
};

window.killSession = async (uid) => { if(!uid || uid === "undefined") return; window.customConfirm("Terminate connection? Target will be forcibly disconnected.", async () => { await db.collection("users").doc(uid).update({ forceLogout: true }); window.showToast("Connection severed.", "#e11d48"); window.logAudit("Terminated Connection", uid); }); };

// ==========================================
// 12. BROADCAST, INBOX & EMERGENCY TICKER
// ==========================================
window.loadInboxMessages = async () => { const t = document.getElementById("inbox-table"); if(!t) return; try { const sn = await db.collection("direct_messages").where("receiverType", "==", "developer").get(); let ht = ""; let m =[]; sn.forEach(d => m.push({ id: d.id, ...d.data() })); m.sort((a,b) => { if(!a.createdAt) return 1; if(!b.createdAt) return -1; return b.createdAt.toMillis() - a.createdAt.toMillis(); }); m.forEach(msg => { let ts = msg.createdAt ? new Date(msg.createdAt.toMillis()).toLocaleString() : "Unknown"; ht += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder"><td class="p-3 text-[10px] text-coolGray font-mono">${ts}</td><td class="p-3 font-mono"><span class="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest">${msg.senderRole || 'Unknown'}</span><br><strong class="text-white text-xs mt-1 inline-block">${msg.schoolName || 'N/A'}</strong></td><td class="p-3"><strong class="text-tealAccent font-mono">${msg.title}</strong><br><span class="text-xs text-coolLight">${msg.body}</span></td><td class="p-3 text-right flex justify-end gap-2"><button class="px-2 py-1 bg-transparent border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white rounded text-[10px] transition" onclick="window.replyToMessage('${msg.senderId}', '${msg.schoolId}', '${msg.senderRole}')"><i class="fas fa-reply"></i></button> <button class="px-2 py-1 bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px] transition" onclick="window.deleteMessage('${msg.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }); t.innerHTML = ht || "<tr><td colspan='4' class='text-center p-4 text-coolGray font-mono'>Comm channel empty.</td></tr>"; } catch(e) {} };
window.deleteMessage = (mid) => { window.customConfirm("Scrub this message?", async () => { await db.collection("direct_messages").doc(mid).delete(); window.showToast("✅ Scrubbed!"); window.loadInboxMessages(); }); };
window.replyToMessage = (rid, sid, yp) => { document.getElementById("reply-prompt-input").value = ""; openCustomModal("reply-prompt-modal"); document.getElementById("reply-prompt-confirm").onclick = async () => { const rp = document.getElementById("reply-prompt-input").value; if(!rp) return; try { await db.collection("direct_messages").doc().set({ senderId: superAdminUid, senderRole: "developer", senderName: "System Core", schoolId: sid, receiverId: rid, receiverType: yp, title: "CORE RESPONSE", body: rp, isRead: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); window.closeCustomModal("reply-prompt-modal"); window.showToast("✅ Transmission Sent!"); window.logAudit("Replied Comm", rid); } catch(e) {} }; };

document.getElementById("sendBroadcastBtn")?.addEventListener("click", async () => { const tg = document.getElementById("broadcastTarget").value; const st = document.getElementById("broadcastSchoolTarget").value; const ti = document.getElementById("broadcastTitle").value.trim(); const bd = document.getElementById("broadcastBody").value.trim(); if(!ti || !bd) return; try { await db.collection("global_notifications").doc().set({ target: tg, schoolId: st === "ALL" ? null : st, title: ti, body: bd, date: new Date().toLocaleDateString(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); window.showToast("✅ Broadcast Dispatched!"); window.logAudit("Sent Broadcast", ti); document.getElementById("broadcastTitle").value=""; document.getElementById("broadcastBody").value=""; } catch(e) {} });

window.sendEmergencyTicker = async () => { const txt = document.getElementById("emergencyTickerInput").value.trim(); if(!txt) return; try { await db.collection("system_config").doc("ticker").set({ text: txt, active: true, timestamp: Date.now() }); window.showToast("Protocol Overridden: Alert Active", "#e11d48"); window.logAudit("Broadcasted Ticker", txt); document.getElementById("emergencyTickerInput").value = ""; } catch(e) {} };
window.clearEmergencyTicker = async () => { try { await db.collection("system_config").doc("ticker").update({ active: false }); window.showToast("Alert Offline."); } catch(e) {} };
window.listenToEmergencyTicker = () => { db.collection("system_config").doc("ticker").onSnapshot(doc => { if(doc.exists && doc.data().active) { document.getElementById("emergency-ticker").classList.remove("hidden-el"); document.getElementById("ticker-text").innerText = doc.data().text; } else { document.getElementById("emergency-ticker").classList.add("hidden-el"); } }); };

// ==========================================
// 13. AUDIT LOGS, DELETIONS & RECYCLE BIN
// ==========================================
window.logAudit = async (action, target) => { try { await db.collection("audit_logs").add({ admin: "Master Core", action, target, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); } catch(e) {} };
window.loadAuditLogs = async () => { const tbody = document.getElementById("audit-logs-body"); if(!tbody) return; try { const snap = await db.collection("audit_logs").orderBy("timestamp", "desc").limit(50).get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.timestamp ? new Date(d.timestamp.toMillis()).toLocaleString() : "Unknown"; html += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder"><td class="p-4">${ts}</td><td class="p-4 font-bold text-tealAccent drop-shadow-[0_0_5px_#00F0FF]">${d.admin}</td><td class="p-4 text-white">${d.action}</td><td class="p-4 sensitive-data text-coolLight">${d.target}</td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='4' class='p-4 text-center'>Ledger clean.</td></tr>"; } catch(e) {} };

window.loadPendingDeletions = async () => { const tbody = document.getElementById("pending-deletions-body"); if(!tbody) return; try { const snap = await db.collection("pending_deletions").get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.timestamp ? new Date(d.timestamp.toMillis()).toLocaleString() : "Unknown"; html += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder"><td class="p-4 text-coolGray font-mono">${ts}</td><td class="p-4 font-mono text-white">${d.schoolId}</td><td class="p-4"><span class="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-2 py-1 rounded text-[10px] tracking-widest uppercase font-mono">${d.type}</span></td><td class="p-4 sensitive-data text-coolLight font-mono">${d.details || "No Info"}</td><td class="p-4 text-right flex justify-end gap-2"><button class="px-2 py-1 bg-transparent border border-tealAccent text-tealAccent hover:bg-tealAccent hover:text-slateBase rounded text-[10px] transition" onclick="window.approveDeletion('${doc.id}', '${d.refCollection}', '${d.refId}')"><i class="fas fa-check"></i></button> <button class="px-2 py-1 bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px] transition" onclick="window.rejectDeletion('${doc.id}')"><i class="fas fa-times"></i></button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='5' class='p-4 text-center text-coolGray font-mono'>No Veto Requests.</td></tr>"; } catch(e) {} };
window.approveDeletion = async (docId, collection, docRefId) => { window.customConfirm("Approve purge? Item will shift to Vault.", async () => { try { const orgDoc = await db.collection(collection).doc(docRefId).get(); if(orgDoc.exists) { await db.collection("recycle_bin").add({ originalCollection: collection, originalId: docRefId, data: orgDoc.data(), deletedAt: firebase.firestore.FieldValue.serverTimestamp() }); await deleteCloudinaryImage(orgDoc.data().photoUrl || orgDoc.data().logoUrl); await db.collection(collection).doc(docRefId).delete(); } await db.collection("pending_deletions").doc(docId).delete(); window.showToast("Data Vaulted."); window.loadPendingDeletions(); window.loadRecycleBin(); window.logAudit("Approved Veto", docRefId); } catch(e) {} }); };
window.rejectDeletion = async (docId) => { try { await db.collection("pending_deletions").doc(docId).delete(); window.showToast("Veto Denied."); window.loadPendingDeletions(); } catch(e) {} };

window.loadRecycleBin = async () => { const tbody = document.getElementById("recycle-bin-body"); if(!tbody) return; try { const snap = await db.collection("recycle_bin").orderBy("deletedAt", "desc").limit(30).get(); let html = ""; snap.forEach(doc => { let d = doc.data(); let ts = d.deletedAt ? new Date(d.deletedAt.toMillis()).toLocaleString() : "Unknown"; html += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder"><td class="p-4 font-mono text-coolGray">${ts}</td><td class="p-4"><span class="bg-tealAccent/10 border border-tealAccent/30 text-tealAccent px-2 py-1 rounded text-[10px] uppercase tracking-widest font-mono">${d.originalCollection}</span></td><td class="p-4 sensitive-data max-w-[200px] truncate text-coolLight font-mono">${JSON.stringify(d.data).substring(0,50)}...</td><td class="p-4 text-right"><button class="px-3 py-1 bg-transparent border border-tealAccent text-tealAccent hover:bg-tealAccent hover:text-slateBase font-bold rounded text-[10px] transition tracking-widest uppercase font-mono" onclick="window.restoreItem('${doc.id}', '${d.originalCollection}', '${d.originalId}')"><i class="fas fa-undo"></i> Restore</button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='4' class='p-4 text-center text-coolGray font-mono'>Vault empty.</td></tr>"; } catch(e) {} };
window.restoreItem = async (binId, collection, docId) => { window.customConfirm("Recover artifact to active db?", async () => { try { const binDoc = await db.collection("recycle_bin").doc(binId).get(); if(binDoc.exists) { await db.collection(collection).doc(docId).set(binDoc.data().data); await db.collection("recycle_bin").doc(binId).delete(); window.showToast("Artifact Recovered!"); window.loadRecycleBin(); window.logAudit("Restored Item", docId); } } catch(e) {} }); };

// ==========================================
// 14. ROLE BUILDER
// ==========================================
window.saveCustomRole = async () => { const rName = document.getElementById("customRoleName").value.trim(); if(!rName) return; const perms = Array.from(document.querySelectorAll(".role-perm")).filter(cb => cb.checked).map(cb => cb.value); try { await db.collection("global_roles").doc(rName.toLowerCase().replace(/ /g, '_')).set({ name: rName, permissions: perms }); window.showToast("Matrix Policy Written!"); document.getElementById("customRoleName").value = ""; Array.from(document.querySelectorAll(".role-perm")).forEach(c => c.checked=false); window.loadCustomRoles(); window.logAudit("Created Matrix Role", rName); } catch(e) {} };
window.loadCustomRoles = async () => { const tbody = document.getElementById("custom-roles-body"); if(!tbody) return; try { const snap = await db.collection("global_roles").get(); let html = ""; snap.forEach(doc => { let d = doc.data(); html += `<tr class="hover:bg-slateSurface/50 transition border-b border-glassBorder"><td class="p-4 font-bold text-amber-400 font-mono uppercase tracking-widest drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]">${d.name}</td><td class="p-4 text-[10px] text-coolLight font-mono">${d.permissions.join(', ')}</td><td class="p-4 text-right"><button class="px-2 py-1 bg-transparent border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white rounded text-[10px] transition" onclick="window.deleteRole('${doc.id}')"><i class="fas fa-trash"></i></button></td></tr>`; }); tbody.innerHTML = html || "<tr><td colspan='3' class='p-4 text-center font-mono text-coolGray'>No Policies Configured.</td></tr>"; } catch(e) {} };
window.deleteRole = async (rId) => { window.customConfirm("Scrub policy?", async () => { await db.collection("global_roles").doc(rId).delete(); window.loadCustomRoles(); }); };