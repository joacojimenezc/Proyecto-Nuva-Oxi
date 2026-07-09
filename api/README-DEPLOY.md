# API "Base de datos" — despliegue (Vercel + GitHub)

La web NO depende de los Excel locales: las bases, los documentos y `7 web/data.json`
viven en **este repo GitHub** (`joacojimenezc/Proyecto-Nuva-Oxi`, rama `main`).
La función serverless [`api/bd.js`](bd.js) los lee/escribe con la API de GitHub.

## Qué necesita para funcionar (2 pasos, una sola vez)

### 1. Token de GitHub (fine-grained) → variable de entorno en Vercel

1. En GitHub (cuenta **joacojimenezc**): *Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token*.
2. Configuración del token:
   - **Repository access**: *Only select repositories* → `Proyecto-Nuva-Oxi`.
   - **Permissions → Repository permissions → Contents: Read and write**.
     (Nada más; el resto en "No access".)
   - Expiración: la máxima que permita (o custom 1 año; anotar renovación).
3. En Vercel (proyecto `proyecto-nuva-oxi`, equipo WP3): *Settings →
   Environment Variables* → agregar:
   - `GITHUB_TOKEN` = el token recién creado (Production, Preview y Development).
   - (opcional) `BD_KEY` = clave propia; si no se define, usa la del código.
4. Redeploy para que tome la variable.

### 2. Reconectar el proyecto Vercel al repo nuevo

El proyecto Vercel quedó enlazado al repo viejo (eliminado). En
*Settings → Git* del proyecto: desconectar el repo antiguo y conectar
`joacojimenezc/Proyecto-Nuva-Oxi` (rama de producción: `main`).
Vercel pedirá autorizar su GitHub App sobre la cuenta `joacojimenezc`.

Con eso, cada push a `main` (incluido el auto-sync del watcher local y las
subidas hechas desde la propia web) publica sitio + API automáticamente.

## Probar

```
https://<dominio>/api/bd?action=ping&k=<KEY>
https://<dominio>/api/bd?action=data&k=<KEY>
```

Ambos deben responder `{"ok":true,...}`. Si responde
`GITHUB_TOKEN no configurado`, falta el paso 1.

## Cómo fluyen los datos

- **Web → repo**: pestaña "🗄️ Base de datos" (subir base / documento) →
  commit directo a `main` vía API → el watcher local lo baja con su
  `pull --rebase` → tu carpeta local queda igual al repo.
- **Carpeta local → web**: editas un Excel → el watcher lo commitea y pushea →
  la web lo lee fresco en la próxima carga (action=data consulta GitHub, sin caché).
- **Borrar documento** desde la web = eliminarlo del HEAD del repo; el
  historial git lo conserva (recuperable con `git checkout <sha> -- "ruta"`).

## Límites

- Subidas vía web: **máx ~3 MB por archivo** (límite del body de las funciones
  Vercel). Archivos más grandes: dejarlos en la carpeta local (el auto-sync
  los lleva al repo) — la web los lista y descarga igual.
- La KEY del API viaja en el frontend (público). Protege de curiosos, no de
  un atacante dirigido — mismo nivel que la clave de la portada. El token de
  GitHub, en cambio, NUNCA sale de Vercel.
