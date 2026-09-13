import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw; import fs from 'fs';
const F=n=>fs.readFileSync(n,'utf8');
const LEAF=F('vendor/leaflet.js'),LCSS=F('vendor/leaflet.css');
const D={geometrias:F('data/geometrias.geojson'),alcaldias:F('data/alcaldias.geojson'),suelo_conservacion:F('data/suelo_conservacion.geojson'),arcac:F('arcac.geojson'),zona_patrimonio:F('data/zona_patrimonio.geojson')};
const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
let expirada=false; const navs=[];
const ctx=await b.newContext({viewport:{width:1366,height:768}, serviceWorkers:'allow'});
await ctx.route('**/*', async r=>{const u=r.request().url();
 if(u.startsWith('http://localhost:8898')){
   return r.continue(); }
 if(u.includes('cloudflareaccess.com')){ navs.push(u); return r.fulfill({status:200, contentType:'text/html', body:'<title>Cloudflare Access</title>LOGIN'}); }
 if(u.includes('leaflet.js'))return r.fulfill({contentType:'application/javascript',body:LEAF});
 if(u.includes('leaflet.css'))return r.fulfill({contentType:'text/css',body:LCSS});
 if(u.includes('docs.google.com'))return r.fulfill({contentType:'text/csv',body:F('inventario_v39.csv')});
 for(const k in D) if(u.includes(k+'.geojson')) return r.fulfill({contentType:'application/json',body:D[k]});
 if(u.endsWith('.geojson'))return r.fulfill({contentType:'application/json',body:'{"type":"FeatureCollection","features":[]}'});
 return r.abort();});
const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8898/index.html',{waitUntil:'load'}); await pg.waitForTimeout(4000);
console.log('SW registrado:', await pg.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration(); return !!(r&&(r.active||r.installing||r.waiting));}));
await pg.reload({waitUntil:'load'}); await pg.waitForTimeout(3500);
console.log('controlado:', await pg.evaluate(()=>!!navigator.serviceWorker.controller), 'url', pg.url(), 'errores', errs);
// 1. sesión válida: no debe reentrar
console.log('sondeo válido:', await pg.evaluate(async()=>{const r=await fetch('./sw.js?sesion=1',{cache:'no-store',redirect:'manual'}); return r.type+' '+r.status;}));
// 2. sesión expirada: sondeo → reentrada
expirada=true; fs.writeFileSync('/home/claude/verif/.expirada','1');
const antes=pg.url();
await pg.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
await pg.waitForTimeout(2500);
console.log('tras expirar (sondeo): url =', pg.url().slice(0,80), '| navegó a Access:', navs.length>0, '| título', await pg.title());
// 3. desde cero: reabrir con sesión expirada y una capa bajo demanda (aviso del SW)
fs.unlinkSync('/home/claude/verif/.expirada'); 
const pg2=await ctx.newPage(); pg2.on('pageerror',e=>errs.push(e.message));
await pg2.goto('http://localhost:8898/index.html',{waitUntil:'load'}); await pg2.waitForTimeout(3000);
fs.writeFileSync('/home/claude/verif/.expirada','1'); navs.length=0;
const r2=await pg2.evaluate(async()=>{ try{ const r=await fetch('data/pgoedf.geojson'); return r.status; }catch(e){ return 'ERR '+e.message; } });
await pg2.waitForTimeout(2500);
console.log('capa bajo demanda con sesión expirada → status', r2, '| url ahora', pg2.url().slice(0,70), '| navegó a Access:', navs.length>0, '| errores', errs);
fs.unlinkSync('/home/claude/verif/.expirada');
await b.close();
