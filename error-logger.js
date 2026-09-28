// Error Logger Utility for CoreEdu
window.addEventListener('error', function (event) {
    console.warn('[CoreEdu Error Logger]', event.message, event.filename, event.lineno);
});

window.addEventListener('unhandledrejection', function (event) {
    console.warn('[CoreEdu Unhandled Promise Rejection]', event.reason);
});
