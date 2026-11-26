import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const isTauri = Boolean(window.__TAURI_INTERNALS__);

const DEMO_CATEGORIES = [
    { name: 'Development' }, { name: 'Utilities' }, { name: 'Internet' },
    { name: 'Multimedia' }, { name: 'Graphics' }, { name: 'Office' },
    { name: 'Security' }, { name: 'Games' }, { name: 'Science' }, { name: 'Other' },
];

export async function call(cmd, args = {}) {
    if (isTauri) return invoke(cmd, args);
    return webCall(cmd, args);
}

export async function onDownloadProgress(handler) {
    if (!isTauri) return () => {};
    return listen('download-progress', (event) => handler(event.payload));
}

const ALLOWED_LICENSES = new Set([
    'MIT', 'Apache-2.0', 'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later',
    'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-2.1', 'LGPL-3.0',
    'BSD-2-Clause', 'BSD-3-Clause', 'MPL-2.0', 'ISC', 'Unlicense', 'Zlib',
    'EUPL-1.2', 'AGPL-3.0', 'BSL-1.0', 'CC0-1.0', '0BSD',
]);
const BLOCKED_TERMS = [
    'crack', 'keygen', 'warez', 'stealer', 'ransomware', 'rootkit', 'botnet',
    'free-claude', 'free-gpt', 'unlimited-api', 'v2ray', 'shadowsocks',
    'sing-box', 'awesome-', 'list-of', 'hiring-without', 'cheatsheet',
];
const BLOCKED_NAME_TERMS = [
    'bypass', 'paywall', 'keylogger', 'bruteforce', 'ddos', 'pentest',
    'exploit', 'phishing', 'tutorial', 'course', 'roadmap', 'interview',
];

function isSafeDemoRepo(it) {
    if (!it || it.fork || it.archived || it.disabled) return false;
    const spdx = it.license?.spdx_id || '';
    if (!ALLOWED_LICENSES.has(spdx)) return false;
    const ageDays = it.created_at ? (Date.now() - Date.parse(it.created_at)) / 86_400_000 : 0;
    if (ageDays < 90) return false;
    const nameTopics = `${it.full_name || ''} ${(it.topics || []).join(' ')}`.toLowerCase();
    const allText = `${nameTopics} ${(it.description || '').toLowerCase()}`;
    if (BLOCKED_TERMS.some(t => allText.includes(t))) return false;
    if (BLOCKED_NAME_TERMS.some(t => nameTopics.includes(t))) return false;
    return true;
}

function seedCatalogUrl() {
    // No GitHub Pages (<user>.github.io/<repo>/), deriva o dono/repo do próprio endereço.
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    const repo = m && location.pathname.split('/')[1];
    if (m && repo) return `https://raw.githubusercontent.com/${m[1]}/${repo}/main/data/catalog-seed.json`;
    return 'https://raw.githubusercontent.com/marlonferreira1800-hue/open-source-store/main/data/catalog-seed.json';
}

function seedEntryToApp(e) {
    const repo = e.repo || {};
    const rel = e.release || {};
    const asset = (rel.assets || [])[0] || {};
    return {
        id: repo.full_name,
        name: repo.name,
        tagline: repo.description || '',
        description: repo.description || '',
        category: e.category || (repo.topics && repo.topics[0]) || 'Other',
        author: repo.owner?.login || '',
        version: rel.tag_name || '',
        license: repo.license ? repo.license.spdx_id : 'Unknown',
        stars: repo.stargazers_count || 0,
        pushed_at: repo.pushed_at || '',
        downloads: 0,
        icon_url: repo.owner?.avatar_url || '',
        github_url: repo.html_url || '',
        homepage: repo.homepage || '',
        release_url: rel.html_url || ((repo.html_url || '') + '/releases'),
        download_url: asset.browser_download_url || '',
        file_name: asset.name || '',
        size_bytes: asset.size || 0,
        sha256: asset.digest || null,
        published_at: rel.published_at || '',
        tags: repo.topics || [],
        trust_score: e.trust_score || 0,
        security_flags: e.security_flags || ['osi-license'],
        warnings: asset.digest ? [] : ['no-sha256-digest'],
        installed: false,
        installed_version: null,
        has_update: false,
        installed_path: null,
    };
}

async function fetchSeedCatalog() {
    try {
        const r = await fetch(seedCatalogUrl());
        if (!r.ok) return null;
        const seed = await r.json();
        const apps = (Array.isArray(seed) ? seed : []).map(seedEntryToApp).filter(a => a.id);
        if (!apps.length) return null;
        return { apps, total: apps.length, from_cache: false, from_seed: true, offline: false, fetched_at: new Date().toISOString() };
    } catch {
        return null;
    }
}

async function webCall(cmd, args) {
    if (cmd === 'get_catalog' || cmd === 'search_apps') {
        // Catálogo padrão (sem busca): usa o snapshot curado do próprio repositório,
        // que não consome rate limit da API e traz apps validados com releases reais.
        if (!args.query) {
            const seed = await fetchSeedCatalog();
            if (seed) return seed;
        }
        const since = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10);
        const q = args.query
            ? `${args.query} stars:>=1000 pushed:>=${since} fork:false archived:false in:name,description,readme`
            : `stars:>=2000 pushed:>=${since} fork:false archived:false`;
        const r = await fetch(
            `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`,
            { headers: { Accept: 'application/vnd.github+json' } },
        );
        if (!r.ok) throw new Error(`GitHub API HTTP ${r.status} (limite de requisições atingido?)`);
        const j = await r.json();
        const items = (j.items || []).filter(isSafeDemoRepo).map(it => {
            const ageDays = it.created_at ? (Date.now() - Date.parse(it.created_at)) / 86_400_000 : 0;
            const flags = ['osi-license'];
            if (ageDays >= 730) flags.push('mature-repo');
            return {
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
                trust_score: Math.min(70, 35 + Math.round(Math.log10(Math.max(it.stargazers_count || 1, 10)) * 5)),
                security_flags: flags,
                warnings: ['no-sha256-digest'],
                installed: false,
                installed_version: null,
                has_update: false,
                installed_path: null,
            };
        });
        return { apps: items, total: items.length, from_cache: false, offline: false, fetched_at: new Date().toISOString() };
    }
    if (cmd === 'get_categories') return DEMO_CATEGORIES;
    if (cmd === 'get_installed' || cmd === 'get_apps_to_update') {
        return { apps: [], total: 0, from_cache: false, offline: false, fetched_at: '' };
    }
    if (cmd === 'open_url') {
        window.open(args.url, '_blank', 'noopener,noreferrer');
        return;
    }
    throw new Error('Disponível apenas no app desktop (abra com npm run tauri:dev)');
}
