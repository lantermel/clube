/* Service Worker — Workflow de Eventos A&B (Clube Sírio)
   Para publicar uma nova versão do sistema: troque o número em VERSAO. */
const VERSAO = 'v2';
const CACHE_APP = 'sirio-ab-app-' + VERSAO;
const CACHE_LIB = 'sirio-ab-lib-' + VERSAO;
const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter((n) => n.startsWith('sirio-ab-') && n !== CACHE_APP && n !== CACHE_LIB)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* Rede primeiro (com limite de tempo) para a página; cache se estiver sem rede. */
function redePrimeiro(req, limiteMs) {
  return new Promise((resolve) => {
    let respondeu = false;
    const usarCache = async () => {
      const c = await caches.match(req, { ignoreSearch: true });
      return c || (await caches.match('./index.html')) || (await caches.match('./offline.html'));
    };
    const timer = setTimeout(async () => {
      if (respondeu) return;
      const c = await usarCache();
      if (c) { respondeu = true; resolve(c); }
    }, limiteMs);
    fetch(req).then(async (res) => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copia = res.clone();
        caches.open(CACHE_APP).then((c) => c.put(req, copia));
      }
      if (!respondeu) { respondeu = true; resolve(res); }
    }).catch(async () => {
      clearTimeout(timer);
      if (!respondeu) { respondeu = true; resolve(await usarCache()); }
    });
  });
}

/* Cache imediato + atualização em segundo plano. */
async function cacheEAtualiza(req, nomeCache) {
  const cache = await caches.open(nomeCache);
  const guardado = await cache.match(req);
  const rede = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => guardado);
  return guardado || rede;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Dados e login (Supabase) NUNCA passam pelo cache. */
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  /* Página principal */
  if (req.mode === 'navigate') {
    e.respondWith(redePrimeiro(req, 4000));
    return;
  }

  /* Biblioteca supabase-js (CDN) */
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheEAtualiza(req, CACHE_LIB));
    return;
  }

  /* Arquivos do próprio sistema (ícones, manifest etc.) */
  if (url.origin === self.location.origin) {
    e.respondWith(cacheEAtualiza(req, CACHE_APP));
  }
});
