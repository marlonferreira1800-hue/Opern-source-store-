// Gera data/curated.json com os ~100 repositórios open source mais importantes:
// critérios = muitos estrelas (famoso) + push recente (ativo) + não-fork + não-arquivado.
// Usa SOMENTE a search API (rate limit próprio). Rode: node scripts/fetch-top100.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SINCE = '2026-05-25';        // ativo = push nos últimos ~6 meses
const MIN_STARS = 800;              // famoso = pelo menos 800 estrelas
const TARGET = 100;

const UA = { 'User-Agent': 'open-source-store-curator', 'Accept': 'application/vnd.github+json' };

// nichos de aplicativo (desktop/CLI) para diversidade além do top geral
const NICHES = [
  'text editor', 'code editor', 'ide', 'terminal emulator', 'file manager',
  'media player', 'music player', 'video editor', 'image editor', 'photo editor',
  'note taking app', 'password manager', 'download manager', 'torrent client',
  'git client', 'database client', 'api client', 'chat client', 'email client',
  'pdf editor', 'screen recorder', 'screenshot tool', 'system monitor',
  'task manager', 'clipboard manager', 'launcher app', 'ssh client',
  'remote desktop', 'sync tool', 'backup tool', 'vpn client', 'diagram tool',
  'mind map', 'whiteboard', 'presentation software', 'spreadsheet', 'game engine',
  'emulator', 'virtual machine', 'container tool', 'ebook reader', 'audio editor',
  'streaming', '2d game', '3d modeling', 'cad', 'music production',
  'video player', 'subtitle editor', 'ocr tool', 'translator app', 'habit tracker',
];

async function search(q, perPage) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`;
  const r = await fetch(url, { headers: UA });
  if (r.status === 403) {
    const reset = r.headers.get('x-ratelimit-reset');
    const wait = reset ? (reset * 1000 - Date.now()) + 2000 : 65000;
    console.log(`rate limit, aguardando ${Math.round(wait / 1000)}s...`);
    await new Promise(res => setTimeout(res, wait));
    return search(q, perPage);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${q}`);
  const j = await r.json();
  return j.items || [];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// padrões de repositórios que NÃO são software instalável (listas, tutoriais, livros)
const NOT_APP = /awesome|tutorial|course|books?|roadmap|interview|primer|notes|checklist|handbook|learning|free-for-dev|100-days|30-seconds|system-design|algorithms|coding-|awesome-|skills|prompts|resources|awesome_|awesome-|list-of|free-programming/i;

function isLikelyApp(it) {
  if (NOT_APP.test(it.full_name)) return false;
  if (NOT_APP.test(it.description || '')) return false;
  return true;
}

async function main() {
  const map = new Map(); // full_name -> item

  // 1) top geral: os mais estrelados e ativos, excluindo listas/tutoriais
  console.log('buscando top geral (apps)...');
  const geral = await search(
    `stars:>=2000 pushed:>=${SINCE} fork:false archived:false -awesome -tutorial -course -books -roadmap -interview -primer -handbook -notes -checklist -learning -algorithms in:name,description`, 100);
  for (const it of geral) if (isLikelyApp(it)) map.set(it.full_name, it);
  console.log(`top geral (apps): ${map.size} repos`);
  await sleep(6500);

  // 2) nichos de app para diversidade
  for (const niche of NICHES) {
    const q = `${niche} stars:>=500 pushed:>=${SINCE} fork:false archived:false`;
    try {
      const items = await search(q, 30);
      let added = 0;
      for (const it of items) if (!map.has(it.full_name)) { map.set(it.full_name, it); added++; }
      console.log(`${niche}: +${added} (total ${map.size})`);
    } catch (e) {
      console.log(`${niche}: ERRO ${e.message}`);
    }
    await sleep(6500);
  }

  // ordena por estrelas e pega os 100 mais famosos/ativos que parecem software
  const top = [...map.values()]
    .filter(it => it.stargazers_count >= MIN_STARS && it.pushed_at >= SINCE && isLikelyApp(it))
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, TARGET);

  const curated = top.map(it => it.full_name);
  writeFileSync(resolve(root, 'data/curated.json'), JSON.stringify(curated, null, 2) + '\n');

  console.log(`\n=== TOP ${top.length} (famosos + ativos) ===`);
  top.forEach((it, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${it.full_name.padEnd(42)} ★ ${String(it.stargazers_count).padStart(7)}  push ${it.pushed_at?.slice(0, 10)}`);
  });
  console.log(`\ngravado em data/curated.json (${curated.length} repos)`);
}

main().catch(e => { console.error(e); process.exit(1); });
