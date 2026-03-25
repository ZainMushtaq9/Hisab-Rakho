// assets/js/utils.js — Hisab Rakho Shared Utilities

// ── TOAST MESSAGES ──────────────────────────────────────────
function toast(msg, type = 'info', ms = 3200) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        Object.assign(container.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '9999',
            display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px'
        });
        document.body.appendChild(container);
    }
    const t = document.createElement('div');
    const bgs = { success: '#10B981', error: '#EF4444', warning: '#F59E0B', info: '#3B82F6' };
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    Object.assign(t.style, {
        background: bgs[type] || bgs.info, color: '#fff', padding: '12px 18px',
        borderRadius: '10px', fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        opacity: '0', transform: 'translateX(30px)', transition: 'all .3s ease',
        display: 'flex', alignItems: 'center', gap: '8px'
    });
    t.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '1'; t.style.transform = 'translateX(0)'; }, 10);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(30px)'; setTimeout(() => t.remove(), 300); }, ms);
}

// ── CONNECTION STATUS BANNER ────────────────────────────────
function updateConnectionStatus(isOnline) {
    let banner = document.getElementById('conn-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'conn-banner';
        Object.assign(banner.style, {
            position: 'fixed', top: '0', left: '0', right: '0', zIndex: '10000',
            padding: '10px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '700',
            transition: 'transform .3s ease', transform: 'translateY(-100%)',
            fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: '8px'
        });
        document.body.appendChild(banner);
    }
    if (isOnline) {
        banner.style.background = 'linear-gradient(135deg,#10B981,#059669)';
        banner.style.color = 'white';
        banner.innerHTML = '🟢 Back online! Syncing data...';
        banner.style.transform = 'translateY(0)';
        setTimeout(() => { banner.style.transform = 'translateY(-100%)'; }, 3500);
        // Trigger sync on pages that support it
        if (typeof onSyncRestore === 'function') onSyncRestore();
    } else {
        banner.style.background = 'linear-gradient(135deg,#F59E0B,#D97706)';
        banner.style.color = '#040D12';
        banner.innerHTML = '🔴 Offline — Changes saved locally, will sync automatically';
        banner.style.transform = 'translateY(0)';
    }
}

// ── THEME TOGGLE ────────────────────────────────────────────
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('hr_theme', isLight ? 'light' : 'dark');
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.textContent = isLight ? '☀️' : '🌙';
    });
    if (typeof updatePageThemeStyles === 'function') updatePageThemeStyles(isLight);
}

// Initialize theme on load
(function initTheme() {
    const isLight = localStorage.getItem('hr_theme') === 'light';
    if (isLight) document.body.classList.add('light-mode');
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.textContent = isLight ? '☀️' : '🌙';
        });
    });
})();

// ── GLOBAL HELPERS ──────────────────────────────────────────
function getShopId() {
    try {
        const shopStr = localStorage.getItem('hr_shop');
        if (shopStr) {
            const shop = JSON.parse(shopStr);
            return shop.shopId || shop.id;
        }
    } catch(e) {}
    return window.AppState?.shopId || null;
}

// Auto-fetch shopId from Firestore if not in localStorage
async function ensureShopId(user) {
    if (getShopId()) return getShopId();
    try {
        const uDoc = await db.collection('users').doc(user.uid).get();
        if (uDoc.exists && uDoc.data().shopId) {
            const shopId = uDoc.data().shopId;
            const sDoc = await db.collection('shops').doc(shopId).get();
            localStorage.setItem('hr_shop', JSON.stringify({ shopId, ...(sDoc.exists ? sDoc.data() : {}) }));
            localStorage.setItem('hr_user', JSON.stringify({ name: user.displayName || 'User', email: user.email, uid: user.uid, ...uDoc.data() }));
            // Update sidebar/topbar if elements exist
            const sbEl = document.getElementById('sb-shop');
            if (sbEl && sDoc.exists) sbEl.textContent = sDoc.data().name || 'Shop';
            const nmEl = document.getElementById('user-nm');
            if (nmEl) nmEl.textContent = user.displayName || uDoc.data().name || 'User';
            const avEl = document.getElementById('user-av');
            if (avEl) avEl.textContent = (user.displayName || uDoc.data().name || 'U')[0].toUpperCase();
            return shopId;
        }
    } catch(e) { console.warn('ensureShopId failed:', e); }
    return null;
}

function fmtCur(amount) {
    return 'Rs. ' + (parseFloat(amount) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

function formatDate(dateInput) {
    if (!dateInput) return '—';
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateInput) {
    if (!dateInput) return '—';
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

// ── BILL NUMBER GENERATOR ───────────────────────────────────
function generateBillNumber() {
    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `HR-${y}${m}${d}-${rand}`;
}

// ── SIGN OUT ────────────────────────────────────────────────
async function signOut() {
    if (!confirm('Are you sure you want to log out?')) return;
    try {
        await firebase.auth().signOut();
        localStorage.removeItem('hr_shop');
        localStorage.removeItem('hr_user');
        window.location.href = 'login.html';
    } catch (e) {
        toast('Logout failed: ' + e.message, 'error');
    }
}

// ── SERVICE WORKER REGISTRATION ─────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        console.log('[App] SW registered');
        // Listen for SW update
        reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            newSW.addEventListener('statechange', () => {
                if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                    toast('New update available! Refresh to update.', 'info', 6000);
                }
            });
        });
    }).catch(err => console.warn('[App] SW registration failed:', err));

    // Listen for sync messages from SW
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'SYNC_TRIGGERED') {
            toast('Data synced!', 'success');
        }
    });
}

// ── PWA INSTALL PROMPT ──────────────────────────────────────
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    // Show install prompt after a delay if not already installed
    setTimeout(() => {
        if (deferredPrompt && !localStorage.getItem('hr_pwa_dismissed')) {
            showInstallBanner();
        }
    }, 10000);
});

function showInstallBanner() {
    let banner = document.getElementById('pwa-install-banner');
    if (banner) return;
    banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    Object.assign(banner.style, {
        position: 'fixed', bottom: '80px', left: '16px', right: '16px', zIndex: '9998',
        background: 'linear-gradient(135deg,#0D1E2E,#071520)', border: '1px solid rgba(0,201,177,.2)',
        borderRadius: '14px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,.4)', fontFamily: "'Plus Jakarta Sans', sans-serif",
        maxWidth: '400px', margin: '0 auto'
    });
    banner.innerHTML = `
        <div style="font-size:28px;flex-shrink:0">📱</div>
        <div style="flex:1">
            <div style="font-size:13px;font-weight:700;color:#E8F0F7;margin-bottom:2px">Install Hisab Rakho</div>
            <div style="font-size:11px;color:rgba(232,240,247,.45)">Add to home screen for offline access</div>
        </div>
        <button id="pwa-install-btn" style="padding:8px 16px;background:linear-gradient(135deg,#00C9B1,#009E8E);color:#040D12;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Install</button>
        <button id="pwa-dismiss-btn" style="background:none;border:none;color:rgba(232,240,247,.3);font-size:16px;cursor:pointer;padding:4px">✕</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            if (result.outcome === 'accepted') toast('App installed!', 'success');
            deferredPrompt = null;
        }
        banner.remove();
    });
    document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
        banner.remove();
        localStorage.setItem('hr_pwa_dismissed', '1');
    });
}

// ── DEBOUNCE HELPER ─────────────────────────────────────────
function debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

// ── PAGE VISIBILITY — Refresh stale data ────────────────────
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && typeof refreshPageData === 'function') {
        refreshPageData();
    }
});

// ── OMNI-SEARCH & GLOBAL SHORTCUTS (PHASE 5) ────────────────
document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && e.key !== 'Escape') return;

    try {
        const user = JSON.parse(localStorage.getItem('hr_user') || '{}');
        if (user.role === 'customer') return; // Hide UI from customers
    } catch(err) {}

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openOmniSearch();
    }
    
    // Quick Actions
    if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); location.href = 'pos.html'; }
    if (e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); location.href = 'inventory.html'; }
    if (e.altKey && e.key.toLowerCase() === 'c') { e.preventDefault(); location.href = 'customers.html'; }
    if (e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); location.href = 'dashboard.html'; }
    if (e.key === 'Escape') closeOmniSearch();
});

function openOmniSearch() {
    let modal = document.getElementById('omni-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'omni-modal';
        Object.assign(modal.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(4,13,18,0.8)', backdropFilter: 'blur(8px)', zIndex: '100000',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh',
            opacity: '0', transition: 'opacity 0.2s ease', fontFamily: "'Plus Jakarta Sans', sans-serif"
        });
        
        modal.innerHTML = `
            <div style="background:var(--bg-card,#0D1E2E);border:1px solid var(--border,rgba(255,255,255,0.05));border-radius:16px;width:90%;max-width:500px;box-shadow:0 20px 40px rgba(0,0,0,0.5);overflow:hidden;transform:scale(0.95);transition:transform 0.2s ease" id="omni-box">
                <div style="padding:16px;border-bottom:1px solid var(--border,rgba(255,255,255,0.05));display:flex;align-items:center;gap:12px">
                    <span style="font-size:18px;color:rgba(232,240,247,0.4)">🔍</span>
                    <input type="text" id="omni-input" placeholder="Jump to..." style="flex:1;background:transparent;border:none;color:#E8F0F7;font-size:16px;outline:none;font-weight:600">
                    <div style="font-size:10px;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;color:rgba(232,240,247,0.4)">ESC</div>
                </div>
                <div style="padding:8px" id="omni-results">
                    <div class="omni-item" onclick="location.href='pos.html'"><div class="omni-ico" style="background:rgba(16,185,129,0.1);color:#34D399">➕</div><div class="omni-text">New Sale (POS)</div><div class="omni-key">Alt+N</div></div>
                    <div class="omni-item" onclick="location.href='inventory.html'"><div class="omni-ico" style="background:rgba(59,130,246,0.1);color:#60A5FA">📦</div><div class="omni-text">Inventory</div><div class="omni-key">Alt+I</div></div>
                    <div class="omni-item" onclick="location.href='customers.html'"><div class="omni-ico" style="background:rgba(245,158,11,0.1);color:#FBBF24">👥</div><div class="omni-text">Customers</div><div class="omni-key">Alt+C</div></div>
                    <div class="omni-item" onclick="location.href='dashboard.html'"><div class="omni-ico" style="background:rgba(16,185,129,0.1);color:#34D399">🏠</div><div class="omni-text">Dashboard</div><div class="omni-key">Alt+D</div></div>
                    <div class="omni-item" onclick="location.href='expenses.html'"><div class="omni-ico" style="background:rgba(239,68,68,0.1);color:#F87171">💸</div><div class="omni-text">Expenses</div><div class="omni-key"></div></div>
                    <div class="omni-item" onclick="location.href='bills.html'"><div class="omni-ico" style="background:rgba(139,92,246,0.1);color:#A78BFA">🧾</div><div class="omni-text">Bills History</div><div class="omni-key"></div></div>
                </div>
            </div>
            <style>
                .omni-item { display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-radius:10px;transition:background 0.1s;color:#E8F0F7;text-decoration:none }
                .omni-item:hover { background:rgba(255,255,255,0.03) }
                .omni-item:hover .omni-text { color:#00C9B1 }
                .omni-ico { width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px }
                .omni-text { flex:1;font-size:14px;font-weight:600 }
                .omni-key { font-size:10px;font-weight:700;color:rgba(232,240,247,0.3);background:rgba(255,255,255,0.02);padding:4px 6px;border-radius:4px }
                body.light-mode #omni-modal{ background:rgba(240,244,248,0.8) }
                body.light-mode #omni-box { background:#fff;border-color:rgba(0,0,0,0.05) }
                body.light-mode .omni-item { color:#040D12 }
                body.light-mode .omni-item:hover { background:rgba(0,0,0,0.02);color:#00C9B1 }
                body.light-mode #omni-input { color:#040D12 }
            </style>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeOmniSearch(); });
        
        const input = document.getElementById('omni-input');
        input.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.omni-item').forEach(item => {
                const text = item.querySelector('.omni-text').textContent.toLowerCase();
                item.style.display = (q === '' || text.includes(q)) ? 'flex' : 'none';
            });
        });
    }
    
    modal.style.display = 'flex';
    document.getElementById('omni-input').value = '';
    document.querySelectorAll('.omni-item').forEach(i => i.style.display='flex');
    
    setTimeout(() => {
        modal.style.opacity = '1';
        document.getElementById('omni-box').style.transform = 'scale(1)';
        document.getElementById('omni-input').focus();
    }, 10);
}

function closeOmniSearch() {
    const modal = document.getElementById('omni-modal');
    if (!modal) return;
    modal.style.opacity = '0';
    document.getElementById('omni-box').style.transform = 'scale(0.95)';
    setTimeout(() => { modal.style.display = 'none'; }, 200);
}
