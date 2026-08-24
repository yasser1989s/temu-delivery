const CACHE_NAME = "pro-delivery-v3";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/app.js",
  "./assets/styles.css"
];

// تثبيت Service Worker
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// تفعيل النسخة الجديدة
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// التعامل مع الطلبات
self.addEventListener("fetch", event => {
  const request = event.request;

  // تجاهل أي شيء ليس HTTP/HTTPS
  if (
    request.method !== "GET" ||
    !["http:", "https:"].includes(new URL(request.url).protocol)
  ) {
    return;
  }

  // تجاهل طلبات Chrome Extensions
  if (request.url.startsWith("chrome-extension://")) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {

      if (cachedResponse) {
        // استخدم النسخة المخزنة فوراً
        // وفي نفس الوقت حاول تحديثها بالخلفية
        event.waitUntil(
          fetch(request)
            .then(response => {
              if (
                response &&
                response.ok &&
                response.type === "basic"
              ) {
                return caches.open(CACHE_NAME).then(cache => {
                  return cache.put(request, response.clone());
                });
              }
            })
            .catch(() => {})
        );

        return cachedResponse;
      }

      // إذا لم يكن موجوداً في Cache
      return fetch(request)
        .then(response => {

          if (
            response &&
            response.ok &&
            response.type === "basic"
          ) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, copy).catch(() => {});
            });
          }

          return response;
        })
        .catch(() => {

          // إذا انقطع الإنترنت
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }

          return new Response(
            "Offline",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8"
              }
            }
          );
        });
    })
  );
});
