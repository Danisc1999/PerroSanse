/* Service worker de Perro Sanse F.C.
   Hace dos cosas:
   1) Permite instalar la app en el móvil (que funcione como una app).
   2) Recibe los avisos push y los muestra aunque la app esté cerrada.
   No hay que tocar nada aquí. */

const CACHE = 'psfc-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero: la app siempre muestra los datos al día; la caché
// solo entra cuando no hay conexión.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener('push', (e) => {
  let d = { title: 'Perro Sanse F.C.', body: 'Hay novedades en la app.' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (err) {}

  // Si el aviso es de convocatoria, se puede contestar desde el propio
  // aviso sin abrir la app.
  const acciones = d.tipo === 'convocatoria' ? [
    { action: 'si', title: '✅ Voy' },
    { action: 'duda', title: '🤔 Duda' },
    { action: 'no', title: '❌ No puedo' }
  ] : [];

  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: 'uploads/Escudo.jpg',
      badge: 'uploads/Escudo.jpg',
      tag: d.tag || 'psfc',
      data: { url: d.url || './Perro%20Sanse%20FC.dc.html', jornada: d.jornada || null },
      actions: acciones,
      vibrate: [120, 60, 120]
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const datos = e.notification.data || {};
  let destino = datos.url || './';

  // Respuesta directa desde el aviso: la app la recoge al abrirse.
  if (e.action === 'si' || e.action === 'duda' || e.action === 'no') {
    const sep = destino.indexOf('?') === -1 ? '?' : '&';
    destino = destino + sep + 'responder=' + e.action + (datos.jornada ? '&jornada=' + datos.jornada : '');
    e.waitUntil(self.clients.openWindow(destino));
    return;
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ('focus' in c) return c.focus();
      return self.clients.openWindow(destino);
    })
  );
});
