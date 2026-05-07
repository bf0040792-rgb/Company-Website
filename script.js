// Initialize Lucide Icons immediately
lucide.createIcons();

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

// Initialize only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const appCheck = firebase.appCheck();
appCheck.activate('6LeAT9csAAAAANn9sBk-BPOFASXX9liQLCwwO5_4', true);

const db = firebase.firestore();
const auth = firebase.auth();

// UI STATE FUNCTIONS
function showLoginModal() { 
    document.getElementById('login-modal').classList.remove('hidden-el'); 
}
function hideLoginModal() { 
    document.getElementById('login-modal').classList.add('hidden-el'); 
    document.getElementById('err').classList.add('hidden-el');
}
function openNewSchoolModal() { 
    document.getElementById('new-school-modal').classList.remove('hidden-el'); 
}
function closeNewSchoolModal() { 
    document.getElementById('new-school-modal').classList.add('hidden-el'); 
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden-el'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-white/5', 'text-white');
        btn.classList.add('text-coolLight');
        if(btn.dataset.target === tabId) {
            btn.classList.remove('text-coolLight');
            btn.classList.add('bg-white/5', 'text-white');
        }
    });
    document.getElementById(tabId).classList.remove('hidden-el');
    
    // Fetch data based on active tab
    if(tabId === 'tenants') loadSchools();
    if(tabId === 'keymaker') loadSchoolsDropdown();
    if(tabId === 'analytics') loadFinancials();
    if(tabId === 'surveillance') loadSurveillance();
    if(tabId === 'audit') loadAuditLog();
    
    setTimeout(() => lucide.createIcons(), 50);
}

// ROOT AUTHENTICATION LOGIC
async function loginRoot() {
    const e = document.getElementById("adminEmail").value.trim();
    const p = document.getElementById("adminPass").value.trim();
    const btn = document.getElementById("loginBtn");
    const err = document.getElementById("err");
    const errText = document.getElementById("errText");
    
    if(!e || !p) {
        err.classList.remove('hidden-el');
        errText.innerText = "Identity and Key required.";
        return;
    }

    const origContent = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Verifying...`;
    lucide.createIcons();

    try {
        const userCredential = await auth.signInWithEmailAndPassword(e, p);
        const user = userCredential.user;
        
        await logMasterAction("Root Authentication Initialized", user.email);

        document.getElementById("landing-page").classList.add("hidden-el");
        document.getElementById("login-modal").classList.add("hidden-el");
        document.getElementById("dashboard").classList.remove("hidden-el");
        
        switchTab('analytics');
        
    } catch(error) {
        err.classList.remove('hidden-el');
        errText.innerText = "Access Denied: Invalid parameters.";
        btn.innerHTML = origContent;
        lucide.createIcons();
    }
}

// MASTER LEDGER LOGGING
async function logMasterAction(action, actor = auth.currentUser?.email || "SYSTEM_ROOT") {
    try {
        await db.collection("master_logs").add({
            action: action,
            actor: actor,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { console.error("Ledger write failed", e); }
}

// DASHBOARD: ANALYTICS
async function loadFinancials() {
    try {
        const snap = await db.collection("schools").get();
        let activeCount = 0, expCount = 0, mrr = 0;
        const now = new Date();
        
        snap.forEach(doc => {
            const data = doc.data();
            if(data.status !== 'suspended') activeCount++;
            
            if(data.expiryDate) {
                const exp = new Date(data.expiryDate);
                const diffTime = Math.abs(exp - now);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if(diffDays <= 30 && exp > now) expCount++;
            }
            
            const quota = parseInt(data.quota || 0);
            if(quota <= 500) mrr += 149;
            else if(quota <= 3000) mrr += 349;
            else mrr += 899;
        });
        
        document.getElementById('stat-tenants').innerText = activeCount;
        document.getElementById('stat-expiring').innerText = expCount;
        document.getElementById('stat-revenue').innerText = `$${mrr.toLocaleString()}`;
    } catch(e) { console.error("Analytics Error", e); }
}

// DASHBOARD: TENANT MANAGEMENT
async function loadSchools() {
    const tbody = document.getElementById("schools-table-body");
    
    // Inject Skeleton Loader
    tbody.innerHTML = Array(4).fill(`
        <tr>
            <td class="px-5 py-4"><div class="skeleton h-4 w-32 mb-2"></div><div class="skeleton h-3 w-48"></div></td>
            <td class="px-5 py-4"><div class="skeleton h-4 w-12"></div></td>
            <td class="px-5 py-4"><div class="skeleton h-4 w-24"></div></td>
            <td class="px-5 py-4"><div class="skeleton h-6 w-16 rounded-md"></div></td>
            <td class="px-5 py-4"><div class="skeleton h-6 w-8 ml-auto rounded-md"></div></td>
        </tr>
    `).join('');

    try {
        const snap = await db.collection("schools").get();
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const isSuspended = data.status === 'suspended';
            
            const statusHtml = isSuspended 
                ? `<span class="px-2 py-1 bg-rose-500/10 text-rose-400 text-[10px] uppercase rounded border border-rose-500/20 font-bold flex items-center gap-1 w-fit"><i data-lucide="shield-alert" class="w-3 h-3"></i> Suspended</span>`
                : `<span class="px-2 py-1 bg-tealAccent/10 text-teal-400 text-[10px] uppercase rounded border border-tealAccent/20 font-bold flex items-center gap-1 w-fit"><i data-lucide="shield-check" class="w-3 h-3"></i> Active</span>`;
            
            const actionsHtml = `
                <div class="flex items-center justify-end gap-2">
                    ${isSuspended 
                        ? `<button onclick="toggleKillSwitch('${doc.id}', false)" title="Restore Access" class="p-1.5 text-teal-500 hover:text-white bg-teal-500/10 hover:bg-teal-600 border border-teal-500/20 rounded transition"><i data-lucide="unlock" class="w-3.5 h-3.5"></i></button>`
                        : `<button onclick="toggleKillSwitch('${doc.id}', true)" title="Engage Kill-Switch" class="p-1.5 text-rose-500 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 rounded transition"><i data-lucide="skull" class="w-3.5 h-3.5"></i></button>`
                    }
                </div>
            `;

            const expiry = data.expiryDate ? new Date(data.expiryDate).toLocaleDateString() : '<span class="text-coolGray italic">No License</span>';

            tbody.innerHTML += `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-5 py-3">
                        <p class="font-bold text-white text-sm">${data.schoolName}</p>
                        <p class="text-[10px] text-coolGray font-mono mt-0.5">${doc.id}</p>
                    </td>
                    <td class="px-5 py-3 font-mono text-coolLight">${data.quota || 0}</td>
                    <td class="px-5 py-3 text-coolLight">${expiry}</td>
                    <td class="px-5 py-3">${statusHtml}</td>
                    <td class="px-5 py-3">${actionsHtml}</td>
                </tr>
            `;
        });
        lucide.createIcons();
    } catch(e) { 
        tbody.innerHTML = `<tr><td colspan="5" class="text-rose-400 px-5 py-4 text-center text-sm font-mono">Error: ${e.message}</td></tr>`; 
    }
}

async function createSchool() {
    const name = document.getElementById('newSchoolName').value;
    const quota = document.getElementById('newSchoolQuota').value;
    if(!name || !quota) return alert("Fields required.");
    
    try {
        await db.collection('schools').add({
            schoolName: name,
            quota: parseInt(quota),
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await logMasterAction(`Provisioned Tenant Node: ${name}`);
        closeNewSchoolModal();
        document.getElementById('newSchoolName').value = '';
        document.getElementById('newSchoolQuota').value = '';
        loadSchools();
    } catch(e) { alert(e.message); }
}

async function toggleKillSwitch(schoolId, suspend) {
    if(suspend && !confirm("WARNING: Disabling tenant database access is immediate. Proceed?")) return;
    try {
        await db.collection('schools').doc(schoolId).update({
            status: suspend ? 'suspended' : 'active'
        });
        await logMasterAction(`Kill-Switch: ${suspend ? 'ENGAGED' : 'DISENGAGED'} for [${schoolId}]`);
        loadSchools();
    } catch(e) { alert(e.message); }
}

// DASHBOARD: KEY MAKER
async function loadSchoolsDropdown() {
    const select = document.getElementById("schoolSelect");
    select.innerHTML = '<option value="">-- Select Target Database --</option>';
    try {
        const snap = await db.collection("schools").get();
        snap.forEach(doc => {
            select.innerHTML += `<option value="${doc.id}">${doc.data().schoolName || "Unnamed"} (${doc.id})</option>`;
        });
    } catch(e) { select.innerHTML = `<option value="">Error Loading Nodes</option>`; }
}

async function generateKey() {
    const schoolSelect = document.getElementById("schoolSelect");
    const schoolId = schoolSelect.value;
    if(!schoolId) return alert("Designate a target tenant first.");
    
    const schoolName = schoolSelect.options[schoolSelect.selectedIndex].text;
    const validity = document.getElementById("validity").value;
    const btn = document.getElementById("genBtn");

    const origContent = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Forging...`;
    lucide.createIcons();
    
    try {
        const response = await fetch("https://school-backend-zlgy.onrender.com/api/generate-license", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                schoolId: schoolId,
                schoolName: schoolName,
                validityMonths: validity,
                masterSecret: "VETO_MASTER_2026"
            })
        });
        
        const data = await response.json();
        
        if(data.success) {
            await logMasterAction(`Forged ${validity}m License for ${schoolName}`);
            document.getElementById("keyOutput").classList.remove("hidden-el");
            document.getElementById("generatedKeyText").innerText = data.licenseKey;
            document.getElementById("keyExpiryText").innerText = `Valid until: ${new Date(data.expiryDate).toLocaleDateString()}`;
        } else {
            alert("Backend Rejection: " + data.error);
        }
    } catch(e) { 
        alert("API Communication Failure. Check Render Server Status."); 
    }
    btn.innerHTML = origContent;
    lucide.createIcons();
}

// DASHBOARD: PROVISION L2 ADMINS
async function createSuperAdmin() {
    const email = document.getElementById('l2Email').value;
    const role = document.getElementById('l2Level').value;
    if(!email) return;
    
    try {
        await db.collection('super_admins').add({
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await logMasterAction(`Provisioned L2 Access: ${email}[${role.toUpperCase()}]`);
        alert("Identity Provisioned securely.");
        document.getElementById('l2Email').value = '';
    } catch(e) { alert(e.message); }
}

// DASHBOARD: BROADCAST
async function sendBroadcast() {
    const msg = document.getElementById('alertMsg').value;
    const type = document.getElementById('alertType').value;
    if(!msg) return;

    try {
        await db.collection('system_broadcasts').add({
            message: msg,
            type: type,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            active: true
        });
        await logMasterAction(`Global Broadcast Sent: [${type.toUpperCase()}]`);
        alert("Transmission pushed to all global nodes.");
        document.getElementById('alertMsg').value = '';
    } catch(e) { alert(e.message); }
}

// DASHBOARD: SURVEILLANCE & AUDIT LOGS
async function loadSurveillance() {
    const tbody = document.getElementById("surveillance-table-body");
    
    // Inject Skeleton Loader
    tbody.innerHTML = Array(4).fill(`
        <tr>
            <td class="px-5 py-3"><div class="skeleton h-4 w-16"></div></td>
            <td class="px-5 py-3"><div class="skeleton h-4 w-32"></div></td>
            <td class="px-5 py-3"><div class="skeleton h-4 w-24"></div></td>
            <td class="px-5 py-3"><div class="skeleton h-4 w-24"></div></td>
            <td class="px-5 py-3"><div class="skeleton h-4 w-20"></div></td>
        </tr>
    `).join('');

    // Mocking telemetry data for UI demonstration
    setTimeout(() => {
        const mockLogs =[
            { time: new Date().toLocaleTimeString(), id: 'admin@oxford.edu', ip: '192.168.1.104', dev: 'Win32 Chrome 120.0', loc: 'Mumbai, IN' },
            { time: new Date(Date.now() - 3600000).toLocaleTimeString(), id: 'sys@elite.edu', ip: '203.0.113.42', dev: 'iOS 16_5 Safari', loc: 'Delhi, IN' },
            { time: new Date(Date.now() - 7200000).toLocaleTimeString(), id: 'l2_tech@coreedu.tech', ip: '198.51.100.12', dev: 'MacIntel Firefox', loc: 'Bangalore, IN' }
        ];

        tbody.innerHTML = '';
        mockLogs.forEach(log => {
            tbody.innerHTML += `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-5 py-3 text-coolGray">${log.time}</td>
                    <td class="px-5 py-3 text-white">${log.id}</td>
                    <td class="px-5 py-3">${log.ip}</td>
                    <td class="px-5 py-3 text-[10px] opacity-70">${log.dev}</td>
                    <td class="px-5 py-3 text-teal-400 flex items-center gap-1.5"><i data-lucide="map-pin" class="w-3 h-3"></i> ${log.loc}</td>
                </tr>
            `;
        });
        lucide.createIcons();
    }, 600); // Slight delay to show skeleton
}

// Surveillance Search Filter Logic
document.getElementById('surveillanceSearch').addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#surveillance-table-body tr');
    
    rows.forEach(row => {
        const textContent = row.innerText.toLowerCase();
        row.style.display = textContent.includes(term) ? '' : 'none';
    });
});

async function loadAuditLog() {
    const tbody = document.getElementById("audit-table-body");
    
    // Inject Skeleton Loader
    tbody.innerHTML = Array(5).fill(`<tr><td class="px-5 py-3"><div class="skeleton h-4 w-32"></div></td><td class="px-5 py-3"><div class="skeleton h-4 w-40"></div></td><td class="px-5 py-3"><div class="skeleton h-4 w-full"></div></td></tr>`).join('');

    try {
        const snap = await db.collection("master_logs").orderBy("timestamp", "desc").limit(50).get();
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const data = doc.data();
            const time = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Syncing...';
            tbody.innerHTML += `
                <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-5 py-3 text-coolGray">${time}</td>
                    <td class="px-5 py-3 text-teal-400">${data.actor}</td>
                    <td class="px-5 py-3 text-coolLight">${data.action}</td>
                </tr>
            `;
        });
    } catch(e) { console.error("Audit Ledger Query Failed", e); }
}