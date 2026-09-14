/* Piezas comunes del arnés de verificación (auditoría 13-sep-2026, D12-04).
   Todo se resuelve respecto a la RAÍZ DEL REPO, así que los scripts corren
   desde cualquier carpeta: `node pendientes/arnes/aud360.mjs` o `cd
   pendientes/arnes && node aud360.mjs` dan lo mismo. Requisitos y línea de
   arranque exacta en pendientes/arnes/README.md. */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const R = (...p) => path.join(RAIZ, ...p);
export const F = (...p) => fs.readFileSync(R(...p), 'utf8');

/* Playwright: primero el paquete instalado en el repo (npm i -D playwright),
   después uno global señalado con PLAYWRIGHT_DIR (carpeta que contiene
   node_modules/playwright). Chromium: el que trae Playwright, o CHROME=ruta. */
export async function playwright(){
  const norm = m => (m && m.chromium) ? m : (m && m.default) ? m.default : m;   /* CJS importado desde ESM */
  try{ return norm(await import('playwright')); }
  catch(_){
    const dir = process.env.PLAYWRIGHT_DIR;
    if(!dir) throw new Error('No se encontró playwright. Ejecuta `npm i -D playwright` en la raíz del repo o define PLAYWRIGHT_DIR.');
    return norm(await import(path.join(dir, 'node_modules', 'playwright', 'index.js')));
  }
}
export const lanzar = (chromium, extra={}) => chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox'], ...extra
});

/* Leaflet 1.9.4 local (pendientes/arnes/vendor/): el arnés no tiene red y
   index.html lo pide a unpkg con SRI, así que se sirve el mismo archivo. */
export const LEAF = F('pendientes', 'arnes', 'vendor', 'leaflet.js');
export const LCSS = F('pendientes', 'arnes', 'vendor', 'leaflet.css');

/* CSV real del inventario (copia del Sheet del 12-sep-2026) y CSV mínimo. */
export const CSV_REAL = F('pendientes', 'arnes', 'fixtures', 'inventario_real_2026-09-12.csv');
export const CSV_MIN  = F('pendientes', 'arnes', 'fixtures', 'inventario.csv');
export const LEAFLET_STUB = F('pendientes', 'arnes', 'fixtures', 'leaflet-stub.js');

/* Capas que se sirven desde data/ del repo (las pesadas responden vacías). */
export const CAPAS = {
  geometrias: F('data', 'geometrias.geojson'),
  alcaldias: F('data', 'alcaldias.geojson'),
  suelo_conservacion: F('data', 'suelo_conservacion.geojson'),
  arcac: F('data', 'arcac.geojson'),
  zona_patrimonio: F('data', 'zona_patrimonio.geojson'),
};
export const VACIA = '{"type":"FeatureCollection","features":[]}';

/* Tesela sintética (PNG 256×256 beige). Se responde con CORS porque las capas
   de teselas se piden con crossOrigin (v67): sin la cabecera el mapa no pinta. */
export function png(w, h, rgb){
  const raw = Buffer.alloc((w*3+1)*h);
  for(let y=0; y<h; y++){ raw[y*(w*3+1)] = 0; for(let x=0; x<w; x++){ const o = y*(w*3+1)+1+x*3; raw[o]=rgb[0]; raw[o+1]=rgb[1]; raw[o+2]=rgb[2]; } }
  const crc = b => { let c, t=[]; for(let n=0;n<256;n++){ c=n; for(let k=0;k<8;k++) c = c&1 ? 0xedb88320^(c>>>1) : c>>>1; t[n]=c; } let cr=0xffffffff; for(const x of b) cr = t[(cr^x)&255]^(cr>>>8); return (cr^0xffffffff)>>>0; };
  const ch = (t, d) => { const l=Buffer.alloc(4); l.writeUInt32BE(d.length); const td=Buffer.concat([Buffer.from(t), d]); const c=Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w,0); ih.writeUInt32BE(h,4); ih[8]=8; ih[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}
export const TILE = png(256, 256, [236,233,224]);
export const teselaCORS = r => r.fulfill({ contentType:'image/png', headers:{'Access-Control-Allow-Origin':'*'}, body: TILE });

/* Puerto único del servidor estático del arnés (README § 2). */
export const PUERTO = Number(process.env.PUERTO || 8897);
export const BASE = `http://localhost:${PUERTO}`;

/* Enrutado estándar: repo local por red, Leaflet y CSV locales, teselas
   sintéticas, capas de data/, todo lo demás abortado (sin red). */
export function enrutar(ctx, { csv = CSV_REAL, leaflet = LEAF, capas = CAPAS, extra } = {}){
  const peticiones = [];
  return ctx.route('**/*', async r => {
    const u = r.request().url();
    if(extra){ const res = await extra(u, r); if(res === true) return; }
    if(u.startsWith(BASE)){ peticiones.push(u.replace(BASE + '/', '')); return r.continue(); }
    if(u.includes('leaflet.js'))  return r.fulfill({ contentType:'application/javascript', body: leaflet });
    if(u.includes('leaflet.css')) return r.fulfill({ contentType:'text/css', body: LCSS });
    if(u.includes('docs.google.com')) return r.fulfill({ contentType:'text/csv', body: csv });
    if(u.includes('basemaps.cartocdn') || u.includes('arcgisonline') || u.includes('openstreetmap')) return teselaCORS(r);
    if(u.includes('fonts.googleapis.com')) return r.fulfill({ contentType:'text/css', body:'' });
    for(const k in capas) if(capas[k] && u.includes(k + '.geojson')) return r.fulfill({ contentType:'application/json', body: capas[k] });
    if(u.endsWith('.geojson')) return r.fulfill({ contentType:'application/json', body: VACIA });
    return r.abort();
  }).then(() => peticiones);
}
