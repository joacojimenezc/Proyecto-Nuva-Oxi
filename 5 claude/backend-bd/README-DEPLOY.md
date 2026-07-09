# Backend BD Nuva-Oxi — Despliegue en Google Apps Script

Backend de almacenamiento del CRM web (bases Excel, documentos y `data.json`)
sobre Google Drive, expuesto como Web App de Apps Script.

## 1. Crear el proyecto

1. Entra a **https://script.google.com** con la cuenta de Google donde quieres
   guardar los archivos (esa cuenta será la dueña de la carpeta de Drive).
2. Clic en **Nuevo proyecto**.
3. Borra el contenido del editor y **pega completo** el archivo `Code.gs`
   de esta carpeta.
4. Renombra el proyecto (arriba a la izquierda), p. ej. `NUVA-OXI Web BD`.
5. Guarda con **Ctrl+S**.

## 2. Desplegar como App web

1. Botón **Implementar** (arriba a la derecha) > **Nueva implementación**.
2. En el engranaje ("Seleccionar tipo") elige **Aplicación web**.
3. Configura:
   - **Descripción:** `backend bd v1` (o lo que quieras).
   - **Ejecutar como:** **Yo** (tu cuenta).
   - **Quién tiene acceso:** **Cualquier persona**.
     (Es obligatorio para que la web pueda llamar sin login de Google.
     La seguridad la da la clave `k` que viaja en cada petición.)
4. Clic en **Implementar**.
5. La primera vez pedirá **autorizar**: Revisar permisos > elige tu cuenta >
   si aparece "Google no verificó esta app", clic en **Configuración avanzada** >
   **Ir a NUVA-OXI Web BD (no seguro)** > **Permitir**.
   (Es tu propio script; los permisos son para que pueda escribir en tu Drive.)
6. Copia la **URL de la aplicación web** — termina en `/exec`. Esa es la URL del API.

## 3. Conectar el frontend

Abre `7 web/bd-config.js` y pega la URL en el campo `api`:

```js
window.NUVA_BD_CFG = {
  api: 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec',
  key: 'NUVAOXI-BD-2607-kx94q'
};
```

- `api` vacío (`''`) = la web funciona en modo local, sin backend.
- La `key` debe coincidir con la constante `KEY` de `Code.gs`.

## 4. Probar

Pega en el navegador (reemplaza la URL por la tuya):

```
https://script.google.com/macros/s/XXXXXXXXXXXX/exec?action=ping&k=NUVAOXI-BD-2607-kx94q
```

- Respuesta esperada: `{"ok":true,"ts":"..."}`
- Con clave mala o ausente: `{"ok":false,"error":"clave invalida"}`
- También puedes probar los datos:
  `...?action=data&k=NUVAOXI-BD-2607-kx94q` → debe responder `{"ok":true,...}`
  y, de paso, **crea automáticamente** la carpeta `NUVA-OXI Web BD` en tu Drive
  (con `data.json` y las subcarpetas `bases`, `docs_fac_sellin`,
  `docs_fac_compras`, `docs_oc`, `docs_otros`).

## 5. RE-desplegar (cuando cambies Code.gs)

Importante: guardar el código NO actualiza la app publicada. Hay que crear
una **versión nueva** de la implementación existente (así la URL `/exec`
**no cambia** y no hay que tocar `bd-config.js`):

1. Edita/pega el nuevo `Code.gs` y guarda (Ctrl+S).
2. **Implementar** > **Administrar implementaciones**.
3. En la implementación activa, clic en el **lápiz** (editar).
4. En **Versión** elige **Nueva versión**.
5. Clic en **Implementar**.
6. Verifica con `?action=ping&k=...` que sigue respondiendo.

NUNCA uses "Nueva implementación" para actualizar: eso genera otra URL
distinta y el frontend quedaría apuntando a la versión vieja.

## 6. Notas de operación

- Todos los archivos quedan en tu Drive, carpeta **`NUVA-OXI Web BD`**.
- Los borrados (`deleteDoc` y el reemplazo de bases) van a la **papelera**
  de Drive: son reversibles durante 30 días.
- Los ids de carpetas/archivos se cachean en Propiedades del script
  (Configuración del proyecto > Propiedades del script). Si borras la carpeta
  de Drive a mano, el script la recrea vacía en la próxima petición.
- Si cambias la clave: actualiza `KEY` en `Code.gs`, re-despliega (paso 5)
  y actualiza `key` en `7 web/bd-config.js`.
