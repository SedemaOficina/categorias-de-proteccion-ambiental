/* Doble de pruebas de Leaflet: solo permite que el tablero arranque sin red. */
(function(){
  const real = (tag)=>document.createElement(tag);
  const mk = () => new Proxy(function(){}, {
    get(t,k){
      if(k==='then') return undefined;
      if(k===Symbol.toPrimitive) return ()=>0;
      if(k==='toString') return ()=>'[stub]';
      return mk();
    },
    apply(){ return mk(); },
    construct(){ return mk(); }
  });
  const L = mk();
  window.L = new Proxy(L, {
    get(t,k){
      if(k==='DomUtil') return { create:(tag,cls,parent)=>{ const e=real(tag||'div'); if(cls) e.className=cls; if(parent&&parent.appendChild) parent.appendChild(e); return e; },
                                 addClass(){}, removeClass(){}, get(){return null;} };
      if(k==='DomEvent') return new Proxy({},{get:()=>()=>{}});
      return mk();
    }
  });
})();
