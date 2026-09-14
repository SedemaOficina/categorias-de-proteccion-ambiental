import { playwright, lanzar, CSV_MIN as CSV, LEAFLET_STUB as STUB, BASE } from './_comun.mjs';
const { chromium } = await playwright(); import fs from 'fs';
const EMPTY = JSON.stringify({type:'FeatureCollection',features:[]});
const b = await lanzar(chromium);
const ctx = await b.newContext({viewport:{width:1440,height:1000}});
await ctx.route('**/*', async r=>{
  const u=r.request().url();
  if(u.startsWith(BASE)) return r.continue();
  if(u.includes('leaflet.js')) return r.fulfill({contentType:'application/javascript',body:STUB});
  if(u.includes('leaflet.css')||u.includes('fonts.googleapis.com')) return r.fulfill({contentType:'text/css',body:''});
  if(u.includes('docs.google.com')) return r.fulfill({contentType:'text/csv',body:CSV});
  if(u.endsWith('.geojson')) return r.fulfill({contentType:'application/json',body:EMPTY});
  return r.abort();
});
const pg = await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
await pg.goto(BASE+'/index.html',{waitUntil:'load'});
await pg.waitForTimeout(3000);
const visibles = () => pg.evaluate(()=>{
  const ids=['q','fTipo','fJur','fCat','fAlc','fPM','fSC','fDG'];
  const v={};
  ids.forEach(id=>{ const e=document.getElementById(id); const l=e&&e.closest('label');
    v[id] = e ? (l ? l.style.display!=='none' : true) : null; });
  v['btnMasFiltros'] = document.getElementById('btnMasFiltros').style.display!=='none';
  v['_filas'] = document.querySelectorAll('#tb tr').length;
  return v;
});
console.log('TODAS      ', JSON.stringify(await visibles()));
for(const [id,lbl] of [['BU','Bosques Urbanos'],['BR','Barrancas'],['ANPL','ANP Locales'],['ANPF','ANP Federales']]){
  await pg.click(`.subchip[data-id="${id}"]`); await pg.waitForTimeout(700);
  console.log(lbl.padEnd(11), JSON.stringify(await visibles()));
}
await pg.click('.subchip[data-id="ALL"]'); await pg.waitForTimeout(700);
console.log('vuelve TODAS', JSON.stringify(await visibles()));
console.log(errs.length? 'ERRORES: '+errs[0] : 'sin errores de JS');
await pg.screenshot({path:'shots/filtros.png'});
await b.close();
