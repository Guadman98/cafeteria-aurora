# Cafetería Aurora

Sitio web de **Cafetería Aurora**, una cafetería familiar de barrio en Colombia: portada, favoritos de la casa, historia, carta completa y **reservas en línea con plano interactivo de mesas**, confirmación por correo, cancelación desde el correo y panel para el personal.

**Sitio publicado:** https://guadman98.github.io/cafeteria-aurora/

> ⚠️ **Versión de demostración.** Los precios, el horario, la dirección, el teléfono y los detalles de la historia son **datos de ejemplo**. La [Política de Tratamiento de Datos](privacidad.html) tiene campos marcados como *[por completar]* (razón social, NIT, ciudad, teléfono) y debe revisarla un abogado antes de usarse con el negocio real.

---

## Índice

1. [Cómo funciona](#cómo-funciona)
2. [Estructura del proyecto](#estructura-del-proyecto)
3. [Instalación desde cero](#instalación-desde-cero)
4. [Uso diario](#uso-diario)
5. [Dónde se cambia cada cosa](#dónde-se-cambia-cada-cosa)
6. [Seguridad y datos personales](#seguridad-y-datos-personales)
7. [Solución de problemas](#solución-de-problemas)
8. [Desarrollo local](#desarrollo-local)

---

## Cómo funciona

El sitio es HTML, CSS y JavaScript sin dependencias de compilación: se publica tal cual en **GitHub Pages**. Todo lo que necesita un servidor vive en **Supabase**.

```
Visitante ──► GitHub Pages (index.html, script.js…)
                 │
                 ├─ ¿Qué mesas están libres? ──► Supabase · mesas_ocupadas()          (sin datos personales)
                 │
                 └─ Reservar ──► Edge Function crear-reserva
                                    ├─ verifica el captcha ──► Cloudflare Turnstile
                                    └─ crear_reserva() en la base de datos
                                          │  (valida horario, capacidad, solapamientos y autorización de datos)
                                          ▼
                                   tabla reservas ──► disparador ──► Edge Function enviar-correos ──► Gmail
                                                                       ├─ confirmación al cliente (con enlace para cancelar)
                                                                       └─ aviso a la cafetería

Cliente ──► enlace del correo ──► cancelar.html ──► cancelar_reserva()
Personal ──► personal.html (inicio de sesión) ──► ve las reservas, marca llegadas, cancela, bloquea mesas
```

| Servicio | Para qué | Plan |
|---|---|---|
| GitHub Pages | Publicar el sitio | Gratis (repositorio público) |
| Supabase | Base de datos, inicio de sesión del personal y funciones del servidor | Gratis |
| Gmail | Enviar los correos (contraseña de aplicación) | Gratis, ~500 correos/día |
| Cloudflare Turnstile | Captcha anti-spam del formulario | Gratis |

**Reglas de las reservas** (configurables, ver [Dónde se cambia cada cosa](#dónde-se-cambia-cada-cosa)):

- Cada reserva ocupa la mesa **90 minutos**.
- Turnos cada 30 minutos; la última reserva es 1 hora antes del cierre.
- Mínimo **30 minutos** de anticipación y hasta **60 días** adelante.
- Máximo **3 reservas activas** por teléfono.
- Una mesa nunca puede tener dos reservas que se crucen en el tiempo (lo garantiza la propia base de datos).
- Zona horaria: **America/Bogota**.

---

## Estructura del proyecto

```
├── index.html              Página principal (portada, carta, reservas, horario)
├── styles.css              Estilos de todas las páginas
├── script.js               Carta, plano de mesas, horario y formulario de reserva
├── config.js               URL y claves PÚBLICAS de Supabase y Turnstile
├── cancelar.html / .js     Página a la que lleva el enlace "Cancelar mi reserva" del correo
├── personal.html / .js     Panel del personal (requiere inicio de sesión)
├── privacidad.html         Política de Tratamiento de Datos Personales (Ley 1581 de 2012)
├── assets/                 Fotos y logo ORIGINALES (no se usan directamente en la página)
│   └── web/                Copias optimizadas que sí usa la página
└── supabase/
    ├── schema.sql                        01 · Tablas, reglas y funciones base
    ├── 02-correos-y-cancelacion.sql      02 · Token de cancelación y control de envíos
    ├── 03-disparador-correos.sql         03 · Disparador que llama a enviar-correos (alternativa al webhook)
    ├── 04-privacidad-captcha-panel.sql   04 · Autorización de datos, captcha, panel y depuración
    └── functions/
        ├── crear-reserva/index.ts        Verifica el captcha y crea la reserva
        └── enviar-correos/index.ts       Envía los correos por Gmail
```

**Modo demostración:** si `config.js` no tiene URL ni clave de Supabase, la página funciona sola: simula la ocupación de las mesas y guarda las reservas solo en el navegador. Sirve para mostrar el diseño sin backend.

---

## Instalación desde cero

Sigue este orden en un proyecto nuevo de Supabase. Todo se hace desde el panel web de Supabase; no hace falta instalar nada.

### 1. Proyecto de Supabase

1. En [supabase.com](https://supabase.com) crea un proyecto (plan Free). Guarda la contraseña de la base de datos en un lugar seguro.
2. En **Project Settings → API Keys** copia la **Project URL** y la clave **publishable** (o *anon*) y ponlas en [`config.js`](config.js).

### 2. Base de datos

En **SQL Editor → New query**, ejecuta **en este orden**, uno por uno:

1. [`supabase/schema.sql`](supabase/schema.sql)
2. [`supabase/02-correos-y-cancelacion.sql`](supabase/02-correos-y-cancelacion.sql)
3. [`supabase/04-privacidad-captcha-panel.sql`](supabase/04-privacidad-captcha-panel.sql)
4. [`supabase/03-disparador-correos.sql`](supabase/03-disparador-correos.sql) — **solo** si no vas a usar un Database Webhook (ver paso 4).

### 3. Funciones del servidor (Edge Functions)

En **Edge Functions → Deploy a new function → Via Editor**, crea dos funciones pegando el código de cada archivo:

| Nombre | Código | Verify JWT |
|---|---|---|
| `crear-reserva` | [`supabase/functions/crear-reserva/index.ts`](supabase/functions/crear-reserva/index.ts) | **Desactivado** (es público; lo protege el captcha) |
| `enviar-correos` | [`supabase/functions/enviar-correos/index.ts`](supabase/functions/enviar-correos/index.ts) | Desactivado si usas el script 03 · Activado si usas un webhook con "service key" |

Luego, en **Edge Functions → Secrets**, agrega:

| Secreto | Valor |
|---|---|
| `GMAIL_USER` | Cuenta de Gmail que envía los correos |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación de esa cuenta (16 caracteres, sin espacios) |
| `AVISOS_EMAIL` | Correo que recibe los avisos de reservas nuevas y cancelaciones |
| `SITIO_URL` | `https://guadman98.github.io/cafeteria-aurora` (sin barra final) |
| `TURNSTILE_SECRET_KEY` | *Secret Key* del widget de Turnstile |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase automáticamente.

> **Contraseña de aplicación de Gmail:** activa la verificación en dos pasos en la cuenta de Google y créala en [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). No es la contraseña normal de la cuenta.

### 4. Conectar las reservas con los correos

Elige **una** de estas dos opciones:

- **A · Database Webhook:** en **Integrations → Database Webhooks** (actívalos si te lo pide), crea uno para la tabla `reservas`, eventos *Insert* y *Update*, tipo *Supabase Edge Functions*, función `enviar-correos`, timeout `10000`, con **"Add auth header with service key"** activado.
- **B · Script SQL:** desactiva *Verify JWT* en `enviar-correos` y ejecuta `03-disparador-correos.sql`. Solo llama a la función cuando una reserva se crea o cambia de estado.

### 5. Captcha (Cloudflare Turnstile)

1. En [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile → Add widget**, modo *Managed*, dominios `guadman98.github.io` y `localhost`.
2. La **Site Key** (pública) va en `config.js` → `turnstileSiteKey`.
3. La **Secret Key** va en Supabase como `TURNSTILE_SECRET_KEY`. Nunca en el código.

### 6. Publicar

En GitHub: **Settings → Pages → Deploy from a branch → `main` / `(root)`**. Cada `git push` se publica en uno o dos minutos.

### 7. Cuentas del personal y seguridad

Ver [Dar acceso a alguien del personal](#dar-acceso-a-alguien-del-personal). Después, en la configuración de **Authentication**, desactiva **"Allow new users to sign up"**.

---

## Uso diario

### Panel del personal

**Dirección:** `https://guadman98.github.io/cafeteria-aurora/personal.html` (no está enlazado desde el sitio público).

- Muestra las reservas del día elegido con hora, mesa, personas, teléfono (se puede tocar para llamar), correo y notas. Se actualiza solo cada minuto.
- **Llegó / No llegó:** marca la asistencia. **Deshacer** devuelve la reserva a *confirmada*.
- **Cancelar:** libera la mesa y le envía un correo al cliente avisándole.
- **Mesas en la reserva en línea:** apagar una mesa la guarda para quienes llegan sin reserva. No afecta las reservas que ya tiene.

### Dar acceso a alguien del personal

1. En Supabase: **Authentication → Users → Add user → Create new user**, con correo, contraseña y *Auto Confirm User*.
2. En **SQL Editor**, registrarla como personal (cambia el nombre y el correo):

   ```sql
   insert into personal (user_id, nombre)
   select id, 'Nombre' from auth.users where email = 'correo@ejemplo.com';
   ```

**Quitar el acceso:** borra a la persona en **Authentication → Users** (su fila en `personal` se borra sola).

### Lo que recibe cada quien por correo

| Momento | Cliente | Cafetería (`AVISOS_EMAIL`) |
|---|---|---|
| Reserva nueva | Confirmación con código y botón "Cancelar mi reserva" | Aviso con todos los datos (responder el correo le escribe al cliente) |
| El cliente cancela desde el enlace | Confirmación de cancelación | Aviso de cancelación |
| El personal cancela desde el panel | Aviso de que la reserva quedó cancelada | — |

Cada correo se envía **una sola vez** por reserva, aunque la función se llame varias veces.

### Ver todas las reservas

En Supabase, **Table Editor → reservas**. Desde ahí también se pueden exportar a CSV como respaldo (recomendado de vez en cuando: el plan gratuito no guarda copias recuperables).

---

## Dónde se cambia cada cosa

Algunos datos están en más de un lugar y **deben coincidir**.

| Qué | Dónde |
|---|---|
| **Horario** | 1) `script.js` → `HOURS` (turnos del formulario) · 2) `index.html` → tabla `#hoursTable` (lo que se ve) · 3) Supabase → tabla `horarios` (lo que valida el servidor; `ultima_reserva` = última hora reservable) |
| **Mesas** | 1) `script.js` → `TABLES` (posición en el plano, capacidad y zona) · 2) Supabase → tabla `mesas` (capacidad que valida el servidor). El dibujo del salón está en `drawRoom()` de `script.js` |
| **Carta** | `script.js` → `COFFEES`, `SALADOS`, `POSTRES`, `OTRAS`. Precios en COP, sin puntos (`4500`); se muestran como `$4.500`. Las capas de los vasos de café van en `layers` |
| **Favoritos de la casa** | `index.html` → sección `.fav-list` (fotos en `assets/web/favorito-*.jpg`) |
| **Duración de la reserva, anticipación, días máximos, límite por teléfono, zona horaria** | Supabase → tabla `ajustes` (una sola fila) |
| **Teléfono y dirección** | `index.html` (portada y "Dónde"), `privacidad.html`, `cancelar.js` → `TELEFONO`, mensaje de error en `script.js`, y `enviar-correos/index.ts` → `DIRECCION` y `TELEFONO` (requiere volver a desplegar la función) |
| **Política de datos** | `privacidad.html`. Si cambia de forma sustancial, sube también la versión en `script.js` → `POLITICA_VERSION` (queda guardada en cada reserva como prueba) |
| **Textos de los correos** | `supabase/functions/enviar-correos/index.ts` (después de editar, pegar el código nuevo y pulsar **Deploy**) |

**Caché del navegador:** las páginas cargan `styles.css?v=10`, `script.js?v=7`, etc. Al cambiar uno de esos archivos, sube su número en los `.html` que lo usan; si no, algunos visitantes seguirán viendo la versión vieja.

**Fotos nuevas:** guarda el original en `assets/` y una copia optimizada en `assets/web/` (unos 700–2000 px de ancho, JPG de calidad ~80).

---

## Seguridad y datos personales

- **`config.js` solo tiene datos públicos** (URL, clave *publishable* de Supabase y *Site Key* de Turnstile). Están pensados para ir en el navegador.
- **Nunca** subas al repositorio la clave `service_role`/*secret* de Supabase, la contraseña de la base de datos, la contraseña de aplicación de Gmail ni la *Secret Key* de Turnstile. Esos van solo en **Edge Functions → Secrets**.
- Con la clave pública **no se puede leer la tabla de reservas**. El sitio solo puede consultar qué mesas están ocupadas (sin nombres ni teléfonos) y crear reservas a través de `crear-reserva`.
- El personal solo puede **leer** reservas, **cambiar su estado** y **activar o desactivar mesas**. El token de cancelación no se le expone.
- **Ley 1581 de 2012:** el formulario pide autorización expresa (casilla sin marcar) y cada reserva guarda la fecha y la versión de la política aceptada (`autorizacion_datos_en`, `politica_version`).
- **Conservación de 12 meses:** la función `depurar_reservas_antiguas()` borra las reservas de más de 12 meses. Para que corra sola cada mes, activa **Integrations → Cron** y ejecuta:

  ```sql
  select cron.schedule('depurar-reservas', '0 4 1 * *', 'select public.depurar_reservas_antiguas()');
  ```

---

## Solución de problemas

| Síntoma | Qué revisar |
|---|---|
| El plano dice "No pudimos consultar las mesas libres" | ¿El proyecto de Supabase está **pausado**? Los proyectos gratuitos se pausan tras ~1 semana sin actividad; se reactivan desde el panel. Revisa también la URL y la clave en `config.js` |
| "No pudimos comprobar que no eres un robot" | El dominio no está en el widget de Turnstile, o la *Site Key* de `config.js` no corresponde a la *Secret Key* de Supabase |
| La reserva se crea pero no llegan correos | **Edge Functions → enviar-correos → Logs**. Lo más común: `GMAIL_APP_PASSWORD` mal copiada o la verificación en dos pasos desactivada. Si usas el script 03, ejecuta `select status_code, content, error_msg, created from net._http_response order by created desc limit 5;` |
| Los correos llegan sin logo o el enlace de cancelar falla | `SITIO_URL` mal escrito o GitHub Pages desactivado |
| El panel dice "Sin acceso al panel" | La cuenta existe pero no está en la tabla `personal` (ver [Dar acceso](#dar-acceso-a-alguien-del-personal)) |
| Un cambio no se ve en el sitio | Espera 1–2 minutos tras el `push`, recarga con **Ctrl+F5** y revisa que subiste el número `?v=` |
| Error `CAPACIDAD`, `FUERA_DE_HORARIO`, etc. | Son validaciones del servidor: la página ya muestra un mensaje claro. Si aparecen sin motivo, revisa que `HOURS`/`TABLES` de `script.js` coincidan con las tablas `horarios`/`mesas` |

**Códigos de error del servidor** (los traduce `script.js` → `SERVER_ERRORS`):

| Código | Significado |
|---|---|
| `MESA_OCUPADA` | Otra reserva se cruza con ese horario en esa mesa |
| `MESA_NO_DISPONIBLE` | La mesa está desactivada para reservas en línea |
| `CAPACIDAD` | El grupo no cabe en la mesa |
| `FECHA_FUERA_DE_RANGO` | Muy pronto (menos de 30 min) o demasiado adelante (más de 60 días) |
| `FUERA_DE_HORARIO` | Fuera del horario de reservas o no es un turno de :00/:30 |
| `DATOS_INVALIDOS` | Nombre, teléfono o correo con formato incorrecto |
| `LIMITE_RESERVAS` | Ese teléfono ya tiene 3 reservas activas |
| `SIN_AUTORIZACION` | No se aceptó la política de tratamiento de datos |
| `CAPTCHA` | El captcha falta o no es válido |

---

## Desarrollo local

Desde la carpeta del proyecto:

```bash
python -m http.server 5510
```

y abre http://localhost:5510. Con `config.js` configurado, la página local usa la misma base de datos real que el sitio publicado (la función `crear-reserva` acepta peticiones desde `localhost:5510`). Para probar sin tocar datos reales, deja vacíos `supabaseUrl` y `supabaseKey` y la página entrará en modo demostración.

Para publicar:

```bash
git add . && git commit -m "Describe el cambio" && git push
```

Las carpetas `.claude/` y `.agents/` y el archivo `skills-lock.json` están en `.gitignore` y no se suben.
