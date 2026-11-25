import { call, isTauri, onDownloadProgress } from './api/client.js';
import { findApp, restoreCatalogView, state } from './state/store.js';
import {
    closeAllModals,
    closeDetailModal,
    closeDownloadModal,
    dom,
    openDownloadModal,
    renderAll,
    renderAppDetail,
    renderCategories,
    showStatus,
    toggleMenu,
    updateDownloadModal,
} from './ui/render.js';
import { esc, safeUrl } from './utils/format.js';

let searchTimer = null;

async function init() {
    bindEvents();
    try {
        await Promise.all([loadCatalog(false), loadInstalled(), loadCategories(), loadDownloadsPath()]);
        renderAll();
        await updateAllButton();

        if (!isTauri) {
            showStatus('Modo navegador (demo): catálogo direto do GitHub. Para instalar apps, abra pelo desktop: npm run tauri:dev', 10000);
        }

        await onDownloadProgress((p) => {
            state.downloading[p.app_id] = p;
            updateDownloadModal(p);
            if (p.status === 'concluído' || p.status === 'cancelado' || p.status.startsWith('falha')) {
                setTimeout(async () => {
                    closeDownloadModal();
                    await Promise.all([loadCatalog(false), loadInstalled()]);
                    renderAll();
                    await updateAllButton();
                }, 1200);
            }
            renderAll();
        });

        console.log('Open Source Store (Rust/Tauri) inicializado');
    } catch (error) {
        console.error('Falha ao inicializar:', error);
        dom.appsGrid.innerHTML = `<div class="no-results"><p>Erro ao carregar: ${esc(error?.message || error)}</p></div>`;
    }
}

async function loadCatalog(forceRefresh) {
    const res = await call('get_catalog', { forceRefresh });
    state.catalogApps = res.apps || [];
    state.apps = [...state.catalogApps];
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
        state.installedApps = res.apps || [];
    } catch {
        state.installedApps = state.catalogApps.filter(a => a.installed);
    }
}

async function loadCategories() {
    try {
        const cats = await call('get_categories');
        renderCategories(cats);
    } catch (e) {
        console.error(e);
    }
}

async function loadDownloadsPath() {
    try {
        const p = await call('get_downloads_path');
        dom.downloadsPath.textContent = 'Downloads salvos em: ' + p;
    } catch {
        /* fora do Tauri (navegador) */
    }
}

async function refreshCatalog() {
    showStatus('Buscando no GitHub...');
    try {
        await Promise.all([loadCatalog(true), loadInstalled()]);
        renderAll();
        await updateAllButton();
    } catch (e) {
        showStatus('Erro ao atualizar: ' + (e?.message || e));
    }
}

function onSearchKey(e) {
    if (e.key === 'Enter') {
        searchGitHub();
        return;
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        const q = dom.searchInput.value.trim();
        if (q.length >= 3) {
            searchGitHub();
        } else if (q.length === 0) {
            state.apps = [...state.catalogApps];
            state.currentFilter = 'all';
            dom.storeTitle.textContent = 'NÃO INSTALADOS';
            renderAll();
        }
    }, 600);
}

async function searchGitHub() {
    const q = dom.searchInput.value.trim();
    if (!q) {
        state.apps = [...state.catalogApps];
        state.currentFilter = 'all';
        dom.storeTitle.textContent = 'NÃO INSTALADOS';
        renderAll();
        return;
    }
    showStatus(`Buscando "${q}" no GitHub...`);
    try {
        const res = await call('search_apps', { query: q });
        state.apps = res.apps || [];
        state.currentFilter = 'all';
        dom.storeTitle.textContent = `RESULTADOS PARA "${q.toUpperCase()}" (${res.total})`;
        renderAll();
        await updateAllButton();
        showStatus(`${res.total} resultados para "${q}"`);
    } catch (e) {
        showStatus('Erro na busca: ' + (e?.message || e));
    }
}

function filterByCategory(cat) {
    restoreCatalogView();
    state.currentFilter = cat;
    state.currentSearch = '';
    dom.searchInput.value = '';
    dom.storeTitle.textContent = cat.toUpperCase();
    renderAll();
    toggleMenu();
}

function showAllApps() {
    restoreCatalogView();
    state.currentFilter = 'all';
    state.currentSearch = '';
    dom.searchInput.value = '';
    dom.storeTitle.textContent = 'NÃO INSTALADOS';
    renderAll();
    toggleMenu();
}

function showInstalled() {
    restoreCatalogView();
    state.currentFilter = 'installed';
    dom.storeTitle.textContent = 'INSTALADOS';
    renderAll();
    toggleMenu();
}

function showUpdates() {
    restoreCatalogView();
    state.currentFilter = 'updates';
    dom.storeTitle.textContent = 'ATUALIZAÇÕES DISPONÍVEIS';
    renderAll();
    toggleMenu();
}

async function updateAllButton() {
    try {
        const res = await call('get_apps_to_update');
        const n = res.total || 0;
        dom.updateCount.textContent = `ATUALIZAR ${n} APLICATIVO${n === 1 ? '' : 'S'}`;
        dom.updateCount.parentElement.disabled = n === 0;
    } catch (e) {
        console.error(e);
    }
}

async function updateAll() {
    try {
        const res = await call('get_apps_to_update');
        const updates = res.apps || [];
        if (updates.length === 0) {
            showStatus('Nenhum aplicativo para atualizar');
            return;
        }
        for (const app of updates) await downloadApp(app.id);
    } catch (e) {
        showStatus('Erro: ' + (e?.message || e));
    }
}

async function downloadApp(appId) {
    try {
        const app = findApp(appId);
        openDownloadModal(app ? app.name : appId);
        const res = await call('download_app', { appId });
        if (res && res.success === false) {
            dom.downloadStatus.textContent = res.message || 'Falha no download';
        }
    } catch (e) {
        dom.downloadStatus.textContent = 'Erro: ' + (e?.message || e);
    }
}

async function cancelDownload() {
    const active = Object.keys(state.downloading).find(id =>
        state.downloading[id].status === 'baixando' || state.downloading[id].status === 'iniciando',
    );
    if (active) {
        try { await call('cancel_download', { appId: active }); } catch { /* noop */ }
    }
    closeDownloadModal();
}

async function openInstalled(appId) {
    try {
        await call('open_installed', { appId });
        showStatus('Abrindo aplicativo...');
    } catch (e) {
        showStatus('Erro ao abrir: ' + (e?.message || e));
    }
}

async function uninstallApp(appId) {
    if (!confirm('Desinstalar este aplicativo? O arquivo baixado será removido.')) return;
    try {
        await call('uninstall_app', { appId });
        showStatus('Aplicativo desinstalado');
        await Promise.all([loadCatalog(false), loadInstalled()]);
        renderAll();
        await updateAllButton();
    } catch (e) {
        showStatus('Erro: ' + (e?.message || e));
    }
}

function openGitHub(url) {
    const safe = safeUrl(url);
    if (!safe) return;
    call('open_url', { url: safe }).catch(console.error);
}

function openAppDetail(appId) {
    const app = findApp(appId);
    if (app) renderAppDetail(app);
}

async function saveToken() {
    const token = dom.githubTokenInput.value;
    try {
        await call('save_github_token', { token });
        showStatus('Token salvo. Atualizando catálogo...');
        await Promise.all([loadCatalog(true), loadInstalled()]);
        renderAll();
    } catch (e) {
        showStatus('Erro ao salvar token: ' + (e?.message || e));
    }
}

function bindEvents() {
    dom.sortSelect.addEventListener('change', () => {
        state.currentSort = dom.sortSelect.value;
        renderAll();
    });

    dom.searchInput.addEventListener('keyup', onSearchKey);

    document.addEventListener('error', (e) => {
        const img = e.target;
        if (img instanceof HTMLImageElement && img.dataset.fallback && !img.dataset.fallbackApplied) {
            img.dataset.fallbackApplied = '1';
            img.src = img.dataset.fallback;
        }
    }, true);

    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;

        const action = el.dataset.action;
        if (action === 'filter-category' || action === 'show-all-apps' || action === 'show-installed' || action === 'show-updates') {
            e.preventDefault();
        }
        e.stopPropagation();

        const appId = el.dataset.appId;
        switch (action) {
            case 'filter-category': filterByCategory(el.dataset.category); break;
            case 'show-all-apps': showAllApps(); break;
            case 'show-installed': showInstalled(); break;
            case 'show-updates': showUpdates(); break;
            case 'toggle-menu': toggleMenu(); break;
            case 'update-all': updateAll(); break;
            case 'refresh-catalog': refreshCatalog(); break;
            case 'search-github': searchGitHub(); break;
            case 'save-token': saveToken(); break;
            case 'close-detail-modal': closeDetailModal(); break;
            case 'cancel-download': cancelDownload(); break;
            case 'close-all-modals': closeAllModals(); break;
            case 'download': downloadApp(appId); break;
            case 'open-installed': openInstalled(appId); break;
            case 'uninstall': uninstallApp(appId); break;
            case 'detail': openAppDetail(appId); break;
            case 'open-url': openGitHub(el.dataset.url); break;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });
}

document.addEventListener('DOMContentLoaded', init);
