// Open Source Store - frontend (webview Tauri)
// Todo o backend (catálogo GitHub, downloads, instalação) é Rust via invoke().
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ---------- estado global ----------
let apps = [];              // catálogo completo
let installedIds = new Set();
let currentFilter = 'all';
let currentSort = 'name_asc';
let currentSearch = '';
let downloading = {};       // app_id -> { percent }

// ---------- elementos ----------
const appsGrid = document.getElementById('apps-grid');
const installedGrid = document.getElementById('installed-grid');
const sectionInstalled = document.getElementById('section-installed');
const storeTitle = document.getElementById('store-title');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const updateCount = document.getElementById('update-count');
const statusBar = document.getElementById('status-bar');
const appDetailModal = document.getElementById('app-detail-modal');
const appDetailContent = document.getElementById('app-detail-content');
const downloadModal = document.getElementById('download-modal');
const downloadTitle = document.getElementById('download-title');
const progressFill = document.getElementById('progress-fill');
const downloadStatus = document.getElementById('download-status');
const downloadInfo = document.getElementById('download-info');
const menuSidebar = document.getElementById('menu-sidebar');
const modalOverlay = document.getElementById('modal-overlay');
const sidebarCategories = document.getElementById('sidebar-categories');

// ---------- utils ----------
function formatBytes(bytes) {
    if (!bytes) return 'tamanho desconhecido';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
    return mb.toFixed(1) + ' MB';
}

function showStatus(msg, ms = 4000) {
    statusBar.textContent = msg;
    statusBar.classList.remove('hidden');
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => statusBar.classList.add('hidden'), ms);
}

function stars(n) {
    return '★'.repeat(Math.min(5, Math.round(n / 2000 > 5 ? 5 : Math.max(1, n / 20000))));
}

// ---------- init ----------
async function init() {
    try {
        await Promise.all([loadCatalog(false), loadCategories(), loadDownloadsPath()]);
        renderAll();
        updateAllButton();

        // progresso real de download vindo do Rust
        await listen('download-progress', (event) => {
            const p = event.payload;
            downloading[p.app_id] = p;
            updateDownloadModal(p);
            if (p.status === 'concluído' || p.status === 'cancelado' || p.status.startsWith('falha')) {
                setTimeout(async () => {
                    closeDownloadModal();
                    await loadCatalog(false);
                    renderAll();
                    updateAllButton();
                }, 1200);
            }
            renderAll();
        });

        console.log('Open Source Store (Rust/Tauri) inicializado');
    } catch (error) {
        console.error('Falha ao inicializar:', error);
        appsGrid.innerHTML = `<div class="no-results"><p>Erro ao carregar: ${error}</p></div>`;
    }
}

async function loadCatalog(forceRefresh) {
    const res = await invoke('get_catalog', { forceRefresh });
    apps = res.apps || [];
    installedIds = new Set(apps.filter(a => a.installed).map(a => a.id));
    if (res.from_cache) showStatus('Catálogo carregado do cache local');
    else showStatus(`Catálogo atualizado do GitHub: ${res.total} apps`);
}

async function loadCategories() {
    try {
        const cats = await invoke('get_categories');
        sidebarCategories.innerHTML = (cats || []).map(c => `
            <div class="sidebar-category">
                <a href="#" class="sidebar-link" onclick="filterByCategory('${c.name}')">
                    <span>${c.name}</span>
                </a>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function loadDownloadsPath() {
    try {
        const p = await invoke('get_downloads_path');
        document.getElementById('downloads-path').textContent = 'Downloads salvos em: ' + p;
    } catch (e) { /* fora do Tauri (navegador) */ }
}

async function refreshCatalog() {
    showStatus('Buscando no GitHub...');
    try {
        await loadCatalog(true);
        renderAll();
        updateAllButton();
    } catch (e) {
        showStatus('Erro ao atualizar: ' + e);
    }
}

// ---------- busca ----------
let searchTimer = null;
function onSearchKey(e) {
    if (e.key === 'Enter') { searchGitHub(); return; }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        const q = searchInput.value.trim();
        if (q.length >= 3) searchGitHub(); else { loadCatalog(false).then(renderAll); }
    }, 600);
}

async function searchGitHub() {
    const q = searchInput.value.trim();
    if (!q) return;
    showStatus(`Buscando "${q}" no GitHub...`);
    try {
        const res = await invoke('search_apps', { query: q });
        apps = res.apps || [];
        currentFilter = 'all';
        storeTitle.textContent = `RESULTADOS PARA "${q.toUpperCase()}" (${res.total})`;
        renderAll();
        updateAllButton();
        showStatus(`${res.total} resultados para "${q}"`);
    } catch (e) {
        showStatus('Erro na busca: ' + e);
    }
}

// ---------- filtros ----------
function filterByCategory(cat) { currentFilter = cat; currentSearch = ''; searchInput.value = ''; storeTitle.textContent = cat.toUpperCase(); renderAll(); toggleMenu(); }
function showAllApps() { currentFilter = 'all'; currentSearch = ''; searchInput.value = ''; storeTitle.textContent = 'NÃO INSTALADOS'; renderAll(); toggleMenu(); }
function showInstalled() { currentFilter = 'installed'; storeTitle.textContent = 'INSTALADOS'; renderAll(); toggleMenu(); }
function showUpdates() { currentFilter = 'updates'; storeTitle.textContent = 'ATUALIZAÇÕES DISPONÍVEIS'; renderAll(); toggleMenu(); }

function sortApps() { currentSort = sortSelect.value; renderAll(); }

// ---------- render ----------
function filteredApps() {
    let list = [...apps];
    if (currentFilter === 'installed') list = list.filter(a => a.installed);
    else if (currentFilter === 'updates') list = list.filter(a => a.has_update);
    else if (currentFilter !== 'all') list = list.filter(a => (a.category || '').toLowerCase() === currentFilter.toLowerCase() || (a.tags || []).map(t => t.toLowerCase()).includes(currentFilter.toLowerCase()));
    else list = list.filter(a => !a.installed);

    if (currentSearch) {
        const q = currentSearch.toLowerCase();
        list = list.filter(a =>
            a.name.toLowerCase().includes(q) ||
            (a.tagline || '').toLowerCase().includes(q) ||
            (a.description || '').toLowerCase().includes(q) ||
            a.author.toLowerCase().includes(q) ||
            (a.tags || []).some(t => t.toLowerCase().includes(q))
        );
    }

    list.sort((a, b) => {
        switch (currentSort) {
            case 'name_asc': return a.name.localeCompare(b.name);
            case 'name_desc': return b.name.localeCompare(a.name);
            case 'stars': return b.stars - a.stars;
            case 'downloads': return b.downloads - a.downloads;
            case 'recent': return (b.published_at || '').localeCompare(a.published_at || '');
            default: return a.name.localeCompare(b.name);
        }
    });
    return list;
}

function appCardHtml(app) {
    const dl = downloading[app.id];
    const isDl = !!dl && dl.status === 'baixando';
    let actionBtn;
    if (isDl) {
        actionBtn = `<button class="btn btn-secondary btn-small" disabled>${Math.round(dl.percent)}%</button>`;
    } else if (app.installed && app.has_update) {
        actionBtn = `<button class="btn btn-primary btn-small" onclick="event.stopPropagation(); downloadApp('${app.id}')">ATUALIZAR ${app.version}</button>`;
    } else if (app.installed) {
        actionBtn = `<button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); openInstalled('${app.id}')">ABRIR</button>`;
    } else {
        actionBtn = `<button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); downloadApp('${app.id}')">INSTALAR</button>`;
    }

    return `
        <div class="app-card ${app.has_update ? 'has-update' : ''}" onclick="openAppDetail('${app.id}')">
            <div class="app-card-top">
                <span class="app-version">${app.version ? 'V' + app.version : 'sem release'}</span>
                <button class="btn btn-icon github-btn" title="Ver no GitHub" onclick="event.stopPropagation(); openGitHub('${app.github_url}')">GH &#8599;</button>
            </div>
            <div class="app-card-header">
                <img src="${app.icon_url}" alt="${app.name}" class="app-icon" loading="lazy" onerror="this.src='assets/icons/app_default.png'" />
                <div>
                    <div class="app-name">${app.name}</div>
                    <div class="app-author">por ${app.author} &bull; ${app.license}</div>
                </div>
            </div>
            <div class="app-tagline">${app.tagline || ''}</div>
            <div class="app-meta">
                <span title="Estrelas no GitHub">★ ${app.stars.toLocaleString('pt-BR')}</span>
                <span title="Downloads da release">&#8595; ${app.downloads.toLocaleString('pt-BR')}</span>
                <span title="Última atividade no GitHub">&#128197; ${app.pushed_at ? app.pushed_at.slice(0, 10) : '-'}</span>
                <span>${formatBytes(app.size_bytes)}</span>
            </div>
            ${app.has_update ? `<div class="update-badge">ATUALIZAÇÃO DISPONÍVEL: ${app.installed_version} → ${app.version}</div>` : ''}
            <div class="app-actions">
                ${actionBtn}
                ${app.installed ? `<button class="btn btn-icon" title="Desinstalar" onclick="event.stopPropagation(); uninstallApp('${app.id}')">&#128465;</button>` : ''}
                <button class="btn btn-icon" title="Detalhes" onclick="event.stopPropagation(); openAppDetail('${app.id}')">&#8505;</button>
            </div>
        </div>
    `;
}

function renderAll() {
    const list = filteredApps();
    const installed = apps.filter(a => a.installed);

    // seção instalados
    if (installed.length > 0 && currentFilter !== 'installed') {
        sectionInstalled.classList.remove('hidden');
        installedGrid.innerHTML = installed.map(appCardHtml).join('');
    } else if (currentFilter === 'installed') {
        sectionInstalled.classList.add('hidden');
    } else {
        sectionInstalled.classList.add('hidden');
    }

    if (list.length === 0) {
        appsGrid.innerHTML = `<div class="no-results"><p>Nenhum aplicativo encontrado.</p></div>`;
        return;
    }
    appsGrid.innerHTML = list.map(appCardHtml).join('');
}

async function updateAllButton() {
    try {
        const res = await invoke('get_apps_to_update');
        const n = res.total || 0;
        updateCount.textContent = `ATUALIZAR ${n} APLICATIVO${n === 1 ? '' : 'S'}`;
        updateCount.parentElement.disabled = n === 0;
    } catch (e) { console.error(e); }
}

async function updateAll() {
    try {
        const res = await invoke('get_apps_to_update');
        const updates = res.apps || [];
        if (updates.length === 0) { showStatus('Nenhum aplicativo para atualizar'); return; }
        for (const app of updates) await downloadApp(app.id);
    } catch (e) { showStatus('Erro: ' + e); }
}

// ---------- ações ----------
async function downloadApp(appId) {
    try {
        const app = apps.find(a => a.id === appId);
        downloadTitle.textContent = `Baixando ${app ? app.name : appId}...`;
        downloadStatus.textContent = 'Iniciando download...';
        downloadInfo.textContent = '';
        progressFill.style.width = '0%';
        downloadModal.classList.remove('hidden');
        modalOverlay.classList.remove('hidden');
        await invoke('download_app', { appId });
        // a conclusão chega pelo evento download-progress
    } catch (e) {
        downloadStatus.textContent = 'Erro: ' + e;
    }
}

async function cancelDownload() {
    const active = Object.keys(downloading).find(id => downloading[id].status === 'baixando');
    if (active) { try { await invoke('cancel_download', { appId: active }); } catch (e) {} }
    closeDownloadModal();
}

function updateDownloadModal(p) {
    if (downloadModal.classList.contains('hidden')) return;
    progressFill.style.width = Math.min(100, p.percent) + '%';
    const statusText = {
        'iniciando': 'Iniciando download...',
        'baixando': 'Baixando...',
        'concluído': 'Download concluído!',
        'cancelado': 'Download cancelado',
    }[p.status] || p.status;
    downloadStatus.textContent = statusText;
    downloadInfo.textContent = `${Math.round(p.percent)}% — ${formatBytes(p.downloaded_bytes)}${p.total_bytes ? ' / ' + formatBytes(p.total_bytes) : ''} — ${p.file_name}`;
}

function closeDownloadModal() {
    downloadModal.classList.add('hidden');
    if (!appDetailModal.classList.contains('hidden')) return;
    modalOverlay.classList.add('hidden');
}

async function openInstalled(appId) {
    try { await invoke('open_installed', { appId }); showStatus('Abrindo aplicativo...'); }
    catch (e) { showStatus('Erro ao abrir: ' + e); }
}

async function uninstallApp(appId) {
    if (!confirm('Desinstalar este aplicativo? O arquivo baixado será removido.')) return;
    try {
        await invoke('uninstall_app', { appId });
        showStatus('Aplicativo desinstalado');
        await loadCatalog(false);
        renderAll();
        updateAllButton();
    } catch (e) { showStatus('Erro: ' + e); }
}

function openGitHub(url) { invoke('open_url', { url }).catch(console.error); }

async function openAppDetail(appId) {
    const app = apps.find(a => a.id === appId);
    if (!app) return;
    const dl = downloading[appId];
    appDetailContent.innerHTML = `
        <div class="app-detail-header">
            <img src="${app.icon_url}" alt="${app.name}" class="app-detail-icon" onerror="this.src='assets/icons/app_default.png'" />
            <div class="app-detail-info">
                <h1 class="app-detail-name">${app.name}</h1>
                <p class="app-detail-tagline">${app.tagline || ''}</p>
                <div class="app-detail-meta">
                    <div class="meta-item"><span class="meta-label">Versão</span><span class="meta-value">${app.version || '-'}</span></div>
                    <div class="meta-item"><span class="meta-label">Tamanho</span><span class="meta-value">${formatBytes(app.size_bytes)}</span></div>
                    <div class="meta-item"><span class="meta-label">Licença</span><span class="meta-value">${app.license}</span></div>
                    <div class="meta-item"><span class="meta-label">Autor</span><span class="meta-value">${app.author}</span></div>
                    <div class="meta-item"><span class="meta-label">★ Estrelas</span><span class="meta-value">${app.stars.toLocaleString('pt-BR')}</span></div>
                    <div class="meta-item"><span class="meta-label">Última atividade</span><span class="meta-value">${app.pushed_at ? app.pushed_at.slice(0, 10) : '-'}</span></div>
                    <div class="meta-item"><span class="meta-label">Categoria</span><span class="meta-value">${app.category}</span></div>
                </div>
                <div class="app-actions">
                    ${app.installed
                        ? `<button class="btn btn-secondary" onclick="openInstalled('${app.id}')">ABRIR</button>
                           ${app.has_update ? `<button class="btn btn-primary" onclick="downloadApp('${app.id}')">ATUALIZAR PARA ${app.version}</button>` : ''}
                           <button class="btn btn-text" onclick="uninstallApp('${app.id}')">Desinstalar</button>`
                        : `<button class="btn btn-primary" onclick="downloadApp('${app.id}')">${dl && dl.status === 'baixando' ? Math.round(dl.percent) + '%' : 'INSTALAR'}</button>`}
                    <button class="btn btn-secondary" onclick="openGitHub('${app.github_url}')">ABRIR NO GITHUB</button>
                    ${app.homepage ? `<button class="btn btn-secondary" onclick="openGitHub('${app.homepage}')">SITE OFICIAL</button>` : ''}
                </div>
            </div>
        </div>
        <div class="app-detail-description">${(app.description || '').replace(/\n/g, '<br>')}</div>
        ${app.tags && app.tags.length ? `<div class="app-tags">${app.tags.map(t => `<span class="tag">#${t}</span>`).join('')}</div>` : ''}
    `;
    appDetailModal.classList.remove('hidden');
    modalOverlay.classList.remove('hidden');
}

function closeDetailModal() {
    appDetailModal.classList.add('hidden');
    if (downloadModal.classList.contains('hidden')) modalOverlay.classList.add('hidden');
}

function toggleMenu() { menuSidebar.classList.toggle('hidden'); }
function closeAllModals() { closeDetailModal(); closeDownloadModal(); }

async function saveToken() {
    const t = document.getElementById('github-token-input').value;
    try { await invoke('save_github_token', { token: t }); showStatus('Token salvo. Atualizando catálogo...'); await loadCatalog(true); renderAll(); }
    catch (e) { showStatus('Erro ao salvar token: ' + e); }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });
document.addEventListener('DOMContentLoaded', init);
