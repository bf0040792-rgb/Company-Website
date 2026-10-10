// CoreEdu Error Logger and Runtime Utilities
window.addEventListener('error', function (event) {
    console.warn('[CoreEdu Error Logger]', event.message, event.filename, event.lineno);
});

window.addEventListener('unhandledrejection', function (event) {
    console.warn('[CoreEdu Unhandled Rejection]', event.reason);
});

// Avoid window.alert inside iframe environment
if (window.self !== window.top || !window.alert) {
    const originalAlert = window.alert;
    window.alert = function (message) {
        if (typeof window.showToast === 'function') {
            window.showToast(String(message), '#00F0FF');
        } else {
            console.log('[Alert]:', message);
        }
    };
}
