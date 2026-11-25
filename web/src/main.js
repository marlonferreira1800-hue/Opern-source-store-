// Open Source Store - frontend (webview Tauri)
// Todo o backend (catálogo GitHub, downloads, instalação) é Rust via invoke().
// Fora do app (navegador puro em localhost:1420) cai no modo demo via fetch direto na API.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const isTauri = !!window.__TAURI_INTERNALS__;

const DEMO_CATEGORIES = [
    { name: 'Development' }, { name: 'Utilities' }, { name: 'Internet' },
    { name: 'Multimedia' }, { name: 'Graphics' }, { name: 'Office' },
    { name: 'Security' }, { name: 'Games' }, { name: 'Science' }, { name: 'Other' },
];

// Camada única de chamada: no app usa os comandos Rust; no navegador usa a API do GitHub direto.
async function call(cmd, args = {}) {
    if (isTauri) return invoke(cmd, args);
    return webCall(cmd, args);
}

async function webCall(cmd, args) {
    if (cmd === 'get_catalog' || cmd === 'search_apps') {
        const since = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10);
        const q = args.query
            ? `${args.query} stars:>=1000 pushed:>=${since} fork:false archived:false in:name,description,readme`
            : `stars:>=2000 pushed:>=${since} fork:false archived:false -awesome -tutorial -course -books -roadmap -interview -primer -handbook -notes -checklist -learning -algorithms in:name,description`;
        const r = await fetch(
            `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`,
            { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (!r.ok) throw new Error(`GitHub API HTTP ${r.status} (limite de requisições atingido?)`);
        const j = await r.json();
        const items = (j.items || []).map(it => ({
            id: it.full_name,
            name: it.name,
            tagline: it.description || '',
            description: it.description || '',
            category: (it.topics && it.topics[0]) || 'Other',
            author: it.owner?.login || '',
            version: '',
            license: it.license ? it.license.spdx_id : 'Unknown',
            stars: it.stargazers_count || 0,
            pushed_at: it.pushed_at || '',
            downloads: 0,
            icon_url: it.owner?.avatar_url || '',
            github_url: it.html_url || '',
            homepage: it.homepage || '',
            release_url: (it.html_url || '') + '/releases',
            download_url: '',
            file_name: '',
            size_bytes: 0,
            tags: it.topics || [],
            installed: false,
            installed_version: null,
            has_update: false,
            installed_path: null,
        }));
        return { apps: items, total: items.length, from_cache: false, offline: false, fetched_at: new Date().toISOString() };
    }
    if (cmd === 'get_categories') return DEMO_CATEGORIES;
    if (cmd === 'get_installed' || cmd === 'get_apps_to_update') {
        return { apps: [], total: 0, from_cache: false, offline: false, fetched_at: '' };
    }
    if (cmd === 'open_url') { window.open(args.url, '_blank', 'noopener,noreferrer'); return; }
    throw new Error('Disponível apenas no app desktop (abra com npm run tauri:dev)');
}

// ---------- estado global ----------
let catalogApps = [];       // catálogo principal curado
let apps = [];              // lista exibida no momento (catálogo ou busca)
let installedApps = [];     // apps instalados (inclui instalados via busca)
let currentFilter = 'all';
let currentSort = 'name_asc';
let currentSearch = '';
let downloading = {};       // app_id -> DownloadProgress

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
function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
    } catch {
        return '';
    }
}

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

// ---------- init ----------
async function init() {
    bindDelegatedEvents();
    try {
        await Promise.all([loadCatalog(false), loadInstalled(), loadCategories(), loadDownloadsPath()]);
        renderAll();
        updateAllButton();

        if (!isTauri) {
            showStatus('Modo navegador (demo): catálogo direto do GitHub. Para instalar apps, abra pelo desktop: npm run tauri:dev', 10000);
        }

        // progresso real de download vindo do Rust
        if (isTauri) {
            await listen('download-progress', (event) => {
                const p = event.payload;
                downloading[p.app_id] = p;
                updateDownloadModal(p);
                if (p.status === 'concluído' || p.status === 'cancelado' || p.status.startsWith('falha')) {
                    setTimeout(async () => {
                        closeDownloadModal();
                        await Promise.all([loadCatalog(false), loadInstalled()]);
                        renderAll();
                        updateAllButton();
                    }, 1200);
                }
                renderAll();
            });
        }

        console.log('Open Source Store (Rust/Tauri) inicializado');
    } catch (error) {
        console.error('Falha ao inicializar:', error);
        appsGrid.innerHTML = `<div class="no-results"><p>Erro ao carregar: ${esc(error?.message || error)}</p></div>`;
    }
}

async function loadCatalog(forceRefresh) {
    const res = await call('get_catalog', { forceRefresh });
    catalogApps = res.apps || [];
    apps = [...catalogApps];
    if (res.offline) {
        showStatus('API do GitHub indisponível (limite de requisições ou sem rede). Modo offline: abra o menu ☰ → Configurações e cole seu token do GitHub para carregar tudo.', 12000);
    } else if (res.from_cache) {
        showStatus('Catálogo carregado do cache local');
    } else {
        showStatus(`Catálogo atualizado do GitHub: ${res.total} apps`);
    }
}

async function loadInstalled() {
    try {
        const res = await call('get_installed');
        installedApps = res.apps || [];
    } catch {
        installedApps = catalogApps.filter(a => a.installed);
    }
}

async function loadCategories() {
    try {
        const cats = await call('get_categories');
        sidebarCategories.innerHTML = (cats || []).map(c => `
            <div class="sidebar-category">
                <a href="#" class="sidebar-link" data-action="filter-category" data-category="${esc(c.name)}">
                    <span>${esc(c.name)}</span>
                </a>
            </div>
        `).join('');
    } catch (e) { console.error(e); }
}

async function loadDownloadsPath() {
    try {
        const p = await call('get_downloads_path');
        document.getElementById('downloads-path').textContent = 'Downloads salvos em: ' + p;
    } catch { /* fora do Tauri (navegador) */ }
}

async function refreshCatalog() {
    showStatus('Buscando no GitHub...');
    try {
        await Promise.all([loadCatalog(true), loadInstalled()]);
        renderAll();
        updateAllButton();
    } catch (e) {
        showStatus('Erro ao atualizar: ' + (e?.message || e));
    }
}

// ---------- busca ----------
let searchTimer = null;
function onSearchKey(e) {
    if (e.key === 'Enter') { searchGitHub(); return; }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        const q = searchInput.value.trim();
        if (q.length >= 3) {
            searchGitHub();
        } else if (q.length === 0) {
            apps = [...catalogApps];
            currentFilter = 'all';
            storeTitle.textContent = 'NÃO INSTALADOS';
            renderAll();
        }
    }, 600);
}

async function searchGitHub() {
    const q = searchInput.value.trim();
    if (!q) {
        apps = [...catalogApps];
        currentFilter = 'all';
        storeTitle.textContent = 'NÃO INSTALADOS';
        renderAll();
        return;
    }
    showStatus(`Buscando "${q}" no GitHub...`);
    try {
        const res = await call('search_apps', { query: q });
        apps = res.apps || [];
        currentFilter = 'all';
        storeTitle.textContent = `RESULTADOS PARA "${q.toUpperCase()}" (${res.total})`;
        renderAll();
        updateAllButton();
        showStatus(`${res.total} resultados para "${q}"`);
    } catch (e) {
        showStatus('Erro na busca: ' + (e?.message || e));
    }
}

// ---------- filtros ----------
function restoreCatalogView() {
    apps = [...catalogApps];
}
function filterByCategory(cat) { restoreCatalogView(); currentFilter = cat; currentSearch = ''; searchInput.value = ''; storeTitle.textContent = cat.toUpperCase(); renderAll(); toggleMenu(); }
function showAllApps() { restoreCatalogView(); currentFilter = 'all'; currentSearch = ''; searchInput.value = ''; storeTitle.textContent = 'NÃO INSTALADOS'; renderAll(); toggleMenu(); }
function showInstalled() { restoreCatalogView(); currentFilter = 'installed'; storeTitle.textContent = 'INSTALADOS'; renderAll(); toggleMenu(); }
function showUpdates() { restoreCatalogView(); currentFilter = 'updates'; storeTitle.textContent = 'ATUALIZAÇÕES DISPONÍVEIS'; renderAll(); toggleMenu(); }

function sortApps() { currentSort = sortSelect.value; renderAll(); }

// ---------- render ----------
function filteredApps() {
    let list = currentFilter === 'installed'
        ? (installedApps.length > 0 ? [...installedApps] : apps.filter(a => a.installed))
        : [...apps];

    if (currentFilter === 'installed') {
        list = list.filter(a => a.installed);
    } else if (currentFilter === 'updates') {
        list = list.filter(a => a.has_update);
    } else if (currentFilter !== 'all') {
        const target = currentFilter.toLowerCase();
        list = list.filter(a =>
            (a.category || '').toLowerCase() === target ||
            (a.tags || []).some(t => t.toLowerCase() === target)
        );
    } else {
        list = list.filter(a => !a.installed);
    }

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
    const isDl = !!dl && (dl.status === 'baixando' || dl.status === 'iniciando');
    const idAttr = esc(app.id);
    const ghHref = esc(safeUrl(app.github_url));

    let actionBtn;
    if (isDl) {
        actionBtn = `<button class="btn btn-secondary btn-small" disabled>${Math.round(dl.percent)}%</button>`;
    } else if (app.installed && app.has_update) {
        actionBtn = `<button class="btn btn-primary btn-small" data-action="download" data-app-id="${idAttr}">ATUALIZAR ${esc(app.version)}</button>`;
    } else if (app.installed) {
        actionBtn = `<button class="btn btn-secondary btn-small" data-action="open-installed" data-app-id="${idAttr}">ABRIR</button>`;
    } else if (!app.download_url) {
        actionBtn = `<button class="btn btn-secondary btn-small" data-action="open-url" data-url="${ghHref}">VER NO GITHUB</button>`;
    } else {
        actionBtn = `<button class="btn btn-secondary btn-small" data-action="download" data-app-id="${idAttr}">INSTALAR</button>`;
    }

    return `
        <div class="app-card ${app.has_update ? 'has-update' : ''}" data-action="detail" data-app-id="${idAttr}">
            <div class="app-card-top">
                <span class="app-version">${app.version ? 'V' + esc(app.version) : 'sem release'}</span>
                <button class="btn btn-icon github-btn" title="Ver no GitHub" data-action="open-url" data-url="${ghHref}">GH &#8599;</button>
            </div>
            <div class="app-card-header">
                <img src="${esc(safeUrl(app.icon_url) || 'assets/icons/app_default.png')}" alt="${esc(app.name)}" class="app-icon" loading="lazy" onerror="this.src='assets/icons/app_default.png'" />
                <div>
                    <div class="app-name">${esc(app.name)}</div>
                    <div class="app-author">por ${esc(app.author)} &bull; ${esc(app.license)}</div>
                </div>
            </div>
            <div class="app-tagline">${esc(app.tagline || '')}</div>
            <div class="app-meta">
                <span title="Estrelas no GitHub">★ ${(app.stars || 0).toLocaleString('pt-BR')}</span>
                <span title="Downloads da release">&#8595; ${(app.downloads || 0).toLocaleString('pt-BR')}</span>
                <span title="Última atividade no GitHub">&#128197; ${app.pushed_at ? esc(app.pushed_at.slice(0, 10)) : '-'}</span>
                <span>${formatBytes(app.size_bytes)}</span>
            </div>
            ${app.has_update ? `<div class="update-badge">ATUALIZAÇÃO DISPONÍVEL: ${esc(app.installed_version)} → ${esc(app.version)}</div>` : ''}
            <div class="app-actions">
                ${actionBtn}
                ${app.installed ? `<button class="btn btn-icon" title="Desinstalar" data-action="uninstall" data-app-id="${idAttr}">&#128465;</button>` : ''}
                <button class="btn btn-icon" title="Detalhes" data-action="detail" data-app-id="${idAttr}">&#8505;</button>
            </div>
        </div>
    `;
}

function renderAll() {
    const list = filteredApps();
    const installed = installedApps.length > 0 ? installedApps : catalogApps.filter(a => a.installed);

    // seção instalados
    if (installed.length > 0 && currentFilter !== 'installed') {
        sectionInstalled.classList.remove('hidden');
        installedGrid.innerHTML = installed.map(appCardHtml).join('');
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
        const res = await call('get_apps_to_update');
        const n = res.total || 0;
        updateCount.textContent = `ATUALIZAR ${n} APLICATIVO${n === 1 ? '' : 'S'}`;
        updateCount.parentElement.disabled = n === 0;
    } catch (e) { console.error(e); }
}

async function updateAll() {
    try {
        const res = await call('get_apps_to_update');
        const updates = res.apps || [];
        if (updates.length === 0) { showStatus('Nenhum aplicativo para atualizar'); return; }
        for (const app of updates) await downloadApp(app.id);
    } catch (e) { showStatus('Erro: ' + (e?.message || e)); }
}

// ---------- ações ----------
function findApp(appId) {
    return apps.find(a => a.id === appId)
        || catalogApps.find(a => a.id === appId)
        || installedApps.find(a => a.id === appId);
}

async function downloadApp(appId) {
    try {
        const app = findApp(appId);
        downloadTitle.textContent = `Baixando ${app ? app.name : appId}...`;
        downloadStatus.textContent = 'Iniciando download...';
        downloadInfo.textContent = '';
        progressFill.style.width = '0%';
        downloadModal.classList.remove('hidden');
        modalOverlay.classList.remove('hidden');
        const res = await call('download_app', { appId });
        if (res && res.success === false) {
            downloadStatus.textContent = res.message || 'Falha no download';
        }
    } catch (e) {
        downloadStatus.textContent = 'Erro: ' + (e?.message || e);
    }
}

async function cancelDownload() {
    const active = Object.keys(downloading).find(id =>
        downloading[id].status === 'baixando' || downloading[id].status === 'iniciando'
    );
    if (active) {
        try { await call('cancel_download', { appId: active }); } catch { /* noop */ }
    }
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
    try { await call('open_installed', { appId }); showStatus('Abrindo aplicativo...'); }
    catch (e) { showStatus('Erro ao abrir: ' + (e?.message || e)); }
}

async function uninstallApp(appId) {
    if (!confirm('Desinstalar este aplicativo? O arquivo baixado será removido.')) return;
    try {
        await call('uninstall_app', { appId });
        showStatus('Aplicativo desinstalado');
        await Promise.all([loadCatalog(false), loadInstalled()]);
        renderAll();
        updateAllButton();
    } catch (e) { showStatus('Erro: ' + (e?.message || e)); }
}

function openGitHub(url) {
    const safe = safeUrl(url);
    if (!safe) return;
    call('open_url', { url: safe }).catch(console.error);
}

async function openAppDetail(appId) {
    const app = findApp(appId);
    if (!app) return;
    const dl = downloading[appId];
    const idAttr = esc(app.id);
    const ghHref = esc(safeUrl(app.github_url));
    const homeHref = esc(safeUrl(app.homepage));
    const descHtml = esc(app.description || '').replace(/\n/g, '<br>');

    appDetailContent.innerHTML = `
        <div class="app-detail-header">
            <img src="${esc(safeUrl(app.icon_url) || 'assets/icons/app_default.png')}" alt="${esc(app.name)}" class="app-detail-icon" onerror="this.src='assets/icons/app_default.png'" />
            <div class="app-detail-info">
                <h1 class="app-detail-name">${esc(app.name)}</h1>
                <p class="app-detail-tagline">${esc(app.tagline || '')}</p>
                <div class="app-detail-meta">
                    <div class="meta-item"><span class="meta-label">Versão</span><span class="meta-value">${esc(app.version || '-')}</span></div>
                    <div class="meta-item"><span class="meta-label">Tamanho</span><span class="meta-value">${formatBytes(app.size_bytes)}</span></div>
                    <div class="meta-item"><span class="meta-label">Licença</span><span class="meta-value">${esc(app.license)}</span></div>
                    <div class="meta-item"><span class="meta-label">Autor</span><span class="meta-value">${esc(app.author)}</span></div>
                    <div class="meta-item"><span class="meta-label">★ Estrelas</span><span class="meta-value">${(app.stars || 0).toLocaleString('pt-BR')}</span></div>
                    <div class="meta-item"><span class="meta-label">Última atividade</span><span class="meta-value">${app.pushed_at ? esc(app.pushed_at.slice(0, 10)) : '-'}</span></div>
                    <div class="meta-item"><span class="meta-label">Categoria</span><span class="meta-value">${esc(app.category)}</span></div>
                </div>
                <div class="app-actions">
                    ${app.installed
                        ? `<button class="btn btn-secondary" data-action="open-installed" data-app-id="${idAttr}">ABRIR</button>
                           ${app.has_update ? `<button class="btn btn-primary" data-action="download" data-app-id="${idAttr}">ATUALIZAR PARA ${esc(app.version)}</button>` : ''}
                           <button class="btn btn-text" data-action="uninstall" data-app-id="${idAttr}">Desinstalar</button>`
                        : app.download_url
                            ? `<button class="btn btn-primary" data-action="download" data-app-id="${idAttr}">${dl && dl.status === 'baixando' ? Math.round(dl.percent) + '%' : 'INSTALAR'}</button>`
                            : `<button class="btn btn-primary" data-action="open-url" data-url="${ghHref}">VER NO GITHUB (sem binário para esta plataforma)</button>`}
                    <button class="btn btn-secondary" data-action="open-url" data-url="${ghHref}">ABRIR NO GITHUB</button>
                    ${homeHref ? `<button class="btn btn-secondary" data-action="open-url" data-url="${homeHref}">SITE OFICIAL</button>` : ''}
                </div>
            </div>
        </div>
        <div class="app-detail-description">${descHtml}</div>
        ${app.tags && app.tags.length ? `<div class="app-tags">${app.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
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
    try {
        await call('save_github_token', { token: t });
        showStatus('Token salvo. Atualizando catálogo...');
        await Promise.all([loadCatalog(true), loadInstalled()]);
        renderAll();
    } catch (e) { showStatus('Erro ao salvar token: ' + (e?.message || e)); }
}

function bindDelegatedEvents() {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        if (action === 'filter-category') {
            e.preventDefault();
            filterByCategory(el.dataset.category);
            return;
        }
        e.stopPropagation();
        const appId = el.dataset.appId;
        if (action === 'download') downloadApp(appId);
        else if (action === 'open-installed') openInstalled(appId);
        else if (action === 'uninstall') uninstallApp(appId);
        else if (action === 'detail') openAppDetail(appId);
        else if (action === 'open-url') openGitHub(el.dataset.url);
    });
}

// Expõe handlers chamados pelos atributos inline de web/index.html (módulo ES não cria globais)
Object.assign(window, {
    updateAll,
    refreshCatalog,
    sortApps,
    onSearchKey,
    searchGitHub,
    toggleMenu,
    showAllApps,
    showInstalled,
    showUpdates,
    filterByCategory,
    closeDetailModal,
    cancelDownload,
    closeAllModals,
    saveToken,
    openAppDetail,
    downloadApp,
    openInstalled,
    uninstallApp,
    openGitHub,
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllModals(); });
document.addEventListener('DOMContentLoaded', init);
