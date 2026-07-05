# 🔥 Forja — app de entrenamiento

App personal para el gimnasio: rutinas + biblioteca de **873 ejercicios** (con imágenes, animación y guías en español), registro de series (peso, reps, RIR, drop sets) con **descanso configurable por ejercicio**, peso en ayunas, nutrición (macros), sueño, pasos, **informe semanal** e **importar/exportar rutinas**.

- **Local-first**: todos tus datos viven en tu móvil (IndexedDB del navegador). Sin cuentas, sin servidor, sin costes.
- **PWA instalable y offline**: se añade a la pantalla de inicio y funciona sin conexión.
- **Multiusuario por dispositivo**: cada persona la instala en su móvil = su app independiente. Se comparten rutinas por código/archivo (Importar/Exportar), no por cuentas.

## Estructura

```
forja/
├─ index.html              · shell de la app
├─ styles.css              · estilos
├─ app.js                  · toda la lógica + persistencia (IndexedDB)
├─ catalog.json            · 873 ejercicios (ES) · licencia Unlicense (dominio público)
├─ manifest.webmanifest    · manifest PWA
├─ sw.js                   · service worker (offline + caché de imágenes)
├─ icons/                  · iconos de la app
└─ README.md
```

Las **imágenes** de los ejercicios se sirven gratis desde el CDN jsDelivr (repo público `yuhonas/free-exercise-db`, dominio público) y el service worker las guarda **al verlas**, así quedan disponibles offline en el gym.

## Probar en local

Necesita servirse por HTTP (el service worker no funciona con `file://`). Con Node instalado:

```bash
npx http-server . -p 8080 -c-1
# abre http://localhost:8080
```

## Publicar (elige una)

**GitHub Pages** (gratis):
1. Crea el repo (p. ej. `Roly96x/forja`) y sube esta carpeta.
2. En *Settings → Pages* elige la rama `main`, carpeta `/root`.
3. Quedará en `https://roly96x.github.io/forja/` → ábrelo en el móvil e *Instálalo*.

**Hostinger** (subdominio o subcarpeta):
- Sube el contenido de esta carpeta por el Administrador de archivos / FTP a un subdominio (p. ej. `forja.tudominio`) o subcarpeta. Al ir por HTTPS, la PWA se instala igual.

## Subir a GitHub

```bash
cd forja
git init && git add -A && git commit -m "Forja v1"
git branch -M main
git remote add origin https://github.com/Roly96x/forja.git
git push -u origin main
```

## Copia de seguridad

En **Exportar → Copia de seguridad** puedes *Exportar copia* (un archivo `.json` con TODO) y *Importar copia* (al cambiar de móvil). Recomendado hacerlo de vez en cuando.

## Privacidad

Nada sale de tu dispositivo salvo lo que tú compartas (el informe semanal que copias al chat, o un código de rutina). Las imágenes se descargan del CDN público; no se envía ningún dato tuyo.
