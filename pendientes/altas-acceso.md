# Altas y bajas de acceso · SIA (sia.contactoverde.com)

Vigente desde el 13 de septiembre de 2026. Herramienta rápida: artefacto «Altas de acceso · SIA» en Claude (pegas correos → te da la lista exacta para cada sitio, el aviso a la persona y la instrucción para delegárselo a Claude).

## Dónde se registra cada persona (dos lugares, no tres)
| Lugar | Qué controla | Sin este paso |
|---|---|---|
| **Cloudflare One → Access → Applications → sia → Policies → «Personal autorizado»** | Quién entra, por cualquier método (Google o PIN por correo). Es la única puerta. | No entra. |
| **Google Cloud → Google Auth Platform → Público → Usuarios de prueba** | Que el botón «Google» funcione para esa cuenta (la app OAuth está en modo Prueba, tope 100). | Google bloquea el botón «Google»; el PIN por correo sigue funcionando. |

Claude no es un lugar de registro: solo ejecuta los dos anteriores en tu Chrome si se lo pides.

## Alta
1. Cloudflare: Applications → **sia** → **Policies** → **Personal autorizado** → **Configure** → *Include · Emails* → un renglón por correo (**Add include** para agregar renglón) → **Save policy**. Surte efecto de inmediato.
2. Google (solo cuentas de Google): Público → **Usuarios de prueba** → **+ Agregar usuarios** → pega la lista (una por línea) → **Guardar**.
3. Avisar a la persona (texto en el artefacto): liga, dos formas de entrar, sesión de 1 mes.

## Baja
1. Cloudflare: en la misma política, eliminar el renglón del correo → **Save policy**.
2. Cortar la sesión vigente (dura hasta 1 mes): Applications → **sia** → menú ··· → **Revoke existing tokens**.
3. Google: opcional quitarla de Usuarios de prueba.

## Delegarlo a Claude
Pegar en el chat (el artefacto lo redacta):
> Da de alta en el acceso del SIA a: correo1, correo2. Hazlo desde mi Chrome: agrégalos en Cloudflare One → Access → Applications → sia → política «Personal autorizado», y en Google Cloud → Google Auth Platform → Público → Usuarios de prueba. Pídeme confirmación antes de guardar cada cambio y al terminar dame el aviso para enviarles.

Requisitos: Chrome abierto con sesión iniciada en Cloudflare y en Google Cloud; Claude pide confirmación antes de cada «Save».

## Referencia
- Sesión: 1 mes desde el último ingreso; al vencer, el tablero detecta la redirección y manda al login solo (v64).
- Registros de quién entró: Cloudflare One → Insights & Logs → Access (24 h en el plan gratuito).
- Correos que no son cuenta de Google: entran solo con PIN; no se agregan en Google.
- Si algún día se publica la app OAuth de Google (Público → Publicar app), el paso de Google desaparece y queda solo Cloudflare.
