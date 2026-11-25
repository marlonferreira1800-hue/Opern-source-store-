export const state = {
    catalogApps: [],
    apps: [],
    installedApps: [],
    currentFilter: 'all',
    currentSort: 'trust',
    currentSearch: '',
    viewMode: 'grid',
    downloading: {},
};

export function findApp(appId) {
    return state.apps.find(a => a.id === appId)
        || state.catalogApps.find(a => a.id === appId)
        || state.installedApps.find(a => a.id === appId);
}

export function restoreCatalogView() {
    state.apps = [...state.catalogApps];
}

export function getInstalledList() {
    return state.installedApps.length > 0
        ? state.installedApps
        : state.catalogApps.filter(a => a.installed);
}

export function getFilteredApps() {
    let list = state.currentFilter === 'installed'
        ? (state.installedApps.length > 0 ? [...state.installedApps] : state.apps.filter(a => a.installed))
        : [...state.apps];

    if (state.currentFilter === 'installed') {
        list = list.filter(a => a.installed);
    } else if (state.currentFilter === 'updates') {
        list = list.filter(a => a.has_update);
    } else if (state.currentFilter !== 'all') {
        const target = state.currentFilter.toLowerCase();
        list = list.filter(a =>
            (a.category || '').toLowerCase() === target ||
            (a.tags || []).some(t => t.toLowerCase() === target),
        );
    } else {
        list = list.filter(a => !a.installed);
    }

    if (state.currentSearch) {
        const q = state.currentSearch.toLowerCase();
        list = list.filter(a =>
            a.name.toLowerCase().includes(q) ||
            (a.tagline || '').toLowerCase().includes(q) ||
            (a.description || '').toLowerCase().includes(q) ||
            a.author.toLowerCase().includes(q) ||
            (a.tags || []).some(t => t.toLowerCase().includes(q)),
        );
    }

    list.sort((a, b) => {
        switch (state.currentSort) {
            case 'trust': return (b.trust_score || 0) - (a.trust_score || 0) || (b.stars || 0) - (a.stars || 0);
            case 'name_asc': return a.name.localeCompare(b.name);
            case 'name_desc': return b.name.localeCompare(a.name);
            case 'stars': return b.stars - a.stars;
            case 'downloads': return b.downloads - a.downloads;
            case 'recent': return (b.published_at || b.pushed_at || '').localeCompare(a.published_at || a.pushed_at || '');
            default: return (b.trust_score || 0) - (a.trust_score || 0);
        }
    });
    return list;
}
