# angel-info-co

Scraper público de [CrimenAI Colombia](https://github.com/Angelsistemas7/CrimenAi) (repo privado).

Este repo solo existe para correr el cron de GitHub Actions gratis e ilimitado (por ser
público). Cada 6 horas descarga datos de datos.gov.co (Socrata), los fusiona, y se
publica el resultado en `dist/js/data.js` + `dist/data/colombia_crimen.json`, commiteado
a sí mismo con su propio `GITHUB_TOKEN` automático.

El repo privado del dashboard tiene su propio workflow que, un rato después, **lee**
esos archivos (un repo público se lee sin ninguna autenticación) y los incorpora con
su propio `GITHUB_TOKEN`. No hace falta ningún secret ni token compartido entre los
dos repos.

No contiene código del dashboard, solo los scripts de scraping (`data/fetch_raw.js`,
`data/fetch_poblacion.js`, `data/merge.js`, `data/patch_fiscalia_ubpd.js`) y sus JSON
crudos/intermedios (se sobreescriben en cada corrida).
