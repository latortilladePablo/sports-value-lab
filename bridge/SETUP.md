# Google Sheets Bridge — setup único

La web de Sports Value Lab no debe hacer públicos los Google Sheets ni guardar credenciales de Google en el navegador.

## 1. Crear el Apps Script
1. Abre **Sports_Value_Lab_Registro_CURRENT**.
2. Ve a **Extensiones → Apps Script**.
3. Sustituye el contenido de `Code.gs` por `SVL_Google_Bridge.gs`.
4. Guarda.

## 2. Guardar el token
1. En el selector de funciones de Apps Script elige `setBridgeToken`.
2. Pulsa **Ejecutar** y concede permisos de Google si los solicita.
3. Pega el token que te dio ChatGPT.
4. El token queda en Script Properties; no se publica en el código.

## 3. Desplegar como Web app
1. **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Ejecutar como: **Yo**.
4. Quién tiene acceso: **Cualquier usuario** / **Anyone** (la URL queda protegida por el token).
5. Implementa y copia la URL terminada en `/exec`.

## 4. Entregar la URL a ChatGPT
Escribe:
`Puente Google desplegado: <URL /exec>`

ChatGPT guardará esa URL como variable cifrada `SVL_GOOGLE_BRIDGE_URL` en Vercel y redeployará. El token ya está guardado cifrado en Vercel.
