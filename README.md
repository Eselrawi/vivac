# Vivac

Una app para el grupo de amigos que hace vivac en la Sierra de Guadarrama (Madrid, Segovia y Ávila). Responde a la pregunta de cada semana: **¿dónde dormimos este finde?** Y guarda el recuerdo de cada noche.

Se abre desde el móvil, se instala como cualquier app y funciona sin cobertura.

**Dirección:** https://eselrawi.github.io/vivac/

## Qué hace

- **Dormir:** eliges un día (hasta 10 días vista) y te ordena todos los sitios (refugios, abrigos, parapetos y vuestros vivacs) según lo buena que va a ser esa noche. Cruza la previsión de tres modelos meteorológicos con la protección de cada sitio. Para cada uno te dice el tiempo que tardas desde casa (coche más andando) y a qué hora salir para llegar con luz.
- **Mapa:** mapa en 3D con los sitios, buscador, un mapa vectorial propio de la sierra y las capas del IGN (topográfico y satélite). Mantén pulsado en cualquier punto para ver su altitud y el tiempo de esta noche ahí. Tiene capa opcional con las zonas de vivac autorizadas del Parque Nacional, rutas a pie sin conexión y botón de emergencia con tus coordenadas para llamar al 112.
- **Diario:** una tarjeta por cada noche, con foto, tiempo real de esa noche, cómo se durmió, estadísticas y un mapa de calor.
- **Mochila:** apuntas tu material una vez y la app te dice qué llevar según la previsión, cuánto pesa y quién lleva lo común. Aprende si sueles pasar frío.

## Instalarla en el móvil

**Android (Chrome)**
1. Abre la dirección de arriba en Chrome.
2. Pulsa los tres puntos de arriba a la derecha.
3. Elige «Instalar aplicación» (o «Añadir a la pantalla de inicio»).

**iPhone (Safari)**
1. Abre la dirección en **Safari** (en otros navegadores no sale la opción).
2. Pulsa el botón Compartir, el cuadrado con la flecha hacia arriba.
3. Elige «Añadir a pantalla de inicio» y pulsa Añadir.

En iPhone los avisos solo funcionan con la app instalada y no vibra. Es una limitación de Apple.

## Entrar y juntar al grupo

1. Toca el icono de persona, arriba a la izquierda.
2. Escribe tu correo y pulsa «Enviarme el enlace». Te llega un correo; ábrelo desde el mismo móvil. No hay contraseña.
3. Quien crea el grupo pulsa «Invitar a un amigo» y lo manda por WhatsApp. Al abrir ese enlace, el amigo entra solo en el grupo.

## Navegar hasta un sitio

En la ficha de un sitio, «Cómo llegar» abre la ruta. Si estás lejos, primero te lleva en coche hasta el aparcamiento (con cobertura) y después a pie. Pulsa **Empezar** y la pantalla se convierte en un navegador: te dice cuántos metros faltan para el próximo giro, habla en español, gira el mapa según vas mirando y recalcula si te sales del camino. **Vista previa** te enseña cómo sería sin moverte de casa.

Lo que hay que saber:
- El tramo en coche necesita cobertura. Sin ella, solo te marca la dirección en línea recta hasta el aparcamiento.
- El tramo a pie funciona sin cobertura. Los senderos no tienen nombre en los datos, así que oirás «gira a la derecha», no el nombre del sendero.
- En iPhone hay que dejar la pantalla encendida: si se apaga, el GPS se para.
- «Volver al coche» en Mi GPS usa esta misma navegación.

## Guardar una noche («Dormimos aquí»)

Pulsa el **+** verde, elige «Dormimos aquí», dale un nombre y ya está. El GPS, la altitud y la hora se ponen solos. Puedes añadir una foto y cómo habéis dormido. Funciona sin cobertura: cuando vuelva la red, se sube solo y se añade el tiempo real de esa noche.

Al día siguiente la app te recuerda valorarla.

## Usarla sin cobertura

Antes de subir, con wifi, entra en **Mapa** y pulsa el botón de la flecha hacia abajo (Descargar zona). Elige «Toda la sierra», deja marcadas las capas que quieras y pulsa Descargar. Te dice cuánto ocupa antes de empezar.

Sin cobertura siguen funcionando: el mapa descargado, las fichas, las rutas a pie, la mochila y guardar vivacs. La previsión será la última que se guardó.

## Si algo falla

- **No sale el mapa o los sitios:** comprueba que tienes datos o wifi la primera vez que la abres. Después se guarda en el móvil.
- **Veo una versión antigua:** cierra la app del todo y vuelve a abrirla. Se actualiza sola.
- **El GPS no encuentra nada:** ve a Ajustes del móvil y permite la ubicación para Vivac o para el navegador. En el monte, mejor a cielo abierto.
- **No llega el correo de acceso:** mira en spam y comprueba que no te has equivocado al escribirlo.
- **Una fuente o un refugio no está donde dice:** abre su ficha. Puedes confirmar que existe, y con «+ → Refugio / fuente» añades los que falten.

## Sitios sugeridos por el relieve

En Dormir, el filtro «✨ Sugeridos por el relieve» añade sitios que no están catalogados: terreno casi plano, cerca de una fuente y con montaña que corta el viento. Los calcula la app con el modelo de elevación. Son solo una pista: hay que verlos sobre el terreno antes de fiarse.

## Lo que conviene saber

- Los refugios, chozos, abrigos y parapetos vienen de OpenStreetMap y están marcados como **sin verificar** hasta que alguien del grupo los confirme. Cuando vayáis, confirmad en la ficha.
- En los refugios y albergues de pago el precio pone **«consultar»**: no hay un precio confirmado y no lo inventamos. Se anota el que os cobren.
- El tiempo caminando está calculado con la norma DIN 33466, que es prudente (4 km/h en llano, 300 m/h subiendo, 500 m/h bajando).
- La app orienta, no sustituye al parte oficial (AEMET) ni al criterio de cada uno. En nieve o niebla, mejor no arriesgar.
- Vivac y acampada están regulados en el Parque Nacional de la Sierra de Guadarrama. Consulta las zonas autorizadas antes de salir.

## Para quien la mantiene

```bash
npm install        # dependencias
npm run dev        # probarla en el ordenador
npm test           # pruebas del motor (puntuación, frases, mochila, accesos)
npm run build      # versión final
```

Cada cambio en `main` se publica solo en GitHub Pages (`.github/workflows/deploy.yml`).

- `scripts/fetch-osm.mjs` → `build-places.mjs` → `enrich.mjs`: reconstruyen el catálogo de sitios, completan altitudes con el modelo de elevación y calculan los tiempos en coche desde Villanueva de la Cañada (OSRM). Un workflow mensual lo hace solo.
- `scripts/discover.mjs`: calcula los sitios sugeridos por el relieve.
- `public/data/sierra.pmtiles`: extracto de Protomaps/OpenStreetMap de la sierra (hasta zoom 14). Se regenera con la herramienta `pmtiles extract` y la última compilación de https://maps.protomaps.com/builds/.
- `scripts/build-graph.mjs`: genera el grafo de caminos para las rutas sin conexión. Es pesado; se lanza a mano cuando haga falta.
- `data/review/lugares.csv` y `lugares.geojson`: el catálogo para revisarlo en una hoja de cálculo o en QGIS.
- `supabase/migrations`: base de datos (Postgres + PostGIS, con reglas de acceso por grupo).
- Un workflow semanal lanza una consulta ligera a Supabase para que no pause el proyecto gratuito.

## Datos y licencias

Mapas © IGN España · mapa vectorial © OpenStreetMap y Protomaps · zonas de vivac: Comunidad de Madrid (CC BY 4.0) · relieve: Terrain Tiles (AWS) · sitios, fuentes y cumbres © colaboradores de OpenStreetMap (ODbL) · previsión: Open-Meteo · tiempos en coche: OSRM · fotos: Wikimedia Commons, con su autor y licencia en cada una.
