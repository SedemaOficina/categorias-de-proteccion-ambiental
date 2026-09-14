/* Servidor estático del arnés: sirve la raíz del repo en http://localhost:8897
   (PUERTO=… para cambiarlo). Sin caché, con los MIME que usa el tablero.
   Arranque:  node pendientes/arnes/srv.mjs &   (README § 2) */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ, PUERTO } from './_comun.mjs';
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.geojson':'application/json','.png':'image/png','.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml',
  '.webmanifest':'application/manifest+json','.pdf':'application/pdf','.ico':'image/x-icon'};
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = path.join(RAIZ, decodeURIComponent(u.pathname));
  if(u.pathname.endsWith('/')) p = path.join(p, 'index.html');
  if(!p.startsWith(RAIZ)){ res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => {
    if(e){ res.writeHead(404); return res.end('404'); }
    res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(d);
  });
}).listen(PUERTO, '127.0.0.1', () => console.log(`arnés · sirviendo ${RAIZ} en http://localhost:${PUERTO}`));
