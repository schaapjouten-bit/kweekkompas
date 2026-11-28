const status = document.createElement('div');
status.setAttribute('role', 'status');
status.textContent = 'Account en lokale tuin worden gecontroleerd…';
status.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f6f7f2;color:#183c2d;padding:2rem;font:16px sans-serif';
document.body.append(status);
try {
    const response = await fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Accountstatus is niet beschikbaar.');
    const data = await response.json();
    window.KweekScope = window.KweekAccountStorage.create(data.user || null);
    window.addEventListener('storage', event => {
        if (event.key === window.KweekAccountStorage.signalKey) {
            document.body.replaceChildren();
            location.reload();
        }
    });
    const scripts = ['cloud-data.js?v=2','photo-storage.js?v=3','auto-sync.js?v=3','local-backup.js?v=3','local-drafts.js?v=1','plant-lifecycle.js?v=1','ai-contract.js?v=4','browser-ollama.js?v=1','services.js?v=25','app-v132.js?v=86'];
    for (const src of scripts) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = reject; document.body.append(script); });
    status.remove();
} catch (error) {
    status.textContent = 'De accountstatus kon niet veilig worden vastgesteld. Controleer de verbinding en laad de pagina opnieuw. Je opgeslagen tuin is niet gewijzigd.';
}
