// Import Tauri API
import { invoke } from '@tauri-apps/api/core';

// Global state
let apps = [];
let categories = [];
let currentFilter = 'all';
let currentSort = 'name_asc';
let currentSearch = '';

// DOM elements
const appsGrid = document.getElementById('apps-grid');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const updateCount = document.getElementById('update-count');
const updateBanner = document.getElementById('update-banner');
const appDetailModal = document.getElementById('app-detail-modal');
const appDetailContent = document.getElementById('app-detail-content');
const downloadModal = document.getElementById('download-modal');
const progressFill = document.getElementById('progress-fill');
const downloadStatus = document.getElementById('download-status');
const downloadInfo = document.getElementById('download-info');
const menuSidebar = document.getElementById('menu-sidebar');
const modalOverlay = document.getElementById('modal-overlay');
const sidebarCategories = document.getElementById('sidebar-categories');

// Active download
let activeDownload = null;
let downloadAbort = false;

// Initialize app
async function init() {
    try {
        // Load apps and categories
        await Promise.all([
            loadApps(),
            loadCategories(),
            checkUpdates()
        ]);
        
        // Render initial apps
        renderApps();
        renderCategories();
        
        // Update UI
        updateAllButton();
        
        console.log('Open Source Store initialized successfully');
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Failed to load application data');
    }
}

// Load apps from Rust backend
async function loadApps() {
    try {
        apps = await invoke('get_apps');
        apps = apps.apps || [];
        console.log('Loaded', apps.length, 'apps');
    } catch (error) {
        console.error('Failed to load apps:', error);
    }
}

// Load categories from Rust backend
async function loadCategories() {
    try {
        const response = await invoke('get_categories');
        categories = response.categories || [];
        console.log('Loaded', categories.length, 'categories');
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

// Check for updates
async function checkUpdates() {
    try {
        const response = await invoke('get_apps_to_update');
        const updates = response.apps || [];
        
        if (updates.length > 0) {
            updateBanner.classList.remove('hidden');
            updateCount.textContent = `ATUALIZAR ${updates.length} APLICATIVO${updates.length > 1 ? 'S' : ''}`;
        } else {
            updateBanner.classList.add('hidden');
            updateCount.textContent = 'ATUALIZAR 0 APLICATIVO';
        }
    } catch (error) {
        console.error('Failed to check updates:', error);
    }
}

// Update all button text
function updateAllButton() {
    const updates = apps.filter(app => app.has_update);
    updateCount.textContent = `ATUALIZAR ${updates.length} APLICATIVO${updates.length > 1 ? 'S' : ''}`;
}

// Render categories in sidebar
function renderCategories() {
    if (!sidebarCategories) return;
    
    sidebarCategories.innerHTML = '';
    
    categories.forEach(category => {
        const categoryEl = document.createElement('div');
        categoryEl.className = 'sidebar-category';
        categoryEl.innerHTML = `
            <a href="#" class="sidebar-link" onclick="filterByCategory('${category.name}')">
                <span>${category.name}</span>
            </a>
        `;
        sidebarCategories.appendChild(categoryEl);
    });
}

// Filter apps by category
function filterByCategory(category) {
    currentFilter = category;
    currentSearch = '';
    searchInput.value = '';
    renderApps();
    toggleMenu();
}

// Show all apps
function showAllApps() {
    currentFilter = 'all';
    currentSearch = '';
    searchInput.value = '';
    renderApps();
    toggleMenu();
}

// Show featured apps
function showFeaturedApps() {
    currentFilter = 'featured';
    currentSearch = '';
    searchInput.value = '';
    renderApps();
    toggleMenu();
}

// Show popular apps
function showPopularApps() {
    currentFilter = 'popular';
    currentSearch = '';
    searchInput.value = '';
    renderApps();
    toggleMenu();
}

// Show recent apps
function showRecentApps() {
    currentFilter = 'recent';
    currentSearch = '';
    searchInput.value = '';
    renderApps();
    toggleMenu();
}

// Sort apps
function sortApps() {
    currentSort = sortSelect.value;
    renderApps();
}

// Search apps
function searchApps() {
    currentSearch = searchInput.value.toLowerCase();
    currentFilter = 'all';
    renderApps();
}

// Render apps
function renderApps() {
    if (!appsGrid) return;
    
    let filteredApps = [...apps];
    
    // Apply filter
    if (currentFilter === 'featured') {
        filteredApps = filteredApps.filter(app => app.featured);
    } else if (currentFilter === 'popular') {
        filteredApps = filteredApps.filter(app => app.popular);
    } else if (currentFilter === 'recent') {
        filteredApps = filteredApps.filter(app => app.recent);
    } else if (currentFilter !== 'all') {
        filteredApps = filteredApps.filter(app => app.category === currentFilter);
    }
    
    // Apply search
    if (currentSearch) {
        filteredApps = filteredApps.filter(app => 
            app.name.toLowerCase().includes(currentSearch) ||
            app.tagline.toLowerCase().includes(currentSearch) ||
            app.description.toLowerCase().includes(currentSearch) ||
            (app.description_pt || '').toLowerCase().includes(currentSearch) ||
            app.author.toLowerCase().includes(currentSearch) ||
            app.category.toLowerCase().includes(currentSearch) ||
            (app.tags || []).some(tag => tag.toLowerCase().includes(currentSearch))
        );
    }
    
    // Apply sort
    filteredApps.sort((a, b) => {
        switch (currentSort) {
            case 'name_asc':
                return a.name.localeCompare(b.name);
            case 'name_desc':
                return b.name.localeCompare(a.name);
            case 'recent':
                return b.recent - a.recent || b.last_update?.localeCompare(a.last_update) || 0;
            case 'popular':
                return b.downloads - a.downloads;
            case 'rating':
                return b.rating - a.rating;
            default:
                return a.name.localeCompare(b.name);
        }
    });
    
    // Render
    if (filteredApps.length === 0) {
        appsGrid.innerHTML = `
            <div class="no-results">
                <p>Nenhum aplicativo encontrado</p>
            </div>
        `;
        return;
    }
    
    appsGrid.innerHTML = filteredApps.map(app => `
        <div class="app-card ${app.has_update ? 'has-update' : ''}" onclick="openAppDetail('${app.id}')">
            <div class="app-card-header">
                <img src="assets/icons/${app.icon || 'app_default.png'}" alt="${app.name}" class="app-icon" onerror="this.src='assets/icons/app_default.png'" />
                <div class="app-header-right">
                    <div class="app-version">V${app.version}</div>
                </div>
            </div>
            <div class="app-name">${app.name}</div>
            <div class="app-tagline">${app.tagline}</div>
            ${app.description_pt ? `<div class="app-description">${app.description_pt}</div>` : ''}
            ${app.last_update ? `<div class="app-info">Última atualização: ${app.last_update}</div>` : ''}
            <div class="app-download-size">Tamanho do download: ${app.size_mb} MB</div>
            <div class="app-actions">
                ${app.has_update ? `
                    <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); updateApp('${app.id}')">ATUALIZAR</button>
                ` : `
                    <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); downloadApp('${app.id}')">DISPONÍVEL PARA INSTALAR</button>
                `}
                <button class="btn btn-icon github-btn" onclick="event.stopPropagation(); openGitHub('${app.github_url || app.download_url}')">GITHUB</button>
                <button class="btn btn-icon" onclick="event.stopPropagation(); showMoreOptions('${app.id}')">...</button>
            </div>
        </div>
    `).join('');
}

// Open app detail modal
async function openAppDetail(appId) {
    try {
        const response = await invoke('get_app_by_id', { appId });
        const app = response.app;
        
        if (!app) {
            showError('Aplicativo não encontrado');
            return;
        }
        
        appDetailContent.innerHTML = `
            <div class="app-detail-header">
                <img src="assets/icons/${app.icon || 'app_default.png'}" alt="${app.name}" class="app-detail-icon" onerror="this.src='assets/icons/app_default.png'" />
                <div class="app-detail-info">
                    <h1 class="app-detail-name">${app.name}</h1>
                    <p class="app-detail-tagline">${app.tagline}</p>
                    <div class="app-detail-meta">
                        <div class="meta-item">
                            <span class="meta-label">Versão</span>
                            <span class="meta-value">V${app.version}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Tamanho</span>
                            <span class="meta-value">${app.size_mb} MB</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Licença</span>
                            <span class="meta-value">${app.license}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Autor</span>
                            <span class="meta-value">${app.author}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="app-detail-description">
                ${app.description_pt || app.description}
            </div>
            
            ${app.screenshots && app.screenshots.length > 0 ? `
                <div class="app-detail-section">
                    <h3>Screenshots</h3>
                    <div class="screenshots-grid">
                        ${app.screenshots.map(url => `
                            <img src="${url}" alt="Screenshot" class="screenshot-img" onerror="this.style.display='none'" />
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="app-detail-section">
                <div class="app-actions">
                    ${app.has_update ? `
                        <button class="btn btn-primary" onclick="updateApp('${app.id}')">ATUALIZAR</button>
                    ` : `
                        <button class="btn btn-secondary" onclick="downloadApp('${app.id}')">DISPONÍVEL PARA INSTALAR</button>
                    `}
                    <button class="btn btn-secondary github-btn" onclick="openGitHub('${app.github_url || app.download_url}')">ABRIR NO GITHUB</button>
                </div>
            </div>
        `;
        
        appDetailModal.classList.remove('hidden');
        modalOverlay.classList.remove('hidden');
    } catch (error) {
        console.error('Failed to load app details:', error);
        showError('Failed to load app details');
    }
}

// Close detail modal
function closeDetailModal() {
    appDetailModal.classList.add('hidden');
    modalOverlay.classList.add('hidden');
}

// Download app
async function downloadApp(appId) {
    try {
        const response = await invoke('get_app_by_id', { appId });
        const app = response.app;
        
        if (!app) {
            showError('Aplicativo não encontrado');
            return;
        }
        
        // Show download modal
        downloadStatus.textContent = `Baixando ${app.name}...`;
        downloadInfo.textContent = `0% - 0 MB / ${app.size_mb} MB`;
        progressFill.style.width = '0%';
        downloadModal.classList.remove('hidden');
        modalOverlay.classList.remove('hidden');
        downloadAbort = false;
        
        // Start download
        activeDownload = { appId, app };
        
        // Show progress (in a real app, this would be connected to the download event)
        await simulateDownload(app);
        
    } catch (error) {
        console.error('Failed to start download:', error);
        showError('Failed to start download');
    }
}

// Simulate download with progress
async function simulateDownload(app) {
    return new Promise((resolve, reject) => {
        const totalSize = app.size_mb * 1024 * 1024; // Convert to bytes
        let downloaded = 0;
        const interval = setInterval(() => {
            if (downloadAbort) {
                clearInterval(interval);
                downloadStatus.textContent = 'Download cancelado';
                setTimeout(() => {
                    closeDownloadModal();
                }, 2000);
                reject(new Error('Download cancelled'));
                return;
            }
            
            downloaded += totalSize * 0.05; // 5% increment
            const progress = Math.min(100, (downloaded / totalSize) * 100);
            
            progressFill.style.width = `${progress}%`;
            downloadInfo.textContent = `${Math.round(progress)}% - ${Math.round((downloaded / 1024 / 1024) * 100) / 100} MB / ${app.size_mb} MB`;
            
            if (progress >= 100) {
                clearInterval(interval);
                downloadStatus.textContent = 'Download concluído!';
                downloadInfo.textContent = `Arquivo salvo em: Downloads/${app.name.replace(/\s+/g, '_')}.apk`;
                setTimeout(() => {
                    closeDownloadModal();
                    resolve();
                }, 2000);
            }
        }, 300);
    });
}

// Update app
async function updateApp(appId) {
    // In a real app, this would call the update function
    // For now, just download the app
    await downloadApp(appId);
}

// Cancel download
function cancelDownload() {
    downloadAbort = true;
    activeDownload = null;
}

// Close download modal
function closeDownloadModal() {
    downloadModal.classList.add('hidden');
    modalOverlay.classList.add('hidden');
    if (activeDownload) {
        cancelDownload();
    }
}

// Open GitHub URL
function openGitHub(url) {
    if (url) {
        invoke('open_url', { url });
    }
}

// Show more options
function showMoreOptions(appId) {
    console.log('Show more options for app:', appId);
    // In a real app, this would show a context menu
}

// Update all apps
async function updateAll() {
    try {
        const response = await invoke('get_apps_to_update');
        const updates = response.apps || [];
        
        if (updates.length === 0) {
            showError('Nenhum aplicativo para atualizar');
            return;
        }
        
        // Download all updates
        for (const app of updates) {
            await downloadApp(app.id);
        }
        
        // Refresh after updates
        await loadApps();
        renderApps();
        checkUpdates();
        
    } catch (error) {
        console.error('Failed to update all:', error);
        showError('Failed to update all apps');
    }
}

// Update and restart
function updateAndRestart() {
    closeBanner();
    // In a real app, this would update and restart the application
    showSuccess('Atualização iniciada. O aplicativo será reiniciado automaticamente.');
}

// Close banner
function closeBanner() {
    updateBanner.classList.add('hidden');
}

// Toggle menu
function toggleMenu() {
    menuSidebar.classList.toggle('hidden');
}

// Close all modals
function closeAllModals() {
    closeDetailModal();
    closeDownloadModal();
    closeBanner();
}

// Show error
function showError(message) {
    // In a real app, this would show a toast notification
    console.error('Error:', message);
    alert(message);
}

// Show success
function showSuccess(message) {
    // In a real app, this would show a toast notification
    console.log('Success:', message);
    alert(message);
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllModals();
    }
});

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
