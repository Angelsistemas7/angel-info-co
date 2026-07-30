# angel-info-co

Scraper público de [CrimenAI Colombia](https://github.com/Angelsistemas7/CrimenAi) (repo privado).

Este repo solo existe para correr el cron de GitHub Actions gratis e ilimitado (por ser
público). Cada 6 horas descarga datos de datos.gov.co (Socrata), los fusiona, y empuja
`data/colombia_crimen.json` + `js/data.js` (+ el cache-busting de `index.html`) al repo
privado del dashboard vía un Personal Access Token.

No contiene código del dashboard, solo los scripts de scraping (`data/fetch_raw.js`,
`data/fetch_poblacion.js`, `data/merge.js`, `data/patch_fiscalia_ubpd.js`) y sus JSON
crudos/intermedios (se sobreescriben en cada corrida).

## Configuración necesaria (una sola vez)

1. Generar un **fine-grained personal access token** en GitHub:
   `Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token`
   - **Resource owner**: Angelsistemas7
   - **Repository access**: Only select repositories → `CrimenAi`
   - **Permissions**: Repository permissions → `Contents: Read and write`
   - Expiración: la que prefieras (recuerda renovarlo antes de que caduque).

2. Guardarlo como secret en **este** repo (`angel-info-co`), no en `CrimenAi`:
   ```
   gh secret set PRIVATE_REPO_TOKEN --repo Angelsistemas7/angel-info-co
   ```
   (pega el token cuando lo pida; nunca lo compartas en chat ni lo commitees).

Sin este secret el workflow puede leer/generar los datos pero falla al hacer push al
repo privado.
