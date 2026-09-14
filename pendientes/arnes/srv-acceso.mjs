import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ, R } from './_comun.mjs';
const root=RAIZ; const FLAG=R('.expirada');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.geojson':'application/json','.png':'image/png','.csv':'text/csv','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'); const exp=fs.existsSync(FLAG);
  if(exp && (u.searchParams.has('sesion')||u.searchParams.has('entrar')||/pgoedf\.geojson/.test(u.pathname))){
    res.writeHead(302,{Location:'https://sedema-sia.cloudflareaccess.com/cdn-cgi/access/login/localhost?redirect_url=/'}); return res.end();
  }
  let p=path.join(root, decodeURIComponent(u.pathname)); if(u.pathname==='/') p=path.join(root,'index.html');
  fs.readFile(p,(e,d)=>{ if(e){res.writeHead(404);return res.end('404');} res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'}); res.end(d); });
}).listen(8898);
