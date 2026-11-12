# Tracker · Esperanza en San Luis 2027

Página para que el equipo misionero registre la oración diaria (10 minutos), el QT y la llegada a los ensayos de los miércoles, con rankings para motivarse.

Es una página estática (sin build): HTML, CSS y JavaScript. Los datos viven en Firebase Firestore.

## Cómo la usa cada participante

1. Abre el link y elige su nombre. El celular lo recuerda.
2. **Hoy:** toca "Oré 10 minutos" y "Hice el QT". Si se olvidó un día, lo marca en la lista de la semana.
3. **Miércoles de ensayo:** toca "Fichar llegada" al llegar. La hora la pone el servidor.
4. **Ranking** y **Planilla** muestran cómo va todo el grupo. Desde la Planilla, tocando un nombre, se puede marcar a otra persona.
5. **Archivos:** carpetas con material del viaje (cancionero, guiones). Los PDF y las imágenes se ven dentro de la página.
6. **Props:** lista de lo que hace falta para las obras y actividades. Cualquiera puede agregar, editar, eliminar o marcar como listo, y filtrar por obra o actividad.

## Sumar archivos

Copiar el archivo en `archivos/<carpeta>/` y agregarlo a la lista de `archivos.js` (ahí también están las obras y actividades que sirven de filtro en Props). Después, commit y push. El repositorio es público: cualquiera con el link puede ver lo que se suba.

## Reglas del conteo

| Qué | Regla |
|---|---|
| Oración y QT | Todos los días, desde el 11/11/2026. Se pueden marcar días pasados. |
| A tiempo | Fichar hasta las 19:30 (inclusive) |
| Tarde | Fichar después de las 19:30. Mientras no fiche, después de las 19:30 figura "sin fichar" |
| Ausente | No fichar en todo el miércoles |
| Fichaje | Solo el mismo día, desde las 18:00. No se puede fichar un día pasado. |
| Racha | Días (o ensayos) seguidos cumpliendo. El día de hoy no corta la racha hasta que termina. |
| Ranking general | Promedio del % cumplido en oración, QT y llegada a tiempo. A cada uno se lo mide desde su fecha de ingreso. |

## Ajustes (solo el 총무)

Abrir el link agregando `#ajustes` al final (por ejemplo `https://lhong01.github.io/<repo>/#ajustes`). Desde ese momento, ese celular muestra la pestaña **Ajustes**:

- **QT de la semana:** cargar el pasaje de cada día. Aparece en la pantalla de todos.
- **Participantes:** agregar (uno por línea), renombrar, desactivar o cambiar desde cuándo le cuenta a cada uno.
- **Ensayos:** quitar un miércoles sin ensayo (por ejemplo el 23/12 o el 30/12) o agregar uno extra. Cambiar la hora límite, la hora desde la que se puede fichar y la fecha de inicio.

## Configurar Firebase (una sola vez)

1. En [console.firebase.google.com](https://console.firebase.google.com), crear un proyecto. Google Analytics no hace falta.
2. **Agregar app web** (ícono `</>`) y copiar el bloque `firebaseConfig` dentro de `config.js`.
3. **Firestore Database → Crear base de datos**, en la región `southamerica-east1`.
4. **Firestore → Reglas:** pegar el contenido de `firestore.rules` y publicar.
5. **Authentication → Comenzar → Sign-in method → Anónimo → Habilitar.**
6. **Authentication → Configuración → Dominios autorizados:** agregar `lhong01.github.io`.

## Probar en la computadora

Sin datos de Firebase en `config.js`, la página entra en **modo prueba**: participantes ficticios y datos guardados solo en ese navegador.

```
cd tracker
npx --yes http-server -p 8000 -c-1
```

(`python -m http.server` en Windows puede servir el CSS con un tipo incorrecto y la página se ve sin estilos.)

Abrir `http://localhost:8000`. En modo prueba se puede simular la hora: `http://localhost:8000/?ahora=2026-11-25T19:45`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Página |
| `styles.css` | Estilos (claro y oscuro automático) |
| `app.js` | Pantallas y acciones |
| `logic.js` | Fechas en hora argentina, estados de llegada, rachas y rankings |
| `store-firebase.js` | Lectura y escritura en Firestore, en vivo |
| `store-local.js` | Modo prueba |
| `archivos.js` | Lista de carpetas y archivos, y de obras y actividades (filtros de Props) |
| `visor.js` | Lector de PDF, imágenes, audio y video |
| `archivos/` | Los archivos en sí |
| `config.js` | Datos públicos del proyecto de Firebase |
| `firestore.rules` | Reglas de seguridad de Firestore |

Datos en Firestore:

```
config/general   inicio, horaLimite, aperturaFichaje, ensayos[], pasajes{fecha: texto}
props/{id}       nombre, cantidad, nota, encargado (id de persona), usos[], listo
personas/{id}    nombre, activo, desde, oracion{fecha: true}, qt{fecha: true}, llegadas{fecha: hora del servidor}
```

Los nombres de los participantes viven en Firestore, no en este repositorio.
