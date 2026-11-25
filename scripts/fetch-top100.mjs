// Gera data/curated.json, data/catalog-seed.json e docs/CATALOG_AUDIT.md
// aplicando o funil de 5 Portões definido em data/curation-policy.json:
//   1) Fama Real & Maturidade (estrelas, idade >= 180d, >= 3 releases, downloads reais)
//   2) Atividade Contínua (não-fork, não-arquivado, push e release recentes)
//   3) Segurança & Licença (SPDX OSI obrigatório, blocklist, padrões de risco, SECURITY.md, SHA-256)
//   4) Software Final Instalável (binários desktop reais para Windows/Linux/macOS; zero libs/listas)
//   5) Índice de Qualidade & Segurança (0-100) + diversidade entre categorias
//
// Rode: node scripts/fetch-top100.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(readFileSync(resolve(root, 'data/curation-policy.json'), 'utf8'));
const T = policy.thresholds.curated;

function resolveGithubToken() {
  if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim();
  try {
    const t = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (t) return t;
  } catch {
    // Sem gh CLI autenticado; segue sem token com rate-limit reduzido
  }
  return null;
}

const TOKEN = resolveGithubToken();
const HEADERS = {
  'User-Agent': 'open-source-store-curator/2.0',
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const NOW = Date.now();
const DAY_MS = 86_400_000;
const SINCE_PUSH = new Date(NOW - T.max_inactive_push_days * DAY_MS).toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const daysSince = iso => (iso ? (NOW - Date.parse(iso)) / DAY_MS : Number.POSITIVE_INFINITY);

// Sementes consagradas por categoria para garantir softwares icônicos além do viés da Search API
const FLAGSHIP_SEEDS = [
  // Development & Terminals
  'zed-industries/zed', 'VSCodium/vscodium', 'alacritty/alacritty', 'wezterm/wezterm',
  'helix-editor/helix', 'lapce/lapce', 'neovim/neovim', 'micro-editor/micro',
  'dbeaver/dbeaver', 'usebruno/bruno', 'Kong/insomnia', 'git-ecosystem/git-credential-manager',
  'jesseduffield/lazygit', 'cli/cli', 'BurntSushi/ripgrep', 'sharkdp/bat',
  'junegunn/fzf', 'starship/starship', 'cline/cline', 'gitbutlerapp/gitbutler',
  'WerWolv/ImHex', 'rizinorg/cutter', 'sharkdp/fd', 'astral-sh/uv',
  // Utilities & System
  'microsoft/PowerToys', 'files-community/Files', 'Flow-Launcher/Flow.Launcher',
  'localsend/localsend', 'syncthing/syncthing', 'rustdesk/rustdesk', 'sxyazi/yazi',
  'yorukot/superfile', 'NickeManarin/ScreenToGif', 'ShareX/ShareX', 'flameshot-org/flameshot',
  'hluk/CopyQ', 'ventoy/Ventoy', 'pbatard/rufus', 'balena-io/etcher',
  'rclone/rclone', 'restic/restic', 'chocolatey/choco', 'Devolutions/UniGetUI',
  'winsw/winsw', 'ajeetdsouza/zoxide', 'aristocratos/btop', 'espanso/espanso',
  'fastfetch-cli/fastfetch', 'eza-community/eza',
  // Security & Privacy
  'bitwarden/clients', 'keepassxreboot/keepassxc', 'cryptomator/cryptomator',
  'veracrypt/VeraCrypt', 'tailscale/tailscale', 'rust-lang/rustup',
  'StandardNotes/app', '2fast-team/2fast', 'gopasspw/gopass',
  'FiloSottile/age', 'sigstore/cosign',
  // Internet & Communication
  'qbittorrent/qBittorrent', 'agalwood/Motrix', 'GopeedLab/gopeed',
  'element-hq/element-desktop', 'zulip/zulip-desktop', 'RocketChat/Rocket.Chat.Electron',
  'aria2/aria2', 'yt-dlp/yt-dlp', 'filezilla-project/filezilla',
  'zen-browser/desktop', 'Floorp-Projects/Floorp', 'minbrowser/min',
  'telegramdesktop/tdesktop', 'nicotine-plus/nicotine-plus',
  // Multimedia
  'obsproject/obs-studio', 'mifi/lossless-cut', 'mpv-player/mpv', 'HandBrake/HandBrake',
  'audacity/audacity', 'mltframework/shotcut', 'olive-editor/olive', 'xbmc/xbmc',
  'jellyfin/jellyfin-desktop', 'foobar2000/foobar2000', 'MusicBrainz/picard',
  'clementine-player/Clementine', 'strawberrymusicplayer/strawberry',
  // Graphics & 3D
  'blender/blender', 'FreeCAD/FreeCAD', 'OpenSCAD/openscad', 'inkscape/inkscape',
  'KDE/krita', 'darktable-org/darktable', 'LMMS/lmms', 'OrcaSlicer/OrcaSlicer',
  'prusa3d/PrusaSlicer', 'bambulab/BambuStudio', 'jgraph/drawio-desktop', 'penpot/penpot-desktop',
  // ArtCraft Suite
  'storytold/craft-anything', 'storytold/effectcraft', 'storytold/filmcraft', 'storytold/wordcraft',
  'storytold/anicraft', 'storytold/cadcraft', 'storytold/deckcraft', 'storytold/designcraft',
  // Office & Productivity
  'laurent22/joplin', 'logseq/logseq', 'AppFlowy-IO/AppFlowy', 'siyuan-note/siyuan',
  'nocodb/nocodb', 'ONLYOFFICE/DesktopEditors', 'sumatrapdfreader/sumatrapdf',
  'okular-kde/okular', 'kovidgoyal/calibre', 'Stirling-Tools/Stirling-PDF',
  'zotero/zotero', 'jabref/jabref', 'ankitects/anki', 'xournalpp/xournalpp',
  'typst/typst', 'super-productivity/super-productivity', 'ActivityWatch/activitywatch',
  // Games & Emulation
  'godotengine/godot', '4ian/GDevelop', 'shadps4-emu/shadPS4', 'libretro/RetroArch',
  'PCSX2/pcsx2', 'dolphin-emu/dolphin', 'RPCS3/rpcs3', 'ryujinx/ryujinx',
  'PrismLauncher/PrismLauncher', 'Heroic-Games-Launcher/HeroicGamesLauncher',
  'Playnite/Playnite', 'SunshineStream/Sunshine',
  // Science & AI Desktop
  'ollama/ollama', 'ggml-org/llama.cpp', 'janhq/jan',
  'rstudio/rstudio', 'posit-dev/positron',
  'qgis/QGIS', 'Stellarium/stellarium', 'gephi/gephi', 'scilab/scilab',
];

const NICHES = [
  'topic:desktop-app', 'topic:tauri-app', 'topic:electron-app',
  'password manager', 'note taking app', 'terminal emulator', 'file manager',
  'video editor', 'screen recorder', 'media player', 'audio editor',
  'image editor', '3d modeling', 'cad software', 'diagram editor',
  'database client', 'api client', 'git client', 'torrent client',
  'download manager', 'remote desktop', 'backup tool', 'sync tool',
  'game engine', 'emulator', 'pdf reader', 'ebook reader',
  'system monitor', 'clipboard manager', 'launcher app', 'office suite',
];

async function ghFetch(url, allowNotFound = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.status === 404 && allowNotFound) return null;
    if (r.status === 403 || r.status === 429) {
      const remaining = r.headers.get('x-ratelimit-remaining');
      const reset = r.headers.get('x-ratelimit-reset');
      if (remaining === '0' && reset) {
        const wait = Math.max(2000, Number(reset) * 1000 - Date.now() + 2000);
        console.log(`Rate limit atingido, aguardando ${Math.round(wait / 1000)}s...`);
        await sleep(wait);
        continue;
      }
      await sleep(15_000);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return r.json();
  }
  throw new Error(`Falha após retentativas em ${url}`);
}

async function searchRepos(q, perPage = 30) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`;
  const data = await ghFetch(url);
  return data.items || [];
}

const PRERELEASE_MARKER_RE = /(?:^|[._-])(alpha|beta|rc|nightly|canary)(?:[._-]?\d+|[._-]|$)/i;
const STABLE_MARKER_RE = /(?:^|[._-])stable(?:[._-]|$)/i;
const UNSUPPORTED_OS_RE = /(?:^|[._-])(freebsd\d*|openbsd|netbsd|dragonfly|solaris|illumos|aix|android|ios|haiku)(?:[._-\d]|$)/i;
const SOURCE_ARCHIVE_RE = /(?:^|[._-])(src|sources?|source[-_]?code)(?:[._-]|$)/i;
const DEBUG_OR_META_RE = /(?:^|[._-])(pdb|pdbs|dsym|dsyms|dbgsym|debugsymbols)(?:[._-]|$)/i;
const ARCHIVE_EXT_RE = /\.(zip|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|bz2|7z)$/i;
const META_EXT_RE = /\.(ddeb|zsync|sha1|sha256|sha512|md5|xml|md|jsonl|desktop|pacman|fpk|aab|aar)$/i;
const MAX_SEED_ASSETS = 60;
const PER_PLATFORM_QUOTA = 20;

function isPrereleaseLabel(name) {
  if (!name) return false;
  return PRERELEASE_MARKER_RE.test(name) && !STABLE_MARKER_RE.test(name);
}

function hasWinMarker(n) {
  return /windows|win64|win32/i.test(n) || /(?:^|[._-])win(?:[._-]|$)/i.test(n);
}

function hasLinuxMarker(n) {
  return /linux|ubuntu|debian|fedora|archlinux/i.test(n);
}

function hasMacMarker(n) {
  return /macos|darwin|macosx/i.test(n) || /(?:^|[._-])(mac|osx)(?:[._-\d]|$)/i.test(n);
}

function isNonDesktopOrIgnoredAsset(name) {
  const n = name.toLowerCase();
  if (policy.dangerous_asset_extensions.some(ext => n.endsWith(ext))) return true;
  if (META_EXT_RE.test(n)) return true;
  if (n.endsWith('.gz') && !n.endsWith('.tar.gz')) return true;
  if (UNSUPPORTED_OS_RE.test(n)) return true;
  if (SOURCE_ARCHIVE_RE.test(n) && ARCHIVE_EXT_RE.test(n)) return true;
  if (DEBUG_OR_META_RE.test(n)) return true;
  if (isPrereleaseLabel(n)) return true;
  return false;
}

function detectAssetPlatform(name) {
  const n = name.toLowerCase();
  const isWinArchive = hasWinMarker(n) && n.endsWith('.zip') && !hasLinuxMarker(n) && !hasMacMarker(n);
  if (n.endsWith('.msi') || n.endsWith('.exe') || n.endsWith('.msix') || isWinArchive) {
    return 'windows';
  }
  const isMacArchive = hasMacMarker(n) && (n.endsWith('.zip') || n.endsWith('.tar.gz') || n.endsWith('.tgz')) && !hasWinMarker(n) && !hasLinuxMarker(n);
  if (n.endsWith('.dmg') || n.endsWith('.pkg') || isMacArchive) {
    return 'macos';
  }
  const isLinuxArchive = hasLinuxMarker(n) && (n.endsWith('.tar.gz') || n.endsWith('.tgz') || n.endsWith('.zip') || n.endsWith('.tar.xz') || n.endsWith('.txz') || n.endsWith('.tar.zst')) && !hasWinMarker(n) && !hasMacMarker(n);
  if (n.endsWith('.appimage') || n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.flatpak') || n.endsWith('.snap') || isLinuxArchive) {
    return 'linux';
  }
  if (hasWinMarker(n) && !hasLinuxMarker(n) && !hasMacMarker(n)) return 'windows';
  if (hasMacMarker(n) && !hasWinMarker(n) && !hasLinuxMarker(n)) return 'macos';
  if (hasLinuxMarker(n) && !hasWinMarker(n) && !hasMacMarker(n)) return 'linux';
  return 'other';
}

function desktopAssetPriority(asset) {
  const n = asset.name.toLowerCase();
  const platform = detectAssetPlatform(n);
  let score = 0;

  if (platform === 'windows') {
    if (n.endsWith('.msi')) score += 120;
    else if (n.endsWith('.exe')) score += 110;
    else if (n.endsWith('.zip')) score += 60;
    else if (n.endsWith('.msix')) score += 40;
    else score += 5;
  } else if (platform === 'macos') {
    if (n.endsWith('.dmg')) score += 120;
    else if (n.endsWith('.pkg')) score += 110;
    else if (n.endsWith('.app.tar.gz')) score += 55;
    else if (n.endsWith('.zip')) score += 65;
    else if (n.endsWith('.tar.gz') || n.endsWith('.tgz')) score += 50;
    else score += 10;
  } else if (platform === 'linux') {
    if (n.endsWith('.appimage')) score += 120;
    else if (n.endsWith('.deb')) score += 115;
    else if (n.endsWith('.rpm')) score += 110;
    else if (n.endsWith('.tar.gz') || n.endsWith('.tgz')) score += 60;
    else if (n.endsWith('.zip')) score += 55;
    else if (n.endsWith('.flatpak')) score += 40;
    else if (n.endsWith('.snap')) score += 30;
    else score += 20;
  } else {
    score += 10;
  }

  // Architecture weighting
  if (/(?:x86_64|x86-64|x64|amd64|win64|64bit|universal)/i.test(n)) {
    score += 40;
  } else if (/(?:arm64|aarch64)/i.test(n)) {
    score += 35;
  } else if (!/(?:i386|386|i686|ia32|x86|win32|armhf|armv\d|ppc64|s390x|mips|riscv64|loong64)/i.test(n)) {
    score += 30;
  } else if (/(?:i386|386|i686|ia32|x86|win32|armhf|armv7)/i.test(n)) {
    score += 10;
  } else {
    score -= 30;
  }

  // Installer vs auxiliary/CLI/portable adjustments
  if (/(?:setup|installer)/i.test(n) && !/no-installer|web-setup/i.test(n)) score += 20;
  if (/(?:^|[._-])gui(?:[._-]|$)/i.test(n)) score += 10;
  if (/(?:portable|no-installer|lite)/i.test(n)) score -= 15;
  if (/(?:web-setup|updater|updates-disabled)/i.test(n)) score -= 20;
  if (/(?:^|[._-])(cli|proxy|extract|find|addon|plugin|reh|server|headless)(?:[._-]|$)/i.test(n)) score -= 35;

  return { score, platform };
}

function prioritizeSafeAssets(assets) {
  const allowedHosts = policy.allowed_download_hosts;
  const candidates = [];

  for (const a of assets || []) {
    if (!a?.name || !a?.browser_download_url || a.size <= 0) continue;
    try {
      const host = new URL(a.browser_download_url).hostname.toLowerCase();
      if (!allowedHosts.includes(host)) continue;
    } catch {
      continue;
    }
    if (isNonDesktopOrIgnoredAsset(a.name)) continue;
    const { score, platform } = desktopAssetPriority(a);
    candidates.push({ asset: a, score, platform });
  }

  const byRank = (x, y) =>
    y.score - x.score ||
    (y.asset.download_count || 0) - (x.asset.download_count || 0) ||
    x.asset.name.localeCompare(y.asset.name);

  const buckets = {
    windows: candidates.filter(c => c.platform === 'windows').sort(byRank),
    macos: candidates.filter(c => c.platform === 'macos').sort(byRank),
    linux: candidates.filter(c => c.platform === 'linux').sort(byRank),
    other: candidates.filter(c => c.platform === 'other').sort(byRank),
  };

  const chosen = [];
  const chosenSet = new Set();
  for (const plat of ['windows', 'macos', 'linux']) {
    for (const item of buckets[plat].slice(0, PER_PLATFORM_QUOTA)) {
      chosen.push(item);
      chosenSet.add(item);
    }
  }

  const remaining = candidates.filter(c => !chosenSet.has(c)).sort(byRank);
  for (const item of remaining) {
    if (chosen.length >= MAX_SEED_ASSETS) break;
    chosen.push(item);
  }

  return chosen.sort(byRank).map(({ asset: a }) => ({
    name: a.name,
    browser_download_url: a.browser_download_url,
    size: a.size,
    download_count: a.download_count || 0,
    digest: a.digest || null,
  }));
}

function classifyAssetPlatforms(assets) {
  const platforms = new Set();
  const allowedHosts = policy.allowed_download_hosts;
  const winInstallers = [];
  let hasChecksum = false;

  for (const a of assets || []) {
    if (!a?.name || !a?.browser_download_url) continue;
    const n = a.name.toLowerCase();

    if (a.digest && String(a.digest).toLowerCase().startsWith('sha256:')) {
      hasChecksum = true;
    }
    if (
      n.includes('sha256') ||
      n.includes('checksum') ||
      n.endsWith('.sha256sum') ||
      n.endsWith('.sha256') ||
      n.endsWith('.sig') ||
      n.endsWith('.asc')
    ) {
      hasChecksum = true;
    }

    if (a.size <= 0) continue;
    try {
      const host = new URL(a.browser_download_url).hostname.toLowerCase();
      if (!allowedHosts.includes(host)) continue;
    } catch {
      continue;
    }

    if (isNonDesktopOrIgnoredAsset(n)) continue;

    // Exclude non-installer archive formats from Windows platform qualification
    const isUnsupportedWinArchive = /\.(snap|flatpak|txz|tar\.xz|bz2|7z)$/i.test(n);
    const isWin =
      !isUnsupportedWinArchive &&
      (n.endsWith('.msi') ||
        n.endsWith('.exe') ||
        (hasWinMarker(n) && n.endsWith('.zip') && !hasLinuxMarker(n) && !hasMacMarker(n)));
    const isLinux =
      n.endsWith('.appimage') ||
      n.endsWith('.deb') ||
      n.endsWith('.rpm') ||
      (hasLinuxMarker(n) && (n.endsWith('.tar.gz') || n.endsWith('.tgz') || n.endsWith('.zip')) && !hasWinMarker(n) && !hasMacMarker(n));
    const isMac =
      n.endsWith('.dmg') ||
      n.endsWith('.pkg') ||
      (hasMacMarker(n) && (n.endsWith('.zip') || n.endsWith('.tar.gz') || n.endsWith('.tgz')) && !hasWinMarker(n) && !hasLinuxMarker(n));

    if (isWin) {
      platforms.add('windows');
      winInstallers.push(a);
    }
    if (isLinux) platforms.add('linux');
    if (isMac) platforms.add('macos');
  }

  return { platforms, winInstallers, hasChecksum };
}

function matchesBlocked(repo) {
  const fullName = repo.full_name.toLowerCase();
  const desc = (repo.description || '').toLowerCase();
  const topics = (repo.topics || []).map(t => t.toLowerCase());
  const nameAndTopics = `${fullName} ${topics.join(' ')}`;
  const allText = `${nameAndTopics} ${desc}`;

  if (policy.blocked_repos.some(b => b.toLowerCase() === fullName)) {
    return 'explicit_blocklist';
  }
  for (const kw of policy.blocked_keywords) {
    if (allText.includes(kw.toLowerCase())) return `blocked_keyword:${kw}`;
  }
  for (const kw of policy.blocked_name_and_topic_keywords) {
    if (nameAndTopics.includes(kw.toLowerCase())) return `blocked_name_topic:${kw}`;
  }
  for (const kw of policy.non_app_keywords) {
    if (nameAndTopics.includes(kw.toLowerCase())) return `non_app_indicator:${kw}`;
  }
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPhrase(text, phrase) {
  const pattern = escapeRe(phrase.toLowerCase()).replace(/[\s-]+/g, '[\\s-]+');
  const re = new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`, 'i');
  return re.test(text);
}

function isSelfHostedServerOnly(repo, assets) {
  const text = `${(repo.topics || []).join(' ')} ${repo.description || ''} ${repo.name || ''}`.toLowerCase();
  const serverSignals = /\b(self-hosted|self-hosting|docker|headless-server|music-server|media-server|time-series database|time series database)\b/i;
  if (!serverSignals.test(text)) return false;
  const hasDesktopPackage = (assets || []).some(a => {
    if (!a?.name || a.size <= 0 || isNonDesktopOrIgnoredAsset(a.name)) return false;
    return /\.(msi|exe|dmg|pkg|appimage|deb|rpm)$/i.test(a.name);
  });
  return !hasDesktopPackage;
}

function inferCategory(repo) {
  const haystack = `${(repo.topics || []).join(' ')} ${repo.name || ''} ${repo.description || ''}`.toLowerCase();
  const categoryRules = {
    Development: [
      ['terminal emulator', 8],
      ['terminal emulators', 8],
      ['ssh client', 6],
      ['sftp client', 6],
      ['api client', 7],
      ['api testing', 6],
      ['api design', 6],
      ['mock api', 6],
      ['mock server', 6],
      ['database client', 7],
      ['database tool', 7],
      ['database management', 6],
      ['sql client', 7],
      ['code editor', 7],
      ['text editor', 6],
      ['hex editor', 7],
      ['reverse engineering', 6],
      ['agent ide', 7],
      ['ai tools', 5],
      ['claude code', 5],
      ['opencode', 5],
      ['code knowledge graph', 7],
      ['git client', 6],
      ['terminal ui', 6],
      ['shell prompt', 6],
      ['fuzzy finder', 6],
      ['package installer', 4],
      ['python package', 4],
      ['decompiler', 7],
      ['compare files', 5],
      ['diff', 4],
      ['merge', 3],
      ['developer tools', 5],
      ['devtools', 5],
      ['ide', 4],
      ['editor', 3],
      ['terminal', 4],
      ['git', 3],
      ['lazygit', 6],
      ['imhex', 7],
      ['cutter', 5],
      ['api', 3],
      ['graphql', 3],
      ['grpc', 3],
      ['mqtt', 5],
      ['database', 4],
      ['sql', 4],
      ['compiler', 4],
      ['neovim', 5],
      ['vscode', 5],
      ['vscodium', 5],
      ['vte', 4],
      ['mcp', 3],
      ['cli', 2],
      ['command line', 2],
      ['syntax highlighting', 4],
      ['regex', 3],
      ['snippet management', 5],
      ['gists', 4],
    ],
    Utilities: [
      ['system monitor', 7],
      ['system monitoring', 7],
      ['system information', 6],
      ['process monitor', 7],
      ['disk usage', 7],
      ['disk cleanup', 7],
      ['system cleaner', 7],
      ['disk cleaner', 7],
      ['file manager', 7],
      ['file explorer', 7],
      ['clipboard manager', 7],
      ['package manager', 7],
      ['text expander', 7],
      ['application launcher', 7],
      ['keyboard launcher', 7],
      ['bootable usb', 7],
      ['bootable drives', 7],
      ['usb formatting', 7],
      ['flash os', 7],
      ['sd cards', 6],
      ['usb drives', 6],
      ['firmware image', 7],
      ['uefi', 6],
      ['backup tool', 7],
      ['backup program', 7],
      ['file synchronization', 7],
      ['cloud storage', 5],
      ['archive manager', 7],
      ['image uploader', 7],
      ['imageuploader', 7],
      ['screen capture', 5],
      ['screenshot', 5],
      ['color picker', 4],
      ['ocr', 4],
      ['launcher', 4],
      ['clipboard', 5],
      ['backup', 4],
      ['synchronization', 5],
      ['sync', 3],
      ['compression', 4],
      ['extractor', 4],
      ['deduplication', 4],
      ['monitoring', 3],
      ['cleaner', 4],
      ['utility', 4],
      ['utilities', 4],
      ['powertoys', 7],
      ['rufus', 7],
      ['ventoy', 7],
      ['unigetui', 7],
      ['bleachbit', 7],
      ['windirstat', 7],
      ['peazip', 7],
      ['copyq', 7],
      ['rclone', 7],
      ['restic', 7],
      ['syncthing', 7],
      ['kopia', 7],
      ['sharex', 7],
      ['picgo', 7],
      ['espanso', 7],
      ['fastfetch', 7],
      ['double commander', 7],
      ['doublecmd', 7],
      ['flow launcher', 7],
      ['neohtop', 7],
      ['bottom', 4],
      ['superfile', 6],
      ['yazi', 6],
      ['zoxide', 5],
      ['cd command', 5],
    ],
    Security: [
      ['password manager', 8],
      ['client side encryption', 6],
      ['disk encryption', 7],
      ['file encryption', 7],
      ['container signing', 7],
      ['code signing', 6],
      ['keepass', 7],
      ['bitwarden', 7],
      ['veracrypt', 7],
      ['cryptomator', 7],
      ['gopass', 7],
      ['cosign', 7],
      ['2fa', 6],
      ['totp', 6],
      ['authenticator', 6],
      ['cryptography', 5],
      ['encryption', 4],
      ['security', 4],
      ['privacy', 2],
      ['vault', 4],
      ['gpg', 4],
      ['vpn', 5],
    ],
    Games: [
      ['game engine', 8],
      ['game development', 7],
      ['rpg engine', 8],
      ['minecraft launcher', 8],
      ['games launcher', 8],
      ['game launcher', 8],
      ['game streaming', 8],
      ['game stream', 8],
      ['playstation', 6],
      ['ps4', 6],
      ['godot', 5],
      ['godotengine', 5],
      ['redot', 6],
      ['retroarch', 7],
      ['pcsx2', 7],
      ['dolphin', 5],
      ['rpcs3', 7],
      ['shadps4', 7],
      ['openmw', 7],
      ['vcmi', 7],
      ['prism launcher', 7],
      ['prismlauncher', 7],
      ['heroic games launcher', 7],
      ['sunshine', 6],
      ['game', 4],
      ['gaming', 5],
      ['gamedev', 6],
      ['emulation', 6],
      ['minecraft', 5],
      ['morrowind', 6],
      ['heroes of might and magic', 6],
    ],
    Multimedia: [
      ['video editor', 8],
      ['audio editor', 8],
      ['music player', 8],
      ['media player', 8],
      ['live streaming', 8],
      ['video recording', 7],
      ['audio downloader', 7],
      ['video downloader', 7],
      ['streaming music', 7],
      ['obs studio', 8],
      ['shotcut', 7],
      ['losslesscut', 7],
      ['handbrake', 7],
      ['audacity', 7],
      ['mpv', 6],
      ['yt dlp', 7],
      ['youtube dl', 7],
      ['yesplaymusic', 7],
      ['nuclear', 5],
      ['video', 4],
      ['audio', 4],
      ['music', 4],
      ['media', 3],
      ['player', 3],
      ['podcast', 5],
      ['transcoder', 5],
      ['ffmpeg', 4],
      ['lyrics', 3],
    ],
    Graphics: [
      ['image editor', 8],
      ['raw image editor', 8],
      ['image processing', 7],
      ['photography', 7],
      ['raw developer', 7],
      ['3d model', 7],
      ['3d modeling', 7],
      ['3d printer', 7],
      ['3d printing', 7],
      ['3d printers', 7],
      ['g code generator', 7],
      ['diagram editor', 8],
      ['procedural textures', 9],
      ['texture synthesis', 8],
      ['3d model painting', 9],
      ['low poly', 6],
      ['pixel art', 6],
      ['color grading', 6],
      ['whiteboard', 6],
      ['cad', 5],
      ['svg', 4],
      ['slicer', 7],
      ['orcaslicer', 7],
      ['prusaslicer', 7],
      ['bambu studio', 7],
      ['bambustudio', 7],
      ['blender', 7],
      ['krita', 7],
      ['inkscape', 7],
      ['darktable', 7],
      ['draw io', 7],
      ['drawio', 7],
      ['blockbench', 7],
      ['rapidraw', 7],
      ['material maker', 8],
      ['flameshot', 7],
      ['painting', 4],
      ['textures', 4],
      ['photo', 4],
      ['3d', 3],
      ['canvas', 3],
    ],
    Internet: [
      ['remote desktop', 8],
      ['remote control', 6],
      ['download manager', 8],
      ['mail client', 8],
      ['email client', 8],
      ['web browser', 8],
      ['firefox based', 7],
      ['file sharing', 6],
      ['airdrop', 6],
      ['bittorrent', 7],
      ['torrent', 6],
      ['soulseek', 7],
      ['p2p', 4],
      ['downloader', 5],
      ['rustdesk', 7],
      ['localsend', 7],
      ['gopeed', 7],
      ['rayburst', 7],
      ['mailspring', 7],
      ['telegram', 7],
      ['zen browser', 7],
      ['floorp', 7],
      ['min browser', 7],
      ['ab download manager', 7],
      ['qbittorrent', 7],
      ['rdp', 5],
      ['anydesk', 5],
      ['teamviewer', 5],
      ['email', 4],
      ['imap', 4],
      ['browser', 5],
      ['chat', 4],
      ['messenger', 5],
      ['ftp', 4],
    ],
    Office: [
      ['note taking', 8],
      ['handwriting', 6],
      ['pdf annotation', 7],
      ['knowledge base', 8],
      ['knowledge management', 8],
      ['office suite', 8],
      ['ebook reader', 8],
      ['ebook manager', 8],
      ['time tracker', 8],
      ['time tracking', 8],
      ['to do list', 7],
      ['daily planner', 7],
      ['habit tracker', 6],
      ['personal finance', 8],
      ['portfolio tracker', 7],
      ['typesetting', 6],
      ['pomodoro', 6],
      ['spreadsheet', 6],
      ['presentations', 5],
      ['notion alternative', 7],
      ['markdown', 4],
      ['notes', 4],
      ['note', 3],
      ['ebook', 5],
      ['ebooks', 5],
      ['epub', 5],
      ['pdf', 4],
      ['wiki', 4],
      ['joplin', 7],
      ['logseq', 7],
      ['trilium', 7],
      ['appflowy', 7],
      ['calibre', 7],
      ['readest', 7],
      ['koodo reader', 7],
      ['onlyoffice', 7],
      ['zotero', 7],
      ['anki', 7],
      ['xournalpp', 7],
      ['typst', 6],
      ['wealthfolio', 7],
      ['activitywatch', 7],
      ['super productivity', 7],
      ['productivity', 4],
    ],
    Science: [
      ['graph analytics', 8],
      ['graph viz', 8],
      ['open graph viz', 8],
      ['visualization', 5],
      ['planetarium', 8],
      ['astronomy', 8],
      ['astrophysics', 8],
      ['geospatial', 8],
      ['gis', 7],
      ['bioinformatics', 8],
      ['scientific', 6],
      ['science', 5],
      ['research', 4],
      ['physics', 6],
      ['chemistry', 6],
      ['biology', 6],
      ['mathematics', 6],
      ['math', 5],
      ['llm', 5],
      ['llms', 5],
      ['ollama', 7],
      ['stellarium', 7],
      ['gephi', 7],
      ['qgis', 7],
      ['rstudio', 7],
      ['positron', 7],
      ['scilab', 7],
    ],
  };

  const scores = {};
  for (const [cat, rules] of Object.entries(categoryRules)) {
    let score = 0;
    for (const [phrase, weight] of rules) {
      if (hasPhrase(haystack, phrase)) score += weight;
    }
    scores[cat] = score;
  }
  if (
    hasPhrase(haystack, 'emulator') &&
    !hasPhrase(haystack, 'terminal emulator') &&
    !hasPhrase(haystack, 'terminal emulators')
  ) {
    scores.Games += 6;
  }

  let bestCat = 'Other';
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  return bestScore > 0 ? bestCat : 'Other';
}

const ownerCache = new Map();
async function getOwnerAgeDays(login) {
  if (ownerCache.has(login)) return ownerCache.get(login);
  try {
    const u = await ghFetch(`https://api.github.com/users/${encodeURIComponent(login)}`, true);
    const days = u?.created_at ? daysSince(u.created_at) : 0;
    ownerCache.set(login, days);
    return days;
  } catch {
    ownerCache.set(login, 0);
    return 0;
  }
}

async function evaluateCandidate(fullName) {
  const repo = await ghFetch(`https://api.github.com/repos/${fullName}`, true);
  if (!repo) return { ok: false, id: fullName, reason: 'not_found' };

  // Portão 2 (flags básicas) + Portão 1 (estrelas & idade)
  if (repo.fork || repo.archived || repo.disabled) {
    return { ok: false, id: repo.full_name, reason: 'fork_archived_or_disabled' };
  }
  if ((repo.stargazers_count || 0) < T.min_stars) {
    return { ok: false, id: repo.full_name, reason: `low_stars:${repo.stargazers_count}` };
  }
  const repoAgeDays = daysSince(repo.created_at);
  if (repoAgeDays < T.min_repo_age_days) {
    return { ok: false, id: repo.full_name, reason: `too_young:${Math.round(repoAgeDays)}d` };
  }
  const pushAgeDays = daysSince(repo.pushed_at);
  if (pushAgeDays > T.max_inactive_push_days) {
    return { ok: false, id: repo.full_name, reason: `stale_push:${Math.round(pushAgeDays)}d` };
  }

  // Portão 3 (segurança: blocklist & licença OSI)
  const blockReason = matchesBlocked(repo);
  if (blockReason) {
    return { ok: false, id: repo.full_name, reason: blockReason };
  }
  const override = (policy.manual_allowlist_overrides || []).find(
    o => o.id?.toLowerCase() === repo.full_name.toLowerCase(),
  );
  const spdx = repo.license?.spdx_id || '';
  if (!override && !policy.allowed_licenses.includes(spdx)) {
    return { ok: false, id: repo.full_name, reason: `untrusted_license:${spdx || 'NONE'}` };
  }

  // Portão 1/2/4: histórico de releases e instaladores reais
  const releases = await ghFetch(`https://api.github.com/repos/${repo.full_name}/releases?per_page=10`, true);
  if (!Array.isArray(releases)) {
    return { ok: false, id: repo.full_name, reason: 'no_releases_endpoint' };
  }
  const stableReleases = releases.filter(
    r => !r.draft && !r.prerelease && !isPrereleaseLabel(r.tag_name || '') && !isPrereleaseLabel(r.name || ''),
  );
  if (stableReleases.length < T.min_release_count) {
    return { ok: false, id: repo.full_name, reason: `few_stable_releases:${stableReleases.length}` };
  }

  const latest = stableReleases[0];
  const releaseAgeDays = daysSince(latest.published_at);
  if (releaseAgeDays > T.max_inactive_release_days) {
    return { ok: false, id: repo.full_name, reason: `stale_release:${Math.round(releaseAgeDays)}d` };
  }

  if (isSelfHostedServerOnly(repo, latest.assets || [])) {
    return { ok: false, id: repo.full_name, reason: 'server_only_non_desktop' };
  }

  const recentDownloads = stableReleases
    .slice(0, 3)
    .reduce((acc, rel) => acc + (rel.assets || []).reduce((s, a) => s + (a.download_count || 0), 0), 0);
  const latestDownloads = (latest.assets || []).reduce((s, a) => s + (a.download_count || 0), 0);

  if (recentDownloads < T.min_release_downloads) {
    return { ok: false, id: repo.full_name, reason: `low_downloads:${recentDownloads}` };
  }

  // Portão 4: binários desktop instaláveis
  const { platforms, winInstallers, hasChecksum } = classifyAssetPlatforms(latest.assets || []);
  if (platforms.size === 0) {
    return { ok: false, id: repo.full_name, reason: 'no_desktop_binaries' };
  }
  if (T.require_windows_asset && winInstallers.length === 0) {
    return { ok: false, id: repo.full_name, reason: 'no_windows_installer' };
  }

  // Verificação adicional de maturidade do dono & SECURITY.md
  const ownerAgeDays = await getOwnerAgeDays(repo.owner.login);
  if (ownerAgeDays < T.min_owner_age_days) {
    return { ok: false, id: repo.full_name, reason: `young_owner:${Math.round(ownerAgeDays)}d` };
  }

  let hasSecurityPolicy = false;
  const community = await ghFetch(`https://api.github.com/repos/${repo.full_name}/community/profile`, true);
  if (community?.files?.security) hasSecurityPolicy = true;

  // Portão 5: cálculo do Score Composto (0..100)
  const starsPts = Math.min(15, Math.max(0, Math.round((Math.log10(repo.stargazers_count) - 3.0) * 7.5)));
  const dlPts = Math.min(15, Math.max(0, Math.round((Math.log10(Math.max(recentDownloads, 1)) - 3.5) * 4.5)));
  const licensePts = 10;
  const checksumPts = hasChecksum ? 10 : 0;
  const isOrg = repo.owner?.type === 'Organization';
  const governancePts = (isOrg ? 5 : 0) + (hasSecurityPolicy ? 5 : 0);
  const maturityPts = repoAgeDays >= 730 ? 5 : 2;
  const pushPts = pushAgeDays <= 30 ? 10 : pushAgeDays <= 90 ? 6 : 3;
  const relPts = releaseAgeDays <= 90 ? 10 : releaseAgeDays <= 180 ? 6 : 3;
  const platPts = Math.min(15, platforms.size * 5);

  const trustScore = Math.min(
    100,
    starsPts + dlPts + licensePts + checksumPts + governancePts + maturityPts + pushPts + relPts + platPts,
  );

  const securityFlags = ['osi-license'];
  if (hasChecksum) securityFlags.push('sha256-verified');
  if (hasSecurityPolicy) securityFlags.push('security-policy');
  if (isOrg) securityFlags.push('verified-org');
  if (repoAgeDays >= 730) securityFlags.push('mature-repo');

  const category = override?.category || inferCategory(repo);

  // Priorizar instaladores desktop (Windows/macOS/Linux) e filtrar artefatos não-desktop/beta
  const safeAssets = prioritizeSafeAssets(latest.assets || []);

  return {
    ok: true,
    id: repo.full_name,
    category,
    trustScore,
    securityFlags,
    platforms: [...platforms],
    hasChecksum,
    hasSecurityPolicy,
    repoAgeDays: Math.round(repoAgeDays),
    recentDownloads,
    latestDownloads,
    seedEntry: {
      category,
      trust_score: trustScore,
      security_flags: securityFlags,
      repo: {
        full_name: repo.full_name,
        name: repo.name,
        description: repo.description || null,
        html_url: repo.html_url,
        homepage: repo.homepage || null,
        stargazers_count: repo.stargazers_count,
        pushed_at: repo.pushed_at || null,
        created_at: repo.created_at || null,
        fork: Boolean(repo.fork),
        archived: Boolean(repo.archived),
        disabled: Boolean(repo.disabled),
        topics: (repo.topics || []).slice(0, 12),
        license: repo.license ? { spdx_id: repo.license.spdx_id, name: repo.license.name } : null,
        owner: { login: repo.owner.login, avatar_url: repo.owner.avatar_url },
      },
      release: {
        tag_name: latest.tag_name,
        name: latest.name || null,
        body: latest.body ? latest.body.slice(0, 500) : null,
        html_url: latest.html_url,
        published_at: latest.published_at || null,
        draft: Boolean(latest.draft),
        prerelease: Boolean(latest.prerelease),
        assets: safeAssets,
      },
    },
  };
}

function selectBalancedTop100(approved) {
  // Ordena por Score Composto desc, depois estrelas desc
  const ranked = [...approved].sort((a, b) => b.trustScore - a.trustScore || b.seedEntry.repo.stargazers_count - a.seedEntry.repo.stargazers_count);
  const selected = [];
  const overflow = [];
  const catCounts = new Map();

  for (const item of ranked) {
    const count = catCounts.get(item.category) || 0;
    if (count < T.max_per_category && selected.length < T.target_count) {
      selected.push(item);
      catCounts.set(item.category, count + 1);
    } else {
      overflow.push(item);
    }
  }
  while (selected.length < T.target_count && overflow.length > 0) {
    selected.push(overflow.shift());
  }
  return selected;
}

function buildAuditMarkdown(selected, rejected, totalCandidates) {
  const catSummary = new Map();
  for (const s of selected) {
    catSummary.set(s.category, (catSummary.get(s.category) || 0) + 1);
  }
  const rejectSummary = new Map();
  for (const r of rejected) {
    const bucket = r.reason.split(':')[0];
    rejectSummary.set(bucket, (rejectSummary.get(bucket) || 0) + 1);
  }

  const lines = [
    '# Auditoria Oficial do Catálogo — Top 100 Open Source Store',
    '',
    `- **Gerado em:** ${new Date().toISOString().slice(0, 10)}`,
    `- **Política:** \`data/curation-policy.json\` (v${policy.version})`,
    `- **Candidatos avaliados:** ${totalCandidates}`,
    `- **Aprovados nos 5 Portões:** ${selected.length + Math.max(0, approvedTotal - selected.length)} (selecionados: **${selected.length}**)`,
    `- **Rejeitados pelos critérios:** ${rejected.length}`,
    '',
    '## Distribuição por Categoria',
    '',
    '| Categoria | Quantidade |',
    '| :--- | ---: |',
    ...[...catSummary.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `| ${c} | ${n} |`),
    '',
    '## Motivos de Rejeição (Principais Barreiras)',
    '',
    '| Barreira / Motivo | Rejeitados |',
    '| :--- | ---: |',
    ...[...rejectSummary.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `| \`${m}\` | ${n} |`),
    '',
    '## Top 100 Softwares Selecionados',
    '',
    '| # | Repositório | Categoria | Score | Estrelas | Downloads (3 rel.) | Idade | Licença | SHA-256 | Plataformas |',
    '| ---: | :--- | :--- | ---: | ---: | ---: | ---: | :--- | :---: | :--- |',
  ];

  selected.forEach((s, i) => {
    const r = s.seedEntry.repo;
    const spdx = r.license?.spdx_id || 'NONE';
    const sha = s.hasChecksum ? 'Sim' : 'Não';
    lines.push(
      `| ${i + 1} | [${r.full_name}](${r.html_url}) | ${s.category} | **${s.trustScore}** | ${r.stargazers_count.toLocaleString('en-US')} | ${s.recentDownloads.toLocaleString('en-US')} | ${s.repoAgeDays}d | \`${spdx}\` | ${sha} | ${s.platforms.join(', ')} |`,
    );
  });

  return lines.join('\n') + '\n';
}

let approvedTotal = 0;

async function main() {
  console.log(`Iniciando curadoria Top ${T.target_count} (token=${Boolean(TOKEN)})...`);
  const candidates = new Set(FLAGSHIP_SEEDS);

  // 1. Top geral filtrado
  try {
    const geral = await searchRepos(
      `stars:>=${T.min_stars} pushed:>=${SINCE_PUSH} fork:false archived:false -awesome -tutorial -course -roadmap -interview -handbook in:name,description`,
      100,
    );
    for (const it of geral) candidates.add(it.full_name);
    console.log(`Top geral: ${candidates.size} candidatos acumulados`);
  } catch (e) {
    console.log(`Aviso busca geral: ${e.message}`);
  }

  // 2. Buscas por nichos/tópicos
  for (const niche of NICHES) {
    const q = `${niche} stars:>=${T.min_stars} pushed:>=${SINCE_PUSH} fork:false archived:false`;
    try {
      const items = await searchRepos(q, 25);
      for (const it of items) candidates.add(it.full_name);
    } catch (e) {
      console.log(`Aviso nicho "${niche}": ${e.message}`);
    }
    await sleep(TOKEN ? 400 : 6500);
  }

  // Deduplica case-insensitive mantendo forma canônica
  const uniqueMap = new Map();
  for (const id of candidates) {
    const key = id.toLowerCase();
    if (!uniqueMap.has(key)) uniqueMap.set(key, id);
  }
  const candidateList = [...uniqueMap.values()];
  console.log(`\nAuditando ${candidateList.length} candidatos pelos 5 Portões...`);

  const approved = [];
  const rejected = [];
  const seenCanonical = new Set();

  // Avalia em lotes concorrentes pequenos para respeitar API
  const BATCH = TOKEN ? 8 : 2;
  for (let i = 0; i < candidateList.length; i += BATCH) {
    const slice = candidateList.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async id => {
        try {
          return await evaluateCandidate(id);
        } catch (e) {
          return { ok: false, id, reason: `error:${e.message}` };
        }
      }),
    );
    for (const res of results) {
      const canon = res.id.toLowerCase();
      if (seenCanonical.has(canon)) continue;
      seenCanonical.add(canon);
      if (res.ok) approved.push(res);
      else rejected.push(res);
    }
    if ((i / BATCH) % 10 === 0) {
      console.log(`Progresso: ${Math.min(i + BATCH, candidateList.length)}/${candidateList.length} | aprovados=${approved.length} rejeitados=${rejected.length}`);
    }
    await sleep(TOKEN ? 150 : 2000);
  }

  approvedTotal = approved.length;
  const selected = selectBalancedTop100(approved);

  writeFileSync(
    resolve(root, 'data/curated.json'),
    JSON.stringify(selected.map(s => s.id), null, 2) + '\n',
  );
  writeFileSync(
    resolve(root, 'data/catalog-seed.json'),
    JSON.stringify(selected.map(s => s.seedEntry), null, 2) + '\n',
  );
  writeFileSync(
    resolve(root, 'docs/CATALOG_AUDIT.md'),
    buildAuditMarkdown(selected, rejected, seenCanonical.size),
  );

  console.log(`\n=== CONCLUÍDO: ${selected.length} softwares aprovados e gravados ===`);
  console.log(`curated.json: ${selected.length} | rejected: ${rejected.length}`);
  selected.slice(0, 15).forEach((s, idx) => {
    console.log(
      `${String(idx + 1).padStart(2)}. ${s.id.padEnd(36)} Score ${String(s.trustScore).padStart(3)} | ★ ${String(s.seedEntry.repo.stargazers_count).padStart(7)} | ${s.category}`,
    );
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
