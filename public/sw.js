const CACHE="kastriva-attendance-static-v1";
const STATIC=["/offline.html","/manifest.webmanifest","/kastriva-employee-attendance-mark.svg","/kastriva-employee-attendance-logo.svg"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==="navigate"){event.respondWith(fetch(request).catch(()=>caches.match("/offline.html")));return;}
  if(url.pathname.startsWith("/api/"))return;
  if(request.destination==="image"||url.pathname.startsWith("/_next/static/")||STATIC.includes(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
      return response;
    })));
  }
});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting();});
