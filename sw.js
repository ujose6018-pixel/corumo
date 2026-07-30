// Service worker de la caja.
// Guarda el armazon de la aplicacion para que abra sin conexion; los datos
// siguen viniendo de Firestore, que maneja su propia cache en IndexedDB.

const VERSION = 'caja-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const APP_SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/firebase.js',
  './js/store.js',
  './js/ui.js',
  './js/views/caja.js',
  './js/views/ventas.js',
  './js/views/productos.js',
  './js/views/inventario.js',
  './js/views/trabajadores.js',
  './js/views/planilla.js',
  './js/views/reportes.js',
  './js/views/usuarios.js',
  './js/views/ajustes.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // addAll falla entero si un archivo falla; se guardan uno por uno.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'saltar-espera') self.skipWaiting();
});

/** Firestore, Auth y sus canales largos nunca pasan por la cache. */
function esDatos(url) {
  return (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.pathname.includes('/google.firestore.')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (esDatos(url)) return;

  // Navegacion: red primero para tomar la version nueva, cache como respaldo.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copia = res.clone();
          caches.open(SHELL).then((c) => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Resto: se sirve de cache y se refresca por detras.
  event.respondWith(
    caches.match(request).then((cacheado) => {
      const red = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copia = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copia));
          }
          return res;
        })
        .catch(() => cacheado);
      return cacheado || red;
    })
  );
});
