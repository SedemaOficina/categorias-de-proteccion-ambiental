import re, sys, os
VER = re.search(r"CACHE_VERSION = '([^']+)'", open('/home/claude/work/sw.js',encoding='utf-8').read()).group(1)
s = open('/home/claude/work/index.html',encoding='utf-8').read()
marca = '''<style>
  /* Distintivo de la versión en revisión · se retira al promoverla a index.html */
  .cinta-borrador{position:fixed;left:0;right:0;bottom:0;z-index:3000;background:#2a2a2a;color:#fffdf0;
    font-family:'Roboto',sans-serif;font-size:12.5px;letter-spacing:.02em;text-align:center;padding:7px 14px;
    box-shadow:0 -2px 10px rgba(42,42,42,.25)}
  .cinta-borrador b{color:#f5aeb8}
  .cinta-borrador a{color:#fffdf0;text-decoration:underline}
  .cinta-borrador .ver{font-family:'Roboto Mono',monospace;font-size:11px;opacity:.72;margin-left:10px}
  body{padding-bottom:34px}
  @media (max-width:760px){ .cinta-borrador{bottom:64px} body{padding-bottom:106px} }
</style>
<div class="cinta-borrador" role="note"><b>Versión en revisión · rediseño v38.</b>
  La página oficial es <a href="./">la portada del sitio</a>.
  <span class="ver">__VER__</span></div>
'''.replace('__VER__', VER)
i = s.index('</body>')
open('/home/claude/entrega/rediseno-v38.html','w',encoding='utf-8').write(s[:i]+marca+s[i:])
print('rediseno-v38.html ·', VER, '·', round(os.path.getsize('/home/claude/entrega/rediseno-v38.html')/1024),'KB')
