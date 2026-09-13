import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium, devices } = pw; import fs from 'fs'; import zlib from 'zlib';
const F=n=>fs.readFileSync(n,'utf8');
const LEAF=F('vendor/leaflet.js'),LCSS=F('vendor/leaflet.css');
const D={geometrias:F('data/geometrias.geojson'),alcaldias:F('data/alcaldias.geojson'),suelo_conservacion:F('data/suelo_conservacion.geojson'),arcac:F('arcac.geojson'),zona_patrimonio:F('data/zona_patrimonio.geojson'),traslapes:fs.existsSync('data/traslapes.geojson')?F('data/traslapes.geojson'):null};
function png(w,h,rgb){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;raw[o]=rgb[0];raw[o+1]=rgb[1];raw[o+2]=rgb[2];}}
 const crc=(b)=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}let cr=0xffffffff;for(const x of b)cr=t[(cr^x)&255]^(cr>>>8);return (cr^0xffffffff)>>>0;};
 const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))]);}
const TILE=png(256,256,[236,233,224]);
const PERFILES=[
 {n:'iPhone 14 (Safari-like)', vp:{width:390,height:844}, dpr:3, mob:true, ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'},
 {n:'Android Pixel 7', vp:{width:412,height:915}, dpr:2.625, mob:true, ua:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'},
 {n:'Laptop 1366×768', vp:{width:1366,height:768}, dpr:1, mob:false},
 {n:'Escritorio 1920×1080', vp:{width:1920,height:1080}, dpr:1, mob:false},
];
const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const informe={};
for(const P of PERFILES){
 const ctx=await b.newContext({viewport:P.vp,deviceScaleFactor:P.dpr,isMobile:P.mob,hasTouch:P.mob,userAgent:P.ua});
 let bytes=0; const peticiones=[];
 await ctx.route('**/*', async r=>{const u=r.request().url();
  if(u.startsWith('http://localhost:8897')){ peticiones.push(u.replace('http://localhost:8897/','')); return r.continue(); }
  if(u.includes('leaflet.js'))return r.fulfill({contentType:'application/javascript',body:LEAF});
  if(u.includes('leaflet.css'))return r.fulfill({contentType:'text/css',body:LCSS});
  if(u.includes('docs.google.com'))return r.fulfill({contentType:'text/csv',body:F('inventario_v39.csv')});
  if(u.includes('basemaps.cartocdn')||u.includes('arcgisonline'))return r.fulfill({contentType:'image/png',body:TILE});
  for(const k in D) if(D[k] && u.includes(k+'.geojson')) return r.fulfill({contentType:'application/json',body:D[k]});
  if(u.endsWith('.geojson'))return r.fulfill({contentType:'application/json',body:'{"type":"FeatureCollection","features":[]}'});
  return r.abort();});
 const pg=await ctx.newPage(); const errs=[], warns=[]; pg.on('pageerror',e=>errs.push(String(e).slice(0,160))); pg.on('console',m=>{ if(m.type()==='warning'||m.type()==='error') warns.push(m.type()+': '+m.text().slice(0,140)); });
 pg.on('response',async r=>{ try{ const h=r.headers()['content-length']; if(h) bytes+=+h; }catch(_){}} );
 const t0=Date.now();
 await pg.goto('http://localhost:8897/index.html',{waitUntil:'load'});
 await pg.waitForFunction(()=>document.querySelectorAll('#tb tr').length>0 || document.querySelector('.dest'), null, {timeout:15000}).catch(()=>{});
 const tBoot=Date.now()-t0;
 await pg.waitForTimeout(2500);
 const R={boot_ms:tBoot, errores:errs, avisos:[...new Set(warns)].slice(0,8), hallazgos:[]};
 const H=(sev,area,txt,ev)=>R.hallazgos.push({sev,area,txt,ev});
 // meta / básicos
 const meta=await pg.evaluate(()=>({dom:document.querySelectorAll('*').length, dest:document.body.className+' '+document.querySelector('.wrap').className, inputFs:getComputedStyle(document.getElementById('ubicarInput')).fontSize, lang:document.documentElement.lang, h1:document.querySelectorAll('h1').length, skip:!!document.querySelector('a[href="#main-content"], .skip-link'), sw:'serviceWorker' in navigator, focusVisibleRules:[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.selectorText&&r.selectorText.includes('focus-visible'))}catch(e){return false}})}));
 R.meta=meta;
 if(P.mob && parseFloat(meta.inputFs)<16) H('alta','iOS','El campo de búsqueda tiene fuente < 16 px: Safari iOS hace zoom automático al enfocarlo',meta.inputFs);
 if(!meta.skip) H('baja','a11y','Sin enlace «saltar al contenido»','');
 // recorrido de destinos y subfiltros
 const recorrido=[];
 const dests=await pg.evaluate(()=>[...document.querySelectorAll('.dest[data-dest]')].map(b=>b.dataset.dest));
 for(const d of dests){
   await pg.evaluate(d=>{const b=document.querySelector(`.dest[data-dest="${d}"]`); b&&b.click();}, d); await pg.waitForTimeout(1200);
   const subs=await pg.evaluate(()=>[...document.querySelectorAll('.subchip[data-id]')].map(b=>b.dataset.id));
   for(const s of (subs.length?subs:[null])){
     if(s){ await pg.evaluate(s=>{const b=document.querySelector(`.subchip[data-id="${s}"]`); b&&b.click();}, s); await pg.waitForTimeout(1500); }
     const m=await pg.evaluate(()=>{
       const vw=document.documentElement.clientWidth; const hs=document.documentElement.scrollWidth>vw+1;
       const fuera=[]; for(const el of document.querySelectorAll('body *')){ const r=el.getBoundingClientRect(); if(r.width>0&&r.height>0&&r.right>vw+2&&getComputedStyle(el).position!=='fixed'&&!el.closest('.leaflet-container')&&!el.closest('.tabla-scroll,.table-wrap,[style*="overflow"]')) { fuera.push((el.tagName+'.'+String(el.className).split(' ')[0]).slice(0,40)); if(fuera.length>5) break; } }
       // objetivos táctiles
       const peq=[]; for(const el of document.querySelectorAll('button,a[href],input,select,[role=button],.subchip,.dest')){ const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) continue; const cs=getComputedStyle(el); if(cs.visibility==='hidden') continue; if(el.closest('.leaflet-control-attribution')) continue; if(Math.min(r.width,r.height)<40) peq.push((el.id?'#'+el.id:el.tagName+'.'+String(el.className).split(' ')[0]).slice(0,34)+' '+Math.round(r.width)+'×'+Math.round(r.height)); }
       // truncados
       const trunc=[]; for(const el of document.querySelectorAll('td,th,.v,.subcat,.kat,h2,h3,.panel-title,.subchip,.dest span')){ if(el.scrollWidth>el.clientWidth+2){ trunc.push((el.tagName+'.'+String(el.className).split(' ')[0]).slice(0,30)); } }
       // nombres accesibles
       const sinNombre=[...document.querySelectorAll('button,a[href]')].filter(el=>{const r=el.getBoundingClientRect(); if(!r.width) return false; const n=(el.getAttribute('aria-label')||el.title||el.textContent||'').trim(); return !n;}).map(el=>(el.id?'#'+el.id:el.tagName+'.'+String(el.className).split(' ')[0]).slice(0,34));
       const imgs=[...document.querySelectorAll('img')].filter(i=>!i.hasAttribute('alt')).length;
       // contraste aproximado (texto pequeño con color y fondo resueltos)
       const lum=c=>{const m=c.match(/\d+(\.\d+)?/g); if(!m) return null; const [r,g,bb,a]=m.map(Number); if(a===0) return null; const f=v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bb);};
       const fondoDe=el=>{let e=el; while(e){const bg=getComputedStyle(e).backgroundColor; if(bg && !bg.startsWith('rgba(0, 0, 0, 0)') && bg!=='transparent') return bg; e=e.parentElement;} return 'rgb(255,255,255)';};
       const bajo=new Map(); let vistos=0;
       for(const el of document.querySelectorAll('p,span,td,th,div,a,button,label,li,small,b')){ if(vistos>1500) break; if(!el.childNodes.length||![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) continue; const r=el.getBoundingClientRect(); if(!r.width||r.top>innerHeight*3) continue; vistos++; const cs=getComputedStyle(el); const l1=lum(cs.color), l2=lum(fondoDe(el)); if(l1==null||l2==null) continue; const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); const fs=parseFloat(cs.fontSize); const grande=fs>=24||(fs>=18.66&&parseInt(cs.fontWeight)>=700); const min=grande?3:4.5; if(ratio<min){ const k=(el.tagName+'.'+String(el.className).split(' ')[0]).slice(0,30); if(!bajo.has(k)) bajo.set(k,{ratio:+ratio.toFixed(2),color:cs.color,fondo:fondoDe(el),fs}); } }
       return {hs, fuera:[...new Set(fuera)], peq:[...new Set(peq)].slice(0,12), nPeq:new Set(peq).size, trunc:[...new Set(trunc)].slice(0,8), sinNombre:[...new Set(sinNombre)].slice(0,8), imgs, contraste:[...bajo.entries()].slice(0,10)};
     });
     recorrido.push({dest:d,sub:s,...m});
   }
 }
 R.recorrido=recorrido;
 // flujos ubicar (3 casos) + ficha desde resultado
 await pg.evaluate(()=>{const b=document.querySelector('.dest[data-dest="UBICAR"]'); b&&b.click();}); await pg.waitForTimeout(800);
 const flujos={};
 for(const [nom,c] of [['urbano','19.3467, -99.1617'],['anp_pm_coadmin','19.3125, -99.3095'],['sc_pgoedf','19.15, -99.05'],['doble','19.3455, -99.0905']]){
   await pg.fill('#ubicarInput',c); await pg.press('#ubicarInput','Enter'); await pg.waitForTimeout(3000);
   flujos[nom]=await pg.evaluate(()=>{const s=document.getElementById('ubicarResultado'); return {cabeza:(s.querySelector('.ubi-cabeza-txt')||{}).textContent, chips:[...s.querySelectorAll('.ubi-chip')].map(c=>c.textContent.trim()), zona:(s.querySelector('#ubiZonaPM')||{}).textContent, pgoedf:(s.querySelector('#ubiPgoedf')||{}).textContent?.slice(0,60), fichas:s.querySelectorAll('[data-ficha]').length, mapa:!!s.querySelector('.leaflet-container')};});
   if(nom==='anp_pm_coadmin'){ await pg.evaluate(()=>{const b=document.querySelector('#ubicarResultado [data-ficha]'); b&&b.click();}); await pg.waitForTimeout(2500);
     flujos.ficha_desde_resultado=await pg.evaluate(()=>{const dr=document.getElementById('dr'); return {abierta:dr.classList.contains('open'), zonaPunto:[...dr.querySelectorAll('.field .k')].some(k=>/ZONA DEL PUNTO/i.test(k.textContent)), foco:(document.activeElement&&(document.activeElement.id||document.activeElement.className))||''};});
     // compartir imagen
     const share=await pg.evaluate(async()=>{ let dims=null; const orig=HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob=function(cb,...a){ dims=[this.width,this.height]; return orig.call(this,cb,...a); }; const a=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){}; navigator.share=undefined; const b=document.getElementById('btnShareArea'); b.click(); await new Promise(r=>setTimeout(r,2500)); HTMLCanvasElement.prototype.toBlob=orig; HTMLAnchorElement.prototype.click=a; return {dims, texto:b.textContent.trim()}; });
     flujos.compartir=share;
     // Escape cierra
     await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
     flujos.escapeCierra=await pg.evaluate(()=>!document.getElementById('dr').classList.contains('open'));
     if(!flujos.escapeCierra){ await pg.evaluate(()=>document.querySelector('#dr .close').click()); await pg.waitForTimeout(400); }
   }
   await pg.evaluate(()=>{const b=document.getElementById('ubicarCerrar'); b&&b.click();}); await pg.waitForTimeout(400);
 }
 R.flujos=flujos;
 R.red={peticiones:[...new Set(peticiones)].length, bytesLocales:bytes};
 informe[P.n]=R;
 await ctx.close();
}
fs.writeFileSync('aud360.json', JSON.stringify(informe,null,1));
for(const [n,R] of Object.entries(informe)){
  console.log(`\n══════ ${n} · boot ${R.boot_ms} ms · DOM ${R.meta.dom} · input ${R.meta.inputFs}`);
  console.log(' errores:',R.errores); console.log(' avisos:',R.avisos);
  console.log(' hallazgos:',R.hallazgos);
  for(const r of R.recorrido){ const flags=[]; if(r.hs) flags.push('SCROLL-H'); if(r.fuera.length) flags.push('fuera:'+r.fuera.join(',')); if(r.nPeq) flags.push(`táctiles<40: ${r.nPeq} → ${r.peq.slice(0,6).join(' | ')}`); if(r.trunc.length) flags.push('truncados:'+r.trunc.join(',')); if(r.sinNombre.length) flags.push('sinNombre:'+r.sinNombre.join(',')); if(r.imgs) flags.push('img sin alt:'+r.imgs); if(r.contraste.length) flags.push('contraste:'+r.contraste.map(([k,v])=>`${k} ${v.ratio}`).join(', '));
    console.log(`  ${r.dest}/${r.sub||'-'}: ${flags.join(' · ')||'ok'}`); }
  console.log(' flujos:',JSON.stringify(R.flujos));
}
await b.close();
