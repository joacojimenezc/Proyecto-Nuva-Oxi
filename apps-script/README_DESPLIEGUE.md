# Desplegar el backend de evaluaciones (1 sola vez, ~3 min)

La web ya está lista para enviar y mostrar evaluaciones en vivo. Solo falta
publicar este script como **Web App** y pegar su URL en la web.

## Paso 1 — Crear el script
1. Abre la Sheet **"WP3 Cross-Assessment — Base de Datos de Evaluaciones"**
   (carpeta Drive *Plataforma WEB WP3*). 
   Sheet ID: `1WCnjvygXah8H2eutZYdvVcZJ7IKcsdi4UknXz0ZNxBU`
2. Menú **Extensiones → Apps Script**.
3. Borra el contenido por defecto y **pega íntegro** el archivo [`Code.gs`](Code.gs).
   (El `SHEET_ID` ya viene puesto, no hay que tocar nada.)
4. Guarda (💾).

## Paso 2 — Desplegar como Web App
1. Botón **Implementar → Nueva implementación**.
2. Tipo (engranaje ⚙️) → **Aplicación web**.
3. Configura:
   - **Ejecutar como:** *Yo* (tu cuenta IDMA).
   - **Quién tiene acceso:** **Cualquier persona** *(importante: así la web
     puede leer/escribir sin que el visitante inicie sesión).*
4. **Implementar** → autoriza los permisos cuando lo pida (es tu propia Sheet).
5. Copia la **URL de la aplicación web** (termina en `/exec`).

## Paso 3 — Conectar la web
En `index.html`, busca `EVAL_API` (cerca del inicio del bloque de evaluación)
y pega la URL entre las comillas:

```js
var EVAL_API = 'https://script.google.com/macros/s/AKfy...../exec';
```

Haz `git commit` (el hook re-sincroniza a Drive y Vercel redepliega).
Desde ese momento:
- **Enviar evaluación** → escribe una fila en la Sheet.
- **Resultados** → lee las filas de la Sheet y las muestra.
- **Abrir base de datos (Excel/Sheet)** → abre la Sheet en Drive.

> Mientras `EVAL_API` esté vacío, la web sigue funcionando con respaldo local
> (localStorage) — nada se rompe; simplemente las evaluaciones no se comparten
> hasta pegar la URL.

## Si cambias el `Code.gs` más adelante
Vuelve a **Implementar → Gestionar implementaciones → editar (lápiz) →
Versión: Nueva → Implementar**. La URL `/exec` se mantiene.
