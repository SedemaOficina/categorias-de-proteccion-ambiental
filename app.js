/* ═════════════════════════════════════════════════════════════════════
   Dashboard · Categorías de Protección Ambiental · SIA · SEDEMA CDMX
   Lógica de la aplicación. Hasta la v43 vivía incrustada en index.html.
   Un solo IIFE con estado compartido: NO es un módulo ES y no debe cargarse
   con type="module". Depende de config.js, que se carga antes.
   Validar siempre con: node --check app.js
   ═════════════════════════════════════════════════════════════════════ */
(async function(){
try{

/* ===== DATA ===== */
/* ============================================================
   CARGA DE INVENTARIO DESDE GOOGLE SHEETS (publicado como CSV)
   ============================================================ */
function parseCSV(text){
  // Parser CSV: maneja comillas dobles, comas escapadas y BOM
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i], n = text[i+1];
    if(inQuotes){
      if(c === '"' && n === '"'){ field += '"'; i++; }
      else if(c === '"'){ inQuotes = false; }
      else field += c;
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field = ''; }
      else if(c === '\n' || c === '\r'){
        if(field !== '' || row.length){ row.push(field); rows.push(row); }
        row = []; field = '';
        if(c === '\r' && n === '\n') i++;
      } else field += c;
    }
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  if(!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(v => v !== '')).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (r[i] || '').trim());
    if(obj.superficie) obj.superficie = parseFloat(obj.superficie) || 0;
    return obj;
  });
}

/* ============================================================
 * CARGA DEL INVENTARIO · Fuente única: Google Sheets
 * ============================================================
 * Inventario publicado como CSV desde Google Sheets.
 * Permite edición colaborativa en tiempo real sin tocar el repo.
 * El Service Worker cachea la última respuesta exitosa para
 * garantizar operación offline tras la primera visita.
 *
 * Para cambiar la fuente, modificar SHEET_URL.
 * ============================================================ */
/* gid=1601492810 es la pestaña «Inventario». Republicada el 11-sep-2026: al
   reestructurar el Sheet (renombrar la hoja y agregar ARCAC, Traslapes y la
   nota metodológica) la publicación anterior con gid=0 dejó de resolver y
   Google empezó a devolver su página de error con HTTP 200. Si vuelve a
   romperse, republicar SOLO esa hoja como CSV y traer el gid nuevo: no basta
   con cambiar la clave 2PACX y conservar el gid viejo. */
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjzQYJ2Qyj_LB2oFOU2irZa1Qp1yNt9Z44MGbU_2xkAMwxIPOuiviorX6JI4P_eb5kA3rkKqYomQo1/pub?gid=1601492810&single=true&output=csv';

const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* ^ Escape de texto libre antes de insertarlo con innerHTML (defensa XSS).
     Se declara aqui, y no junto al resto de helpers, porque es un const (no se
     iza) y DATA lo necesita unas lineas mas abajo. */

/* Aviso en el cuerpo de la tabla mientras el inventario no llega. Sin esto,
   una respuesta lenta del Sheet se ve como una pagina rota: el cascaron se
   pinta y el usuario se queda con "REGISTROS · —" sin ninguna senal. */
function _estadoTabla(msg){
  try{
    const tb = document.getElementById('tb');
    if(tb) tb.innerHTML = '<tr><td colspan="12" class="ubi-cargando">' + msg + '</td></tr>';
  }catch(_){}
}

async function loadInventarioCSV(){
  _estadoTabla('Cargando el inventario…');
  /* Era el unico fetch del archivo sin timeout, y bloquea todo el modulo:
     si el Sheet no responde, nada despues de esta linea se ejecuta. */
  const intento = async (ms)=>{
    const url = SHEET_URL + (SHEET_URL.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const ac = new AbortController();
    const reloj = setTimeout(()=>ac.abort(), ms);
    try{ return await fetch(url, { cache:'no-store', signal:ac.signal }); }
    finally{ clearTimeout(reloj); }
  };
  let r;
  try{
    r = await intento(9000);
  }catch(err){
    if(err && err.name !== 'AbortError') throw err;
    _estadoTabla('El inventario tarda en responder. Reintentando…');
    try{
      r = await intento(15000);
    }catch(err2){
      throw new Error('El inventario de Google Sheets no respondió a tiempo. '
                    + 'Revisa la conexión y recarga la página.');
    }
  }
  if(!r.ok) throw new Error('No se pudo leer el inventario desde Google Sheets (HTTP ' + r.status + ')');
  const text = await r.text();

  /* Google responde 200 con una página HTML —«No se pudo abrir el archivo en
     este momento»— cuando la publicación del Sheet se rompe: la hoja
     publicada se borró, cambió de gid, o la liga apunta a un documento que
     ya no se publica. Sin esta guarda, parseCSV interpreta el HTML como si
     fueran datos y el tablero pinta filas basura en lugar de avisar. */
  if(/^\s*<(?:!doctype|html|head|meta)/i.test(text))
    throw new Error('La liga publicada devolvió una página HTML, no el CSV. '
                  + 'La publicación del Sheet está caída o apunta a un documento que ya no se publica: '
                  + 'vuelve a publicar la hoja del inventario como CSV y actualiza SHEET_URL.');

  const rows = parseCSV(text);
  if(!rows.length) throw new Error('El inventario de Google Sheets está vacío o mal formado.');

  /* El join con la geometría es por `nombre` exacto y el agrupamiento por
     `grupo`: sin esas dos columnas no hay inventario, solo 66 registros
     vacíos. Más vale un error legible que una tabla en blanco. */
  const faltan = ['nombre','grupo'].filter(k => !(k in rows[0]));
  if(faltan.length) throw new Error('El CSV no trae la columna «' + faltan.join('», «')
                  + '». Revisa que la liga publicada apunte a la hoja del inventario.');
  return rows;
}

/* Respaldo del inventario dentro del repositorio.
   El Sheet es la fuente autoritativa, pero es UNA fuente: el 11-sep-2026 su
   publicación dejó de resolver y el tablero estuvo horas sin datos. Con esta
   copia, una caída del Sheet deja de ser una caída del tablero y pasa a ser
   una degradación: se sirven los datos del último corte, claramente rotulados
   como tales para que nadie los confunda con el dato vivo.
   Se regenera exportando la hoja «Inventario» como CSV a data/inventario.csv. */
async function cargarRespaldoCSV(){
  const r = await fetch('./data/inventario.csv', { cache: 'no-cache' });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const filas = parseCSV(await r.text());
  if(!filas.length || !('nombre' in filas[0])) throw new Error('respaldo ilegible');
  return filas;
}

/* Un fallo del Sheet no debe tumbar el tablero entero. Ubicar, los mapas,
   Zona Patrimonio y ARCAC no dependen del inventario y siguen sirviendo en
   campo, que es el uso dominante. */
let INVENTARIO_ERROR = '';
let INVENTARIO_RESPALDO = false;
let DATA_RAW = [];
try{
  DATA_RAW = await loadInventarioCSV();
}catch(err){
  const motivo = (err && err.message) ? err.message : String(err);
  console.error('[Inventario] ' + motivo);
  _estadoTabla('El inventario en vivo no respondió. Cargando la copia local…');
  try{
    DATA_RAW = await cargarRespaldoCSV();
    INVENTARIO_RESPALDO = true;
    console.warn('[Inventario] sirviendo el respaldo del repositorio');
    setTimeout(()=>{ try{ siaToast('Inventario servido desde la copia local: el Sheet no respondió.'); }catch(_){} }, 1200);
  }catch(err2){
    INVENTARIO_ERROR = motivo;
    _estadoTabla('No se pudo cargar el inventario. ' + motivo);
    setTimeout(()=>{ try{ siaToast('No se pudo cargar el inventario desde Google Sheets.'); }catch(_){} }, 1200);
  }
}

// Cargar polígonos de Suelo de Conservación (capa overlay)
let SUELO_CONSERVACION = null;
async function loadSueloConservacion(){
  if(SUELO_CONSERVACION) return SUELO_CONSERVACION;
  try {
    const r = await fetch('data/suelo_conservacion.geojson');
    if(!r.ok) throw new Error('HTTP ' + r.status);
    SUELO_CONSERVACION = await r.json();
    return SUELO_CONSERVACION;
  } catch(err){
    console.warn('[SC] No se pudo cargar Suelo de Conservación:', err.message);
    SUELO_CONSERVACION = {type:'FeatureCollection', features:[]};
    return SUELO_CONSERVACION;
  }
}
// Iniciar carga en paralelo (no bloquea el render)
loadSueloConservacion();

const DATA = DATA_RAW.map(d => {
  // Normalización defensiva de la columna dg_responsable
  // Acepta variantes de mayúsculas/espacios y mapea a un valor canónico
  let dg = (d.dg_responsable || d.DG_responsable || d.DG || d.dg || '').toString().trim().toUpperCase().replace(/\s+/g, '');
  if(dg === 'DGSANPAVA' || dg === 'SANPAVA') dg = 'DGSANPAVA';
  else if(dg === 'DGCORENADER' || dg === 'CORENADER' || dg === 'DGCORENADR' || dg === 'CORENADR' || dg === 'CORENA') dg = 'DGCORENADER';
  else dg = '';  // Si está vacío o no reconocido, queda en blanco

  // Normalización defensiva de URLs (decreto y programa de manejo)
  // Limpia espacios; convierte cadena vacía/—/N/A en null para facilitar checks posteriores
  const cleanUrl = u => {
    const s = String(u||'').trim();
    if(!s || s === '—' || s === '-' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'na') return '';
    // Debe iniciar con http:// o https://
    if(!/^https?:\/\//i.test(s)) return '';
    /* Rechazo de caracteres que rompen el atributo href o inyectan un
       manejador de evento: una URL legitima no los lleva sin codificar. */
    if(/["'<>\s`\\]/.test(s)) return '';
    try{ return new URL(s).href; }catch(_){ return ''; }
  };

  // Normalización defensiva de fechas ISO
  // Garantiza formato AAAA-MM-DD aunque Excel/CSV las guarde como DD/MM/AAAA
  const cleanIso = (raw, fallback) => {
    let s = String(raw||'').trim();
    if(!s) s = String(fallback||'').trim();
    if(!s) return '';
    // Si ya es ISO (AAAA-MM-DD), lo dejamos
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    // Si es DD/MM/AAAA, lo convertimos
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if(m) {
      const dd = m[1].padStart(2,'0');
      const mm = m[2].padStart(2,'0');
      return `${m[3]}-${mm}-${dd}`;
    }
    return '';
  };

  // Defensa: si la fila no tiene grupo válido (capturista olvidó la columna), evitar TypeError
  const grupo = String(d.grupo || '');

  /* ── Defensa XSS en la fuente ──────────────────────────────────────────
     El spread de abajo arrastra TODAS las columnas crudas del CSV, y el
     Sheet lo editan varias personas sin acceso al repo. Escapar aqui, una
     sola vez, cubre los 80+ puntos de renderizado del archivo; parchar cada
     interpolacion depende de que nadie olvide la siguiente.
     Los campos derivados (tipo, jurisdiccion, *_iso, url_*) se calculan con
     el valor CRUDO, arriba y abajo de este bloque, para que la comparacion y
     el parseo nunca vean entidades HTML. */
  const CAMPOS_LIBRES = ['nombre','categoria','alcaldia','fecha_decreto','fecha_pm',
                         'programa_manejo','grupo','fuente','observaciones','notas'];
  const limpio = {};
  CAMPOS_LIBRES.forEach(k=>{ if(d[k] != null) limpio[k] = esc(String(d[k])); });

  return {
    ...d,
    ...limpio,
    tipo: grupo.startsWith('AVA') ? 'AVA' : 'ANP',
    jurisdiccion: grupo.includes('Federal') ? 'Federal' : 'Local',
    dg_responsable: dg,
    /* Porcentaje de la superficie del área dentro de Suelo de Conservación.
       Desde el 11-sep-2026 es el ÚNICO campo de Suelo de Conservación del
       Sheet: la columna binaria `suelo_conservacion` se retiró porque dos
       campos que describen el mismo hecho terminan contradiciéndose y nadie
       los sincroniza a mano. Las etiquetas (Dentro / Parcial / Fuera) las
       deriva scEstado() de este número, así que el criterio vive en un solo
       lugar. Vacío significa «Sin dato», NO «Fuera»: la ausencia de un dato
       no es una afirmación sobre el territorio. */
    suelo_conservacion_pct: (()=>{
      const v = String(d.suelo_conservacion_pct ?? '').trim().replace(',','.');
      if(!v) return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
    })(),
    fecha_decreto_iso:  cleanIso(d.fecha_decreto_iso, d.fecha_decreto),
    fecha_pm_iso:       cleanIso(d.fecha_pm_iso, d.fecha_pm),
    url_pdf_decreto:    cleanUrl(d.url_pdf_decreto),
    url_gaceta_decreto: cleanUrl(d.url_gaceta_decreto),
    url_pdf_pm:         cleanUrl(d.url_pdf_pm),
    url_gaceta_pm:      cleanUrl(d.url_gaceta_pm)
  };
});

/* ═══ INTEGRIDAD DEL INVENTARIO ═══════════════════════════════════════
   El respaldo del repositorio cubre que el Sheet SE CAIGA. Esto cubre lo
   otro: que el Sheet responda bien pero con un dato equivocado —una fila
   borrada por accidente, un grupo mal escrito, un nombre cambiado que ya no
   casa con su polígono—. Sin este control, el error se propaga al tablero en
   la siguiente carga y nadie lo ve hasta que alguien lo cita en un oficio.

   Tres comprobaciones, todas contra hechos y ninguna contra opiniones:
     1. La invariante del inventario: 66 = 13 + 26 + 18 + 9.
     2. Los nombres, contra el respaldo del repositorio: qué falta y qué sobra.
     3. Los nombres, contra las geometrías: el cruce es por nombre EXACTO, así
        que un renombre silencioso deja un área sin polígono.
   NUNCA altera DATA. Avisa, en pantalla y en consola, y deja que la persona
   decida. Un tablero que «corrige» solo su fuente autoritativa sería peor. */
const INVENTARIO_INVARIANTE = {
  total: 66,
  'AVA · Bosque Urbano': 13, 'AVA · Barranca': 26,
  'ANP · Local': 18,         'ANP · Federal': 9
};
let INVENTARIO_ALERTAS = [];

function _alertasInvariante(){
  const out = [], cuenta = {};
  DATA.forEach(d => { cuenta[d.grupo] = (cuenta[d.grupo] || 0) + 1; });
  if(DATA.length !== INVENTARIO_INVARIANTE.total)
    out.push(`${DATA.length} áreas en vez de ${INVENTARIO_INVARIANTE.total}`);
  Object.keys(INVENTARIO_INVARIANTE).filter(k => k !== 'total').forEach(k => {
    const n = cuenta[k] || 0;
    if(n !== INVENTARIO_INVARIANTE[k]) out.push(`${k}: ${n} en vez de ${INVENTARIO_INVARIANTE[k]}`);
  });
  Object.keys(cuenta).filter(k => !(k in INVENTARIO_INVARIANTE))
    .forEach(k => out.push(`grupo no reconocido «${k}» en ${cuenta[k]} fila${cuenta[k] === 1 ? '' : 's'}`));
  const vistos = new Set(), dup = [];
  DATA.forEach(d => { if(vistos.has(d.nombre)) dup.push(d.nombre); vistos.add(d.nombre); });
  if(dup.length) out.push('nombre duplicado: ' + dup.join(', '));
  const sinNombre = DATA.filter(d => !String(d.nombre || '').trim()).length;
  if(sinNombre) out.push(`${sinNombre} fila${sinNombre === 1 ? '' : 's'} sin nombre`);
  return out;
}

async function _alertasContraRespaldo(){
  /* Solo tiene sentido cuando lo que se sirve es el Sheet en vivo: si ya se
     está sirviendo el respaldo, compararlo consigo mismo no dice nada. */
  if(INVENTARIO_RESPALDO) return [];
  let filas;
  try{ filas = await cargarRespaldoCSV(); }catch(_){ return []; }
  const enRespaldo = new Set(filas.map(r => String(r.nombre || '').trim()).filter(Boolean));
  const enSheet    = new Set(DATA.map(d => String(d.nombre || '').trim()).filter(Boolean));
  const faltan = [...enRespaldo].filter(n => !enSheet.has(n));
  const nuevas = [...enSheet].filter(n => !enRespaldo.has(n));
  const out = [];
  if(faltan.length) out.push('respecto al respaldo faltan: ' + faltan.join(', '));
  if(nuevas.length) out.push('respecto al respaldo hay nombres nuevos: ' + nuevas.join(', '));
  return out;
}

/* Regla del dato: puede haber programa de manejo sin archivo de zonificación,
   nunca archivo de zonificación sin programa. Y el índice cruza por nombre
   EXACTO, así que un nombre que no esté en el inventario deja la zonificación
   huérfana sin que nadie lo note. */
async function _alertasZonificacion(){
  if(typeof zonifIndice !== 'function') return [];
  let ix; try{ ix = await zonifIndice(); }catch(_){ return []; }
  const out = [];
  Object.keys(ix || {}).forEach(nombre => {
    const d = DATA.find(x => x.nombre === nombre);
    if(!d){ out.push('zonificación publicada para un nombre que no está en el inventario: ' + nombre); return; }
    if(d.programa_manejo !== 'Sí') out.push('zonificación publicada para un área SIN programa de manejo: ' + nombre);
  });
  return out;
}

function _alertasContraGeometrias(){
  if(!GEOMETRIES || !GEOMETRIES.features || !GEOMETRIES.features.length) return [];
  const sinPoligono = DATA.filter(d => !findGeometry(d)).map(d => d.nombre);
  return sinPoligono.length
    ? ['sin polígono (el nombre no casa con la geometría): ' + sinPoligono.join(', ')]
    : [];
}

function _pintarAlertasInventario(){
  const cr = document.querySelector('.counter-row');
  if(!cr) return;
  let a = document.getElementById('avisoIntegridad');
  if(!INVENTARIO_ALERTAS.length){ if(a) a.remove(); return; }
  if(!a){
    a = document.createElement('button');
    a.type = 'button'; a.id = 'avisoIntegridad'; a.className = 'aviso-integridad';
    a.addEventListener('click', () => siaToast(INVENTARIO_ALERTAS.join(' · '), 9000));
    cr.appendChild(a);
  }
  const n = INVENTARIO_ALERTAS.length;
  a.textContent = 'Inventario con ' + n + ' inconsistencia' + (n === 1 ? '' : 's') + ' · ver';
  a.title = INVENTARIO_ALERTAS.join('\n');
}

async function verificarInventario(fase){
  const previas = INVENTARIO_ALERTAS.slice();
  const lista = _alertasInvariante();
  if(fase !== 'geometrias'){
    (await _alertasContraRespaldo()).forEach(x => lista.push(x));
    (await _alertasZonificacion()).forEach(x => lista.push(x));
  } else {
    /* En la segunda pasada se conservan las asíncronas ya calculadas. */
    previas.filter(x => x.startsWith('respecto al respaldo') || x.startsWith('zonificación publicada'))
           .forEach(x => lista.push(x));
  }
  _alertasContraGeometrias().forEach(x => lista.push(x));
  INVENTARIO_ALERTAS = lista;
  if(lista.length){
    console.warn('[Inventario] Inconsistencias detectadas:\n  · ' + lista.join('\n  · '));
  }
  _pintarAlertasInventario();
}

const GROUPS = [
  {id:'ALL',     label:'Global',          cls:'',       key:null},
  {id:'BU',      label:'Bosques Urbanos', cls:'bu',     key:'AVA · Bosque Urbano'},
  {id:'BR',      label:'Barrancas',       cls:'br',     key:'AVA · Barranca'},
  {id:'ANPL',    label:'ANP Locales',     cls:'anpl',   key:'ANP · Local'},
  {id:'ANPF',    label:'ANP Federales',   cls:'anpf',   key:'ANP · Federal'},
  /* Corte transversal, no una categoría más: son ANP que ya están contadas en
     su grupo. `key:null` lo deja fuera de cualquier filtro por grupo; quien
     decide qué filas entran es currentData(). */
  {id:'COADMIN', label:'En coadministración', cls:'coadmin', key:null},
  {id:'ZP',      label:'Zona Patrimonio', cls:'zp',     key:'ZONA_PATRIMONIO'},
  {id:'ARCAC',   label:'ARCAC',           cls:'arcac',  key:'ARCAC'},
  {id:'TRASLAPES',label:'Traslapes',      cls:'traslapes',key:'TRASLAPES'},
  {id:'ANALISIS',label:'Análisis',        cls:'analisis',key:'ANALISIS'},
  {id:'METAS',   label:'Metas',           cls:'metas',  key:'METAS'},
  {id:'LEGAL',   label:'Marco Jurídico',  cls:'legal',  key:'LEGAL'},
];

/* ===== Marco jurídico ===== */
const LEGAL = {
  constitucion: {
    nombre: "Constitución Política de la Ciudad de México",
    abreviatura: "CPCDMX",
    publicacion: "Gaceta Oficial de la Ciudad de México · 5 de febrero de 2017",
    ultimaReforma: "Última reforma publicada en la GOCDMX el 24 de diciembre de 2025",
    articulo: "Artículo 16 · Ordenamiento Territorial · Apartado A. Medio Ambiente",
    parrafos: [
      {t:"Políticas especiales de gestión ambiental", ref:"Art. 16 A.1 párr. 1",
       c:"Derivado del escenario geográfico, hidrológico y biofísico en que se localiza la Ciudad de México, se requerirán políticas especiales que sean eficaces en materia de gestión hidrológica, protección ambiental, adaptación a fenómenos climáticos, prevención y protección civil."},
      {t:"Sistema de Áreas Naturales Protegidas de la CDMX", ref:"Art. 16 A.1 párr. 2",
       c:"La Ciudad de México integrará un sistema de áreas naturales protegidas. Su administración, vigilancia y manejo es responsabilidad directa de la persona titular de la Jefatura de Gobierno a través de un organismo público específico con participación ciudadana, sujeto a los principios, orientaciones, regulaciones y vigilancia que establezcan las leyes correspondientes, en coordinación con las Alcaldías, la Federación, Estados y Municipios conurbados."},
      {t:"Coexistencia con ANP federales", ref:"Art. 16 A.1 párr. 3",
       c:"Dicho sistema coexistirá con las áreas naturales protegidas reconocidas por la Federación."},
      {t:"Áreas protegidas por mandato constitucional", ref:"Art. 16 A.1 párr. 4",
       c:"El sistema protegerá, al menos: Desierto de los Leones; Parque Nacional Cumbres del Ajusco; Parque Ecológico de la Ciudad de México del Ajusco Medio; los Dinamos de Contreras; Cerro de la Estrella; Sierra de Santa Catarina; Sierra de Guadalupe; zonas lacustres de Xochimilco y Tláhuac; Parque Nacional Fuentes Brotantes; parques estratégicos de Chapultepec (tres secciones); Bosque de Tlalpan y Bosque de Aragón; así como las Áreas de Valor Ambiental decretadas y que se decreten. Estas áreas serán de acceso público."},
    ],
    areasProtegidas: [
      "Desierto de los Leones",
      "Parque Nacional Cumbres del Ajusco",
      "Parque Ecológico de la Ciudad de México del Ajusco Medio",
      "Los Dinamos de Contreras",
      "Cerro de la Estrella",
      "Sierra de Santa Catarina",
      "Sierra de Guadalupe",
      "Zonas lacustres de Xochimilco y Tláhuac",
      "Parque Nacional Fuentes Brotantes",
      "Parques estratégicos de Chapultepec (1ª, 2ª y 3ª secciones)",
      "Bosque de Tlalpan",
      "Bosque de Aragón",
      "Áreas de Valor Ambiental decretadas y por decretarse",
    ],
    atribucionesAlcaldias: [
      {fr:"XXI",   lbl:"Participar en la creación y administración de sus reservas territoriales."},
      {fr:"XXII",  lbl:"Implementar acciones de protección, preservación y restauración del equilibrio ecológico que garanticen la conservación, integridad y mejora de los recursos naturales, suelo de conservación, áreas naturales protegidas, parques urbanos y áreas verdes de la demarcación territorial."},
      {fr:"XXIII", lbl:"Diseñar e implementar, en coordinación con el Gobierno de la Ciudad de México, acciones que promuevan la innovación científica y tecnológica en materia de preservación y mejoramiento del medio ambiente."},
      {fr:"XXIV",  lbl:"Vigilar, en coordinación con el Gobierno de la Ciudad de México, que no sean ocupadas de manera ilegal las áreas naturales protegidas y el suelo de conservación."},
    ],
    urlLocal: "data/normativa/CPCDMX_Constitucion_CDMX.pdf",
    urlLabel: "Texto vigente (PDF)"
  },
  instrumento: {
    nombre: "Ley Ambiental de la Ciudad de México",
    abreviatura: "LACM",
    publicacion: "Gaceta Oficial de la Ciudad de México · 18 de julio de 2024",
    abroga: "Abroga la Ley Ambiental de Protección a la Tierra en la Ciudad de México.",
    expedida: "Decreto expedido por la persona titular de la Jefatura de Gobierno de la Ciudad de México.",
    url: "data/normativa/LACM_Ley_Ambiental_CDMX.pdf",
    urlLabel: "Texto vigente (PDF)"
  },
  instrumentoFederal: {
    nombre: "Ley General del Equilibrio Ecológico y la Protección al Ambiente",
    abreviatura: "LGEEPA",
    publicacion: "Diario Oficial de la Federación · 28 de enero de 1988",
    ultimaReforma: "Última reforma publicada en el DOF el 19 de enero de 2026",
    alcance: "Regula las ANP de jurisdicción federal (fracciones I a VIII y XI del Art. 46). Concurre con la LACM cuando el GCDMX administra ANP de competencia federal conforme al Art. 136 LACM. Establece el marco nacional al que se ajustan las legislaciones locales en materia de áreas naturales protegidas.",
    url: "data/normativa/LGEEPA_Ley_General_Equilibrio_Ecologico.pdf",
    urlLabel: "Texto vigente (PDF)"
  },
  definiciones: [
    {t:"Área de Valor Ambiental (AVA)", ref:"Art. 4° fr. VI", c:"Todos los bosques urbanos, barrancas y cuerpos de agua dentro del territorio y bajo las competencias de la Ciudad de México, tanto en suelo urbano como en suelo de conservación, en donde los ambientes originales han sido modificados por las actividades antropogénicas y que requieren ser restauradas o preservadas, en función de que aún mantienen ciertas características biofísicas y escénicas, las cuales les permiten contribuir a mantener la calidad ambiental de la Ciudad."},
    {t:"Área Natural Protegida (ANP)", ref:"Art. 4° fr. VII", c:"Las zonas del territorio y aquellas sobre las que la Ciudad de México ejerce su soberanía y jurisdicción, en donde los ambientes originales no han sido significativamente alterados por la actividad del ser humano o que requieren ser preservadas y restauradas y están sujetas al régimen previsto en la presente Ley."},
    {t:"Área Comunitaria de Conservación Ecológica (ARCAS)", ref:"Art. 152 LACM", c:"Áreas establecidas por acuerdo de la persona titular de la Jefatura de Gobierno con ejidos y comunidades, manteniéndose como tal siempre que se cuente con el consentimiento de éstas expresado en Asamblea, así como con la suscripción del convenio de concertación de acciones suscrito con la Secretaría. La declaratoria no modifica el régimen de propiedad y no tendrá como propósito la expropiación."},
    {t:"Programa de Manejo", ref:"Art. 4° fr. LIII", c:"El instrumento rector de planeación y regulación que establece los usos de suelo, las actividades, acciones y lineamientos básicos para el manejo y la administración de las Áreas de Valor Ambiental y las Áreas Naturales Protegidas de competencia de la Ciudad de México."},
  ],
  categoriasAVA: {titulo:"Categorías de Áreas de Valor Ambiental", ref:"Art. 116 · Capítulo IV", items:[
    {lbl:"Bosques Urbanos",   ref:"Art. 117 — AVA localizadas en suelo urbano con predominio de flora arbórea y arbustiva; vida silvestre asociada; valor ambiental, estético, científico, educativo, recreativo, histórico o turístico."},
    {lbl:"Cinturones Verdes", ref:"Art. 117 — delimitan poblados rurales y asentamientos humanos en suelo de conservación; crean bordes naturales que ordenan la expansión; espacios de recreación y esparcimiento."},
    {lbl:"Barrancas",         ref:"Art. 120 — los PM pueden regular diferentes actividades siempre que garanticen restauración y preservación de características biofísicas y escénicas que contribuyen al balance hídrico."},
    {lbl:"Cuerpos de Agua",   ref:"Art. 116 fr. IV — cuerpos de agua de competencia de la Ciudad de México."},
  ]},
  categoriasANPLocal: {titulo:"Categorías de ANP de competencia local", ref:"Art. 127 · Capítulo V", items:[
    {lbl:"Zona de Conservación Ecológica (ZCE)",              ref:"Art. 128 — muestras representativas de uno o más ecosistemas en buen estado de preservación; protegen biodiversidad, elementos naturales y procesos ecológicos."},
    {lbl:"Zona de Protección Hidrológica y Ecológica (ZPHE)", ref:"Art. 129 — protección, preservación y restauración de cuencas hidrológicas, acuíferos y zonas de recarga, así como fauna, flora, suelo, subsuelo y servicios ambientales."},
    {lbl:"Zona Ecológica y Cultural (ZEC)",                   ref:"Art. 130 — importantes valores ambientales y ecológicos con elementos físicos, históricos, arqueológicos o sujetos a usos y costumbres de importancia cultural."},
    {lbl:"Refugio de Vida Silvestre",                         ref:"Art. 131 — hábitat natural de especies de fauna y flora en categoría de protección especial o con distribución restringida."},
    {lbl:"Zona de Protección Especial (ZPE)",                 ref:"Art. 132 — localizadas en suelo de conservación con escasa vegetación natural o fuertemente modificada; por extensión o características no caben en otras categorías."},
    {lbl:"Reserva Ecológica Comunitaria (REC)",               ref:"Art. 133 — establecidas por pueblos, comunidades y ejidos en terrenos de su propiedad; no modifican el régimen de propiedad. Pueden ser en núcleos agrarios (a) o en propiedad privada (b)."},
    {lbl:"Zona Sujeta a Conservación Ecológica (ZSCE)",       ref:"Art. 134 — circunvecinas a asentamientos humanos; ecosistemas en buen estado destinadas a preservar biodiversidad y equilibrio ecológico."},
  ]},
  categoriasANPFederal: {
    titulo:"Tipos y características de las Áreas Naturales Protegidas Federales",
    ref:"LGEEPA · Art. 46 · Sección II (última reforma DOF 19/01/2026)",
    intro:"El Artículo 46 de la LGEEPA define las categorías de ANP de competencia federal que aplican en todo el territorio nacional, incluyendo la Ciudad de México.",
    fracciones:[
      {fr:"I",    lbl:"Reservas de la Biosfera",                       jur:"federal", c:"Ecosistemas representativos del territorio nacional; zonificación núcleo y amortiguamiento."},
      {fr:"II",   lbl:"Derogada",                                      jur:"derogada", c:"Derogada mediante reforma DOF 13/12/1996."},
      {fr:"III",  lbl:"Parques Nacionales",                            jur:"federal", c:"Representatividad biogeográfica a nivel nacional; valor científico, educativo, recreativo, histórico."},
      {fr:"IV",   lbl:"Monumentos Naturales",                          jur:"federal", c:"Elementos naturales notables por su carácter único."},
      {fr:"V",    lbl:"Derogada",                                      jur:"derogada", c:"Derogada mediante reforma DOF 13/12/1996."},
      {fr:"VI",   lbl:"Áreas de Protección de Recursos Naturales",     jur:"federal", c:"APRN — Preservación y protección del suelo, cuencas hidrográficas, aguas y recursos forestales. Única categoría federal que admite coexistencia con declaratorias locales."},
      {fr:"VII",  lbl:"Áreas de Protección de Flora y Fauna",          jur:"federal", c:"APFF — Hábitats de cuyo equilibrio dependen especies de flora y fauna silvestres."},
      {fr:"VIII", lbl:"Santuarios",                                    jur:"federal", c:"Zonas con flora y fauna consideradas relevantes o en peligro."},
      {fr:"IX",   lbl:"Parques y Reservas Estatales",                  jur:"local",    c:"Así como las demás categorías que establezcan las legislaciones locales (fracción reformada DOF 05/07/2007 y 16/05/2008)."},
      {fr:"X",    lbl:"Zonas de Conservación Ecológica Municipales",   jur:"local",    c:"Así como las demás categorías que establezcan las legislaciones locales (fracción reformada DOF 16/05/2008)."},
      {fr:"XI",   lbl:"Áreas destinadas voluntariamente a la conservación", jur:"federal", c:"Adicionada mediante reforma DOF 16/05/2008."},
    ],
    competencia:[
      {lbl:"Competencia federal",    ref:"Fracciones I a VIII y XI del Art. 46 LGEEPA."},
      {lbl:"Competencia estatal",    ref:"Entidades federativas pueden establecer parques, reservas y demás categorías que reúnan características de las fracciones I a VIII y XI o características propias, conforme a su legislación local."},
      {lbl:"Competencia municipal",  ref:"Municipios pueden establecer zonas de conservación ecológica municipales conforme a la legislación local aplicable."},
      {lbl:"Regla de no superposición", ref:"Las ANP locales no pueden establecerse en zonas previamente declaradas federales, salvo en la fracción VI (APRN)."},
    ],
    prohibiciones:[
      {lbl:"Fundación de nuevos centros de población",           ref:"Art. 46 párr. aplicable — prohibición general en toda ANP."},
      {lbl:"Introducción de especies exóticas invasoras",        ref:"Adición DOF 24/05/2013."},
      {lbl:"Exploración, explotación y beneficio de minerales",  ref:"Obras y trabajos a que se refiere la Ley de Minería. Adición DOF 08/05/2023."},
    ],
  },
  categoriasARCAS: {titulo:"Áreas Comunitarias de Conservación Ecológica (ARCAS)", ref:"Art. 152-158 · Capítulo VI", items:[
    {lbl:"Establecimiento por acuerdo con ejidos/comunidades", ref:"Art. 152 — requiere consentimiento en Asamblea y convenio de concertación con la Secretaría."},
    {lbl:"Declaratoria constitutiva publicada en GOCDMX", ref:"Art. 153 — no modifica el régimen de propiedad ni tiene propósito de expropiación."},
    {lbl:"Administración y manejo por los ejidos o comunidades", ref:"Art. 155 — corresponde a quienes detenten la propiedad o legal posesión."},
    {lbl:"Programa de manejo elaborado por el ejido/comunidad", ref:"Art. 157 — con asistencia opcional de instituciones; aprobado conjuntamente por la Secretaría y la Secretaría de Pueblos y Barrios Originarios y Comunidades Indígenas Residentes."},
    {lbl:"Limitaciones y regulaciones de utilidad pública", ref:"Art. 158 — obligatorias para propietarios o poseedores de terrenos y bienes localizados en el área."},
  ]},
  declaratoriaAVA:{titulo:"Procedimiento de declaratoria — AVA", ref:"Art. 118-119", items:[
    {lbl:"Solicitud por escrito a la Secretaría (cualquier persona); superficie continua o fragmentada, pública o privada.", ref:"Art. 118"},
    {lbl:"Dictamen de procedencia por la Secretaría.", ref:"Art. 118"},
    {lbl:"Opinión obligatoria de la o las Alcaldías correspondientes.", ref:"Art. 118"},
    {lbl:"Elaboración de diagnóstico ambiental por la Secretaría para la formulación del PM.", ref:"Art. 118"},
    {lbl:"Decreto expedido por la persona titular de la Jefatura de Gobierno (finalidad, limitaciones al uso del suelo, responsables del manejo, elementos naturales a restaurar).", ref:"Art. 119"},
    {lbl:"Si incluye zonificación: opinión de SEDUVI y Consejería Jurídica.", ref:"Art. 119"},
  ]},
  declaratoriaANP:{titulo:"Procedimiento de declaratoria — ANP", ref:"Art. 139-143", items:[
    {lbl:"Estudios técnicos justificativos previos, puestos a disposición del público.", ref:"Art. 139"},
    {lbl:"Opinión de las Alcaldías correspondientes.", ref:"Art. 139"},
    {lbl:"Decreto de la Jefatura con: categoría, delimitación, zonificación, limitaciones al uso de suelo, descripción de actividades, responsables, utilidad pública, lineamientos y plazo para el PM, elementos naturales a proteger.", ref:"Art. 140"},
    {lbl:"Publicación en GOCDMX; notificación personal a propietarios/poseedores.", ref:"Art. 141"},
    {lbl:"Inscripción en el Registro Público de la Propiedad y de Comercio y en el Registro de Planes y Programas para el Desarrollo Urbano.", ref:"Art. 142"},
    {lbl:"Cualquier persona podrá solicitar el establecimiento de un ANP; la Secretaría dictamina su procedencia.", ref:"Art. 143"},
  ]},
  declaratoriaARCAS:{titulo:"Procedimiento de declaratoria — ARCAS", ref:"Art. 152-154", items:[
    {lbl:"Consentimiento del ejido o comunidad expresado en Asamblea.", ref:"Art. 152"},
    {lbl:"Suscripción del convenio de concertación de acciones con la Secretaría.", ref:"Art. 152"},
    {lbl:"Acuerdo emitido por la persona titular de la Jefatura de Gobierno.", ref:"Art. 153"},
    {lbl:"Declaratoria constitutiva; ambos instrumentos publicados en GOCDMX.", ref:"Art. 153"},
    {lbl:"Contenido del convenio: finalidad, delimitación, obligaciones, lineamientos y plazo para el PM.", ref:"Art. 154"},
  ]},
  programaManejo:{titulo:"Contenido del Programa de Manejo", ref:"Art. 144 (ANP) / Art. 122 (AVA) / Art. 156 (ARCAS)", items:[
    {lbl:"Características físicas, biológicas, climáticas, culturales, sociales y económicas del área.", ref:"fr. I"},
    {lbl:"Objetivos del área.", ref:"fr. II"},
    {lbl:"Zonificación y subzonificación con políticas de manejo diferenciadas por zona.", ref:"fr. III"},
    {lbl:"Regulación de usos de suelo, manejo de recursos naturales y actividades compatibles.", ref:"fr. IV"},
    {lbl:"Subprogramas de manejo (corto, mediano y largo plazo): conservación, recuperación, monitoreo, restauración, conectividad ecológica, investigación y educación ambiental.", ref:"fr. V"},
    {lbl:"Bases para administración, mantenimiento y vigilancia.", ref:"fr. VI"},
    {lbl:"Señalamiento de las disposiciones jurídicas ambientales aplicables.", ref:"fr. VII"},
    {lbl:"Mecanismos de participación social.", ref:"fr. VIII"},
    {lbl:"Mecanismos de financiamiento del área.", ref:"fr. IX"},
    {lbl:"Seguimiento y evaluación del programa de manejo.", ref:"fr. X"},
  ]},
  prohibiciones:{titulo:"Prohibiciones en ANP y AVA", ref:"Art. 138 (ANP) · Art. 123 (AVA)", items:[
    {lbl:"Establecimiento de asentamientos humanos irregulares, de nuevos regulares o su expansión territorial.", ref:"fr. I"},
    {lbl:"Actividades que afecten la biodiversidad del área según Ley, reglamento, NOM, normas locales, decreto, PM o evaluación de impacto ambiental.", ref:"fr. II"},
    {lbl:"Realización de actividades riesgosas.", ref:"fr. III"},
    {lbl:"Emisiones contaminantes al aire, agua, suelo y subsuelo; depósito o disposición de residuos; uso de equipos anticontaminantes sin autorización.", ref:"fr. IV"},
    {lbl:"Extracción de suelo o materiales del subsuelo con fines distintos a los estrictamente científicos.", ref:"fr. V"},
    {lbl:"Interrupción o afectación del sistema hidrológico de la zona.", ref:"fr. VI"},
    {lbl:"Actividades cinegéticas o de explotación ilícita de fauna y flora silvestres.", ref:"fr. VII"},
    {lbl:"Introducción de especies exóticas, exóticas invasoras y ferales.", ref:"fr. VIII"},
    {lbl:"En AVA adicionalmente: aprovechamiento o extracción de recursos naturales.", ref:"Art. 123"},
  ]},
  participacion:[
    {lbl:"Consejo Rector Ciudadano (Bosques Urbanos)", ref:"Art. 124 — 7 a 14 ciudadanos designados por la Secretaría; 4 años, ratificables por 2 adicionales. Órgano de asesoría sobre programas, proyectos, PM y autorizaciones."},
    {lbl:"Consejo Intersectorial (Barrancas)",          ref:"Art. 125 — máx. 7 integrantes del sector gobierno + representantes académico, empresarial y social. Gestiona y articula el diseño y ejecución de PM."},
    {lbl:"Consejo Asesor (ANP)",                        ref:"Art. 151 — Secretaría + entidades GCDMX + Alcaldías + academia + sector social + empresarial + ejidos/comunidades + propietarios. Órgano de consulta y apoyo para formulación, ejecución, seguimiento y evaluación."},
    {lbl:"Asamblea del ejido o comunidad (ARCAS)",       ref:"Art. 152 y 157 — órgano que otorga consentimiento para la declaratoria y valida el PM."},
  ],
  atribuciones:[
    {lbl:"Jefatura de Gobierno",  ref:"Art. 6 — expedir decretos de AVA y ANP; proponer creación de áreas comunitarias de conservación ecológica, zonas de restauración y salvaguarda; promover conectividad ecológica; limitar o negar derribo/poda en suelo de conservación, AVA y ANP."},
    {lbl:"Secretaría",            ref:"Proponer creación de AVA, ANP y ARCAS; administrar, manejar, vigilar; elaborar programas de manejo; expedir normas ambientales locales; gestionar ingresos por uso, goce, aprovechamiento y explotación."},
    {lbl:"Alcaldías",             ref:"Art. 8 — prevenir invasión de áreas verdes, AVA y ANP; proponer y opinar sobre establecimiento de AVA y ANP; participar en elaboración de PM; celebrar convenios con GCDMX; integrar Consejos Asesores."},
  ],
  sistema:{
    titulo:"Sistema de ANP y AVA de la Ciudad de México",
    ref:"Art. 121, 149, 150",
    items:[
      {lbl:"Las AVA se integran junto con las ANP en el Sistema de ANP y AVA de la Ciudad de México.", ref:"Art. 121"},
      {lbl:"Propósito: fortalecer la recuperación de las condiciones ecológicas, manejo integral y mejorar la conectividad conforme al Programa de la red de Infraestructura Verde.", ref:"Art. 121"},
      {lbl:"La Secretaría integra el Registro de ANP de la Ciudad de México, consultable y conectado al Sistema de Información Ambiental.", ref:"Art. 149"},
      {lbl:"Registro e inventario de ANP con datos de inscripción, resumen de decretos y PM; actualización anual.", ref:"Art. 150"},
    ]
  }
};

/* ===== Helpers ===== */
const fmt = n => n.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtInt = n => n.toLocaleString('es-MX');
/* Superficie en la TABLA: sin decimales. Los centésimos de hectárea no se
   comparan de un vistazo entre renglones y cuestan ancho en una columna que
   compite con SC y DG. El valor exacto sigue en el `title` de la celda, en la
   ficha y en la suma del pie, que es donde sí se consulta con precisión.
   Excepción: por debajo de 1 ha se conservan dos decimales, porque redondear
   Vista Hermosa (0.32 ha) a «0» sería falso, no compacto. */
const fmtSup = n => {
  const v = +n || 0;
  return (v > 0 && v < 1)
    ? v.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})
    : Math.round(v).toLocaleString('es-MX');
};
/* Año del decreto a cuatro dígitos. La tabla solo necesita el año —el día y el
   mes viven en la ficha— y así la columna cabe donde la regla de redundancia
   liberó espacio. Lee el ISO cuando existe y cae al texto DD/MM/AAAA si no. */
const anioDecreto = d => {
  const iso = String(d.fecha_decreto_iso || '');
  if(/^\d{4}/.test(iso)) return iso.slice(0,4);
  const m = String(d.fecha_decreto || '').match(/(\d{4})\s*$/);
  return m ? m[1] : '—';
};
/* esc() ahora se define antes de la construccion de DATA (buscar "defensa XSS en la fuente") */
/* Aviso visual no bloqueante (reemplaza alert nativo) */
function siaToast(msg, duracion){
  let t=document.getElementById('siaToast');
  if(!t){ t=document.createElement('div'); t.id='siaToast';
    /* Sin esto el aviso es invisible para lector de pantalla, y siaToast es
       el UNICO canal de retroalimentacion no bloqueante de toda la app. */
    t.setAttribute('role','status'); t.setAttribute('aria-live','polite');
    t.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#2a2a2a;color:#fff;padding:12px 18px;border-radius:8px;font-family:Roboto,sans-serif;font-size:var(--fs-base);box-shadow:var(--sh-3);z-index:var(--z-toast);max-width:min(440px,90vw);text-align:center;opacity:0;transition:opacity .2s'; document.body.appendChild(t); }
  t.textContent=msg; requestAnimationFrame(()=>{ t.style.opacity='1'; });
  /* Duración opcional: un listado de inconsistencias no se lee en cuatro
     segundos; los avisos ordinarios conservan el tiempo de siempre. */
  clearTimeout(t._h); t._h=setTimeout(()=>{ t.style.opacity='0'; }, duracion || 4200);
}
const pct = (a,b) => b===0?'0':((a/b)*100).toFixed(1);
const sum = (arr,k) => arr.reduce((s,d)=>s+(+d[k]||0),0);
const explode = (arr,k) => arr.flatMap(d => d[k].split(/,\s*/).map(s=>s.trim()));

/* Mapeo subcategoría → código de color y abreviatura */
const SUBCAT = {
  "Bosque Urbano":                              {code:"BU",   short:"Bosque Urbano"},
  /* Tenencia de la tierra (ARCAC). Sin estas dos entradas subCode caía en "BU"
     y la tenencia se pintaba con el estilo de Bosque Urbano. */
  "Comunidad":                                  {code:"COM",  short:"Comunidad"},
  "Ejido":                                      {code:"EJI",  short:"Ejido"},
  "Barranca":                                   {code:"BR",   short:"Barranca"},
  "Zona de Conservación Ecológica":             {code:"ZCE",  short:"ZCE"},
  "Zona de Protección Hidrológica y Ecológica": {code:"ZPHE", short:"ZPHE"},
  "Zona Ecológica y Cultural":                  {code:"ZEC",  short:"ZEC"},
  "Zona de Protección Especial":                {code:"ZPE",  short:"ZPE"},
  "Reserva Ecológica Comunitaria":              {code:"REC",  short:"REC"},
  "Zona Sujeta a Conservación Ecológica":       {code:"ZSCE", short:"ZSCE"},
  "Refugio de Vida Silvestre":                  {code:"RVS",  short:"RVS"},
  "Parque Nacional":                            {code:"PN",   short:"Parque Nacional"},
  "Área de Protección de Recursos Naturales":   {code:"APRN", short:"APRN"},
  "Reserva de la Biosfera":                     {code:"RB",   short:"Reserva Biosfera"},
  "Monumento Natural":                          {code:"MN",   short:"Monumento Natural"},
  "Área de Protección de Flora y Fauna":        {code:"APFF", short:"APFF"},
  "Santuario":                                  {code:"SAN",  short:"Santuario"},
};
const subCode  = cat => (SUBCAT[cat] && SUBCAT[cat].code)  || "BU";
const subShort = cat => (SUBCAT[cat] && SUBCAT[cat].short) || cat;

/* Normaliza texto para búsqueda: quita acentos, minúsculas, trim. Permite buscar con o sin acento. */
function normText(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

let state = { tab:'ALL', dest:'INVENTARIO', sortKey:'nombre', sortDir:1, q:'', fJur:'', fCat:'', fAlc:'', fPM:'', fTipo:'', fSC:'', fDG:'',
  mapFilters:{ 'AVA · Bosque Urbano':true, 'AVA · Barranca':true, 'ANP · Local':true, 'ANP · Federal':true },
  highlightCoadmin: false };
const currentGroup = () => GROUPS.find(g=>g.id===state.tab);
/* Pestañas con página propia: no usan la tabla compartida ni sus filtros.
   TRASLAPES entró aquí el 11-sep-2026; estaba fuera por descuido y hacía que
   render() y populateFilters() trabajaran sobre una tabla oculta. */
const isSpecialTab = (id) => id==='LEGAL' || id==='METAS' || id==='ANALISIS' || id==='ZP' || id==='TRASLAPES';
/* ════════════════════════════════════════════════════════════════════
 * ARCAC en la tabla general · 11 sep 2026
 * Los 30 núcleos NO entran a DATA ni a GEOMETRIES: el inventario sigue
 * siendo 66 y ningún contador cambia. Lo que se comparte es la TABLA, que
 * pinta el conjunto activo sea cual sea. Los campos que ARCAC no tiene
 * —decreto, programa de manejo, suelo de conservación, dirección
 * responsable— quedan vacíos y la regla de columnas redundantes los retira
 * sola: nadie ve una columna llena de guiones.
 * Identidad: el número de núcleo, no el nombre. Cinco nombres se repiten
 * porque existen en versión comunal y ejidal, y otros cuatro coinciden con
 * áreas del inventario.
 * ════════════════════════════════════════════════════════════════════ */
let DATA_ARCAC = [];
let _arcacTablaEstado = 'sin-cargar';   // sin-cargar · cargando · listo
function construirDatosArcac(fc){
  DATA_ARCAC = ((fc && fc.features) || []).map(f=>{
    const p = f.properties || {};
    /* La alcaldía viene con dos grafías —«Magdalena Contreras» y «La Magdalena
       Contreras»—, que partirían el filtro en dos entradas. */
    let alc = String(p.alcaldia || '').trim();
    if(alc === 'Magdalena Contreras') alc = 'La Magdalena Contreras';
    return {
      _arcacNo: p.no,
      nombre: esc(String(p.nombre||'')), tipo:'ARCAC', jurisdiccion:'Local',
      categoria: String(p.tenencia||''), alcaldia: esc(alc),
      superficie: +p.sup_ha || 0, grupo:'ARCAC',
      fecha_decreto:'', fecha_decreto_iso:'', programa_manejo:'', fecha_pm:'',
      fecha_pm_iso:'', suelo_conservacion_pct:null, dg_responsable:''
    };
  }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  return DATA_ARCAC;
}

const currentData = () => {
  if(state.tab==='ARCAC') return DATA_ARCAC;
  /* La coadministración no es un grupo: es un subconjunto de las 66 marcado por
     el convenio SEMARNAT–CONANP–CDMX 2025. Sigue contando en su categoría; aquí
     solo se aísla para verlo junto. */
  if(state.tab==='COADMIN') return DATA.filter(d=>isCoadmin(d.nombre));
  if(state.tab==='ALL' || isSpecialTab(state.tab)) return DATA;
  return DATA.filter(d=>d.grupo===currentGroup().key);
};

/* ════════════════════════════════════════════════════════════════════
 * Navegación de dos niveles · rediseño 2026-09-10
 * Cuatro destinos. Cada uno agrupa ids de GROUPS que ya existían, así que
 * ninguna función de render cambia de contrato: `state.tab` sigue siendo
 * el id de grupo y `currentGroup()`/`currentData()` no se tocan.
 * «Ubicar» no tiene grupo: es una acción, y vive en `state.dest`.
 * ════════════════════════════════════════════════════════════════════ */
const DEST_ICONS = {
  /* Iconos tomados del kit de Figma: el pin de «location» para Ubicar y
     «layers» para Inventario. El de Análisis no existe en el kit y se
     conserva el de barras, que es el estándar de la casa. */
  UBICAR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-11.4A7 7 0 0 0 5 10.6C5 15.8 12 22 12 22Z"/><circle cx="12" cy="10.4" r="2.4"/></svg>',
  INVENTARIO:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>',
  ANALITICA:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
};
/* Tres destinos (11-sep-2026). «Capas» desapareció: sus dos módulos se
   repartieron donde el usuario los busca —Zona Patrimonio es un chip más del
   inventario y Traslapes es análisis—, y un destino con dos entradas no
   justificaba un cuarto del ancho de la barra. */
const DESTINOS = [
  { id:'UBICAR',     label:'Ubicar',     sub:[] },
  { id:'INVENTARIO', label:'Inventario', sub:['ALL','BU','BR','ANPL','ANPF','COADMIN','ARCAC','ZP'] },
  { id:'ANALITICA',  label:'Análisis',   sub:['ANALISIS','TRASLAPES','METAS','LEGAL'] },
];

/* Punto de color del subfiltro: solo donde el color significa territorio. */
const SUB_SW = {
  BU:'var(--bu)', BR:'var(--br)', ANPL:'var(--anpl)', ANPF:'var(--anpf)',
  ZP:'#444441', ARCAC:'var(--arcac-com)', TRASLAPES:'var(--magenta)',
  COADMIN:'var(--azul)'
};

/* Etiqueta corta del subfiltro; el número va aparte para poder atenuarlo. */
function subLabel(id){
  return ({ ALL:'Todas', BU:'Bosques Urbanos', BR:'Barrancas', ANPL:'ANP Locales',
            ANPF:'ANP Federales', COADMIN:'En coadministración',
            ZP:'Zona Patrimonio', ARCAC:'ARCAC',
            TRASLAPES:'Traslapes', ANALISIS:'Brechas y distribución',
            METAS:'Metas', LEGAL:'Marco jurídico' })[id] || id;
}
function subCount(id){
  if(id==='ALL') return fmtInt(DATA.length);
  if(id==='ZP') return '4 designaciones';
  if(id==='ARCAC') return '30';
  if(id==='TRASLAPES') return '35 pares';
  if(id==='COADMIN') return fmtInt(DATA.filter(d=>isCoadmin(d.nombre)).length);
  if(id==='ANALISIS' || id==='METAS' || id==='LEGAL') return '';
  const g = GROUPS.find(x=>x.id===id);
  return g ? fmtInt(DATA.filter(d=>d.grupo===g.key).length) : '';
}




function buildTabs(){
  const el = document.getElementById('tabs');
  const dest = DESTINOS.find(d=>d.id===state.dest) || DESTINOS[1];

  const barra = DESTINOS.map(d=>`
      <button type="button" class="dest ${d.id===dest.id?'active':''}" data-dest="${d.id}"
              aria-current="${d.id===dest.id?'true':'false'}" title="${d.label}">
        <span class="dest-ico" aria-hidden="true">${DEST_ICONS[d.id]||''}</span>
        <span class="dest-lbl">${d.label}</span>
      </button>`).join('');

  const chips = dest.sub.map(id=>{
    const sw = SUB_SW[id] ? `<span class="sw" style="background:${SUB_SW[id]}"></span>` : '';
    const n  = subCount(id);
    return `<button type="button" class="subchip ${state.tab===id?'active':''}" data-id="${id}"
              aria-current="${state.tab===id?'true':'false'}">${sw}${subLabel(id)}${n?`<span class="n">${n}</span>`:''}</button>`;
  }).join('');

  el.innerHTML = `<div class="destbar" role="tablist">${barra}</div>` +
                 `<div class="subnav">${chips ? `<span class="subnav-lbl">Filtrar</span>${chips}` : ''}</div>`;

  el.querySelectorAll('.dest[data-dest]').forEach(b=>{
    b.addEventListener('click',()=>{
      const id = b.dataset.dest;
      if(id === state.dest) return;
      state.dest = id;
      const d = DESTINOS.find(x=>x.id===id);
      if(d && d.sub.length && !d.sub.includes(state.tab)) state.tab = d.sub[0];
      limpiarFiltros();
      buildTabs(); populateFilters(); renderDashboard(); render();
      window.scrollTo({top:0,behavior:'smooth'});
    });
  });

  el.querySelectorAll('.subchip[data-id]').forEach(b=>{
    b.addEventListener('click',()=>{
      state.tab = b.dataset.id;
      limpiarFiltros();
      buildTabs(); populateFilters(); renderDashboard(); render();
      _trasElegirSubconjunto();
    });
  });
}
/* Qué pasa después de tocar un chip de subconjunto (flujo natural):
   1) el chip se acaba de volver a pintar, así que el foco se le devuelve al
      chip activo —sin desplazar—; el contador «Mostrando N de M» es
      aria-live y anuncia el resultado a quien no ve la pantalla;
   2) en celular, el resultado (resumen + mapa) queda debajo de la tira de
      chips: se desplaza hasta que la tira toque el borde superior, donde se
      queda fija, y el mapa entra en pantalla;
   3) en escritorio no se mueve nada si los chips están a la vista —mapa y
      tabla ya se actualizaron a su lado—; solo si el usuario venía de muy
      abajo en la tabla se vuelve a la tira de chips. */
function _trasElegirSubconjunto(){
  try{
    const activo = document.querySelector('.subchip.active');
    if(activo) activo.focus({preventScroll:true});
    const sub = document.querySelector('.subnav'); if(!sub) return;
    const movil = window.matchMedia('(max-width:760px)').matches;
    const r = sub.getBoundingClientRect();
    if(movil){
      window.scrollTo({ top: r.top + window.scrollY - 4, behavior:'smooth' });
    } else if(r.top < 0){
      window.scrollTo({ top: r.top + window.scrollY - 12, behavior:'smooth' });
    }
  }catch(_){}
}

/* Cambiar de destino o de subconjunto reinicia los filtros de la tabla:
   arrastrarlos entre vistas producia resultados vacios sin explicacion. */
function limpiarFiltros(){
  state.q=''; state.fJur=''; state.fCat=''; state.fAlc=''; state.fPM=''; state.fTipo=''; state.fSC=''; state.fDG='';
  ['q','fJur','fCat','fAlc','fPM','fTipo','fSC','fDG'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  if(typeof sincronizarMasFiltros === 'function') sincronizarMasFiltros();
}


function populateFilters(){
  if(isSpecialTab(state.tab)) return;
  const subset = currentData();

  /* ── Desplegables dependientes ────────────────────────────────────────
     Cada desplegable ofrece los valores que siguen existiendo DESPUÉS de
     aplicar los demás filtros: con Tipo = ANP, «Subcategoría» ya no ofrece
     Barranca ni Bosque Urbano, que no devolverían ninguna fila. Se excluye el
     propio filtro del cálculo —si no, cada uno se quedaría con su único valor
     elegido y no habría cómo cambiarlo—.
     Y si la selección vigente deja de existir porque otro filtro la dejó fuera,
     se limpia: un filtro activo que no puede coincidir con nada deja la tabla
     vacía sin explicar por qué. */
  const opcionesDe = (id, campo) => {
    const vivas = filasSalvo(id);
    const vals = campo === 'alcaldia'
      ? [...new Set(explode(vivas,'alcaldia'))]
      : [...new Set(vivas.map(d=>d[campo]).filter(Boolean))];
    vals.sort((a,b)=>a.localeCompare(b,'es'));
    if(state[id] && !vals.includes(state[id])){
      state[id] = '';
      const e = document.getElementById(id); if(e) e.value = '';
    }
    return vals;
  };
  const cats = opcionesDe('fCat','categoria');
  const alcs = opcionesDe('fAlc','alcaldia');
  const pinta = (id, vals, todas) => {
    const e = document.getElementById(id); if(!e) return;
    e.innerHTML = `<option value="">${todas}</option>` + vals.map(v=>`<option>${v}</option>`).join('');
    e.value = state[id] || '';
  };
  pinta('fCat', cats, 'Todas');
  pinta('fAlc', alcs, 'Todas');
  pinta('fTipo', opcionesDe('fTipo','tipo'), 'Todos');
  pinta('fJur',  opcionesDe('fJur','jurisdiccion'), 'Todas');
  /* Suelo de Conservación se arma del estado derivado del porcentaje, no de
     una columna de texto. Cada opción aparece solo si hay áreas en ese caso:
     dentro de Bosques Urbanos no se ofrece «Parcialmente dentro». */
  (()=>{
    const e = document.getElementById('fSC'); if(!e) return;
    const orden = ['dentro','parcial','fuera','sindato'];
    const etq = {dentro:'Dentro', parcial:'Parcialmente dentro', fuera:'Fuera',
                 sindato:'Sin dato'};
    const vivas = new Set(filasSalvo('fSC').map(d=>scEstado(d)));
    if(state.fSC && !vivas.has(state.fSC)) state.fSC = '';
    e.innerHTML = '<option value="">Todos</option>' +
      orden.filter(k=>vivas.has(k)).map(k=>`<option value="${k}">${etq[k]}</option>`).join('');
    e.value = state.fSC || '';
  })();

  /* ── Filtros redundantes ──────────────────────────────────────────────
     Un filtro cuyo subconjunto tiene un solo valor posible no filtra nada:
     dentro de «Bosques Urbanos» el Tipo ya es AVA y la Jurisdicción ya es
     Local. En vez de mantenerlos como adorno, se retiran mientras ese
     subconjunto esté activo, y vuelven al regresar a «Todas». La regla es
     general —un valor único, fuera— y se aplica sola a cualquier columna. */
  const valores = {
    fTipo: new Set(subset.map(d=>d.tipo).filter(Boolean)),
    fJur:  new Set(subset.map(d=>d.jurisdiccion).filter(Boolean)),
    fCat:  new Set(cats),
    fAlc:  new Set(alcs),
    fPM:   new Set(subset.map(d=>d.programa_manejo).filter(Boolean)),
    fSC:   new Set(subset.map(d=>scEstado(d))),
    fDG:   new Set(subset.map(d=>d.dg_responsable || '__sin__'))
  };
  let avanzadosVisibles = 0;
  Object.keys(valores).forEach(id=>{
    const e = document.getElementById(id);
    if(!e) return;
    const lab = e.closest('label');
    const util = valores[id].size > 1;
    if(lab) lab.style.display = util ? '' : 'none';
    if(!util && e.value){ e.value = ''; state[id] = ''; }
    if(util && ['fTipo','fJur','fCat','fSC','fDG'].includes(id)) avanzadosVisibles++;
  });

  /* Con ARCAC tanto la columna «Subcat.» como su filtro contienen la tenencia
     de la tierra: ambos se renombran para que no mientan. */
  const labCat = document.getElementById('labCat');
  if(labCat) labCat.textContent = (state.tab === 'ARCAC') ? 'Tenencia' : 'Subcategoría';
  const thSub = document.querySelector('thead.t-head th[data-k="categoria"]');
  if(thSub){
    const flecha = thSub.querySelector('.arrow');
    thSub.textContent = (state.tab === 'ARCAC') ? 'Tenencia ' : 'Subcat. ';
    thSub.title = (state.tab === 'ARCAC') ? 'Tenencia de la tierra' : 'Subcategoría';
    if(flecha) thSub.appendChild(flecha);
  }

  /* La tabla obedece la misma regla que los filtros: la columna cuyo valor no
     cambia en el subconjunto activo se retira. Se calcula sobre currentData(),
     no sobre las filas filtradas, para que no aparezcan y desaparezcan columnas
     mientras se teclea en la busqueda. */
  /* La 10 (Suelo de Conservación) no corresponde a una columna del Sheet:
     es un estado derivado del porcentaje. Por eso admite función. */
  const COL_CAMPO = {2:'tipo', 3:'jurisdiccion', 4:'categoria', 5:'alcaldia',
                     6:'fecha_decreto', 8:'programa_manejo', 10:scEstado,
                     11:'dg_responsable'};
  const tabla = document.querySelector('table.t');
  if(tabla){
    Object.keys(COL_CAMPO).forEach(n=>{
      const campo = COL_CAMPO[n];
      const vals = campo === 'alcaldia'
        ? new Set(explode(subset,'alcaldia'))
        : typeof campo === 'function'
          ? new Set(subset.map(campo))
          : new Set(subset.map(d=>d[campo] || '—'));
      tabla.classList.toggle('oc-'+n, subset.length > 0 && vals.size <= 1);
    });
    /* Cuenta las columnas que sobreviven en vista partida —sin Jurisdicción,
       Decreto ni Fecha PM, que esa vista retira— y devuelve el año del decreto
       cuando quedan siete o menos. */
    const vivas = [1,2,4,5,7,8,10,11].filter(n=>!tabla.classList.contains('oc-'+n)).length;
    tabla.classList.toggle('con-decreto', vivas <= 7);
    /* En celular la tabla de ARCAC muestra la tenencia como columna propia. */
    tabla.classList.toggle('arcac', state.tab === 'ARCAC');
  }

  /* Si ningun filtro avanzado aporta algo, el boton que los despliega tampoco. */
  const btnMas = document.getElementById('btnMasFiltros');
  const panelAv = document.getElementById('filtrosAvanzados');
  if(btnMas) btnMas.style.display = avanzadosVisibles ? '' : 'none';
  if(panelAv && !avanzadosVisibles){ panelAv.hidden = true; if(btnMas) btnMas.setAttribute('aria-expanded','false'); }
  if(typeof sincronizarMasFiltros === 'function') sincronizarMasFiltros();
}

function renderDashboard(){
  setTimeout(()=>{ try{ montarBotonCapas(); montarBotonBase(); }catch(e){} }, 60);
  const g = currentGroup();
  const dash = document.getElementById('dashboard');
  const tblSec = document.getElementById('tableSection');
  const mapSec = document.getElementById('globalMapSection');

  /* Destino «Ubicar»: la barra de ubicación toma toda la pantalla y el resto
     del tablero se retira. No es una categoría del inventario, es una acción. */
  const wrap = document.querySelector('.wrap');
  if(wrap) wrap.classList.toggle('dest-ubicar', state.dest==='UBICAR');
  /* El caparazón de mapa solo existe con las DOS condiciones: destino Ubicar y
     ancho de celular. Se evalúa aquí y en `resize`, no en una media query
     suelta, para que una sola clase gobierne todas las reglas. */
  const _movil = window.matchMedia('(max-width:760px)').matches;
  if(wrap) wrap.classList.toggle('gm-shell', state.dest==='UBICAR' && _movil);
  if(state.dest!=='UBICAR'){
    if(typeof limpiarUbicacionGlobal === 'function') limpiarUbicacionGlobal();
    const _hr = document.getElementById('ubicarResultado');
    if(_hr) _hr.style.removeProperty('--vis');
    _hojaVis = 0;
  }
  if(state.dest==='UBICAR'){
    dash.innerHTML = '';
    tblSec.style.display = 'none';
    /* El mapa global acompaña a la barra: sin territorio a la vista la pantalla
       queda vacía, y en campo el polígono es la mitad de la respuesta. */
    if(mapSec){
      mapSec.style.display = '';
      mapSec.innerHTML = renderMapaPage(GROUPS[0], true);   // limpio: solo el mapa
      ['AVA · Bosque Urbano','AVA · Barranca','ANP · Local','ANP · Federal']
        .forEach(k => state.mapFilters[k] = true);
      setTimeout(() => initGlobalMap(), 100);
    }
    return;
  }

  if(g.id==='LEGAL'){
    dash.innerHTML = renderLegalDashboard();
    tblSec.style.display = 'none';
    if(mapSec) mapSec.style.display = 'none';
  } else if(g.id==='METAS'){
    dash.innerHTML = renderMetasPage();
    tblSec.style.display = 'none';
    if(mapSec) mapSec.style.display = 'none';
  } else if(g.id==='ANALISIS'){
    dash.innerHTML = renderAnalisisPage();
    tblSec.style.display = 'none';
    if(mapSec) mapSec.style.display = 'none';
    /* Composición y el reparto por alcaldía traen una fila de ARCAC, y la capa
       llega bajo demanda. Se pide una sola vez —el mismo cerrojo que usa la
       pestaña ARCAC— y al resolver se repinta; si falla, la página se queda sin
       esa fila en vez de reintentar en bucle. */
    if(!DATA_ARCAC.length && _arcacTablaEstado === 'sin-cargar'){
      _arcacTablaEstado = 'cargando';
      loadARCAC().then(fc=>{
        construirDatosArcac(fc);
        _arcacTablaEstado = 'listo';
        if(state.tab === 'ANALISIS') renderDashboard();
      }).catch(()=>{ _arcacTablaEstado = 'listo'; });
    }
  } else if(g.id==='ZP'){
    dash.innerHTML = renderZonaPatrimonioPage();
    tblSec.style.display = 'none';
    if(mapSec) mapSec.style.display = 'none';
    setTimeout(() => initZPMap(), 60);
  } else if(g.id==='TRASLAPES'){
    dash.innerHTML = renderTraslapesPage();
    tblSec.style.display = 'none';
    if(mapSec) mapSec.style.display = 'none';
    setTimeout(() => initTraslapesMap(), 60);
  } else if(g.id==='ARCAC'){
    /* Los polígonos llegan bajo demanda; mientras tanto la tabla anuncia la
       espera y, al resolver, se vuelve a pintar todo una sola vez. */
    tblSec.style.display = '';
    if(!DATA_ARCAC.length){
      /* Una sola tentativa. Sin este cerrojo, un arcac.geojson que no responde
         —o que responde vacío— deja a renderDashboard llamándose a sí mismo. */
      dash.innerHTML = '';
      if(_arcacTablaEstado === 'listo'){
        _estadoTabla('No se pudieron cargar los núcleos agrarios. Revisa la conexión y recarga.');
        if(mapSec){ mapSec.style.display='none'; mapSec.innerHTML=''; }
        return;
      }
      if(_arcacTablaEstado === 'cargando') return;
      _arcacTablaEstado = 'cargando';
      _estadoTabla('Cargando los núcleos agrarios…');
      loadARCAC().then(fc=>{
        construirDatosArcac(fc);
        _arcacTablaEstado = 'listo';
        if(state.tab === 'ARCAC'){ populateFilters(); renderDashboard(); render(); }
      }).catch(()=>{
        _arcacTablaEstado = 'listo';
        if(state.tab === 'ARCAC') renderDashboard();
      });
      return;
    }
    dash.innerHTML = resumenArcacHTML();
    if(mapSec){
      mapSec.style.display = '';
      mapSec.innerHTML = renderMapaPage(g);
      /* El mapa muestra los núcleos, no los grupos del inventario. */
      Object.keys(state.mapFilters).forEach(k => state.mapFilters[k] = false);
      state.showArcac = true;
      setTimeout(() => { initGlobalMap(); asegurarCapaArcacGlobal(); }, 100);
    }
  } else {
    tblSec.style.display = '';
    state.showArcac = false;
    dash.innerHTML = g.id==='ALL' ? renderGlobalDashboard() : renderGroupDashboard(g);
    // Mapa: visible en TODAS las pestañas no especiales (Global y categorías)
    if(mapSec){
      mapSec.style.display = '';
      // Re-render del header del mapa con título contextual al grupo activo
      mapSec.innerHTML = renderMapaPage(g);

      // Configura filtros del mapa: ALL → todos visibles; categoría → solo ese grupo
      const allKeys = ['AVA · Bosque Urbano','AVA · Barranca','ANP · Local','ANP · Federal'];
      if(g.id === 'ALL'){
        allKeys.forEach(k => state.mapFilters[k] = true);
      } else if(g.id === 'COADMIN'){
        /* Las ocho áreas del convenio son ANP federales: se enciende esa capa y
           el resaltado, que es lo que las distingue del resto de las nueve. */
        allKeys.forEach(k => state.mapFilters[k] = (k === 'ANP · Federal'));
        state.highlightCoadmin = true;
      } else {
        allKeys.forEach(k => state.mapFilters[k] = (k === g.key));
        state.highlightCoadmin = false;
      }

      setTimeout(() => {
        initGlobalMap();
      }, 100);
    }
  }
}

/* Resumen del inventario · rediseño 2026-09-10
   Antes: cuatro tarjetas, y la cuarta («sin programa de manejo») era el inverso
   aritmetico de la tercera: un cuarto del ancho util sin informacion nueva.
   Ahora: tres cifras y una barra que muestra la cobertura y la brecha a la vez. */
function resumenHTML(arr, titulo){
  const total   = arr.length;
  const totArea = sum(arr,'superficie');
  const conPM   = arr.filter(d=>d.programa_manejo==='Sí').length;
  const sinPM   = total - conPM;
  const p       = total ? (conPM/total)*100 : 0;
  return `
    <div class="resumen">
      <div class="res-blk">
        <span class="res-k">${titulo}</span>
        <span class="res-v">${fmtInt(total)}</span>
      </div>
      <div class="res-blk">
        <span class="res-k">Superficie</span>
        <span class="res-v">${fmt(totArea)}<span class="u">ha</span></span>
        <span class="res-s">${fmt(totArea/100)} km²</span>
      </div>
      <div class="res-blk res-pm">
        <div class="res-pm-top">
          <span class="res-k">Cobertura de programas de manejo</span>
          <span class="res-pm-n">${conPM} / ${total}</span>
        </div>
        <div class="res-bar" role="img" aria-label="${conPM} de ${total} áreas con programa de manejo">
          <span class="res-bar-si" style="width:${p.toFixed(1)}%"></span>
        </div>
        <span class="res-s${sinPM?' res-alerta':''}">${sinPM
          ? `${sinPM} ${sinPM===1?'área':'áreas'} sin programa de manejo vigente`
          : 'Todas las áreas cuentan con programa de manejo'}</span>
      </div>
    </div>`;
}

/* El resumen general habla de cobertura de programas de manejo, que en ARCAC no
   aplica: decir «30 áreas sin programa de manejo vigente» sería falso. Este
   resumen habla de lo que sí hay: núcleos, tenencia y superficie. */
function resumenArcacHTML(){
  const arr = DATA_ARCAC;
  const com = arr.filter(d=>d.categoria==='Comunidad').length;
  const eji = arr.length - com;
  const ha  = sum(arr,'superficie');
  const p   = arr.length ? com/arr.length*100 : 0;
  return `
    <div class="resumen">
      <div class="res-blk">
        <span class="res-k">Núcleos agrarios · ARCAC</span>
        <span class="res-v">${fmtInt(arr.length)}</span>
      </div>
      <div class="res-blk">
        <span class="res-k">Superficie</span>
        <span class="res-v">${fmt(ha)}<span class="u">ha</span></span>
        <span class="res-s">${fmt(ha/100)} km²</span>
      </div>
      <div class="res-blk res-pm">
        <div class="res-pm-top"><span class="res-k">Tenencia de la tierra</span>
          <span class="mono" style="font-size:var(--fs-sm)"><span style="color:var(--arcac-com)">■</span> ${com} comunidad · <span style="color:var(--arcac-eji)">■</span> ${eji} ejido</span></div>
        <div class="res-bar" style="background:var(--arcac-eji)"><span style="width:${p.toFixed(1)}%;background:var(--arcac-com)"></span></div>
        <span class="res-s">Capa complementaria: no forma parte de las 66 áreas del inventario</span>
      </div>
    </div>`;
}

function renderGlobalDashboard(){
  const ava = DATA.filter(d=>d.tipo==='AVA').length;
  const anp = DATA.filter(d=>d.tipo==='ANP').length;
  return resumenHTML(DATA, `Áreas protegidas · ${ava} AVA + ${anp} ANP`);
}

/* ===== Página Metas: comparativo de administraciones + sección Brechas ===== */
function renderMetasPage(){
  /* Las brechas se mudaron a «Análisis» el 11-sep-2026: el chip de allá las
     promete por nombre y aquí quedaban escondidas detrás de otra pregunta. */
  return renderMetaComparable();
}

/* Orden de las dos tablas de brechas. Vive fuera de renderAnalisisPage porque
   la página se vuelve a pintar completa en cada clic y el estado tiene que
   sobrevivir. Arranca por fecha ascendente: lo más viejo primero, que es la
   razón de ser de ambas tablas. */
const ORD_ANALISIS = { b2:{k:'fecha', dir:1}, b3:{k:'fecha', dir:1} };

/* ═══ Análisis · Brechas y distribución ═══════════════════════════════
   Reescrito el 11-sep-2026. Lo que había mezclaba dos cosas: el chip decía
   «Brechas y distribución» pero la página entregaba composición y cronología,
   mientras que el diagnóstico de brechas vivía escondido dentro de Metas, que
   es otra pregunta (qué hizo cada administración). Aquí van las dos que el
   chip promete: qué falta y cómo se reparte.
   Todas las cifras se calculan sobre DATA en cada render: ninguna está escrita
   a mano, así que la página no puede quedar desfasada del Sheet. */
function renderAnalisisPage(){
  const total   = DATA.length;
  const totArea = sum(DATA,'superficie');
  const pct     = (n, d) => d ? (n/d*100) : 0;
  const anio    = iso => (String(iso||'').match(/^(\d{4})/)||[])[1] || null;
  /* «AVA · Barranca» se lee mejor en dos columnas que en una cadena: el tipo
     ordena y el subtipo precisa. Para ANP el subtipo es la jurisdicción
     (Local / Federal); para AVA, la clase de área (Bosque Urbano / Barranca). */
  const subtipo = d => String(d.grupo||'').split(' · ')[1] || d.jurisdiccion || '—';
  const celdasTipo = d => `<td><span class="tag tag-${d.tipo}">${d.tipo}</span></td>
          <td><span class="grp-mini" style="color:${colorTextoGrupo(d.grupo)}">${subtipo(d)}</span></td>`;

  /* Orden por columna. «Antigüedad» es la fecha del revés —más viejo, más
     años—, así que comparte clave y gira el sentido: sin eso, las dos columnas
     de la misma tabla se contradirían. */
  const ordenar = (arr, est, campoFecha) => {
    const acc = ({ nombre:d=>d.nombre, tipo:d=>d.tipo, subtipo:d=>subtipo(d),
                   fecha:d=>d[campoFecha]||'', antig:d=>d[campoFecha]||'',
                   sup:d=>+d.superficie||0 })[est.k] || (d=>d.nombre);
    const giro = est.k==='antig' ? -1 : 1;
    return [...arr].sort((a,b)=>{
      const A=acc(a), B=acc(b);
      const c = est.k==='sup' ? A-B : String(A).localeCompare(String(B),'es');
      return c * est.dir * giro;
    });
  };
  /* Encabezado ordenable: clicable, alcanzable con teclado y con aria-sort para
     que un lector de pantalla anuncie por dónde va el orden. */
  const thOrd = (est, k, txt, der) =>
    `<th scope="col" data-ord="${k}" tabindex="0" class="th-ord${est.k===k?' act':''}"` +
    `${der?' style="text-align:right"':''} aria-sort="${est.k===k?(est.dir===1?'ascending':'descending'):'none'}">` +
    `${txt}<span class="ord-flecha">${est.k===k ? (est.dir===1?'▲':'▼') : '▲'}</span></th>`;
  const ANIO_HOY = new Date().getFullYear();

  const GRUPOS_INV = GROUPS.filter(g=>['BU','BR','ANPL','ANPF'].includes(g.id));

  /* ── 1 · Brecha de programas de manejo ─────────────────────────────── */
  const sinPM     = DATA.filter(d=>d.programa_manejo!=='Sí');
  const supSinPM  = sum(sinPM,'superficie');

  /* ── 2 · Vigencia de los programas publicados ──────────────────────── */
  const conPM     = DATA.filter(d=>d.programa_manejo==='Sí');
  const conPMFecha= conPM.filter(d=>anio(d.fecha_pm_iso));
  const pmViejos  = conPMFecha.filter(d=>ANIO_HOY - +anio(d.fecha_pm_iso) >= 10)
                              .sort((a,b)=>a.fecha_pm_iso.localeCompare(b.fecha_pm_iso));

  /* ── 3 · Decretos añejos sin programa ──────────────────────────────── */
  const viejoSinPM = sinPM.filter(d=>anio(d.fecha_decreto_iso) && ANIO_HOY - +anio(d.fecha_decreto_iso) > 30)
                          .sort((a,b)=>a.fecha_decreto_iso.localeCompare(b.fecha_decreto_iso));

  /* ── 4 · Carga por dirección responsable ───────────────────────────── */
  const porDG = {};
  DATA.forEach(d=>{
    const k = d.dg_responsable || 'Sin asignar';
    (porDG[k] = porDG[k] || {n:0, sup:0, pm:0});
    porDG[k].n++; porDG[k].sup += +d.superficie||0;
    if(d.programa_manejo==='Sí') porDG[k].pm++;
  });
  const dgRows = Object.entries(porDG).sort((a,b)=>b[1].sup-a[1].sup);

  /* ── 5 · Concentración de la superficie ────────────────────────────── */
  const porTam = [...DATA].sort((a,b)=>b.superficie-a.superficie);
  let acum = 0, nMitad = 0;
  for(const d of porTam){ acum += +d.superficie||0; nMitad++; if(acum >= totArea/2) break; }
  const mediana = (()=>{ const v=[...DATA].map(d=>+d.superficie||0).sort((a,b)=>a-b);
    const m=v.length>>1; return v.length%2 ? v[m] : (v[m-1]+v[m])/2; })();

  /* ── 6 · Reparto territorial ───────────────────────────────────────── */
  const ALC16 = ['Álvaro Obregón','Azcapotzalco','Benito Juárez','Coyoacán','Cuajimalpa de Morelos',
    'Cuauhtémoc','Gustavo A. Madero','Iztacalco','Iztapalapa','La Magdalena Contreras','Miguel Hidalgo',
    'Milpa Alta','Tláhuac','Tlalpan','Venustiano Carranza','Xochimilco'];
  const alcVacia = () => ({'AVA · Bosque Urbano':0,'AVA · Barranca':0,'ANP · Local':0,
                           'ANP · Federal':0,'ARCAC':0,total:0,sup:0,supInv:0});
  const alcStats = {};
  DATA.forEach(d => explode([d],'alcaldia').forEach(a=>{
    const k = a.split(' (')[0].trim(); if(!k) return;
    if(!alcStats[k]) alcStats[k] = alcVacia();
    if(alcStats[k][d.grupo] !== undefined){
      alcStats[k][d.grupo]++; alcStats[k].total++;
      alcStats[k].sup += +d.superficie||0; alcStats[k].supInv += +d.superficie||0;
    }
  }));
  /* ARCAC entra al reparto territorial pero en su propio segmento y con su
     propia cuenta: suma hectáreas a la demarcación sin sumarse al inventario.
     `supInv` conserva la superficie de las 66 para lo que sí debe excluirla. */
  DATA_ARCAC.forEach(d=>{
    const k = String(d.alcaldia||'').split(' (')[0].trim(); if(!k) return;
    if(!alcStats[k]) alcStats[k] = alcVacia();
    alcStats[k]['ARCAC']++; alcStats[k].total++; alcStats[k].sup += +d.superficie||0;
  });
  const alcSorted = Object.entries(alcStats).sort((a,b)=>b[1].sup - a[1].sup);
  const maxAlcSup = Math.max(...alcSorted.map(([,s])=>s.sup));
  const sinAreas  = ALC16.filter(a=>!alcStats[a]);

  /* ── Composición por grupo ─────────────────────────────────────────── */
  const supArcac = sum(DATA_ARCAC,'superficie');
  /* La barra compara hectáreas, así que ARCAC entra en la escala: es la capa
     más extensa y esconderlo daría una idea falsa del territorio. Lo que NO
     entra es el porcentaje, porque el 100% son las 66 áreas del inventario. */
  const maxSupGrupo = Math.max(supArcac, ...GRUPOS_INV.map(g=>sum(DATA.filter(d=>d.grupo===g.key),'superficie')));
  const compRows = GRUPOS_INV.map(g=>{
    const arr = DATA.filter(d=>d.grupo===g.key);
    const s = sum(arr,'superficie');
    const pm = arr.filter(d=>d.programa_manejo==='Sí').length;
    return `<tr>
      <td class="grp"><span class="chip ${g.cls}"></span>${g.label}</td>
      <td class="num">${fmtInt(arr.length)}</td>
      <td class="num">${fmt(s)}</td>
      <td class="num">${pm} / ${arr.length}</td>
      <td style="min-width:120px"><div class="share"><div class="share-fill ${g.cls}" style="width:${pct(s,maxSupGrupo)}%"></div></div></td>
      <td class="num">${pct(s,totArea).toFixed(1)}%</td>
    </tr>`;
  }).join('');
  const filaArcac = DATA_ARCAC.length ? `<tr class="fila-complementaria">
      <td class="grp"><span class="chip" style="background:var(--arcac-com)"></span>ARCAC
        <span style="color:var(--muted);font-size:var(--fs-xs)"> · capa complementaria</span></td>
      <td class="num">${fmtInt(DATA_ARCAC.length)}</td>
      <td class="num">${fmt(supArcac)}</td>
      <td class="num" title="Los núcleos agrarios no tienen programa de manejo">n/a</td>
      <td style="min-width:120px"><div class="share"><div class="share-fill" style="width:${pct(supArcac,maxSupGrupo)}%;background:var(--arcac-com)"></div></div></td>
      <td class="num" title="No forma parte de las 66 áreas: no entra en el porcentaje">—</td>
    </tr>` : '';

  return `
    <div class="panel" style="border-left:3px solid var(--guinda)">
      <div class="panel-title" style="color:var(--guinda)">Análisis del sistema</div>
      <h3>Brechas y <em>distribución</em></h3>
      <p class="panel-intro" style="margin-top:8px">Dos preguntas: qué le falta al sistema y cómo se
        reparte. Todo se calcula sobre el inventario en vivo, así que estas cifras cambian solas cuando
        cambia el Sheet. Para el comparativo entre administraciones, vaya a <b>Metas</b>; para la
        superposición de instrumentos sobre un mismo predio, a <b>Traslapes</b>.</p>
    </div>

    <div class="hero">
      <div class="hero-card hero-warning">
        <div class="hero-eyebrow">Brecha principal</div>
        <div class="hero-value">${pct(supSinPM,totArea).toFixed(0)}<span style="font-size:var(--fs-lg);color:var(--muted);margin-left:4px;font-weight:500">%</span></div>
        <div class="hero-label">de la superficie protegida no tiene programa de manejo</div>
        <div class="hero-meta">${fmtInt(sinPM.length)} de ${total} áreas · ${fmt(supSinPM)} ha</div>
      </div>
      <div class="hero-card hero-warning">
        <div class="hero-eyebrow">Vigencia</div>
        <div class="hero-value">${pmViejos.length}<span style="font-size:var(--fs-lg);color:var(--muted);margin-left:4px;font-weight:500">/${conPMFecha.length}</span></div>
        <div class="hero-label">programas publicados hace diez años o más</div>
        <div class="hero-meta">el más antiguo es de ${conPMFecha.length ? anio(pmViejos.length?pmViejos[0].fecha_pm_iso:conPMFecha[0].fecha_pm_iso) : '—'}</div>
      </div>
      <div class="hero-card hero-info">
        <div class="hero-eyebrow">Concentración</div>
        <div class="hero-value">${nMitad}<span style="font-size:var(--fs-lg);color:var(--muted);margin-left:4px;font-weight:500">/${total}</span></div>
        <div class="hero-label">áreas reúnen la mitad de la superficie</div>
        <div class="hero-meta">mediana ${fmt(mediana)} ha · promedio ${fmt(totArea/total)} ha</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Brecha 1 · Programas de manejo</div>
      <h3>Dónde se concentra el <em>rezago</em></h3>
      <p class="panel-intro">El programa de manejo es el instrumento rector de operación de cada área
        (LACM arts. 122, 144 y 156). Contado por áreas el rezago es de
        ${pct(sinPM.length,total).toFixed(0)}%; medido en superficie sube a
        ${pct(supSinPM,totArea).toFixed(0)}%, porque las áreas sin programa son las grandes.</p>
      <div class="brechas-grid">
        ${GRUPOS_INV.map(g=>{
          const arr = DATA.filter(d=>d.grupo===g.key);
          const falta = arr.filter(d=>d.programa_manejo!=='Sí');
          const p = pct(falta.length, arr.length);
          const color = GROUP_COLORS[g.key];
          return `<div class="brecha-card" style="--card-color:${color};--card-color-text:${colorTextoGrupo(g.key)}">
            <div class="brecha-card-header">
              <span class="brecha-card-grupo">${g.label}</span>
              <span class="brecha-card-pct">${p.toFixed(0)}%</span>
            </div>
            <div class="brecha-card-num">${falta.length}<span style="font-size:var(--fs-md);color:var(--muted);margin-left:4px;font-weight:500">/${arr.length}</span></div>
            <div class="brecha-card-lbl">sin programa · ${fmt(sum(falta,'superficie'))} ha</div>
            <div class="brecha-card-bar"><div class="brecha-card-bar-fill" style="width:${p}%;background:${color}"></div></div>
            ${falta.length ? `<details class="brecha-card-details">
              <summary>Ver listado (${falta.length})</summary>
              <ul class="brecha-list">${falta.sort((a,b)=>b.superficie-a.superficie)
                .map(d=>`<li><span>${d.nombre}</span><span class="brecha-list-meta">${fmt(d.superficie)} ha</span></li>`).join('')}</ul>
            </details>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Brecha 2 · Vigencia de lo publicado</div>
      <h3>Programas con <em>diez años o más</em></h3>
      <p class="panel-intro">Tener programa no equivale a tenerlo vigente. De los ${conPMFecha.length}
        programas con fecha registrada, ${pmViejos.length} se publicaron hace una década o más y operan
        sobre diagnósticos anteriores a la ciudad actual. El dato no implica caducidad jurídica: señala
        a qué áreas conviene mirar primero en una revisión.</p>
      ${pmViejos.length ? `<div class="comp-scroll"><table class="comp" data-tabla="b2">
        <thead><tr>
          ${thOrd(ORD_ANALISIS.b2,'nombre','Área')}
          ${thOrd(ORD_ANALISIS.b2,'tipo','Tipo')}
          ${thOrd(ORD_ANALISIS.b2,'subtipo','Subtipo')}
          ${thOrd(ORD_ANALISIS.b2,'fecha','Publicado',1)}
          ${thOrd(ORD_ANALISIS.b2,'antig','Antigüedad',1)}
          ${thOrd(ORD_ANALISIS.b2,'sup','Superficie',1)}
        </tr></thead>
        <tbody>${ordenar(pmViejos, ORD_ANALISIS.b2, 'fecha_pm_iso').map(d=>`<tr>
          <td><b>${d.nombre}</b></td>
          ${celdasTipo(d)}
          <td class="num" title="${d.fecha_pm ? 'Publicado el '+d.fecha_pm : ''}">${anio(d.fecha_pm_iso)}</td>
          <td class="num">${ANIO_HOY - +anio(d.fecha_pm_iso)} años</td>
          <td class="num">${fmt(d.superficie)} ha</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="panel-intro">Todos los programas vigentes se publicaron en la última década.</p>'}
    </div>

    <div class="panel">
      <div class="panel-title">Brecha 3 · Decreto sin programa</div>
      <h3>Áreas decretadas hace más de <em>treinta años</em> que siguen sin programa</h3>
      <p class="panel-intro">${viejoSinPM.length
        ? `Son ${viejoSinPM.length}${viejoSinPM.every(d=>d.jurisdiccion==='Federal')
            ? ', todas de jurisdicción federal, lo que sitúa la gestión del rezago en la coadministración con SEMARNAT y CONANP más que en una decisión local' : ''}.`
        : 'No hay ninguna: todas las áreas con decreto anterior a ' + (ANIO_HOY-30) + ' cuentan con programa.'}</p>
      ${viejoSinPM.length ? `<div class="comp-scroll"><table class="comp" data-tabla="b3">
        <thead><tr>
          ${thOrd(ORD_ANALISIS.b3,'nombre','Área')}
          ${thOrd(ORD_ANALISIS.b3,'tipo','Tipo')}
          ${thOrd(ORD_ANALISIS.b3,'subtipo','Subtipo')}
          ${thOrd(ORD_ANALISIS.b3,'fecha','Decreto',1)}
          ${thOrd(ORD_ANALISIS.b3,'antig','Antigüedad',1)}
          ${thOrd(ORD_ANALISIS.b3,'sup','Superficie',1)}
        </tr></thead>
        <tbody>${ordenar(viejoSinPM, ORD_ANALISIS.b3, 'fecha_decreto_iso').map(d=>`<tr>
          <td><b>${d.nombre}</b></td>
          ${celdasTipo(d)}
          <td class="num" title="${d.fecha_decreto ? 'Decretada el '+d.fecha_decreto : ''}">${anio(d.fecha_decreto_iso)}</td>
          <td class="num">${ANIO_HOY - +anio(d.fecha_decreto_iso)} años</td>
          <td class="num">${fmt(d.superficie)} ha</td></tr>`).join('')}</tbody>
        <tfoot><tr style="border-top:2px solid var(--guinda)">
          <td colspan="5" style="font-weight:600">Superficie sin instrumento rector</td>
          <td class="num" style="font-weight:600">${fmt(sum(viejoSinPM,'superficie'))} ha</td>
        </tr></tfoot>
      </table></div>` : ''}
    </div>

    <div class="panel">
      <div class="panel-title">Carga institucional</div>
      <h3>Reparto por <em>dirección responsable</em></h3>
      <p class="panel-intro">El número de áreas y la superficie a cargo no van de la mano, y la cobertura
        de programas tampoco. Es el dato con consecuencia presupuestal más directa de esta página.</p>
      <div class="comp-scroll"><table class="comp">
        <thead><tr><th scope="col">Dirección</th>
          <th scope="col" style="text-align:right">Áreas</th>
          <th scope="col" style="text-align:right">% de las áreas</th>
          <th scope="col" style="text-align:right">Superficie</th>
          <th scope="col" style="text-align:right">% de la superficie</th>
          <th scope="col" style="text-align:right">Con programa</th></tr></thead>
        <tbody>${dgRows.map(([k,v])=>`<tr>
          <td><b>${k}</b></td>
          <td class="num">${v.n}</td>
          <td class="num">${pct(v.n,total).toFixed(1)}%</td>
          <td class="num">${fmt(v.sup)} ha</td>
          <td class="num">${pct(v.sup,totArea).toFixed(1)}%</td>
          <td class="num">${v.pm} / ${v.n}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="panel">
      <div class="panel-title">Composición</div>
      <h3>Los cuatro grupos del <em>inventario</em></h3>
      <p class="panel-intro">Las superficies son las decretadas; la suma de las cuatro excede la
        superficie realmente protegida, porque hay predios cubiertos por dos instrumentos a la vez.
        <b>ARCAC aparece bajo el total, no dentro</b>: son núcleos agrarios, no áreas del inventario,
        así que suman hectáreas comparables pero no entran en el 100% ni en los porcentajes.</p>
      <div class="comp-scroll" style="margin-top:16px"><table class="comp">
        <thead><tr><th scope="col">Grupo</th>
          <th scope="col" style="text-align:right">Áreas</th>
          <th scope="col" style="text-align:right">Superficie</th>
          <th scope="col" style="text-align:right">Con programa</th>
          <th scope="col">Proporción</th>
          <th scope="col" style="text-align:right">% total</th></tr></thead>
        <tbody>${compRows}
          <tr style="border-top:2px solid var(--guinda)">
            <td class="grp" style="font-weight:600">Total del inventario</td>
            <td class="num" style="font-weight:600">${fmtInt(total)}</td>
            <td class="num" style="font-weight:600">${fmt(totArea)}</td>
            <td class="num" style="font-weight:600">${conPM.length} / ${total}</td>
            <td></td>
            <td class="num" style="font-weight:600">100%</td>
          </tr>
          ${filaArcac}</tbody>
      </table></div>
    </div>

    <div class="panel panel-compact">
      <div class="panel-title">Territorio</div>
      <h3>Reparto por <em>alcaldía</em></h3>
      <p class="panel-intro" style="margin-bottom:10px">Ordenado por superficie, no por número de áreas:
        una barranca de 8 ha y un parque nacional de 6,000 ha cuentan igual en un conteo y no se parecen
        en nada en el territorio. Un área que cruza límites aparece en cada demarcación que toca.</p>

      <div class="alc-legend">
        ${GRUPOS_INV.map(g=>`<span class="alc-leg-item"><span class="alc-leg-swatch" style="background:${GROUP_COLORS[g.key]}"></span>${g.label}</span>`).join('')}
        ${DATA_ARCAC.length ? `<span class="alc-leg-item"><span class="alc-leg-swatch" style="background:var(--arcac-com)"></span>ARCAC <span style="color:var(--muted)">· no suma al inventario</span></span>` : ''}
      </div>

      <div class="alc-stacked">
        ${alcSorted.map(([k,s])=>{
          const segs = GRUPOS_INV.map(g=>({n:s[g.key], color:GROUP_COLORS[g.key], label:g.label})
                       ).concat([{n:s['ARCAC']||0, color:'var(--arcac-com)', label:'ARCAC'}])
                                 .filter(x=>x.n>0);
          return `<div class="alc-row">
            <span class="alc-name">${k}</span>
            <div class="alc-track" style="width:${pct(s.sup,maxAlcSup)}%">
              ${segs.map(x=>{
                const p = pct(x.n, s.total);
                return `<div class="alc-seg" style="width:${p}%;background:${x.color}" title="${k} · ${x.label}: ${x.n}">${p>=16?`<span class="alc-seg-num">${x.n}</span>`:''}</div>`;
              }).join('')}
            </div>
            <span class="alc-total">${fmt(s.sup)} ha · ${s.total}</span>
          </div>`;
        }).join('')}
      </div>
      ${sinAreas.length ? `<div class="nota-analisis">
        <b>${sinAreas.length} de las 16 alcaldías no registran ninguna área:</b> ${sinAreas.join(', ')}.
        Es una descripción del inventario, no un diagnóstico: para saber si ahí falta protección hay que
        mirar el suelo disponible y su uso, no el número de polígonos.
      </div>` : ''}
    </div>

    ${renderCronologiaSection()}
  `;
}

/* ===== Meta comparable: línea base 2018-2024 vs administración actual ===== */
function enPeriodo(fechaIso, desde, hasta){
  if(!fechaIso) return false;
  return fechaIso >= desde && fechaIso <= hasta;
}
function computeAdminStats(desde, hasta){
  const dec = {BU:[],BR:[],ANPL:[],ANPF:[]};
  const pm  = {BU:[],BR:[],ANPL:[],ANPF:[]};
  DATA.forEach(d=>{
    const g = d.grupo.includes('Bosque Urbano')?'BU':d.grupo.includes('Barranca')?'BR':d.grupo.includes('Federal')?'ANPF':'ANPL';
    if(enPeriodo(d.fecha_decreto_iso, desde, hasta)) dec[g].push(d);
    if(enPeriodo(d.fecha_pm_iso, desde, hasta)) pm[g].push(d);
  });
  return {dec, pm};
}


/* ============================================================
 * CRONOLOGÍA · sección integrada dentro del tab Análisis
 * ============================================================ */
/* Gráfica de barras por administración de gobierno. Una sola implementación
   para dos preguntas —cuántas áreas se decretaron y cuántos programas de manejo
   se publicaron en cada sexenio—: cambian el campo de fecha y las palabras, no
   la mecánica. Duplicar el bloque habría dejado dos copias de la misma lógica
   de rangos que divergirían al primer ajuste. */
function graficaPorAdministracion(o){
  const { gobiernos, toDec, registros, campo, eyebrow, titulo, intro,
          singular, plural, verbo } = o;
  /* El último día del periodo SÍ pertenece al periodo: la entrega ocurre el 5 de
     diciembre, así que el 4 todavía es de quien sale. Con el corte abierto
     (`t < end`) tres registros caían en ningún sexenio —los programas de Vista
     Hermosa (2012-12-04) y Ecoguardas (2018-12-04) y el decreto de Ejidos de
     Xochimilco (2006-12-04)— y el pie los reportaba como si fueran anteriores a
     1997. Los periodos no se traslapan porque cada `end` es la víspera del
     `start` siguiente. */
  const dentro = (iso, g) => {
    if(!iso) return false;
    const [y,m,d] = iso.split('-').map(Number);
    const t = toDec(y, m, d);
    return t >= g.start && t <= g.end;
  };
  const filas = gobiernos.map(g=>{
    const items = registros.filter(r => dentro(r[campo], g));
    return { ...g, items, count: items.length };
  });
  const maxCount = Math.max(...filas.map(g=>g.count), 1);
  const totalUbicado = filas.reduce((n,g)=>n+g.count, 0);
  /* Lo que queda fuera se cuenta, no se supone: si un registro no cae en ningún
     periodo es porque es anterior al primero, y el pie lo dice con su número
     real en vez de restar y atribuirlo a ciegas. */
  const iniPrimero = gobiernos[0].start;
  const previos = registros.filter(r=>{
    const iso = r[campo]; if(!iso) return false;
    const [y,m,d] = iso.split('-').map(Number);
    return toDec(y,m,d) < iniPrimero;
  }).length;
  const fechaTxt = dec => {
    const y = Math.floor(dec);
    const m = Math.floor((dec - y) * 12) + 1;
    const d = Math.floor(((dec - y) * 12 - (m-1)) * 30) + 1;
    return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
  };
  return `
    <div class="panel">
      <div class="panel-title">${eyebrow}</div>
      <h3>${titulo}</h3>
      <p class="panel-intro">${intro}</p>
      <div class="cronologia-container">
        <div class="cron-gob-chart">
          ${filas.map(g=>{
            const alto = g.count > 0 ? (g.count / maxCount * 100) : 0;
            const anios = (g.end - g.start).toFixed(1);
            const enCurso = g.end > (new Date().getFullYear() + 0.99);
            const fin = enCurso ? 'En funciones' : fechaTxt(g.end);
            const cuenta = `${g.count} ${g.count===1?singular:plural}`;
            return `
              <div class="cron-gob-col" data-gob="${g.nombre}">
                <div class="cron-gob-count">${g.count || ''}</div>
                <div class="cron-gob-bar" style="height:${alto}%;background:${g.color}"
                     data-count="${g.count}" tabindex="0" role="button"
                     aria-label="${g.full}: ${g.count ? cuenta : verbo}">
                  <div class="cron-gob-tooltip">
                    <div class="cron-gob-tt-title">${g.full}</div>
                    <div class="cron-gob-tt-period">${fechaTxt(g.start)} → ${fin}</div>
                    <div class="cron-gob-tt-meta">${g.count ? cuenta : verbo} · ${anios} años de gestión</div>
                    ${g.count ? `<ul class="cron-gob-tt-list">${
                      [...g.items].sort((a,b)=>String(a[campo]).localeCompare(String(b[campo])))
                        .slice(0,8).map(r=>`<li>${String(r[campo]).slice(0,4)} · ${r.nombre}</li>`).join('')
                    }${g.items.length > 8 ? `<li style="opacity:.7">+ ${g.items.length - 8} más…</li>` : ''}</ul>` : ''}
                  </div>
                </div>
                <div class="cron-gob-col-label">${g.nombre}</div>
                <div class="cron-gob-col-period">${Math.floor(g.start)}–${enCurso ? 'hoy' : Math.floor(g.end)}</div>
              </div>`;
          }).join('')}
        </div>
        <div class="cron-gob-caption" style="margin-top:14px">
          ${gobiernos.length} administraciones · ${totalUbicado} de ${registros.length}
          ${registros.length===1?singular:plural} caen dentro de estos periodos${
            previos ? ` · ${previos} ${previos===1?'es anterior':'son anteriores'} a ${Math.floor(gobiernos[0].start)}` : ''}
          · toque una barra —o pase el cursor— para ver el detalle
        </div>
      </div>
    </div>`;
}

function renderCronologiaSection(){
  // Áreas con fecha de decreto válida
  const conFecha = DATA.filter(d => d.fecha_decreto_iso && d.fecha_decreto_iso.match(/^\d{4}/));
  // Áreas con programa de manejo publicado y fecha registrada
  const conPM = DATA.filter(d => d.fecha_pm_iso && d.fecha_pm_iso.match(/^\d{4}/));
  const sinFecha = DATA.length - conFecha.length;

  // Agrupar por década
  const porDecada = {};
  conFecha.forEach(d => {
    const anio = parseInt(d.fecha_decreto_iso.slice(0,4));
    const decada = Math.floor(anio / 10) * 10;
    if(!porDecada[decada]) porDecada[decada] = [];
    porDecada[decada].push(d);
  });
  const decadas = Object.keys(porDecada).map(Number).sort();
  if(decadas.length === 0) return '';
  const minDec = Math.min(...decadas);
  const maxDec = Math.max(...decadas);
  const maxCount = Math.max(...Object.values(porDecada).map(arr => arr.length));

  // Generar todas las décadas (incluyendo las vacías para preservar la línea temporal)
  const todasDecadas = [];
  for(let d = minDec; d <= maxDec; d += 10) todasDecadas.push(d);

  // Décadas con al menos 1 decreto (para promedios y métricas significativas)
  const decadasActivas = todasDecadas.filter(d => (porDecada[d] || []).length > 0);
  const decadasVacias = todasDecadas.length - decadasActivas.length;
  // Promedio sobre décadas ACTIVAS (más informativo que dividir entre todas las décadas)
  const promedioActivas = decadasActivas.length > 0
    ? (conFecha.length / decadasActivas.length).toFixed(1)
    : '0';

  // Top "picos" — décadas con más decretos
  const picos = decadas
    .map(d => ({decada: d, count: porDecada[d].length}))
    .sort((a,b) => b.count - a.count)
    .slice(0, 3);

  // Áreas más antiguas y más recientes
  const masAntigua = [...conFecha].sort((a,b) => a.fecha_decreto_iso.localeCompare(b.fecha_decreto_iso))[0];
  const masReciente = [...conFecha].sort((a,b) => b.fecha_decreto_iso.localeCompare(a.fecha_decreto_iso))[0];

  // Periodos de gobierno electo de la Ciudad de México (desde 1997)
  // Fechas como decimal (año + fracción) para posicionamiento en el eje continuo
  const toDec = (y,m,d) => y + (m-1)/12 + (d-1)/365;
  /* CINCO ADMINISTRACIONES, NO DIEZ (11 sep 2026).
     Antes se listaban las diez jefaturas desde 1997, interinatos incluidos. Dos
     problemas: los tres interinatos —Encinas, Amieva, Batres— partían en dos la
     administración a la que pertenecen y repartían sus decretos entre dos
     barras, de modo que ninguna de las dos decía cuánto se decretó en ese
     sexenio; y Cárdenas y Robles ocupaban la mitad izquierda del gráfico sin un
     solo decreto que mostrar.
     Ahora cada barra es un PERIODO COMPLETO a nombre de quien lo encabezó: el
     interinato se cuenta dentro del periodo que termina, que es como se lee un
     sexenio. 1997–2000 sale porque no tiene decretos que reportar. */
  const gobiernos = [
    {nombre:'AMLO',         start:toDec(2000,12,5), end:toDec(2006,12,4),  full:'Andrés Manuel López Obrador', color:'#7d6e8f'},
    {nombre:'M. Ebrard',    start:toDec(2006,12,5), end:toDec(2012,12,4),  full:'Marcelo Ebrard',              color:'#a08bb5'},
    {nombre:'M.Á. Mancera', start:toDec(2012,12,5), end:toDec(2018,12,4),  full:'Miguel Ángel Mancera',        color:'#7d6e8f'},
    {nombre:'C. Sheinbaum', start:toDec(2018,12,5), end:toDec(2024,10,4),  full:'Claudia Sheinbaum',           color:'var(--guinda-900)'},
    {nombre:'C. Brugada',   start:toDec(2024,10,5), end:toDec(2030,10,5),  full:'Clara Brugada',               color:'var(--guinda)'}
  ];

  // Rango total del eje (en años decimales)
  const ejeStart = minDec;
  const ejeEnd = maxDec + 10;

  return `
    <div class="panel" style="margin-top:18px">
      <div class="panel-title">Cronología · Línea de tiempo de decretos</div>
      <h3>Evolución <em>histórica</em> del sistema de áreas protegidas</h3>
      <p class="panel-intro">Distribución temporal de los <b>${conFecha.length} decretos</b> de creación de áreas protegidas, en un periodo de <b>${maxDec - minDec + 10} años</b> de política ambiental local. Pico histórico: <b>${picos[0]?.decada || '—'}s</b> (${picos[0]?.count || 0} decretos) · Promedio en décadas activas: <b>${promedioActivas} decretos</b> · ${decadasActivas.length} de ${todasDecadas.length} décadas con actividad${decadasVacias > 0 ? ` (${decadasVacias} sin decretos)` : ''}. Toque una barra —o pase el cursor— para ver qué áreas se decretaron.</p>

      <div class="cronologia-container">
        <div class="cronologia-chart" id="cronologiaChart">
          ${todasDecadas.map(dec => {
            const arr = porDecada[dec] || [];
            const heightPct = arr.length > 0 ? (arr.length / maxCount * 100) : 0;
            const isPico = picos[0] && picos[0].decada === dec;
            return `
              <div class="cron-bar-col" data-decada="${dec}">
                <div class="cron-bar-count">${arr.length || ''}</div>
                <div class="cron-bar" style="height:${heightPct}%" data-count="${arr.length}"
                     ${arr.length ? `tabindex="0" role="button" aria-label="Década ${dec}–${dec+9}: ${arr.length} ${arr.length===1?'decreto':'decretos'}"` : ''}>
                  ${arr.length > 0 ? `<div class="cron-bar-tooltip">
                    <div class="cron-tt-decada">Década ${dec}–${dec+9}</div>
                    <div class="cron-tt-count">${arr.length} ${arr.length===1?'decreto':'decretos'}</div>
                    <ul class="cron-tt-list">${arr.slice(0,8).map(d => `<li>${d.fecha_decreto_iso.slice(0,4)} · ${d.nombre}</li>`).join('')}${arr.length > 8 ? `<li style="opacity:.7">+ ${arr.length - 8} más…</li>` : ''}</ul>
                  </div>` : ''}
                </div>
                <div class="cron-bar-label${isPico ? ' is-pico' : ''}">${dec}s</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Panel independiente: decretos por administración electa CDMX -->
    ${''/* la gráfica se arma con graficaPorAdministracion, definida abajo */}
    ${graficaPorAdministracion({
      gobiernos, toDec,
      registros: conFecha,
      campo: 'fecha_decreto_iso',
      eyebrow: 'Cronología · Decretos por administración',
      titulo: 'Cuántas áreas se <em>decretaron</em> en cada sexenio',
      intro: `Número de decretos de creación publicados durante cada administración. La barra es el
        conteo; abajo, quién encabezó el periodo y sus años. <b>Cuenta las 66 áreas, federales
        incluidas</b>; el panel de Metas cuenta solo los instrumentos locales, por eso sus cifras
        son menores para el mismo sexenio.`,
      singular: 'decreto', plural: 'decretos', verbo: 'Sin decretos en este periodo'
    })}

    ${graficaPorAdministracion({
      gobiernos, toDec,
      registros: conPM,
      campo: 'fecha_pm_iso',
      eyebrow: 'Cronología · Programas de manejo por administración',
      titulo: 'Cuántos programas de manejo se <em>publicaron</em> en cada sexenio',
      intro: `El decreto crea el área; el programa de manejo la hace operable. Esta gráfica cuenta
        lo segundo, que es el cuello de botella del sistema: hay ${conPM.length} programas
        publicados para ${DATA.length} áreas. <b>Cuenta las 66 áreas, federales incluidas</b>;
        el panel de Metas cuenta solo los locales.`,
      singular: 'programa', plural: 'programas', verbo: 'Sin programas publicados en este periodo'
    })}
    </div>

    <div class="panel">
      <div class="panel-title">Hitos del sistema</div>
      <h3>Decretos <em>fundacionales</em> y más recientes</h3>
      <div class="legal-grid" style="margin-top:14px">
        <div class="constitucion-card">
          <span class="l-art">DECRETO MÁS ANTIGUO</span>
          <h4>${masAntigua.nombre}</h4>
          <p><b>${masAntigua.fecha_decreto || masAntigua.fecha_decreto_iso}</b> · ${masAntigua.grupo}<br>Superficie: ${fmt(masAntigua.superficie)} ha · Alcaldía: ${masAntigua.alcaldia || '—'}</p>
        </div>
        <div class="constitucion-card">
          <span class="l-art">DECRETO MÁS RECIENTE</span>
          <h4>${masReciente.nombre}</h4>
          <p><b>${masReciente.fecha_decreto || masReciente.fecha_decreto_iso}</b> · ${masReciente.grupo}<br>Superficie: ${fmt(masReciente.superficie)} ha · Alcaldía: ${masReciente.alcaldia || '—'}</p>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Top 3 picos históricos</div>
      <h3>Décadas con mayor actividad de decretos</h3>
      <div class="brechas-rank" style="margin-top:14px">
        ${picos.map((p, i) => `
          <div class="rank-row">
            <span class="rank-pos">${i+1}</span>
            <div class="rank-body">
              <div class="rank-header">
                <span class="rank-name">Década ${p.decada}–${p.decada+9}</span>
                <span class="rank-count">${p.count} ${p.count===1?'decreto':'decretos'}</span>
              </div>
              <div class="rank-bar"><div class="rank-bar-fill" style="width:${(p.count / maxCount * 100).toFixed(0)}%"></div></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${sinFecha > 0 ? `
      <div class="panel" style="border-left:3px solid var(--dorado)">
        <div class="panel-title" style="color:var(--dorado-text)">Datos faltantes</div>
        <p class="panel-intro" style="margin:8px 0 0"><b>${sinFecha} ${sinFecha===1?'área no tiene':'áreas no tienen'}</b> fecha de decreto registrada en el inventario y no aparece${sinFecha===1?'':'n'} en la cronología.</p>
      </div>
    ` : ''}
  `;
}

function renderMetaComparable(){
  /* Administración 2018–2024, a nombre de Claudia Sheinbaum. El periodo se
     cuenta COMPLETO —el interinato de Batres queda dentro—, igual que en la
     cronología por administración: partirlo repartiría los decretos del sexenio
     entre dos columnas y ninguna diría cuánto se decretó. */
  const anterior = computeAdminStats('2018-12-05', '2024-10-04');
  // Administración actual (5 oct 2024 – en curso) · toma de posesión Brugada
  const hoyIso = new Date().toISOString().slice(0,10);
  const actual = computeAdminStats('2024-10-05', hoyIso);

  const decAntLoc = anterior.dec.BU.length + anterior.dec.BR.length + anterior.dec.ANPL.length;
  const decAntFed = anterior.dec.ANPF.length;
  const pmAntLoc  = anterior.pm.BU.length + anterior.pm.BR.length + anterior.pm.ANPL.length;
  const pmAntFed  = anterior.pm.ANPF.length;

  const decActLoc = actual.dec.BU.length + actual.dec.BR.length + actual.dec.ANPL.length;
  const decActFed = actual.dec.ANPF.length;
  const pmActLoc  = actual.pm.BU.length + actual.pm.BR.length + actual.pm.ANPL.length;
  const pmActFed  = actual.pm.ANPF.length;

  const decPromedio = (decAntLoc/6).toFixed(2);
  const pmPromedio  = (pmAntLoc/6).toFixed(2);

  const listaPMAnt = [...anterior.pm.BU, ...anterior.pm.BR, ...anterior.pm.ANPL]
    .sort((a,b)=>a.fecha_pm_iso.localeCompare(b.fecha_pm_iso))
    .map(d=>`<li><span class="lbl">${d.nombre}</span><span class="ref">${d.fecha_pm} · ${d.grupo.replace('AVA · ','').replace('ANP · ','')}</span></li>`).join('');
  const listaDecretosAnt = [...anterior.dec.BU, ...anterior.dec.BR, ...anterior.dec.ANPL]
    .sort((a,b)=>a.fecha_decreto_iso.localeCompare(b.fecha_decreto_iso))
    .map(d=>`<li><span class="lbl">${d.nombre}</span><span class="ref">${d.fecha_decreto} · ${d.grupo.replace('AVA · ','').replace('ANP · ','')}</span></li>`).join('');

  const listaActualPM = [...actual.pm.BU, ...actual.pm.BR, ...actual.pm.ANPL]
    .map(d=>`<li><span class="lbl">${d.nombre}</span><span class="ref">${d.fecha_pm} · ${d.grupo.replace('AVA · ','').replace('ANP · ','')}</span></li>`).join('') || '<li style="color:var(--muted);font-style:italic">Aún sin PM publicados en el portal.</li>';
  const listaActualDec = [...actual.dec.BU, ...actual.dec.BR, ...actual.dec.ANPL]
    .map(d=>`<li><span class="lbl">${d.nombre}</span><span class="ref">${d.fecha_decreto} · ${d.grupo.replace('AVA · ','').replace('ANP · ','')}</span></li>`).join('') || '<li style="color:var(--muted);font-style:italic">Aún sin decretos emitidos.</li>';

  return `
    <div class="panel meta-block">
      <div class="panel-title" style="color:var(--guinda)">Planeación sexenal · Línea base comparable</div>
      <h3>Metas de <em>gobierno ambiental</em></h3>
      <p class="panel-intro">Indicadores comparativos entre la administración anterior (<b>2018-2024</b>) y la administración actual (<b>2024-2030</b>), construidos a partir del inventario de decretos y Programas de Manejo de AVA y ANP de competencia de la Ciudad de México. Excluye instrumentos federales (CONANP). Las cifras se actualizan automáticamente conforme se registran nuevos instrumentos.</p>

      <div class="meta-hero">
        <div class="meta-col meta-col-base">
          <div class="meta-col-head">
            <span class="meta-titular">Claudia Sheinbaum</span>
            <span class="meta-period">2018 — 2024</span>
            <span class="meta-label">Línea base · 6 años</span>
          </div>
          <div class="meta-stats">
            <div class="meta-stat"><div class="meta-n">${decAntLoc}</div><div class="meta-t">Decretos locales emitidos</div></div>
            <div class="meta-stat"><div class="meta-n">${pmAntLoc}</div><div class="meta-t">Programas de Manejo publicados</div></div>
          </div>
          <div class="meta-rate">
            <span>Promedio: <b>${decPromedio}</b> decretos/año · <b>${pmPromedio}</b> PM/año</span>
          </div>
        </div>
        <div class="meta-arrow">→</div>
        <div class="meta-col meta-col-goal">
          <div class="meta-col-head">
            <span class="meta-titular">Clara Brugada</span>
            <span class="meta-period">2024 — 2030</span>
            <span class="meta-label">Administración actual · meta por superar</span>
          </div>
          <div class="meta-stats">
            <div class="meta-stat"><div class="meta-n meta-actual">${decActLoc}</div><div class="meta-t">Decretos locales emitidos</div></div>
            <div class="meta-stat"><div class="meta-n meta-actual">${pmActLoc}</div><div class="meta-t">Programas de Manejo publicados</div></div>
          </div>
          <div class="meta-rate">
            <span>Meta mínima: <b>superar 12 decretos y 3 PM</b> en el sexenio</span>
          </div>
        </div>
      </div>

      <div class="meta-breakdown">
        <div class="meta-card">
          <div class="meta-card-title">Desglose 2018-2024 · ${decAntLoc} decretos locales</div>
          <div class="meta-tags">
            <span class="meta-tag tag-sub sub-BU">${anterior.dec.BU.length} Bosques Urbanos</span>
            <span class="meta-tag tag-sub sub-BR">${anterior.dec.BR.length} Barrancas</span>
            <span class="meta-tag tag-sub sub-ZCE">${anterior.dec.ANPL.length} ANP Local</span>
          </div>
          <details class="meta-details">
            <summary>Ver decretos emitidos</summary>
            <ul class="meta-list">${listaDecretosAnt}</ul>
          </details>
        </div>
        <div class="meta-card">
          <div class="meta-card-title">Desglose 2018-2024 · ${pmAntLoc} Programas de Manejo</div>
          <div class="meta-tags">
            <span class="meta-tag tag-sub sub-BU">${anterior.pm.BU.length} Bosques Urbanos</span>
            <span class="meta-tag tag-sub sub-BR">${anterior.pm.BR.length} Barrancas</span>
            <span class="meta-tag tag-sub sub-ZCE">${anterior.pm.ANPL.length} ANP Local</span>
          </div>
          <details class="meta-details">
            <summary>Ver PM publicados</summary>
            <ul class="meta-list">${listaPMAnt}</ul>
          </details>
        </div>
      </div>

      <div class="meta-breakdown">
        <div class="meta-card meta-current">
          <div class="meta-card-title">Decretos emitidos en administración actual</div>
          <ul class="meta-list">${listaActualDec}</ul>
        </div>
        <div class="meta-card meta-current">
          <div class="meta-card-title">Programas de Manejo publicados en administración actual</div>
          <ul class="meta-list">${listaActualPM}</ul>
        </div>
      </div>

      <div class="meta-ref">Referencia federal (CONANP, no contabilizable para meta local): ${decAntFed} decreto y ${pmAntFed} PM en 2018-2024 · ${decActFed} decreto y ${pmActFed} PM en 2024-2030.</div>
    </div>
  `;
}

function renderGroupDashboard(g){
  /* La coadministración no filtra por grupo: es un corte por convenio. */
  if(g.id === 'COADMIN'){
    const arr = DATA.filter(d=>isCoadmin(d.nombre));
    return resumenHTML(arr, 'ANP en coadministración · SEMARNAT–CONANP–CDMX 2025');
  }
  const arr = DATA.filter(d=>d.grupo===g.key);
  if(!arr.length) return resumenHTML(arr, g.label);
  const tipo = arr[0].tipo, jur = arr[0].jurisdiccion;
  return resumenHTML(arr, `${g.label} · ${tipo} ${jur}`);
}

function legalList(items, variant=''){
  const cls = variant ? `legal-list legal-list-${variant}` : 'legal-list';
  return `<div class="${cls}"><ul>${items.map(i=>`<li><span class="lbl">${i.lbl}</span><span class="ref">${i.ref}</span></li>`).join('')}</ul></div>`;
}
function renderLegalDashboard(){
  const defCards = LEGAL.definiciones.map(d=>`
    <div class="legal-card">
      <span class="l-art">${d.ref}</span>
      <h4>${d.t}</h4>
      <p>${d.c}</p>
    </div>`).join('');
  return `
    <!-- ====================================================== -->
    <!-- 1. CONSTITUCIÓN POLÍTICA DE LA CDMX (CPCDMX) -->
    <!-- ====================================================== -->
    <div class="panel constitucion-block" style="border-left:3px solid var(--guinda)">
      <div class="panel-title" style="color:var(--guinda)">Marco constitucional · Norma suprema local</div>
      <div class="norma-header">
        <div class="norma-header-left">
          <h3>${LEGAL.constitucion.nombre}</h3>
          <p class="panel-intro" style="margin-top:8px">${LEGAL.constitucion.publicacion}. ${LEGAL.constitucion.ultimaReforma}.<br><b>${LEGAL.constitucion.articulo}</b></p>
        </div>
        <div class="norma-header-right">
          <a class="btn-pdf" href="${LEGAL.constitucion.urlLocal}" target="_blank" rel="noopener" download>
            <span class="pdf-badge">PDF</span>
              <span><b>${LEGAL.constitucion.abreviatura}</b></span>
              <span class="pdf-arrow">↓</span>
          </a>
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">CPCDMX · Artículo 16 A · Apartado A · Medio Ambiente</span>
        <div class="constitucion-grid">
          ${LEGAL.constitucion.parrafos.map(p=>`
            <div class="constitucion-card">
              <span class="l-art">${p.ref}</span>
              <h4>${p.t}</h4>
              <p>${p.c}</p>
            </div>`).join('')}
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">CPCDMX · Artículo 53 · Atribuciones de las Alcaldías</span>
        <h4 style="font-family:'Roboto',sans-serif;font-weight:700;font-size:var(--fs-lg);color:var(--ink);margin-bottom:8px;letter-spacing:-.01em">Apartado A · fracciones XXI–XXIV</h4>
        <ul style="list-style:none;padding:0;margin:10px 0 0 0">
          ${LEGAL.constitucion.atribucionesAlcaldias.map(a=>`
            <li style="padding:10px 0;border-bottom:1px dotted var(--line-soft);display:grid;grid-template-columns:78px 1fr;gap:14px;align-items:baseline;font-size:var(--fs-base);color:var(--ink-2);line-height:1.55">
              <span style="font-family:'Roboto Mono',monospace;font-size:var(--fs-xs);color:var(--guinda);font-weight:500;letter-spacing:.04em;white-space:nowrap">fr. ${a.fr}</span>
              <span>${a.lbl}</span>
            </li>`).join('')}
        </ul>
      </div>
    </div>

    <!-- ====================================================== -->
    <!-- 2. LEY AMBIENTAL DE LA CDMX (LACM) -->
    <!-- ====================================================== -->
    <div class="panel panel-accent-anp" style="border-left:3px solid var(--guinda)">
      <div class="panel-title">Instrumento rector · Norma reglamentaria local</div>
      <div class="norma-header">
        <div class="norma-header-left">
          <h3>${LEGAL.instrumento.nombre}</h3>
          <p class="panel-intro" style="margin-top:8px">${LEGAL.instrumento.publicacion}. <b>${LEGAL.instrumento.abroga}</b> ${LEGAL.instrumento.expedida}</p>
        </div>
        <div class="norma-header-right">
          <a class="btn-pdf" href="${LEGAL.instrumento.url}" target="_blank" rel="noopener" download>
            <span class="pdf-badge">PDF</span>
              <span><b>${LEGAL.instrumento.abreviatura}</b></span>
              <span class="pdf-arrow">↓</span>
          </a>
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Artículo 4° · Definiciones fundamentales</span>
        <h4 style="font-family:'Roboto',sans-serif;font-weight:700;font-size:var(--fs-lg);color:var(--ink);margin-bottom:14px;letter-spacing:-.01em">Glosario técnico-jurídico</h4>
        <div class="legal-grid">${defCards}</div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Capítulo IV · Áreas de Valor Ambiental (AVA)</span>
        <div class="legal-grid">
          <div class="panel panel-accent-ava" style="margin:0">
            <div class="panel-title">${LEGAL.categoriasAVA.ref}</div>
            <h3>${LEGAL.categoriasAVA.titulo}</h3>
            ${legalList(LEGAL.categoriasAVA.items)}
          </div>
          <div class="panel" style="margin:0">
            <div class="panel-title">${LEGAL.declaratoriaAVA.ref}</div>
            <h3>${LEGAL.declaratoriaAVA.titulo}</h3>
            ${legalList(LEGAL.declaratoriaAVA.items)}
          </div>
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Capítulo V · Áreas Naturales Protegidas locales (ANP)</span>
        <div class="legal-grid">
          <div class="panel panel-accent-anp" style="margin:0">
            <div class="panel-title">${LEGAL.categoriasANPLocal.ref}</div>
            <h3>${LEGAL.categoriasANPLocal.titulo}</h3>
            ${legalList(LEGAL.categoriasANPLocal.items)}
          </div>
          <div class="panel" style="margin:0">
            <div class="panel-title">${LEGAL.declaratoriaANP.ref}</div>
            <h3>${LEGAL.declaratoriaANP.titulo}</h3>
            ${legalList(LEGAL.declaratoriaANP.items)}
          </div>
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Capítulo VI · Áreas Comunitarias de Conservación Ecológica (ARCAS)</span>
        <div class="legal-grid">
          <div class="panel" style="margin:0;border-left:3px solid var(--verde)">
            <div class="panel-title" style="color:var(--verde)">${LEGAL.categoriasARCAS.ref}</div>
            <h3>${LEGAL.categoriasARCAS.titulo}</h3>
            <p class="panel-intro" style="margin-bottom:14px">Figura jurídica distinta a las ANP y AVA. Se establece por acuerdo de la Jefatura de Gobierno con ejidos y comunidades, manteniéndose como tal siempre que exista el consentimiento expresado en Asamblea. Su administración corresponde directamente al ejido o comunidad, sin modificar el régimen de propiedad.</p>
            ${legalList(LEGAL.categoriasARCAS.items)}
          </div>
          <div class="panel" style="margin:0">
            <div class="panel-title">${LEGAL.declaratoriaARCAS.ref}</div>
            <h3>${LEGAL.declaratoriaARCAS.titulo}</h3>
            ${legalList(LEGAL.declaratoriaARCAS.items)}
          </div>
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Programa de Manejo · Arts. 122 / 144 / 156</span>
        <div class="panel panel-compact" style="margin:0">
          <div class="panel-title">${LEGAL.programaManejo.ref}</div>
          <h3>${LEGAL.programaManejo.titulo}</h3>
          <p class="panel-intro" style="margin-bottom:0">El Programa de Manejo es el instrumento rector de planeación y regulación. Mientras no se expida, la Secretaría actuará conforme a la normativa aplicable y criterios emitidos mediante acuerdo administrativo. En ARCAS, el PM es elaborado por el propio ejido o comunidad y aprobado conjuntamente por la Secretaría y la Secretaría de Pueblos y Barrios Originarios y Comunidades Indígenas Residentes (Art. 157).</p>
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Prohibiciones aplicables · Arts. 123 (AVA) y 138 (ANP)</span>
        <div class="panel panel-compact" style="margin:0">
          <div class="panel-title">${LEGAL.prohibiciones.ref}</div>
          <h3>${LEGAL.prohibiciones.titulo}</h3>
          ${legalList(LEGAL.prohibiciones.items, 'cols-2')}
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Sistema Local de ANP</span>
        <div class="panel panel-compact" style="margin:0">
          <div class="panel-title">${LEGAL.sistema.ref}</div>
          <h3>${LEGAL.sistema.titulo}</h3>
          ${legalList(LEGAL.sistema.items, 'compact')}
        </div>
      </div>

      <div class="norma-subsec">
        <span class="norma-subsec-title">LACM · Gobernanza · Participación social y atribuciones</span>
        <div class="legal-grid">
          <div class="panel" style="margin:0">
            <div class="panel-title">Arts. 124, 125, 151, 152</div>
            <h3>Órganos de <em>participación</em></h3>
            ${legalList(LEGAL.participacion)}
          </div>
          <div class="panel" style="margin:0">
            <div class="panel-title">Arts. 6, 7, 8</div>
            <h3>Atribuciones <em>institucionales</em></h3>
            ${legalList(LEGAL.atribuciones)}
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================== -->
    <!-- 3. ANP DE COMPETENCIA FEDERAL (LGEEPA + Convenio) -->
    <!-- ====================================================== -->
    <div class="panel" style="border-left:3px solid var(--azul)">
      <div class="panel-title" style="color:var(--azul)">Áreas Naturales Protegidas de competencia federal</div>
      <h3>Marco normativo <em>federal</em> aplicable en CDMX</h3>
      <p class="panel-intro" style="margin-bottom:18px">Las ANP de competencia federal ubicadas dentro del territorio de la Ciudad de México se rigen por la <b>LGEEPA</b> y son administradas por la <b>CONANP</b> (Comisión Nacional de Áreas Naturales Protegidas). La Ciudad de México coadyuva en su administración mediante el Convenio Marco vigente.</p>

      <!-- 3.1 LGEEPA -->
      <div class="anp-fed-card">
        <div class="panel-title" style="color:var(--azul);margin-bottom:6px">Instrumento concurrente · Norma reglamentaria federal</div>
        <div class="norma-header">
          <div class="norma-header-left">
            <h4 style="font-family:'Roboto',sans-serif;font-size:var(--fs-xl);font-weight:700;color:var(--ink);margin:0 0 8px;letter-spacing:-.01em">${LEGAL.instrumentoFederal.nombre}</h4>
            <p style="color:var(--ink-2);font-size:var(--fs-base);line-height:1.6;margin:0"><b>${LEGAL.instrumentoFederal.abreviatura}</b>. ${LEGAL.instrumentoFederal.publicacion}. ${LEGAL.instrumentoFederal.ultimaReforma}. ${LEGAL.instrumentoFederal.alcance}</p>
          </div>
          <div class="norma-header-right">
            <a class="btn-pdf btn-pdf-federal" href="${LEGAL.instrumentoFederal.url}" target="_blank" rel="noopener" download>
              <span class="pdf-badge">PDF</span>
              <span><b>${LEGAL.instrumentoFederal.abreviatura}</b></span>
              <span class="pdf-arrow">↓</span>
            </a>
          </div>
        </div>

        <div class="norma-subsec" style="border-top-color:rgba(38,108,180,.15)">
          <span class="norma-subsec-title">LGEEPA · Artículo 46 · Sección II · Categorías de ANP federales</span>
          <p class="panel-intro" style="margin-bottom:10px">${LEGAL.categoriasANPFederal.intro}</p>
          <ul class="fracciones-list">
            ${LEGAL.categoriasANPFederal.fracciones.filter(f=>f.jur==='federal').map(f=>`
              <li class="fr-item">
                <span class="fr-num">fr. ${f.fr}</span>
                <div class="fr-body">
                  <span class="fr-lbl">${f.lbl}</span>
                  <span class="fr-desc">${f.c}</span>
                </div>
              </li>`).join('')}
          </ul>
        </div>
      </div>

      <!-- 3.2 Convenio Marco -->
      <div class="anp-fed-card" style="margin-top:18px">
        <div class="panel-title" style="color:var(--azul);margin-bottom:6px">Coordinación interinstitucional · Federal–Local</div>
        <div class="norma-header">
          <div class="norma-header-left">
            <h4 style="font-family:'Roboto',sans-serif;font-size:var(--fs-xl);font-weight:700;color:var(--ink);margin:0 0 8px;letter-spacing:-.01em">Convenio Marco SEMARNAT–CONANP–CDMX 2025</h4>
            <p style="color:var(--ink-2);font-size:var(--fs-base);line-height:1.6;margin:0">Suscrito el <b>10 de marzo de 2025</b> entre el Ejecutivo Federal, a través de la <b>SEMARNAT</b> (Secretaría de Medio Ambiente y Recursos Naturales) por conducto de la CONANP, y el Gobierno de la Ciudad de México, a través de la SEDEMA. <b>Vigencia hasta el 30 de septiembre de 2030</b>.</p>
          </div>
          <div class="norma-header-right">
            <a class="btn-pdf btn-pdf-federal" href="data/normativa/CONVENIO_SEMARNAT-CONANP-CDMX_2025.pdf" download>
              <span class="pdf-badge">PDF</span>
              <span><b>Convenio Marco</b></span>
              <span class="pdf-arrow">↓</span>
            </a>
          </div>
        </div>

        <div class="norma-subsec" style="border-top-color:rgba(38,108,180,.15)">
          <span class="norma-subsec-title">Convenio Marco · Cláusulas Primera y Segunda</span>
          <div class="convenio-meta">
            <div class="convenio-meta-item">
              <span class="l-art">Cláusula Primera · Objeto</span>
              <p>Establecer las bases y mecanismos generales para colaborar de manera conjunta en acciones que contribuyan a fortalecer la <b>conservación, protección, restauración, vigilancia y desarrollo sustentable</b> de las Áreas Naturales Protegidas de competencia federal ubicadas en el territorio de la Ciudad de México, así como la salvaguarda de los <b>Humedales de Importancia Internacional</b> (Sitio Ramsar Sistema Lacustre Ejidos de Xochimilco y San Gregorio Atlapulco).</p>
            </div>
            <div class="convenio-meta-item">
              <span class="l-art">Cláusula Segunda · Coadyuvancia</span>
              <p><b>Administración:</b> ejecución de actividades orientadas al cumplimiento de los objetivos de conservación mediante el manejo, gestión y uso racional de recursos humanos, materiales y financieros.<br><br><b>Manejo:</b> conjunto de políticas, estrategias, programas y regulaciones para determinar las actividades de conservación, protección, aprovechamiento sustentable, investigación, restauración y educación ambiental.</p>
            </div>
          </div>
        </div>

        <div class="norma-subsec" style="border-top-color:rgba(38,108,180,.15)">
          <span class="norma-subsec-title">Convenio Marco · Áreas en coadministración</span>
          <p style="color:var(--muted);font-size:var(--fs-base);margin:0 0 12px">Ocho ANP de competencia federal ubicadas dentro de la circunscripción territorial de la Ciudad de México.</p>
          <div class="comp-scroll">
            <table class="comp convenio-table">
              <thead>
                <tr>
                  <th scope="col" style="width:36px;text-align:center">No.</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Decreto · Publicación DOF</th>
                  <th scope="col" style="text-align:right">Superficie (ha)</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style="text-align:center">1</td><td><b>Desierto de los Leones</b></td><td>27 de noviembre de 1917</td><td style="text-align:right">1,529.00</td></tr>
                <tr><td style="text-align:center">2</td><td><b>Cumbres del Ajusco</b></td><td>23 de septiembre de 1936</td><td style="text-align:right">920.00</td></tr>
                <tr><td style="text-align:center">3</td><td><b>Fuentes Brotantes de Tlalpan</b></td><td>28 de septiembre de 1936</td><td style="text-align:right">129.00</td></tr>
                <tr><td style="text-align:center">4</td><td><b>Insurgentes Miguel Hidalgo y Costilla</b></td><td>18 de septiembre de 1936</td><td style="text-align:right">1,889.96</td></tr>
                <tr><td style="text-align:center">5</td><td><b>El Tepeyac</b></td><td>18 de febrero de 1937</td><td style="text-align:right">1,500.00</td></tr>
                <tr><td style="text-align:center">6</td><td><b>Lomas de Padierna</b></td><td>22 de abril de 1938</td><td style="text-align:right">1,161.21</td></tr>
                <tr><td style="text-align:center">7</td><td><b>Cerro de la Estrella</b></td><td>24 de agosto de 1938</td><td style="text-align:right">1,183.33</td></tr>
                <tr><td style="text-align:center">8</td><td><b>Tláhuac–Xico</b></td><td>8 de enero de 2024</td><td style="text-align:right">3,545.40</td></tr>
                <tr style="background:var(--bg-2);font-weight:600">
                  <td colspan="3" style="text-align:right;padding-right:14px">Superficie total acumulada</td>
                  <td style="text-align:right">11,857.90 ha</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="norma-subsec" style="border-top-color:rgba(38,108,180,.15)">
          <span class="norma-subsec-title">Convenio Marco · Cláusula Tercera · Acciones de coordinación</span>
          <div class="legal-grid-3">
            <div class="legal-card-mini">
              <span class="l-art">a–c</span>
              <p><b>Conservación y mantenimiento</b><br>Proyectos de preservación, vigilancia, saneamiento y restauración de ecosistemas; mantenimiento de infraestructura; participación en formulación de Programas de Manejo.</p>
            </div>
            <div class="legal-card-mini">
              <span class="l-art">d–f</span>
              <p><b>Humedales y biodiversidad</b><br>Proyectos para la conservación de humedales y régimen hidrológico; asesoría técnica al Sistema Local de ANP; salvaguarda de diversidad genética de especies endémicas, amenazadas y en peligro.</p>
            </div>
            <div class="legal-card-mini">
              <span class="l-art">g–i</span>
              <p><b>Cambio climático y uso racional</b><br>Estrategias de mitigación y adaptación; turismo de naturaleza de bajo impacto; ordenamiento de actividades agrícolas, ganaderas y prácticas de agrosilvopastoreo.</p>
            </div>
            <div class="legal-card-mini">
              <span class="l-art">j–l</span>
              <p><b>Reducción de presiones</b><br>Reducción de agroquímicos; manejo de residuos sólidos; control de descargas residuales; cultura para la conservación; participación social en proyectos de cambio climático.</p>
            </div>
            <div class="legal-card-mini">
              <span class="l-art">m–o</span>
              <p><b>Educación y contingencias</b><br>Programas de educación y capacitación ambiental; acciones ante siniestros o fenómenos naturales; estrategias de coordinación con autoridades de seguridad ciudadana federal y local.</p>
            </div>
            <div class="legal-card-mini">
              <span class="l-art">p–s</span>
              <p><b>Justicia y financiamiento</b><br>Prevención de delitos ambientales y vigilancia; reintroducción y liberación de especies; participación de sectores social, privado y académico; captación de donaciones; mecanismos de financiamiento.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================== -->
    <!-- 4. NOTA DE CONSULTA -->
    <!-- ====================================================== -->
    <div class="panel" style="border-left:3px solid var(--legal)">
      <div class="panel-title" style="color:var(--legal)">Nota de consulta</div>
      <p style="color:var(--ink-2);font-size:var(--fs-base);line-height:1.65;margin:0;max-width:900px">Este módulo tiene fines de consulta operativa. La jerarquía normativa aplicable en orden descendente es: (1) <b>Constitución Política de la Ciudad de México</b> — Art. 16 A; (2) <b>Ley Ambiental de la Ciudad de México</b> — publicada en la GOCDMX el 18 de julio de 2024 (que abroga la Ley Ambiental de Protección a la Tierra en la Ciudad de México); (3) decretos específicos de declaratoria de cada área; y (4) programas de manejo respectivos. En ANP de jurisdicción federal aplica la <b>LGEEPA</b> y su Reglamento en materia de ANP.</p>
    </div>
  `;
}

/* ===== Table ===== */
/* Una regla por filtro, en un solo lugar. filter() las aplica todas;
   populateFilters() aplica todas MENOS una para saber qué opciones siguen
   teniendo sentido en ese desplegable. Tenerlas escritas dos veces era la
   manera seguro de que se separaran. */
const PRUEBA_FILTRO = {
  fTipo: d => !state.fTipo || d.tipo === state.fTipo,
  fJur:  d => !state.fJur  || d.jurisdiccion === state.fJur,
  fCat:  d => !state.fCat  || d.categoria === state.fCat,
  fAlc:  d => !state.fAlc  || normText(d.alcaldia).includes(normText(state.fAlc)),
  fPM:   d => !state.fPM   || d.programa_manejo === state.fPM,
  /* Lee el mismo estado que pinta la tabla: si el Sheet trae el porcentaje,
     «Parcial» es un valor filtrable; si no, sigue siendo Sí/No. */
  fSC:   d => !state.fSC   || scEstado(d) === state.fSC,
  fDG:   d => !state.fDG   || (state.fDG === '__sin__'
                                 ? !(d.dg_responsable || '')
                                 : (d.dg_responsable || '') === state.fDG)
};
const CLAVES_FILTRO = Object.keys(PRUEBA_FILTRO);
/* Filas que pasan todos los filtros menos el que se indique. Es la base de los
   desplegables dependientes: con Tipo = ANP, «Subcategoría» solo debe ofrecer
   subcategorías de ANP. */
const filasSalvo = (excluir) => {
  const base = currentData();
  return base.filter(d => CLAVES_FILTRO.every(k => k === excluir || PRUEBA_FILTRO[k](d)));
};

function filter(){
  const q = normText(state.q);
  return currentData().filter(d=>{
    if(!CLAVES_FILTRO.every(k => PRUEBA_FILTRO[k](d))) return false;
    // Búsqueda exclusivamente por nombre (insensible a acentos)
    if(q && !normText(d.nombre).includes(q)) return false;
    return true;
  });
}
function sortRows(rows){
  const k=state.sortKey,dir=state.sortDir;
  return [...rows].sort((a,b)=>{
    let va=a[k],vb=b[k];
    if(k==='superficie'){va=+va;vb=+vb;}
    if(va===null||va===undefined||va===''){ return 1; } if(vb===null||vb===undefined||vb===''){ return -1; }
    if(typeof va==='number') return (va-vb)*dir;
    return va.localeCompare(vb,'es')*dir;
  });
}
function render(){
  if(isSpecialTab(state.tab)) return;
  const base = currentData();
  const rows = sortRows(filter());
  const tb = document.getElementById('tb');
  if(!rows.length){
    tb.innerHTML = INVENTARIO_ERROR
      ? `<tr><td colspan="11" class="empty">No se pudo cargar el inventario.<br>${esc(INVENTARIO_ERROR)}</td></tr>`
      : `<tr><td colspan="11" class="empty">Sin resultados para los filtros actuales.</td></tr>`;
  } else {
    tb.innerHTML = rows.map(d=>`
      <tr ${d._arcacNo!=null ? `data-no="${d._arcacNo}" data-ten="${d.categoria==='Ejido'?'ejido':'comunidad'}"` : `data-i="${DATA.indexOf(d)}"`} data-g="${GRUPO_CLS[d.grupo]||'arcac'}">
        <td class="name">${d.nombre}<span class="name-sub">${
          /* Segunda línea en celular: tipo, subcategoría y alcaldía —lo que
             identifica el territorio—. Año de decreto y DG quedan en la ficha:
             con ellos la fila crecía a tres renglones. ARCAC omite la tenencia
             porque ahí es columna propia. */
          [d.tipo, d._arcacNo!=null ? '' : subShort(d.categoria), d.alcaldia]
            .filter(v=>v && v!=='—').join(' · ')
        }</span></td>
        <td><span class="tag tag-${d.tipo}">${d.tipo}</span></td>
        <td><span class="tag tag-jur-${d.jurisdiccion}">${d.jurisdiccion}</span></td>
        <td><span class="tag-sub sub-${subCode(d.categoria)}" title="${d.categoria}">${subShort(d.categoria)}</span></td>
        <td class="cell-alcaldia">${d.alcaldia}</td>
        <td class="date" style="text-align:right" title="${d.fecha_decreto||''}">${anioDecreto(d)}</td>
        <td class="num" title="${fmt(d.superficie)} ha">${fmtSup(d.superficie)}</td>
        <td><span class="status-tag ${d.programa_manejo==='Sí'?'status-tag-si':'status-tag-no'}">${d.programa_manejo}</span></td>
        <td class="date" style="text-align:right;${d.fecha_pm?'':'color:var(--muted);font-style:italic'}">${d.fecha_pm || '—'}</td>
        <td>${(()=>{ const e = scEstado(d), p = scPct(d);
          /* El punto basta para dentro/fuera. En «parcial» el punto miente por
             omisión —95.96% y 1.29% se ven igual—, así que ahí sí se imprime la
             cifra: en celular no hay tooltip que la rescate. */
          const pin = `<span class="status-tag status-sc ${SC_CLS[e]}" title="${scTexto(d)}">${SC_CORTO(d)}</span>`;
          /* La cifra acompaña a todo lo que tiene algo dentro —«dentro» y
             «parcial»—: un punto lleno no distingue 100% de 99.5%, y quien
             consulta Suelo de Conservación necesita el dato, no el matiz.
             En «fuera» se omite: un 0% en 42 renglones es ruido. */
          return (p !== null && p >= 0.5)
            ? pin + `<span class="sc-pct" title="${scTexto(d)}">${p >= 99.5 ? 100 : Math.round(p)}%</span>`
            : pin;
        })()}</td>
        <td>${d.dg_responsable ? `<span class="tag-dg tag-dg-${d.dg_responsable.toLowerCase()}" title="${d.dg_responsable === 'DGSANPAVA' ? 'Dirección General del Sistema de Áreas Naturales Protegidas y Áreas de Valor Ambiental' : 'Dirección General de la Comisión de Recursos Naturales y Desarrollo Rural'}">${d.dg_responsable}</span>` : '<span class="dg-empty">—</span>'}</td>
      </tr>`).join('');
  }
  /* Mientras se sirva la copia local, el aviso vive en pantalla —no en un
     toast que se va—: quien consulte tiene derecho a saber que no está viendo
     el dato vivo antes de citarlo en un oficio. */
  try{ _pintarAlertasInventario(); }catch(_){}
  if(INVENTARIO_RESPALDO){
    const cr = document.querySelector('.counter-row');
    if(cr && !document.getElementById('avisoRespaldo')){
      const a = document.createElement('span');
      a.id = 'avisoRespaldo'; a.className = 'aviso-respaldo';
      a.textContent = 'Copia local · el inventario en vivo no respondió';
      cr.appendChild(a);
    }
  }
  document.getElementById('showCount').textContent = fmtInt(rows.length);
  document.getElementById('totalCount').textContent = fmtInt(base.length);
  document.getElementById('sumFiltered').textContent = fmt(sum(rows,'superficie'));
  document.querySelectorAll('thead.t-head th').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    const a=th.querySelector('.arrow'); if(a) a.textContent='▲';
    if(th.dataset.k===state.sortKey){
      th.classList.add(state.sortDir===1?'sort-asc':'sort-desc');
      if(a) a.textContent = state.sortDir===1?'▲':'▼';
    }
  });
  const thActive = document.querySelector(`thead.t-head th[data-k="${state.sortKey}"]`);
  document.getElementById('sortInfo').textContent = `Orden · ${thActive?thActive.textContent.replace(/[▲▼]/g,'').trim():''} ${state.sortDir===1?'↑':'↓'}`;
}

document.querySelectorAll('thead.t-head th').forEach(th=>{
  th.addEventListener('click',()=>{
    const k=th.dataset.k;
    if(state.sortKey===k) state.sortDir*=-1; else { state.sortKey=k; state.sortDir=1; }
    render();
  });
});
document.getElementById('q').addEventListener('input',e=>{ state.q=e.target.value; render(); });
/* Cada cambio repuebla los desplegables antes de repintar: son dependientes
   entre sí —elegir Tipo = ANP deja «Subcategoría» solo con subcategorías de
   ANP— y eso se recalcula en populateFilters(). Sin esta llamada, las opciones
   se quedaban congeladas en las del grupo. */
['fJur','fCat','fAlc','fPM','fTipo','fSC','fDG'].forEach(id=>{
  const e = document.getElementById(id); if(!e) return;
  e.addEventListener('change', ev=>{ state[id] = ev.target.value; populateFilters(); render(); });
});
/* «Mas filtros»: los cinco filtros de uso ocasional viven plegados y el boton
   lleva el conteo de cuantos estan activos, para que nadie los pierda de vista. */
function sincronizarMasFiltros(){
  const cont = document.getElementById('filtrosAvanzados');
  const btn  = document.getElementById('btnMasFiltros');
  const num  = document.getElementById('masFiltrosN');
  if(!cont || !btn || !num) return;
  const activos = ['fTipo','fJur','fCat','fSC','fDG']
    .filter(id=>{
      const e = document.getElementById(id);
      if(!e || !e.value) return false;
      const lab = e.closest('label');
      return !lab || lab.style.display !== 'none';   // un filtro oculto no cuenta
    }).length;
  num.textContent = activos;
  num.hidden = activos === 0;
  /* Un filtro activo escondido es una trampa: si lo hay, el panel se abre solo. */
  if(activos && cont.hidden){ cont.hidden = false; btn.setAttribute('aria-expanded','true'); }
}
(function(){
  const btn = document.getElementById('btnMasFiltros');
  const cont = document.getElementById('filtrosAvanzados');
  if(btn && cont) btn.addEventListener('click',()=>{
    cont.hidden = !cont.hidden;
    btn.setAttribute('aria-expanded', cont.hidden ? 'false' : 'true');
  });
  ['fTipo','fJur','fCat','fSC','fDG'].forEach(id=>{
    const e = document.getElementById(id);
    if(e) e.addEventListener('change', sincronizarMasFiltros);
  });
})();

document.getElementById('btnReset').addEventListener('click',()=>{
  state.q=''; state.fJur=''; state.fCat=''; state.fAlc=''; state.fPM=''; state.fTipo=''; state.fSC=''; state.fDG='';
  ['q','fJur','fCat','fAlc','fPM','fTipo','fSC','fDG'].forEach(id=>document.getElementById(id).value='');
  sincronizarMasFiltros();
  render();
});

/* ============================================================
 * Renderiza el bloque de Documentos Oficiales en la ficha técnica.
 * Muestra hasta 4 enlaces (PDF + Gaceta para Decreto y para PM).
 * Solo aparece la sección si hay AL MENOS UNA URL definida.
 * ============================================================ */
function renderDocumentosOficiales(d){
  // Recolectar enlaces disponibles agrupados por instrumento
  const decretoLinks = [];
  if(d.url_pdf_decreto)    decretoLinks.push({ url: d.url_pdf_decreto,    tipo: 'pdf',    label: 'PDF del decreto' });
  if(d.url_gaceta_decreto) decretoLinks.push({ url: d.url_gaceta_decreto, tipo: 'gaceta', label: 'Gaceta Oficial · decreto' });

  const pmLinks = [];
  if(d.url_pdf_pm)    pmLinks.push({ url: d.url_pdf_pm,    tipo: 'pdf',    label: 'PDF del Programa de Manejo' });
  if(d.url_gaceta_pm) pmLinks.push({ url: d.url_gaceta_pm, tipo: 'gaceta', label: 'Gaceta Oficial · Programa de Manejo' });

  // Si no hay ningún enlace, no mostrar nada
  if(decretoLinks.length === 0 && pmLinks.length === 0) return '';

  const renderBtn = (link) => {
    const icono = link.tipo === 'pdf'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/></svg>';
    return `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" class="doc-link doc-link-${link.tipo}" title="Abrir en nueva pestaña: ${esc(link.label)}">
      ${icono}
      <span class="doc-link-label">${esc(link.label)}</span>
      <svg class="doc-link-ext" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    </a>`;
  };

  const decretoBlock = decretoLinks.length > 0 ? `
    <div class="doc-group">
      <div class="doc-group-title">Decreto de creación</div>
      <div class="doc-group-links">${decretoLinks.map(renderBtn).join('')}</div>
    </div>
  ` : '';

  const pmBlock = pmLinks.length > 0 ? `
    <div class="doc-group">
      <div class="doc-group-title">Programa de Manejo</div>
      <div class="doc-group-links">${pmLinks.map(renderBtn).join('')}</div>
    </div>
  ` : '';

  return `
    <div class="documentos-oficiales">
      <div class="documentos-oficiales-title">📑 Documentos oficiales</div>
      ${decretoBlock}
      ${pmBlock}
    </div>
  `;
}

function getLegalContext(d){
  const parts = [];
  if(d.tipo==='AVA'){
    parts.push({t:"Definición AVA", ref:"Art. 4° fr. VI LACM", p:"Todos los bosques urbanos, barrancas y cuerpos de agua dentro del territorio y bajo las competencias de la Ciudad de México, en donde los ambientes originales han sido modificados por actividades antropogénicas y que requieren ser restauradas o preservadas, en función de que aún mantienen ciertas características biofísicas y escénicas."});
    if(d.categoria==='Bosque Urbano'){
      parts.push({t:"Bosques Urbanos", ref:"Art. 117 LACM", p:"AVA localizadas en suelo urbano con predominio de flora arbórea y arbustiva y vida silvestre asociada; valor ambiental, estético, científico, educativo, recreativo, histórico o turístico."});
      parts.push({t:"Gobernanza", ref:"Art. 124 LACM", p:"Consejo Rector Ciudadano de 7 a 14 integrantes, designados por la Secretaría por 4 años (ratificables 2 adicionales); órgano de asesoría sobre programas, proyectos, Programa de Manejo y autorizaciones."});
    }
    if(d.categoria==='Barranca'){
      parts.push({t:"Barrancas", ref:"Arts. 4° fr. XI, 120 LACM", p:"Depresiones geográficas que sirven de refugio de vida silvestre, cauce de escurrimientos naturales y precipitaciones pluviales, y constituyen zonas importantes del ciclo hidrológico y biogeoquímico. Su Programa de Manejo regula actividades garantizando restauración y preservación de características biofísicas y escénicas que contribuyen al balance hídrico."});
      parts.push({t:"Gobernanza", ref:"Art. 125 LACM", p:"Consejo Intersectorial (máx. 7 integrantes del sector gobierno + academia + sector empresarial + sector social) que gestiona y articula diseño y ejecución del Programa de Manejo."});
    }
    parts.push({t:"Prohibiciones adicionales", ref:"Art. 123 LACM", p:"Además de las prohibiciones aplicables a ANP (Art. 138), en AVA se prohíbe el aprovechamiento o extracción de recursos naturales."});
  } else if(d.tipo==='ANP' && d.jurisdiccion==='Local'){
    parts.push({t:"Definición ANP", ref:"Art. 4° fr. VII LACM", p:"Zonas del territorio sobre las que la Ciudad de México ejerce su soberanía y jurisdicción, en donde los ambientes originales no han sido significativamente alterados por la actividad del ser humano o que requieren ser preservadas y restauradas."});
    const catArt = {
      "Zona de Conservación Ecológica":"Art. 128 LACM — Muestras representativas de uno o más ecosistemas en buen estado de preservación; destinada a proteger biodiversidad, elementos naturales y procesos ecológicos, provisión de servicios ambientales y bienestar social.",
      "Zona de Protección Hidrológica y Ecológica":"Art. 129 LACM — Protección, preservación y restauración de cuencas hidrológicas, acuíferos y sus zonas de recarga, así como fauna, flora, suelo, subsuelo y servicios ambientales asociados.",
      "Zona Ecológica y Cultural":"Art. 130 LACM — Importantes valores ambientales y ecológicos con elementos físicos, históricos, arqueológicos o sujetos a usos y costumbres de importancia cultural.",
      "Refugio de Vida Silvestre":"Art. 131 LACM — Hábitat natural de especies de fauna y flora que se encuentran en alguna categoría de protección especial o presentan una distribución restringida.",
      "Zona de Protección Especial":"Art. 132 LACM — Localizadas en suelo de conservación con escasa vegetación natural, inducida o fuertemente modificada; por extensión o características no caben en otras categorías de ANP.",
      "Reserva Ecológica Comunitaria":"Art. 133 LACM — Establecidas por pueblos, comunidades y ejidos en terrenos de su propiedad; no se modifica el régimen de propiedad. Pueden constituirse en núcleos agrarios o en propiedad privada.",
      "Zona Sujeta a Conservación Ecológica":"Art. 134 LACM — Circunvecinas a asentamientos humanos; ecosistemas en buen estado destinados a preservar biodiversidad, elementos naturales indispensables al equilibrio ecológico y servicios ambientales."
    };
    if(catArt[d.categoria]){
      const split = catArt[d.categoria].split(' — ');
      parts.push({t:d.categoria, ref:split[0], p:split[1]});
    }
    parts.push({t:"Gobernanza", ref:"Art. 151 LACM", p:"Consejo Asesor con representantes de la Secretaría, entidades del GCDMX, Alcaldías, academia, sector social, sector empresarial, ejidos y comunidades, propietarios y poseedores. Órgano de consulta y apoyo para formulación, ejecución, seguimiento y evaluación de la política del área."});
    parts.push({t:"Prohibiciones", ref:"Art. 138 LACM", p:"Quedan prohibidos: asentamientos humanos irregulares o expansión de regulares; actividades que afecten la biodiversidad; actividades riesgosas; emisiones contaminantes; extracción de suelo/subsuelo no científica; afectación al sistema hidrológico; caza y explotación ilícita; introducción de especies exóticas, invasoras y ferales."});
  } else if(d.tipo==='ANP' && d.jurisdiccion==='Federal'){
    parts.push({t:"Marco federal", ref:"LGEEPA · Arts. 44-47 BIS", p:"Competencia de la Federación; administración por CONANP. El Gobierno de la Ciudad de México podrá administrarlas en términos del Art. 136 LACM."});
    if(d.categoria==='Parque Nacional'){
      parts.push({t:"Parque Nacional", ref:"LGEEPA Art. 50", p:"Representaciones biogeográficas a nivel nacional de uno o más ecosistemas; valor científico, educativo, recreativo o histórico; belleza escénica o flora/fauna de relevancia."});
    }
    if(d.categoria==='Área de Protección de Recursos Naturales'){
      parts.push({t:"APRN", ref:"LGEEPA Art. 53", p:"Preservación y protección del suelo, cuencas hidrográficas, aguas y recursos forestales."});
    }
  }
  return parts;
}

/* ===== Cartografía · GeoJSON de polígonos ===== */
/* GEOMETRIES se llena cargando ./geometrias.geojson en runtime.
   Cada feature debe tener: properties.id_match (slug que coincide con DATA.id) o properties.nombre.
   El nombre debe ser idéntico al campo "nombre" del inventario para que el matching funcione. */
let GEOMETRIES = null;
let GEOM_INDEX = {};

function slugify(s){
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

/* GeoJSON embebido directamente en el HTML — funciona con file:// (doble clic), http:// y https:// sin restricciones de CORS */
// GEOMETRIES_EMBEDDED se carga ahora desde data/geometrias.geojson (lazy)
let _GEOM_PROMISE = null;
function loadGeometriesData(){
  if(!_GEOM_PROMISE){
    _GEOM_PROMISE = fetch('data/geometrias.geojson')
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .catch(err => {
        console.error('[Geometrías] Error al cargar:', err);
        return { type:'FeatureCollection', features:[] };
      });
  }
  return _GEOM_PROMISE;
}

async function loadGeometries(){
  if(GEOMETRIES) return GEOMETRIES;
  try {
    const [g, a] = await Promise.all([loadGeometriesData(), loadAlcaldiasData()]);
    GEOMETRIES = g;
    ALCALDIAS_EMBEDDED = a;
    if(GEOMETRIES.features) {
      GEOM_INDEX = {};
      GEOMETRIES.features.forEach(f => {
        const p = f.properties||{};
        if(p.nombre) GEOM_INDEX[slugify(p.nombre)] = f;
        if(p.id_match) GEOM_INDEX[p.id_match] = f;
      });
      /* Con las geometrías ya en memoria se puede comprobar el cruce por
         nombre; en el arranque todavía no estaban. */
      try{ verificarInventario('geometrias'); }catch(_){}
    }
  } catch(err) {
    console.error('[Dashboard] Error cargando geometrías:', err);
    GEOMETRIES = { type:'FeatureCollection', features:[] };
  }
  return GEOMETRIES;
}

/* GeoJSON de alcaldías embebido — capa de contexto territorial sobre los mapas */
// ALCALDIAS_EMBEDDED se carga ahora desde data/alcaldias.geojson (lazy)
let _ALC_PROMISE = null;
function loadAlcaldiasData(){
  if(!_ALC_PROMISE){
    _ALC_PROMISE = fetch('data/alcaldias.geojson')
      .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .catch(err => {
        console.error('[Alcaldías] Error al cargar:', err);
        return { type:'FeatureCollection', features:[] };
      });
  }
  return _ALC_PROMISE;
}
let ALCALDIAS_EMBEDDED = { type:'FeatureCollection', features:[] };

/* Colores institucionales por grupo para el mapa global */
/* Colores semánticos que viven en JS porque los consumen Leaflet y Canvas,
   donde var(--token) no se resuelve. Una sola fuente de verdad por concepto:
   antes había 3 azules casi idénticos y 4 grises sin relación entre sí. */
const COL_GRIS_NEUTRO = '#8a8d8f';  /* sin protección · fuera de ámbito */

/* Resuelve `var(--x)` a un color literal.
   Canvas NO entiende variables CSS: al asignar un valor que no sabe parsear a
   `fillStyle` lo ignora en silencio y conserva el anterior. Como el primer
   relleno de la tarjeta compartible es el fondo crema, todo lo que venía
   después con un `var(...)` —el filete, el badge de categoría, la cifra de
   superficie y el polígono— se dibujaba crema sobre crema: invisible.
   GROUP_COLORS pasó a variables CSS en el rediseño de v38 y ahí se rompió. */
function colorLiteral(c){
  const s = String(c == null ? '' : c).trim();
  const m = s.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)$/);
  if(!m) return s || '#2a2a2a';
  let v = '';
  try{ v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim(); }catch(e){}
  if(v) return v;
  return m[2] ? colorLiteral(m[2]) : '#2a2a2a';   /* respeta el valor de reserva */
}
const COL_AZUL_UBIC   = '#1971c2';  /* ubicación del usuario · GPS */
const COL_AZUL_EMB    = '#1864ab';  /* embarcaderos */

/* Lectura del traslape con Suelo de Conservación · fuente única.
   El Sheet ya no trae Sí/No: trae el porcentaje y nada más. Aquí —y solo
   aquí— se convierte en las cuatro etiquetas que usan tabla, ficha, filtro y
   tarjeta compartible. «Parcial» es el caso que el binario no sabía decir:
   entre 0.5% y 99.5% el área está dentro *en parte*, y hoy ocho áreas del
   inventario caen ahí. Los cortes son los del cruce geométrico de agosto.
   Los núcleos ARCAC no tienen este dato: caen en «sindato», no en «fuera». */
const scPct = d => (d && typeof d.suelo_conservacion_pct === 'number') ? d.suelo_conservacion_pct : null;
const scEstado = d => {
  const p = scPct(d);
  if(p === null) return 'sindato';
  if(p >= 99.5) return 'dentro';
  if(p < 0.5)   return 'fuera';
  return 'parcial';
};
const scTexto = d => {
  const p = scPct(d), e = scEstado(d);
  const pp = p === null ? '' : ` · ${p.toFixed(p < 10 ? 2 : 1)}% de su superficie`;
  if(e === 'dentro')  return 'Dentro del Suelo de Conservación' + (p !== null && p < 100 ? pp : '');
  if(e === 'parcial') return 'Parcialmente dentro' + pp;
  if(e === 'sindato') return 'Sin dato de Suelo de Conservación';
  return 'Fuera del Suelo de Conservación';
};
/* Clase del punto y etiqueta corta. Un solo mapa: si mañana se agrega un
   estado, se agrega aquí y lo heredan los cuatro puntos de render. */
const SC_CLS = { dentro:'status-tag-si', parcial:'status-tag-parcial',
                 fuera:'status-tag-no',  sindato:'status-tag-nd' };
const SC_CORTO = d => {
  const e = scEstado(d), p = scPct(d);
  if(e === 'dentro')  return 'Dentro';
  if(e === 'parcial') return 'Parcial · ' + p.toFixed(p < 10 ? 2 : 1) + '%';
  if(e === 'sindato') return 'Sin dato';
  return 'Fuera';
};

/* Clase corta del grupo · alimenta el filete lateral de cada fila. */
const GRUPO_CLS = {
  'AVA · Bosque Urbano':'bu', 'AVA · Barranca':'br',
  'ANP · Local':'anpl',       'ANP · Federal':'anpf'
};

const GROUP_COLORS = {
  'AVA · Bosque Urbano': 'var(--verde)',
  'AVA · Barranca':       'var(--marron)',
  'ANP · Local':          'var(--anpl)',
  'ANP · Federal':        'var(--azul)'
};
/* Variantes para TEXTO pequeño sobre fondo claro: el naranja de ANP Local
   (2.65:1) y el marrón de Barranca (4.2:1) no alcanzan AA como texto; como
   relleno de polígono o filete sí. Auditoría 360, 12-sep-2026. */
const GROUP_TEXT_COLORS = {
  'AVA · Bosque Urbano': 'var(--bu-text)',
  'AVA · Barranca':       'var(--br-text)',
  'ANP · Local':          'var(--anpl-text)',
  'ANP · Federal':        'var(--anpf-text)'
};
const colorTextoGrupo = g => GROUP_TEXT_COLORS[g] || GROUP_COLORS[g] || 'var(--ink-2)';

/* ANP Federales en coadministración SEMARNAT–CONANP–CDMX (Convenio 2025) */
/* Nombres deben coincidir EXACTAMENTE con el campo `nombre` del GeoJSON y del Sheet. */
const COADMIN_AREAS = [
  'Desierto de los Leones',
  'Cumbres del Ajusco',
  'Fuentes Brotantes de Tlalpan',
  'Insurgente Miguel Hidalgo y Costilla',
  'El Tepeyac',
  'Lomas de Padierna',
  'Cerro de la Estrella (federal)',
  'Lago Tláhuac-Xico'
];
const COADMIN_SET = new Set(COADMIN_AREAS);
function isCoadmin(name){
  // Match EXACTO contra nombres canónicos del GeoJSON/Sheet.
  // Evita doble-match en áreas homónimas (ej. Cerro de la Estrella federal vs local).
  return !!name && COADMIN_SET.has(name);
}

/* Capa de alcaldías reutilizable */
function createAlcaldiasLayer(opts={}) {
  const defaults = {
    color: '#888', weight: 1, fillOpacity: 0.04, fillColor: '#888',
    dashArray: '3,4', interactive: false
  };
  return L.geoJSON(ALCALDIAS_EMBEDDED, {
    style: () => ({...defaults, ...opts}),
    onEachFeature: (feat, layer) => {
      if(opts.interactive !== false) {
        layer.bindTooltip(feat.properties.nombre, {sticky: true, direction:'top', className:'alc-tooltip'});
      }
    }
  });
}

/* ===== Pestaña MAPA GLOBAL ===== */
let globalMap = null;
let globalGroupLayers = {};
let globalAlcaldiasLayer = null;

function destroyGlobalMap(){
  if(globalMap){ globalMap.remove(); globalMap=null; globalGroupLayers={}; globalAlcaldiasLayer=null; }
}

/* `limpio` deja el mapa a solas: sin título y sin la fila de chips de capa.
   Es para «Ubicar», donde la pregunta es «¿qué me cubre aquí?» y no «¿qué capas
   quiero ver?»: las cuatro categorías van encendidas y no hay nada que elegir,
   así que los chips solo ocupaban el primer tercio de la pantalla en celular. */
function renderMapaPage(g, limpio){
  const isGlobal = !g || g.id === 'ALL';
  const labels = {
    'BU':'Bosques Urbanos','BR':'Barrancas',
    'ANPL':'ANP Locales','ANPF':'ANP Federales'
  };
  const groupLabel = isGlobal ? '' : (labels[g.id] || g.label);
  const total = isGlobal ? DATA.length : DATA.filter(d => d.grupo === g.key).length;

  let eyebrow, title, intro;
  if(isGlobal){
    // Conteo dinámico: número real de polígonos en GEOMETRIES (fallback al total del CSV mientras se carga)
    const polyCount = (GEOMETRIES && GEOMETRIES.features) ? GEOMETRIES.features.length : DATA.length;
    eyebrow = '';
    title = `Mapa · <em>${polyCount}</em> polígonos`;
    intro = '';
  } else if(g.id === 'COADMIN'){
    eyebrow = '';
    title = `Mapa · <em>En coadministración</em> · ${DATA.filter(d=>isCoadmin(d.nombre)).length} áreas`;
    intro = '';
  } else if(g.id === 'ARCAC'){
    eyebrow = '';
    title = `Mapa · <em>ARCAC</em> · ${DATA_ARCAC.length} núcleos agrarios`;
    intro = '';
  } else {
    eyebrow = '';
    title = `Mapa · <em>${groupLabel}</em> · ${total} ${total===1?'área':'áreas'}`;
    intro = '';
  }

  return `
    <div class="panel panel-compact panel-mapa" style="border-left:3px solid var(--guinda)">
      ${limpio ? '' : `
      ${eyebrow ? `<div class="panel-title" style="color:var(--guinda)">${eyebrow}</div>` : ''}
      <h3 class="mapa-h">${title}</h3>
      ${intro ? `<p class="panel-intro" style="margin-bottom:10px">${intro}</p>` : ''}`}

      <div class="map-filters${limpio ? ' map-filters--oculto' : ''}" id="mapFilters"
           data-mode="${isGlobal ? 'global' : 'group'}"></div>

      <div class="global-map-block">
        <div id="globalMapCanvas" style="position:relative">
          <!-- Toggle Mapa/Satélite + botón fullscreen (esquina superior derecha) -->
          <div class="map-block-controls map-block-controls-floating">
            <div class="map-block-toggle" id="globalLayerToggle">
              <button data-layer="positron" class="active">Mapa</button>
              <button data-layer="satelite">Satélite</button>
            </div>
            <button class="map-fullscreen-btn" type="button" aria-label="Pantalla completa" title="Pantalla completa">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
 * Módulo Zona Patrimonio (AISLADO)
 * No toca DATA, geometrias.geojson ni ningún contador.
 * Solo dibuja un mapa + narrativa. Fuente propia: data/zona_patrimonio.geojson
 * ============================================================ */
let zpMap = null, ZP_DESIGNACIONES = null;

/* Miembros del inventario que se MUESTRAN en el mapa ZP (solo lectura, por nombre exacto) */
const ZP_INVENTARIO = new Set([
  'Bosque de Nativitas',
  'Bosque de San Luis Tlaxialtemalco',
  'Canal Nacional',
  'Ejidos de Xochimilco y San Gregorio Atlapulco',
  'Tempiluli',
  'Bosque de Tláhuac',
  'Lago Tláhuac-Xico'
]);

/* Dataset autocontenido de la sección ZP (tabla + ficha). No toca DATA ni el inventario.
   Miembros (es_designacion=false) → abren la ficha completa openDrawer(DATA).
   Designaciones (es_designacion=true) → abren openZPDrawer(row). */
const ZP_DATA = [
  {key:'INV::Bosque de Nativitas', nombre:'Bosque de Nativitas', grupo:'AVA · Bosque Urbano', categoria:'Bosque Urbano', alcaldia:'Xochimilco', fecha_decreto:'10/06/2010', superficie:19.28, fecha_pm:'12/08/2014', color:'var(--verde)', es_designacion:false},
  {key:'INV::Bosque de San Luis Tlaxialtemalco', nombre:'Bosque de San Luis Tlaxialtemalco', grupo:'AVA · Bosque Urbano', categoria:'Bosque Urbano', alcaldia:'Xochimilco', fecha_decreto:'04/08/2008', superficie:3.83, fecha_pm:'23/07/2014', color:'var(--verde)', es_designacion:false},
  {key:'INV::Canal Nacional', nombre:'Canal Nacional', grupo:'AVA · Bosque Urbano', categoria:'Bosque Urbano', alcaldia:'Coyoacán, Iztapalapa, Xochimilco', fecha_decreto:'15/06/2022', superficie:32.32, fecha_pm:'23/01/2025', color:'var(--verde)', es_designacion:false},
  {key:'INV::Bosque de Tláhuac', nombre:'Bosque de Tláhuac', grupo:'ANP · Local', categoria:'Zona de Protección Especial', alcaldia:'Tláhuac', fecha_decreto:'29/01/2024', superficie:58.77, fecha_pm:'—', color:'var(--guinda)', es_designacion:false},
  {key:'INV::Ejidos de Xochimilco y San Gregorio Atlapulco', nombre:'Ejidos de Xochimilco y San Gregorio Atlapulco', grupo:'ANP · Local', categoria:'Zona Sujeta a Conservación Ecológica', alcaldia:'Xochimilco, Tláhuac', fecha_decreto:'04/12/2006', superficie:2522.43, fecha_pm:'26/02/2018', color:'var(--guinda)', es_designacion:false},
  {key:'INV::Tempiluli', nombre:'Tempiluli', grupo:'ANP · Local', categoria:'Zona de Protección Especial', alcaldia:'Tláhuac', fecha_decreto:'11/08/2011', superficie:47.55, fecha_pm:'06/11/2023', color:'var(--guinda)', es_designacion:false},
  {key:'INV::Lago Tláhuac-Xico', nombre:'Lago Tláhuac-Xico', grupo:'ANP · Federal', categoria:'Área de Protección de Recursos Naturales', alcaldia:'Tláhuac', fecha_decreto:'08/01/2024', superficie:3545.41, fecha_pm:'—', color:'var(--azul)', es_designacion:false},
  {key:'ZPM_POLIGONO', nombre:'Zona Patrimonio Mundial (UNESCO)', grupo:'Internacional', ambito:'Internacional', categoria:'Patrimonio Mundial Cultural y Natural · Sitio mixto', alcaldia:'Xochimilco, Tláhuac, Milpa Alta', fecha_decreto:'11/12/1987', superficie:7534.17, sup_nota:'oficial · ampliación 2014', fecha_pm:'Ampliación del polígono 2014', notas:'Inscripción UNESCO 1987; el Comité de Patrimonio Mundial amplió el polígono a 75.34 km² (7,534.17 ha) en 2014.', color:'#444441', es_designacion:true},
  {key:'RAMSAR_1363', nombre:'Sitio Ramsar No. 1363 · Sistema Lacustre EXSGA', grupo:'Internacional', ambito:'Internacional', categoria:'Humedal de Importancia Internacional (Convención Ramsar)', alcaldia:'Xochimilco, Tláhuac', fecha_decreto:'02/02/2004', superficie:2657.00, sup_nota:'oficial Ramsar', fecha_pm:'Actualización FIR 2023', notas:'Denominación oficial: “Sistema Lacustre Ejidos de Xochimilco y San Gregorio Atlapulco”. Sitio Ramsar no. 1363.', color:'#1D9E75', es_designacion:true},
  {key:'AICA_37', nombre:'AICA No. 37 · Ciénega de Tláhuac', grupo:'Internacional', ambito:'Internacional', categoria:'Área de Importancia para la Conservación de las Aves (CONABIO–CIPAMEX)', alcaldia:'Tláhuac', fecha_decreto:'1999', superficie:2860.32, sup_nota:'oficial CONABIO', fecha_pm:'—', notas:'Clave AICA-037. Superficie oficial 2,860.32 ha (CONABIO). Sitio reconocido por diversidad ornitológica del humedal de la Ciénega de Tláhuac.', color:'#d9a400', es_designacion:true},
  {key:'SIPAM_FAO', nombre:'SIPAM FAO · Sistema Agrícola Chinampero', grupo:'Internacional', ambito:'Internacional', categoria:'Sistema Importante del Patrimonio Agrícola Mundial (FAO–GIAHS)', alcaldia:'Xochimilco, Tláhuac, Milpa Alta', fecha_decreto:'07/2017', superficie:1875.65, sup_nota:'6 zonas chinamperas · SIG', fecha_pm:'—', notas:'Designación FAO (julio 2017). 6 zonas chinamperas, incluida Tetelco recuperada: Xochimilco 931.2 · Mixquic 316.4 · San Gregorio 241.4 · Tetelco 151.3 · San Pedro Tláhuac 147.1 · San Luis Tlaxialtemalco 88.2 ha.', color:'#6B7A2F', es_designacion:true}
];

/* Abre la ficha correcta según el tipo de fila */
let zpEmb = {};

function openZPFicha(key){
  const row = ZP_DATA.find(r => r.key === key);
  if(!row) return;
  zoomZP(key);   // zoom al elemento (solo vista; no altera capas)
  if(!row.es_designacion && typeof DATA !== 'undefined'){
    const area = DATA.find(d => d.nombre === row.nombre);
    if(area && typeof openDrawer === 'function'){ openDrawer(area); return; }
  }
  openZPDrawer(row);
}

/* Zoom del mapa ZP al polígono del elemento. Solo cambia la vista; no toca capas. */
function zoomZP(key){
  const it = zpLayers[key];
  if(!it || !zpMap || !it.layer) return;
  try{
    if(typeof it.layer.getBounds === 'function'){
      const b = it.layer.getBounds();
      if(b && b.isValid()) zpMap.fitBounds(b, {padding:[30,30], maxZoom:16});
    }
  }catch(e){}
}

/* Ficha + zoom de un embarcadero individual (punto) */
function openEmbFicha(e){
  if(!e) return;
  if(zpMap){ try{ zpMap.setView([e.lat, e.lng], 17); }catch(err){} }   // solo zoom
  if(typeof destroyMap === 'function'){ try{ destroyMap(); }catch(err){} }
  const p = e.props || {};
  const col = (typeof EMB_COLORS!=='undefined' && EMB_COLORS[e.tipo]) || COL_AZUL_EMB;
  _marcaFicha(true);
  /* Abre en la posición alta: la ficha es el objeto de la consulta y a media
     altura obligaba a un gesto extra para leer superficie, decreto y suelo de
     conservación. Las otras dos posiciones siguen a un tirón del asa. */
  if(_drMovil()) setTimeout(()=>drIr(_drAlturas()[3]), 0);
  drIn.innerHTML = `
    <div class="drawer-header-row"><div class="drawer-header-left">
      <div class="kat" style="color:${col}">Embarcadero · ${e.tipo}</div>
      <h2>${p.nombre || 'Embarcadero'}</h2>
      <div class="subcat">${p.clasificacion || ''}</div>
    </div></div>
    <div class="big-num">${p.sup_m2!=null?fmt(p.sup_m2):'—'}<span style="font-size:var(--fs-lg);color:var(--muted);margin-left:6px;font-weight:500">m²</span></div>
    <div class="big-num-lbl">Superficie</div>
    <div class="field"><div class="k">Tipo</div><div class="v">${e.tipo}</div></div>
    <div class="field"><div class="k">Alcaldía</div><div class="v">${p.alcaldia||'—'}</div></div>
    <div class="field"><div class="k">Clasificación</div><div class="v">${p.clasificacion||'—'}</div></div>
    <div class="field"><div class="k">Propiedad / régimen</div><div class="v">${p.propiedad||'—'}</div></div>
    <div class="field"><div class="k">Identificador</div><div class="v">${p.no_id||'—'}</div></div>
    <div class="legal-block"><div class="title">ℹ Infraestructura de la Zona Patrimonio</div>
      <p>Embarcadero del sistema chinampero. No forma parte del inventario ANP/AVA ni de sus conteos.</p></div>
  `;
  bd.classList.add('open'); dr.classList.add('open');
}

/* Zoom del mapa global (inventario) al polígono de un área. Solo vista; no toca capas. */
function zoomGlobalToArea(d){
  if(!d || typeof globalMap==='undefined' || !globalMap || !GEOMETRIES) return;
  const feat = (GEOMETRIES.features||[]).find(f => f.properties.nombre === d.nombre);
  if(!feat) return;
  try{
    const b = L.geoJSON(feat).getBounds();
    if(b && b.isValid()) globalMap.fitBounds(b, {padding:[30,30], maxZoom:15});
  }catch(e){}
}

/* ===== Botón "Ubicarme" (geolocalización) para todos los mapas ===== */
function _ringHas(lng,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>lat)!==(yj>lat)) && (lng < (xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi)) inside=!inside;
  }
  return inside;
}
function _polyHas(lng,lat,poly){
  if(!poly.length || !_ringHas(lng,lat,poly[0])) return false;
  for(let k=1;k<poly.length;k++) if(_ringHas(lng,lat,poly[k])) return false;   // dentro de un hueco
  return true;
}
function geoContainsPoint(lng,lat,geom){
  if(!geom) return false;
  if(geom.type==='Polygon') return _polyHas(lng,lat,geom.coordinates);
  if(geom.type==='MultiPolygon') return geom.coordinates.some(p=>_polyHas(lng,lat,p));
  return false;
}
function featuresContaining(features,latlng){
  return (features||[]).filter(f=>f.geometry && geoContainsPoint(latlng.lng,latlng.lat,f.geometry))
    .map(f=>(f.properties&&(f.properties.nombre||f.properties.capa))||'Polígono');
}
/* Features de la Zona Patrimonio (designaciones + miembros del inventario) para la detección */
function getZPAllFeatures(){
  const out = [...(((typeof ZP_DESIGNACIONES!=='undefined') && ZP_DESIGNACIONES && ZP_DESIGNACIONES.features)||[])];
  if(GEOMETRIES && typeof ZP_INVENTARIO!=='undefined'){
    (GEOMETRIES.features||[]).forEach(f=>{ if(ZP_INVENTARIO.has(f.properties.nombre)) out.push(f); });
  }
  return out;
}
/* ===== Botón "Vista general": devuelve el mapa a su encuadre inicial =====
   Se guarda el bounds de origen en map._siaHome al construir cada mapa.
   Útil sobre todo después de buscar una coordenada, que desplaza la vista. */
function addResetViewControl(map, title){
  if(!map || typeof L==='undefined') return;
  const Ctrl = L.Control.extend({
    options:{position:'topleft'},
    onAdd:function(){
      const c = L.DomUtil.create('div','leaflet-bar resetview-ctrl');
      const a = L.DomUtil.create('a','',c);
      a.href='#'; a.title=title||'Vista general'; a.setAttribute('role','button');
      a.setAttribute('aria-label', title||'Vista general');
      a.style.cssText = 'display:flex;align-items:center;justify-content:center;color:var(--guinda)';
      /* Casita, no el marco de cuatro esquinas: ese se lee como «pantalla
         completa» —de hecho se confundía con el botón que ya retiramos— y
         esto es «volver a la vista general», el encuadre de partida. */
      a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/></svg>';
      L.DomEvent.on(a,'click',L.DomEvent.stopPropagation).on(a,'click',L.DomEvent.preventDefault)
        .on(a,'click',()=>{
          const b = map._siaHome;
          if(b && b.isValid && b.isValid()) map.fitBounds(b, {padding:[20,20], maxZoom:16});
          else siaToast('Todavía no hay una vista general disponible para este mapa.');
        });
      return c;
    }
  });
  map.addControl(new Ctrl());
}

/* ===== Diagnóstico de ubicación · uso interno SEDEMA =====
   Además de "caes / no caes", el popup resuelve la pregunta operativa:
   en qué alcaldía estás, si estás en Suelo de Conservación y, si no caes
   dentro de ningún polígono, cuál es el área más próxima y a qué distancia.
   Proyección plana local (equirectangular): a escala CDMX el error es <0.1%. */
function _projM(lat,lng,lat0){
  const k = Math.cos(lat0*Math.PI/180);
  return [lng*111320*k, lat*110540];
}
function _segDistM(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay;
  const den = dx*dx+dy*dy;
  const t = den ? Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/den)) : 0;
  return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
}
function _geomDistM(lat,lng,geom){
  if(!geom) return Infinity;
  const [px,py] = _projM(lat,lng,lat);
  const polys = geom.type==='Polygon' ? [geom.coordinates]
              : geom.type==='MultiPolygon' ? geom.coordinates : [];
  let min = Infinity;
  for(const poly of polys) for(const ring of poly){
    for(let i=1;i<ring.length;i++){
      const a=_projM(ring[i-1][1],ring[i-1][0],lat), b=_projM(ring[i][1],ring[i][0],lat);
      const d=_segDistM(px,py,a[0],a[1],b[0],b[1]);
      if(d<min) min=d;
    }
  }
  return min;
}
function _fmtDist(m){
  if(!isFinite(m)) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(m<10000?1:0)} km`;
}
function _alcaldiaEn(latlng){
  const fs = (ALCALDIAS_EMBEDDED && ALCALDIAS_EMBEDDED.features) || [];
  const hit = fs.find(f=>f.geometry && geoContainsPoint(latlng.lng, latlng.lat, f.geometry));
  return hit ? (hit.properties.nombre || '—') : null;
}

/* ── Ambito territorial · CDMX + entidades colindantes ───────────────────
   Dentro de la CDMX la entidad se resuelve por interseccion contra la capa
   de alcaldias. Fuera, se infiere por posicion: Morelos solo colinda al sur.
   PENDIENTE: sustituir la inferencia por data/entidades.geojson del Marco
   Geoestadistico del INEGI para que la atribucion sea citable. */
const _ENT_SIGLA = { 'CDMX':'CDMX', 'Estado de México':'MÉX', 'Morelos':'MOR' };
function _entidadEn(latlng){
  if(_alcaldiaEn(latlng)) return 'CDMX';
  if(latlng.lat < 19.13 && latlng.lng > -99.40 && latlng.lng < -98.90) return 'Morelos';
  return 'Estado de México';
}
function _entChip(ent){
  const k = ent === 'CDMX' ? 'cdmx' : (ent === 'Morelos' ? 'mor' : 'mex');
  return `<span class="ent e-${k}">${esc(_ENT_SIGLA[ent] || ent)}</span>`;
}
/* Metadato precalculado en data/geometrias.geojson (campo limitrofe).
   Se precalcula fuera del navegador: el cruce contra la frontera es pesado. */
function _limitrofeDe(nombre){
  try{
    const fs = (typeof GEOMETRIES!=='undefined' && GEOMETRIES && GEOMETRIES.features) || [];
    const f = fs.find(x=>x.properties && x.properties.nombre === nombre);
    return (f && f.properties.limitrofe) || null;
  }catch(_){ return null; }
}
/* Area que cruza el limite estatal mas cercana dentro del radio dado */
function _limitrofeCerca(latlng, radio){
  let best = null;
  try{
    ((typeof GEOMETRIES!=='undefined' && GEOMETRIES && GEOMETRIES.features) || []).forEach(f=>{
      const l = f.properties && f.properties.limitrofe;
      if(!l || l.clase !== 'cruza' || !f.geometry) return;
      const d = _geomDistM(latlng.lat, latlng.lng, f.geometry);
      if(d <= radio && (!best || d < best.d))
        best = { d, nombre:f.properties.nombre, grupo:f.properties.grupo, lim:l };
    });
  }catch(_){}
  return best;
}
/* Domicilio resuelto por Places (CP y colonia) para la ultima busqueda */
let _ubicarDomicilio = null;
function _enSueloConservacion(latlng){
  const fs = (SUELO_CONSERVACION && SUELO_CONSERVACION.features) || null;
  if(!fs || !fs.length) return null;                    // capa aún no cargada
  return fs.some(f=>f.geometry && geoContainsPoint(latlng.lng, latlng.lat, f.geometry));
}
/* ── Universo completo de coberturas para el diagnóstico de campo ──
   Consulta de SOLO LECTURA sobre inventario + ARCAC + Zona Patrimonio.
   NO altera DATA, GEOMETRIES, contadores ni filtros: el inventario sigue
   siendo 66 y los módulos especiales siguen aislados en sus propios GeoJSON. */
const _COV_ORDEN = ['ANP · Federal','ANP · Local','AVA · Bosque Urbano','AVA · Barranca','ARCAC','ZP'];

/* Capas que no lograron cargar en la ultima consulta. Se expone al usuario:
   un "no estas dentro de ninguna area" con una capa faltante es un falso
   negativo, y en campo eso se toma como decision. */
let _capasFallidas = [];
async function _cargarCapasCobertura(){
  const t = [];
  try{ if(typeof loadSueloConservacion==='function' && !SUELO_CONSERVACION) t.push(['Suelo de Conservación', loadSueloConservacion()]); }catch(_){}
  try{ if(typeof loadARCAC==='function' && !ARCAC_GEO) t.push(['ARCAC', loadARCAC()]); }catch(_){}
  try{ if(typeof loadZonaPatrimonio==='function' && !ZP_DESIGNACIONES) t.push(['Zona Patrimonio', loadZonaPatrimonio()]); }catch(_){}
  _capasFallidas = [];
  if(t.length){
    const r = await Promise.allSettled(t.map(x=>x[1]));
    r.forEach((res,i)=>{ if(res.status === 'rejected') _capasFallidas.push(t[i][0]); });
    if(_capasFallidas.length)
      console.warn('[Cobertura] Capas que no cargaron:', _capasFallidas.join(', '));
  }
  return _capasFallidas;
}
/* Aviso reutilizable para el popup y para el panel de resultado */
function _avisoCapasHTML(clase){
  if(!_capasFallidas.length) return '';
  return `<div class="${clase}"><b>Resultado incompleto.</b> No se pudo cargar `
       + `${_capasFallidas.map(esc).join(' ni ')}. Verifica tu conexión y repite la consulta `
       + `antes de dar por hecho que el punto está fuera de esas capas.</div>`;
}

function _zpColor(capa){
  try{
    const r = ZP_DATA.find(x=>x.key===capa);
    if(r && r.color) return r.color;
  }catch(_){}
  return 'var(--guinda)';
}

function _coberturasEn(latlng){
  const out = [];
  const dentro = (g)=> g && geoContainsPoint(latlng.lng, latlng.lat, g);

  /* Inventario · 66 áreas */
  ((typeof GEOMETRIES!=='undefined' && GEOMETRIES && GEOMETRIES.features)||[]).forEach(f=>{
    if(!dentro(f.geometry)) return;
    const nom = f.properties.nombre;
    const d = (typeof DATA!=='undefined') ? DATA.find(x=>x.nombre===nom) : null;
    out.push({
      orden: f.properties.grupo,
      color: (typeof GROUP_COLORS!=='undefined' && GROUP_COLORS[f.properties.grupo]) || '#666',
      tag: f.properties.grupo,
      nombre: nom,
      sub: d ? d.categoria : '',
      meta: d ? `${fmt(d.superficie)} ha · Decreto ${d.fecha_decreto||'—'} · ${d.programa_manejo==='Sí'?'con PM':'sin PM'}` : '',
      borde: _geomDistM(latlng.lat, latlng.lng, f.geometry),
      ficha: 'inv::' + nom
    });
  });

  /* ARCAC · 30 núcleos agrarios (módulo aparte) */
  ((typeof ARCAC_GEO!=='undefined' && ARCAC_GEO && ARCAC_GEO.features)||[]).forEach(f=>{
    if(!dentro(f.geometry)) return;
    const pr = f.properties || {};
    const ten = pr.tenencia || '';
    out.push({
      orden: 'ARCAC',
      color: (typeof ARCAC_COLORS!=='undefined' && ARCAC_COLORS[ten]) || 'var(--arcac-com)',
      tag: 'ARCAC · ' + (ten || 'Núcleo agrario'),
      nombre: pr.nombre || 'ARCAC',
      sub: 'Área de Restauración y Conservación Ambiental Comunitaria',
      meta: [pr.sup_ha ? `${fmt(pr.sup_ha)} ha` : '', 'núcleo agrario'].filter(Boolean).join(' · '),
      borde: _geomDistM(latlng.lat, latlng.lng, f.geometry),
      ficha: 'arcac::' + (pr.no != null ? pr.no : '')
    });
  });

  /* Zona Patrimonio · designaciones internacionales (módulo aparte) */
  ((typeof ZP_DESIGNACIONES!=='undefined' && ZP_DESIGNACIONES && ZP_DESIGNACIONES.features)||[]).forEach(f=>{
    if(!dentro(f.geometry)) return;
    const pr = f.properties || {};
    const capa = pr.capa || '';
    let row = null;
    try{ row = ZP_DATA.find(x=>x.key===capa); }catch(_){}
    out.push({
      orden: 'ZP',
      color: _zpColor(capa),
      tag: 'Zona Patrimonio · ' + (pr.ambito || 'Designación'),
      nombre: (row && row.nombre) || pr.nombre || 'Designación',
      sub: (row && row.categoria) || '',
      meta: [pr.superficie_ha ? `${fmt(pr.superficie_ha)} ha` : '', pr.anio ? `desde ${pr.anio}` : ''].filter(Boolean).join(' · '),
      borde: _geomDistM(latlng.lat, latlng.lng, f.geometry),
      ficha: 'zp::' + capa
    });
  });

  out.sort((a,b)=>{
    const ia=_COV_ORDEN.indexOf(a.orden), ib=_COV_ORDEN.indexOf(b.orden);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  return out;
}

function _masCercana(latlng, features){
  let best = null;
  (features||[]).forEach(f=>{
    if(!f.geometry) return;
    const d = _geomDistM(latlng.lat, latlng.lng, f.geometry);
    if(!best || d < best.d) best = {d, f};
  });
  if(!best) return null;
  const pr = best.f.properties || {};
  return { nombre: pr.nombre || pr.capa || 'Polígono', grupo: pr.grupo || pr.tenencia || '', d: best.d };
}

/* El popup debe caber en el mapa: en un contenedor de 328 px, 320 de ancho se sale.
   También se reserva espacio arriba para que el autopan no lo deje bajo los controles. */
function _popupOpts(map){
  if(map && !map._siaDim){
    map._siaDim = true;
    const cl = (add) => { try{
      map.getContainer().classList[add?'add':'remove']('sia-popup-abierto');
    }catch(_){} };
    map.on('popupopen',  ()=>cl(true));
    map.on('popupclose', ()=>cl(false));
  }
  let w = 320;
  /* -64 = padding interno del globo de Leaflet (44) + holgura a los lados */
  try{ w = Math.max(190, Math.min(320, map.getContainer().clientWidth - 64)); }catch(_){}
  return { maxWidth:w, minWidth:Math.min(220, w),
           autoPanPaddingTopLeft:[12, 100], autoPanPaddingBottomRight:[12, 12] };
}

const _locateRefs = new WeakMap();
function addLocateControl(map, getContainment, getFeatures, opts){
  if(!map || typeof L==='undefined') return;
  const Ctrl = L.Control.extend({
    options:{position:'topleft'},
    onAdd:function(){
      const c = L.DomUtil.create('div','leaflet-bar locate-ctrl');
      const a = L.DomUtil.create('a','',c);
      a.href='#'; a.title='Ubicarme'; a.setAttribute('role','button'); a.setAttribute('aria-label','Ubicarme');
      /* El color lo fija la hoja de estilos (`.locate-ctrl a`), no aquí: los
         estilos de Leaflet para `.leaflet-bar a` llevan `!important` y un
         color en línea quedaba sin efecto —parecía puesto y no lo estaba—. */
      a.style.cssText = 'display:flex;align-items:center;justify-content:center';
      a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>';
      L.DomEvent.on(a,'click',L.DomEvent.stopPropagation).on(a,'click',L.DomEvent.preventDefault)
        .on(a,'click',()=>_doLocate(map,getContainment,a,getFeatures,opts));
      return c;
    }
  });
  map.addControl(new Ctrl());
}
/* Distancia minima del punto a la frontera del poligono, aproximada por sus
   vertices. Suficiente para decir «a 8.2 km del area»: a escala de ciudad los
   vertices estan lo bastante juntos como para que el error sea despreciable. */
function _distanciaAGeo(latlng, geoIn){
  const geo = (geoIn && geoIn.type==='Feature') ? geoIn.geometry : geoIn;
  if(!geo || typeof L==='undefined') return null;
  const polys = geo.type==='Polygon' ? [geo.coordinates]
              : geo.type==='MultiPolygon' ? geo.coordinates : [];
  let min = Infinity;
  const p = L.latLng(latlng.lat, latlng.lng);
  polys.forEach(poly=>poly.forEach(ring=>ring.forEach(c=>{
    const d = p.distanceTo(L.latLng(c[1], c[0]));
    if(d < min) min = d;
  })));
  return isFinite(min) ? min : null;
}
function _fmtKm(m){
  if(m == null) return '';
  return m < 1000 ? Math.round(m) + ' m' : (m/1000).toFixed(m < 10000 ? 1 : 0) + ' km';
}

function _doLocate(map,getContainment,btn,getFeatures,opts){
  opts = opts || {};
  if(btn) btn.style.opacity = '0.5';
  /* En la ficha el encuadre NO se cede al GPS: el objeto de la vista es el
     poligono del area. Si la ubicacion esta lejos, centrar ahi dejaba la
     ficha de Xochimilco enseniando Coyoacan sin decir por que. */
  map.locate({setView: !opts.area, maxZoom:16, enableHighAccuracy:true, timeout:12000});
  map.once('locationfound', e=>{
    if(btn) btn.style.opacity = '';
    const prev=_locateRefs.get(map);
    if(prev){ try{map.removeLayer(prev.m);map.removeLayer(prev.c);}catch(_){} }
    /* Dos sistemas dibujaban el punto: este control y `pintarUbicacionEnGlobal`
       de la barra «¿dónde estoy?». Cada uno limpiaba solo lo suyo, así que al
       usar los dos quedaban dos puntos azules a la vez. Se limpian entre sí. */
    if(map === globalMap && typeof limpiarUbicacionGlobal === 'function') limpiarUbicacionGlobal();
    const c=L.circle(e.latlng,{radius:e.accuracy||30,color:COL_AZUL_UBIC,weight:1,fillColor:COL_AZUL_UBIC,fillOpacity:0.12}).addTo(map);
    const m=L.circleMarker(e.latlng,{radius:7,color:'#fff',weight:2,fillColor:COL_AZUL_UBIC,fillOpacity:1}).addTo(map);
    _locateRefs.set(map,{m,c});
    m.bindPopup('<div class="lp"><div class="loc-loading">Consultando capas…</div></div>',
                _popupOpts(map)).openPopup();
    _cargarCapasCobertura().then(()=>{
      try{ m.setPopupContent(_locatePopupHTML(e.latlng, e.accuracy)); }catch(_){}
    });
    if(opts.area) _ubicarEnFicha(map, e.latlng, opts);
  });
  map.once('locationerror', ()=>{
    if(btn) btn.style.opacity = '';
    siaToast('No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador (requiere HTTPS).');
  });
}

/* ═══ UBICARSE DESDE UNA FICHA · COMPORTAMIENTO DEFINIDO ══════════════
   La ficha plantea una pregunta concreta —¿esta área me incluye?— y la
   respuesta tiene tres casos. Antes los tres se trataban igual: el mapa
   saltaba a la ubicación y el polígono desaparecía de cuadro.
     · Dentro           → se mantiene el encuadre del área y se dice que sí.
     · Fuera y cerca    → se encuadran los dos, para ver la relación.
     · Fuera y lejos    → se conserva el área en cuadro y se dice a cuánto
                          está el punto; forzar el encuadre conjunto dejaría
                          el polígono del tamaño de un alfiler.
   En los tres casos el punto queda registrado como contexto de la ficha, de
   modo que la imagen para compartir enseñe lo mismo que la pantalla. */
const _UBIC_CERCA_M = 12000;
function _ubicarEnFicha(map, latlng, opts){
  try{
    const dentro = (typeof geoContainsPoint==='function' && opts.area)
      ? geoContainsPoint(latlng.lng, latlng.lat,
          (opts.area.type==='Feature' ? opts.area.geometry : opts.area))
      : false;
    const dist = dentro ? 0 : _distanciaAGeo(latlng, opts.area);
    const nombre = opts.nombre || 'esta área';

    /* Contexto para la tarjeta compartible: lo que se ve es lo que se comparte. */
    _fichaCtxUbic = { lat:latlng.lat, lng:latlng.lng,
                      etiqueta: dentro ? 'Tu ubicación · dentro del área'
                                       : 'Tu ubicación · a ' + _fmtKm(dist) + ' del área' };
    /* Dentro del área la pregunta siguiente es siempre la misma: ¿en qué zona
       del programa de manejo estoy parado? Se responde sin que la pidan. */
    if(dentro && typeof zonaDePunto === 'function'){
      const _ctx = _fichaCtxUbic;
      zonaDePunto(opts.nombre, latlng).then(z=>{
        if(!z) return;
        _ctx.zona = z.zona;
        _ctx.etiqueta = 'Tu ubicación · ' + z.zona;
        _pintarPuntoEnBloque('zonif');
        siaToast('Zona del programa de manejo en ese punto: ' + z.zona + '.');
      }).catch(()=>{});
    }
    if(dentro) _resolverPgoedfDelPunto(_fichaCtxUbic);
    else _pintarPuntoEnBloque('zonif'), _pintarPuntoEnBloque('pgoedf');

    const bArea = opts.getBounds ? opts.getBounds() : null;
    if(dentro){
      if(bArea && bArea.isValid()) map.fitBounds(bArea, {padding:[20,20], maxZoom:16});
      siaToast('Tu ubicación está DENTRO de ' + nombre + '.');
    } else if(dist != null && dist <= _UBIC_CERCA_M && bArea && bArea.isValid()){
      map.fitBounds(bArea.extend(latlng), {padding:[30,30], maxZoom:16});
      siaToast('Tu ubicación está FUERA de ' + nombre + ' · a ' + _fmtKm(dist) + ' del límite.');
    } else {
      if(bArea && bArea.isValid()) map.fitBounds(bArea, {padding:[20,20], maxZoom:16});
      siaToast('Tu ubicación está a ' + _fmtKm(dist) + ' de ' + nombre
             + '. El mapa se queda en el polígono; usa la casita para volver.');
    }
  }catch(_){}
}

/* Ficha de ubicación en campo · uso operativo SEDEMA
   Diseño ejecutivo: responde UNA pregunta —¿dónde estoy parado y qué aplica?—
   en dos segundos y de un vistazo. Superficie, decreto y programa de manejo NO
   van aquí: están a un toque de distancia en la ficha. */
function _locatePopupHTML(latlng, accuracy, _i1, _i2, opts){
  opts = opts || {};
  const acc    = accuracy ? Math.round(accuracy) : null;
  const alc    = _alcaldiaEn(latlng);
  const ent    = _entidadEn(latlng);
  const enCDMX = ent === 'CDMX';
  const sc     = _enSueloConservacion(latlng);
  const covs   = _coberturasEn(latlng);
  const GF     = (typeof GEOMETRIES!=='undefined' && GEOMETRIES && GEOMETRIES.features) || [];

  /* Pie: lugar + chip de entidad en la primera linea, precision en la segunda */
  const lugar = enCDMX ? (alc || 'Ciudad de México') : 'Fuera de la CDMX';
  /* Sin el ± del GPS, igual que la ficha de resultado (12-sep-2026): en campo
     no se usa y ocupaba un renglón. La precisión se sigue calculando: alimenta
     el aviso de «dentro del margen de error del límite». */
  const pie = esc(lugar) + ' ' + _entChip(ent);

  /* Si una capa no cargo, se dice ANTES del diagnostico: el resultado no es
     concluyente y quien esta en campo tiene que saberlo antes de leerlo. */
  let html = '<div class="lp">' + _avisoCapasHTML('lp-warn rojo');

  if(covs.length){
    /* CASOS 1 y 2 · el punto cae dentro de un poligono */
    const c      = covs[0];                       // la de mayor jerarquia normativa
    const extras = covs.slice(1).map(x=>x.tag);
    if(sc === true) extras.push('Suelo de Conservación');
    const lim   = _limitrofeDe(c.nombre);
    const esLim = !!(lim && lim.clase === 'cruza');
    const cerca = (acc && isFinite(c.borde) && c.borde < acc);

    let aviso = '';
    if(!enCDMX){
      /* CASO 1 · dentro del poligono pero fuera de la CDMX: el error mas caro */
      aviso = `<div class="lp-warn rojo"><b>Pero en territorio de ${esc(ent)}.</b> `
            + (esLim ? `El ${lim.pct_fuera}% de esta área (${lim.ha_fuera} ha) está fuera de la CDMX. ` : '')
            + `La atribución de competencia no es automática: verifica el instrumento aplicable.</div>`;
    } else if(esLim){
      /* CASO 2 · dentro y del lado correcto, pero el poligono continua afuera */
      aviso = `<div class="lp-warn">Área limítrofe: ${lim.ha_fuera} ha del polígono se extienden a `
            + `${esc(lim.entidad || 'otra entidad')}. Este punto sí está en la CDMX.</div>`;
    } else if(cerca){
      aviso = `<div class="lp-warn">A ${Math.round(c.borde)} m del límite · dentro del margen del GPS</div>`;
    }

    html += `<div class="lp-cat"><span class="lp-dot" style="background:${esc(c.color)}"></span>${esc(c.tag)}`
          + (esLim ? ' <span class="lim">Limítrofe</span>' : '') + `</div>
      <div class="lp-nom">${esc(c.nombre)}</div>
      ${!enCDMX ? '<div class="lp-mas">Estás dentro del polígono decretado</div>'
                : (extras.length ? `<div class="lp-mas">+ ${extras.map(esc).join(' · ')}</div>` : '')}
      ${aviso}
      <div class="lp-pie"><span class="lp-ctx">${pie}</span>
        <button type="button" class="lp-ficha" data-ficha="${esc(c.ficha)}">Ficha <span class="ar">→</span></button></div>`;

  } else if(!enCDMX){
    /* CASOS 3 y 4 · fuera de la CDMX y fuera de todo poligono */
    const lim = _limitrofeCerca(latlng, 500);
    const cer = _masCercana(latlng, GF);
    html += `<div class="lp-cat gris"><span class="lp-dot" style="background:${COL_GRIS_NEUTRO}"></span>Fuera del ámbito de la CDMX</div>
      <div class="lp-nom sm">El punto está en otra entidad federativa</div>`;
    if(lim){
      /* CASO 3 · junto a un area cuyo poligono si cruza el limite */
      html += `<div class="lp-mas">A ${_fmtDist(lim.d)} de <b>${esc(lim.nombre)}</b> <span class="lim">Limítrofe</span></div>
        <div class="lp-warn">Esta área cruza el límite estatal (${lim.lim.ha_fuera} ha del lado de `
        + `${esc(lim.lim.entidad || 'la entidad vecina')}). Si verificas lindero, considera que el polígono continúa en esta entidad.</div>`;
    } else if(cer){
      /* CASO 4 · fuera y lejos: solo el aviso de competencia */
      html += `<div class="lp-mas">Más cercana · <b>${esc(cer.nombre)}</b> a ${_fmtDist(cer.d)}</div>
        <div class="lp-warn">La competencia de la Secretaría no alcanza este punto. Verifica con la autoridad estatal.</div>`;
    } else {
      html += `<div class="lp-warn">La competencia de la Secretaría no alcanza este punto.</div>`;
    }
    const ref = lim ? lim.nombre : (cer ? cer.nombre : null);
    html += `<div class="lp-pie"><span class="lp-ctx">${pie}</span>`
          + (ref ? `<button type="button" class="lp-ficha" data-ficha="inv::${esc(ref)}">Ficha <span class="ar">→</span></button>` : '')
          + `</div>`;

  } else if(sc === true){
    const cer = _masCercana(latlng, GF);
    html += `<div class="lp-cat" style="color:var(--sc)"><span class="lp-dot" style="background:var(--sc)"></span>Suelo de Conservación</div>
      <div class="lp-nom sm">Sin área decretada en este punto</div>
      ${cer ? `<div class="lp-mas">Más cercana · <b>${esc(cer.nombre)}</b> a ${_fmtDist(cer.d)}</div>` : ''}
      <div class="lp-pie"><span class="lp-ctx">${pie}</span>`
      + (cer ? `<button type="button" class="lp-ficha" data-ficha="inv::${esc(cer.nombre)}">Ficha <span class="ar">→</span></button>` : '')
      + `</div>`;

  } else {
    const cer = _masCercana(latlng, GF);
    html += `<div class="lp-cat gris"><span class="lp-dot" style="background:${COL_GRIS_NEUTRO}"></span>Sin protección ambiental</div>`;
    if(cer){
      html += `<div class="lp-nom sm">El punto no cae en área decretada ni en Suelo de Conservación</div>
        <div class="lp-mas">Más cercana · <b>${esc(cer.nombre)}</b> a ${_fmtDist(cer.d)}</div>
        <div class="lp-pie"><span class="lp-ctx">${pie}</span>
          <button type="button" class="lp-ficha" data-ficha="inv::${esc(cer.nombre)}">Ficha <span class="ar">→</span></button></div>`;
    } else {
      html += `<div class="lp-pie"><span class="lp-ctx">${pie}</span></div>`;
    }
  }
  return html + '</div>';
}

/* ═══ CONTEXTO DE UBICACIÓN PARA LA TARJETA COMPARTIBLE ════════════════
   Cuando la ficha se abre desde una consulta —GPS, dirección o coordenada—,
   la imagen debe decir QUÉ PUNTO se consultó: sin eso, la captura solo prueba
   que el área existe, no que el punto de campo cae dentro. Se guarda el punto
   al abrir la ficha desde un resultado de ubicación y se borra al abrirla
   desde la tabla o el mapa, para que una consulta vieja no contamine una
   ficha posterior. */
let _ctxUbicFicha = null;
let _fichaCtxUbic = null;   /* el que ve la tarjeta compartible */
let _ubicarEtiqueta = '';
function fijarCtxUbic(){
  _ctxUbicFicha = (_ubicarOrigen && isFinite(_ubicarOrigen.lat))
    ? { lat:_ubicarOrigen.lat, lng:_ubicarOrigen.lng, etiqueta:_ubicarEtiqueta || '' }
    : null;
}

/* Acciones del popup: abrir ficha y copiar coordenada (delegadas: el popup se recrea) */
document.addEventListener('click', ev=>{
  const t = ev.target.closest && ev.target.closest('[data-ficha]');
  if(t){
    /* Estos botones solo existen en el resultado de ubicación y en el popup
       del mapa: ambos vienen de un punto consultado. */
    fijarCtxUbic();
    const raw = t.dataset.ficha || '';
    const i = raw.indexOf('::');
    const tipo = raw.slice(0, i), ref = raw.slice(i+2);
    try{
      if(tipo==='inv'){ const a = DATA.find(d=>d.nombre===ref); if(a) openDrawer(a); }
      else if(tipo==='arcac' && ref !== ''){ openARCACFicha(Number(ref)); }
      else if(tipo==='zp'){ openZPFicha(ref); }
    }catch(err){ siaToast('No se pudo abrir la ficha de esta área.'); }
  }
});


/* Ficha lateral (mismo drawer #dr) para designaciones ZP */
function openZPDrawer(row){
  if(typeof destroyMap === 'function'){ try{ destroyMap(); }catch(e){} }
  const sup = (row.superficie != null && row.superficie !== '')
    ? `${fmt(row.superficie)}<span style="font-size:var(--fs-lg);color:var(--muted);margin-left:6px;font-weight:500">ha</span>`
    : `<span style="font-size:var(--fs-xl);color:var(--muted)">Por confirmar</span>`;
  _marcaFicha(true);
  /* Abre en la posición alta: la ficha es el objeto de la consulta y a media
     altura obligaba a un gesto extra para leer superficie, decreto y suelo de
     conservación. Las otras dos posiciones siguen a un tirón del asa. */
  if(_drMovil()) setTimeout(()=>drIr(_drAlturas()[3]), 0);
  drIn.innerHTML = `
    <div class="drawer-header-row">
      <div class="drawer-header-left">
        <div class="kat">Zona Patrimonio · ${row.ambito||''}</div>
        <h2>${row.nombre}</h2>
        <div class="subcat">${row.categoria||''}</div>
      </div>
      ${botonCompartirHTML()}
    </div>

    ${fichaMapaHTML()}

    <div class="big-num">${sup}</div>
    <div class="big-num-lbl">Superficie${row.sup_nota?` · ${row.sup_nota}`:''}</div>
    <div class="field"><div class="k">Instrumento</div><div class="v">${row.categoria||'—'}</div></div>
    <div class="field"><div class="k">Ámbito</div><div class="v">${row.ambito||'—'}</div></div>
    <div class="field"><div class="k">Alcaldía(s)</div><div class="v">${row.alcaldia||'—'}</div></div>
    <div class="field"><div class="k">Declaratoria / inscripción</div><div class="v">${row.fecha_decreto||'—'}</div></div>
    <div class="field"><div class="k">Actualización / plan</div><div class="v">${row.fecha_pm||'—'}</div></div>
    ${row.notas?`<div class="field"><div class="k">Notas</div><div class="v">${row.notas}</div></div>`:''}
    <div class="legal-block"><div class="title">ℹ Designación de la Zona Patrimonio</div>
      <p>Instrumento de protección superpuesto al territorio patrimonial. No forma parte del inventario ANP/AVA de la CDMX ni de sus conteos.</p></div>
  `;
  bd.classList.add('open'); dr.classList.add('open');

  // Renderiza el mapa de la designación (solo mapa + zoom, sin buscador/toggle/fullscreen)
  loadZonaPatrimonio().then(()=>{
    initZPFichaMap(row);
    /* El polígono se busca aquí, ya cargada la capa: la designación se
       identifica por `capa`, igual que en el diagnóstico de ubicación. */
    /* La designación se identifica por `key`, no por `capa`: es la misma
       correspondencia que usa el mini-mapa de la ficha. Con `capa` el polígono
       nunca se encontraba y la imagen salía con «Polígono no disponible». */
    let feat = null;
    try{ feat = ((ZP_DESIGNACIONES&&ZP_DESIGNACIONES.features)||[])
                  .find(f=>f.properties && f.properties.capa===row.key) || null; }catch(e){}
    conectarCompartir(descZP(row, feat));
    setTimeout(()=>{ try{ montarBotonBase(); }catch(e){} }, 80);
  });
}

/* Mapa dentro de la ficha lateral de una designación ZP · reutiliza #mapCanvas y helpers de inventario */
function initZPFichaMap(row){
  const container = document.getElementById('mapCanvas');
  if(!container || typeof L === 'undefined') return;
  const feat = ((typeof ZP_DESIGNACIONES !== 'undefined' && ZP_DESIGNACIONES && ZP_DESIGNACIONES.features) || [])
                 .find(f => f.properties && f.properties.capa === row.key);
  if(!feat){
    container.classList.add('no-data');
    container.innerHTML = '<div><b>Polígono no disponible aún.</b> Cuando se integre el archivo cartográfico se mostrará el polígono georreferenciado en este espacio.</div>';
    return;
  }
  container.classList.remove('no-data');
  const canvasZP = document.getElementById('mapCanvasMap') || container;
  canvasZP.innerHTML = '';
  activeMap = L.map(canvasZP, { zoomControl:true, scrollWheelZoom:false, attributionControl:true });
  setBaseLayer('positron');
  // Contexto territorial: límites de alcaldía (debajo del polígono)
  try{ createAlcaldiasLayer({interactive:false}).addTo(activeMap); }catch(e){}
  const isCont = !!feat.properties.es_contenedor;
  const col = row.color || feat.properties.color || 'var(--guinda)';
  activeGeoLayer = L.geoJSON(feat, {
    /* Tres niveles: contenedor (línea discontinua gruesa, casi sin relleno),
       designación internacional (punteada, relleno ligero: reconoce, no
       delimita competencia) y área del inventario (trazo firme). */
    style: isCont
      ? { color:col, weight:2.5, fillColor:col, fillOpacity:0.06, dashArray:'6 5' }
      : (feat.properties.tipo === 'designacion'
          ? { color:col, weight:2, fillColor:col, fillOpacity:0.10, dashArray:'1 5', lineCap:'round' }
          : { color:col, weight:1.8, fillColor:col, fillOpacity:0.22 })
  }).addTo(activeMap);
  activeGeoLayer.bindTooltip(row.nombre, {sticky:true, direction:'top'});
  activeGeoLayer.bringToFront();
  try{ activeMap.fitBounds(activeGeoLayer.getBounds(), {padding:[20,20], maxZoom:15}); activeMap._siaHome = activeGeoLayer.getBounds(); }catch(e){}
  fichaMapaConectar(container);
  addLocateControl(activeMap, ll=>featuresContaining(getZPAllFeatures(), ll), getZPAllFeatures);
  addResetViewControl(activeMap, 'Volver al polígono');
  addSearchMarkerTo(activeMap);
}

/* Colores de la capa de embarcaderos por tipo (puntos) */
const EMB_COLORS = { 'Turístico':'#D6336C', 'Productivo':'#2B8A3E' };
let EMBARCADEROS = null;

/* Normaliza el campo tipo → 'Turístico' | 'Productivo' | null (tolerante a plural/acentos/mayúsculas) */
function normEmbTipo(t){
  const s = (t||'').toString().trim().toLowerCase();
  if(s.startsWith('tur')) return 'Turístico';
  if(s.startsWith('pro')) return 'Productivo';
  return null;
}

/* Carga la capa de embarcaderos (puntos). Opcional: si el archivo no existe, devuelve colección vacía. */
async function loadEmbarcaderos(){
  if(EMBARCADEROS) return EMBARCADEROS;
  try{
    const r = await fetch('data/embarcaderos.geojson');
    if(!r.ok) throw new Error('HTTP ' + r.status);
    EMBARCADEROS = await r.json();
  }catch(err){
    console.warn('[ZP] embarcaderos.geojson no disponible:', err.message);
    EMBARCADEROS = { type:'FeatureCollection', features:[] };
  }
  return EMBARCADEROS;
}

async function loadZonaPatrimonio(){
  if(ZP_DESIGNACIONES) return ZP_DESIGNACIONES;
  try{
    const r = await fetch('data/zona_patrimonio.geojson');
    if(!r.ok) throw new Error('HTTP ' + r.status);
    ZP_DESIGNACIONES = await r.json();
  }catch(err){
    console.warn('[ZP] No se pudo cargar zona_patrimonio.geojson:', err.message);
    ZP_DESIGNACIONES = { type:'FeatureCollection', features:[] };
  }
  // SIPAM vive en archivo propio (por su peso) y se fusiona en caliente
  try{
    const rs = await fetch('data/sipam_fao.geojson');
    if(rs.ok){
      const sip = await rs.json();
      (sip.features||[]).forEach(f => ZP_DESIGNACIONES.features.push(f));
    }
  }catch(err){ console.warn('[ZP] SIPAM no disponible:', err.message); }
  return ZP_DESIGNACIONES;
}

/* Registro de capas ZP para toggles independientes (key → {layer, color, label}) */
let zpLayers = {};

async function initZPMap(){
  const canvas = document.getElementById('zpMapCanvas');
  if(!canvas || typeof L === 'undefined') return;
  if(zpMap){ zpMap.remove(); zpMap = null; }
  zpLayers = {};

  if(!GEOMETRIES) await loadGeometries();
  const zp = await loadZonaPatrimonio();

  zpMap = L.map(canvas, { zoomControl:true, scrollWheelZoom:false });
  setZPBaseLayer('positron');

  const bounds = L.latLngBounds([]);
  const orden = [];   // orden de los chips en el panel

  // (a) Contenedor + designaciones (archivo aislado) — cada una es su propia capa
  [...(zp.features||[])]
    .sort((a,b)=>(a.properties.orden||0)-(b.properties.orden||0))
    .forEach(feat=>{
      const p = feat.properties;
      const key = p.capa;
      const style = p.es_contenedor
        ? { color:p.color, weight:2.5, fillColor:p.color, fillOpacity:0.06, dashArray:'6 5' }
        : (p.tipo === 'designacion'
            ? { color:p.color, weight:2, fillColor:p.color, fillOpacity:0.10, dashArray:'1 5', lineCap:'round' }
            : { color:p.color, weight:1.5, fillColor:p.color, fillOpacity:0.25 });
      const lyr = L.geoJSON(feat, { style }).bindTooltip(p.nombre, {sticky:true, direction:'top'});
      const baseFill = style.fillOpacity;
      lyr.on('click', ()=> openZPFicha(key));
      lyr.on('mouseover', ()=> lyr.setStyle({fillOpacity:Math.min(baseFill+0.15,0.5)}));
      lyr.on('mouseout',  ()=> lyr.setStyle({fillOpacity:baseFill}));
      lyr.addTo(zpMap);
      zpLayers[key] = { layer:lyr, color:p.color, label:p.nombre };
      orden.push(key);
      try{ bounds.extend(lyr.getBounds()); }catch(e){}
    });

  // (b) Miembros del inventario — SOLO LECTURA desde GEOMETRIES, no crea registros.
  //     Color POR CATEGORÍA (todas las ANP locales igual, todos los BU igual, etc.)
  (GEOMETRIES && GEOMETRIES.features || [])
    .filter(f=>ZP_INVENTARIO.has(f.properties.nombre))
    .sort((a,b)=> (a.properties.grupo||'').localeCompare(b.properties.grupo||'','es') ||
                  (a.properties.nombre||'').localeCompare(b.properties.nombre||'','es'))
    .forEach(feat=>{
      const key = 'INV::' + feat.properties.nombre;
      const color = GROUP_COLORS[feat.properties.grupo] || '#666';
      const lyr = L.geoJSON(feat, { style:{color, weight:1.5, fillColor:color, fillOpacity:0.30} })
        .bindTooltip(feat.properties.nombre, {sticky:true, direction:'top'});
      lyr.on('click', ()=> openZPFicha(key));
      lyr.on('mouseover', ()=> lyr.setStyle({fillOpacity:0.45, weight:3}));
      lyr.on('mouseout',  ()=> lyr.setStyle({fillOpacity:0.30, weight:1.5}));
      lyr.addTo(zpMap);
      zpLayers[key] = { layer:lyr, color, label:feat.properties.nombre };
      orden.push(key);
      try{ bounds.extend(lyr.getBounds()); }catch(e){}
    });

  if(bounds.isValid()){ zpMap.fitBounds(bounds, {padding:[20,20]}); zpMap._siaHome = bounds; }

  // (c) Embarcaderos — capa de puntos toggleable por tipo (Turístico / Productivo).
  //     Archivo propio y opcional; si no existe, simplemente no se generan chips.
  const emb = await loadEmbarcaderos();
  const embGroups = { 'Turístico':L.layerGroup(), 'Productivo':L.layerGroup() };
  (emb.features||[]).forEach(f=>{
    if(!f.geometry || f.geometry.type!=='Point') return;
    const tipo = normEmbTipo(f.properties && f.properties.tipo);
    if(!tipo) return;
    const [lng,lat] = f.geometry.coordinates;
    if(typeof lat!=='number' || typeof lng!=='number') return;
    const col = EMB_COLORS[tipo];
    const nombre = (f.properties && f.properties.nombre) || 'Embarcadero';
    const alcaldia = (f.properties && f.properties.alcaldia) || '';
    L.circleMarker([lat,lng], {radius:6, color:'#fff', weight:2, fillColor:col, fillOpacity:0.95})
      .bindTooltip(alcaldia ? `${nombre} · ${tipo} · ${alcaldia}` : `${nombre} · ${tipo}`, {direction:'top'})
      .addTo(embGroups[tipo]);
  });
  [['EMB::Turístico','Embarcaderos turísticos','Turístico'],
   ['EMB::Productivo','Embarcaderos productivos','Productivo']].forEach(([key,label,tipo])=>{
    if(embGroups[tipo].getLayers().length===0) return;   // sin puntos de ese tipo → sin chip
    zpLayers[key] = { layer:embGroups[tipo], color:EMB_COLORS[tipo], label, defaultOff:true };
    orden.push(key);
  });

  // Panel de chips: un toggle independiente por capa
  const cont = document.getElementById('zpFilters');
  if(cont){
    cont.innerHTML = orden.map(key=>{
      const it = zpLayers[key];
      const activeCls = it.defaultOff ? '' : ' active';
      return `<button class="map-filter-chip${activeCls}" style="--chip-color:${it.color}" data-key="${key}" type="button">
        <span class="chip-dot"></span><span>${it.label}</span></button>`;
    }).join('');
    cont.querySelectorAll('.map-filter-chip').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        const it = zpLayers[chip.dataset.key];
        if(!it) return;
        const on = chip.classList.toggle('active');
        if(on) it.layer.addTo(zpMap); else zpMap.removeLayer(it.layer);
      });
    });
  }

  // Buscador de dirección / coordenadas (reutiliza el geocoder existente)
  addResetViewControl(zpMap, 'Vista general · Zona Patrimonio');
  addLocateControl(zpMap, ll=>featuresContaining(getZPAllFeatures(), ll), getZPAllFeatures);

  // Toggle de capa base Mapa/Satélite — clone-and-replace para evitar listeners duplicados al re-inicializar
  document.querySelectorAll('#zpLayerToggle button').forEach(btn=>{
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', ()=> setZPBaseLayer(fresh.dataset.layer));
  });

  // Botón de pantalla completa (Fullscreen API nativa · reutiliza el helper existente)
  attachFullscreenBtn(canvas, zpMap);

  // Clic en fila de la tabla → abre la ficha lateral
  document.querySelectorAll('#zpTable tr[data-zpkey]').forEach(tr=>{
    tr.addEventListener('click', ()=> openZPFicha(tr.dataset.zpkey));
  });

  // Subpestañas Declaratorias / Embarcaderos
  const subtabs = document.querySelectorAll('.zp-subtab');
  subtabs.forEach(b=> b.addEventListener('click', ()=>{
    subtabs.forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const sub = b.dataset.zpsub;
    const pd = document.getElementById('zpPanelDecl'), pe = document.getElementById('zpPanelEmb');
    if(pd) pd.hidden = (sub!=='decl');
    if(pe) pe.hidden = (sub!=='emb');
  }));

  // Tabla + conteo de embarcaderos (clic en fila → ficha + zoom al punto)
  const embFeats = (emb.features||[]).filter(f => f.geometry && f.geometry.type==='Point' && normEmbTipo(f.properties && f.properties.tipo));
  const nPro = embFeats.filter(f=>normEmbTipo(f.properties.tipo)==='Productivo').length;
  const nTur = embFeats.filter(f=>normEmbTipo(f.properties.tipo)==='Turístico').length;
  const embCountEl = document.getElementById('zpEmbCount');
  if(embCountEl) embCountEl.innerHTML = `<b>${embFeats.length}</b> embarcaderos · ${nPro} productivos · ${nTur} turísticos. Clic en una fila para ver la ficha y hacer zoom en el mapa.`;
  const embBtn = document.querySelector('.zp-subtab[data-zpsub="emb"]');
  /* Sin embarcaderos capturados la subpestaña no se ofrece: el archivo de
     datos traía dos puntos de EJEMPLO que llegaron a producción (auditoría
     del repositorio, 13-sep-2026). Cuando exista el padrón real, basta con
     poblar data/embarcaderos.geojson. */
  if(embBtn){ embBtn.textContent = `Embarcaderos (${embFeats.length})`; embBtn.hidden = embFeats.length === 0; }
  const embTbody = document.querySelector('#zpEmbTable tbody');
  if(embTbody){
    zpEmb = {};
    embTbody.innerHTML = embFeats.map((f,i)=>{
      const p = f.properties||{}, tipo = normEmbTipo(p.tipo);
      const [lng,lat] = f.geometry.coordinates;
      zpEmb['E'+i] = { props:p, tipo, lat, lng };
      return `<tr data-emb="E${i}">
        <td class="name"><span class="zp-dot" style="background:${EMB_COLORS[tipo]||COL_AZUL_EMB}"></span>${p.nombre||'—'}</td>
        <td>${tipo}</td><td>${p.alcaldia||'—'}</td><td>${p.clasificacion||'—'}</td>
        <td class="num">${p.sup_m2!=null?fmt(p.sup_m2):'—'}</td></tr>`;
    }).join('');
    embTbody.querySelectorAll('tr[data-emb]').forEach(tr=>{
      tr.addEventListener('click', ()=> openEmbFicha(zpEmb[tr.dataset.emb]));
    });
  }

  // Recalcular tamaño tras render del panel
  setTimeout(()=>{ try{ zpMap.invalidateSize(); }catch(e){} }, 120);
}

/* Toggle de capa base (Mapa/Satélite) para el mapa de Zona Patrimonio.
   Reutiliza TILE_LAYERS; mantiene los polígonos por encima de la capa base. */
function setZPBaseLayer(key){
  if(!zpMap) return;
  if(zpMap._activeBase) zpMap.removeLayer(zpMap._activeBase);
  const cfg = TILE_LAYERS[key] || TILE_LAYERS.positron;
  zpMap._activeBase = L.tileLayer(cfg.url, {attribution:cfg.attribution, maxZoom:cfg.maxZoom}).addTo(zpMap);
  _marcarBase(zpMap, key);
  // Mantener polígonos y puntos (LayerGroup) por encima de la capa base
  Object.values(zpLayers).forEach(it=>{ try{
    if(!zpMap.hasLayer(it.layer)) return;
    if(typeof it.layer.bringToFront === 'function') it.layer.bringToFront();
    else if(typeof it.layer.eachLayer === 'function') it.layer.eachLayer(l=>{ if(l.bringToFront) l.bringToFront(); });
  }catch(e){} });
  document.querySelectorAll('#zpLayerToggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.layer===key);
  });
}

function renderZonaPatrimonioPage(){
  return `
  <div class="panel">
    <div class="panel-eyebrow">Patrimonio Mundial · UNESCO · Valor Universal Excepcional</div>
    <h2 class="panel-title" style="color:var(--guinda)">Zona Patrimonio Natural y Cultural de la Humanidad</h2>
    <p class="panel-intro">Xochimilco, Tláhuac y Milpa Alta · <b>7,534.17 ha</b> · convergencia de instrumentos
      de protección internacionales, federales y locales sobre un mismo territorio chinampero.
      Active o desactive cada capa de forma independiente. Esta sección es únicamente cartográfica;
      no forma parte del inventario ANP/AVA ni afecta sus tablas, filtros o conteos.</p>

    <div class="map-filters" id="zpFilters" style="margin-top:14px"></div>

    <div class="map-canvas" id="zpMapCanvas" style="position:relative;height:560px;border-radius:12px;overflow:hidden;margin-top:6px">
      <!-- Toggle Mapa/Satélite + botón pantalla completa (esquina superior derecha) -->
      <div class="map-block-controls map-block-controls-floating">
        <div class="map-block-toggle" id="zpLayerToggle">
          <button data-layer="positron" class="active">Mapa</button>
          <button data-layer="satelite">Satélite</button>
        </div>
        <button class="map-fullscreen-btn" type="button" aria-label="Pantalla completa" title="Pantalla completa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>
        </button>
      </div>
    </div>

    <style>
      #zpTable{width:100%;border-collapse:collapse;font-family:'Roboto',sans-serif;font-size:var(--fs-sm)}
      #zpTable thead th{background:var(--guinda);color:#fff;text-align:left;padding:9px 12px;font-weight:600;white-space:nowrap}
      #zpTable thead th:last-child,#zpTable td.num{text-align:right}
      #zpTable tbody tr{cursor:pointer;border-top:1px solid var(--line-soft);transition:background .12s}
      #zpTable tbody tr:hover{background:var(--bg-2)}
      #zpTable td{padding:8px 12px;color:var(--ink-2);vertical-align:top}
      #zpTable td.name{color:var(--ink);font-weight:500;white-space:nowrap}
      #zpTable .zp-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:7px;vertical-align:middle}
      .zp-desig td:first-child{font-style:normal}
      .zp-desig{background:rgba(157,33,72,.035)}
      #zpEmbTable{width:100%;border-collapse:collapse;font-family:'Roboto',sans-serif;font-size:var(--fs-sm)}
      #zpEmbTable thead th{background:${COL_AZUL_EMB};color:#fff;text-align:left;padding:9px 12px;font-weight:600;white-space:nowrap}
      #zpEmbTable td.num{text-align:right}
      #zpEmbTable tbody tr{cursor:pointer;border-top:1px solid var(--line-soft);transition:background .12s}
      #zpEmbTable tbody tr:hover{background:var(--bg-2)}
      #zpEmbTable td{padding:8px 12px;color:var(--ink-2);vertical-align:top}
      #zpEmbTable td.name{color:var(--ink);font-weight:500;white-space:nowrap}
      #zpEmbTable .zp-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:7px;vertical-align:middle}
      .zp-subtabs{margin-top:24px;display:flex;gap:8px;flex-wrap:wrap}
      .zp-subtab{padding:7px 16px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink-2);font-size:var(--fs-base);font-weight:600;cursor:pointer;font-family:'Roboto',sans-serif;transition:all .12s}
      .zp-subtab:hover{background:var(--bg-2)}
      .zp-subtab.active{background:var(--guinda);color:#fff;border-color:var(--guinda)}
    </style>

    <div class="zp-subtabs">
      <button class="zp-subtab active" data-zpsub="decl" type="button">Declaratorias (11)</button>
      <button class="zp-subtab" data-zpsub="emb" type="button">Embarcaderos</button>
    </div>

    <div id="zpPanelDecl">
      <div class="panel-eyebrow" style="margin-bottom:4px">Declaratorias, decretos y reconocimientos</div>
      <p class="panel-intro" style="margin-bottom:10px">Categorías de protección y designaciones concurrentes dentro de la Zona Patrimonio.
        Clic en una fila —o en un polígono del mapa— para abrir la ficha lateral.</p>
      <div style="overflow-x:auto;border:1px solid var(--line);border-radius:10px">
        <table id="zpTable">
          <caption class="sr-only">Designaciones de la Zona Patrimonio Mundial Natural y Cultural de la Humanidad en Xochimilco, Tláhuac y Milpa Alta</caption>
          <thead><tr>
            <th>Área / Declaratoria</th><th>Instrumento / Categoría</th><th>Grupo / Ámbito</th>
            <th>Alcaldía(s)</th><th>Decreto / Inscripción</th><th>Sup. (ha)</th><th>P. Manejo / Act.</th>
          </tr></thead>
          <tbody>
            ${ZP_DATA.map(r=>`<tr data-zpkey="${r.key}" class="${r.es_designacion?'zp-desig':''}">
              <td class="name"><span class="zp-dot" style="background:${r.color}"></span>${r.nombre}</td>
              <td>${r.categoria||'—'}</td>
              <td>${r.grupo||'—'}</td>
              <td>${r.alcaldia||'—'}</td>
              <td>${r.fecha_decreto||'—'}</td>
              <td class="num">${r.superficie!=null?fmt(r.superficie):'—'}</td>
              <td>${r.fecha_pm||'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div id="zpPanelEmb" hidden style="margin-top:16px">
      <div class="panel-eyebrow" style="margin-bottom:4px">Embarcaderos del sistema chinampero</div>
      <div class="panel-intro" id="zpEmbCount" style="margin-bottom:10px">Cargando…</div>
      <div style="overflow-x:auto;border:1px solid var(--line);border-radius:10px">
        <table id="zpEmbTable">
          <caption class="sr-only">Embarcaderos registrados en la Zona Patrimonio</caption>
          <thead><tr><th>Embarcadero</th><th>Tipo</th><th>Alcaldía</th><th>Clasificación</th><th>Sup. (m²)</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ============================================================
 * Módulo ARCAC · Núcleos agrarios en suelo de conservación (AISLADO)
 * No toca DATA ni el inventario. Fuente propia: data/arcac.geojson
 * ============================================================ */
let ARCAC_GEO = null, globalArcacLayer = null, arcacByNo = {};
const ARCAC_COLORS = { 'Comunidad':'var(--arcac-com)', 'Ejido':'var(--arcac-eji)' };   // color de TENENCIA (badges/filtros)

/* Badge de tenencia (color) para tabla y ficha */
function arcacBadge(ten){
  const c = ARCAC_COLORS[ten] || '#868e96';
  return `<span class="ten-badge" style="background:${c}">${ten||'—'}</span>`;
}

async function loadARCAC(){
  if(ARCAC_GEO) return ARCAC_GEO;
  try{
    const r = await fetch('data/arcac.geojson');
    if(!r.ok) throw new Error('HTTP '+r.status);
    ARCAC_GEO = await r.json();
    // Color DISTINTO por ARCAC (ángulo áureo → máxima separación entre vecinos)
    const feats = (ARCAC_GEO.features||[]).slice().sort((a,b)=>a.properties.no-b.properties.no);
    /* El color del polígono es el de la TENENCIA, no uno por núcleo: así el mapa,
     el badge de la tabla y el filete de la fila dicen lo mismo. La rueda de 30
     matices del módulo anterior competía con la paleta institucional y no
     codificaba ningún dato. */
  feats.forEach(f=>{ f.properties._color = ARCAC_COLORS[f.properties.tenencia] || 'var(--arcac-com)'; arcacByNo[f.properties.no]=f.properties; });
  }catch(err){ console.warn('[ARCAC] no disponible:', err.message); ARCAC_GEO = {type:'FeatureCollection',features:[]}; }
  return ARCAC_GEO;
}

/* Ficha lateral de una ARCAC (mismo drawer #dr) con mini-mapa del polígono */
function openARCACFicha(no){
  const p = arcacByNo[no];
  if(!p) return;
  if(typeof destroyMap === 'function'){ try{ destroyMap(); }catch(e){} }
  _marcaFicha(true);
  /* Abre en la posición alta: la ficha es el objeto de la consulta y a media
     altura obligaba a un gesto extra para leer superficie, decreto y suelo de
     conservación. Las otras dos posiciones siguen a un tirón del asa. */
  if(_drMovil()) setTimeout(()=>drIr(_drAlturas()[3]), 0);
  drIn.innerHTML = `
    <div class="drawer-header-row"><div class="drawer-header-left">
      <div class="kat">ARCAC · Núcleo agrario</div>
      <h2>${p.nombre}</h2>
      <div class="subcat">${arcacBadge(p.tenencia)}</div>
    </div>${botonCompartirHTML()}</div>
    ${fichaMapaHTML()}
    <div class="big-num">${fmt(p.sup_ha)}<span style="font-size:var(--fs-lg);color:var(--muted);margin-left:6px;font-weight:500">ha</span></div>
    <div class="big-num-lbl">Superficie</div>
    <div class="field"><div class="k">Tenencia</div><div class="v">${arcacBadge(p.tenencia)}</div></div>
    <div class="field"><div class="k">Alcaldía</div><div class="v">${p.alcaldia||'—'}</div></div>
    <div class="field"><div class="k">No. de registro</div><div class="v">${p.no||'—'}</div></div>
    <div class="legal-block"><div class="title">ℹ ARCAC</div><p>Área de Restauración y Conservación Ambiental Comunitaria (núcleo agrario en suelo de conservación). Capa complementaria; no forma parte del inventario ANP/AVA ni de sus conteos.</p></div>
  `;
  bd.classList.add('open'); dr.classList.add('open');
  /* La geometría llega bajo demanda: el descriptor se arma al conectar, ya
     cargada la capa, o el polígono saldría vacío en la imagen. */
  loadARCAC().then(()=>{ initARCACFichaMap(no); conectarCompartir(descArcac(p));
    setTimeout(()=>{ try{ montarBotonBase(); }catch(e){} }, 80); });
}

/* Mini-mapa del polígono dentro de la ficha ARCAC */
function initARCACFichaMap(no){
  const container = document.getElementById('mapCanvas');
  if(!container || typeof L==='undefined') return;
  const feat = ((ARCAC_GEO&&ARCAC_GEO.features)||[]).find(f=>f.properties.no===no);
  if(!feat){ container.classList.add('no-data'); container.innerHTML='<div><b>Polígono no disponible</b></div>'; return; }
  container.classList.remove('no-data');
  const canvasAR = document.getElementById('mapCanvasMap') || container;
  canvasAR.innerHTML = '';
  activeMap = L.map(canvasAR, { zoomControl:true, scrollWheelZoom:false, attributionControl:true });
  setBaseLayer('positron');
  try{ createAlcaldiasLayer({interactive:false}).addTo(activeMap); }catch(e){}
  const col = feat.properties._color || 'var(--arcac-com)';
  activeGeoLayer = L.geoJSON(feat, {style:{color:col, weight:2.5, fillColor:col, fillOpacity:0.14}}).addTo(activeMap);
  activeGeoLayer.bindTooltip(`${feat.properties.nombre} · ${feat.properties.tenencia}`, {sticky:true, direction:'top'});
  try{ activeMap.fitBounds(activeGeoLayer.getBounds(), {padding:[20,20], maxZoom:15}); activeMap._siaHome = activeGeoLayer.getBounds(); }catch(e){}
  fichaMapaConectar(container);
  addLocateControl(activeMap, ll=>featuresContaining((ARCAC_GEO&&ARCAC_GEO.features)||[], ll), ()=>(ARCAC_GEO&&ARCAC_GEO.features)||[]);
  addResetViewControl(activeMap, 'Volver al polígono');
  addSearchMarkerTo(activeMap);
}

/* Capa L.geoJSON de ARCAC con color DISTINTO por feature, clic→ficha (+zoom opcional) */
function buildArcacGeoLayer(fc, zoomMap){
  return L.geoJSON(fc, {
    style: f => { const c = f.properties._color || 'var(--arcac-com)'; return {color:c, weight:1.25, fillColor:c, fillOpacity:0.30}; },
    onEachFeature: (feat,lyr)=>{
      const p=feat.properties;
      lyr.bindTooltip(`${p.nombre} · ${p.tenencia} · ${p.alcaldia}`, {sticky:true, direction:'top'});
      lyr.on('click', ()=>{ openARCACFicha(p.no); if(zoomMap){ try{ zoomMap.fitBounds(lyr.getBounds(), {padding:[30,30], maxZoom:15}); }catch(e){} } });
      lyr.on('mouseover', ()=>lyr.setStyle({weight:3, fillOpacity:0.55}));
      lyr.on('mouseout',  ()=>lyr.setStyle({weight:1.25, fillOpacity:0.30}));
    }
  });
}

/* Render de filas de la tabla ARCAC (búsqueda + filtros + orden) */



/* ═══════════════════════════════════════════════════════════════════════
   MÓDULO TRASLAPES · superposiciones espaciales entre instrumentos
   ═══════════════════════════════════════════════════════════════════════
   Los polígonos de intersección se precalculan (data/traslapes.geojson):
   hacerlo en el navegador exigiría una librería de clipping geométrico y
   el sitio solo carga Leaflet. El archivo lleva su fecha de generación y
   el módulo la muestra en pantalla. Para regenerarlo: tools/traslapes.py

   Capa aislada: no entra a DATA ni a GEOMETRIES, no toca contadores.
   ═══════════════════════════════════════════════════════════════════════ */
const TRAS_COLORS = {
  'Inventario × Inventario'     : 'var(--guinda)',
  'Inventario × ARCAC'          : 'var(--arcac-com)',
  'Inventario × Zona Patrimonio': '#444441',
  'ARCAC × Zona Patrimonio'     : '#B28E5C',
  'ARCAC × ARCAC'               : '#B3321A'
};
let TRASLAPES_GEO = null, traslapesMap = null, traslapesLayers = {};
let trasState = { q:'', cruce:'todos', sortKey:'ha', sortDir:-1 };

async function loadTraslapes(){
  if(TRASLAPES_GEO) return TRASLAPES_GEO;
  try{
    const r = await fetch('data/traslapes.geojson');
    if(!r.ok) throw new Error('HTTP ' + r.status);
    TRASLAPES_GEO = await r.json();
  }catch(err){
    console.warn('[Traslapes] no disponible:', err.message);
    TRASLAPES_GEO = { type:'FeatureCollection', features:[] };
  }
  return TRASLAPES_GEO;
}

function trasFeats(){ return (TRASLAPES_GEO && TRASLAPES_GEO.features) || []; }

function renderTraslapesPage(){
  return `
  <div class="panel">
    <div class="panel-eyebrow">Análisis espacial · superposición de instrumentos de protección</div>
    <h2 class="panel-title" style="color:var(--magenta)">Traslapes entre áreas</h2>
    <p class="panel-intro">Un mismo predio puede estar cubierto por más de un instrumento: dos decretos de
      protección, un ANP y un ARCAC, o un área del inventario dentro del polígono de Patrimonio Mundial.
      Este módulo mide esas superposiciones sobre la geometría real y las dibuja en el mapa.
      Es información de coordinación: donde hay traslape, hay más de una autoridad y más de un
      programa de manejo aplicables al mismo territorio.</p>

    <div class="hero" id="trasKpis" style="margin-top:16px"></div>

    <div class="map-filters" id="trasFilters" style="margin-top:14px"></div>
    <div class="map-canvas" id="trasMapCanvas" style="position:relative;height:520px;border-radius:12px;overflow:hidden;margin-top:6px">
      <div class="map-block-controls map-block-controls-floating">
        <div class="map-block-toggle" id="trasLayerToggle">
          <button data-layer="positron" class="active">Mapa</button>
          <button data-layer="satelite">Satélite</button>
        </div>
        <button class="map-fullscreen-btn" type="button" aria-label="Pantalla completa" title="Pantalla completa"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg></button>
      </div>
    </div>

    <style>
      #trasTable{width:100%;border-collapse:collapse;font-family:'Roboto',sans-serif;font-size:var(--fs-sm)}
      #trasTable thead th{background:var(--magenta);color:#fff;text-align:left;padding:9px 12px;font-weight:600;white-space:nowrap;cursor:pointer;position:sticky;top:0}
      #trasTable thead th:hover{background:#b3236f}
      #trasTable thead th.num{text-align:right}
      #trasTable td.num{text-align:right;font-family:'Roboto Mono',monospace}
      #trasTable tbody tr{cursor:pointer;border-top:1px solid var(--line-soft);transition:background .12s}
      #trasTable tbody tr:hover{background:var(--bg-2)}
      #trasTable td{padding:8px 12px;color:var(--ink-2);vertical-align:top}
      #trasTable td.name{color:var(--ink);font-weight:500}
      #trasTable .sub{display:block;font-family:'Roboto Mono',monospace;font-size:var(--fs-mini);color:var(--muted);margin-top:2px}
      .tras-dot{width:11px;height:11px;border-radius:var(--r-ui);display:inline-block;margin-right:8px;vertical-align:middle;border:1px solid rgba(0,0,0,.15)}
      .tras-toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 12px;align-items:center}
      .tras-toolbar input,.tras-toolbar select{font-family:'Roboto',sans-serif;font-size:var(--fs-sm);padding:8px 12px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;color:var(--ink)}
      .tras-toolbar input{flex:1;min-width:220px}
      .tras-toolbar input:focus,.tras-toolbar select:focus{outline:2px solid var(--magenta);outline-offset:1px}
      .tras-nota{background:#fff;border-left:3px solid var(--dorado);padding:12px 14px;border-radius:0 4px 4px 0;
        font-size:var(--fs-sm);color:var(--ink-2);line-height:1.5;margin-top:18px;box-shadow:var(--shadow)}
      .tras-nota b{color:var(--ink)}
    </style>

    <div style="margin-top:24px">
      <div class="panel-eyebrow" style="margin-bottom:4px">Pares con superposición</div>
      <div class="panel-intro" id="trasCount" style="margin-bottom:6px">Cargando…</div>
      <div class="tras-toolbar">
        <input id="trasSearch" type="text" placeholder="Buscar área…">
        <select id="trasCruceFilter"><option value="todos">Todos los cruces</option></select>
        <button class="btn ghost" id="trasCsv" type="button">↓ CSV</button>
      </div>
      <div style="overflow-x:auto;border:1px solid var(--line);border-radius:10px;max-height:520px">
        <table id="trasTable">
          <caption class="sr-only">Traslapes cartográficos entre áreas del inventario y entre éstas y el Suelo de Conservación</caption>
          <thead><tr>
            <th data-sort="a">Área A<span class="sort-ind"></span></th>
            <th data-sort="b">Área B<span class="sort-ind"></span></th>
            <th data-sort="cruce">Cruce<span class="sort-ind"></span></th>
            <th data-sort="ha" class="num">Traslape (ha)<span class="sort-ind"></span></th>
            <th data-sort="pct_a" class="num">% de A<span class="sort-ind"></span></th>
            <th data-sort="pct_b" class="num">% de B<span class="sort-ind"></span></th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="tras-nota" id="trasNota">Cargando metodología…</div>
    </div>
  </div>`;
}

function initTraslapesMap(){
  const cont = document.getElementById('trasMapCanvas');
  if(!cont || typeof L === 'undefined') return;
  if(traslapesMap){ try{ traslapesMap.remove(); }catch(e){} traslapesMap=null; }
  traslapesMap = L.map(cont, { zoomControl:true, scrollWheelZoom:false, attributionControl:true });
  traslapesMap._activeBase = L.tileLayer(TILE_LAYERS.positron.url,
      {attribution:TILE_LAYERS.positron.attribution, maxZoom:TILE_LAYERS.positron.maxZoom}).addTo(traslapesMap);
  try{ createAlcaldiasLayer({interactive:false}).addTo(traslapesMap); }catch(e){}
  traslapesMap.on('click focus', ()=> traslapesMap.scrollWheelZoom.enable());
  traslapesMap.on('mouseout',    ()=> traslapesMap.scrollWheelZoom.disable());

  document.querySelectorAll('#trasLayerToggle button').forEach(btn=>{
    const fresh = btn.cloneNode(true); btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', ()=>{
      const key = fresh.dataset.layer;
      if(traslapesMap._activeBase) traslapesMap.removeLayer(traslapesMap._activeBase);
      const cfg = TILE_LAYERS[key] || TILE_LAYERS.positron;
      traslapesMap._activeBase = L.tileLayer(cfg.url,{attribution:cfg.attribution,maxZoom:cfg.maxZoom}).addTo(traslapesMap);
      _marcarBase(traslapesMap, key);
      Object.values(traslapesLayers).forEach(o=>{ try{ o.layer.bringToFront(); }catch(e){} });
      document.querySelectorAll('#trasLayerToggle button').forEach(b=>b.classList.toggle('active', b.dataset.layer===key));
    });
  });
  attachFullscreenBtn(cont, traslapesMap);
  addLocateControl(traslapesMap, ll=>featuresContaining(trasFeats(), ll));
  addResetViewControl(traslapesMap, 'Vista general · traslapes');

  loadTraslapes().then(fc=>{
    if(!traslapesMap) return;
    traslapesLayers = {};
    const bounds = L.latLngBounds([]);
    const porCruce = {};
    (fc.features||[]).forEach(f=>{ (porCruce[f.properties.cruce] = porCruce[f.properties.cruce] || []).push(f); });

    Object.entries(porCruce).forEach(([cruce, feats])=>{
      const color = TRAS_COLORS[cruce] || 'var(--magenta)';
      const lyr = L.geoJSON({type:'FeatureCollection',features:feats}, {
        style: ()=>({color, weight:1.6, fillColor:color, fillOpacity:0.45}),
        onEachFeature: (feat, l)=>{
          const p = feat.properties;
          l.bindTooltip(`${esc(p.a)} ∩ ${esc(p.b)}`, {sticky:true, direction:'top'});
          l.bindPopup(trasPopup(p), {maxWidth:300, minWidth:240});
          l.on('mouseover', ()=>l.setStyle({fillOpacity:0.7, weight:2.6}));
          l.on('mouseout',  ()=>l.setStyle({fillOpacity:0.45, weight:1.6}));
        }
      }).addTo(traslapesMap);
      traslapesLayers[cruce] = {layer:lyr, color, label:`${cruce} (${feats.length})`};
      try{ bounds.extend(lyr.getBounds()); }catch(e){}
    });
    if(bounds.isValid()){ traslapesMap.fitBounds(bounds,{padding:[20,20]}); traslapesMap._siaHome = bounds; }

    // Chips de filtro del mapa
    const cont2 = document.getElementById('trasFilters');
    if(cont2){
      cont2.innerHTML = Object.entries(traslapesLayers).map(([k,it])=>
        `<button class="map-filter-chip active" style="--chip-color:${it.color}" data-key="${esc(k)}" type="button"><span class="chip-dot"></span>${esc(it.label)}</button>`).join('');
      cont2.querySelectorAll('.map-filter-chip').forEach(b=>{
        b.addEventListener('click', ()=>{
          const k=b.dataset.key, it=traslapesLayers[k]; if(!it) return;
          const on=b.classList.toggle('active');
          if(on) it.layer.addTo(traslapesMap); else traslapesMap.removeLayer(it.layer);
        });
      });
    }
    renderTrasKpis(fc);
    renderTrasTabla();
  });
}

function trasPopup(p){
  const c = TRAS_COLORS[p.cruce] || 'var(--magenta)';
  return `<div class="lp">
    <div class="lp-cat"><span class="lp-dot" style="background:${esc(c)}"></span>${esc(p.cruce)}</div>
    <div class="lp-nom sm">${esc(p.a)}</div>
    <div class="lp-mas">${esc(p.a_sub)} · ${p.pct_a}% de su superficie</div>
    <div class="lp-nom sm" style="margin-top:9px">${esc(p.b)}</div>
    <div class="lp-mas">${esc(p.b_sub)} · ${p.pct_b}% de su superficie</div>
    <div class="lp-pie"><span class="lp-ctx">Superficie compartida</span>
      <span style="font-family:'Roboto Mono',monospace;font-size:var(--fs-base);font-weight:700;color:${esc(c)}">${fmt(p.ha)} ha</span></div>
  </div>`;
}

function renderTrasKpis(fc){
  const el = document.getElementById('trasKpis'); if(!el) return;
  const fs = fc.features || [];
  const anpArcac = fs.filter(f=>f.properties.cruce==='Inventario × ARCAC').length;
  const dentro100 = fs.filter(f=>f.properties.cruce==='Inventario × Zona Patrimonio' && f.properties.pct_a>=99.5).length;
  const dobles = fc.doble_conteo_ha != null ? fc.doble_conteo_ha : 0;
  el.innerHTML = `
    <div class="hero-card"><div class="hero-label">Pares con traslape</div>
      <div class="hero-value">${fmtInt(fs.length)}</div>
      <div class="hero-sub">umbral ${fc.umbral_ha || 0.5} ha</div></div>
    <div class="hero-card"><div class="hero-label">Superficie contada dos veces</div>
      <div class="hero-value" style="color:var(--magenta)">${fmt(dobles)}<span class="u">ha</span></div>
      <div class="hero-sub">dentro del inventario de 66 áreas</div></div>
    <div class="hero-card"><div class="hero-label">Áreas del inventario sobre ARCAC</div>
      <div class="hero-value">${anpArcac}</div>
      <div class="hero-sub">pares con doble instrumento</div></div>
    <div class="hero-card"><div class="hero-label">Íntegras en Patrimonio Mundial</div>
      <div class="hero-value">${dentro100}</div>
      <div class="hero-sub">100% dentro del polígono UNESCO</div></div>`;
}

function renderTrasTabla(){
  const tb = document.querySelector('#trasTable tbody'); if(!tb) return;
  const fc = TRASLAPES_GEO || {features:[]};
  const norm = t => String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

  const sel = document.getElementById('trasCruceFilter');
  if(sel && sel.options.length <= 1){
    const cruces = [...new Set((fc.features||[]).map(f=>f.properties.cruce))];
    cruces.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); });
    sel.addEventListener('change', ()=>{ trasState.cruce = sel.value; renderTrasTabla(); });
  }
  const inp = document.getElementById('trasSearch');
  if(inp && !inp._wired){ inp._wired=true;
    inp.addEventListener('input', ()=>{ trasState.q = inp.value; renderTrasTabla(); }); }
  const csv = document.getElementById('trasCsv');
  if(csv && !csv._wired){ csv._wired=true; csv.addEventListener('click', exportTraslapesCSV); }

  document.querySelectorAll('#trasTable thead th').forEach(th=>{
    if(th._wired) return; th._wired=true;
    th.addEventListener('click', ()=>{
      const k=th.dataset.sort;
      if(trasState.sortKey===k) trasState.sortDir*=-1; else { trasState.sortKey=k; trasState.sortDir = (k==='a'||k==='b'||k==='cruce')?1:-1; }
      renderTrasTabla();
    });
  });

  let rows = (fc.features||[]).map(f=>f.properties);
  if(trasState.cruce!=='todos') rows = rows.filter(r=>r.cruce===trasState.cruce);
  if(trasState.q.trim()){
    const q=norm(trasState.q);
    rows = rows.filter(r=>norm(r.a).includes(q)||norm(r.b).includes(q));
  }
  const k=trasState.sortKey, d=trasState.sortDir;
  rows.sort((x,y)=>{
    const a=x[k], b=y[k];
    if(typeof a==='number' && typeof b==='number') return (a-b)*d;
    return String(a).localeCompare(String(b),'es')*d;
  });

  tb.innerHTML = rows.length ? rows.map(r=>{
    const c = TRAS_COLORS[r.cruce] || 'var(--magenta)';
    return `<tr data-a="${esc(r.a)}">
      <td class="name"><span class="tras-dot" style="background:${esc(c)}"></span>${esc(r.a)}<span class="sub">${esc(r.a_sub)}</span></td>
      <td class="name">${esc(r.b)}<span class="sub">${esc(r.b_sub)}</span></td>
      <td>${esc(r.cruce)}</td>
      <td class="num">${fmt(r.ha)}</td>
      <td class="num">${r.pct_a}%</td>
      <td class="num">${r.pct_b}%</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="padding:18px;text-align:center;color:var(--muted)">Sin resultados.</td></tr>';

  tb.querySelectorAll('tr[data-a]').forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const nombre = tr.dataset.a;
      const area = (typeof DATA!=='undefined') ? DATA.find(x=>x.nombre===nombre) : null;
      if(area){ openDrawer(area); return; }
      const f = (TRASLAPES_GEO.features||[]).find(x=>x.properties.a===nombre);
      if(f && traslapesMap){ try{ traslapesMap.fitBounds(L.geoJSON(f).getBounds(),{padding:[30,30],maxZoom:15}); }catch(e){} }
    });
  });

  const cnt = document.getElementById('trasCount');
  if(cnt) cnt.textContent = `${rows.length} de ${(fc.features||[]).length} pares`;

  const nota = document.getElementById('trasNota');
  if(nota) nota.innerHTML = `<b>Metodología.</b> ${esc(fc.nota||'')}
    Superficies calculadas en proyección plana local (error &lt;0.1% a escala CDMX).
    <b>Cálculo generado el ${esc(fc.generado||'—')}</b> sobre las geometrías vigentes en esa fecha;
    si se actualiza algún GeoJSON hay que regenerarlo. Suma de superficies individuales del inventario:
    ${fmt(fc.suma_individual_ha||0)} ha · unión real del territorio: ${fmt(fc.union_ha||0)} ha.`;
}

function exportTraslapesCSV(){
  const fc = TRASLAPES_GEO || {features:[]};
  const q = s => `"${String(s==null?'':s).replace(/"/g,'""')}"`;
  const head = ['cruce','area_a','categoria_a','area_b','categoria_b','traslape_ha','pct_a','pct_b'];
  const lines = [head.join(',')].concat((fc.features||[]).map(f=>{
    const p=f.properties;
    return [p.cruce,p.a,p.a_sub,p.b,p.b_sub,p.ha,p.pct_a,p.pct_b].map(q).join(',');
  }));
  const blob = new Blob(['﻿'+lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `traslapes_sia_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  siaToast('CSV descargado.');
}


async function initGlobalMap(){
  const canvas = document.getElementById('globalMapCanvas');
  if(!canvas || typeof L==='undefined') return;
  destroyGlobalMap();
  
  // Asegura que las geometrías estén cargadas ANTES de continuar
  if(!GEOMETRIES) await loadGeometries();
  if(!GEOMETRIES || !GEOMETRIES.features){
    console.warn('[Mapa global] Geometrías no disponibles tras intentar cargar.');
    return;
  }
  
  /* zoomSnap fraccionario: con pasos enteros, un encuadre que se pasa por unos
     pocos píxeles cae un nivel completo y desperdicia media pantalla. Le pasaba
     a ARCAC, cuya extensión queda justo por encima del nivel 11. */
  globalMap = L.map(canvas, { zoomControl:true, scrollWheelZoom:false, zoomSnap:0.25 });
  /* Vista provisional ANTES de agregar capas: Leaflet falla en _clipPoints si
     dibuja vectores sin vista establecida. Pasaba en la pestaña ARCAC, donde
     ningún grupo del inventario aporta bounds y el mapa quedaba en blanco.
     El fitBounds de abajo (o el de ARCAC) la sustituye cuando hay geometría. */
  globalMap.setView([19.36, -99.13], 10);
  setGlobalBaseLayer('positron');
  
  // Capa de alcaldías como contexto territorial
  globalAlcaldiasLayer = createAlcaldiasLayer({interactive:true}).addTo(globalMap);
  
  // Crea capas SOLO de los grupos cuyo filtro está activo
  // En Global: los 4 grupos. En categorías: solo el grupo correspondiente.
  const groups = ['AVA · Bosque Urbano','AVA · Barranca','ANP · Local','ANP · Federal'];
  const allBounds = L.latLngBounds([]);

  groups.forEach(grupo => {
    if(!state.mapFilters[grupo]) return;  // saltar grupos inactivos

    const color = GROUP_COLORS[grupo];
    const features = (GEOMETRIES.features||[]).filter(f=>f.properties.grupo===grupo);
    const layer = L.geoJSON({type:'FeatureCollection',features}, {
      /* Categoría = nivel principal de la jerarquía: trazo más grueso que el
         régimen y que las superposiciones (1.25), relleno moderado. */
      style: { color, weight: 1.75, fillColor: color, fillOpacity: 0.20 },
      onEachFeature: (feat, lyr) => {
        lyr.bindTooltip(feat.properties.nombre, {sticky:true, direction:'top'});
        lyr.on('click', () => {
          const area = DATA.find(d => d.nombre === feat.properties.nombre);
          if(area) openDrawer(area);
        });
        lyr.on('mouseover', () => lyr.setStyle({weight:3, fillOpacity:0.38}));
        lyr.on('mouseout', () => lyr.setStyle({weight:1.75, fillOpacity:0.20}));
      }
    });
    layer.addTo(globalMap);
    globalGroupLayers[grupo] = layer;
    if(features.length) allBounds.extend(layer.getBounds());
  });
  
  if(allBounds.isValid()){ globalMap.fitBounds(allBounds, {padding:[20,20]}); globalMap._siaHome = allBounds; }

  // Aplicar resaltado de coadministración si el filtro estaba activo
  if(state.highlightCoadmin) applyCoadminHighlight();

  globalMap.on('click focus', () => globalMap.scrollWheelZoom.enable());
  globalMap.on('mouseout', () => globalMap.scrollWheelZoom.disable());
  
  // Filtros (chips toggle)
  renderMapFilters();

  // Toggle de capa base — clone-and-replace para evitar listeners duplicados al re-inicializar
  document.querySelectorAll('#globalLayerToggle button').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => setGlobalBaseLayer(fresh.dataset.layer));
  });

  // Toggle de Suelo de Conservación · ACTIVO POR DEFAULT (función reutilizable, también disponible en mapas de grupo)
  attachSCToggle('globalSCToggle', globalMap, globalGroupLayers, globalAlcaldiasLayer);

  // Botón pantalla completa
  attachFullscreenBtn(canvas, globalMap);

  // Buscador de direcciones / coordenadas
  addLocateControl(globalMap, ll=>featuresContaining(GEOMETRIES&&GEOMETRIES.features, ll), ()=>(GEOMETRIES&&GEOMETRIES.features)||[]);
  addResetViewControl(globalMap, 'Vista general · todas las áreas');

  // Overlay ARCAC (núcleos agrarios) — apagado por defecto, se activa con su chip.
  // La descarga (291 KB) se difiere hasta que el chip se enciende: antes bajaba en
  // cada primera apertura del mapa global aunque la capa quedara invisible.
  globalArcacLayer = null;
  if(state.showArcac) asegurarCapaArcacGlobal();
}

/* === Pantalla completa (Fullscreen API nativa) === */
/* === Resaltar áreas en coadministración SEMARNAT–CONANP–CDMX 2025 ===
   Son los mismos polígonos de ANP Federal, no otra categoría: por eso no se
   recolorean. La condición (convenio) se expresa como TEXTURA —achurado
   diagonal en el propio azul federal— y el resto del inventario se atenúa.
   Es la convención cartográfica para un atributo de estatus sobre una
   unidad que ya tiene color propio. El patrón vive en el <defs> del SVG del
   mapa y Leaflet lo usa por referencia (fillColor:'url(#…)'). */
const COADMIN_HATCH_ID = 'siaAchuradoCoadmin';
function _asegurarAchuradoCoadmin(mapa, capaRef){
  try{
    const r = mapa.getRenderer(capaRef); const svg = r && r._container;
    if(!svg || svg.querySelector('#' + COADMIN_HATCH_ID)) return true;
    const azul = colorLiteral('var(--azul)');
    const NS = 'http://www.w3.org/2000/svg';
    let defs = svg.querySelector('defs');
    if(!defs){ defs = document.createElementNS(NS,'defs'); svg.insertBefore(defs, svg.firstChild); }
    const pat = document.createElementNS(NS,'pattern');
    pat.setAttribute('id', COADMIN_HATCH_ID);
    pat.setAttribute('patternUnits','userSpaceOnUse');
    pat.setAttribute('width','7'); pat.setAttribute('height','7');
    pat.setAttribute('patternTransform','rotate(45)');
    const fondo = document.createElementNS(NS,'rect');
    fondo.setAttribute('width','7'); fondo.setAttribute('height','7');
    fondo.setAttribute('fill', azul); fondo.setAttribute('fill-opacity','.14');
    const raya = document.createElementNS(NS,'line');
    raya.setAttribute('x1','0'); raya.setAttribute('y1','0'); raya.setAttribute('x2','0'); raya.setAttribute('y2','7');
    raya.setAttribute('stroke', azul); raya.setAttribute('stroke-width','2'); raya.setAttribute('stroke-opacity','.6');
    pat.appendChild(fondo); pat.appendChild(raya); defs.appendChild(pat);
    return true;
  }catch(e){ return false; }
}
function applyCoadminHighlight(){
  if(!globalMap || !globalGroupLayers) return;
  let patronListo = null;
  Object.entries(globalGroupLayers).forEach(([grupo, layerGroup]) => {
    if(!layerGroup) return;
    layerGroup.eachLayer(lyr => {
      const name = lyr.feature?.properties?.nombre;
      if(!name) return;
      const isCoa = isCoadmin(name);
      const baseColor = GROUP_COLORS[grupo];
      if(state.highlightCoadmin){
        if(isCoa){
          if(patronListo === null) patronListo = _asegurarAchuradoCoadmin(globalMap, lyr);
          lyr.setStyle(patronListo
            ? { color: baseColor, weight: 2.5, opacity: 1, fillColor: 'url(#' + COADMIN_HATCH_ID + ')', fillOpacity: 1, dashArray: null }
            : { color: baseColor, weight: 2.5, opacity: 1, fillColor: baseColor, fillOpacity: 0.38, dashArray: null });
          lyr.bringToFront();
          lyr.unbindTooltip();
          lyr.bindTooltip(`<b>${esc(name)}</b><br><span style="font-size:var(--fs-mini);color:var(--azul);font-weight:500">En coadministración · Convenio Marco SEMARNAT–CONANP–CDMX 2025</span>`, {sticky:true, direction:'top'});
        } else {
          /* Las demás ceden protagonismo sin desaparecer: siguen ubicables. */
          lyr.setStyle({ color: baseColor, weight: 1, fillColor: baseColor, fillOpacity: 0.05, opacity: 0.35 });
        }
      } else {
        lyr.setStyle({
          color: baseColor,
          weight: 1.75,
          fillColor: baseColor,
          fillOpacity: 0.20,
          opacity: 1,
          dashArray: null
        });
        lyr.unbindTooltip();
        lyr.bindTooltip(name, {sticky:true, direction:'top'});
      }
    });
  });
}

/* === Toggle reutilizable de Suelo de Conservación ===
   Soluciona hallazgo 2.2 de auditoría: el chip SC ahora funciona en cualquier
   mapa (global, ficha, mapas de grupo), no solo en el mapa global.
   Usa clone-and-replace para evitar listeners duplicados al re-inicializar. */
function attachSCToggle(btnId, mapInstance, groupLayers, alcaldiasLayer){
  const btn = document.getElementById(btnId);
  if(!btn || !mapInstance) return;

  // Clone-and-replace para limpiar listeners previos
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);

  const addSCLayer = async () => {
    const sc = await loadSueloConservacion();
    if(!sc.features || !sc.features.length){
      console.warn('[SC] Capa no disponible.');
      fresh.classList.remove('active');
      return false;
    }
    mapInstance._scLayer = L.geoJSON(sc, {
      /* Régimen territorial, no categoría: tinte ligero y trazo discontinuo
         más fino que el de las áreas, para que nunca compita con ellas. */
      style: { color:'var(--sc-900)', weight:1.25, fillColor:'var(--sc)', fillOpacity:0.12, dashArray:'4,3' },
      interactive: false
    }).addTo(mapInstance);
    mapInstance._scLayer.bringToBack();
    // Restaurar orden de capas: alcaldías y áreas siempre encima de SC
    if(alcaldiasLayer) alcaldiasLayer.bringToFront();
    if(groupLayers) Object.values(groupLayers).forEach(l => l && l.bringToFront());
    fresh.classList.add('active');
    return true;
  };

  // Cargar SC inmediatamente (default ON)
  addSCLayer();

  fresh.addEventListener('click', async () => {
    const isActive = fresh.classList.contains('active');
    if(isActive){
      if(mapInstance._scLayer){ mapInstance.removeLayer(mapInstance._scLayer); mapInstance._scLayer = null; }
      fresh.classList.remove('active');
    } else {
      await addSCLayer();
    }
  });
}

function attachFullscreenBtn(canvas, mapInstance){
  // El botón vive como hermano dentro de canvas → buscar el más cercano
  const btn = canvas.querySelector('.map-fullscreen-btn');
  if(!btn) return;
  // Clone-and-replace para evitar listeners duplicados al re-inicializar el mapa
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);

  fresh.addEventListener('click', () => {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if(isFs){
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const req = canvas.requestFullscreen || canvas.webkitRequestFullscreen;
      if(req) req.call(canvas);
      else siaToast('Tu navegador no admite el modo pantalla completa.');
    }
  });

  // Recalcular tamaño del mapa al entrar/salir de fullscreen.
  // Esta función se invoca desde 4 sitios y antes acumulaba 2 listeners de document
  // por invocación, sin removerlos nunca. Se guarda la referencia y se limpia.
  if(attachFullscreenBtn._onChange){
    document.removeEventListener('fullscreenchange', attachFullscreenBtn._onChange);
    document.removeEventListener('webkitfullscreenchange', attachFullscreenBtn._onChange);
  }
  const onChange = () => {
    setTimeout(() => { if(mapInstance) mapInstance.invalidateSize(); }, 100);
  };
  attachFullscreenBtn._onChange = onChange;
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTOCOMPLETADO DE DIRECCIONES · Google Places (New)
   ═══════════════════════════════════════════════════════════════════════
   Pega aquí la llave del proyecto de Google Cloud de SEDEMA.
   Si queda vacía, el buscador sigue funcionando exactamente como hoy
   (Nominatim al presionar Enter) — el sitio nunca se degrada.

   OBLIGATORIO antes de publicarla, en Google Cloud → Credenciales:
     1. Restricción de aplicación: "Sitios web" con estos referers
          https://sedemaoficina.github.io/*
        (y el dominio propio si algún día se migra)
     2. Restricción de API: solo "Maps JavaScript API" y "Places API (New)"
     3. Cuota diaria y alerta de facturación en el proyecto
   La llave viaja al navegador por diseño: lo que la protege NO es esconderla,
   son esas tres restricciones.
   ═══════════════════════════════════════════════════════════════════════ */
/* La llave vive en config.js —el único archivo que no se reescribe en las
   entregas— y llega por window.SIA_CONFIG. */
const GOOGLE_MAPS_API_KEY = (window.SIA_CONFIG && window.SIA_CONFIG.GOOGLE_MAPS_API_KEY) || '';

let _gmapsPromise = null;
function cargarGooglePlaces(){
  if(!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('sin llave'));
  if(_gmapsPromise) return _gmapsPromise;
  _gmapsPromise = new Promise((ok, fail)=>{
    window.__siaGmapsReady = ()=>ok(window.google);
    const sc = document.createElement('script');
    sc.src = 'https://maps.googleapis.com/maps/api/js'
           + '?key=' + encodeURIComponent(GOOGLE_MAPS_API_KEY)
           + '&libraries=places&v=weekly&language=es&region=MX'
           + '&loading=async&callback=__siaGmapsReady';
    sc.async = true;
    sc.onerror = ()=>fail(new Error('no se pudo cargar Google Maps'));
    document.head.appendChild(sc);
  });
  return _gmapsPromise;
}

/* Sesgo a la CDMX: mismas coordenadas que ya usa el buscador de Nominatim */
/* Ambito de busqueda de direcciones: la CDMX y sus dos entidades colindantes.
   El inventario termina en el limite estatal (10 areas lo cruzan, 1,236.6 ha
   quedan fuera), asi que restringir a la CDMX dejaria ciego a quien verifica
   linderos desde el otro lado. Se usa locationRestriction (regla dura) en vez
   de locationBias (mera preferencia): son mutuamente excluyentes.
   El rectangulo roza Hidalgo, Puebla, Tlaxcala, Queretaro, Michoacan y
   Guerrero, asi que el recorte fino lo hace _entidadDeTexto en el navegador:
   sin llamadas adicionales y sin costo. */
const _AMBITO_BOUNDS = { west:-100.62, south:18.32, east:-98.55, north:20.30 };
const _AMBITO_ORDEN  = { 'CDMX':0, 'Estado de México':1, 'Morelos':2 };
function _entidadDeTexto(txt){
  const t = String(txt || '').trim().replace(/,\s*M[eé]xico\s*\.?\s*$/i, '');
  /* La entidad viaja como ULTIMO componente del texto secundario. Hay que
     probar el componente completo, no una subcadena: "Ecatepec de Morelos"
     es municipio del Estado de Mexico, y una prueba laxa de /Morelos/ lo
     etiquetaba como Morelos. Detectado probando en produccion. */
  const cola = t.split(',').pop().trim();
  if(/^(CDMX|Ciudad de M[eé]xico|Distrito Federal|D\.?\s*F\.?)$/i.test(cola)) return 'CDMX';
  if(/^(Mor\.?|Morelos)$/i.test(cola))                                        return 'Morelos';
  if(/^(M[eé]x\.?|Estado de M[eé]xico|Edo\.?\s*de\s*M[eé]x\.?)$/i.test(cola)) return 'Estado de México';
  /* Respaldo si Google no cierra con la entidad. Nunca por /Morelos/ suelto. */
  if(/\bCDMX\b|Distrito Federal/i.test(t))                                   return 'CDMX';
  if(/Estado de M[eé]xico|\bM[eé]x\.(?=\s*,|\s*$)/i.test(t))                   return 'Estado de México';
  if(/\bMor\.(?=\s*,|\s*$)/i.test(t))                                        return 'Morelos';
  return null;   // fuera del ambito: se descarta
}
/* Origen para calcular distancias en las sugerencias (gratis: viene en la
   propia prediccion cuando se manda origin) y domicilio de la ultima
   direccion resuelta, para mostrar colonia y CP en el panel de resultado. */
let _ubicarOrigen = null;

/* Sugerencias de dirección · una sola implementación para los mapas y la barra
   «¿Dónde estoy?». El session token agrupa tecleo + selección en un solo cobro. */
let _sesionPlaces = null;
function siaCerrarSesionPlaces(){ _sesionPlaces = null; }

/* Estado del servicio de direcciones. Antes un fallo de Google solo dejaba un
   `console.warn`: en pantalla la lista salia vacia y quien buscaba una calle
   concluia que el tablero no encontraba direcciones. Ahora el fallo se dice.
   El diagnostico fino se guarda para la consola; al usuario se le da una
   causa util y la salida que si le sirve. */
let _placesFalla = null;
function _diagnosticoPlaces(msg){
  const m = String(msg || '');
  if(/referer|referrer/i.test(m))          return 'dominio no autorizado en la llave de Google';
  if(/ApiNotActivated|not activated|API_?KEY_?SERVICE/i.test(m)) return 'la API de Places no está habilitada';
  if(/quota|OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED/i.test(m))       return 'cuota de Google agotada por ahora; vuelve a intentar en un minuto';
  if(/billing/i.test(m))                   return 'facturación no habilitada en el proyecto';
  if(/InvalidKey|API key|PERMISSION_DENIED|denied/i.test(m))     return 'llave de Google inválida o restringida';
  if(/network|Failed to fetch|load/i.test(m))                    return 'sin conexión con Google';
  return 'servicio de Google no disponible';
}
/* Google invoca este gancho global ante cualquier fallo de autenticación de la
   llave; es la señal más fiable y llega aunque nadie haya tecleado todavía. */
window.gm_authFailure = function(){
  _placesFalla = 'llave de Google rechazada para este dominio';
  console.error('[Buscador] Google rechazó la llave para', location.hostname,
                '· revisar la restricción por sitio web en Google Cloud → Credenciales.');
};
async function siaSugerirDirecciones(q){
  if(!GOOGLE_MAPS_API_KEY) return [];
  try{
    await cargarGooglePlaces();
    const { AutocompleteSuggestion, AutocompleteSessionToken } =
      await google.maps.importLibrary('places');
    if(!_sesionPlaces) _sesionPlaces = new AutocompleteSessionToken();
    const peticion = {
      input: q, sessionToken: _sesionPlaces, locationRestriction: _AMBITO_BOUNDS,
      includedRegionCodes: ['mx'], language: 'es-MX'
    };
    if(_ubicarOrigen) peticion.origin = _ubicarOrigen;   // habilita distanceMeters
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(peticion);
    _placesFalla = null;
    return (suggestions||[]).map(sg=>{
      const pp  = sg.placePrediction;
      const sec = (pp.secondaryText && pp.secondaryText.text) || '';
      const ent = _entidadDeTexto(sec) || _entidadDeTexto((pp.text && pp.text.text) || '');
      return { place: pp, ent,
        principal: (pp.mainText && pp.mainText.text) || (pp.text && pp.text.text) || '',
        /* El sufijo ", CDMX, México" es ruido en el 100% de los casos */
        /* Places no siempre manda el pais, asi que se recorta en dos pasos:
           primero "México" si viene, luego la entidad abreviada. El chip ya
           dice la entidad; repetirla en el renglon es ruido. */
        secundario: sec.replace(/,\s*M[eé]xico\s*$/i,'')
                       .replace(/,\s*(CDMX|M[eé]x\.?|Mor\.?)\s*$/i,'')
                       .replace(/,\s*Ciudad de M[eé]xico\s*$/i,'')
                       .trim(),
        d: (typeof pp.distanceMeters === 'number') ? pp.distanceMeters : null };
    })
    .filter(x => x.principal && x.ent)                    // fuera del ambito: se descarta
    .sort((a,b) => (_AMBITO_ORDEN[a.ent] - _AMBITO_ORDEN[b.ent])
                   || ((a.d == null ? 1e9 : a.d) - (b.d == null ? 1e9 : b.d)))
    .slice(0,5);
  }catch(err){
    _placesFalla = _diagnosticoPlaces(err && err.message);
    console.warn('[Buscador] Google Places no disponible:', err && err.message);
    return [];
  }
}

/* Resuelve una sugerencia de Places a coordenadas */
async function siaResolverLugar(pred){
  const place = pred.toPlace();
  /* addressComponents es tarifa Essentials, la misma que location y
     formattedAddress: colonia y CP no cambian de escalon de cobro.
     displayName si subiria a Pro, por eso no se pide. */
  await place.fetchFields({fields:['location','formattedAddress','addressComponents']});
  const loc = place.location;
  siaCerrarSesionPlaces();
  const comp = place.addressComponents || [];
  const buscar = (...tipos)=>{
    const c = comp.find(x => (x.types||[]).some(t => tipos.indexOf(t) >= 0));
    return c ? (c.longText || c.shortText || '') : '';
  };
  _ubicarDomicilio = {
    cp:      buscar('postal_code'),
    colonia: buscar('neighborhood','sublocality_level_1','sublocality')
  };
  return { lat: loc.lat(), lng: loc.lng(), etiqueta: place.formattedAddress || '' };
}

/* === Buscador de direcciones / coordenadas (Nominatim · OpenStreetMap) === */
/* Última coordenada buscada (persiste entre mapas: global → mini-mapa de ficha) */
let lastSearchLatLng = null;
function addSearchMarkerTo(map){
  if(!lastSearchLatLng || !map || typeof L==='undefined') return;
  try{
    const mk = L.marker([lastSearchLatLng.lat, lastSearchLatLng.lng], {
      icon: L.divIcon({ className:'search-result-marker', iconSize:[18,18] })
    }).addTo(map);
    mk.bindTooltip(lastSearchLatLng.label || `${lastSearchLatLng.lat.toFixed(5)}, ${lastSearchLatLng.lng.toFixed(5)}`, {direction:'top'});
  }catch(e){}
}

/* Índice local de nombres: instantáneo, sin red y sin costo.
   Es lo que más se teclea ("Ajusco", "Chapultepec"), así que va primero. */
function _indiceLocal(){
  const out = [];
  try{
    (DATA||[]).forEach(d=>out.push({t:'inv', nombre:d.nombre, sub:d.grupo,
      color:(typeof GROUP_COLORS!=='undefined' && GROUP_COLORS[d.grupo])||'var(--guinda)', ref:d.nombre}));
  }catch(_){}
  try{
    ((ARCAC_GEO&&ARCAC_GEO.features)||[]).forEach(f=>{
      const pr=f.properties||{};
      out.push({t:'arcac', nombre:pr.nombre, sub:'ARCAC · '+(pr.tenencia||''),
        color:(typeof ARCAC_COLORS!=='undefined' && ARCAC_COLORS[pr.tenencia])||'var(--arcac-com)', ref:pr.no});
    });
  }catch(_){}
  try{
    (ZP_DATA||[]).filter(r=>r.es_designacion).forEach(r=>out.push({t:'zp', nombre:r.nombre,
      sub:'Zona Patrimonio', color:r.color||'var(--guinda)', ref:r.key}));
  }catch(_){}
  return out;
}
function _buscarLocal(q){
  const norm = t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const nq = norm(q);
  if(nq.length < 2) return [];
  return _indiceLocal().filter(x=>norm(x.nombre).includes(nq)).slice(0,5);
}

/* El buscador flotante de los mapas se retiró el 11-sep-2026: duplicaba la
   barra «¿Dónde estoy?», que ahora está en las cuatro vistas y es la única
   entrada de direcciones y coordenadas del tablero. Con `attachMapSearch`
   se fueron su `parseCoords` y su consumo de Google Places por mapa;
   `parseCoordsSia()` sigue siendo el parser, ya con un solo llamador. */

/* Carga perezosa de la capa ARCAC del mapa global. Idempotente: si ya está
   construida no vuelve a pedir el GeoJSON. */
let _arcacGlobalPend = false;
function asegurarCapaArcacGlobal(){
  if(globalArcacLayer || _arcacGlobalPend) return Promise.resolve(globalArcacLayer);
  _arcacGlobalPend = true;
  return loadARCAC().then(fc=>{
    _arcacGlobalPend = false;
    if(!globalMap) return null;
    globalArcacLayer = buildArcacGeoLayer(fc, globalMap);
    if(state.showArcac){
      globalArcacLayer.addTo(globalMap);
      /* En la pestaña ARCAC los cuatro grupos están apagados: no hay encuadre
         inicial, así que lo aporta esta capa. */
      const hayGrupos = Object.keys(state.mapFilters).some(k=>state.mapFilters[k]);
      if(!hayGrupos){
        try{
          /* La capa llega después del layout, así que el mapa aún puede tener
             medidas viejas; sin esto el encuadre queda descentrado. */
          globalMap.invalidateSize();
          const b = globalArcacLayer.getBounds();
          if(b && b.isValid()){ globalMap.fitBounds(b,{padding:[20,20]}); globalMap._siaHome = b; }
        }catch(e){}
      }
    }
    return globalArcacLayer;
  }).catch(err=>{
    _arcacGlobalPend = false;
    console.warn('[ARCAC] No se pudo cargar la capa:', err && err.message);
    siaToast('No se pudo cargar la capa de núcleos agrarios.');
    return null;
  });
}

function setGlobalBaseLayer(key){
  if(!globalMap) return;
  if(globalMap._activeBase) globalMap.removeLayer(globalMap._activeBase);
  const cfg = TILE_LAYERS[key] || TILE_LAYERS.positron;
  globalMap._activeBase = L.tileLayer(cfg.url, {attribution:cfg.attribution, maxZoom:cfg.maxZoom}).addTo(globalMap);
  _marcarBase(globalMap, key);
  // Reordena overlays para que queden encima
  if(globalAlcaldiasLayer) globalAlcaldiasLayer.bringToFront();
  Object.values(globalGroupLayers).forEach(l=>l.bringToFront());
  document.querySelectorAll('#globalLayerToggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.layer===key);
  });
}

function renderMapFilters(){
  const container = document.getElementById('mapFilters');
  if(!container) return;
  const isGlobal = container.dataset.mode !== 'group';

  // Chip de Suelo de Conservación (siempre presente, en cualquier mapa)
  const scChip = `<button class="map-filter-chip active" id="globalSCToggle" type="button" style="--chip-color:var(--sc)"><span class="chip-dot"></span>Suelo de Conservación</button>`;

  if(isGlobal){
    // Mapa global: 4 chips de capas + chip Coadministración + chip SC al final
    const groups = [
      {key:'AVA · Bosque Urbano', label:'Bosques Urbanos'},
      {key:'AVA · Barranca',       label:'Barrancas'},
      {key:'ANP · Local',          label:'ANP Locales'},
      {key:'ANP · Federal',        label:'ANP Federales'}
    ];
    const coadminChip = `<button class="map-filter-chip${state.highlightCoadmin?' active':''}" id="coadminToggle" type="button" style="--chip-color:var(--azul)" title="Resaltar las ${COADMIN_AREAS.length} ANP federales en coadministración SEMARNAT–CONANP–CDMX 2025">
      <span class="chip-dot"></span>En coadministración <span class="chip-count">${COADMIN_AREAS.length}</span>
    </button>`;
    const arcacChip = `<button class="map-filter-chip${state.showArcac?' active':''}" id="arcacToggle" type="button" style="--chip-color:var(--arcac-com)" title="Mostrar las 30 Áreas de Restauración y Conservación Ambiental Comunitaria (ARCAC)">
      <span class="chip-dot"></span>ARCAC <span class="chip-count">30</span>
    </button>`;
    container.innerHTML = groups.map(g=>{
      const count = (GEOMETRIES.features||[]).filter(f=>f.properties.grupo===g.key).length;
      const color = GROUP_COLORS[g.key];
      const isActive = state.mapFilters[g.key] !== false;
      return `<button class="map-filter-chip${isActive?' active':''}" data-grupo="${g.key}" style="--chip-color:${color};--chip-text:${colorTextoGrupo(g.key)}">
        <span class="chip-dot"></span>${g.label} <span class="chip-count">${count}</span>
      </button>`;
    }).join('') + coadminChip + arcacChip + scChip;
  } else {
    // Mapa de grupo: solo chip SC (los grupos no se filtran aquí)
    container.innerHTML = scChip;
  }

  // Listeners de chips de capas (solo aplican en modo global)
  container.querySelectorAll('.map-filter-chip').forEach(btn=>{
    if(btn.id === 'globalSCToggle') return;  // SC tiene su propio listener específico
    if(btn.id === 'coadminToggle') return;   // Coadmin tiene su propio listener específico
    if(btn.id === 'arcacToggle') return;     // ARCAC tiene su propio listener específico
    btn.addEventListener('click', () => {
      const grupo = btn.dataset.grupo;
      const layer = globalGroupLayers[grupo];
      const isActive = btn.classList.contains('active');
      if(!layer || !globalMap) {
        btn.classList.toggle('active');
        return;
      }
      if(isActive){
        globalMap.removeLayer(layer);
        btn.classList.remove('active');
        state.mapFilters[grupo] = false;
      } else {
        layer.addTo(globalMap);
        btn.classList.add('active');
        state.mapFilters[grupo] = true;
      }
    });
  });

  // Listener específico del chip "En coadministración"
  const coadminBtn = container.querySelector('#coadminToggle');
  if(coadminBtn){
    coadminBtn.addEventListener('click', () => {
      state.highlightCoadmin = !state.highlightCoadmin;
      coadminBtn.classList.toggle('active', state.highlightCoadmin);
      applyCoadminHighlight();
    });
  }

  // Listener del chip ARCAC (overlay de núcleos agrarios)
  const arcacBtn = container.querySelector('#arcacToggle');
  if(arcacBtn){
    arcacBtn.addEventListener('click', () => {
      state.showArcac = !state.showArcac;
      arcacBtn.classList.toggle('active', state.showArcac);
      if(!globalMap) return;
      if(state.showArcac){
        // Primera vez que se enciende el chip: aquí se paga la descarga, no antes.
        if(!globalArcacLayer) asegurarCapaArcacGlobal();
        else globalArcacLayer.addTo(globalMap);
      } else if(globalArcacLayer){
        globalMap.removeLayer(globalArcacLayer);
      }
    });
  }
}

function findGeometry(d){
  if(!GEOM_INDEX) return null;
  return GEOM_INDEX[slugify(d.nombre)] || GEOM_INDEX[d.id] || null;
}

const TILE_LAYERS = {
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_32cg_1_639fb69171e990c64b31e73f',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  },
  satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri · Maxar · Earthstar Geographics',
    maxZoom: 18
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }
};

let activeMap = null;
let activeBaseLayer = null;
let activeGeoLayer = null;

function destroyMap(){
  if(activeMap){ activeMap.remove(); activeMap = null; activeBaseLayer = null; activeGeoLayer = null; }
}


/* ═══ SIMBOLOGÍA · CASCO BLANCO SOBRE ORTOFOTO ══════════════════════════
   Sobre la imagen satelital los trazos de color se pierden contra la
   vegetación y el terreno (verde sobre verde, café sobre café). La regla
   cartográfica es dar a los contornos un casco claro cuando el fondo es
   fotográfico. Se marca el contenedor del mapa y el CSS aplica un halo al
   SVG de superposiciones completo —una sola operación de composición, no
   una por polígono—. Se llama en cada cambio de base. */
function _marcarBase(map, key){
  try{
    const c = map && map.getContainer && map.getContainer();
    if(c) c.classList.toggle('base-satelite', key === 'satelite');
  }catch(_){}
}

function setBaseLayer(key){
  if(!activeMap) return;
  if(activeBaseLayer){ activeMap.removeLayer(activeBaseLayer); }
  const cfg = TILE_LAYERS[key] || TILE_LAYERS.positron;
  activeBaseLayer = L.tileLayer(cfg.url, {attribution: cfg.attribution, maxZoom: cfg.maxZoom}).addTo(activeMap);
  _marcarBase(activeMap, key);
  // Reordena geo layer encima
  if(activeGeoLayer){ activeGeoLayer.bringToFront(); }
  document.querySelectorAll('.map-block-toggle button').forEach(b=>{
    b.classList.toggle('active', b.dataset.layer===key);
  });
}

function initMapForArea(d){
  const container = document.getElementById('mapCanvas');
  if(!container || typeof L === 'undefined') return;
  const canvas = document.getElementById('mapCanvasMap') || container;
  const geo = findGeometry(d);
  if(!geo){
    container.classList.add('no-data');
    container.innerHTML = '<div><b>Polígono no disponible aún.</b> Cuando se integre el archivo cartográfico se mostrará el polígono georreferenciado en este espacio.</div>';
    return;
  }
  container.classList.remove('no-data');
  canvas.innerHTML = '';   // solo el lienzo del mapa: los flotantes se conservan
  activeMap = L.map(canvas, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
  setBaseLayer('positron');
  // Capa de alcaldías como contexto territorial (dibujada antes del polígono para que quede debajo)
  createAlcaldiasLayer({interactive:true}).addTo(activeMap);
  activeGeoLayer = L.geoJSON(geo, {
    style: {
      color: 'var(--guinda)',
      weight: 2.5,
      fillColor: 'var(--guinda)',
      fillOpacity: 0.14
    }
  }).addTo(activeMap);
  activeGeoLayer.bindTooltip(d.nombre, {sticky: true, direction: 'top'});
  activeGeoLayer.bringToFront();
  activeMap.fitBounds(activeGeoLayer.getBounds(), {padding: [20,20], maxZoom: 16});
  try{ activeMap._siaHome = activeGeoLayer.getBounds(); }catch(e){}
  /* Si la ficha se abrió tras una consulta de ubicación, el punto sigue
     dibujado aquí: quien viene de «¿dónde estoy?» necesita ver DÓNDE cae su
     punto dentro del polígono, no solo el polígono. El encuadre se amplía
     para que el punto entre en cuadro aunque quede en el borde. */
  try{
    if(_fichaCtxUbic && isFinite(_fichaCtxUbic.lat)){
      const ll = [_fichaCtxUbic.lat, _fichaCtxUbic.lng];
      L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:COL_AZUL_UBIC,
        fillOpacity:1,interactive:false}).addTo(activeMap)
       .bindTooltip(_fichaCtxUbic.etiqueta || 'Punto consultado',{direction:'top'});
      const b2 = activeGeoLayer.getBounds().extend(ll);
      activeMap.fitBounds(b2,{padding:[26,26], maxZoom:16});
      activeMap._siaHome = b2;
    }
  }catch(e){}
  // Habilita scroll-wheel solo después de clic en el mapa (mejor UX)
  activeMap.on('click focus', ()=>activeMap.scrollWheelZoom.enable());
  activeMap.on('mouseout', ()=>activeMap.scrollWheelZoom.disable());
  _gestosTactilesMinimapa(activeMap);

  // Toggle Suelo de Conservación en mapa de ficha · ACTIVO POR DEFAULT
  // Función reutilizable que también se usa en el mapa global y mapas de grupo
  attachSCToggle('drawerSCToggle', activeMap, null, activeGeoLayer);

  // Pantalla completa + buscador en mapa de ficha técnica
  attachFullscreenBtn(container, activeMap);
  addLocateControl(activeMap, ll=>featuresContaining(GEOMETRIES&&GEOMETRIES.features, ll),
    ()=>(GEOMETRIES&&GEOMETRIES.features)||[],
    { area: geo, nombre: d.nombre, getBounds: ()=>activeGeoLayer.getBounds() });
  addResetViewControl(activeMap, 'Volver al polígono del área');
  montarZonificacionEnMapa(activeMap, d);
  addSearchMarkerTo(activeMap);
}

/* ═══════════════════════════════════════════════════════════════════════
   Imagen compartible de la ficha · se dibuja con Canvas, sin librerías.
   No es una captura del DOM: es una lámina institucional con el polígono
   y los datos duros, pensada para pegarse en WhatsApp, un oficio o una minuta.
   ═══════════════════════════════════════════════════════════════════════ */
function _wrapText(ctx, txt, maxW){
  const words = String(txt||'').split(/\s+/); const lines=[]; let cur='';
  words.forEach(w=>{
    const t = cur ? cur+' '+w : w;
    if(ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur=w; }
    else cur=t;
  });
  if(cur) lines.push(cur);
  return lines;
}

/* ═══ MAPA BASE DENTRO DE LA IMAGEN COMPARTIBLE ═══════════════════════
   El recuadro enseñaba el polígono flotando sobre el fondo crema: sin calles
   ni relieve, la captura no dice DÓNDE está el área. Aquí se dibujan primero
   las teselas del mismo mapa base del tablero y el polígono encima.

   Dos condiciones que no son negociables:
   · Las teselas se piden con `crossOrigin`. Sin CORS el lienzo queda
     contaminado y `toBlob` lanza excepción: no habría imagen, no un mapa feo.
   · El polígono se proyecta con la MISMA fórmula de Web Mercator que las
     teselas. Con la proyección aproximada anterior el trazo caía desplazado
     respecto a las calles. */
function _proyeccionCaja(geo, x, y, w, h, punto){
  const polys = geo.type==='Polygon' ? [geo.coordinates]
              : geo.type==='MultiPolygon' ? geo.coordinates : [];
  if(!polys.length) return null;
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  polys.forEach(p=>p.forEach(r=>r.forEach(c=>{
    if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0];
    if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1];
  })));
  if(!isFinite(minX) || !isFinite(minY)) return null;
  /* Web Mercator en pixeles de tesela, medido al zoom 0; el zoom entra como
     factor. Trabajar con zoom FRACCIONARIO es lo que permite que el poligono
     llene el recuadro: con zoom entero el encuadre salta de golpe al doble y
     el area quedaba diminuta en el centro. */
  const MX = lng => (lng+180)/360 * 256;
  const MY = lat => { const t=Math.max(-85.05,Math.min(85.05,lat));
    const sn=Math.sin(t*Math.PI/180);
    return (0.5 - Math.log((1+sn)/(1-sn))/(4*Math.PI)) * 256; };
  const dw0 = Math.abs(MX(maxX)-MX(minX)), dh0 = Math.abs(MY(minY)-MY(maxY));
  if(!(dw0 > 0) && !(dh0 > 0)) return null;
  const escDe = (aX,bX,aY,bY) => {
    const dw = Math.abs(MX(bX)-MX(aX)), dh = Math.abs(MY(aY)-MY(bY));
    return Math.min(dw>0 ? (w*0.86)/dw : 1e9, dh>0 ? (h*0.86)/dh : 1e9);
  };
  const escSolo = escDe(minX, maxX, minY, maxY);
  let esc = escSolo, puntoEnCuadro = false;
  /* El punto consultado entra en el encuadre SOLO si al ampliarlo el poligono
     sigue siendo legible. Un punto a veinte kilometros dejaria el area del
     tamanio de un alfiler; peor aun era la version anterior, que lo pegaba al
     borde del recuadro y hacia creer que estaba junto al limite. */
  if(punto && isFinite(punto.lat) && isFinite(punto.lng)){
    const cX0 = Math.min(minX, punto.lng), cX1 = Math.max(maxX, punto.lng);
    const cY0 = Math.min(minY, punto.lat), cY1 = Math.max(maxY, punto.lat);
    const escComb = escDe(cX0, cX1, cY0, cY1);
    if(escComb >= escSolo * 0.35){
      esc = escComb; puntoEnCuadro = true;
      minX = cX0; maxX = cX1; minY = cY0; maxY = cY1;
    }
  }
  let zf = Math.log2(esc);
  zf = Math.max(8, Math.min(18, zf));
  const k = Math.pow(2, zf);
  const cx = (MX(minX)+MX(maxX))/2 * k, cy = (MY(minY)+MY(maxY))/2 * k;
  return { zf, polys, puntoEnCuadro,
    P: c => [ x + w/2 + (MX(c[0])*k - cx), y + h/2 + (MY(c[1])*k - cy) ],
    origenX: cx - w/2, origenY: cy - h/2 };
}

const _cargarTesela = url => new Promise(res=>{
  let listo = false;
  const fin = v => { if(!listo){ listo = true; res(v); } };
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload  = () => fin(im);
  im.onerror = () => fin(null);
  im.src = url;
  /* Una tesela lenta no puede dejar al usuario esperando la imagen. */
  setTimeout(()=>fin(null), 5000);
});

async function _dibujarBaseEnCaja(ctx, T, x, y, w, h){
  if(!T) return false;
  /* Se respeta la capa base elegida en el mapa de la ficha; si no hay ficha
     abierta —compartir desde la tabla— se usa el mapa de calles, que es el
     que mejor deja leer un poligono translucido encima. */
  let capa = 'positron';
  try{
    const act = document.querySelector('#dr .map-block-toggle button.active[data-layer]');
    if(act && act.dataset.layer) capa = act.dataset.layer;
  }catch(_){}
  const def = (typeof TILE_LAYERS!=='undefined' && TILE_LAYERS[capa]) ? TILE_LAYERS[capa] : null;
  if(!def) return false;
  /* Zoom entero inmediatamente superior al fraccionario y las teselas dibujadas
     a escala `s` (entre 0.5 y 1): asi el mosaico coincide al pixel con la
     proyeccion del poligono y nunca se ve pixelado. */
  const z = Math.max(0, Math.min(def.maxZoom || 18, Math.ceil(T.zf)));
  const s = Math.pow(2, T.zf - z);            /* 0.5 < s <= 1 */
  const lado = 256 * s;
  const ox = T.origenX / s, oy = T.origenY / s;
  const tx0 = Math.floor(ox/256), tx1 = Math.floor((ox + w/s)/256);
  const ty0 = Math.floor(oy/256), ty1 = Math.floor((oy + h/s)/256);
  const total = (tx1-tx0+1) * (ty1-ty0+1);
  if(!(total > 0) || total > 90) return false;
  const lim = Math.pow(2, z);
  const urls = [];
  for(let tx=tx0; tx<=tx1; tx++) for(let ty=ty0; ty<=ty1; ty++){
    if(ty < 0 || ty >= lim) continue;
    const xx = ((tx % lim) + lim) % lim;
    const u = def.url.replace('{s}','a').replace('{r}','@2x')
                     .replace('{z}',z).replace('{x}',xx).replace('{y}',ty);
    urls.push({u, px: x + (tx*256 - ox)*s, py: y + (ty*256 - oy)*s});
  }
  const imgs = await Promise.all(urls.map(t=>_cargarTesela(t.u)));
  if(!imgs.filter(Boolean).length) return false;
  ctx.save();
  ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  imgs.forEach((im,i)=>{ if(im) try{ ctx.drawImage(im, urls[i].px, urls[i].py, lado, lado); }catch(_){} });
  ctx.restore();
  return true;
}

/* Traza una colección de rasgos con la MISMA proyección de la caja. Sirve
   para las capas que el usuario dejó encendidas en el minimapa (Suelo de
   Conservación, zonificación del programa de manejo): la imagen compartible
   enseña lo mismo que la pantalla. `estilo(props)` devuelve {fill, fillAlpha,
   stroke, width, dash}. */
function _trazarCapaEnCaja(ctx, fc, P, x, y, w, h, estilo){
  if(!fc || !fc.features || !P) return 0;
  let n = 0;
  ctx.save();
  ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  fc.features.forEach(f=>{
    const g = f.geometry; if(!g) return;
    const polys = g.type==='Polygon' ? [g.coordinates] : g.type==='MultiPolygon' ? g.coordinates : [];
    if(!polys.length) return;
    const st = estilo(f.properties || {}) || {};
    polys.forEach(poly=>{
      ctx.beginPath();
      poly.forEach(ring=>{ ring.forEach((c,i)=>{ const [px,py]=P(c); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.closePath(); });
      if(st.fill && st.fillAlpha){ ctx.globalAlpha = st.fillAlpha; ctx.fillStyle = st.fill; ctx.fill('evenodd'); ctx.globalAlpha = 1; }
      if(st.stroke){ ctx.strokeStyle = st.stroke; ctx.lineWidth = st.width || 2; ctx.setLineDash(st.dash || []); ctx.lineJoin='round'; ctx.stroke(); ctx.setLineDash([]); }
    });
    n++;
  });
  ctx.restore();
  return n;
}
/* Qué capas están encendidas en el minimapa de la ficha, con su GeoJSON. */
function _capasActivasFicha(){
  const out = [];
  try{ if(activeMap && activeMap._scLayer) out.push({ id:'sc', fc: activeMap._scLayer.toGeoJSON() }); }catch(_){}
  try{ if(typeof _zonifCapa !== 'undefined' && _zonifCapa && activeMap && activeMap.hasLayer(_zonifCapa)) out.push({ id:'zonif', fc: _zonifCapa.toGeoJSON() }); }catch(_){}
  return out;
}
function _drawGeoInBox(ctx, geoIn, x, y, w, h, color, punto, T){
  /* findGeometry() devuelve un Feature, no una geometría: hay que desenvolverlo */
  const geo = (geoIn && geoIn.type==='Feature') ? geoIn.geometry : geoIn;
  if(!geo) return;
  const polys = geo.type==='Polygon' ? [geo.coordinates]
              : geo.type==='MultiPolygon' ? geo.coordinates : [];
  if(!polys.length) return;
  let P;
  if(T && T.P){
    /* Sobre teselas: la proyección tiene que ser la misma que las dibujó. */
    P = T.P;
  } else {
    let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
    polys.forEach(p=>p.forEach(r=>r.forEach(c=>{
      if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0];
      if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1];
    })));
    const lat0=(minY+maxY)/2, k=Math.cos(lat0*Math.PI/180);
    const gw=(maxX-minX)*k, gh=(maxY-minY);
    if(!gw || !gh) return;
    const sc = Math.min((w-40)/gw, (h-40)/gh);
    const ox = x + w/2, oy = y + h/2;
    P = c => [ ox + (c[0]-(minX+maxX)/2)*k*sc, oy - (c[1]-lat0)*sc ];
  }
  const sobreMapa = !!(T && T.conBase);
  ctx.save();
  ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  if(!(T && T.soloPunto)) polys.forEach(poly=>{
    ctx.beginPath();
    poly.forEach(ring=>{
      ring.forEach((c,i)=>{ const [px,py]=P(c); i?ctx.lineTo(px,py):ctx.moveTo(px,py); });
      ctx.closePath();
    });
    if(!(T && T.sinRelleno)){ ctx.fillStyle = color + (sobreMapa ? '2b' : '33'); ctx.fill('evenodd'); }
    /* Sobre una ortofoto el trazo de color se pierde contra el verde oscuro:
       un halo blanco por debajo lo despega del fondo sin falsear el límite. */
    if(sobreMapa){
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 8;
      ctx.lineJoin='round'; ctx.stroke();
    }
    ctx.strokeStyle = color; ctx.lineWidth = sobreMapa ? 4 : 3; ctx.lineJoin='round'; ctx.stroke();
  });
  /* Punto consultado, con la misma proyección del polígono: si se calculara
     aparte quedaría desplazado. Se dibuja aunque caiga fuera del recuadro
     —se recorta a sus bordes— porque «cerca pero afuera» también es
     información: dice que el punto no está dentro del área. */
  const dibujarPunto = punto && isFinite(punto.lat) && isFinite(punto.lng)
    && (!T || T.puntoEnCuadro);
  if(dibujarPunto){
    const [px0,py0] = P([punto.lng, punto.lat]);
    const px = Math.max(x+12, Math.min(x+w-12, px0));
    const py = Math.max(y+12, Math.min(y+h-12, py0));
    ctx.beginPath(); ctx.arc(px,py,17,0,Math.PI*2);
    ctx.fillStyle = COL_AZUL_UBIC + '2e'; ctx.fill();
    ctx.beginPath(); ctx.arc(px,py,10,0,Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2);
    ctx.fillStyle = COL_AZUL_UBIC; ctx.fill();
  }
  ctx.restore();
}

/* ═══ DESCRIPTOR DE FICHA PARA LA TARJETA COMPARTIBLE ══════════════════
   El generador recibía el registro crudo del inventario y por eso solo servía
   para las 66 áreas: ARCAC trae tenencia en lugar de subcategoría y no tiene
   decreto ni programa de manejo, y Zona Patrimonio trae instrumento y ámbito.
   Con un descriptor común las tres fichas comparten estructura —encabezado,
   badge, polígono, cifra, filas— y solo cambia qué se pone en cada casilla. */
function descInventario(d){
  return {
    nombre: d.nombre,
    badge:  `${d.tipo} · ${d.jurisdiccion}`,
    subtitulo: d.categoria || '',
    color:  colorLiteral((typeof GROUP_COLORS!=='undefined' && GROUP_COLORS[d.grupo]) || 'var(--guinda)'),
    geo:    (typeof findGeometry==='function') ? findGeometry(d) : null,
    superficie: d.superficie,
    supLabel: 'SUPERFICIE DECRETADA',
    /* Mismo orden lógico que la ficha: lo que se deriva de Suelo de
       Conservación (PGOEDF) va debajo de ese dato; lo que se deriva del
       programa de manejo (zonificación), debajo de él. */
    filas: [
      ['DG RESPONSABLE', d.dg_responsable||'Sin asignar'],
      ['TIPO',         d.tipo==='AVA' ? 'Área de Valor Ambiental' : 'Área Natural Protegida'],
      ['JURISDICCIÓN', d.jurisdiccion||'—'],
      ['SUBCATEGORÍA', d.categoria||'—'],
      ['ALCALDÍA(S)',  d.alcaldia||'—'],
      ['SUELO DE CONSERVACIÓN', SC_CORTO(d)]
    ].concat(
      _filaPgoedfResumen(d)
    ).concat([
      ['DECRETO',      d.fecha_decreto||'—'],
      ['PROGRAMA DE MANEJO', d.programa_manejo==='Sí' ? ('Publicado' + (d.fecha_pm ? ' · '+d.fecha_pm : '')) : 'Sin programa vigente']
    ]).concat(
      _filaZonifResumen(d)
    ).concat(
      /* La coadministración solo aparece donde existe: son ocho ANP federales. */
      (typeof isCoadmin==='function' && isCoadmin(d.nombre))
        ? [['COADMINISTRACIÓN', 'Convenio Marco SEMARNAT–CONANP–CDMX 2025']]
        : []
    ).concat(
      /* Solo cuando hay un punto consultado Y cae dentro de una zona: es el
         dato que convierte la captura en una constancia de campo. */
      (_fichaCtxUbic && _fichaCtxUbic.zona)
        ? [['ZONA PM DEL PUNTO', _fichaCtxUbic.zona]]
        : []
    ).concat(
      (_fichaCtxUbic && _fichaCtxUbic.pgoedf)
        ? [['PGOEDF DEL PUNTO', _fichaCtxUbic.pgoedf]]
        : []
    )
  };
}
/* Resúmenes de una línea para la imagen compartible. Leen las cachés que la
   propia ficha ya llenó (índice de zonificación y cruce PGOEDF); si aún no
   están, la fila simplemente no sale. Familias de zonificación agregadas
   por superficie; PGOEDF: las dos zonas mayores. */
function _filaZonifResumen(d){
  try{
    const e = _zonifIndice && _zonifIndice[d.nombre];
    if(!e || !e.zonas || !e.zonas.length || !e.total_ha) return [];
    const porFam = {};
    e.zonas.forEach(z => { const f = zonifFamilia(z.k); porFam[f.lbl] = (porFam[f.lbl] || 0) + z.ha; });
    const top = Object.entries(porFam).sort((a,b)=>b[1]-a[1]).slice(0,3)
      .map(([l,ha]) => l + ' ' + (ha / e.total_ha * 100).toFixed(0) + '%');
    return [['ZONIFICACIÓN PM', top.join(' · ')]];
  }catch(_){ return []; }
}
function _filaPgoedfResumen(d){
  try{
    const est = scEstado(d);
    if(est === 'fuera' || est === 'sindato' || !_pgoedfAreas) return [];
    const e = _pgoedfAreas[d.nombre];
    if(e && e.pct >= 2){
      const orden = e.zonas.slice().sort((a,b)=>b.pct-a.pct);
      const top = orden.filter((z,i) => i === 0 || z.pct >= 1).slice(0,2)
        .map(z => pgoedfNombre(z.zona) + ' ' + z.pct.toFixed(z.pct >= 99.5 ? 0 : 1) + '%');
      return [['PGOEDF', top.join(' · ')]];
    }
    if(d.tipo === 'ANP') return [['PGOEDF', 'Figura como ANP · rige su decreto y programa de manejo']];
    return [];
  }catch(_){ return []; }
}
function descArcac(p){
  const feat = ((ARCAC_GEO&&ARCAC_GEO.features)||[]).find(f=>String(f.properties.no)===String(p.no));
  return {
    nombre: p.nombre,
    badge:  'ARCAC · ' + (p.tenencia||'').toUpperCase(),
    subtitulo: 'Área de Restauración y Conservación Ambiental Comunitaria',
    color:  colorLiteral(ARCAC_COLORS && ARCAC_COLORS[p.tenencia] ? ARCAC_COLORS[p.tenencia] : 'var(--guinda)'),
    geo:    feat || null,
    superficie: p.sup_ha,
    /* Los núcleos ARCAC no se decretan: se registran. El rótulo de la cifra
       tiene que decir la verdad de cada figura, no copiar el del inventario.
       La fila «FIGURA» se quitó: el subtítulo ya dice el nombre completo y en
       la columna de valores quedaba cortado. */
    supLabel: 'SUPERFICIE REGISTRADA',
    filas: [
      ['TENENCIA',    p.tenencia||'—'],
      ['ALCALDÍA',    p.alcaldia||'—'],
      ['No. DE REGISTRO', String(p.no||'—')],
      ['INVENTARIO',  'Capa complementaria · no cuenta como ANP ni AVA']
    ]
  };
}
function descZP(row, feat){
  return {
    nombre: row.nombre,
    badge:  'ZONA PATRIMONIO · ' + String(row.ambito||'').toUpperCase(),
    subtitulo: row.categoria || '',
    color:  colorLiteral(row.color || 'var(--guinda)'),
    geo:    feat || null,
    superficie: (row.superficie != null && row.superficie !== '') ? row.superficie : null,
    supLabel: 'SUPERFICIE DE LA DESIGNACIÓN',
    filas: [
      ['INSTRUMENTO', row.categoria||'—'],
      ['ÁMBITO',      row.ambito||'—'],
      ['ALCALDÍA(S)', row.alcaldia||'—'],
      ['DECLARATORIA / INSCRIPCIÓN', row.fecha_decreto||'—'],
      ['ACTUALIZACIÓN / PLAN',       row.fecha_pm||'—'],
      ['INVENTARIO',  'Capa complementaria · no cuenta como ANP ni AVA']
    ]
  };
}

/* Botón «Compartir imagen» común a las tres fichas. Se inyecta y se conecta
   en un solo lugar: antes el listener vivía suelto en openDrawer y por eso
   ARCAC y ZP se quedaron sin él. */
function botonCompartirHTML(){
  return '<button class="btn-share-area" id="btnShareArea" type="button"'
       + ' aria-label="Compartir esta ficha como imagen">'
       + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
       + '<span class="btn-share-text">Compartir imagen</span></button>';
}
function conectarCompartir(descOrFn){
  const b = document.getElementById('btnShareArea');
  if(!b) return;
  b.addEventListener('click', async ()=>{
    /* El descriptor se arma AL HACER CLIC, no al abrir la ficha: la
       zonificación, el PGOEDF y la zona del punto llegan de forma asíncrona
       y al abrir todavía no están. */
    const desc = (typeof descOrFn === 'function') ? descOrFn() : descOrFn;
    const t = b.querySelector('.btn-share-text');
    const original = t ? t.textContent : '';
    if(t) t.textContent = 'Generando…';
    b.disabled = true;
    try{ await compartirFichaImagen(desc, b); }
    catch(err){ console.warn('[Compartir] no se pudo generar la imagen:', err); siaToast('No se pudo generar la imagen de la ficha.'); }
    finally{ if(t) t.textContent = original; b.disabled = false; }
  });
}

async function compartirFichaImagen(d, btn){
  const W=1080, H=1440;
  try{ if(document.fonts && document.fonts.ready) await document.fonts.ready; }catch(_){}
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  const color = d.color || colorLiteral('var(--guinda)');

  ctx.fillStyle='#fffdf0'; ctx.fillRect(0,0,W,H);

  /* Encabezado institucional */
  let y=54;
  const logo=document.querySelector('.logo-inst');
  if(logo && logo.complete && logo.naturalWidth){
    const lw=Math.min(600, W-96), lh=lw*logo.naturalHeight/logo.naturalWidth;
    try{ ctx.drawImage(logo,48,y,lw,lh); y+=lh+26; }catch(_){ y+=20; }
  }
  ctx.fillStyle=colorLiteral('var(--guinda)'); ctx.fillRect(48,y,W-96,3); y+=44;

  /* Badge de categoría */
  ctx.font='600 22px "Roboto Mono", monospace';
  const tag=String(d.badge||'').toUpperCase();
  const tw=ctx.measureText(tag).width;
  ctx.fillStyle=color; ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(48,y-4,tw+32,42,5) : ctx.rect(48,y-4,tw+32,42);
  ctx.fill();
  ctx.fillStyle='#fff'; ctx.fillText(tag,64,y+24); y+=92;   /* +16 de aire: el badge rozaba el nombre */

  /* Nombre */
  ctx.fillStyle='#2a2a2a'; ctx.font='900 54px Roboto, sans-serif';
  _wrapText(ctx,d.nombre,W-96).forEach(l=>{ ctx.fillText(l,48,y); y+=62; });
  y+=6;
  ctx.fillStyle='#55585a'; ctx.font='400 28px Roboto, sans-serif';
  ctx.fillText(d.subtitulo||'',48,y); y+=44;

  /* Polígono */
  const geo = d.geo || null;
  /* La caja del mapa cede alto cuando hay muchas filas: con doce renglones
     (ficha abierta desde una ubicación, con zonificación y PGOEDF) el paso
     entre filas bajaba a 25 px y los filetes cortaban el texto. */
  const nFilas = (d.filas || []).length;
  const boxH = nFilas > 11 ? 340 : nFilas > 9 ? 380 : 430;
  ctx.fillStyle='#f8f4e0'; ctx.fillRect(48,y,W-96,boxH);
  ctx.strokeStyle='#eae4cf'; ctx.lineWidth=2; ctx.strokeRect(48,y,W-96,boxH);
  const ctxU = _fichaCtxUbic;
  if(geo){
    const g = (geo && geo.type==='Feature') ? geo.geometry : geo;
    let T = null;
    try{
      T = _proyeccionCaja(g, 48, y, W-96, boxH, ctxU);
      if(T) T.conBase = await _dibujarBaseEnCaja(ctx, T, 48, y, W-96, boxH);
    }catch(_){ T = null; }
    /* Capas encendidas en el minimapa: van DEBAJO del polígono del área, con
       la misma jerarquía que en pantalla (SC tenue y discontinuo; zonificación
       con bordes blancos y el área como marco sin relleno). */
    const capas = Array.isArray(d.capas) ? d.capas : (d.capas === false ? [] : _capasActivasFicha());
    const leyenda = [];
    if(T && T.P && capas.length){
      const colSC = colorLiteral('var(--sc)'), colSC9 = colorLiteral('var(--sc-900)');
      capas.forEach(c=>{
        if(c.id === 'sc'){
          _trazarCapaEnCaja(ctx, c.fc, T.P, 48, y, W-96, boxH, ()=>({ fill: colSC, fillAlpha: .10, stroke: colSC9, width: 2.5, dash: [8,6] }));
          leyenda.push({ txt:'Suelo de Conservación', col: colSC9, dash:true });
        }
        if(c.id === 'extra' && c.fc){
          _trazarCapaEnCaja(ctx, c.fc, T.P, 48, y, W-96, boxH, ()=>c.estilo);
          if(c.leyenda) leyenda.push({ txt:c.leyenda, col:c.estilo.stroke || c.estilo.fill, dash: !!c.estilo.dash });
        }
        if(c.id === 'zonif'){
          const fams = new Map();
          _trazarCapaEnCaja(ctx, c.fc, T.P, 48, y, W-96, boxH, pr => { const f = zonifFamilia(pr.zona_k); fams.set(f.lbl, f.color); return { fill: f.color, fillAlpha: .45, stroke: '#ffffff', width: 2.5 }; });
          fams.forEach((col,lbl)=>leyenda.push({ txt: lbl, col }));
          T.sinRelleno = true;
        }
      });
    }
    /* Si las teselas no llegaron —sin red, CORS caído, demasiadas— se dibuja
       el polígono como siempre sobre el fondo crema. Degradar, no fallar. */
    if(T && d.soloPunto) T.soloPunto = true;
    _drawGeoInBox(ctx,geo,48,y,W-96,boxH,color,ctxU,T);
    if(leyenda.length){
      /* Leyenda de capas dentro del recuadro, arriba a la izquierda. */
      ctx.save();
      ctx.font='500 17px Roboto, sans-serif';
      let lx = 48+12, ly = y+12;
      const anchoTotal = leyenda.reduce((a,l)=>a + 28 + ctx.measureText(l.txt).width + 18, 0);
      ctx.fillStyle='rgba(255,255,255,.88)'; ctx.fillRect(lx-6, ly-4, Math.min(anchoTotal+6, W-96-12), 30);
      leyenda.forEach(l=>{
        if(l.dash){ ctx.strokeStyle=l.col; ctx.lineWidth=3; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(lx, ly+11); ctx.lineTo(lx+20, ly+11); ctx.stroke(); ctx.setLineDash([]); }
        else { ctx.fillStyle=l.col; ctx.fillRect(lx+2, ly+3, 16, 16); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.strokeRect(lx+2, ly+3, 16, 16); }
        ctx.fillStyle='#2a2a2a'; ctx.fillText(l.txt, lx+28, ly+17);
        lx += 28 + ctx.measureText(l.txt).width + 18;
      });
      ctx.restore();
    }
    ctx.strokeStyle='#eae4cf'; ctx.lineWidth=2; ctx.strokeRect(48,y,W-96,boxH);
    if(ctxU && T && !T.puntoEnCuadro){
      /* Decirlo es obligatorio: la imagen se usa como constancia y callar que
         el punto quedo fuera de cuadro la volveria enganiosa. */
      const dm = (typeof _distanciaAGeo==='function') ? _distanciaAGeo(ctxU, geo) : null;
      const txt = 'Punto consultado fuera del encuadre'
                + (dm != null ? ' · a ' + _fmtKm(dm) + ' del área' : '');
      ctx.save();
      ctx.font='500 17px Roboto, sans-serif';
      const tw2 = ctx.measureText(txt).width;
      ctx.fillStyle='rgba(255,255,255,.88)';
      ctx.fillRect(48+12, y+boxH-42, tw2+30, 30);
      ctx.fillStyle=COL_AZUL_UBIC;
      ctx.beginPath(); ctx.arc(48+12+15, y+boxH-27, 5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#2a2a2a';
      ctx.fillText(txt, 48+12+26, y+boxH-21);
      ctx.restore();
    }
    if(T && T.conBase){
      /* La atribución de las teselas es obligatoria por licencia. */
      ctx.save();
      ctx.font='400 15px Roboto, sans-serif';
      const cred = '© OpenStreetMap · © CARTO / Esri';
      const cw = ctx.measureText(cred).width;
      ctx.fillStyle='rgba(255,255,255,.82)';
      ctx.fillRect(W-48-cw-14, y+boxH-26, cw+14, 26);
      ctx.fillStyle='#55585a';
      ctx.fillText(cred, W-48-cw-7, y+boxH-8);
      ctx.restore();
    }
  }
  else{
    ctx.fillStyle=COL_GRIS_NEUTRO; ctx.font='400 26px Roboto, sans-serif';
    ctx.fillText('Polígono no disponible',48+30,y+boxH/2);
  }
  y+=boxH+78;   /* +28: la cifra quedaba pegada al borde del recuadro */

  /* Cifra grande: superficie en las fichas; en la constancia de campo, la
     coordenada (d.grande / d.grandeLabel). */
  ctx.fillStyle=color; ctx.font='900 70px Roboto, sans-serif';
  let supTxt;
  if(d.grande != null){ supTxt = String(d.grande); ctx.font='700 46px "Roboto Mono", monospace'; }
  else {
    supTxt = (d.superficie == null || d.superficie === '') ? 'Por confirmar' : fmt(d.superficie);
    if(d.superficie == null || d.superficie === '') ctx.font='700 44px Roboto, sans-serif';
  }
  ctx.fillText(supTxt,48,y);
  const sw=ctx.measureText(supTxt).width;
  ctx.fillStyle=COL_GRIS_NEUTRO; ctx.font='400 30px Roboto, sans-serif';
  if(d.grande == null && d.superficie != null && d.superficie !== '') ctx.fillText(' ha',48+sw+10,y);
  y+=34;
  ctx.fillStyle=COL_GRIS_NEUTRO; ctx.font='500 20px "Roboto Mono", monospace';
  ctx.fillText(d.grandeLabel || d.supLabel || 'SUPERFICIE',48,y); y+=64;

  /* Datos duros */
  const filas = d.filas || [];
  /* El paso entre filas se calcula, no se fija: al pasar de cinco a ocho
     filas el bloque se metía debajo del pie y la última renglonada quedaba
     encimada con el filete. Se reparte el espacio que queda hasta el pie,
     con un tope de 46 px para que con pocas filas no se vea estirado. */
  const PIE_Y = H - 120;
  const paso  = Math.max(30, Math.min(46, Math.floor((PIE_Y - y) / filas.length)));
  filas.forEach(([k,v])=>{
    if(y > PIE_Y) return;                       /* nunca invadir el pie */
    ctx.fillStyle=COL_GRIS_NEUTRO; ctx.font='500 19px "Roboto Mono", monospace'; ctx.fillText(k,48,y);
    ctx.fillStyle='#2a2a2a'; ctx.font='500 25px Roboto, sans-serif';
    const lines=_wrapText(ctx,v,W-96-330);
    ctx.fillText(lines[0]||'',378,y);
    ctx.strokeStyle='#eae4cf'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(48,y+paso-32); ctx.lineTo(W-48,y+paso-32); ctx.stroke();
    y+=paso;
  });

  /* Pie */
  y=H-58;
  ctx.fillStyle=colorLiteral('var(--guinda)'); ctx.fillRect(0,H-92,W,3);
  ctx.fillStyle='#55585a'; ctx.font='400 19px "Roboto Mono", monospace';
  const hoy=new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  ctx.fillText('Sistema de Información Ambiental · SEDEMA CDMX',48,y);
  ctx.fillStyle=COL_GRIS_NEUTRO; ctx.font='400 17px "Roboto Mono", monospace';
  ctx.fillText('Consulta: '+hoy,48,y+26);
  /* La coordenada consultada va al pie, alineada a la derecha: es el dato que
     vuelve verificable la captura —sin ella, la imagen no dice desde dónde se
     hizo la consulta—. */
  if(ctxU){
    ctx.textAlign='right';
    ctx.fillStyle='#2a2a2a'; ctx.font='500 19px "Roboto Mono", monospace';
    ctx.fillText(ctxU.lat.toFixed(6)+', '+ctxU.lng.toFixed(6), W-48, y);
    if(ctxU.etiqueta){
      ctx.fillStyle=COL_GRIS_NEUTRO; ctx.font='400 17px Roboto, sans-serif';
      ctx.fillText(_wrapText(ctx, ctxU.etiqueta, 520)[0] || '', W-48, y+26);
    }
    ctx.textAlign='left';
  }

  /* Compartir o descargar */
  const nombreArchivo = (d.grande != null ? 'SIA_constancia_' : 'SIA_') + slugify(d.nombre||'ficha') + '.png';
  return new Promise(res=>{
    cv.toBlob(async blob=>{
      if(!blob){ siaToast('No se pudo generar la imagen.'); return res(false); }
      const file = new File([blob], nombreArchivo, {type:'image/png'});
      try{
        if(navigator.canShare && navigator.canShare({files:[file]})){
          /* Solo `files`: agregar `title` hace que iOS trate la hoja como un
             envío mixto y muestre la ficha genérica de documento en lugar de
             la miniatura de la imagen. */
          await navigator.share({files:[file]});
          return res(true);
        }
      }catch(err){ if(err && err.name==='AbortError') return res(false); }
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=nombreArchivo;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      siaToast('Imagen descargada: ' + nombreArchivo);
      res(true);
    },'image/png');
  });
}


/* ═══════════════════════════════════════════════════════════════════════
   BARRA «¿DÓNDE ESTOY?» · flujo principal de campo
   ═══════════════════════════════════════════════════════════════════════
   Tres entradas al mismo resultado: GPS, coordenada tecleada o dirección.
   El resultado se dibuja a ancho completo —no en un globo del mapa— con
   un botón por cobertura para abrir su ficha. Vive fuera de las pestañas
   porque es una acción disponible desde cualquier vista.
   ═══════════════════════════════════════════════════════════════════════ */
let ubicarMap = null, _ubicarDebounce = null, _ubicarSeq = 0;

function initUbicarBar(){
  const inp = document.getElementById('ubicarInput');
  const sug = document.getElementById('ubicarSug');
  const gps = document.getElementById('ubicarGps');
  const go  = document.getElementById('ubicarGo');
  if(!inp || !sug || !gps || !go) return;

  /* En celular el placeholder largo se corta: se acorta a esa anchura */
  if(window.innerWidth < 760) inp.placeholder = 'Dirección, lugar, coordenadas…';

  gps.addEventListener('click', ubicarPorGPS);
  go.addEventListener('click', ()=>ubicarDesdeTexto(inp.value));

  /* «Borrar todo»: texto, sugerencias, resultado y punto del mapa, de un golpe.
     El botón solo se muestra cuando hay algo que borrar. */
  const limpiarBtn = document.getElementById('ubicarLimpiar');
  const actualizarLimpiar = ()=>{
    if(!limpiarBtn) return;
    const res = document.getElementById('ubicarResultado');
    /* Cuenta el texto y el resultado; NO el panel de sugerencias, que al
       recuperar el foco se abre con las recientes y dejaría el «x» visible
       justo después de borrar. Ese panel se cierra solo con Escape o al
       tocar fuera. */
    const hay = !!inp.value || !!(res && !res.hidden && res.innerHTML);
    limpiarBtn.hidden = !hay;
  };
  window._actualizarLimpiarUbicar = actualizarLimpiar;
  if(limpiarBtn) limpiarBtn.addEventListener('click', ()=>{
    inp.value = ''; sug.hidden = true; sug.innerHTML = '';
    const cerrar = document.getElementById('ubicarCerrar');
    if(cerrar) cerrar.click();                       /* cierra el resultado por su propia vía */
    try{ if(typeof limpiarUbicacionGlobal === 'function') limpiarUbicacionGlobal(); }catch(_){}
    try{ lastSearchLatLng = null; _ubicarDomicilio = null; }catch(_){}
    actualizarLimpiar();
    inp.focus();
  });
  inp.addEventListener('input', actualizarLimpiar);
  const resEl = document.getElementById('ubicarResultado');
  if(resEl) new MutationObserver(actualizarLimpiar).observe(resEl, {attributes:true, childList:true, attributeFilter:['hidden']});
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); ubicarDesdeTexto(inp.value); }
    if(e.key==='Escape'){ sug.hidden = true; }
  });
  document.addEventListener('click', e=>{
    if(!e.target.closest('#ubicarBar')) sug.hidden = true;
  });
  inp.addEventListener('input', ()=>{
    const q = inp.value.trim();
    clearTimeout(_ubicarDebounce);
    if(q.length < 2){ sug.hidden = true; return; }
    if(parseCoordsSia(q)){ sug.hidden = true; return; }
    const mio = ++_ubicarSeq;
    const locales = _buscarLocal(q);
    pintarUbicarSug(locales, []);
    /* Google se consulta desde 3 caracteres y con 350 ms de pausa: cada
       tecleo cuenta contra la cuota por minuto; el índice local sigue
       respondiendo desde 2 sin costo. */
    if(q.length < 3) return;
    _ubicarDebounce = setTimeout(async ()=>{
      const dirs = await siaSugerirDirecciones(q);
      if(mio === _ubicarSeq) pintarUbicarSug(locales, dirs, true);
    }, 350);
  });
}

/* Mismo parser de coordenadas que usa el buscador de los mapas */
/* ─────────────────────────────────────────────────────────────────────────
   Parser único de coordenadas. Lo usan la barra «¿Dónde estoy?» y los cinco
   buscadores de mapa (global, ficha, Zona Patrimonio, ARCAC y Traslapes), así
   que cualquier formato que se acepte aquí se acepta en todo el tablero.

   Acepta, normalizando espacios, paréntesis y signos tipográficos:
     19.4237, -99.1421          (19.4237, -99.1421)      ( 19.4237 , -99.1421 )
     [19.4237; -99.1421]        19.4237 -99.1421         19,4237, -99,1421
     19.4237 N, 99.1421 W       N 19.4237  W 99.1421     19.4237°, -99.1421°
     una URL de Google Maps pegada entera (toma el @lat,lng)
   Y corrige el orden invertido: si el primer número no puede ser latitud
   (|x| > 90) y el segundo sí, se intercambian. El popup muestra siempre la
   coordenada resultante, así que la interpretación queda a la vista.
   ───────────────────────────────────────────────────────────────────────── */
function parseCoordsSia(q){
  let t = String(q||'').trim();
  if(!t) return null;

  /* Una URL de mapa pegada entera: se rescata el par y se ignora lo demás. */
  const url = t.match(/[@?&=\/](-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if(/^https?:\/\//i.test(t) && url) t = url[1] + ',' + url[2];

  t = t
    .replace(/[−‒–—]/g, '-')   // menos tipográfico y guiones largos
    .replace(/[°º'"´`′″]/g, ' ')          // grados, minutos, comillas
    .replace(/^[\(\[\{@\s]+|[\)\]\}\s]+$/g, '')     // paréntesis y espacios de los extremos
    .replace(/\s+/g, ' ')
    .trim();

  /* Hemisferio en letra: define el signo y sale de la cadena. */
  let sLat = 1, sLng = 1, conLetra = false;
  t = t.replace(/([NSEOW])/gi, (m, l) => {
    conLetra = true;
    l = l.toUpperCase();
    if(l === 'S') sLat = -1;
    if(l === 'O' || l === 'W') sLng = -1;
    return ' ';
  }).replace(/\s+/g, ' ').trim();

  /* Coma decimal (19,4237, -99,1421): cuatro grupos, el 2.º y el 4.º son
     puras cifras. Solo se aplica cuando la lectura es inequívoca. */
  const g = t.split(',').map(x => x.trim());
  if(g.length === 4 && /^\d+$/.test(g[1]) && /^\d+$/.test(g[3])
     && /^-?\d+$/.test(g[0]) && /^-?\d+$/.test(g[2])){
    t = `${g[0]}.${g[1]}, ${g[2]}.${g[3]}`;
  }

  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if(!m) return null;

  let lat = parseFloat(m[1]) * (conLetra ? sLat : 1);
  let lng = parseFloat(m[2]) * (conLetra ? sLng : 1);
  if(isNaN(lat) || isNaN(lng)) return null;

  /* Orden invertido: una latitud no puede pasar de 90, así que si el primero
     se sale y el segundo cabe, venían al revés. */
  if(Math.abs(lat) > 90 && Math.abs(lng) <= 90){ const tmp = lat; lat = lng; lng = tmp; }

  if(lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {lat, lng};
}

function pintarUbicarSug(locales, direcciones, yaConsultado){
  const sug = document.getElementById('ubicarSug'); if(!sug) return;
  let html = '';
  if(locales.length){
    html += '<div class="res-group">En el inventario</div>' + locales.map((x,i)=>
      filaSug({attrs:`data-local="${i}"`, icono:ICO_SUG.area, punto:x.color,
               titulo:x.nombre, sub:x.sub||''})).join('');
  }
  if(direcciones.length){
    html += '<div class="res-group">Direcciones · CDMX · Méx. · Mor.</div>' + direcciones.map((d,i)=>
      filaSug({attrs:`data-dir="${i}"`, cls:(d.ent && d.ent!=='CDMX') ? 'ext' : '',
               icono:ICO_SUG.lugar, titulo:d.principal, sub:d.secundario||'',
               derecha:(d.ent ? _entChip(d.ent) : '') + (d.d != null ? `<span class="dist">${_fmtDist(d.d)}</span>` : '')})).join('');
  }
  /* Solo tras consultar de verdad: en el primer pintado —el instantaneo, con
     el indice local— todavia no se sabe si Google va a responder. */
  if(yaConsultado && !direcciones.length && _placesFalla){
    html += '<div class="res-group">Direcciones</div>' + filaSug({
      cls:'aviso', icono:ICO_SUG.lugar,
      titulo:'Búsqueda de direcciones no disponible',
      sub: _placesFalla + ' · las áreas del inventario y las coordenadas siguen funcionando'});
  }
  if(!html){ sug.hidden = true; return; }
  sug.innerHTML = html; sug.hidden = false;

  sug.querySelectorAll('[data-local]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const x = locales[+el.dataset.local];
      sug.hidden = true;
      document.getElementById('ubicarInput').value = x.nombre;
      recienteGuardar({t:x.t, ref:x.ref, titulo:x.nombre, sub:x.sub||''});
      try{
        if(x.t==='inv'){ const a=DATA.find(d=>d.nombre===x.ref); if(a) return openDrawer(a); }
        if(x.t==='arcac') return openARCACFicha(Number(x.ref));
        if(x.t==='zp')    return openZPFicha(x.ref);
      }catch(err){ siaToast('No se pudo abrir esa área.'); }
    });
  });
  sug.querySelectorAll('[data-dir]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const d = direcciones[+el.dataset.dir];
      sug.hidden = true;
      document.getElementById('ubicarInput').value = d.principal;
      recienteGuardar({t:'dir', titulo:d.principal, sub:d.secundario||''});
      try{
        const r = await siaResolverLugar(d.place);
        ubicarResolver({lat:r.lat, lng:r.lng}, null, r.etiqueta || d.principal);
      }catch(err){ siaToast('No se pudo ubicar esa dirección.'); }
    });
  });
}

/* ═══ FILAS DE SUGERENCIA · estructura del kit ═════════════════════════
   Icono circular a la izquierda, título en negritas y segunda línea gris.
   Antes el resultado era una línea de texto con un punto de color pegado al
   borde: se leía como una lista de opciones de formulario, no como resultados
   de búsqueda. La estructura es la misma para las tres clases de resultado
   —área del inventario, dirección y búsqueda reciente—; solo cambia el icono. */
const ICO_SUG = {
  area:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>',
  lugar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-11.4A7 7 0 0 0 5 10.6C5 15.8 12 22 12 22Z"/><circle cx="12" cy="10.4" r="2.4"/></svg>',
  reciente:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.9"/></svg>'
};
function filaSug(o){
  const punto = o.punto ? `<span class="sw" style="background:${esc(o.punto)}"></span>` : '';
  return `<div class="item ${o.cls||''}" ${o.attrs||''} role="option" tabindex="-1">
      <span class="ico" aria-hidden="true">${o.icono||''}${punto}</span>
      <span class="txt"><b>${esc(o.titulo||'')}</b>${o.sub ? `<span class="meta">${esc(o.sub)}</span>` : ''}</span>
      ${o.derecha ? `<span class="rt">${o.derecha}</span>` : ''}
    </div>`;
}

/* ═══ BÚSQUEDAS RECIENTES ══════════════════════════════════════════════
   Al enfocar el campo vacío, Maps ofrece lo último consultado en vez de una
   caja en blanco. En campo eso importa: se vuelve una y otra vez a las mismas
   áreas. Se guardan cinco en el propio navegador —nada sale del equipo— y se
   limpian con el botón del pie de la lista. */
const REC_CLAVE = 'sia_busquedas_recientes';
function recientesLeer(){
  try{ const v = JSON.parse(localStorage.getItem(REC_CLAVE) || '[]');
       return Array.isArray(v) ? v.slice(0,5) : []; }catch(e){ return []; }
}
function recienteGuardar(item){
  if(!item || !item.titulo) return;
  try{
    const prev = recientesLeer().filter(x => x.titulo !== item.titulo);
    localStorage.setItem(REC_CLAVE, JSON.stringify([item, ...prev].slice(0,5)));
  }catch(e){}   /* modo privado o almacenamiento bloqueado: se sigue sin historial */
}
function pintarRecientes(){
  const sug = document.getElementById('ubicarSug'); if(!sug) return false;
  const rec = recientesLeer();
  /* Sin recientes no hay panel: la guía de qué se puede teclear vive en el
     placeholder del campo (decisión del 12-sep-2026). */
  if(!rec.length){ sug.hidden = true; sug.innerHTML = ''; return false; }
  sug.innerHTML = '<div class="res-group">Recientes</div>'
    + rec.map((r,i)=>filaSug({attrs:`data-rec="${i}"`, icono:ICO_SUG.reciente,
                              titulo:r.titulo, sub:r.sub||''})).join('')
    + '<button type="button" class="sug-limpiar" id="sugLimpiar">Borrar recientes</button>';
  sug.hidden = false;
  const lim = document.getElementById('sugLimpiar');
  if(lim) lim.addEventListener('click', e=>{
    e.stopPropagation();
    try{ localStorage.removeItem(REC_CLAVE); }catch(err){}
    sug.hidden = true; sug.innerHTML = '';
  });
  sug.querySelectorAll('[data-rec]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const r = rec[+el.dataset.rec];
      sug.hidden = true;
      const inp = document.getElementById('ubicarInput');
      if(inp) inp.value = r.titulo;
      try{
        if(r.t==='inv'){ const a=DATA.find(d=>d.nombre===r.ref); if(a) return openDrawer(a); }
        if(r.t==='arcac') return openARCACFicha(Number(r.ref));
        if(r.t==='zp')    return openZPFicha(r.ref);
        if(r.t==='coord' && r.lat != null) return ubicarResolver({lat:r.lat,lng:r.lng}, null, r.titulo);
        ubicarDesdeTexto(r.titulo);
      }catch(err){ siaToast('No se pudo repetir esa búsqueda.'); }
    });
  });
  return true;
}
document.addEventListener('focusin', e=>{
  if(!e.target || e.target.id !== 'ubicarInput') return;
  if(String(e.target.value||'').trim()) return;
  pintarRecientes();
});

function ubicarDesdeTexto(txt){
  const q = String(txt||'').trim();
  if(!q) return;
  const c = parseCoordsSia(q);
  if(c){ _ubicarDomicilio = null; ubicarResolver(c, null, null); return; }
  const loc = _buscarLocal(q);
  if(loc.length){
    const x = loc[0];
    try{
      if(x.t==='inv'){ const a=DATA.find(d=>d.nombre===x.ref); if(a) return openDrawer(a); }
      if(x.t==='arcac') return openARCACFicha(Number(x.ref));
      if(x.t==='zp')    return openZPFicha(x.ref);
    }catch(err){}
  }
  siaSugerirDirecciones(q).then(async dirs=>{
    if(!dirs.length){
      siaToast(_placesFalla
        ? 'Búsqueda de direcciones no disponible: ' + _placesFalla + '.'
        : 'Sin resultados para esa búsqueda.');
      return;
    }
    try{
      const r = await siaResolverLugar(dirs[0].place);
      ubicarResolver({lat:r.lat, lng:r.lng}, null, r.etiqueta || dirs[0].principal);
    }catch(err){ siaToast('No se pudo ubicar esa dirección.'); }
  });
}

function ubicarPorGPS(){
  const btn = document.getElementById('ubicarGps');
  if(!navigator.geolocation){ siaToast('Este navegador no permite geolocalización.'); return; }
  const span = btn.querySelector('span'); const txt = span ? span.textContent : '';
  btn.disabled = true; if(span) span.textContent = 'Ubicando…';
  navigator.geolocation.getCurrentPosition(pos=>{
    btn.disabled = false; if(span) span.textContent = txt;
    _ubicarDomicilio = null;                       // el punto no viene de una direccion
    ubicarResolver({lat:pos.coords.latitude, lng:pos.coords.longitude}, pos.coords.accuracy, null);
  }, err=>{
    btn.disabled = false; if(span) span.textContent = txt;
    siaToast('No se pudo obtener tu ubicación. Revisa el permiso del navegador (requiere HTTPS).');
  }, {enableHighAccuracy:true, timeout:12000, maximumAge:0});
}

/* ═══ VOLVER ARRIBA ═══════════════════════════════════════════════════
   Inventario, analítica y fichas largas pasan de dos mil píxeles. El botón
   aparece pasada una pantalla de desplazamiento y regresa al inicio de la
   vista visitada; en el cajón de la ficha, al inicio de la ficha. */
(function(){
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'irArriba'; b.className = 'ir-arriba';
  b.setAttribute('aria-label','Volver al inicio'); b.title = 'Volver al inicio'; b.hidden = true;
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  document.body.appendChild(b);
  const drEl = document.getElementById('dr');
  const UMBRAL = 600;
  const fichaAbierta = () => !!(drEl && drEl.classList.contains('open')) && !window.matchMedia('(max-width:760px)').matches;
  function refrescar(){
    const y = fichaAbierta() ? drEl.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
    b.hidden = y < UMBRAL;
  }
  b.addEventListener('click', ()=>{
    const suave = { top:0, behavior:'smooth' };
    if(fichaAbierta()) drEl.scrollTo(suave); else window.scrollTo(suave);
  });
  let tic = false;
  const onScroll = ()=>{ if(tic) return; tic = true; requestAnimationFrame(()=>{ tic = false; refrescar(); }); };
  window.addEventListener('scroll', onScroll, {passive:true});
  if(drEl) drEl.addEventListener('scroll', onScroll, {passive:true});
  document.addEventListener('click', ()=>setTimeout(refrescar, 350));
})();

/* ═══ CÁPSULA QUE SE APARTA AL BAJAR ══════════════════════════════════
   Fuera del caparazón la barra es pegajosa: se queda arriba y el contenido
   pasa por debajo, que es lo que se ve cortado al desplazarse. Como en Maps,
   se aparta al bajar y vuelve al subir —o al llegar arriba del todo—. Solo en
   celular: en escritorio no estorba y la referencia constante sirve. */
(function(){
  let ultimo = 0, pendiente = false;
  const UMBRAL = 8;
  function evaluar(){
    pendiente = false;
    const wrap = document.querySelector('.wrap');
    if(!wrap || !window.matchMedia('(max-width:760px)').matches
       || wrap.classList.contains('gm-shell')){
      if(wrap) wrap.classList.remove('barra-oculta');
      ultimo = window.scrollY; return;
    }
    const y = window.scrollY;
    if(y < 60){ wrap.classList.remove('barra-oculta'); ultimo = y; return; }
    if(Math.abs(y - ultimo) < UMBRAL) return;
    wrap.classList.toggle('barra-oculta', y > ultimo);
    ultimo = y;
  }
  window.addEventListener('scroll', ()=>{
    if(!pendiente){ pendiente = true; requestAnimationFrame(evaluar); }
  }, {passive:true});
})();

/* ═══ HOJA DESLIZABLE · caparazón de mapa en celular ═══════════════════
   Tres posiciones, como en Maps: asomada (se ve el encabezado y la primera
   cobertura), media y completa. Se arrastra por el asa —no por el cuerpo, que
   necesita su propio desplazamiento— y al soltar cae en la posición más
   cercana. Arrastrarla por debajo de la asomada la cierra.
   `--vis` es la altura visible en píxeles; el translate se calcula en CSS. */
const HOJA_ASOMADA = 215;
let _hojaVis = 0;
const _shellActivo = () => !!document.querySelector('.wrap.gm-shell');
function _hojaAlturas(){
  const h = document.getElementById('ubicarResultado');
  const max = h ? Math.round(h.getBoundingClientRect().height) : Math.round(innerHeight*0.86);
  return [0, Math.min(HOJA_ASOMADA, max), Math.round(max*0.55), max];
}
function hojaIr(vis){
  const h = document.getElementById('ubicarResultado'); if(!h) return;
  _hojaVis = Math.max(0, vis);
  h.style.setProperty('--vis', _hojaVis + 'px');
}
function hojaSnap(vis){
  let best = 0;
  _hojaAlturas().forEach(v => { if(Math.abs(v - vis) < Math.abs(best - vis)) best = v; });
  hojaIr(best);
  return best;
}
function cerrarHoja(){
  const sec = document.getElementById('ubicarResultado');
  hojaIr(0);
  limpiarUbicacionGlobal();
  setTimeout(()=>{ if(sec && _hojaVis === 0){ sec.hidden = true; sec.innerHTML = ''; } }, 300);
}
/* Arrastre delegado: el asa se vuelve a crear en cada consulta. */
document.addEventListener('pointerdown', e=>{
  const asa = e.target && e.target.closest && e.target.closest('#ubicarAsa');
  if(!asa || !_shellActivo()) return;
  const h = document.getElementById('ubicarResultado'); if(!h) return;
  const y0 = e.clientY, v0 = _hojaVis; let movio = false;
  h.classList.add('arrastrando');
  const mover = ev => { if(Math.abs(ev.clientY - y0) > 3) movio = true; hojaIr(v0 + (y0 - ev.clientY)); };
  const soltar = ev => {
    document.removeEventListener('pointermove', mover);
    document.removeEventListener('pointerup', soltar);
    document.removeEventListener('pointercancel', soltar);
    h.classList.remove('arrastrando');
    if(!movio){                                   /* toque simple: siguiente posición */
      const a = _hojaAlturas();
      const i = a.findIndex(v => v > _hojaVis + 4);
      hojaIr(i === -1 ? a[1] : a[i]);
      return;
    }
    if(hojaSnap(v0 + (y0 - ev.clientY)) === 0) cerrarHoja();
  };
  document.addEventListener('pointermove', mover);
  document.addEventListener('pointerup', soltar);
  document.addEventListener('pointercancel', soltar);
  e.preventDefault();
});

async function ubicarResolver(latlng, precision, etiqueta){
  const sec = document.getElementById('ubicarResultado');
  if(!sec) return;
  const shell = _shellActivo();
  sec.hidden = false;
  sec.innerHTML = '<div class="gm-handle" id="ubicarAsa" aria-hidden="true"></div>'
                + '<div class="panel"><div class="ubi-cargando">Consultando capas…</div></div>';
  /* En el caparazón la hoja se asoma mientras consulta; desplazar la página
     no tendría sentido porque el mapa ocupa la pantalla completa. */
  if(shell) hojaIr(_hojaAlturas()[1]);
  else sec.scrollIntoView({behavior:'smooth', block:'start'});
  await _cargarCapasCobertura();
  _ubicarOrigen = { lat: latlng.lat, lng: latlng.lng };   // habilita distancias en las sugerencias
  _ubicarEtiqueta = etiqueta || (precision != null ? 'Ubicación por GPS' : 'Punto consultado');
  sec.innerHTML = renderUbicarResultado(latlng, precision, etiqueta);
  /* Contexto del último resultado: lo usa la constancia de campo. La zona
     del PM y el PGOEDF se agregan cuando resuelven. */
  _ubiUltimo = { latlng:{lat:latlng.lat, lng:latlng.lng}, precision, etiqueta:_ubicarEtiqueta,
                 covs:_coberturasEn(latlng), sc:_enSueloConservacion(latlng), alc:_alcaldiaEn(latlng),
                 ent:_entidadEn(latlng), zonaPM:null, zonaPMEstado:null, pgoedf:null, cuando:new Date() };
  const btnConst = document.getElementById('ubiCompartir');
  if(btnConst) btnConst.addEventListener('click', ()=>compartirConstancia(btnConst));
  /* Zonificación del PGOEDF: solo si el punto cayó en Suelo de Conservación
     (el contenedor existe únicamente en ese caso). enANP decide el mensaje
     cuando el Programa no cubre el punto. */
  try{
    if(document.getElementById('ubiPgoedf')){
      const enANP = _coberturasEn(latlng).some(c => /ANP/.test(String(c.tag || '')));
      pintarPgoedf(latlng, enANP);
    }
  }catch(_){}
  /* Zona del programa de manejo en el punto, cuando el área principal tiene
     zonificación publicada. Si tiene programa pero no archivo, se dice. */
  try{
    const zp = document.getElementById('ubiZonaPM');
    if(zp){
      const nombreArea = (_coberturasEn(latlng).find(c => c.ficha && c.ficha.indexOf('inv::') === 0) || {}).nombre;
      if(nombreArea && typeof zonifDe === 'function'){
        zonifDe(nombreArea).then(e => {
          if(!document.getElementById('ubiZonaPM')) return;
          if(!e){
            if(_ubiUltimo) _ubiUltimo.zonaPMEstado = 'nd';
            zp.innerHTML = '<span class="ubi-zona-nd">Zonificación del programa de manejo aún no disponible en formato geoespacial.</span>';
            return;
          }
          return zonaDePunto(nombreArea, latlng).then(z => {
            if(_ubiUltimo){ _ubiUltimo.zonaPM = z ? z.zona : null; _ubiUltimo.zonaPMEstado = z ? 'ok' : 'fuera'; }
            if(!document.getElementById('ubiZonaPM')) return;
            zp.innerHTML = z
              ? '<span class="ubi-zona-k">Zona del programa de manejo en este punto</span>'
                + '<span class="ubi-zona-v"><span class="ubi-zona-sw" style="background:' + esc(zonifFamilia(z.k).color) + '"></span>' + esc(z.zona) + '</span>'
              : '<span class="ubi-zona-nd">El punto no cae en ninguna zona del programa de manejo (borde o hueco de la cartografía).</span>';
          });
        }).catch(()=>{});
      }
    }
  }catch(_){}
  const cerrar = document.getElementById('ubicarCerrar');
  if(cerrar) cerrar.addEventListener('click', ()=>{
    if(_shellActivo()){ cerrarHoja(); return; }
    sec.hidden = true; sec.innerHTML='';
    if(ubicarMap){ try{ubicarMap.remove();}catch(e){} ubicarMap=null; }
  });
  if(shell){
    /* Un solo lienzo: el punto y sus polígonos se pintan sobre el mapa de
       fondo. El mini-mapa del resultado queda oculto por CSS. */
    hojaIr(_hojaAlturas()[2]);
    pintarUbicacionEnGlobal(latlng, precision);
  } else {
    setTimeout(()=>initUbicarMap(latlng, precision), 60);
  }
}


/* ═══ CONSTANCIA DE CAMPO ═════════════════════════════════════════════
   Imagen compartible del resultado de «¿Dónde estoy?», sin abrir ficha:
   coordenada, fecha y hora, precisión, coberturas por jerarquía, régimen de
   Suelo de Conservación, zona del programa de manejo y del PGOEDF en el punto,
   alcaldía y área más cercana. Reutiliza el generador de las fichas. */
let _ubiUltimo = null;
function _geoDeCobertura(c){
  try{
    if(!c || !c.ficha) return null;
    const [tipo, ref] = c.ficha.split('::');
    if(tipo === 'inv')   return ((GEOMETRIES && GEOMETRIES.features) || []).find(f => f.properties.nombre === ref) || null;
    if(tipo === 'arcac') return ((ARCAC_GEO && ARCAC_GEO.features) || []).find(f => String(f.properties.no) === String(ref)) || null;
    if(tipo === 'zp')    return ((ZP_DESIGNACIONES && ZP_DESIGNACIONES.features) || []).find(f => f.properties && f.properties.capa === ref) || null;
  }catch(_){}
  return null;
}
function _marcoAlrededor(latlng, m){
  const dLat = m / 111320, dLng = m / (111320 * Math.cos(latlng.lat * Math.PI / 180));
  return { type:'Polygon', coordinates:[[[latlng.lng-dLng, latlng.lat-dLat],[latlng.lng+dLng, latlng.lat-dLat],[latlng.lng+dLng, latlng.lat+dLat],[latlng.lng-dLng, latlng.lat+dLat],[latlng.lng-dLng, latlng.lat-dLat]]] };
}
function descConstancia(u, scFC){
  const covs = u.covs || [];
  const principal = covs[0] || null;
  const dInv = principal && principal.ficha && principal.ficha.indexOf('inv::') === 0
    ? DATA.find(x => x.nombre === principal.nombre) : null;
  const fecha = u.cuando || new Date();
  const fechaTxt = fecha.toLocaleDateString('es-MX', {day:'2-digit', month:'long', year:'numeric'})
                 + ' · ' + fecha.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
  const coord = u.latlng.lat.toFixed(6) + ', ' + u.latlng.lng.toFixed(6);
  const enCDMX = u.ent === 'CDMX';
  const color = principal ? colorLiteral(principal.color)
              : (u.sc === true ? colorLiteral('var(--sc)') : COL_GRIS_NEUTRO);
  const geoP = principal ? _geoDeCobertura(principal) : null;
  /* Capas de contexto: Suelo de Conservación siempre que exista la capa, y
     las demás coberturas del punto como contornos en su color. */
  const capas = [];
  /* SC solo si alguno de sus polígonos toca el encuadre (bbox del área
     principal o del marco alrededor del punto): si no, la leyenda prometería
     una capa que no se ve. */
  const bboxDe = g => { const c = JSON.stringify(g.coordinates).match(/-?\d+\.?\d*(?:e-?\d+)?/g).map(Number); let w=1e9,e=-1e9,s2=1e9,n=-1e9; for(let i=0;i<c.length;i+=2){ if(c[i]<w)w=c[i]; if(c[i]>e)e=c[i]; if(c[i+1]<s2)s2=c[i+1]; if(c[i+1]>n)n=c[i+1]; } return {w,e,s:s2,n}; };
  const bb = bboxDe(geoP ? geoP.geometry : _marcoAlrededor(u.latlng, 900));
  const tocaBB = f => { try{ const b2 = bboxDe(f.geometry); return !(b2.e<bb.w||b2.w>bb.e||b2.n<bb.s||b2.s>bb.n); }catch(_){ return true; } };
  const scCerca = (scFC && scFC.features) ? scFC.features.filter(tocaBB) : [];
  if(scCerca.length)
    capas.push({ id:'extra', fc:{type:'FeatureCollection', features:scCerca}, estilo:{ fill:colorLiteral('var(--sc)'), fillAlpha:.10, stroke:colorLiteral('var(--sc-900)'), width:2.5, dash:[8,6] }, leyenda:'Suelo de Conservación' });
  covs.slice(1).forEach(c => { const g = _geoDeCobertura(c); if(g) capas.push({ id:'extra', fc:{type:'FeatureCollection', features:[g]}, estilo:{ fill:colorLiteral(c.color), fillAlpha:.12, stroke:colorLiteral(c.color), width:3 }, leyenda:c.nombre }); });
  const filas = [];
  filas.push(['FECHA Y HORA', fechaTxt]);
  filas.push(['ORIGEN', (u.etiqueta || 'Punto consultado') + (u.precision ? ' · ±' + Math.round(u.precision) + ' m' : '')]);
  filas.push(['ALCALDÍA', enCDMX ? (u.alc || 'Ciudad de México') : ('Fuera de la CDMX · ' + (u.ent || ''))]);
  if(principal){
    filas.push([covs.length > 1 ? 'ÁREA PRINCIPAL' : 'ÁREA', principal.nombre + (principal.tag ? ' · ' + principal.tag : '')]);
    covs.slice(1, 4).forEach(c => filas.push(['TAMBIÉN EN', c.nombre + (c.tag ? ' · ' + c.tag : '')]));
  } else {
    filas.push(['COBERTURA', u.sc === true ? 'Suelo de Conservación, sin área decretada' : 'Ninguna AVA, ANP, ARCAC ni Suelo de Conservación']);
  }
  if(dInv){
    filas.push(['PROGRAMA DE MANEJO', dInv.programa_manejo === 'Sí' ? ('Publicado' + (dInv.fecha_pm ? ' · ' + dInv.fecha_pm : '')) : 'Sin programa vigente']);
    if(typeof isCoadmin === 'function' && isCoadmin(dInv.nombre)) filas.push(['COADMINISTRACIÓN', 'Convenio Marco SEMARNAT–CONANP–CDMX 2025']);
    if(u.zonaPM) filas.push(['ZONA PM DEL PUNTO', u.zonaPM]);
    else if(u.zonaPMEstado === 'nd' && dInv.programa_manejo === 'Sí') filas.push(['ZONA PM DEL PUNTO', 'Zonificación aún no disponible en formato geoespacial']);
    filas.push(['DG RESPONSABLE', dInv.dg_responsable || 'Sin asignar']);
  }
  filas.push(['SUELO DE CONSERVACIÓN', u.sc === true ? 'Dentro' : 'Fuera']);
  if(u.pgoedf) filas.push(['PGOEDF', u.pgoedf]);
  if(!principal && enCDMX){
    try{ const cer = _masCercana(u.latlng, (GEOMETRIES && GEOMETRIES.features) || []); if(cer) filas.push(['ÁREA MÁS CERCANA', cer.nombre + ' · a ' + _fmtKm(cer.d)]); }catch(_){}
  }
  return {
    nombre: principal ? principal.nombre : (u.sc === true ? 'Suelo de Conservación' : (enCDMX ? 'Sin área decretada' : 'Fuera del ámbito de la CDMX')),
    badge: 'Constancia de ubicación',
    subtitulo: principal ? (principal.sub || principal.tag || '') : 'Diagnóstico por punto · SIA',
    color,
    geo: geoP || _marcoAlrededor(u.latlng, 650),
    soloPunto: !geoP,
    grande: coord, grandeLabel: 'COORDENADA · WGS84',
    capas, filas
  };
}
async function compartirConstancia(btn){
  const u = _ubiUltimo; if(!u) return;
  const t = btn && btn.querySelector('.ubi-compartir-txt'); const orig = t ? t.textContent : '';
  if(btn){ btn.disabled = true; if(t) t.textContent = 'Generando…'; }
  const prev = _fichaCtxUbic;
  try{
    let scFC = null; try{ scFC = await loadSueloConservacion(); }catch(_){}
    _fichaCtxUbic = { lat:u.latlng.lat, lng:u.latlng.lng, etiqueta:u.etiqueta || 'Punto consultado' };
    await compartirFichaImagen(descConstancia(u, scFC), btn);
  }catch(err){ console.warn('[Constancia] no se pudo generar:', err); siaToast('No se pudo generar la constancia.'); }
  finally{ _fichaCtxUbic = prev; if(btn){ btn.disabled = false; if(t) t.textContent = orig; } }
}

/* ═══ PGOEDF · ZONIFICACIÓN DEL SUELO DE CONSERVACIÓN ══════════════════
   El Programa General de Ordenamiento Ecológico del Distrito Federal (2000)
   es el instrumento que zonifica el Suelo de Conservación FUERA de las ANP;
   dentro de ellas rige el programa de manejo. Con esto el tablero deja de
   decir solo «estás en Suelo de Conservación» y pasa a decir en qué zona y
   qué actividades permite o prohíbe ahí —117 actividades de 9 sectores—.

   Reglas:
   · Solo se consulta cuando el punto cae en Suelo de Conservación. Fuera de
     él no aplica y no se pide nada.
   · Carga bajo demanda y una sola vez por sesión: el polígono pesa 956 KB y
     la tabla 22 KB. Nada de esto entra al arranque.
   · No entra a DATA ni a GEOMETRIES ni a los contadores. Es otro régimen.
   · Las zonas PDU (Programas Parciales, Poblados Rurales, Zona Urbana,
     Equipamiento Rural) no tienen catálogo: se rigen por su instrumento de
     desarrollo urbano y así se dice. */
let _pgoedfGeo = null, _pgoedfActs = null, _pgoedfPromesa = null;
function cargarPgoedf(){
  if(_pgoedfGeo && _pgoedfActs) return Promise.resolve(true);
  if(_pgoedfPromesa) return _pgoedfPromesa;
  _pgoedfPromesa = Promise.all([
    fetch('./data/pgoedf.geojson').then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))),
    fetch('./data/pgoedf_actividades.json').then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
  ]).then(([g, a]) => { _pgoedfGeo = g; _pgoedfActs = a; return true; })
    .catch(err => { console.warn('[PGOEDF] no disponible:', err.message); _pgoedfPromesa = null; return false; });
  return _pgoedfPromesa;
}
/* La cartografía trae los nombres sin acento; aquí se escriben bien. */
const PGOEDF_NOMBRE = {
  'Agroecologico':'Agroecológico', 'Agroecologico Especial':'Agroecológico Especial',
  'Agroforestal':'Agroforestal', 'Agroforestal Especial':'Agroforestal Especial',
  'Forestal de Conservacion':'Forestal de Conservación', 'Forestal de Conservacion Especial':'Forestal de Conservación Especial',
  'Forestal de Proteccion':'Forestal de Protección', 'Forestal de Proteccion Especial':'Forestal de Protección Especial',
  'Equipamiento Rural':'Equipamiento Rural', 'Poblados Rurales':'Poblados Rurales',
  'Programas Parciales':'Programas Parciales', 'Zona Urbana':'Zona Urbana'
};
const pgoedfNombre = z => PGOEDF_NOMBRE[z] || z || '';
const PGOEDF_COLOR = {
  FC:'#1f6b4a', FCE:'#3f8f6a', FP:'#1c6b85', FPE:'#4a8fa8',
  AF:'#5d8a5e', AFE:'#86a36a', AE:'#b28e5c', AEE:'#c9a878', PDU:'#8a8d8f'
};
function pgoedfEn(latlng){
  if(!_pgoedfGeo || !_pgoedfGeo.features) return null;
  const f = _pgoedfGeo.features.find(x => x.geometry && geoContainsPoint(latlng.lng, latlng.lat, x.geometry));
  return f ? f.properties : null;
}

function _pgoedfCatalogoHTML(clave){
  const acts = (_pgoedfActs && _pgoedfActs.actividades) || [];
  if(!acts.length || !(clave in (acts[0] || {}))) return '';
  const porSector = {};
  acts.forEach(a => { (porSector[a.sector] = porSector[a.sector] || []).push(a); });
  let perm = 0, proh = 0;
  acts.forEach(a => { if(a[clave] === 'A') perm++; else if(a[clave] === 'P') proh++; });
  let html = `<div class="pg-resumen"><span class="pg-si">${perm} permitidas</span>`
           + `<span class="pg-no">${proh} prohibidas</span></div>`
           + `<details class="pg-catalogo"><summary>Ver catálogo de actividades para esta zona</summary><div class="pg-cuerpo">`;
  Object.keys(porSector).forEach(sec => {
    html += `<div class="pg-grupo"><div class="pg-sector">${esc(sec)}</div><table class="pg-tabla"><tbody>`;
    porSector[sec].forEach(a => {
      const v = a[clave];
      html += `<tr class="${v === 'A' ? 'si' : 'no'}"><td class="pg-marca" aria-label="${v === 'A' ? 'Permitida' : 'Prohibida'}">${v === 'A' ? '✓' : '✗'}</td>`
            + `<td><b>${esc(a.especifica)}</b><span>${esc(a.general)}</span></td></tr>`;
    });
    html += '</tbody></table></div>';
  });
  html += `</div><p class="pg-nota">A = permitida · P = prohibida, según la tabla de actividades del PGOEDF. `
        + `Consulta informativa: prevalece el texto del Programa y el plano oficial.</p></details>`;
  return html;
}

function pintarPgoedf(latlng, enANP){
  const cont = document.getElementById('ubiPgoedf');
  if(!cont) return;
  cont.innerHTML = '<div class="pg-cargando">Consultando la zonificación del Suelo de Conservación…</div>';
  cargarPgoedf().then(ok => {
    if(!document.getElementById('ubiPgoedf')) return;   /* el resultado ya se cerró */
    if(!ok){ cont.innerHTML = '<div class="pg-vacio">La zonificación del PGOEDF no está disponible en este momento.</div>'; return; }
    const z = pgoedfEn(latlng);
    if(_ubiUltimo) _ubiUltimo.pgoedf = z ? (pgoedfNombre(z.zona) + (z.clave !== 'PDU' ? ' (' + z.clave + ')' : '')) : (enANP ? 'No aplica dentro de ANP' : null);
    if(!z){
      cont.innerHTML = enANP
        ? '<div class="pg-vacio"><b>PGOEDF · no aplica en este punto.</b> Dentro de un Área Natural Protegida rige la zonificación de su programa de manejo, no la del Programa de Ordenamiento.</div>'
        : '<div class="pg-vacio"><b>PGOEDF · sin zonificación registrada en este punto.</b> El punto está en Suelo de Conservación pero la cartografía del Programa no lo cubre; verifica contra el plano oficial.</div>';
      return;
    }
    const color = PGOEDF_COLOR[z.clave] || PGOEDF_COLOR.PDU;
    const esPDU = z.clave === 'PDU';
    cont.innerHTML =
      `<div class="pg-bloque" style="--c:${color}">
        <div class="pg-kicker">Zonificación del Suelo de Conservación · PGOEDF 2000</div>
        <div class="pg-zona"><span class="pg-dot"></span>${esc(pgoedfNombre(z.zona))}`
        + (esPDU ? '' : ` <span class="pg-clave">${esc(z.clave)}</span>`) + `</div>`
        + (esPDU
          ? `<p class="pg-texto">Esta zona se rige por su <b>instrumento de desarrollo urbano</b> —programa parcial, `
            + `poblado rural o equipamiento— y no por el catálogo de actividades del PGOEDF.</p>`
          : _pgoedfCatalogoHTML(z.clave))
        + `</div>`;
  });
}

function renderUbicarResultado(latlng, precision, etiqueta){
  /* La coordenada y el ± del GPS se retiraron del pie (12-sep-2026): en campo
     no se usan —el mapa de arriba ya muestra dónde cayó el punto— y ocupaban
     una línea entera del resultado. La precisión SIGUE calculándose: alimenta
     `cerca()` y el aviso ámbar de «estás dentro del margen de error del
     límite», que sí es información operativa. */
  const acc = precision ? Math.round(precision) : null;
  const alc = _alcaldiaEn(latlng);
  const sc  = _enSueloConservacion(latlng);
  const covs = _coberturasEn(latlng);
  const cerca = d => (acc && isFinite(d) && d < acc);

  const ent    = _entidadEn(latlng);
  const enCDMX = ent === 'CDMX';
  const GF     = (typeof GEOMETRIES!=='undefined' && GEOMETRIES && GEOMETRIES.features) || [];
  const dom    = _ubicarDomicilio;

  /* Contexto en dos lineas: administrativa arriba, geodesica abajo.
     Colonia y CP solo existen cuando el punto vino de una direccion. */
  const sep = '&nbsp;&nbsp;·&nbsp;&nbsp;';
  const ctx = [ enCDMX ? (alc || 'Ciudad de México') : 'Fuera de la CDMX',
                dom && dom.colonia ? 'Col. ' + dom.colonia : null,
                dom && dom.cp      ? 'CP ' + dom.cp        : null ]
              .filter(Boolean).map(esc).join(sep)
            + ' ' + _entChip(ent);

  let cabeza, cuerpo = '';

  if(covs.length){
    const c     = covs[0];
    const lim   = _limitrofeDe(c.nombre);
    const esLim = !!(lim && lim.clase === 'cruza');
    cabeza = !enCDMX
      ? 'Dentro del polígono, fuera de la CDMX'
      : (covs.length === 1 ? 'Estás dentro de' : `Estás dentro de ${covs.length} áreas`);

    let aviso = '';
    if(!enCDMX){
      /* CASO 1 · el punto cae en la porcion del poligono que esta en otra entidad */
      aviso = `<div class="ubi-warn"><b>El punto está en territorio de ${esc(ent)}.</b> `
            + (esLim ? `El ${lim.pct_fuera}% de esta área (${lim.ha_fuera} ha) queda fuera de la CDMX. ` : '')
            + `La atribución de competencia no es automática: verifica el instrumento aplicable.</div>`;
    } else if(esLim){
      /* CASO 2 · dentro y del lado correcto; el poligono continua afuera */
      aviso = `<div class="ubi-warn">Área limítrofe: ${lim.ha_fuera} ha del polígono se extienden a `
            + `${esc(lim.entidad || 'otra entidad')}. Este punto sí está en la CDMX.</div>`;
    } else if(cerca(c.borde)){
      aviso = `<div class="ubi-warn">A ${Math.round(c.borde)} m del límite · dentro del margen de error del GPS</div>`;
    }

    /* Lo que decide qué hacer en campo, sin abrir la ficha: régimen de
       administración, si hay programa de manejo y —cuando existe la
       zonificación— en qué zona cae el punto. Antes había que ir a la ficha
       para saberlo, y la zona ni siquiera estaba ahí para el punto. */
    const dInv = (c.ficha && c.ficha.indexOf('inv::') === 0 && typeof DATA !== 'undefined')
      ? DATA.find(x => x.nombre === c.nombre) : null;
    let regimen = '';
    if(dInv){
      const pm = dInv.programa_manejo === 'Sí';
      const coad = (typeof isCoadmin === 'function') && isCoadmin(dInv.nombre);
      regimen = '<div class="ubi-regimen">'
        + (coad ? '<span class="ubi-chip ubi-chip-coadmin" title="Convenio Marco SEMARNAT–CONANP–CDMX 2025">Coadministración con la Federación</span>' : '')
        + `<span class="ubi-chip ${pm ? 'ubi-chip-pm' : 'ubi-chip-nopm'}">${pm
            ? 'Programa de manejo publicado' + (dInv.fecha_pm ? ' · ' + esc(dInv.fecha_pm) : '')
            : 'Sin programa de manejo vigente'}</span>`
        + (sc === false ? '<span class="ubi-chip ubi-chip-urbano">Suelo urbano</span>' : '')
        + '</div>'
        + (pm ? '<div class="ubi-zona-pm" id="ubiZonaPM"></div>' : '');
    }
    cuerpo += `<div class="ubi-main" style="--c:${esc(c.color)}">
      <div class="ubi-main-cat"><span class="ubi-dot"></span>${esc(c.tag)}`
      + (esLim ? ' <span class="lim">Limítrofe</span>' : '') + `</div>
      <div class="ubi-main-nom">${esc(c.nombre)}</div>
      ${aviso}
      ${regimen}
      <button type="button" class="ubi-ficha" data-ficha="${esc(c.ficha)}">Ver ficha completa <span class="ar">→</span></button>
    </div>`;

    const resto = covs.slice(1);
    if(resto.length){
      cuerpo += '<div class="ubi-jerarquia">Se muestra primero la figura de mayor jerarquía normativa; '
              + 'las demás aplican de forma concurrente en este punto.</div>';
    }
    if(resto.length || sc === true){
      cuerpo += '<div class="ubi-lista">';
      resto.forEach(x=>{
        cuerpo += `<div class="ubi-item" style="--c:${esc(x.color)}">
          <span class="ubi-dot"></span>
          <span class="ubi-item-txt"><b>${esc(x.nombre)}</b><span>${esc(x.tag)}</span></span>
          <button type="button" class="ubi-mini" data-ficha="${esc(x.ficha)}" aria-label="Ver ficha de ${esc(x.nombre)}">→</button>
        </div>`;
      });
      if(sc === true){
        cuerpo += `<div class="ubi-item" style="--c:var(--sc)">
          <span class="ubi-dot"></span>
          <span class="ubi-item-txt"><b>Suelo de Conservación</b><span>Régimen territorial</span></span>
        </div>`;
      }
      cuerpo += '</div>';
    }
  } else if(!enCDMX){
    /* CASOS 3 y 4 · fuera del ambito territorial de la Secretaria */
    const limc = _limitrofeCerca(latlng, 500);
    const cer  = _masCercana(latlng, GF);
    cabeza = 'Fuera del ámbito de la CDMX';
    cuerpo += `<div class="ubi-main ubi-vacio" style="--c:${COL_GRIS_NEUTRO}">
      <div class="ubi-main-cat"><span class="ubi-dot"></span>Otra entidad federativa</div>
      <div class="ubi-main-nom">El punto está en ${esc(ent)}</div>
      <div class="ubi-warn">La competencia de la Secretaría no alcanza este punto. Verifica con la autoridad estatal.</div>
    </div>`;
    if(limc){
      /* CASO 3 · hay un area cuyo poligono si cruza el limite a menos de 500 m */
      cuerpo += `<div class="ubi-lista">
        <div class="ubi-item" style="--c:${esc((typeof GROUP_COLORS!=='undefined' && GROUP_COLORS[limc.grupo])||'#b28e5c')}">
          <span class="ubi-dot"></span>
          <span class="ubi-item-txt"><b>${esc(limc.nombre)}</b><span>Limítrofe · a ${_fmtDist(limc.d)} · ${limc.lim.ha_fuera} ha en ${esc(limc.lim.entidad||'esta entidad')}</span></span>
          <button type="button" class="ubi-mini" data-ficha="inv::${esc(limc.nombre)}" aria-label="Ver ficha">→</button>
        </div></div>`;
    } else if(cer){
      cuerpo += `<div class="ubi-lista">
        <div class="ubi-item" style="--c:${esc((typeof GROUP_COLORS!=='undefined' && GROUP_COLORS[cer.grupo])||COL_GRIS_NEUTRO)}">
          <span class="ubi-dot"></span>
          <span class="ubi-item-txt"><b>${esc(cer.nombre)}</b><span>Más cercana · ${esc(cer.grupo||'')} · a ${_fmtDist(cer.d)}</span></span>
          <button type="button" class="ubi-mini" data-ficha="inv::${esc(cer.nombre)}" aria-label="Ver ficha">→</button>
        </div></div>`;
    }
  } else {
    const cer = _masCercana(latlng, GF);
    if(sc === true){
      cabeza = 'Suelo de Conservación';
      cuerpo += `<div class="ubi-main" style="--c:var(--sc)">
        <div class="ubi-main-cat"><span class="ubi-dot"></span>Suelo de Conservación</div>
        <div class="ubi-main-nom">Dentro, sin área decretada</div>
      </div>`;
    } else {
      cabeza = 'Sin área decretada';
      cuerpo += `<div class="ubi-main ubi-vacio" style="--c:${COL_GRIS_NEUTRO}">
        <div class="ubi-main-cat"><span class="ubi-dot"></span>Sin cobertura</div>
        <div class="ubi-main-nom">Ninguna AVA, ANP, ARCAC ni Suelo de Conservación</div>
      </div>`;
    }
    if(cer){
      cuerpo += `<div class="ubi-lista">
        <div class="ubi-item" style="--c:${esc((typeof GROUP_COLORS!=='undefined' && GROUP_COLORS[cer.grupo])||COL_GRIS_NEUTRO)}">
          <span class="ubi-dot"></span>
          <span class="ubi-item-txt"><b>${esc(cer.nombre)}</b><span>Más cercana · ${esc(cer.grupo||'')} · a ${_fmtDist(cer.d)}</span></span>
          <button type="button" class="ubi-mini" data-ficha="inv::${esc(cer.nombre)}" aria-label="Ver ficha">→</button>
        </div></div>`;
    }
  }

  return `<div class="gm-handle" id="ubicarAsa" aria-hidden="true"></div>
  <div class="panel ubi-panel">
    <div class="ubi-cabeza"><span class="ubi-cabeza-txt">${esc(cabeza)}</span>
      <button type="button" class="ubi-compartir" id="ubiCompartir" aria-label="Compartir constancia de ubicación" title="Compartir constancia de ubicación">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        <span class="ubi-compartir-txt">Constancia</span>
      </button>
      <button type="button" class="ubi-cerrar" id="ubicarCerrar" aria-label="Cerrar resultado">×</button></div>
    ${_avisoCapasHTML('ubi-warn')}
    ${etiqueta ? `<p class="ubi-etiqueta">${esc(etiqueta)}</p>` : ''}
    <div class="ubi-grid">
      <div class="ubi-col">${cuerpo}</div>
      <div class="ubi-col"><div class="ubi-map" id="ubicarMapCanvas"></div></div>
    </div>
    ${sc === true && enCDMX ? '<div id="ubiPgoedf" class="pg-cont"></div>' : ''}
    <div class="ubi-ctx">${ctx}</div>
  </div>`;
}

/* ═══ BOTÓN DE CAPAS (celular) ═════════════════════════════════════════
   En celular la rejilla de capas del mapa repetía, con otro aspecto, los
   mismos chips del inventario y gastaba cuatro renglones de pantalla. Se
   pliega detrás de un botón redondo sobre el mapa —el patrón `layers` del
   kit— y se despliega al tocarlo. No cambia ninguna lógica: son los mismos
   chips, solo que guardados. */
/* ═══ SELECTOR DE CAPA BASE PLEGADO (celular) ══════════════════════════
   El par MAPA | SATÉLITE ocupaba media anchura del lienzo de forma permanente
   para una decisión que se toma una vez. Como en Maps, se pliega tras un botón
   redondo en la esquina superior derecha y las opciones aparecen al tocarlo.
   Se reutiliza el mismo par de botones —no se duplica nada—: solo se esconde
   y se le pone encima el disparador. */
function montarBotonBase(){
  document.querySelectorAll('.map-block-controls-floating').forEach(cont=>{
    const toggle = cont.querySelector('.map-block-toggle');
    if(!toggle || cont.querySelector('.btn-base')) return;
    const b = document.createElement('button');
    b.type='button'; b.className='btn-base';
    b.setAttribute('aria-label','Tipo de mapa');
    b.setAttribute('aria-expanded','false');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
                + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                + '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>';
    b.addEventListener('click', e=>{
      e.stopPropagation();
      /* El menú no debe salirse del lienzo: se le pasa el alto del mapa y el
         CSS lo convierte en tope con desplazamiento interno. */
      try{ const lz = cont.parentElement; if(lz) cont.style.setProperty('--lienzo-h', lz.clientHeight + 'px'); }catch(_){}
      const ab = cont.classList.toggle('base-abierto');
      b.setAttribute('aria-expanded', ab ? 'true' : 'false');
    });
    /* Al elegir una capa BASE se cierra, como en Maps: la decisión ya se tomó.
       Los interruptores de capa superpuesta no cierran el panel: se encienden
       y se apagan sobre la base elegida y a menudo se toca más de uno. */
    toggle.addEventListener('click', e=>{
      if(!(e.target.closest && e.target.closest('[data-layer]'))) return;
      cont.classList.remove('base-abierto');
      b.setAttribute('aria-expanded','false');
    });
    cont.appendChild(b);

    /* Suelo de Conservación no es una capa base —puede estar encendida a la vez
       que Mapa o que Satélite—, así que baja al mismo menú pero en su propia
       sección, como los «detalles del mapa» de Maps. Se mueve el mismo nodo,
       no se duplica: conserva su id y todos sus escuchas. */
    const lienzo = cont.parentElement;
    const seccionCapas = ()=>{
      let sec = toggle.querySelector('.capa-extra');
      if(!sec){
        sec = document.createElement('div'); sec.className = 'capa-extra';
        const tit = document.createElement('span'); tit.className = 'capa-extra-tit'; tit.textContent = 'Capas';
        sec.appendChild(tit); toggle.appendChild(sec);
      }
      return sec;
    };
    /* Orden dentro de «Capas» en la ficha: primero la zonificación del
       programa de manejo (la capa propia de ESTA área) y debajo Suelo de
       Conservación (el régimen general). Se mueven los mismos nodos: conservan
       id y escuchas; si el área no tiene zonificación, montarZonificacionEnMapa
       retira el interruptor de donde esté. */
    const zw = lienzo && lienzo.querySelector('.zonif-flotante');
    if(zw && !toggle.contains(zw)){ zw.classList.add('en-menu'); seccionCapas().appendChild(zw); }
    const sc = lienzo && lienzo.querySelector('.drawer-sc-floating');
    if(sc && !toggle.contains(sc)){ sc.classList.add('en-menu'); seccionCapas().appendChild(sc); }
    /* «Usar mi ubicación» vive SOBRE el mapa, como botón redondo guinda en la
       esquina inferior derecha: es la acción que más se repite en campo y al
       lado del buscador estorbaba (decisión del 12-sep-2026). Dispara el
       mismo manejador que el botón original, que queda oculto pero vivo. */
    if(lienzo && lienzo.id === 'globalMapCanvas' && !lienzo.querySelector('.gps-fab')){
      const fab = document.createElement('button');
      fab.type = 'button'; fab.className = 'gps-fab';
      fab.setAttribute('aria-label','Usar mi ubicación'); fab.title = 'Usar mi ubicación';
      fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></svg>';
      fab.addEventListener('click', e=>{
        e.stopPropagation();
        const orig = document.getElementById('ubicarGps');
        if(orig && !orig.disabled) orig.click();
      });
      const orig = document.getElementById('ubicarGps');
      if(orig && typeof MutationObserver !== 'undefined'){
        new MutationObserver(()=>{ fab.disabled = orig.disabled; fab.classList.toggle('buscando', orig.disabled); })
          .observe(orig, {attributes:true, attributeFilter:['disabled']});
      }
      lienzo.appendChild(fab);
    }
    /* En celular, los chips de categoría (inventario, coadministración, ARCAC,
       Suelo de Conservación) entran al MISMO menú. Antes tenían un segundo
       botón con el mismo icono en la esquina opuesta: dos controles iguales
       para «capas» en un mapa de 360 px. Un solo menú, dos secciones: fondo
       arriba, capas abajo. Es el mismo nodo #mapFilters: conserva id y
       escuchas, y las funciones que lo rellenan lo siguen encontrando. */
    if(window.matchMedia('(max-width:760px)').matches){
      const panel = cont.closest('.panel-mapa');
      const filtros = panel && panel.querySelector('.map-filters');
      if(filtros && !filtros.classList.contains('map-filters--oculto') && !toggle.contains(filtros)){
        filtros.classList.add('en-menu');
        seccionCapas().appendChild(filtros);
      }
    }
  });
}
/* Un toque FUERA cierra el panel abierto. Dentro no: ahi vive el interruptor
   de capa superpuesta, que se enciende y se apaga sin cerrar el menu. */
document.addEventListener('click', e=>{
  const dentro = e.target && e.target.closest && e.target.closest('.map-block-controls-floating');
  document.querySelectorAll('.map-block-controls-floating.base-abierto').forEach(c=>{
    if(dentro === c) return;
    c.classList.remove('base-abierto');
    const b = c.querySelector('.btn-base'); if(b) b.setAttribute('aria-expanded','false');
  });
});

function montarBotonCapas(){
  /* Retirado el 12-sep-2026: los chips de capa viven ahora dentro del menú
     de «Tipo de mapa» (ver montarBotonBase). Se conserva la función porque
     el arranque la invoca. */
}

/* Capa de la ubicación resuelta sobre el mapa global. Vive aparte del resto
   de capas para poder borrarla entera en cada consulta sin tocar el
   inventario que ya está pintado. */
let _capaUbicGlobal = null;

/* Dibuja punto, margen de precisión y polígonos de cobertura en el mapa que se
   le pase, y devuelve los límites. Antes esto vivía dentro de initUbicarMap y
   por eso el caparazón de celular no podía reutilizarlo: tenía que crear un
   segundo mapa para ver lo mismo. */
function _dibujarUbicacion(map, destino, latlng, precision){
  const bounds = L.latLngBounds([[latlng.lat, latlng.lng]]);
  _coberturasEn(latlng).forEach(c=>{
    let feat = null;
    try{
      if(c.ficha.indexOf('inv::')===0) feat = GEOM_INDEX[slugify(c.ficha.slice(5))];
      else if(c.ficha.indexOf('arcac::')===0) feat = ((ARCAC_GEO&&ARCAC_GEO.features)||[]).find(f=>String(f.properties.no)===c.ficha.slice(7));
      else if(c.ficha.indexOf('zp::')===0) feat = ((ZP_DESIGNACIONES&&ZP_DESIGNACIONES.features)||[]).find(f=>f.properties.capa===c.ficha.slice(4));
    }catch(e){}
    if(!feat) return;
    const l = L.geoJSON(feat,{style:{color:c.color,weight:2,fillColor:c.color,fillOpacity:0.2}}).addTo(destino);
    l.bindTooltip(c.nombre,{sticky:true,direction:'top'});
    try{ bounds.extend(l.getBounds()); }catch(e){}
  });
  /* Marca del kit (frame MARKS). Dos marcas distintas porque son dos hechos
     distintos: el punto azul con aro blanco es «aquí estás» según el GPS y va
     acompañado del halo de precisión; la gota es «este es el lugar que
     buscaste», que no tiene margen de error que dibujar. Antes las dos se
     pintaban igual y el usuario no podía distinguirlas. */
  if(precision != null){
    L.circle([latlng.lat,latlng.lng],{radius:precision,color:COL_AZUL_UBIC,weight:1,
      fillColor:COL_AZUL_UBIC,fillOpacity:.12,interactive:false}).addTo(destino);
    L.marker([latlng.lat,latlng.lng],{interactive:false,keyboard:false,
      icon:L.divIcon({className:'gm-mark gm-mark-gps',html:'<i></i>',
        iconSize:[22,22],iconAnchor:[11,11]})}).addTo(destino);
  } else {
    L.marker([latlng.lat,latlng.lng],{interactive:false,keyboard:false,
      icon:L.divIcon({className:'gm-mark gm-mark-pin',
        html:'<svg viewBox="0 0 24 34" width="26" height="34" aria-hidden="true">'
           + '<path d="M12 33.5C12 33.5 23 20.6 23 12A11 11 0 1 0 1 12c0 8.6 11 21.5 11 21.5Z"'
           + ' fill="#9D2148" stroke="#fff" stroke-width="1.6"/>'
           + '<circle cx="12" cy="12" r="4.1" fill="#6d1733"/></svg>',
        iconSize:[26,34],iconAnchor:[13,34]})}).addTo(destino);
  }
  return bounds;
}

/* Caparazón de celular: pinta sobre el mapa global en vez de crear otro, y
   encuadra dejando libre el alto que ocupa la hoja. */
function pintarUbicacionEnGlobal(latlng, precision){
  if(!globalMap || typeof L === 'undefined') return;
  if(_capaUbicGlobal){ try{ globalMap.removeLayer(_capaUbicGlobal); }catch(e){} }
  /* …y en el otro sentido: el marcador que dejó el control «Ubicarme» del
     mapa se retira antes de pintar el de la consulta. */
  try{ const pv=_locateRefs.get(globalMap);
       if(pv){ globalMap.removeLayer(pv.m); globalMap.removeLayer(pv.c); _locateRefs.delete(globalMap); } }catch(e){}
  _capaUbicGlobal = L.layerGroup().addTo(globalMap);
  const bounds = _dibujarUbicacion(globalMap, _capaUbicGlobal, latlng, precision);
  const hoja = document.getElementById('ubicarResultado');
  const tapa = hoja ? Math.round(hoja.getBoundingClientRect().height * 0) : 0;
  const pad  = { paddingTopLeft:[18, 78], paddingBottomRight:[18, _hojaVis + 18 + tapa] };
  try{
    if(bounds.isValid()) globalMap.fitBounds(bounds, Object.assign({maxZoom:16}, pad));
    else globalMap.setView([latlng.lat,latlng.lng], 15);
  }catch(e){ try{ globalMap.setView([latlng.lat,latlng.lng], 15); }catch(_){} }
}
function limpiarUbicacionGlobal(){
  if(globalMap && _capaUbicGlobal){ try{ globalMap.removeLayer(_capaUbicGlobal); }catch(e){} }
  _capaUbicGlobal = null;
}

function initUbicarMap(latlng, precision){
  const cont = document.getElementById('ubicarMapCanvas');
  if(!cont || typeof L === 'undefined') return;
  if(ubicarMap){ try{ ubicarMap.remove(); }catch(e){} ubicarMap = null; }
  /* setView antes de agregar capas: Leaflet necesita una vista establecida
     o los vectores fallan en _clipPoints al no existir aún los pixelBounds. */
  ubicarMap = L.map(cont, {zoomControl:true, scrollWheelZoom:false, attributionControl:true})
                .setView([latlng.lat, latlng.lng], 14);
  try{ ubicarMap.invalidateSize(); }catch(e){}
  L.tileLayer(TILE_LAYERS.positron.url,{attribution:TILE_LAYERS.positron.attribution,maxZoom:TILE_LAYERS.positron.maxZoom}).addTo(ubicarMap);
  try{ createAlcaldiasLayer({interactive:false}).addTo(ubicarMap); }catch(e){}

  const bounds = _dibujarUbicacion(ubicarMap, ubicarMap, latlng, precision);

  if(bounds.isValid()){ ubicarMap.fitBounds(bounds,{padding:[24,24],maxZoom:16}); ubicarMap._siaHome = bounds; }
  else ubicarMap.setView([latlng.lat,latlng.lng],15);
  ubicarMap.on('click focus', ()=>ubicarMap.scrollWheelZoom.enable());
  ubicarMap.on('mouseout',    ()=>ubicarMap.scrollWheelZoom.disable());
  addResetViewControl(ubicarMap, 'Vista general');
  setTimeout(()=>{ try{ ubicarMap.invalidateSize(); }catch(e){} }, 200);
}


/* ═══ ZONIFICACIÓN DE LOS PROGRAMAS DE MANEJO ═════════════════════════
   Séptimo módulo del tablero y el primero que responde QUÉ SE PUEDE HACER
   dentro de un área, no solo qué área es. Reglas de arquitectura:

   · NO entra a DATA ni a GEOMETRIES. No toca los 66 ni ningún contador.
   · Una carga por área y bajo demanda: los siete archivos suman 686 KB y
     nadie consulta siete áreas a la vez. El índice —4.8 KB— se pide una vez.
   · Un archivo puede cubrir VARIAS poligonales: el programa de manejo de la
     Sierra de Santa Catarina es uno solo para su ZCE y su ZSCE. El índice lo
     dice en `areas` y la ficha lo advierte, porque si no las superficies no
     cuadran y parecería un error del dato.
   · Solo existen siete de las 27 ANP. Donde no hay, la ficha lo dice; el
     silencio se leería como «no aplica». */
const ZONIF_RUTA = './data/zonificacion/';
let _zonifIndice = null, _zonifIndicePromesa = null;
const _zonifCache = {};

function zonifIndice(){
  if(_zonifIndice) return Promise.resolve(_zonifIndice);
  if(_zonifIndicePromesa) return _zonifIndicePromesa;
  _zonifIndicePromesa = fetch(ZONIF_RUTA + 'index.json')
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(j => (_zonifIndice = j))
    .catch(err => { console.warn('[Zonificación] índice no disponible:', err.message);
                    return (_zonifIndice = {}); });
  return _zonifIndicePromesa;
}
function zonifDe(nombre){
  return zonifIndice().then(ix => (ix && ix[nombre]) || null);
}
function zonifGeo(entrada){
  if(!entrada) return Promise.resolve(null);
  const a = entrada.archivo;
  if(_zonifCache[a]) return Promise.resolve(_zonifCache[a]);
  return fetch(ZONIF_RUTA + a)
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(g => (_zonifCache[a] = g))
    .catch(err => { console.warn('[Zonificación] ' + a + ':', err.message); return null; });
}

/* Familias de zonificación. Los decretos y programas escriben el mismo
   concepto de seis maneras —«Zona de Restauracion Ecologica», «Restauración
   Ecológica»—, así que el color se asigna por familia normalizada y el texto
   literal del instrumento se conserva intacto para mostrarlo. */
const ZONIF_FAMILIAS = [
  { id:'proteccion',  prueba:/^proteccion/,                  color:'#1f6b4a', lbl:'Protección' },
  { id:'restaura',    prueba:/^(restauracion|recuperacion)/, color:'#b28e5c', lbl:'Restauración y recuperación' },
  { id:'uso-publico', prueba:/^uso publico/,                 color:'#364fc7', lbl:'Uso público' },   /* índigo: ΔE 13.7 frente al punto GPS; el azul anterior era el mismo de ANP Federal */
  { id:'uso-especial',prueba:/^uso especial/,                color:'#8f4889', lbl:'Uso especial' },
  { id:'agricola',    prueba:/^agricola/,                    color:'#5d8a5e', lbl:'Agrícola chinampera' },
  { id:'ahi',         prueba:/ahi|asentamiento/,             color:'#55585a', lbl:'Asentamientos humanos irregulares' },
];
function zonifFamilia(k){
  const s = String(k || '');
  for(const f of ZONIF_FAMILIAS) if(f.prueba.test(s)) return f;
  return { id:'otra', color:'#8a8d8f', lbl:'Otra' };
}

/* ── Sección de la ficha ───────────────────────────────────────────── */
function pintarZonificacion(d){
  const cont = document.getElementById('fichaZonif');
  if(!cont || !d) return;
  zonifDe(d.nombre).then(e=>{
    if(!e){
      /* Regla del dato: puede haber programa de manejo sin archivo de
         zonificación, nunca al revés. Los dos casos se dicen distinto. */
      const tienePM = d.programa_manejo === 'Sí';
      cont.innerHTML = '<div class="zonif-h">Zonificación del programa de manejo</div>' + (tienePM
        ? '<div class="zonif-vacio"><b>Cuenta con programa de manejo'
          + (d.fecha_pm ? ' (' + esc(d.fecha_pm) + ')' : '') + '</b>, pero su zonificación aún no está '
          + 'disponible en formato geoespacial en este tablero. Siete ANP la tienen hoy; '
          + 'cuando se cargue la de esta área aparecerá aquí y en el mapa.</div>'
        : '<div class="zonif-vacio"><b>Sin programa de manejo publicado.</b> No hay zonificación que mostrar: '
          + 'la zonificación es un contenido del programa de manejo.</div>');
      return;
    }
    const sup = parseFloat(String(d.superficie || '').replace(/,/g,'')) || null;
    const varias = (e.areas || []).length > 1;
    const filas = e.zonas.map(z=>{
      const f = zonifFamilia(z.k);
      const pct = e.total_ha ? (z.ha / e.total_ha * 100) : null;
      return '<tr>'
        + '<td><span class="zonif-sw" style="background:' + f.color + '"></span>' + esc(z.zona) + '</td>'
        + '<td class="num">' + fmt(Math.round(z.ha)) + '</td>'
        + '<td class="num">' + (pct != null ? pct.toFixed(1) + '%' : '—') + '</td>'
        + '</tr>';
    }).join('');
    cont.innerHTML =
      '<div class="zonif-h">Zonificación del programa de manejo</div>'
      + (varias ? '<p class="zonif-nota">El programa de manejo es uno solo para las dos '
          + 'poligonales de esta área (' + esc(e.areas.join(' y ')) + '), así que la superficie '
          + 'zonificada corresponde a ambas.</p>' : '')
      + '<table class="zonif-tabla"><thead><tr><th>Zona</th><th class="num">ha</th>'
      + '<th class="num">%</th></tr></thead><tbody>' + filas + '</tbody>'
      + '<tfoot><tr><td>Total zonificado</td><td class="num">' + fmt(Math.round(e.total_ha))
      + '</td><td class="num">'
      + (sup && !varias ? (e.total_ha / sup * 100).toFixed(1) + '%' : '—')
      + '</td></tr></tfoot></table>'
      + '<p class="zonif-pie">' + e.poligonos + ' polígonos · fuente: programa de manejo '
      + 'publicado. La superficie zonificada no coincide al decimal con la decretada: la primera '
      + 'se calcula sobre la cartografía del programa y la segunda proviene del decreto.</p>';
    _pintarPuntoEnBloque('zonif');
  });
}

/* ── El punto consultado, dentro de los bloques de la ficha ───────────
   Cuando la ficha se abre desde «¿Dónde estoy?» (o se usa «ubicarme» en su
   minimapa), los bloques de zonificación y de PGOEDF dicen además en qué
   zona cae ESE punto. Misma información que lleva la imagen compartible:
   lo que se ve es lo que se comparte. */
function _resolverPgoedfDelPunto(ctxU){
  try{
    if(!ctxU || !isFinite(ctxU.lat)) return;
    if(typeof _enSueloConservacion === 'function' && _enSueloConservacion(ctxU) !== true){ _pintarPuntoEnBloque('pgoedf'); return; }
    cargarPgoedf().then(ok => {
      if(!ok) return;
      const z = pgoedfEn(ctxU);
      if(z) ctxU.pgoedf = pgoedfNombre(z.zona) + (z.clave !== 'PDU' ? ' (' + z.clave + ')' : '');
      _pintarPuntoEnBloque('pgoedf');
    });
  }catch(_){}
}
function _pintarPuntoEnBloque(tipo){
  try{
    const cont = document.getElementById(tipo === 'zonif' ? 'fichaZonif' : 'fichaPgoedf');
    if(!cont) return;
    const prev = cont.querySelector('.zonif-punto'); if(prev) prev.remove();
    const ctxU = _fichaCtxUbic; if(!ctxU) return;
    const val = tipo === 'zonif' ? ctxU.zona : ctxU.pgoedf;
    if(!val || !cont.innerHTML.trim()) return;
    const p = document.createElement('p'); p.className = 'zonif-punto';
    p.innerHTML = '<span class="zonif-punto-dot"></span><b>Punto consultado:</b> ' + esc(val);
    const pie = cont.querySelector('.zonif-pie');
    if(pie) cont.insertBefore(p, pie); else cont.appendChild(p);
  }catch(_){}
}

/* ── PGOEDF en la ficha ──────────────────────────────────────────────
   Para las áreas que caen en Suelo de Conservación, la ficha dice bajo qué
   zona del Programa General de Ordenamiento Ecológico quedan. No repite el
   catálogo de actividades —eso se consulta por punto en «¿Dónde estoy?»—.
   El cruce es precalculado (data/pgoedf_areas.json): 66 poligonales contra
   523 zonas no se hacen en el navegador. Regla del dato: la cartografía del
   PGOEDF trae las ANP de la época como zona propia y sin ordenamiento; por
   eso un ANP decretado antes del Programa sale con cobertura ~0 y así se
   explica, mientras que los decretados después (Tempiluli, Bosque de
   Tláhuac, San Miguel Ajusco…) sí traen zona. */
let _pgoedfAreas = null, _pgoedfAreasPromesa = null;
function pgoedfAreas(){
  if(_pgoedfAreas) return Promise.resolve(_pgoedfAreas);
  if(_pgoedfAreasPromesa) return _pgoedfAreasPromesa;
  _pgoedfAreasPromesa = fetch('./data/pgoedf_areas.json')
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(j => {
      const a = (j && j.areas) || {};
      try{
        const inv = new Set((DATA || []).map(d => d.nombre));
        const sueltos = Object.keys(a).filter(n => !inv.has(n));
        if(sueltos.length) console.warn('[PGOEDF] nombres sin área en el inventario:', sueltos.join(', '));
      }catch(_){}
      return (_pgoedfAreas = a);
    })
    .catch(err => { console.warn('[PGOEDF] cruce por área no disponible:', err.message); return (_pgoedfAreas = {}); });
  return _pgoedfAreasPromesa;
}
function pintarPgoedfFicha(d){
  const cont = document.getElementById('fichaPgoedf');
  if(!cont || !d) return;
  const estado = scEstado(d);
  if(estado === 'fuera' || estado === 'sindato'){ cont.innerHTML = ''; return; }
  const scp = scPct(d);
  pgoedfAreas().then(areas => {
    if(!document.getElementById('fichaPgoedf')) return;
    const e = areas[d.nombre] || null;
    const cob = e ? e.pct : 0;
    const esANP = d.tipo === 'ANP';
    const intro = '<p class="zonif-intro">Por estar en Suelo de Conservación'
      + (scp != null && scp < 99.5 ? ' (' + scp.toFixed(scp < 10 ? 2 : 1) + '% de su superficie)' : '')
      + ', esta área queda en el ámbito del Programa General de Ordenamiento Ecológico del Distrito Federal (PGOEDF, 2000).</p>';
    let cuerpo = '';
    if(cob >= 2 && e){
      const vis = e.zonas.filter(z => z.pct >= 0.5);
      const resto = e.zonas.filter(z => z.pct < 0.5);
      const filas = vis.map(z => '<tr>'
        + '<td><span class="zonif-sw" style="background:' + (PGOEDF_COLOR[z.clave] || PGOEDF_COLOR.PDU) + '"></span>'
        + esc(pgoedfNombre(z.zona)) + (z.clave !== 'PDU' ? ' <span class="pg-clave">' + esc(z.clave) + '</span>' : '') + '</td>'
        + '<td class="num">' + fmt(Math.round(z.ha)) + '</td>'
        + '<td class="num">' + z.pct.toFixed(1) + '%</td></tr>').join('')
        + (resto.length ? '<tr><td>Otras zonas (menos de 0.5% cada una)</td><td class="num">'
            + fmt(Math.round(resto.reduce((a,z)=>a+z.ha,0))) + '</td><td class="num">'
            + resto.reduce((a,z)=>a+z.pct,0).toFixed(1) + '%</td></tr>' : '');
      cuerpo = '<table class="zonif-tabla"><thead><tr><th>Zona del PGOEDF</th><th class="num">ha</th>'
        + '<th class="num">% del área</th></tr></thead><tbody>' + filas + '</tbody>'
        + '<tfoot><tr><td>Total con zona de ordenamiento</td><td class="num">' + fmt(Math.round(e.cubierto_ha))
        + '</td><td class="num">' + cob.toFixed(1) + '%</td></tr></tfoot></table>';
      const notas = [];
      const restoSC = (scp != null ? scp : 100) - cob;
      if(esANP && restoSC >= 2)
        notas.push('El ' + restoSC.toFixed(1) + '% restante dentro del Suelo de Conservación figura en la cartografía del PGOEDF como Área Natural Protegida, zona que se rige por su decreto y su programa de manejo.');
      if(scp != null && 100 - scp >= 2)
        notas.push('El ' + (100 - scp).toFixed(1) + '% de la poligonal está fuera del Suelo de Conservación de la Ciudad de México y no le aplica el PGOEDF.');
      if(vis.some(z => z.clave === 'PDU'))
        notas.push('Las zonas PDU (poblados rurales, programas parciales, zona urbana y equipamiento rural) se rigen por su instrumento de desarrollo urbano, no por el catálogo de actividades del PGOEDF.');
      cuerpo += notas.map(n => '<p class="zonif-nota">' + n + '</p>').join('');
    } else if(esANP){
      cuerpo = '<div class="zonif-vacio"><b>Figura como Área Natural Protegida en la cartografía del PGOEDF.</b> '
        + 'El Programa no le asigna zona de ordenamiento ni catálogo de actividades: rigen su decreto y, en su caso, su programa de manejo.'
        + (cob >= 0.5 ? ' Una franja marginal (' + cob.toFixed(1) + '%) cae en zonas colindantes por ajuste cartográfico.' : '') + '</div>';
    } else {
      cuerpo = '<div class="zonif-vacio"><b>Sin zona del PGOEDF asignada.</b> La porción de esta área dentro del Suelo de Conservación es marginal'
        + (scp != null ? ' (' + scp.toFixed(2) + '%)' : '') + ' y la cartografía del Programa no la cubre.</div>';
    }
    cont.innerHTML = '<div class="zonif-h">Ordenamiento ecológico · PGOEDF</div>' + intro + cuerpo
      + '<p class="zonif-pie">Fuente: cartografía del PGOEDF (GODF 01/08/2000), cruce geométrico con la poligonal decretada. '
      + 'Las actividades permitidas y prohibidas por zona se consultan por punto en «¿Dónde estoy?».</p>';
    _pintarPuntoEnBloque('pgoedf');
  });
}

/* ── Capa del mini-mapa de la ficha ────────────────────────────────── */
let _zonifCapa = null;
function montarZonificacionEnMapa(mapa, d){
  if(!mapa || !d) return;
  zonifDe(d.nombre).then(e=>{
    const cont = document.getElementById('zonifToggleWrap');
    if(!e){ if(cont) cont.remove(); return; }
    if(!cont) return;
    const btn = document.getElementById('zonifToggle');
    if(!btn) return;
    let prendida = false;
    const apagar = ()=>{ if(_zonifCapa){ try{ mapa.removeLayer(_zonifCapa); }catch(_){} _zonifCapa = null; }
                         try{ if(typeof activeGeoLayer!=='undefined' && activeGeoLayer) activeGeoLayer.setStyle({fillOpacity:0.14, weight:2.5}); }catch(_){}
                         try{ if(mapa._scLayer) mapa._scLayer.setStyle({fillOpacity:0.12}); }catch(_){}
                         prendida = false; btn.classList.remove('active');
                         btn.setAttribute('aria-pressed','false');
                         const l = document.getElementById('zonifLeyenda'); if(l) l.hidden = true; };
    btn.addEventListener('click', async ()=>{
      if(prendida){ apagar(); return; }
      btn.disabled = true;
      const g = await zonifGeo(e);
      btn.disabled = false;
      if(!g){ siaToast('No se pudo cargar la zonificación de esta área.'); return; }
      _zonifCapa = L.geoJSON(g, {
        /* Borde blanco fino entre zonas: dos zonas contiguas de la misma familia
           comparten color y sin él se leen como una sola. */
        style: f => { const c = zonifFamilia((f.properties||{}).zona_k).color;
                      return { color:'#fff', weight:1.25, opacity:.9, fillColor:c, fillOpacity:.45 }; }
      }).addTo(mapa);
      /* El área cede su relleno mientras la zonificación está encendida: si no,
         el guinda tiñe todas las zonas y el dorado se lee café y el azul gris.
         El contorno del área se mantiene y se refuerza. */
      try{ if(typeof activeGeoLayer!=='undefined' && activeGeoLayer) activeGeoLayer.setStyle({fillOpacity:0, weight:3}); }catch(_){}
      try{ if(mapa._scLayer) mapa._scLayer.setStyle({fillOpacity:0.04}); }catch(_){}
      _zonifCapa.eachLayer(l=>{
        const p = (l.feature && l.feature.properties) || {};
        l.bindTooltip('<b>' + esc(p.zona || 'Zona') + '</b><br>'
          + '<span style="font-size:var(--fs-mini);color:var(--muted)">'
          + fmt(Math.round(p.ha || 0)) + ' ha</span>', {sticky:true, direction:'top'});
      });
      /* Debajo del polígono del área: la zonificación es el relleno, el
         contorno del área tiene que seguir leyéndose por encima. */
      try{ _zonifCapa.bringToBack(); }catch(_){}
      prendida = true; btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
      const fam = [...new Set(e.zonas.map(z=>zonifFamilia(z.k).id))];
      const ley = document.getElementById('zonifLeyenda');
      if(ley){
        ley.innerHTML = ZONIF_FAMILIAS.filter(f=>fam.indexOf(f.id) >= 0).map(f=>
          '<span class="zl-i"><span class="zl-sw" style="background:' + f.color + '"></span>'
          + esc(f.lbl) + '</span>').join('');
        ley.hidden = false;
      }
    });
  });
}

/* ── ¿En qué zona cae un punto? ────────────────────────────────────── */
function zonaDePunto(nombreArea, latlng){
  return zonifDe(nombreArea).then(e=>{
    if(!e) return null;
    return zonifGeo(e).then(g=>{
      if(!g) return null;
      const f = (g.features || []).find(x => x.geometry
        && geoContainsPoint(latlng.lng, latlng.lat, x.geometry));
      return f ? { zona: f.properties.zona, k: f.properties.zona_k } : null;
    });
  }).catch(()=>null);
}

/* ═══ MINIMAPA DE FICHA · UN SOLO MARCADO PARA LAS TRES FICHAS ═══════
   Inventario, ARCAC y Zona Patrimonio comparten lienzo, menú de capas
   (Mapa / Satélite · Capas: zonificación cuando existe, Suelo de Conservación
   siempre), pantalla completa y controles. Antes cada ficha armaba su propio
   mapa y dos de ellas salían sin menú ni Suelo de Conservación: distintas
   fichas para la misma pregunta. `zonif` solo lo pide el inventario. */
function fichaMapaHTML(opts){
  const o = opts || {};
  return `
    <div class="map-block">
      <div class="map-canvas" id="mapCanvas" style="position:relative">
        <div class="map-canvas-inner" id="mapCanvasMap"></div>
        <div class="map-block-controls map-block-controls-floating">
          <div class="map-block-toggle">
            <button data-layer="positron" class="active">Mapa</button>
            <button data-layer="satelite">Satélite</button>
          </div>
          <button class="map-fullscreen-btn" type="button" aria-label="Pantalla completa" title="Pantalla completa">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>
          </button>
        </div>
        <div class="drawer-sc-floating">
          <button class="map-filter-chip active" id="drawerSCToggle" type="button" style="--chip-color:var(--sc)"><span class="chip-dot"></span>Suelo de Conservación</button>
        </div>
        ${o.zonif ? `<div class="zonif-flotante" id="zonifToggleWrap"><button class="map-filter-chip" id="zonifToggle" type="button" aria-pressed="false" style="--chip-color:#1f6b4a"><span class="chip-dot"></span>Zonificación del programa de manejo</button></div>
        <div class="zonif-leyenda" id="zonifLeyenda" hidden></div>` : ''}
      </div>
    </div>
`;
}
/* Lo que todo minimapa de ficha lleva después de crearse: base conmutable,
   pantalla completa, Suelo de Conservación en el menú y desplazamiento con
   rueda solo al enfocarlo. */
/* Gestos táctiles del minimapa de ficha. En celular el mapa ocupa la mitad
   de la hoja y Leaflet se queda con el arrastre de un dedo: quien intenta
   desplazar la ficha tocando el mapa no consigue nada («no puedo hacer
   scroll en las fichas»). Como con la rueda en escritorio, el arrastre se
   activa al tocar el mapa y se devuelve a la hoja en cuanto ésta se desplaza.
   Pellizcar para acercar sigue funcionando siempre. */
let _avisoGestoMapa = false;
function _gestosTactilesMinimapa(mapa){
  try{
    if(!mapa || !window.matchMedia('(pointer:coarse)').matches) return;
    mapa.dragging.disable();
    const cont = mapa.getContainer();
    cont.classList.add('mapa-en-reposo');
    mapa.on('click', ()=>{
      if(mapa.dragging.enabled()) return;
      mapa.dragging.enable(); cont.classList.remove('mapa-en-reposo');
      if(!_avisoGestoMapa){ _avisoGestoMapa = true; siaToast('Mapa activo: arrastra con un dedo. Toca fuera del mapa para volver a desplazar la ficha.', 3500); }
    });
    const inn = document.getElementById('drIn');
    if(inn){
      /* Solo un toque del usuario FUERA del mapa lo devuelve al reposo. No se escucha
         `scroll`: el foco que Leaflet da al lienzo al tocarlo desplaza la ficha y ese
         desplazamiento programático volvía a dormir el mapa en el mismo gesto que lo
         activaba. Un solo listener delegado por ficha: cada apertura lo reemplaza. */
      if(inn._siaReposo) inn.removeEventListener('touchstart', inn._siaReposo);
      inn._siaReposo = e=>{
        if(cont.contains(e.target)) return;
        if(mapa.dragging && mapa.dragging.enabled()){ mapa.dragging.disable(); cont.classList.add('mapa-en-reposo'); }
      };
      inn.addEventListener('touchstart', inn._siaReposo, {passive:true});
    }
  }catch(_){}
}
function fichaMapaConectar(container){
  if(!activeMap) return;
  _gestosTactilesMinimapa(activeMap);
  document.querySelectorAll('#dr .map-block-toggle button').forEach(btn=>{
    btn.addEventListener('click', ()=>setBaseLayer(btn.dataset.layer));
  });
  try{ attachFullscreenBtn(container, activeMap); }catch(e){}
  try{ attachSCToggle('drawerSCToggle', activeMap, null, activeGeoLayer); }catch(e){}
  activeMap.on('click focus', ()=> activeMap.scrollWheelZoom.enable());
  activeMap.on('mouseout', ()=> activeMap.scrollWheelZoom.disable());
}

const bd=document.getElementById('bd'),dr=document.getElementById('dr'),drIn=document.getElementById('drIn');
function openDrawer(d){
  const legalParts = getLegalContext(d);
  /* De un solo uso: lo pone el manejador de [data-ficha] justo antes de abrir
     y se consume aquí. Así una ficha abierta después desde la tabla no arrastra
     el punto de una consulta anterior. */
  _fichaCtxUbic = _ctxUbicFicha;
  _ctxUbicFicha = null;
  /* ¿En qué zona del programa de manejo cae el punto consultado? Se resuelve
     aquí y se guarda en el propio contexto para que la imagen compartible
     —que se dibuja de golpe y no puede esperar— ya lo tenga a mano. */
  if(_fichaCtxUbic && typeof zonaDePunto === 'function'){
    const _ctx = _fichaCtxUbic;
    zonaDePunto(d.nombre, _ctx).then(z=>{ if(z){ _ctx.zona = z.zona; _pintarPuntoEnBloque('zonif'); } }).catch(()=>{});
    _resolverPgoedfDelPunto(_ctx);
  }
  destroyMap();
  // Actualizar URL con slug del área (sin recargar página)
  const slug = slugify(d.nombre);
  const newHash = `#area=${slug}`;
  if(location.hash !== newHash){
    history.replaceState(null, '', newHash);
  }
  _marcaFicha(true);
  /* Abre en la posición alta: la ficha es el objeto de la consulta y a media
     altura obligaba a un gesto extra para leer superficie, decreto y suelo de
     conservación. Las otras dos posiciones siguen a un tirón del asa. */
  if(_drMovil()) setTimeout(()=>drIr(_drAlturas()[3]), 0);
  drIn.innerHTML = `
    <div class="drawer-header-row">
      <div class="drawer-header-left">
        <div class="kat">${d.tipo} · ${d.jurisdiccion}</div>
        <h2>${d.nombre}</h2>
        <div class="subcat">${d.categoria}</div>
      </div>
      <button class="btn-share-area" id="btnShareArea" type="button" aria-label="Compartir esta ficha como imagen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        <span class="btn-share-text">Compartir imagen</span>
      </button>
    </div>

    ${fichaMapaHTML({zonif:true})}
    <div class="big-num">${fmt(d.superficie)}<span style="font-size:var(--fs-lg);color:var(--muted);margin-left:6px;font-weight:500">ha</span></div>
    <div class="big-num-lbl">Superficie decretada</div>
    <div class="field"><div class="k">DG responsable</div><div class="v">${
      d.dg_responsable === 'DGSANPAVA' ? '<span class="tag-dg tag-dg-dgsanpava" title="Dirección General del Sistema de Áreas Naturales Protegidas y Áreas de Valor Ambiental">DGSANPAVA</span>' :
      d.dg_responsable === 'DGCORENADER' ? '<span class="tag-dg tag-dg-dgcorenader" title="Dirección General de la Comisión de Recursos Naturales y Desarrollo Rural">DGCORENADER</span>' :
      '<span style="color:var(--muted)">Sin asignar</span>'
    }</div></div>
    <div class="field"><div class="k">Tipo</div><div class="v"><span class="tag tag-${d.tipo} tag-full">${d.tipo==='AVA'?'Área de Valor Ambiental':'Área Natural Protegida'}</span></div></div>
    <div class="field"><div class="k">Jurisdicción</div><div class="v"><span class="tag tag-jur-${d.jurisdiccion}">${d.jurisdiccion}</span></div></div>
    <div class="field"><div class="k">Subcategoría</div><div class="v"><span class="tag-sub sub-${subCode(d.categoria)} tag-sub-full">${d.categoria}</span></div></div>
    <div class="field"><div class="k">Alcaldía(s)</div><div class="v">${d.alcaldia}</div></div>
    <div class="field"><div class="k">Suelo de Conservación</div><div class="v">${(() => {
      /* Un solo elemento: el punto y el texto que lo explica. Con la columna
         de porcentaje el texto dice además cuánto, que es lo que el Sí/No
         nunca pudo decir. */
      return `<span class="status-tag status-sc ${SC_CLS[scEstado(d)]}">${scTexto(d)}</span>`;
    })()}</div></div>
    <!-- Lo que se deriva de caer en Suelo de Conservación va inmediatamente
         debajo del dato que lo origina: la zona del PGOEDF. -->
    <div id="fichaPgoedf" class="zonif-bloque zonif-bloque-intercalado"></div>
    ${isCoadmin(d.nombre) ? `
    <div class="field"><div class="k">Coadminis&shy;tración</div><div class="v">
      <span class="tag-coadmin">Convenio Marco SEMARNAT–CONANP–CDMX 2025</span>
    </div></div>` : ''}
    <div class="field"><div class="k">Fecha decreto</div><div class="v">${d.fecha_decreto}</div></div>
    <div class="field"><div class="k">Programa de manejo</div><div class="v"><span class="status-tag ${d.programa_manejo==='Sí'?'status-tag-si':'status-tag-no'}">${d.programa_manejo==='Sí'?'Publicado':'Sin programa vigente'}</span></div></div>
    <div class="field"><div class="k">Fecha Programa de Manejo</div><div class="v">${d.fecha_pm||'—'}</div></div>
    <!-- Y lo que se deriva de tener programa de manejo, debajo de él: su zonificación. -->
    <div id="fichaZonif" class="zonif-bloque zonif-bloque-intercalado"></div>
    ${renderDocumentosOficiales(d)}
    ${legalParts.length ? `
    <div class="legal-block">
      <div class="title">⚖ Fundamento jurídico aplicable</div>
      ${legalParts.map(p=>`<p><b>${p.t}</b> <span class="ref">(${p.ref})</span> — ${p.p}</p>`).join('')}
    </div>` : ''}
  `;
  bd.classList.add('open'); dr.classList.add('open');
  // Carga e inicializa el mapa después de renderizar el contenido
  loadGeometries().then(()=>{
    initMapForArea(d);
    // Listeners de los toggles de capa base
    document.querySelectorAll('.map-block-toggle button').forEach(btn=>{
      btn.addEventListener('click', ()=>setBaseLayer(btn.dataset.layer));
    });
  });

  /* Un solo conector para las tres fichas (inventario, ARCAC y ZP). */
  conectarCompartir(()=>descInventario(d));
  pintarZonificacion(d);
  pintarPgoedfFicha(d);
  setTimeout(()=>{ try{ montarBotonBase(); }catch(e){} }, 120);
}
/* ═══ LA FICHA COMO HOJA DE TRES POSICIONES ════════════════════════════
   Mismo contrato que la hoja de «Ubicar»: `--dvis` es la altura visible en
   píxeles y el desplazamiento se calcula en CSS. Posiciones: asomada (se ve
   el encabezado), media y completa. Se arrastra solo por el asa —el cuerpo
   tiene su propio desplazamiento—; un toque simple baja a la siguiente y,
   por debajo de la asomada, la ficha se cierra. En escritorio no aplica: ahí
   la ficha sigue siendo un cajón lateral. */
const DR_ASOMADA = 230;
let _drVis = 0;
const _drMovil = () => window.matchMedia('(max-width:760px)').matches;
function _drAlturas(){
  const d = document.getElementById('dr');
  const max = d ? Math.round(d.getBoundingClientRect().height) : Math.round(innerHeight*0.85);
  return [0, Math.min(DR_ASOMADA, max), Math.round(max*0.55), max];
}
function drIr(vis){
  const d = document.getElementById('dr'); if(!d) return;
  _drVis = Math.max(0, vis);
  d.style.setProperty('--dvis', _drVis + 'px');
  const a = document.getElementById('drawerAsa');
  if(a){ const al = _drAlturas();
    a.setAttribute('aria-valuetext', _drVis >= al[3]-2 ? 'completa'
                                   : _drVis >= al[2]-2 ? 'media' : 'asomada'); }
}
function drSnap(vis){
  let best = 0;
  _drAlturas().forEach(v => { if(Math.abs(v - vis) < Math.abs(best - vis)) best = v; });
  drIr(best);
  return best;
}
document.addEventListener('pointerdown', e=>{
  const asa = e.target && e.target.closest && e.target.closest('#drawerAsa');
  if(!asa || !_drMovil()) return;
  const dr = document.getElementById('dr'); if(!dr) return;
  const y0 = e.clientY, v0 = _drVis; let movio = false;
  dr.classList.add('arrastrando');
  const mover = ev => { if(Math.abs(ev.clientY - y0) > 3) movio = true;
                        drIr(v0 + (y0 - ev.clientY)); };
  const soltar = ev => {
    document.removeEventListener('pointermove', mover);
    document.removeEventListener('pointerup', soltar);
    document.removeEventListener('pointercancel', soltar);
    dr.classList.remove('arrastrando');
    if(!movio){                       /* toque simple: baja a la siguiente */
      const al = _drAlturas();
      for(let i = al.length - 1; i >= 0; i--){
        if(al[i] < _drVis - 4){ if(al[i] === 0) closeDrawer(); else drIr(al[i]); return; }
      }
      closeDrawer(); return;
    }
    if(drSnap(v0 + (y0 - ev.clientY)) === 0) closeDrawer();
  };
  document.addEventListener('pointermove', mover);
  document.addEventListener('pointerup', soltar);
  document.addEventListener('pointercancel', soltar);
  e.preventDefault();
});

function _marcaFicha(abierta){
  try{ document.documentElement.classList.toggle('ficha-abierta', !!abierta); }catch(e){}
}

function closeDrawer(){
  _marcaFicha(false);
  try{ _drVis = 0; document.getElementById('dr').style.removeProperty('--dvis'); }catch(e){}
  bd.classList.remove('open');
  dr.classList.remove('open');
  destroyMap();
  // Limpiar hash de la URL (sin generar entrada en history)
  if(location.hash.startsWith('#area=')){
    history.replaceState(null, '', location.pathname + location.search);
  }
}
/* ═══ OPERABILIDAD POR TECLADO ═════════════════════════════════════════
   Las filas de las cinco tablas y los renglones de las dos listas de
   sugerencias se activaban solo con clic. Aqui se les da foco y se traduce
   Enter/Espacio al mismo clic, sin tocar las funciones de render. */
const _NAVEGABLES = 'tr[data-i],tr[data-emb],tr[data-zpkey],tr[data-no],tr[data-a],'
                  + '.ubicar-sugerencias .item';
function _marcarNavegables(){
  document.querySelectorAll(_NAVEGABLES).forEach(el=>{
    if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
    /* El tabindex hizo la fila alcanzable, pero el lector de pantalla seguía
       anunciandola como una fila de tabla cualquiera, sin pista de que Enter
       abre la ficha. role + nombre accesible cierran esa mitad. */
    if(el.tagName === 'TR' && !el.hasAttribute('role')){
      el.setAttribute('role','button');
      const celda = el.querySelector('.name') || el.querySelector('td');
      const nombre = celda && celda.textContent ? celda.textContent.trim() : '';
      if(nombre && !el.hasAttribute('aria-label')) el.setAttribute('aria-label','Ver ficha de ' + nombre);
    }
    /* Las sugerencias del buscador principal eran <div> mudos, a diferencia de las
       de los mini-mapas, que sí declaran su rol. */
    if(el.classList.contains('item') && el.closest('.ubicar-sugerencias') && !el.hasAttribute('role')){
      el.setAttribute('role','option');
    }
  });
}

/* El combobox debe declarar si su lista está desplegada. #ubicarSug se abre y cierra
   alternando el atributo hidden, así que se observa ese atributo en vez de tocar las
   cinco funciones que lo alternan. */
(function(){
  const sug = document.getElementById('ubicarSug');
  const inp = document.getElementById('ubicarInput');
  if(!sug || !inp) return;
  const sincronizar = ()=> inp.setAttribute('aria-expanded', sug.hasAttribute('hidden') ? 'false' : 'true');
  new MutationObserver(sincronizar).observe(sug, {attributes:true, attributeFilter:['hidden']});
  sincronizar();
})();
let _navPend = false;
new MutationObserver(muts=>{
  if(_navPend) return;
  const OJO = 'tr,.item';
  const hayFilas = muts.some(m=>[...m.addedNodes].some(n=>
    n.nodeType===1 && ((n.matches && n.matches(OJO)) || (n.querySelector && n.querySelector(OJO)))));
  if(!hayFilas) return;
  _navPend = true;
  requestAnimationFrame(()=>{ _navPend = false; _marcarNavegables(); });
/* Orden de las tablas de brechas. Delegado en document porque
   renderAnalisisPage() rehace su propio HTML en cada clic: un listener puesto
   sobre los <th> moriría con el primer reordenamiento. */
function _ordenarBrecha(th){
  const tabla = th.closest('table[data-tabla]');
  const est = tabla && ORD_ANALISIS[tabla.dataset.tabla];
  if(!est) return;
  if(est.k === th.dataset.ord) est.dir *= -1; else { est.k = th.dataset.ord; est.dir = 1; }
  const cual = tabla.dataset.tabla;
  renderDashboard();
  /* Devolver el foco al mismo encabezado: sin esto, quien navega con teclado
     vuelve al principio del documento en cada reordenamiento. */
  const nuevo = document.querySelector('table[data-tabla="'+cual+'"] th[data-ord="'+est.k+'"]');
  if(nuevo) nuevo.focus();
}
document.addEventListener('click', e=>{
  const th = e.target.closest && e.target.closest('#dashboard th[data-ord]');
  if(th) _ordenarBrecha(th);
});
document.addEventListener('keydown', e=>{
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const th = e.target.closest && e.target.closest('#dashboard th[data-ord]');
  if(th){ e.preventDefault(); _ordenarBrecha(th); }
});
}).observe(document.body, {childList:true, subtree:true});
_marcarNavegables();

document.addEventListener('keydown', e=>{
  /* Flechas dentro de una lista de sugerencias abierta */
  const lista = document.querySelector('.ubicar-sugerencias:not([hidden])');
  if(lista && (lista.contains(e.target) || e.target.id === 'ubicarInput')
      && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){
    const items = [...lista.querySelectorAll('.item')].filter(x=>x.offsetParent);
    if(items.length){
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      items[e.key === 'ArrowDown' ? (i+1) % items.length : (i-1+items.length) % items.length].focus();
      return;
    }
  }
  /* Enter y Espacio activan lo que tenga el foco */
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest && e.target.closest(_NAVEGABLES);
  if(!el) return;
  e.preventDefault();
  el.dispatchEvent(new MouseEvent('click', {bubbles:true}));
});

/* ═══ FOCO DE LA FICHA LATERAL ═════════════════════════════════════════
   Se envuelven las funciones ya existentes para no tocar su cuerpo. Debe
   ir ANTES de los addEventListener de abajo: esos capturan la referencia
   en el momento de enlazar. */
let _focoPrevio = null;
/* La ficha se oculta con transform, no con display:none, así que estando "cerrada"
   su botón de cierre y todos sus enlaces seguían siendo alcanzables con Tab fuera de
   pantalla. inert los retira del orden de tabulación Y del árbol de accesibilidad,
   sin romper la transición CSS. Aplicado en espejo sobre .wrap, aísla el fondo del
   lector de pantalla mientras el diálogo está abierto — que es lo que aria-modal
   promete y por sí solo no consigue en modo de exploración. */
const _drEl   = document.getElementById('dr');
const _wrapEl = document.querySelector('.wrap');
if(_drEl && !_drEl.classList.contains('open')) _drEl.setAttribute('inert','');
const _openDrawerOrig = openDrawer, _closeDrawerOrig = closeDrawer;
openDrawer = function(){
  _focoPrevio = document.activeElement;
  if(_drEl) _drEl.removeAttribute('inert');
  const r = _openDrawerOrig.apply(this, arguments);
  try{ document.getElementById('dr').setAttribute('aria-modal','true'); }catch(_){}
  if(_wrapEl) _wrapEl.setAttribute('inert','');
  setTimeout(()=>{ const b = document.getElementById('drClose'); if(b) b.focus(); }, 80);
  return r;
};
closeDrawer = function(){
  const r = _closeDrawerOrig.apply(this, arguments);
  try{ document.getElementById('dr').removeAttribute('aria-modal'); }catch(_){}
  /* El orden importa: primero se devuelve la interactividad al fondo, luego se
     retira del drawer, y solo entonces se puede enfocar el elemento de origen. */
  if(_wrapEl) _wrapEl.removeAttribute('inert');
  if(_drEl) _drEl.setAttribute('inert','');
  if(_focoPrevio && document.contains(_focoPrevio)){ try{ _focoPrevio.focus(); }catch(_){} }
  _focoPrevio = null;
  return r;
};
/* Red de seguridad: las fichas de ARCAC, Zona Patrimonio y embarcaderos abren el
   cajón con dr.classList.add('open') sin pasar por openDrawer, así que el inert
   puesto al cerrar se quedaba y el cajón completo dejaba de recibir toques
   (sin scroll en celular: el que recibía el gesto era el fondo #bd). Se observa la
   clase `open` y se aplica el mismo contrato para cualquier abridor. */
if(_drEl && window.MutationObserver){
  new MutationObserver(()=>{
    const abierto = _drEl.classList.contains('open');
    if(abierto && _drEl.hasAttribute('inert')){
      if(!_focoPrevio) _focoPrevio = document.activeElement;
      _drEl.removeAttribute('inert');
      _drEl.setAttribute('aria-modal','true');
      if(_wrapEl) _wrapEl.setAttribute('inert','');
      setTimeout(()=>{ const b = document.getElementById('drClose'); if(b && _drEl.classList.contains('open')) b.focus(); }, 80);
    }else if(!abierto && !_drEl.hasAttribute('inert')){
      _drEl.removeAttribute('aria-modal');
      if(_wrapEl) _wrapEl.removeAttribute('inert');
      _drEl.setAttribute('inert','');
    }
  }).observe(_drEl, {attributes:true, attributeFilter:['class']});
}
/* El tabulador no debe salirse de la ficha mientras esta abierta */
document.addEventListener('keydown', e=>{
  if(e.key !== 'Tab') return;
  const dr = document.getElementById('dr');
  if(!dr || !dr.classList.contains('open')) return;
  const f = [...dr.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')]
            .filter(el=>el.offsetParent !== null);
  if(!f.length) return;
  const pri = f[0], ult = f[f.length-1];
  if(e.shiftKey && document.activeElement === pri){ e.preventDefault(); ult.focus(); }
  else if(!e.shiftKey && document.activeElement === ult){ e.preventDefault(); pri.focus(); }
});

document.getElementById('tb').addEventListener('click',e=>{
  const trA = e.target.closest('tr[data-no]');
  if(trA){ openARCACFicha(+trA.dataset.no); return; }
  const tr=e.target.closest('tr[data-i]'); if(!tr) return;
  openDrawer(DATA[+tr.dataset.i]);
  zoomGlobalToArea(DATA[+tr.dataset.i]);
});
document.getElementById('drClose').addEventListener('click',closeDrawer);
bd.addEventListener('click',closeDrawer);
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });

document.getElementById('metaCount').textContent = fmtInt(DATA.length);

/* Fecha de consulta del inventario en el pie institucional. Es un dato verificable
   —cuándo leyó este navegador el Sheet—, no una fecha de corte declarada: esa debe
   fijarla el área responsable en el propio inventario. */
(function(){
  const el = document.getElementById('footerCorte');
  if(!el) return;
  try{
    el.textContent = new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'});
  }catch(_){ el.textContent = new Date().toISOString().slice(0,10); }
})();

/* =====================================================================
   ASISTENTE · Motor de consultas semánticas en lenguaje natural
   ===================================================================== */

/* ═══ VISTAS COMPARTIBLES ═══════════════════════════════════════════

   · Vista guardable. El estado del tablero —destino, subfiltro, orden,
     búsqueda y los siete filtros— vivía solo en memoria: quien armaba una
     consulta útil no podía volver a ella ni mandársela a nadie. Se serializa
     al fragmento de la URL, no a `localStorage`, porque una vista sirve
     justamente para compartirse y el almacenamiento del navegador no sale del
     equipo. Convive con `#area=`: son dos prefijos distintos del mismo
     fragmento y nunca se pisan. Sin atajos de teclado por decisión del proyecto. */
const VISTA_CAMPOS = ['dest','tab','sortKey','sortDir','q','fJur','fCat','fAlc','fPM','fTipo','fSC','fDG'];

function vistaAURL(){
  const qs = new URLSearchParams();
  VISTA_CAMPOS.forEach(k=>{
    const v = state[k];
    if(v === '' || v == null) return;
    if(k === 'sortKey' && v === 'nombre') return;      /* valores por omisión */
    if(k === 'sortDir' && Number(v) === 1) return;
    if(k === 'dest' && v === 'INVENTARIO') return;
    if(k === 'tab'  && v === 'ALL') return;
    qs.set(k, String(v));
  });
  const base = location.origin + location.pathname + location.search;
  return qs.toString() ? base + '#v?' + qs.toString() : base;
}

function aplicarVistaDeURL(){
  const h = location.hash || '';
  if(!h.startsWith('#v?')) return false;
  const qs = new URLSearchParams(h.slice(3));
  let algo = false;
  VISTA_CAMPOS.forEach(k=>{
    if(!qs.has(k)) return;
    const v = qs.get(k);
    state[k] = (k === 'sortDir') ? (Number(v) === -1 ? -1 : 1) : v;
    algo = true;
  });
  if(!algo) return false;
  /* Los campos del formulario tienen que reflejar el estado o el usuario ve
     una tabla filtrada con los filtros en blanco. */
  const espejo = { q:'q', fJur:'fJur', fCat:'fCat', fAlc:'fAlc', fPM:'fPM',
                   fTipo:'fTipo', fSC:'fSC', fDG:'fDG' };
  Object.keys(espejo).forEach(k=>{
    const el = document.getElementById(espejo[k]);
    if(el) el.value = state[k] || '';
  });
  return true;
}

/* Expuesta a proposito: permite armar la liga desde la consola y es el
   enganche de las pruebas automatizadas. */
window.vistaAURL = vistaAURL;
function conectarVistaCompartible(){
  const b = document.getElementById('btnVista');
  if(!b) return;
  b.addEventListener('click', async ()=>{
    const url = vistaAURL();
    try{
      await navigator.clipboard.writeText(url);
      siaToast('Liga copiada. Reproduce esta vista tal como la ves.');
    }catch(_){
      /* Sin permiso de portapapeles —o sin HTTPS— se deja en la barra de
         direcciones para que se copie a mano. */
      history.replaceState(null, '', url);
      siaToast('Liga puesta en la barra de direcciones: cópiala desde ahí.');
    }
  });
}

/* Campo primero: en celular el uso dominante es ubicarse, no consultar tablas.
   En escritorio el uso dominante es lo contrario, y la entrada es el inventario. */
try{ if(window.matchMedia('(max-width:760px)').matches) state.dest = 'UBICAR'; }catch(_){}
/* La vista de la URL se aplica ANTES del primer render: aplicarla después
   obligaría a pintar dos veces y se vería el salto. populateFilters() debe
   haber corrido ya para que los desplegables tengan sus opciones. */
buildTabs(); populateFilters();
try{ if(aplicarVistaDeURL()) buildTabs(); }catch(_){}
renderDashboard(); render();
initUbicarBar(); conectarVistaCompartible();
/* Integridad del inventario: la comprobación contra el respaldo es asíncrona
   y no debe retrasar el primer pintado. */
verificarInventario('arranque').catch(()=>{});
/* Destino decidido y pintado: se retira la pantalla de arranque. */
try{ document.documentElement.classList.remove('arranque-campo'); }catch(_){}

/* === Deep linking: abrir ficha si la URL tiene #area=slug-del-area === */
function openAreaFromHash(){
  const m = location.hash.match(/^#area=([\w-]+)/);
  if(!m) return;
  const slug = m[1];
  const area = DATA.find(d => slugify(d.nombre) === slug);
  if(area){
    openDrawer(area);
  } else {
    console.warn(`[Deep link] No se encontró área con slug: ${slug}`);
  }
}
// Resolver al cargar la página
openAreaFromHash();
// Resolver al usar back/forward del navegador
window.addEventListener('hashchange', () => {
  if(location.hash.startsWith('#area=')) openAreaFromHash();
  else if(dr.classList.contains('open')) closeDrawer();
});

/* ============================================================
 * E3 · SERVICE WORKER — operación offline
 * Cachea recursos críticos en la primera carga; tras eso, la app
 * funciona sin conexión. Útil para presentaciones en zonas con
 * WiFi débil o salones sin conexión confiable.
 * ============================================================ */
if('serviceWorker' in navigator){
  // Solo registrar si NO estamos en file:// (dev local sin servidor)
  if(location.protocol === 'http:' || location.protocol === 'https:'){
    /* Este bloque corre al final del arranque, que es asíncrono (espera el
       CSV del inventario): para entonces `load` ya disparó y un listener
       nuevo no se ejecuta nunca. Auditoría 12-sep-2026: en producción el SW
       no se registraba y no había caché offline. Si el documento ya está
       completo se registra de inmediato. */
    const _registrarSW = () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => {
          // Detectar actualizaciones del SW
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if(newSW){
              newSW.addEventListener('statechange', () => {
                if(newSW.state === 'installed' && navigator.serviceWorker.controller){
                  showOfflineNotice('Nueva versión disponible. Recarga la página para actualizar.', 'update');
                }
              });
            }
          });
        })
        .catch(err => console.warn('[SIA] No se pudo registrar el Service Worker:', err));

      /* El SW usa skipWaiting + clients.claim: toma control de esta pestaña de
         inmediato. Sin recargar, el JS viejo queda hablando con caché nueva —el
         escenario de campo con red débil que justifica el SW en primer lugar. Se
         recarga una sola vez; el guard evita el bucle si el navegador reemite. */
      let _swRecargando = false;
      const _habiaControlador = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // En la PRIMERA visita el controlador pasa de null a activo por clients.claim():
        // eso no es una actualización y no debe recargar nada.
        if(!_habiaControlador || _swRecargando) return;
        _swRecargando = true;
        setTimeout(() => location.reload(), 600);
      });
    };
    if(document.readyState === 'complete') _registrarSW();
    else window.addEventListener('load', _registrarSW);
  }
}

// Indicador discreto de estado de conexión
function showOfflineNotice(msg, type='offline'){
  let notice = document.getElementById('offlineNotice');
  if(!notice){
    notice = document.createElement('div');
    notice.id = 'offlineNotice';
    notice.className = 'offline-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    document.body.appendChild(notice);
  }
  notice.textContent = msg;
  notice.dataset.type = type;
  notice.classList.add('visible');
  if(type === 'online'){
    setTimeout(() => notice.classList.remove('visible'), 3500);
  }
}



/* ═══ CIERRE POR GESTO DEL CAJON LATERAL (escritorio) ════════════════
   Arrastrar el tirador hacia la derecha cierra la ficha; soltarlo antes
   del umbral la devuelve a su sitio. Un clic sin desplazamiento tambien
   cierra, asi el tirador es util con teclado y con raton. */
(function(){
  const tir = document.getElementById('drTirador');
  const caj = document.getElementById('dr');
  if(!tir || !caj) return;
  const UMBRAL = 110;      /* px arrastrados a partir de los cuales cierra */
  const VELOCIDAD = 0.55;  /* px/ms de un tiron corto que tambien cierra   */

  tir.addEventListener('pointerdown', e=>{
    if(_drMovil() || !caj.classList.contains('open')) return;
    const x0 = e.clientX, t0 = performance.now();
    let dx = 0, movio = false;
    caj.classList.add('arrastrando-x');
    try{ tir.setPointerCapture(e.pointerId); }catch(_){}

    const mover = ev => {
      dx = Math.max(0, ev.clientX - x0);
      if(dx > 3) movio = true;
      caj.style.transform = 'translateX(' + dx + 'px)';
    };
    const soltar = ev => {
      tir.removeEventListener('pointermove', mover);
      tir.removeEventListener('pointerup', soltar);
      tir.removeEventListener('pointercancel', soltar);
      try{ tir.releasePointerCapture(ev.pointerId); }catch(_){}
      const v = dx / Math.max(1, performance.now() - t0);
      caj.classList.remove('arrastrando-x');
      caj.style.removeProperty('transform');
      /* Sin desplazamiento se comporta como boton; con el, decide el umbral
         o la velocidad del tiron. */
      if(!movio || dx > UMBRAL || v > VELOCIDAD) closeDrawer();
    };
    tir.addEventListener('pointermove', mover);
    tir.addEventListener('pointerup', soltar);
    tir.addEventListener('pointercancel', soltar);
    e.preventDefault();
  });

  /* Enter y Espacio llegan como click sintetico sin pointerdown previo. */
  tir.addEventListener('click', e=>{
    if(e.detail === 0) closeDrawer();
  });
})();

/* ═══ PANTALLA DE AYUDA ═══════════════════════════════════════════════
   Dialogo estatico. No lee DATA ni el Sheet: si el inventario falla, la
   guia sigue disponible. Se registra en fase de captura para que Escape
   cierre la guia sin llegar al cierre de la ficha. */
(function(){
  const bd  = document.getElementById('ayudaBd');
  const dlg = document.getElementById('ayudaDlg');
  if(!bd || !dlg) return;
  const btnCerrar = document.getElementById('ayudaCerrar');
  let devolverFoco = null;
  const abierta = () => dlg.classList.contains('open');

  function abrirAyuda(origen){
    if(abierta()) return;
    devolverFoco = origen || document.activeElement;
    bd.hidden = false; dlg.hidden = false;
    /* Dos cuadros: el navegador necesita ver el elemento visible antes de
       animar la opacidad, o el dialogo aparece de golpe. */
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      bd.classList.add('open'); dlg.classList.add('open');
    }));
    document.documentElement.style.overflow = 'hidden';
    try{ dlg.focus({preventScroll:true}); }catch(_){ dlg.focus(); }
  }

  function cerrarAyuda(){
    if(!abierta()) return;
    bd.classList.remove('open'); dlg.classList.remove('open');
    document.documentElement.style.overflow = '';
    setTimeout(()=>{ if(!abierta()){ bd.hidden = true; dlg.hidden = true; } }, 220);
    if(devolverFoco && document.contains(devolverFoco)){
      try{ devolverFoco.focus({preventScroll:true}); }catch(_){}
    }
    devolverFoco = null;
    dlg.querySelector('.ayuda-cuerpo').scrollTop = 0;
  }

  ['ayudaAbrir','ayudaAbrirPie'].forEach(id=>{
    const b = document.getElementById(id);
    if(b) b.addEventListener('click', ()=> abrirAyuda(b));
  });
  if(btnCerrar) btnCerrar.addEventListener('click', cerrarAyuda);
  bd.addEventListener('click', cerrarAyuda);

  document.addEventListener('keydown', e=>{
    if(!abierta()) return;
    if(e.key === 'Escape'){ e.stopPropagation(); e.preventDefault(); cerrarAyuda(); return; }
    if(e.key !== 'Tab') return;
    /* Retencion del foco: mientras el dialogo esta abierto, el tabulador no
       debe salirse a los controles del tablero que hay debajo. */
    const foco = dlg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const vis = Array.prototype.filter.call(foco, el => el.offsetParent !== null || el === dlg);
    if(!vis.length) return;
    const primero = vis[0], ultimo = vis[vis.length-1];
    if(e.shiftKey && (document.activeElement === primero || document.activeElement === dlg)){
      e.preventDefault(); ultimo.focus();
    } else if(!e.shiftKey && document.activeElement === ultimo){
      e.preventDefault(); primero.focus();
    }
  }, true);

  window.abrirAyuda = abrirAyuda;
})();

window.addEventListener('online', () => showOfflineNotice('Conexión restablecida ✓', 'online'));
window.addEventListener('offline', () => showOfflineNotice('Sin conexión · operando con datos en caché', 'offline'));

} catch(err){
  console.error('[Dashboard] Error al inicializar:', err);
  try{ document.documentElement.classList.remove('arranque-campo'); }catch(_){}
  document.body.insertAdjacentHTML('afterbegin',
    /* Mensaje de cara al ciudadano: sin lenguaje de desarrollador y sin revelar la
       infraestructura de origen. El detalle técnico queda en la consola, no en el DOM. */
    '<div style="background:var(--alert-bg,#fdf0f3);border:2px solid var(--guinda,#9d2148);'+
    'padding:16px 24px;margin:0;font-family:Roboto,sans-serif;color:var(--ink,#2a2a2a)">'+
    '<b>No se pudo cargar el inventario en este momento</b><br>'+
    'Intenta recargar la página en unos minutos.'+
    '</div>');
}
})();
