import { playwright, lanzar, R, LEAF, LCSS, CSV_REAL, CAPAS, VACIA } from './_comun.mjs';
const { chromium } = await playwright(); import fs from 'fs';
/* Servidor con simulación de Cloudflare Access: srv-acceso.mjs (puerto 8898; bandera .expirada en la raíz del repo). */
const FLAG = R('.expirada');
const D = CAPAS;
const b=await lanzar(chromium);
let expirada=false; const navs=[];
const ctx=await b.newContext({viewport:{width:1366,height:768}, serviceWorkers:'allow'});
await ctx.route('**/*', async r=>{const u=r.request().url();
 if(u.startsWith('http://localhost:8898')){
   return r.continue(); }
 if(u.includes('cloudflareaccess.com')){ navs.push(u); return r.fulfill({status:200, contentType:'text/html', body:'<title>Cloudflare Access</title>LOGIN'}); }
 if(u.includes('leaflet.js'))return r.fulfill({contentType:'application/javascript',body:LEAF});
 if(u.includes('leaflet.css'))return r.fulfill({contentType:'text/css',body:LCSS});
 if(u.includes('docs.google.com'))return r.fulfill({contentType:'text/csv',body:CSV_REAL});
 for(const k in D) if(u.includes(k+'.geojson')) return r.fulfill({contentType:'application/json',body:D[k]});
 if(u.endsWith('.geojson'))return r.fulfill({contentType:'application/json',body:VACIA});
 return r.abort();});
const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8898/index.html',{waitUntil:'load'}); await pg.waitForTimeout(4000);
console.log('SW registrado:', await pg.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration(); return !!(r&&(r.active||r.installing||r.waiting));}));
await pg.reload({waitUntil:'load'}); await pg.waitForTimeout(3500);
console.log('controlado:', await pg.evaluate(()=>!!navigator.serviceWorker.controller), 'url', pg.url(), 'errores', errs);
// 1. sesión válida: no debe reentrar
console.log('sondeo válido:', await pg.evaluate(async()=>{const r=await fetch('./sw.js?sesion=1',{cache:'no-store',redirect:'manual'}); return r.type+' '+r.status;}));
// 2. sesión expirada: sondeo → reentrada
expirada=true; fs.writeFileSync(FLAG,'1');
const antes=pg.url();
await pg.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
await pg.waitForTimeout(2500);
console.log('tras expirar (sondeo): url =', pg.url().slice(0,80), '| navegó a Access:', navs.length>0, '| título', await pg.title());
// 3. desde cero: reabrir con sesión expirada y una capa bajo demanda (aviso del SW)
fs.unlinkSync(FLAG); 
const pg2=await ctx.newPage(); pg2.on('pageerror',e=>errs.push(e.message));
await pg2.goto('http://localhost:8898/index.html',{waitUntil:'load'}); await pg2.waitForTimeout(3000);
fs.writeFileSync(FLAG,'1'); navs.length=0;
const r2=await pg2.evaluate(async()=>{ try{ const r=await fetch('data/pgoedf.geojson'); return r.status; }catch(e){ return 'ERR '+e.message; } });
await pg2.waitForTimeout(2500);
console.log('capa bajo demanda con sesión expirada → status', r2, '| url ahora', pg2.url().slice(0,70), '| navegó a Access:', navs.length>0, '| errores', errs);
fs.unlinkSync(FLAG);
// 4. retorno del login (/cdn-cgi/access/authorized) con el SW ya instalado: debe ir a la red,
//    fijar la cookie y volver a la app; si el SW lo intercepta, la URL se queda en /cdn-cgi/… sin cookie (A11)
let err4=null; try{ await pg2.goto('http://localhost:8898/cdn-cgi/access/authorized?nonce=abc&state=xyz',{waitUntil:'load',timeout:15000}); }catch(e){ err4=String(e).slice(0,120); }
const r4=await pg2.evaluate(()=>({ url: location.pathname+location.search, cookie: document.cookie }));
console.log('retorno de Access con SW:', JSON.stringify({ error: err4, ...r4 }), r4.cookie.includes('CF_Authorization') && r4.url.startsWith('/?entrada') ? '→ OK' : '→ FALLA (el SW se interpuso)');
await b.close();
