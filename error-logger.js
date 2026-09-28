window.capturedAppErrors = [];

function logErrorToUI(msg, source, lineno, colno, error) {
    if (String(msg).includes("Failed to load resource") || String(msg).includes("401") || String(msg).includes("400")) return;
    const errObj = {
        time: new Date().toLocaleTimeString(),
        message: msg || (error && error.message) || String(error),
        location: source ? source + ':' + lineno + ':' + colno : 'N/A',
        stack: error && error.stack ? error.stack : 'No stack trace'
    };
    window.capturedAppErrors.push(errObj);
    updateErrorUI();
}

window.addEventListener('error', (e) => {
    logErrorToUI(e.message, e.filename, e.lineno, e.colno, e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    logErrorToUI(e.reason ? e.reason.message || String(e.reason) : 'Promise Rejection', '', 0, 0, e.reason);
});

// Override console.error to catch manual logs
const originalConsoleError = console.error;
console.error = function(...args) {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    logErrorToUI('Console Error: ' + msg, '', 0, 0, new Error(msg));
    originalConsoleError.apply(console, args);
};

function updateErrorUI() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderUI);
    } else {
        renderUI();
    }
}

function renderUI() {
    let overlay = document.getElementById('debug-error-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'debug-error-overlay';
        overlay.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:999999;background:rgba(20,20,20,0.95);color:#ff5555;padding:15px;border:2px solid #ff4444;max-width:450px;max-height:400px;overflow-y:auto;font-family:monospace;font-size:12px;border-radius:8px;box-shadow: 0 10px 25px rgba(0,0,0,0.5); backdrop-filter: blur(5px);';
        document.body.appendChild(overlay);
    }
    
    let header = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #ff4444;padding-bottom:5px;">' +
        '<b style="color:white;font-size:14px;">?? BUG TRACKER (' + window.capturedAppErrors.length + ')</b>' +
        '<button onclick="copyBugs()" style="background:#ff4444;color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-weight:bold;">COPY ALL ERRORS</button>' +
    '</div>';
    
    let body = window.capturedAppErrors.map(e => 
        '<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed #555;">' +
            '<span style="color:#fffb00">[' + e.time + ']</span> <b>' + e.message + '</b><br>' +
            '<div style="color:#aaa;font-size:10px;margin-top:4px;word-break:break-all;">' + e.stack + '</div>' +
        '</div>'
    ).join('');
    
    overlay.innerHTML = header + body;
}

window.copyBugs = function() {
    const text = JSON.stringify(window.capturedAppErrors, null, 2);
    navigator.clipboard.writeText(text).then(() => {
        alert("? Saare errors copy ho gaye hain! Ab isay Agent ko chat mein paste kar dein.");
    }).catch(err => {
        alert("Copy failed. Please manually select the text.");
    });
}
