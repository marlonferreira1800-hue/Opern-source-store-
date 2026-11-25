import { esc, formatBytes, formatDatePtBr, safeUrl } from '../utils/format.js';
import { getFilteredApps, getInstalledList, state } from '../state/store.js';

const DEFAULT_ICON = 'assets/icons/app_default.png';

export const dom = {
    appsGrid: document.getElementById('apps-grid'),
    installedGrid: document.getElementById('installed-grid'),
    sectionInstalled: document.getElementById('section-installed'),
    storeTitle: document.getElementById('store-title'),
    searchInput: document.getElementById('search-input'),
    sortSelect: document.getElementById('sort-select'),
    tabApps: document.getElementById('tab-apps'),
    tabInstalled: document.getElementById('tab-installed'),
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
    notifDot: document.getElementById('notif-dot'),
    updateCount: document.getElementById('update-count'),
    statusBar: document.getElementById('status-bar'),
    appDetailModal: document.getElementById('app-detail-modal'),
    appDetailContent: document.getElementById('app-detail-content'),
    downloadModal: document.getElementById('download-modal'),
    downloadTitle: document.getElementById('download-title'),
    progressFill: document.getElementById('progress-fill'),
    downloadStatus: document.getElementById('download-status'),
    downloadInfo: document.getElementById('download-info'),
    menuSidebar: document.getElementById('menu-sidebar'),
    modalOverlay: document.getElementById('modal-overlay'),
    sidebarCategories: document.getElementById('sidebar-categories'),
    downloadsPath: document.getElementById('downloads-path'),
    githubTokenInput: document.getElementById('github-token-input'),
};

export function showStatus(msg, ms = 4000) {
    dom.statusBar.textContent = msg;
    dom.statusBar.classList.remove('hidden');
    clearTimeout(showStatus._timer);
    showStatus._timer = setTimeout(() => dom.statusBar.classList.add('hidden'), ms);
}

function appCardHtml(app) {
    const dl = state.downloading[app.id];
    const isDl = Boolean(dl) && (dl.status === 'baixando' || dl.status === 'iniciando');
    const idAttr = esc(app.id);
    const ghHref = esc(safeUrl(app.github_url));

    const versionHtml = app.has_update
        ? `<span class="app-version version-upgrade">${esc(app.installed_version || '?')} &#8594; ${esc(app.version || '?')}</span>`
        : `<span class="app-version">${app.version ? 'V' + esc(app.version) : 'SEM RELEASE'}</span>`;

    const statusPillHtml = app.has_update
        ? '<span class="status-pill status-pill--update">ATUALIZAÇÃO DISPONÍVEL</span>'
        : (!app.installed ? '<span class="status-pill status-pill--available">DISPONÍVEL PARA INSTALAR</span>' : '');

    const sizeLine = app.size_bytes > 0
        ? `<div class="app-meta-line">Tamanho do download: <span class="app-meta-val">${esc(formatBytes(app.size_bytes))}</span></div>`
        : '';

    const updatedLine = `<div class="app-meta-line">Última atualização: <span class="app-meta-val">${esc(formatDatePtBr(app.pushed_at || app.published_at))}</span></div>`;

    let primaryActionsHtml;
    if (isDl) {
        primaryActionsHtml = `<button class="btn btn-secondary btn-small" disabled>${Math.round(dl.percent)}%</button>`;
    } else if (app.installed && app.has_update) {
        const installedVer = app.installed_version ? ' ' + esc(app.installed_version) : '';
        primaryActionsHtml = `
            <button class="btn btn-secondary btn-small" data-action="open-installed" data-app-id="${idAttr}">ABRIR${installedVer}</button>
            <button class="btn btn-contrast btn-small" data-action="download" data-app-id="${idAttr}">ATUALIZAR</button>
        `;
    } else if (app.installed) {
        primaryActionsHtml = `<button class="btn btn-secondary btn-small" data-action="open-installed" data-app-id="${idAttr}">ABRIR</button>`;
    } else if (!app.download_url) {
        primaryActionsHtml = `<button class="btn btn-secondary btn-small" data-action="open-url" data-url="${ghHref}">VER NO GITHUB</button>`;
    } else {
        primaryActionsHtml = `<button class="btn btn-secondary btn-small" data-action="download" data-app-id="${idAttr}">INSTALAR</button>`;
    }

    const hasSha = Boolean(app.sha256) || (app.security_flags || []).includes('sha256-verified');
    const score = Number(app.trust_score || 0);
    const trustTitle = score > 0
        ? `Segurança: ${score}/100${hasSha ? ' • SHA-256' : ''}`
        : 'Detalhes de segurança';

    const cardClasses = [
        'app-card',
        app.installed ? 'is-installed' : '',
        app.has_update ? 'has-update' : '',
    ].filter(Boolean).join(' ');

    return `
        <div class="${cardClasses}" data-action="detail" data-app-id="${idAttr}">
            <div class="app-card-top">
                ${versionHtml}
                <button class="github-link-btn" title="Ver no GitHub" data-action="open-url" data-url="${ghHref}">GITHUB &#8599;</button>
            </div>
            <div class="app-card-header">
                <img src="${esc(safeUrl(app.icon_url) || DEFAULT_ICON)}" alt="${esc(app.name)}" class="app-icon" loading="lazy" data-fallback="${DEFAULT_ICON}" />
                <div class="app-card-titles">
                    <div class="app-name">${esc(app.name)}</div>
                    <span class="author-badge">POR ${esc((app.author || 'DESCONHECIDO').toUpperCase())}</span>
                    <div class="app-subtitle">${esc(app.tagline || '')}</div>
                </div>
            </div>
            ${statusPillHtml}
            <div class="app-meta-block">
                ${sizeLine}
                <p class="app-desc">${esc(app.description || app.tagline || '')}</p>
                ${updatedLine}
            </div>
            <div class="app-actions">
                ${primaryActionsHtml}
                <button class="square-tool-btn ${score >= 75 ? 'trust-high' : 'trust-med'}" title="${esc(trustTitle)}" data-action="detail" data-app-id="${idAttr}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </button>
                <button class="square-tool-btn" title="Detalhes" data-action="detail" data-app-id="${idAttr}">&#8943;</button>
            </div>
        </div>
    `;
}

export function renderAll() {
    const list = getFilteredApps();
    const installed = getInstalledList();
    const isList = state.viewMode === 'list';

    dom.appsGrid.classList.toggle('apps-grid--list', isList);
    dom.installedGrid.classList.toggle('apps-grid--list', isList);

    if (installed.length > 0 && state.currentFilter !== 'installed') {
        dom.sectionInstalled.classList.remove('hidden');
        dom.installedGrid.innerHTML = installed.map(appCardHtml).join('');
    } else {
        dom.sectionInstalled.classList.add('hidden');
    }

    if (list.length === 0) {
        dom.appsGrid.innerHTML = '<div class="no-results"><p>Nenhum aplicativo encontrado.</p></div>';
        return;
    }
    dom.appsGrid.innerHTML = list.map(appCardHtml).join('');
}

export function renderCategories(categories) {
    dom.sidebarCategories.innerHTML = (categories || []).map(c => `
        <div class="sidebar-category">
            <a href="#" class="sidebar-link" data-action="filter-category" data-category="${esc(c.name)}">
                <span>${esc(c.name)}</span>
            </a>
        </div>
    `).join('');
}

export function renderAppDetail(app) {
    const dl = state.downloading[app.id];
    const idAttr = esc(app.id);
    const ghHref = esc(safeUrl(app.github_url));
    const homeHref = esc(safeUrl(app.homepage));
    const descHtml = esc(app.description || '').replace(/\n/g, '<br>');

    const flagLabels = {
        'osi-license': 'Licença OSI',
        'sha256-verified': 'SHA-256 Verificado',
        'security-policy': 'SECURITY.md',
        'verified-org': 'Organização',
        'mature-repo': 'Projeto Maduro',
    };
    const warningLabels = {
        'no-sha256-digest': 'A release atual não fornece checksum SHA-256 nativo; verifique no repositório oficial antes de executar.',
    };
    const flagsHtml = (app.security_flags || []).length
        ? `<div class="security-flags">${app.security_flags.map(f => `<span class="security-flag">&#10003; ${esc(flagLabels[f] || f)}</span>`).join('')}</div>`
        : '';
    const warningsHtml = (app.warnings || []).length
        ? `<div class="security-warning">&#9888; ${app.warnings.map(w => esc(warningLabels[w] || w)).join(' ')}</div>`
        : '';

    dom.appDetailContent.innerHTML = `
        <div class="app-detail-header">
            <img src="${esc(safeUrl(app.icon_url) || DEFAULT_ICON)}" alt="${esc(app.name)}" class="app-detail-icon" data-fallback="${DEFAULT_ICON}" />
            <div class="app-detail-info">
                <h1 class="app-detail-name">${esc(app.name)}</h1>
                <p class="app-detail-tagline">${esc(app.tagline || '')}</p>
                <div class="app-detail-meta">
                    <div class="meta-item"><span class="meta-label">Versão</span><span class="meta-value">${esc(app.version || '-')}</span></div>
                    <div class="meta-item"><span class="meta-label">Tamanho</span><span class="meta-value">${formatBytes(app.size_bytes)}</span></div>
                    <div class="meta-item"><span class="meta-label">Licença</span><span class="meta-value">${esc(app.license)}</span></div>
                    <div class="meta-item"><span class="meta-label">Segurança</span><span class="meta-value">${app.trust_score ? esc(app.trust_score + '/100') : '-'}</span></div>
                    <div class="meta-item"><span class="meta-label">Integridade</span><span class="meta-value">${app.sha256 ? 'SHA-256 OK' : ((app.security_flags || []).includes('sha256-verified') ? 'Checksum na release' : 'Não informado')}</span></div>
                    <div class="meta-item"><span class="meta-label">Autor</span><span class="meta-value">${esc(app.author)}</span></div>
                    <div class="meta-item"><span class="meta-label">★ Estrelas</span><span class="meta-value">${(app.stars || 0).toLocaleString('pt-BR')}</span></div>
                    <div class="meta-item"><span class="meta-label">Última atividade</span><span class="meta-value">${app.pushed_at ? esc(app.pushed_at.slice(0, 10)) : '-'}</span></div>
                    <div class="meta-item"><span class="meta-label">Categoria</span><span class="meta-value">${esc(app.category)}</span></div>
                </div>
                ${flagsHtml}
                ${warningsHtml}
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
    dom.appDetailModal.classList.remove('hidden');
    dom.modalOverlay.classList.remove('hidden');
}

export function openDownloadModal(appName) {
    dom.downloadTitle.textContent = `Baixando ${appName}...`;
    dom.downloadStatus.textContent = 'Iniciando download...';
    dom.downloadInfo.textContent = '';
    dom.progressFill.style.width = '0%';
    dom.downloadModal.classList.remove('hidden');
    dom.modalOverlay.classList.remove('hidden');
}

export function updateDownloadModal(p) {
    if (dom.downloadModal.classList.contains('hidden')) return;
    dom.progressFill.style.width = Math.min(100, p.percent) + '%';
    const statusText = {
        iniciando: 'Iniciando download...',
        baixando: 'Baixando...',
        'concluído': 'Download concluído!',
        cancelado: 'Download cancelado',
    }[p.status] || p.status;
    dom.downloadStatus.textContent = statusText;
    dom.downloadInfo.textContent = `${Math.round(p.percent)}% — ${formatBytes(p.downloaded_bytes)}${p.total_bytes ? ' / ' + formatBytes(p.total_bytes) : ''} — ${p.file_name}`;
}

export function closeDetailModal() {
    dom.appDetailModal.classList.add('hidden');
    if (dom.downloadModal.classList.contains('hidden')) dom.modalOverlay.classList.add('hidden');
}

export function closeDownloadModal() {
    dom.downloadModal.classList.add('hidden');
    if (dom.appDetailModal.classList.contains('hidden')) dom.modalOverlay.classList.add('hidden');
}

export function closeAllModals() {
    closeDetailModal();
    closeDownloadModal();
}

export function toggleMenu() {
    dom.menuSidebar.classList.toggle('hidden');
}
