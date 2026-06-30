const CACHE = 'agendapro-v16';

// Arquivos HTML — sempre buscados na rede (network-first)
const HTML_FILES = [
  './index.html',
  './salao_agendamento.html',
  './salao_admin.html'
];

// Assets estáticos — cacheados (cache-first)
const ASSETS = [
  './manifest.json',
  './manifest-admin.json',
  './icon-app-192.png',
  './icon-app-512.png',
  './icon-192.png',
  './icon-512.png',
  './icon-admin-192.png',
  './icon-admin-512.png'
];

// ── INSTALL: pré-cacheia apenas os assets (HTML vai pela rede) ──
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

// ── ACTIVATE: limpa caches antigos e avisa clientes para recarregar ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
  self.clients.claim();
});

// ── FETCH: estratégia por tipo de recurso ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  // Supabase — sempre rede
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Google Fonts — cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // Arquivos HTML — network-first, cache como fallback offline
  const isHtml = HTML_FILES.some(f => path.endsWith(f.replace('./', ''))) || path.endsWith('/');
  if (isHtml) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets (ícones, manifests) — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
    })
  );
});

// ── PUSH: notificação recebida via Web Push (requer Edge Function + VAPID) ──
self.addEventListener('push', e => {
  let payload = {
    title: 'AgendaPro',
    body: 'Novo agendamento recebido!',
    count: 1
  };
  try { payload = { ...payload, ...e.data.json() }; } catch {}

  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'novo-agendamento',
      renotify: true,
      vibrate: [200, 100, 200],
      data: payload
    })
  );
});

// ── NOTIFICATIONCLICK: abre/foca o painel admin ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('salao_admin') && 'focus' in c) return c.focus();
      }
      return clients.openWindow('./salao_admin.html');
    })
  );
});

// ── MESSAGE: atualiza badge via postMessage do cliente ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SET_BADGE') {
    const n = e.data.count || 0;
    if ('setAppBadge' in self) {
      n > 0 ? self.setAppBadge(n) : self.clearAppBadge();
    }
  }
});
