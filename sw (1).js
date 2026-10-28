// EDU offline support + quick-add notification.
// Everything the app needs is saved on the phone, so it works with no signal.
const CACHE = 'edu-v4';
const CORE = ['./', './index.html', './privacy.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  // Save each file on its own, so one missing file never stops the app from working offline.
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(CORE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Pages: use the saved copy right away (fast, works with bad signal), update it in the background.
// Other files: saved copy first, refresh in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || caches.match('./index.html').then(h => h || net);
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});

// Quick-add notification: tapping a button opens EDU straight on the number pad.
const QUICK_TAG = 'edu-quick';
function showQuick() {
  return self.registration.showNotification('EDU – quick add', {
    body: 'Tap a button to add money in or money out.',
    tag: QUICK_TAG, renotify: false, silent: true, requireInteraction: true,
    icon: 'icon-192.png', badge: 'icon-192.png',
    actions: [{ action: 'in', title: '＋ Money In' }, { action: 'out', title: '－ Money Out' }],
    data: { quick: true }
  });
}
self.addEventListener('message', e => {
  if (e.data === 'quick-on') e.waitUntil(showQuick());
  if (e.data === 'quick-off') e.waitUntil(self.registration.getNotifications({ tag: QUICK_TAG }).then(ns => ns.forEach(n => n.close())));
});
self.addEventListener('notificationclick', e => {
  const n = e.notification;
  const what = e.action === 'out' ? 'out' : e.action === 'in' ? 'in' : 'home';
  const url = new URL('./index.html?add=' + what, self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); open.postMessage({ quickAdd: what }); }
    else await self.clients.openWindow(url);
    if (n.data && n.data.quick) await showQuick(); // keep the quick buttons in the notification bar
  })());
});
self.addEventListener('notificationclose', e => {
  // Some phones let people swipe it away; that's fine — it comes back next time EDU is opened.
});
