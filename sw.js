// ============================================================
// SERVICE WORKER v4 — Adega Corujão
// ------------------------------------------------------------
// Estratégias por tipo de request:
//
//  • Assets locais (HTML/CSS/JS/manifest)
//    → Stale-While-Revalidate: serve do cache imediatamente
//      e atualiza em background. Zero latência nas visitas.
//
//  • API Supabase (RPC + REST)
//    → Network-First com timeout 4s e fallback para cache.
//      Dados frescos quando há rede; dados salvos offline.
//      Também pré-aquece o cache da RPC no activate.
//
//  • Fontes Google
//    → Cache-First: carregadas uma vez, nunca re-baixadas.
//
// O app.js já tem localStorage como cache de dados (5min).
// O sw.js adiciona uma camada de cache HTTP em cima disso,
// tratando especialmente os requests de rede do app.js.
// ============================================================

const V            = 'v4';
const CACHE_STATIC = 'corujao-static-'  + V;
const CACHE_API    = 'corujao-api-'     + V;
const CACHE_FONTS  = 'corujao-fonts-'   + V;

// Assets locais que devem estar no cache desde a instalação
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

// URL da RPC — pré-aquecida no activate para a 1ª visita
const RPC_URL =
  'https://fykqqioozgotmmebtlix.supabase.co/rest/v1/rpc/get_cardapio_publico';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a3FxaW9vemdvdG1tZWJ0bGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjYyNTksImV4cCI6MjA5NzE0MjI1OX0.ZWw5GvAcYNFCAlOcDLINE2Pi8g4SToBlPMmzg2NuTA8';

// ── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // ativa sem esperar fechar abas
  );
});

// ── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Limpa caches de versões anteriores
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => ![CACHE_STATIC, CACHE_API, CACHE_FONTS].includes(k))
            .map(k => caches.delete(k))
        )
      ),
      // Pré-aquece o cache da RPC logo que o SW ativa
      // → na 1ª visita o app.js já encontra dados no cache do SW
      caches.open(CACHE_API).then(cache =>
        fetch(RPC_URL, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
        .then(res => { if (res.ok) cache.put(RPC_URL, res); })
        .catch(() => { /* sem rede no activate — ignora */ })
      ),
    ]).then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora tudo que não é GET (exceto POST para RPC do Supabase)
  const isRPC = request.method === 'POST'
    && url.hostname.includes('supabase.co')
    && url.pathname.includes('/rpc/');

  if (request.method !== 'GET' && !isRPC) return;

  // ── Fontes Google ─────────────────────────────────────────
  if (url.hostname === 'fonts.googleapis.com'
   || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  // ── API Supabase (REST + RPC) ─────────────────────────────
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  // ── Assets locais ─────────────────────────────────────────
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

// ============================================================
// ESTRATÉGIAS
// ============================================================

// Cache-First: serve do cache; vai à rede só se não tiver.
// Ideal para fontes que nunca mudam.
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// Stale-While-Revalidate: retorna cache imediatamente e
// atualiza em background. O usuário nunca espera na rede.
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);

  // Atualização em background (não bloqueia)
  const update = fetch(request)
    .then(res => { if (res.ok) { cache.put(request, res.clone()); } return res; })
    .catch(() => null);

  // Retorna cache se disponível; espera rede caso contrário
  return cached || update || new Response('Offline', { status: 503 });
}

// Network-First com timeout 4s: tenta rede; se demorar ou falhar,
// serve do cache. Ideal para dados que precisam ser frescos mas
// também devem funcionar offline.
async function networkFirstAPI(request) {
  const cache = await caches.open(CACHE_API);

  // Clona o request para poder usar em cache.put depois
  // (requests POST precisam ser reconstruídos pois não são cacheáveis
  //  pelo browser, mas podemos armazená-los manualmente)
  const cacheKey = request.method === 'POST'
    ? new Request(request.url + '__POST', { method: 'GET' })
    : request;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000); // timeout 4s

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(tid);

    if (response.ok) {
      // Armazena a resposta no cache para uso offline
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    // Timeout ou sem rede → serve do cache
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // Nenhum cache → resposta vazia válida (o app.js trata isso)
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
