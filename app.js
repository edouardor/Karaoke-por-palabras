
let FRASES_JUEGO = []; 
let fraseActualIndex = 0;
let notaSecuenciaIndex = 0; 
let muestrasConsecutivasBien = 0;
const MUESTRAS_NECESARIAS = 3; 
let reproduciendoGuia = false;
let ultimaNotaValidadaTexto = "";
let toleranciaCentsConfigurada = 60; 
let palabraMostradaIndex = 0;            // palabra que se ve en pantalla (para las flechas)
let temporizadorSiguientePalabra = null; // pausa de 800 ms tras acertar una palabra
let idGuia = 0;                          // identifica la reproducción de guía vigente
let esperandoSiguientePalabra = false;   // pausa del micro entre una palabra acertada y la siguiente
// ---- Modo escucha solo ----
// ---- Feedback ligero al final del entrenamiento ----
const FEEDBACK_SEGUNDOS_LENTA = 10;      // una palabra "costó más" si se tardó más de esto (o 3 veces su duración musical)
const FEEDBACK_MAX_PALABRAS = 3;         // como mucho, estas palabras se sugieren para repasar
let tiemposPalabras = {};                // índice de palabra -> segundos que costó cantarla
let inicioCantoMs = 0;                   // instante en que terminó la guía y se esperaba el canto
let finNotaEntrenamientoMs = 0;          // la nota siguiente no se valora antes de este instante
let notaEntrenamientoSuperada = false;   // ya está afinada, pero su tiempo aún no ha acabado
let repasoActivo = false;                // true mientras se repasa una palabra desde el resumen final
const AYUDA_NOTA_MS = 1000;              // voz sostenida, sin contar silencios, antes del borde blanco
let msIntentandoNota = 0;
let ultimoMsVoz = 0;
let ayudaNotaLista = false;
let notaCantadaAyuda = null;

// ---- Guía sonora del modo entrenamiento ----
const GUIA_PROPORCION_SOSTENIDO = 0.85;  // cada nota suena al menos el 85 % del tiempo hasta la siguiente...
const GUIA_SOSTENIDO_MAXIMO = 0.6;       // ...pero sin alargarla más de 0,6 s por encima de su duración original
const GUIA_DURACION_MINIMA_ULTIMA = 0.35; // y la última nota de cada palabra suena al menos 0,35 s
// La celda suena con dos senos a 0,35. La melodía reparte eso en parciales
// (0,40 + 0,10 + 0,08): 1,15 deja la palabra al mismo volumen que la celda.
const VOLUMEN_MELODIA = 0.30;             // karaoke, más bajo para no volver al micrófono
const VOLUMEN_MELODIA_GUIA = 1.15;        // entrenamiento y escucha

const UMBRAL_SILENCIO_ESCUCHA = 3;       // segundos: a partir de aquí se avisa "Aquí no cantamos"
let modoEscucha = false;                 // true mientras se está en el modo escucha
let estadoEscucha = 'reproduciendo';     // 'reproduciendo' | 'pausada' | 'fin'
// ---- Modo karaoke: la melodía sigue sola y se puntúan las notas al vuelo ----
let modoKaraoke = false;
let estadoKaraoke = 'reproduciendo';     // 'cuenta' | 'reproduciendo' | 'pausada' | 'fin'
let cuentaKaraokePendiente = false;      // la pausa pilló el tono o la cuenta atrás
let pulsosPorCompas = 4;
let segundosPorPulso = 0.6;
let modoSolicitado = 'entrenamiento';    // modo con el que se arrancó esta pieza
let notasLineaKaraoke = [];              // todas las notas, en orden, con su palabra
let indiceNotaKaraoke = 0;
let notaEnJuicio = null;                 // nota que se está puntuando ahora mismo
let framesDesafinadosKaraoke = 0;        // frames seguidos con un tono claro y fuera de margen
let pulsoCompasMarcado = 0;             // 1..N iluminado; 0 = ninguno (durante el tono)
let aciertosKaraoke = 0;
let temporizadorKaraoke = null;
let relojKaraoke = { t0: 0, tiempoBase: 0 };
let velocidadKaraoke = 1;               // 1 = tempo de la partitura; solo afecta al karaoke
let pendienteKaraoke = null;             // próximo aviso del reloj, para reprogramarlo al cambiar la velocidad
let pasoCuentaKaraoke = null;            // paso de la cuenta atrás que está en curso
let temporizadorEscucha = null;          // temporizador de la siguiente nota
let relojEscucha = { t0: 0, tiempoBase: 0 }; // referencia para no acumular retraso
let sonidoEscuchaActual = null;          // última nota sonando (para silenciarla al pausar)
let sonidoAcordeActual = null;           // acorde de acompañamiento, independiente de la melodía
let acompanamiento = [];                 // acordes que se oyen y no se cantan
let temporizadoresAcompanamiento = [];
let enSilencio = false;                  // true mientras se muestra "Aquí no cantamos"
let intervaloSilencio = null;            // actualiza la cuenta atrás del silencio
let cancionActual = "";                  // canción elegida (para pasar de escucha a entrenamiento)
let piezaPendiente = "";                 // pieza abierta desde Calentamiento, fuera de la lista

let bucleAudioActivo = false;            // evita arrancar varios bucles de audio a la vez

// ---- Ajustes específicos por canción ----
// Canciones en las que el usuario canta primero la nota inicial y la melodía se transpone a ella
const CANCIONES_AFINACION_LIBRE = ["Cumpleanos Feliz"];
const DIFICULTAD_INICIAL = 60;   // Iniciación / Muy Fácil, para cualquier canción

let modoCalibracion = false;             // true mientras se espera la primera nota
let muestrasCalibracion = [];
const MUESTRAS_CALIBRACION = 25;         // ~0,4 s de nota estable
const MIDI_MIN_PRIMERA_NOTA = 36;        // Do2
const MIDI_MAX_PRIMERA_NOTA = 64;        // Mi4 (la melodía sube hasta una octava por encima)

const NOMBRES_NOTA_INGLES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const NOMBRES_NOTA_ESPANOL = ["Do","Do#","Re","Re#","Mi","Fa","Fa#","Sol","Sol#","La","La#","Si"];

function abrirAyuda() {
    document.getElementById('ayuda').showModal();
}

function cerrarAyuda() {
    document.getElementById('ayuda').close();
}

// El margen del menú (15, 30, 45 o 60 cents) es el que usa el entrenamiento y el karaoke.
function aplicarToleranciaDelMenu() {
    const control = document.getElementById('selector-dificultad');
    const valor = parseInt(control && control.value, 10);
    if (valor === 15 || valor === 30 || valor === 45 || valor === 60) {
        toleranciaCentsConfigurada = valor;
    }
    return toleranciaCentsConfigurada;
}

function etiquetaDificultad(valor) {
    const nivel = String(valor);
    if (nivel == "15") return "Profesional 🎯";
    if (nivel == "30") return "Coral 🎙️";
    if (nivel == "45") return "Fácil ☕";
    return "Iniciación / Muy Fácil 👶";
}

function actualizarTextoDificultad(valor) {
    document.getElementById('txt-dificultad').innerHTML = etiquetaDificultad(valor);
}

let tituloCancionActual = "";
let exigenciaUsada = "";
const CLAVE_ESTUDIO_HOY = "karaoke-estudio-hoy";

function fechaHoy() {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");
    return `${hoy.getFullYear()}-${mes}-${dia}`;
}

function leerCancionesHoy() {
    try {
        const datos = JSON.parse(localStorage.getItem(CLAVE_ESTUDIO_HOY) || "null");
        if (!datos || datos.fecha !== fechaHoy() || !Array.isArray(datos.piezas)) return [];
        return datos.piezas;
    } catch (e) {
        return [];
    }
}

function anotarCancionEstudiadaHoy(puntuacionKaraoke) {
    const piezas = leerCancionesHoy();
    const pieza = {
        titulo: tituloCancionActual || cancionActual,
        exigencia: exigenciaUsada || etiquetaDificultad(toleranciaCentsConfigurada)
    };
    if (puntuacionKaraoke) pieza.karaoke = puntuacionKaraoke;
    piezas.push(pieza);
    try {
        localStorage.setItem(CLAVE_ESTUDIO_HOY, JSON.stringify({ fecha: fechaHoy(), piezas }));
    } catch (e) { /* si el navegador no guarda, la lista de esta sesión no sobrevive al recargar */ }
}

function textoPiezaEstudiada(pieza) {
    let texto = `${pieza.titulo} — ${pieza.exigencia}`;
    if (pieza.karaoke && typeof pieza.karaoke.promedio === "number") {
        texto += ` — Karaoke ${pieza.karaoke.promedio}%`;
        if (typeof pieza.karaoke.aciertos === "number" && typeof pieza.karaoke.total === "number") {
            texto += ` (${pieza.karaoke.aciertos} de ${pieza.karaoke.total})`;
        }
    }
    return texto;
}

function abrirCancionesHoy() {
    const piezas = leerCancionesHoy();
    const lista = document.getElementById('lista-canciones-hoy');
    lista.innerHTML = "";
    piezas.forEach(pieza => {
        const item = document.createElement('li');
        item.textContent = textoPiezaEstudiada(pieza);
        lista.appendChild(item);
    });
    const enhorabuena = document.getElementById('enhorabuena-hoy');
    enhorabuena.textContent = piezas.length === 1
        ? "Enhorabuena por el trabajo realizado hoy. Has estudiado una pieza."
        : `Enhorabuena por el trabajo realizado hoy. Has estudiado ${piezas.length} piezas.`;
    document.getElementById('canciones-hoy').showModal();
}

function cerrarCancionesHoy() {
    document.getElementById('canciones-hoy').close();
}

let audioContext;
let analyser;
let dataArray;
let source;
let streamMicrofono = null;

const MAPA_NOTAS_A_NUMERO = {
    "do": 0, "c": 0, "do#": 1, "c#": 1, "re": 2, "d": 2, "re#": 3, "d#": 3,
    "mi": 4, "e": 4, "fa": 5, "f": 5, "fa#": 6, "f#": 6, "sol": 7, "g": 7,
    "sol#": 8, "g#": 8, "la": 9, "a": 9, "la#": 10, "a#": 10, "si": 11, "b": 11
};

const FRECUENCIAS_BASE_OCTAVA_0 = {
    "C": 16.35,  "C#": 17.32,  "D": 18.35,  "D#": 19.45,
    "E": 20.60,  "F": 21.83,   "F#": 23.12, "G": 24.50,
    "G#": 25.96, "A": 27.50,   "A#": 29.14, "B": 30.87
};

function hzANombreEspanol(frecuenciaHz) {
    if (frecuenciaHz <= 0 || isNaN(frecuenciaHz)) return "...";
    const notaMidi = Math.round(69 + 12 * Math.log2(frecuenciaHz / 440));
    const nombresIngles = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const traducciones = {"C": "Do", "D": "Re", "E": "Mi", "F": "Fa", "G": "Sol", "A": "La", "B": "Si"};
    return traducciones[nombresIngles[notaMidi % 12]] || "...";
}

function autoCorrelacion(buffer, sampleRate) {
    let SIZE = buffer.length; let rrms = 0;
    for (let i = 0; i < SIZE; i++) { rrms += buffer[i] * buffer[i]; }
    rrms = Math.sqrt(rrms / SIZE);
    if (rrms < 0.02) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buffer[i]) < thres) { r1 = i; break; } }
    for (let i = SIZE - 1; i >= SIZE / 2; i--) { if (Math.abs(buffer[i]) < thres) { r2 = i; break; } }
    buffer = buffer.slice(r1, r2); SIZE = buffer.length;
    if (SIZE < 8) return -1;

    let c = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) { c[i] = c[i] + buffer[j] * buffer[j + i]; }
    }
    let d = 0; while (d < SIZE - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
    // Sin un pico periódico claro es ruido de fondo, no una nota cantada.
    if (maxpos < 2 || maxpos >= SIZE - 1 || !(c[0] > 0) || maxval / c[0] < 0.35) return -1;
    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2; let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    const frecuencia = sampleRate / T0;
    return Number.isFinite(frecuencia) ? frecuencia : -1;
}
// Varias formas de pedir el mismo archivo: con ñ/tildes en NFC o NFD, y con el
// nombre escapado. Si una petición se corta ("Failed to fetch"), se prueba la siguiente.
function urlsCancion(nombreArchivo) {
    const formas = [...new Set([
        nombreArchivo,
        nombreArchivo.normalize('NFC'),
        nombreArchivo.normalize('NFD')
    ])];
    const urls = [];
    formas.forEach(nombre => {
        urls.push(`./canciones/${nombre}`);
        urls.push(`./canciones/${encodeURIComponent(nombre)}`);
    });
    return [...new Set(urls)];
}

async function cargarArchivoCancion(nombreArchivo) {
    let ultimoStatus = null;
    let falloRed = null;
    for (const url of urlsCancion(nombreArchivo)) {
        try {
            const respuesta = await fetch(url);
            if (respuesta.ok) return respuesta;
            ultimoStatus = respuesta.status;
        } catch (e) {
            falloRed = e;
        }
    }
    if (falloRed && ultimoStatus === null) {
        if (location.protocol === 'file:') {
            throw new Error('La página está abierta como archivo. Ábrela desde Live Server, en http://127.0.0.1:5500, para poder cargar las canciones.');
        }
        throw new Error(`No se pudo leer «${nombreArchivo}»: ${falloRed.message}`);
    }
    return { ok: false, status: ultimoStatus };
}

async function iniciarApp(modo = 'entrenamiento') {
    try {
        detenerPruebaMicrofono();
        cancelarTemporizadores();
        tiemposPalabras = {};
        FRASES_JUEGO = [];
        fraseActualIndex = 0;
        notaSecuenciaIndex = 0;
        muestrasConsecutivasBien = 0;
        ultimaNotaValidadaTexto = "";

        aplicarToleranciaDelMenu();
        exigenciaUsada = etiquetaDificultad(toleranciaCentsConfigurada);
        modoSolicitado = modo;

        const cancionSeleccionada = (piezaPendiente || document.getElementById('selector-cancion').value).trim();
        piezaPendiente = "";
        cancionActual = cancionSeleccionada;
        document.getElementById('botones-inicio').style.display = 'none';
        document.getElementById('zona-seleccion').style.display = 'none';
        document.getElementById('zona-reinicio').style.display = 'none';
        document.getElementById('status-box').style.display = 'block';

        const [resNotas, resTexto] = await Promise.all([
            cargarArchivoCancion(`${cancionSeleccionada}.json`),
            cargarArchivoCancion(`${cancionSeleccionada} txt.json`)
        ]);

        if (!resNotas.ok || !resTexto.ok) {
            const faltan = [];
            if (!resNotas.ok) faltan.push(`«${cancionSeleccionada}.json»`);
            if (!resTexto.ok) faltan.push(`«${cancionSeleccionada} txt.json»`);
            throw new Error(`No se encuentra ${faltan.join(' ni ')} en la carpeta "canciones". Revisa que el nombre coincida exactamente.`);
        }

        const datosNotas = await resNotas.json();
        let datosTexto = await resTexto.json();
        guardarCompas(datosNotas);

        if (datosTexto.default) datosTexto = datosTexto.default;

        // Mostrar el nombre de la canción junto al del coro
        const tituloCancion = datosTexto.titulo || cancionSeleccionada;
        tituloCancionActual = tituloCancion;
        const elTitulo = document.getElementById('titulo-cancion');
        elTitulo.textContent = `· 🎼 ${tituloCancion}`;
        elTitulo.style.display = 'inline';

        let lineasLetra = [];
        if (datosTexto.lineas && Array.isArray(datosTexto.lineas)) {
            lineasLetra = datosTexto.lineas;
        } else if (Array.isArray(datosTexto)) {
            lineasLetra = datosTexto;
        } else {
            for (let clave in datosTexto) {
                if (Array.isArray(datosTexto[clave])) { lineasLetra = datosTexto[clave]; break; }
            }
        }

        let notasRaw = datosNotas.notes || datosNotas;
        let pistaMelodia = null;
        if (datosNotas.tracks && Array.isArray(datosNotas.tracks)) {
            pistaMelodia = datosNotas.tracks.find(t => t.notes && t.notes.length > 0) || null;
            if (pistaMelodia) notasRaw = pistaMelodia.notes;
        }
        acompanamiento = acordesDe(datosNotas, pistaMelodia);

        let tAcumulado = 0;
        let notasListaCompleta = notasRaw.map(n => {
            let nombre = (typeof n === 'string') ? n : (n.name || n.note || n.pitch || "");
            let duracion = (typeof n === 'object' && n.duration) ? n.duration : 0.4;
            // Instante de inicio de la nota (si el JSON no lo trae, se encadenan las duraciones)
            let tiempo = (typeof n === 'object' && typeof n.time === 'number') ? n.time : tAcumulado;
            tAcumulado = tiempo + duracion;
            let notaLimpia = nombre.replace(/[0-9]/g, '').trim();
            const traducciones = {"C": "Do", "D": "Re", "E": "Mi", "F": "Fa", "G": "Sol", "A": "La", "B": "Si"};
            let notaBase = notaLimpia.charAt(0).toUpperCase() + notaLimpia.slice(1);
            return {
                nombre: traducciones[notaBase.charAt(0)] ? traducciones[notaBase.charAt(0)] + notaBase.slice(1) : notaLimpia,
                duracion: duracion,
                tiempo: tiempo
            };
        }).filter(n => n.nombre !== "");

        let notasContador = 0;
        lineasLetra.forEach(linea => {
            if (!linea.linea_completa) return;
            let palabrasFrase = linea.linea_completa.split(/\s+/);
            // Opcional: "texto_visible" = las palabras reales a mostrar (útil con melismas,
            // p. ej. "ca-an-ti-co-rum" se muestra como "Canticorum")
            const palabrasVisibles = (linea.texto_visible || "").split(/\s+/).filter(Boolean);
            palabrasFrase.forEach((palBase, idxPalabra) => {
                let palabraLimpia = palBase.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
                let palabraMarcada = null;   // versión con (ayudas de pronunciación) entre paréntesis
                if (palabrasVisibles.length === palabrasFrase.length) {
                    const visible = palabrasVisibles[idxPalabra].replace(/_/g, " ");
                    palabraLimpia = visible.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
                    if (/\([^)]*\)/.test(visible)) {
                        palabraMarcada = visible.replace(/[.,\/#!$%\^&\*;:{}=\-_`~]/g,"");
                    }
                }
                let numeroSilabas = (palBase.match(/-/g) || []).length + 1;
                let silabasLista = palBase.replace(/[.,\/#!$%\^&\*;:{}=_`~()]/g,"").split("-");
                
                let notasDeEstaPalabra = [];
                let notasInglesDeEstaPalabra = [];
                let duracionesDeEstaPalabra = [];
                let silabasDeEstaPalabra = [];
                let tiemposDeEstaPalabra = [];
                
                for (let i = 0; i < numeroSilabas; i++) {
                    if (notasListaCompleta[notasContador]) {
                        notasDeEstaPalabra.push(notasListaCompleta[notasContador].nombre);
                        notasInglesDeEstaPalabra.push(notasRaw[notasContador].name || notasRaw[notasContador].note || "D4");
                        duracionesDeEstaPalabra.push(notasListaCompleta[notasContador].duracion);
                        tiemposDeEstaPalabra.push(notasListaCompleta[notasContador].tiempo);
                        silabasDeEstaPalabra.push(silabasLista[i] || "...");
                        notasContador++;
                    }
                }
                
                if (notasDeEstaPalabra.length > 0) {
                    FRASES_JUEGO.push({
                        palabra: palabraLimpia,
                        palabraMarcada: palabraMarcada,
                        notes: notasDeEstaPalabra,
                        notesIngles: notasInglesDeEstaPalabra,
                        duraciones: duracionesDeEstaPalabra,
                        tiempos: tiemposDeEstaPalabra,
                        silabas: silabasDeEstaPalabra
                    });
                }
            });
        });

        if (FRASES_JUEGO.length === 0) throw new Error("No se encontraron palabras en la canción.");

        // ----- MODO ESCUCHA SOLO: no hace falta micrófono -----
        if (modo === 'escucha') {
            asegurarAudioContext();
            if (audioContext.state === 'suspended') await audioContext.resume();
            iniciarEscuchaDesde(0);
            if (!bucleAudioActivo) {
                bucleAudioActivo = true;
                bucleDeAudio();
            }
            return;
        }

        // ----- MODO ENTRENAMIENTO o KARAOKE (los dos escuchan el micrófono) -----
        await asegurarMicrofono();

        if (CANCIONES_AFINACION_LIBRE.includes(cancionSeleccionada)) {
            iniciarCalibracion();
        } else if (modo === 'karaoke') {
            iniciarKaraokeDesde(0);
        } else {
            cargarNuevaFrasePalabra();
        }

        if (!bucleAudioActivo) {
            bucleAudioActivo = true;
            bucleDeAudio();
        }

    } catch (err) {
        document.getElementById('palabra-pantalla').innerText = "Error";
        document.getElementById('evaluacion').innerHTML = `<span class='error'>❌ Error: ${err.message}</span>`;
    }
}
// ==========================================
// FEEDBACK LIGERO AL FINAL DEL ENTRENAMIENTO
// ==========================================
// Duración musical de una palabra (de su primera nota al final de la última), en segundos
function duracionMusicalPalabra(datos) {
    const n = datos.tiempos.length;
    return (datos.tiempos[n - 1] - datos.tiempos[0]) + (datos.duraciones[n - 1] || 0.4);
}

// Lo que tarda aproximadamente la guía sonora de una palabra, en milisegundos
function duracionGuiaMs(datos) {
    const n = datos.tiempos.length;
    const ultima = Math.max(datos.duraciones[n - 1] || 0.4, GUIA_DURACION_MINIMA_ULTIMA);
    return ((datos.tiempos[n - 1] - datos.tiempos[0]) + ultima + 0.3) * 1000;
}

function registrarTiempoPalabra(indice) {
    tiemposPalabras[indice] = Math.max(0, (performance.now() - inicioCantoMs) / 1000);
}

// Palabras que pidieron claramente más tiempo, de mayor a menor
function palabrasLentas() {
    const lentas = [];
    Object.keys(tiemposPalabras).forEach(clave => {
        const indice = Number(clave);
        const datos = FRASES_JUEGO[indice];
        if (!datos) return;
        const limite = Math.max(FEEDBACK_SEGUNDOS_LENTA, 3 * duracionMusicalPalabra(datos));
        if (tiemposPalabras[clave] > limite) lentas.push({ indice, exceso: tiemposPalabras[clave] / limite });
    });
    lentas.sort((a, b) => b.exceso - a.exceso);
    return lentas;
}

// Como mucho unas pocas, en el orden de la canción, para no convertir el final en una lista
function palabrasParaRepasar() {
    return palabrasLentas().slice(0, FEEDBACK_MAX_PALABRAS).sort((a, b) => a.indice - b.indice);
}

function textoLogroFinal(cantadas, fluidas) {
    if (cantadas > 0 && fluidas === cantadas) {
        return 'Has llegado al final, y ha ido fluida. Si te apetece, repítela: la segunda vez suele salir mejor.';
    }
    if (cantadas > 0 && fluidas * 2 >= cantadas) {
        return 'Has llegado al final. La mayor parte ha ido con soltura.';
    }
    return 'Has llegado al final. Eso ya es ensayar la pieza entera.';
}

function mostrarResumenFinal() {
    const contenedor = document.getElementById('secuencia-visual');
    const resumen = document.createElement('div');
    resumen.className = 'resumen-final';

    const cantadas = Object.keys(tiemposPalabras).length;
    const lentas = palabrasLentas();
    const fluidas = Math.max(0, cantadas - lentas.length);
    const repasar = palabrasParaRepasar();

    const logro = document.createElement('div');
    logro.className = 'resumen-logro';
    logro.innerText = textoLogroFinal(cantadas, fluidas);
    resumen.appendChild(logro);

    if (repasar.length > 0) {
        const titulo = document.createElement('div');
        titulo.className = 'resumen-titulo';
        titulo.innerText = 'Si quieres seguir, estas se pueden repetir con calma:';
        resumen.appendChild(titulo);

        const fila = document.createElement('div');
        fila.className = 'resumen-palabras';
        repasar.forEach(item => {
            const chip = document.createElement('button');
            chip.className = 'chip-repaso';
            chip.innerText = FRASES_JUEGO[item.indice].palabra;
            chip.title = 'Repasar esta palabra';
            chip.onclick = () => {
                irAPalabra(item.indice);
                repasoActivo = true;      // al acertarla se vuelve a este resumen
            };
            fila.appendChild(chip);
        });
        resumen.appendChild(fila);
    }

    const cierre = document.createElement('div');
    cierre.className = 'resumen-cierre';
    cierre.innerText = repasar.length > 0
        ? 'No tiene que salir a la primera. Volver a probar, sin forzar la voz, es lo que afina.'
        : 'Cuando quieras, puedes repetirla o subir un poco la exigencia.';
    resumen.appendChild(cierre);

    contenedor.appendChild(resumen);
}

// Convierte "Nic(h)e" en HTML donde lo que va entre paréntesis (ayuda de pronunciación)
// se muestra en otro color y sin los paréntesis. El resto del texto se escapa.
function htmlPalabraConPronunciacion(texto) {
    const seguro = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return seguro.replace(/\(([^)]*)\)/g, '<span class="pron">$1</span>') +
           '<small class="leyenda-pron">azul: cómo se pronuncia</small>';
}

function cargarNuevaFrasePalabra(sinGuia = false) {
    esperandoSiguientePalabra = false;
    palabraMostradaIndex = fraseActualIndex;
    actualizarFlechas();

    if (fraseActualIndex >= FRASES_JUEGO.length) {
        document.getElementById('palabra-pantalla').innerText = "🎉 ¡COMPLETADO!";
        document.getElementById('secuencia-visual').innerHTML = "";
        document.getElementById('evaluacion').innerHTML = "<span class='success'>Pieza terminada. Buen trabajo.</span>";
        document.getElementById('zona-reinicio').style.display = "flex";
        mostrarResumenFinal();
        return;
    }
    
    notaSecuenciaIndex = 0;
    muestrasConsecutivasBien = 0;
    ultimaNotaValidadaTexto = "";
    
    const datosFrase = FRASES_JUEGO[fraseActualIndex];
    const pantallaPalabra = document.getElementById('palabra-pantalla');
    pantallaPalabra.className = "palabra-actual";
    if (datosFrase.palabraMarcada) {
        pantallaPalabra.innerHTML = htmlPalabraConPronunciacion(datosFrase.palabraMarcada);
    } else {
        pantallaPalabra.innerText = datosFrase.palabra;
    }
    
    let contenedorVisual = document.getElementById('secuencia-visual');
    contenedorVisual.innerHTML = "";
    
    // CORRECCIÓN CLAVE: Extraemos strictly la primera nota de texto (índice 0) de la lista
    let primeraNotaIngles = (datosFrase.notesIngles && datosFrase.notesIngles.length > 0) ? datosFrase.notesIngles[0] : "D4";
    let letraPrimera = primeraNotaIngles.replace(/[0-9]/g, '').trim().toUpperCase();
    let octavaPrimera = parseInt(primeraNotaIngles.replace(/[^0-9]/g, '')) || 4;
    
    if (letraPrimera === "DB") letraPrimera = "C#";
    if (letraPrimera === "EB") letraPrimera = "D#";
    if (letraPrimera === "GB") letraPrimera = "F#";
    if (letraPrimera === "AB") letraPrimera = "G#";
    if (letraPrimera === "BB") letraPrimera = "A#";
    
    let valorMidiPrimeraReferencia = (octavaPrimera * 12) + MAPA_NOTAS_A_NUMERO[letraPrimera.toLowerCase()];
    
    datosFrase.notesIngles.forEach((notaIngles, idx) => {
        let notaEspanol = datosFrase.notes[idx];
        let duracionNota = datosFrase.duraciones[idx] || 0.4;
        let silabaTexto = datosFrase.silabas[idx] || "...";
        
        let bloque = document.createElement('div');
        bloque.className = "nota-bloque";
        
        let divSilaba = document.createElement('div');
        divSilaba.className = "caja-silaba";
        divSilaba.innerText = silabaTexto;
        
        let cajaNota = document.createElement('div');
        cajaNota.className = `nota-caja ${idx === 0 ? 'activa' : ''}`;
        cajaNota.id = `caja-nota-${idx}`;
        cajaNota.innerText = notaEspanol;

        let flechaAguda = document.createElement('div');
        flechaAguda.className = "flecha-afinacion flecha-aguda";
        flechaAguda.setAttribute("aria-hidden", "true");

        let flechaGrave = document.createElement('div');
        flechaGrave.className = "flecha-afinacion flecha-grave";
        flechaGrave.setAttribute("aria-hidden", "true");
        cajaNota.style.cursor = "pointer";
        
            cajaNota.onclick = () => {
            if (modoEscucha) {
                if (estadoEscucha === 'pausada') {
                    silenciarSonidoEscucha();
                    sonarNota(notaIngles, Math.max(duracionNota, 0.4), VOLUMEN_MELODIA_GUIA);
                }
                return;
            }
            if (reproduciendoGuia || modoKaraoke) return;
            if (cajaNota.classList.contains('atascada') && idx === notaSecuenciaIndex) {
                explicarNotaAtascada(notaIngles);
                return;
            }
            tocarNotaIndividualUsuario(notaIngles, cajaNota, idx, palabraMostradaIndex);
        };
        
        let anchoCalculado = 45 + (duracionNota * 60); 
        cajaNota.style.width = `${anchoCalculado}px`;
        cajaNota.style.boxSizing = "border-box";
        cajaNota.style.textAlign = "center";
        
        let letraActual = notaIngles.replace(/[0-9]/g, '').trim().toUpperCase();
        let octavaActual = parseInt(notaIngles.replace(/[^0-9]/g, '')) || 4;
        
        if (letraActual === "DB") letraActual = "C#";
        if (letraActual === "EB") letraActual = "D#";
        if (letraActual === "GB") letraActual = "F#";
        if (letraActual === "AB") letraActual = "G#";
        if (letraActual === "BB") letraActual = "A#";
        
        if (valorMidiPrimeraReferencia !== undefined && MAPA_NOTAS_A_NUMERO[letraActual.toLowerCase()] !== undefined) {
            let valorMidiActual = (octavaActual * 12) + MAPA_NOTAS_A_NUMERO[letraActual.toLowerCase()];
            bloque.dataset.semitonos = String(valorMidiActual - valorMidiPrimeraReferencia);
        }

        bloque.appendChild(divSilaba);
        bloque.appendChild(flechaAguda);
        bloque.appendChild(cajaNota);
        bloque.appendChild(flechaGrave);
        contenedorVisual.appendChild(bloque);
    });

    // Un semitono separa las celdas media altura de celda. El margen reserva
    // ese desplazamiento, porque translateY no ocupa sitio en la fila.
    const celdasAltura = contenedorVisual.querySelector('.nota-caja');
    const altoCelda = (celdasAltura && celdasAltura.offsetHeight) || 40;
    const pxPorSemitono = altoCelda / 2;
    const bloquesAltura = [...contenedorVisual.querySelectorAll('.nota-bloque')];
    let maxArriba = 0;
    let maxAbajo = 0;
    const desplazamientos = bloquesAltura.map(bloque => {
        const y = -Number(bloque.dataset.semitonos || 0) * pxPorSemitono;
        maxArriba = Math.max(maxArriba, -y);
        maxAbajo = Math.max(maxAbajo, y);
        return y;
    });
    bloquesAltura.forEach((bloque, i) => {
        bloque.style.marginTop = maxArriba + "px";
        bloque.style.marginBottom = maxAbajo + "px";
        bloque.style.transform = `translateY(${desplazamientos[i]}px)`;
    });

    reiniciarAyudaNota();

    if (!sinGuia) {
        const tNota = datosFrase.tiempos[0];
        const anticipo = anticipoAntesDe(tNota, finMelodiaAntesDe(tNota));
        inicioCantoMs = performance.now() + anticipo * 1000 + duracionGuiaMs(datosFrase);
        armarRelojNotaEntrenamiento(inicioCantoMs);
        idGuia++;
        const idEstaGuia = idGuia;
        reproduciendoGuia = true;
        const reloj = { t0: performance.now(), tiempoBase: tNota - anticipo };
        programarAcompanamiento(reloj, idEstaGuia, () => idEstaGuia === idGuia, finFrase(datosFrase));
        if (anticipo > 0.02) {
            setTimeout(() => {
                if (idEstaGuia !== idGuia) return;
                reproducirCadenaNotasGuia(datosFrase.notesIngles, datosFrase.duraciones, 0, idEstaGuia, datosFrase.tiempos);
            }, anticipo * 1000);
        } else {
            reproducirCadenaNotasGuia(datosFrase.notesIngles, datosFrase.duraciones, 0, idEstaGuia, datosFrase.tiempos);
        }
    }
}

// ==========================================
// NAVEGACIÓN ENTRE PALABRAS (flechas)
// ==========================================
function cancelarTemporizadores() {
    clearTimeout(temporizadorSiguientePalabra);
    temporizadorSiguientePalabra = null;
    idGuia++;                 // invalida la guía que esté sonando
    reproduciendoGuia = false;
    modoCalibracion = false;
    muestrasCalibracion = [];
    esperandoSiguientePalabra = false;
    clearTimeout(temporizadorEscucha);
    temporizadorEscucha = null;
    clearTimeout(temporizadorKaraoke);
    temporizadorKaraoke = null;
    pendienteKaraoke = null;
    pasoCuentaKaraoke = null;
    cancelarAcompanamiento();
    limpiarSilencioEscucha();
    silenciarSonidoEscucha();
    modoEscucha = false;
    modoKaraoke = false;
    notaEnJuicio = null;
    repasoActivo = false;
    actualizarControlesKaraoke();
    actualizarLucesCompas();
}

function actualizarFlechas() {
    const btnAnt = document.getElementById('btn-anterior');
    const btnSig = document.getElementById('btn-siguiente');
    if (!btnAnt || !btnSig) return;
    // En karaoke la canción va sola de principio a fin: las flechas cambiarían la cuenta.
    if (modoKaraoke) {
        btnAnt.style.visibility = 'hidden';
        btnSig.style.visibility = 'hidden';
        return;
    }
    // visibility (y no display) para que la palabra no se desplace al ocultarlas
    btnAnt.style.visibility = (palabraMostradaIndex > 0 && FRASES_JUEGO.length > 0) ? 'visible' : 'hidden';
    btnSig.style.visibility = (palabraMostradaIndex < FRASES_JUEGO.length - 1) ? 'visible' : 'hidden';
}

function irAPalabra(nuevoIndice) {
    if (modoCalibracion) return;
    if (nuevoIndice < 0 || nuevoIndice >= FRASES_JUEGO.length) return;
    if (modoEscucha) { irAPalabraEnEscucha(nuevoIndice); return; }
    cancelarTemporizadores();
    fraseActualIndex = nuevoIndice;
    document.getElementById('evaluacion').innerText = "";
    document.getElementById('zona-reinicio').style.display = "none";
    cargarNuevaFrasePalabra();
}

// Durante un silencio largo (modo escucha), fraseActualIndex ya apunta a la palabra que viene después:
// ◀ vuelve a la última palabra cantada y ▶ salta el silencio.
function irAPalabraAnterior() { irAPalabra(modoEscucha && enSilencio ? fraseActualIndex - 1 : palabraMostradaIndex - 1); }
function irAPalabraSiguiente() { irAPalabra(modoEscucha && enSilencio ? fraseActualIndex : palabraMostradaIndex + 1); }

// Atajos de teclado: ← y →
document.addEventListener('keydown', (e) => {
    if (document.getElementById('status-box').style.display !== 'block') return;
    if (e.key === 'ArrowLeft') irAPalabraAnterior();
    if (e.key === 'ArrowRight') irAPalabraSiguiente();
});

function reproducirCadenaNotasGuia(listaNotas, listaDuraciones, indiceNota, idEjecucion, listaTiempos, inicioMs) {
    if (idEjecucion !== idGuia) return; // se navegó a otra palabra: esta guía ya no vale
    if (indiceNota >= listaNotas.length) {
        setTimeout(() => { 
            if (idEjecucion === idGuia) reproduciendoGuia = false; 
        }, 300);
        return;
    }

    reproduciendoGuia = true;

    // Si no hay instantes de inicio, se encadenan las duraciones
    if (!listaTiempos) {
        listaTiempos = [];
        let acumulado = 0;
        listaDuraciones.forEach(d => { listaTiempos.push(acumulado); acumulado += (d || 0.4); });
    }
    if (inicioMs === undefined) inicioMs = performance.now();   // referencia del reloj (primera nota)

    const duracionOriginal = listaDuraciones[indiceNota] || 0.4;
    const esUltima = (indiceNota + 1 >= listaNotas.length);

    // Cuánto suena la nota: su duración original, alargada algo (sin pasarse) para oírla mejor
    let sonido = duracionOriginal;
    if (esUltima) {
        sonido = Math.max(duracionOriginal, GUIA_DURACION_MINIMA_ULTIMA);
    } else {
        const hastaSiguiente = listaTiempos[indiceNota + 1] - listaTiempos[indiceNota];
        sonido = Math.max(duracionOriginal, Math.min(GUIA_PROPORCION_SOSTENIDO * hastaSiguiente, GUIA_SOSTENIDO_MAXIMO));
    }
    sonarNota(listaNotas[indiceNota], sonido, VOLUMEN_MELODIA_GUIA);

    // La siguiente nota empieza cuando le toca según el MIDI (no cuando acaba ésta):
    // así se conservan el ritmo y los silencios. Se mide desde el inicio para no acumular retraso.
    const tiempoSiguiente = esUltima ? (listaTiempos[indiceNota] + sonido) : listaTiempos[indiceNota + 1];
    const esperaMs = Math.max(0, (tiempoSiguiente - listaTiempos[0]) * 1000 - (performance.now() - inicioMs));

    setTimeout(() => {
        reproducirCadenaNotasGuia(listaNotas, listaDuraciones, indiceNota + 1, idEjecucion, listaTiempos, inicioMs);
    }, esperaMs);
}

function tocarNotaIndividualUsuario(nombreNotaIngles, elementoCaja, idxSilaba, idxPalabra) {
    reproduciendoGuia = true;
    const idLocal = ++idGuia; // si se navega o se sale al menú, este temporizador queda anulado
    elementoCaja.className = "nota-caja activa";

    const oscBase = audioContext.createOscillator();
    const oscHarm = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscBase.type = 'sine';
    oscHarm.type = 'sine';

    let notaLetra = nombreNotaIngles.replace(/[0-9]/g, '').trim().toUpperCase();
    let numeroOctava = parseInt(nombreNotaIngles.replace(/[^0-9]/g, '')) || 4;

    if (notaLetra === "DB") notaLetra = "C#";
    if (notaLetra === "EB") notaLetra = "D#";
    if (notaLetra === "GB") notaLetra = "F#";
    if (notaLetra === "AB") notaLetra = "G#";
    if (notaLetra === "BB") notaLetra = "A#";

    let hzBase = FRECUENCIAS_BASE_OCTAVA_0[notaLetra] || 18.35;
    let frecuenciaCalculada = hzBase * Math.pow(2, numeroOctava);

    oscBase.frequency.value = frecuenciaCalculada;
    oscHarm.frequency.value = frecuenciaCalculada * 2;

    gainNode.gain.setValueAtTime(0.35, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.35, audioContext.currentTime + 0.85);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.0);

    oscBase.connect(gainNode);
    oscHarm.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscBase.start();
    oscHarm.start();
    oscBase.stop(audioContext.currentTime + 1.0);
    oscHarm.stop(audioContext.currentTime + 1.0);

    setTimeout(() => {
        if (idLocal !== idGuia) return;
        reproduciendoGuia = false;
        // Tras oír la sílaba, hay que cantar la palabra desde ella
        reiniciarDesdeSilaba(idxSilaba, idxPalabra);
    }, 1000);
}

// Reinicia la palabra actual para cantarla desde la sílaba indicada
function reiniciarDesdeSilaba(idxSilaba, idxPalabra) {
    // Si la palabra ya se completó (o se cambió de palabra), no tocar nada
    if (idxPalabra !== fraseActualIndex || idxPalabra !== palabraMostradaIndex) return;
    const datosFrase = FRASES_JUEGO[idxPalabra];
    if (!datosFrase) return;

    for (let i = 0; i < datosFrase.notes.length; i++) {
        const caja = document.getElementById(`caja-nota-${i}`);
        if (!caja) continue;
        if (i < idxSilaba) {
            // Las anteriores no se exigen: se conservan si estaban completadas
            if (!caja.classList.contains('completada')) caja.className = "nota-caja";
        } else {
            caja.className = (i === idxSilaba) ? "nota-caja activa" : "nota-caja";
        }
    }

    notaSecuenciaIndex = idxSilaba;
    muestrasConsecutivasBien = 0;
    ultimaNotaValidadaTexto = "";
    armarRelojNotaEntrenamiento(performance.now());
    reiniciarAyudaNota();
    limpiarDireccionesAfinacion();
    document.getElementById('evaluacion').innerText = "";
}

// ▼ encima de la celda si la voz va aguda; ▲ debajo si va grave.
// Dentro de la tolerancia no se muestra ninguna.
function marcarDireccionAfinacion(caja, direccion, intensidad) {
    if (!caja) return;
    const bloque = caja.parentElement;
    if (!bloque) return;
    const aguda = bloque.querySelector('.flecha-aguda');
    const grave = bloque.querySelector('.flecha-grave');
    if (aguda) aguda.className = "flecha-afinacion flecha-aguda" + (direccion === 'aguda' ? ` visible ${intensidad}` : "");
    if (grave) grave.className = "flecha-afinacion flecha-grave" + (direccion === 'grave' ? ` visible ${intensidad}` : "");
}

function limpiarDireccionesAfinacion() {
    document.querySelectorAll('.flecha-afinacion.visible').forEach(el => {
        el.classList.remove('visible', 'leve', 'fuerte');
    });
}

function reiniciarAyudaNota() {
    msIntentandoNota = 0;
    ultimoMsVoz = 0;
    ayudaNotaLista = false;
    notaCantadaAyuda = null;
}

// Solo cuenta el tiempo con voz. Un silencio pone el reloj en pausa, no a cero.
function acumularIntentoNota(hayVoz) {
    const ahora = performance.now();
    if (!hayVoz) {
        ultimoMsVoz = 0;
        return;
    }
    if (ultimoMsVoz > 0) {
        const transcurrido = ahora - ultimoMsVoz;
        if (transcurrido > 0 && transcurrido < 250) msIntentandoNota += transcurrido;
    }
    ultimoMsVoz = ahora;
    if (msIntentandoNota >= AYUDA_NOTA_MS) ayudaNotaLista = true;
}

function claseCaja(base) {
    return ayudaNotaLista ? base + " atascada" : base;
}

function recordarNotaCantada(frecuencia, desviacionCents, notaObjetivoIngles) {
    const midiCantado = Math.round(69 + 12 * Math.log2(frecuencia / 440));
    const midiObjetivo = midiDesdeNombreIngles(notaObjetivoIngles);
    const objetivoMasAgudo = midiCantado === midiObjetivo ? desviacionCents < 0 : midiObjetivo > midiCantado;
    const octavaCantada = Math.floor(midiCantado / 12) - 1;
    notaCantadaAyuda = {
        nombre: nombreEspanolDesdeMidi(midiCantado),
        ingles: NOMBRES_NOTA_INGLES[((midiCantado % 12) + 12) % 12] + octavaCantada,
        objetivo: nombreEspanolDesdeMidi(midiObjetivo),
        objetivoMasAgudo
    };
}

function explicarNotaAtascada(notaObjetivoIngles) {
    if (!notaCantadaAyuda) return;
    reproduciendoGuia = true;
    const idLocal = ++idGuia;
    const cantada = notaCantadaAyuda;
    const comparacion = cantada.objetivoMasAgudo ? "más aguda" : "más grave";
    document.getElementById('evaluacion').innerHTML =
        `Estás cantando <strong>${cantada.nombre}</strong> y tienes que cantar <strong>${cantada.objetivo}</strong>, que es ${comparacion}.`;
    sonarNota(cantada.ingles, 1);
    setTimeout(() => {
        if (idLocal !== idGuia) return;
        sonarNota(notaObjetivoIngles, 2);
    }, 1000);
    setTimeout(() => {
        if (idLocal !== idGuia) return;
        reproduciendoGuia = false;
    }, 3000);
}
// Igual que en karaoke: la nota ocupa su duración (o hasta que empieza la siguiente).
// Hasta entonces no se valora la que viene, aunque esta ya esté verde.
function duracionNotaEntrenamiento(datos, indice) {
    const inicio = datos.tiempos[indice] || 0;
    const finNatural = inicio + (datos.duraciones[indice] || 0.4);
    const siguiente = datos.tiempos[indice + 1];
    const fin = (typeof siguiente === "number") ? Math.min(finNatural, siguiente) : finNatural;
    return Math.max(0.12, fin - inicio);
}

function armarRelojNotaEntrenamiento(desdeMs) {
    const datos = FRASES_JUEGO[fraseActualIndex];
    notaEntrenamientoSuperada = false;
    if (!datos || notaSecuenciaIndex >= datos.notes.length) {
        finNotaEntrenamientoMs = desdeMs;
        return;
    }
    finNotaEntrenamientoMs = desdeMs + duracionNotaEntrenamiento(datos, notaSecuenciaIndex) * 1000;
}

function marcarNotaEntrenamientoSuperada(caja) {
    if (notaEntrenamientoSuperada) return;
    notaEntrenamientoSuperada = true;
    reiniciarAyudaNota();
    if (caja) {
        caja.className = "nota-caja completada";
        marcarDireccionAfinacion(caja, null);
    }
}

function avanzarNotaEntrenamiento() {
    const datos = FRASES_JUEGO[fraseActualIndex];
    if (!datos) return;
    notaEntrenamientoSuperada = false;
    muestrasConsecutivasBien = 0;
    notaSecuenciaIndex++;

    if (notaSecuenciaIndex >= datos.notes.length) {
        document.getElementById('evaluacion').innerHTML = "<span class='success'>¡Palabra correcta! ✨</span>";
        registrarTiempoPalabra(fraseActualIndex);
        fraseActualIndex++;
        if (repasoActivo) {
            repasoActivo = false;
            fraseActualIndex = FRASES_JUEGO.length;
        } else if (fraseActualIndex >= FRASES_JUEGO.length) {
            anotarCancionEstudiadaHoy();
        }
        ultimaNotaValidadaTexto = "";
        esperandoSiguientePalabra = true;
        temporizadorSiguientePalabra = setTimeout(() => {
            document.getElementById('evaluacion').innerText = "";
            cargarNuevaFrasePalabra();
        }, 800);
        return;
    }

    const siguienteCaja = document.getElementById(`caja-nota-${notaSecuenciaIndex}`);
    if (siguienteCaja) siguienteCaja.className = "nota-caja activa";
    armarRelojNotaEntrenamiento(performance.now());
}

function bucleDeAudio() {
    requestAnimationFrame(bucleDeAudio);
    if (modoCalibracion) { procesarCalibracion(); return; }
    if (modoKaraoke || modoEscucha) {
        actualizarLucesCompas();
        if (modoKaraoke) procesarKaraoke();
        return;
    }
    if (reproduciendoGuia || esperandoSiguientePalabra) return;

    if (fraseActualIndex >= FRASES_JUEGO.length) return; 

    const datosFraseActual = FRASES_JUEGO[fraseActualIndex];
    const notaAInterpretar = datosFraseActual.notes[notaSecuenciaIndex];
    const notaAInterpretarIngles = datosFraseActual.notesIngles[notaSecuenciaIndex];
    if (!notaAInterpretar || !notaAInterpretarIngles) return; // seguridad: índice fuera de la palabra

    if (notaEntrenamientoSuperada) {
        if (performance.now() >= finNotaEntrenamientoMs) avanzarNotaEntrenamiento();
        return;
    }

    analyser.getFloatTimeDomainData(dataArray);
    const frecuencia = autoCorrelacion(dataArray, audioContext.sampleRate);

    if (frecuencia === -1 || frecuencia <= 60 || frecuencia >= 1000) {
        ultimaNotaValidadaTexto = "";
        acumularIntentoNota(false);
        const cajaSilencio = document.getElementById(`caja-nota-${notaSecuenciaIndex}`);
        marcarDireccionAfinacion(cajaSilencio, null);
        return;
    }

    if (frecuencia > 60 && frecuencia < 1000) {
        const valorMidiUsuario = 69 + 12 * Math.log2(frecuencia / 440);
        const notaUsuarioTexto = hzANombreEspanol(frecuencia);

        acumularIntentoNota(true);

        let letraIngles = notaAInterpretarIngles.replace(/[0-9]/g, '').trim().toUpperCase();
        let octavaObjetivo = parseInt(notaAInterpretarIngles.replace(/[^0-9]/g, '')) || 4;
        
        if (letraIngles === "DB") letraIngles = "C#";
        if (letraIngles === "EB") letraIngles = "D#";
        if (letraIngles === "GB") letraIngles = "F#";
        if (letraIngles === "AB") letraIngles = "G#";
        if (letraIngles === "BB") letraIngles = "A#";

        const hzBaseObjetivo = FRECUENCIAS_BASE_OCTAVA_0[letraIngles] || 18.35;
        const frecuenciaObjetivoExacta = hzBaseObjetivo * Math.pow(2, octavaObjetivo);

        const midiObjetivoPerfecto = 69 + 12 * Math.log2(frecuenciaObjetivoExacta / 440);
        let desviacionCents = (valorMidiUsuario - midiObjetivoPerfecto) * 100;

        let cajaActiva = document.getElementById(`caja-nota-${notaSecuenciaIndex}`);
        let absDesviacion = Math.abs(desviacionCents);
        const margen = aplicarToleranciaDelMenu();

        if (absDesviacion <= margen) {
            // AFINACIÓN CORRECTA (ZONA DE ESCUCHA ACTIVA)
            muestrasConsecutivasBien++;
            if (cajaActiva) {
                cajaActiva.className = claseCaja("nota-caja activa");
                marcarDireccionAfinacion(cajaActiva, null);
            }

            if (muestrasConsecutivasBien >= MUESTRAS_NECESARIAS) {
                ultimaNotaValidadaTexto = notaUsuarioTexto;
                marcarNotaEntrenamientoSuperada(cajaActiva);
                if (performance.now() >= finNotaEntrenamientoMs) avanzarNotaEntrenamiento();
            }
        } else {
            // DESVIACIÓN DE AFINACIÓN fuera del rango elástico base
            muestrasConsecutivasBien = 0;
            if (notaUsuarioTexto !== "..." && notaUsuarioTexto !== ultimaNotaValidadaTexto) {
                ultimaNotaValidadaTexto = "";
            }

        
            recordarNotaCantada(frecuencia, desviacionCents, notaAInterpretarIngles);
            if (cajaActiva) {
                // --- AJUSTE DEFINITIVO: AMARILLO FIJO A TOLERANCIA + 15 CENTS ---
                const intensidad = absDesviacion <= (margen + 15) ? "leve" : "fuerte";
                if (intensidad === "leve") {
                    cajaActiva.className = claseCaja("nota-caja umbral-amarillo"); // Rango intermedio visible
                } else {
                    cajaActiva.className = claseCaja("nota-caja umbral-rojo");     // Fuera del amarillo (Alerta roja)
                }
                marcarDireccionAfinacion(cajaActiva, desviacionCents > 0 ? "aguda" : "grave", intensidad);
            }
            document.getElementById('evaluacion').innerText = ""; 
        }
    }
}

// ==========================================
// PRIMERA NOTA LIBRE + TRANSPOSICIÓN
// ==========================================
function midiDesdeNombreIngles(nombre) {
    let letra = nombre.replace(/[0-9]/g, '').trim().toUpperCase();
    const octava = parseInt(nombre.replace(/[^0-9]/g, '')) || 4;
    const bemoles = { "DB": "C#", "EB": "D#", "GB": "F#", "AB": "G#", "BB": "A#" };
    if (bemoles[letra]) letra = bemoles[letra];
    return (octava + 1) * 12 + MAPA_NOTAS_A_NUMERO[letra.toLowerCase()];
}

function nombreEspanolDesdeMidi(midi) {
    return NOMBRES_NOTA_ESPANOL[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function iniciarCalibracion() {
    modoCalibracion = true;
    muestrasCalibracion = [];
    reproduciendoGuia = false;

    document.getElementById('btn-anterior').style.visibility = 'hidden';
    document.getElementById('btn-siguiente').style.visibility = 'hidden';
    document.getElementById('zona-reinicio').style.display = 'none';
    document.getElementById('palabra-pantalla').innerText = "🎤 Canta tu primera nota";
    document.getElementById('secuencia-visual').innerHTML =
        "<div style='font-size:16px; color:#aaa; line-height:1.5; max-width:420px;'>" +
        "Elige una nota cómoda y grave y mantenla un momento. " +
        "La canción partirá de ella y llegará como máximo una octava por encima.</div>";
    document.getElementById('evaluacion').innerText = "Esperando tu voz...";
}

function procesarCalibracion() {
    const mensaje = document.getElementById('evaluacion');
    analyser.getFloatTimeDomainData(dataArray);
    const frecuencia = autoCorrelacion(dataArray, audioContext.sampleRate);

    if (frecuencia === -1 || frecuencia < 60 || frecuencia > 1000) {
        muestrasCalibracion = [];
        return;
    }

    muestrasCalibracion.push(69 + 12 * Math.log2(frecuencia / 440));
    if (muestrasCalibracion.length > MUESTRAS_CALIBRACION) muestrasCalibracion.shift();
    if (muestrasCalibracion.length < MUESTRAS_CALIBRACION) {
        mensaje.innerText = "Detectando tu nota...";
        return;
    }

    const maximo = Math.max(...muestrasCalibracion);
    const minimo = Math.min(...muestrasCalibracion);
    if (maximo - minimo > 0.7) {
        mensaje.innerText = "Mantén la nota estable...";
        return;
    }

    const media = muestrasCalibracion.reduce((a, b) => a + b, 0) / muestrasCalibracion.length;
    const notaMidi = Math.round(media);
    const nombre = nombreEspanolDesdeMidi(notaMidi);

    if (notaMidi < MIDI_MIN_PRIMERA_NOTA || notaMidi > MIDI_MAX_PRIMERA_NOTA) {
        mensaje.innerText = `${nombre} queda fuera de rango. Prueba con una nota entre ${nombreEspanolDesdeMidi(MIDI_MIN_PRIMERA_NOTA)} y ${nombreEspanolDesdeMidi(MIDI_MAX_PRIMERA_NOTA)}.`;
        muestrasCalibracion = [];
        return;
    }

    // Nota válida: transponer la canción y empezar
    modoCalibracion = false;
    muestrasCalibracion = [];
    reproduciendoGuia = true; // pausa la evaluación hasta que arranque la primera palabra
    transponerCancionAPrimeraNota(notaMidi);
    document.getElementById('secuencia-visual').innerHTML = "";
    mensaje.innerHTML = `<span class='success'>✔ Primera nota: ${nombre}. ¡Empezamos!</span>`;

    temporizadorSiguientePalabra = setTimeout(() => {
        mensaje.innerText = "";
        if (modoSolicitado === 'karaoke') iniciarKaraokeDesde(0);
        else cargarNuevaFrasePalabra();
    }, 1200);
}

function transponerCancionAPrimeraNota(midiPrimeraNota) {
    const midiOriginal = midiDesdeNombreIngles(FRASES_JUEGO[0].notesIngles[0]);
    const desplazamiento = midiPrimeraNota - midiOriginal;

    FRASES_JUEGO.forEach(palabra => {
        const midis = palabra.notesIngles.map(n => midiDesdeNombreIngles(n) + desplazamiento);
        palabra.notesIngles = midis.map(m => NOMBRES_NOTA_INGLES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1));
        palabra.notes = midis.map(m => NOMBRES_NOTA_ESPANOL[((m % 12) + 12) % 12]);
    });
}

// ==========================================
// DIFICULTAD PROPUESTA SEGÚN LA CANCIÓN
// ==========================================
function alCambiarCancion() {
    const slider = document.getElementById('selector-dificultad');
    slider.value = DIFICULTAD_INICIAL;
    actualizarTextoDificultad(slider.value);
}
document.addEventListener('DOMContentLoaded', alCambiarCancion);

// ==========================================
// AUDIO: CONTEXTO Y MICRÓFONO
// ==========================================
function asegurarAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function esTelefono() {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
    // iPadOS se presenta como Mac, pero tiene pantalla táctil.
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

async function abrirStreamMicrofono() {
    // En el Mac, Chrome y Safari quitan del micrófono lo que suena por el altavoz.
    // En el karaoke esa melodía es la misma que la voz, así que también se la llevan
    // y la nota no llega a ponerse verde. En el teléfono no pasa, y sin la subida
    // automática de volumen hay que cantar muy fuerte para que el micrófono entre.
    const pedidos = esTelefono()
        ? [{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }]
        : [
            { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false },
            { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        ];
    let ultimoError = null;
    for (const audio of pedidos) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio });
            const pista = stream.getAudioTracks()[0];
            if (pista && pista.applyConstraints) {
                try { await pista.applyConstraints(audio); } catch (e) { /* el navegador no aplica alguno */ }
            }
            return stream;
        } catch (e) {
            ultimoError = e;
            if (e.name !== "OverconstrainedError" && e.name !== "ConstraintNotSatisfiedError") throw e;
        }
    }
    throw ultimoError;
}

async function asegurarMicrofono() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error = new Error("Este navegador no deja usar el micrófono desde esta dirección.");
        error.name = "SecurityError";
        throw error;
    }
    asegurarAudioContext();
    if (!analyser) {
        streamMicrofono = await abrirStreamMicrofono();
        source = audioContext.createMediaStreamSource(streamMicrofono);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        dataArray = new Float32Array(analyser.fftSize);
        source.connect(analyser);
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}

let pruebaMicroActiva = false;
let idPruebaMicro = 0;
let microYaOido = false;

function nivelRms(buffer) {
    let suma = 0;
    for (let i = 0; i < buffer.length; i++) suma += buffer[i] * buffer[i];
    return Math.sqrt(suma / buffer.length);
}

function mensajeErrorMicro(err) {
    const nombre = err && err.name;
    if (nombre === "NotAllowedError" || nombre === "PermissionDeniedError") {
        return "El navegador ha bloqueado el micrófono. Permítelo en la barra de dirección y pulsa otra vez.";
    }
    if (nombre === "NotFoundError" || nombre === "DevicesNotFoundError") {
        return "No hay ningún micrófono conectado.";
    }
    if (nombre === "NotReadableError" || nombre === "TrackStartError") {
        return "El micrófono está en uso por otro programa.";
    }
    if (nombre === "SecurityError") {
        return err.message;
    }
    return "No se ha podido abrir el micrófono." + (err && err.message ? " " + err.message : "");
}

function detenerPruebaMicrofono() {
    pruebaMicroActiva = false;
    idPruebaMicro++;
}

function ocultarResultadoMicrofono() {
    detenerPruebaMicrofono();
    microYaOido = false;
    const caja = document.getElementById("resultado-micro");
    if (caja) caja.hidden = true;
    const texto = document.getElementById("texto-micro");
    if (texto) {
        texto.className = "texto-micro";
        texto.textContent = "Pulsa y canta o habla un momento.";
    }
    const nivel = document.getElementById("nivel-micro");
    if (nivel) nivel.style.width = "0%";
}

function mostrarCalentamientos() {
    ocultarResultadoMicrofono();
    document.body.classList.add("vista-calentamiento");
    document.getElementById("lista-calentamiento").hidden = false;
}

function cerrarCalentamientos() {
    document.body.classList.remove("vista-calentamiento");
    document.getElementById("lista-calentamiento").hidden = true;
    document.getElementById("botones-inicio").style.display = "flex";
}

function volverACalentamientos() {
    ocultarResultadoMicrofono();
    cancelarTemporizadores();
    document.getElementById("titulo-cancion").style.display = "none";
    document.getElementById("controles-escucha").style.display = "none";
    document.getElementById("controles-karaoke").style.display = "none";
    document.getElementById("status-box").style.display = "none";
    document.getElementById("evaluacion").innerHTML = "";
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("palabra-pantalla").innerText = "...";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("zona-seleccion").style.display = "block";
    document.getElementById("botones-inicio").style.display = "none";
    document.getElementById("btn-volver-calentamiento").hidden = true;
    document.body.classList.add("vista-calentamiento");
    document.getElementById("lista-calentamiento").hidden = false;
}

function empezarCalentamiento(numero) {
    if (numero < 1 || numero > 5) return;
    piezaPendiente = "Calentamiento " + numero;
    document.getElementById("lista-calentamiento").hidden = true;
    iniciarApp("karaoke");
}

async function probarMicrofono() {
    const texto = document.getElementById("texto-micro");
    const caja = document.getElementById("resultado-micro");
    caja.hidden = false;
    texto.className = "texto-micro";
    texto.textContent = "Pidiendo permiso al micrófono…";
    document.getElementById("nivel-micro").style.width = "0%";
    try {
        await asegurarMicrofono();
        const pista = streamMicrofono && streamMicrofono.getAudioTracks()[0];
        if (pista && (pista.muted || pista.readyState !== "live")) {
            texto.className = "texto-micro error";
            texto.textContent = "El micrófono está abierto, pero la pista no está en marcha.";
            return;
        }
        const nombre = pista && pista.label ? pista.label : "el micrófono";
        texto.textContent = `«${nombre}» está abierto. Canta o habla: la barra tiene que moverse.`;
        microYaOido = false;
        pruebaMicroActiva = true;
        const id = ++idPruebaMicro;
        buclePruebaMicro(id);
    } catch (err) {
        detenerPruebaMicrofono();
        texto.className = "texto-micro error";
        texto.textContent = mensajeErrorMicro(err);
    }
}

function buclePruebaMicro(id) {
    if (!pruebaMicroActiva || id !== idPruebaMicro || !analyser) return;
    analyser.getFloatTimeDomainData(dataArray);
    const rms = nivelRms(dataArray);
    document.getElementById("nivel-micro").style.width = Math.min(100, Math.round(rms * 450)) + "%";

    const texto = document.getElementById("texto-micro");
    if (rms >= 0.01) {
        microYaOido = true;
        const frecuencia = autoCorrelacion(dataArray, audioContext.sampleRate);
        let nota = "";
        if (frecuencia > 60 && frecuencia < 1000) {
            const midi = Math.round(69 + 12 * Math.log2(frecuencia / 440));
            nota = nombreEspanolDesdeMidi(midi);
        }
        texto.className = "texto-micro ok";
        texto.textContent = nota
            ? `Te oigo. Estás en ${nota}. El micrófono funciona.`
            : "Te oigo. El micrófono funciona.";
    } else if (!microYaOido) {
        texto.className = "texto-micro";
        texto.textContent = "El micrófono está abierto, pero aún no llega voz. Acércate y canta.";
    }
    requestAnimationFrame(() => buclePruebaMicro(id));
}

// ==========================================
// MODO ESCUCHA SOLO
// ==========================================
// Suena la canción entera, palabra tras palabra, con el ritmo real del MIDI
// (incluidos los silencios) y sin parar al final de cada palabra.

// Pistas posteriores a la melodía: se oyen, pero no se asignan a sílabas.
function acordesDe(datosNotas, pistaMelodia) {
    const sueltos = [];
    const pistas = (datosNotas.tracks || []).filter(t => t !== pistaMelodia && t.notes && t.notes.length);
    pistas.forEach(pista => {
        pista.notes.forEach(n => {
            const nombre = n.name || n.note;
            if (!nombre || typeof n.time !== "number") return;
            sueltos.push({ time: n.time, duracion: n.duration || 0.4, nombre });
        });
    });
    sueltos.sort((a, b) => a.time - b.time);
    const grupos = [];
    sueltos.forEach(n => {
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && Math.abs(ultimo.time - n.time) < 0.001) {
            ultimo.notas.push(n.nombre);
            ultimo.duracion = Math.max(ultimo.duracion, n.duracion);
        } else {
            grupos.push({ time: n.time, duracion: n.duracion, notas: [n.nombre] });
        }
    });
    return grupos;
}

function finFrase(frase) {
    const n = frase.tiempos.length - 1;
    return frase.tiempos[n] + (frase.duraciones[n] || 0.4);
}

// Fin de la última nota cantada que empieza antes de este instante.
function finMelodiaAntesDe(tiempo) {
    let fin = 0;
    for (const frase of FRASES_JUEGO) {
        for (let i = 0; i < frase.tiempos.length; i++) {
            if (frase.tiempos[i] >= tiempo - 0.001) return fin;
            fin = Math.max(fin, frase.tiempos[i] + (frase.duraciones[i] || 0.4));
        }
    }
    return fin;
}

// Segundos de acorde que hay que oír antes de la nota cantada.
function anticipoAntesDe(tiempoNota, tiempoAnterior) {
    let primero = null;
    for (const acorde of acompanamiento) {
        if (acorde.time < tiempoAnterior - 0.001) continue;
        if (acorde.time >= tiempoNota - 0.001) break;
        if (primero === null || acorde.time < primero) primero = acorde.time;
    }
    return primero === null ? 0 : tiempoNota - primero;
}

function cancelarAcompanamiento() {
    temporizadoresAcompanamiento.forEach(t => clearTimeout(t));
    temporizadoresAcompanamiento = [];
}

function programarAcompanamiento(reloj, idEjecucion, activo, hastaTiempo, velocidad) {
    const ritmo = velocidad || 1;
    cancelarAcompanamiento();
    acompanamiento.forEach(acorde => {
        if (acorde.time < reloj.tiempoBase - 0.001) return;
        if (hastaTiempo != null && acorde.time >= hastaTiempo - 0.001) return;
        const espera = esperaMsHasta(reloj, acorde.time, ritmo);
        const timer = setTimeout(() => {
            if (idEjecucion !== idGuia || !activo()) return;
            sonarAcorde(acorde.notas, acorde.duracion / ritmo);
        }, espera);
        temporizadoresAcompanamiento.push(timer);
    });
}

function esperaMsHasta(reloj, tiempoObjetivo, velocidad) {
    const ritmo = velocidad || 1;
    const avanzado = (performance.now() - reloj.t0) / 1000 * ritmo;
    return Math.max(0, (tiempoObjetivo - reloj.tiempoBase - avanzado) / ritmo * 1000);
}

function textoVelocidad(valor) {
    return "×" + valor.toLocaleString("es", { maximumFractionDigits: 2 });
}

function cambiarVelocidadKaraoke(valor) {
    const nueva = Math.min(2, Math.max(0.5, Number(valor) || 1));
    const anterior = velocidadKaraoke;
    const etiqueta = document.getElementById("txt-velocidad");
    const control = document.getElementById("velocidad-karaoke");
    if (etiqueta) etiqueta.textContent = textoVelocidad(nueva);
    if (control && Number(control.value) !== nueva) control.value = String(nueva);

    if (modoKaraoke && estadoKaraoke === "reproduciendo" && anterior > 0) {
        const tiempo = relojKaraoke.tiempoBase + (performance.now() - relojKaraoke.t0) / 1000 * anterior;
        velocidadKaraoke = nueva;
        relojKaraoke = { t0: performance.now(), tiempoBase: tiempo };
        if (pendienteKaraoke && pendienteKaraoke.idEjecucion === idGuia) {
            programarKaraoke(pendienteKaraoke.tiempoObjetivo, pendienteKaraoke.accion, pendienteKaraoke.idEjecucion);
        }
        programarAcompanamiento(relojKaraoke, idGuia, () => modoKaraoke && estadoKaraoke === "reproduciendo", null, nueva);
        actualizarLucesCompas();
        return;
    }
    if (modoKaraoke && estadoKaraoke === "cuenta" && pasoCuentaKaraoke && anterior > 0) {
        const hecho = performance.now() - pasoCuentaKaraoke.inicioMs;
        const queda = Math.max(0, pasoCuentaKaraoke.esperaMs - hecho) * (anterior / nueva);
        const paso = pasoCuentaKaraoke;
        velocidadKaraoke = nueva;
        clearTimeout(temporizadorKaraoke);
        programarPasoCuenta(queda, paso.accion, paso.idEjecucion);
        return;
    }
    velocidadKaraoke = nueva;
}

function sonarNota(nombreNotaIngles, duracion, volumen) {
    asegurarAudioContext();
    silenciarMelodia();
    const dur = Math.max(duracion || 0.4, 0.12);
    const ahora = audioContext.currentTime;
    const nivel = (typeof volumen === "number") ? volumen : VOLUMEN_MELODIA;

    let letra = nombreNotaIngles.replace(/[0-9]/g, '').trim().toUpperCase();
    const octava = parseInt(nombreNotaIngles.replace(/[^0-9]/g, '')) || 4;
    if (letra === "DB") letra = "C#";
    if (letra === "EB") letra = "D#";
    if (letra === "GB") letra = "F#";
    if (letra === "AB") letra = "G#";
    if (letra === "BB") letra = "A#";
    const frecuencia = (FRECUENCIAS_BASE_OCTAVA_0[letra] || 18.35) * Math.pow(2, octava);

    const ganancia = audioContext.createGain();
    // El fundamental manda. Si el armónico de la octava suena igual de fuerte,
    // un altavoz pequeño lo destaca y la nota grave se oye una octava más alta.
    // El tercer armónico, más flojo, evita esa confusión cuando el grave se pierde.
    const niveles = [0.40, 0.10, 0.08];
    const osciladores = niveles.map((nivel, i) => {
        const osc = audioContext.createOscillator();
        const parcial = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.value = frecuencia * (i + 1);
        parcial.gain.value = nivel;
        osc.connect(parcial);
        parcial.connect(ganancia);
        osc.start();
        osc.stop(ahora + dur);
        return osc;
    });

    ganancia.gain.setValueAtTime(nivel, ahora);
    ganancia.gain.setValueAtTime(nivel, ahora + Math.max(0, dur - 0.08));
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + dur);
    ganancia.connect(audioContext.destination);

    sonidoEscuchaActual = { ganancia, osciladores };
}

function sonarAcorde(nombres, duracion) {
    asegurarAudioContext();
    silenciarAcorde();
    const dur = Math.max(duracion || 0.4, 0.12);
    const ahora = audioContext.currentTime;
    const ganancia = audioContext.createGain();
    const osciladores = [];
    nombres.forEach(nombre => {
        let letra = nombre.replace(/[0-9]/g, "").trim().toUpperCase();
        const octava = parseInt(nombre.replace(/[^0-9]/g, "")) || 4;
        if (letra === "DB") letra = "C#";
        if (letra === "EB") letra = "D#";
        if (letra === "GB") letra = "F#";
        if (letra === "AB") letra = "G#";
        if (letra === "BB") letra = "A#";
        const frecuencia = (FRECUENCIAS_BASE_OCTAVA_0[letra] || 18.35) * Math.pow(2, octava);
        const osc = audioContext.createOscillator();
        const parcial = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.value = frecuencia;
        parcial.gain.value = 0.55;
        osc.connect(parcial);
        parcial.connect(ganancia);
        osc.start();
        osc.stop(ahora + dur);
        osciladores.push(osc);
    });
    const nivel = nombres.length > 1 ? 0.16 : 0.22;
    ganancia.gain.setValueAtTime(nivel, ahora);
    ganancia.gain.setValueAtTime(nivel, ahora + Math.max(0, dur - 0.08));
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + dur);
    ganancia.connect(audioContext.destination);
    sonidoAcordeActual = { ganancia, osciladores };
}

function apagarVoz(voz) {
    if (!voz || !audioContext) return;
    try {
        const ahora = audioContext.currentTime;
        voz.ganancia.gain.cancelScheduledValues(ahora);
        voz.ganancia.gain.setValueAtTime(Math.max(voz.ganancia.gain.value, 0.0001), ahora);
        voz.ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.06);
        voz.osciladores.forEach(o => o.stop(ahora + 0.07));
    } catch (e) { /* la nota ya había terminado */ }
}

function silenciarMelodia() {
    apagarVoz(sonidoEscuchaActual);
    sonidoEscuchaActual = null;
}

function silenciarAcorde() {
    apagarVoz(sonidoAcordeActual);
    sonidoAcordeActual = null;
}

// Apaga con un fundido corto lo que esté sonando (al pausar o salir)
function silenciarSonidoEscucha() {
    silenciarMelodia();
    silenciarAcorde();
}

function actualizarControlesEscucha() {
    const caja = document.getElementById('controles-escucha');
    caja.style.display = modoEscucha ? 'flex' : 'none';

    const sonando = (estadoEscucha === 'reproduciendo');
    document.getElementById('btn-pausa-escucha').style.display = sonando ? 'inline-block' : 'none';
    document.getElementById('btn-seguir-escucha').style.display = sonando ? 'none' : 'inline-block';
    document.getElementById('btn-entrenar-aqui').style.display = sonando ? 'none' : 'inline-block';

    document.getElementById('btn-seguir-escucha').innerText =
        (estadoEscucha === 'fin') ? '↺ Escuchar de nuevo' : '▶ Seguir escuchando';
    document.getElementById('btn-entrenar-aqui').innerText =
        (estadoEscucha === 'fin') ? '🎤 Entrenar desde el principio' : '🎤 Entrenar desde esta palabra';

    const mensajes = { reproduciendo: '🎧 Escuchando...', pausada: '⏸ En pausa', fin: '🎧 Has escuchado toda la canción.' };
    document.getElementById('evaluacion').innerText = mensajes[estadoEscucha] || '';
}

function iniciarEscuchaDesde(indicePalabra) {
    cancelarTemporizadores();               // detiene cualquier sonido o temporizador previo
    if (!FRASES_JUEGO[indicePalabra]) indicePalabra = 0;

    modoEscucha = true;                     // (cancelarTemporizadores lo había desactivado)
    estadoEscucha = 'reproduciendo';
    fraseActualIndex = indicePalabra;
    document.getElementById('zona-reinicio').style.display = 'none';
    actualizarControlesEscucha();

    relojEscucha = relojConAnticipo(FRASES_JUEGO[indicePalabra].tiempos[0]);
    idGuia++;
    actualizarLucesCompas();
    programarAcompanamiento(relojEscucha, idGuia, () => modoEscucha && estadoEscucha === "reproduciendo");
    reproducirPalabraEscucha(idGuia);
}

function reproducirPalabraEscucha(idEjecucion) {
    if (!modoEscucha || idEjecucion !== idGuia || estadoEscucha !== 'reproduciendo') return;

    limpiarSilencioEscucha();               // si veníamos de un silencio, se quita el aviso

    if (fraseActualIndex >= FRASES_JUEGO.length) {
        terminarEscucha();
        return;
    }

    cargarNuevaFrasePalabra(true);          // dibuja la palabra sin lanzar la guía del entrenamiento
    programarEscucha(FRASES_JUEGO[fraseActualIndex].tiempos[0], () => tocarNotaEscucha(0, idEjecucion), idEjecucion);
}

// Programa una acción para un instante de la canción (en segundos del MIDI).
// Se calcula respecto al reloj de inicio para no acumular retraso nota a nota.
function programarEscucha(tiempoObjetivo, accion, idEjecucion) {
    const transcurridoMs = performance.now() - relojEscucha.t0;
    const esperaMs = Math.max(0, (tiempoObjetivo - relojEscucha.tiempoBase) * 1000 - transcurridoMs);
    temporizadorEscucha = setTimeout(() => {
        if (!modoEscucha || idEjecucion !== idGuia) return;
        accion();
    }, esperaMs);
}

function tocarNotaEscucha(i, idEjecucion) {
    if (!modoEscucha || idEjecucion !== idGuia) return;
    const palabra = FRASES_JUEGO[fraseActualIndex];

    // Resaltar la nota que suena
    for (let k = 0; k < palabra.notes.length; k++) {
        const caja = document.getElementById(`caja-nota-${k}`);
        if (caja) caja.className = (k === i) ? "nota-caja activa" : "nota-caja";
    }
    sonarNota(palabra.notesIngles[i], palabra.duraciones[i], VOLUMEN_MELODIA_GUIA);

    // ¿Cuándo empieza la siguiente nota? (en esta palabra o en la que viene)
    const esUltimaDePalabra = (i + 1 >= palabra.notes.length);
    const siguiente = FRASES_JUEGO[fraseActualIndex + 1];
    const finNota = palabra.tiempos[i] + (palabra.duraciones[i] || 0.4);
    const tiempoSiguiente = !esUltimaDePalabra ? palabra.tiempos[i + 1]
                          : (siguiente ? siguiente.tiempos[0] : finNota);

    if (!esUltimaDePalabra) {
        programarEscucha(tiempoSiguiente, () => tocarNotaEscucha(i + 1, idEjecucion), idEjecucion);
    } else if (siguiente && (tiempoSiguiente - finNota) > UMBRAL_SILENCIO_ESCUCHA) {
        // Silencio largo: al terminar la nota se avisa y se cuenta atrás hasta la siguiente palabra
        programarEscucha(finNota, () => {
            mostrarSilencioEscucha(tiempoSiguiente);
            programarEscucha(tiempoSiguiente, () => reproducirPalabraEscucha(idEjecucion), idEjecucion);
        }, idEjecucion);
    } else {
        programarEscucha(tiempoSiguiente, () => {
            fraseActualIndex++;
            reproducirPalabraEscucha(idEjecucion);
        }, idEjecucion);
    }
}

// Muestra "Aquí no cantamos" con una cuenta atrás hasta que vuelve a haber que cantar
function mostrarSilencioEscucha(tiempoSiguiente) {
    enSilencio = true;
    fraseActualIndex++;                     // apunta a la palabra que se cantará al volver
    const siguiente = FRASES_JUEGO[fraseActualIndex];
    const finMs = relojEscucha.t0 + (tiempoSiguiente - relojEscucha.tiempoBase) * 1000;

    const pantalla = document.getElementById('palabra-pantalla');
    pantalla.className = "palabra-actual silencio";
    pantalla.innerText = "🤫 Aquí no cantamos";

    const dibujar = () => {
        const restante = Math.max(1, Math.ceil((finMs - performance.now()) / 1000));
        document.getElementById('secuencia-visual').innerHTML =
            `<div style='font-size:18px; color:#aaa;'>Seguimos con «${siguiente.palabra}» en ${restante} s</div>`;
    };
    dibujar();
    intervaloSilencio = setInterval(dibujar, 250);
}

function limpiarSilencioEscucha() {
    clearInterval(intervaloSilencio);
    intervaloSilencio = null;
    enSilencio = false;
    const pantalla = document.getElementById('palabra-pantalla');
    if (pantalla) pantalla.className = "palabra-actual";
}

function pausarEscucha() {
    if (!modoEscucha || estadoEscucha !== 'reproduciendo') return;
    const estabaEnSilencio = enSilencio;
    clearTimeout(temporizadorEscucha);
    temporizadorEscucha = null;
    idGuia++;                               // anula lo que quedara programado
    cancelarAcompanamiento();
    limpiarSilencioEscucha();
    silenciarSonidoEscucha();
    pulsoCompasMarcado = pulsoDeTiempo(relojEscucha.tiempoBase + (performance.now() - relojEscucha.t0) / 1000);
    estadoEscucha = 'pausada';              // fraseActualIndex = palabra en la que se paró
    if (estabaEnSilencio) cargarNuevaFrasePalabra(true);   // se muestra la palabra que vendría tras el silencio
    actualizarControlesEscucha();
    actualizarLucesCompas();
}

function terminarEscucha() {
    cancelarAcompanamiento();
    silenciarSonidoEscucha();
    limpiarSilencioEscucha();
    estadoEscucha = 'fin';
    fraseActualIndex = 0;                   // "volver a escuchar" y "entrenar" parten del principio
    palabraMostradaIndex = FRASES_JUEGO.length;   // la flecha ◀ lleva a la última palabra
    actualizarFlechas();
    document.getElementById('palabra-pantalla').innerText = "🎧 Fin de la canción";
    document.getElementById('secuencia-visual').innerHTML = "";
    actualizarControlesEscucha();
    actualizarLucesCompas();
}

// Flechas ◀ ▶ durante la escucha
function irAPalabraEnEscucha(nuevoIndice) {
    if (estadoEscucha === 'reproduciendo') {
        iniciarEscuchaDesde(nuevoIndice);   // sigue sonando desde la palabra elegida
    } else {
        // En pausa (o al final): solo se muestra la palabra y se mantiene la pausa
        estadoEscucha = 'pausada';
        fraseActualIndex = nuevoIndice;
        pulsoCompasMarcado = pulsoDeTiempo(FRASES_JUEGO[nuevoIndice].tiempos[0]);
        cargarNuevaFrasePalabra(true);
        actualizarControlesEscucha();
        actualizarLucesCompas();
    }
}

// Pasa del modo escucha al entrenamiento, empezando por la palabra en que se paró
async function pasarAEntrenamiento() {
    if (!modoEscucha) return;
    const indice = fraseActualIndex;        // 0 si la escucha había terminado
    cancelarTemporizadores();               // detiene todo y desactiva el modo escucha
    tiemposPalabras = {};                   // el feedback del entrenamiento empieza de cero
    document.getElementById('controles-escucha').style.display = 'none';
    document.getElementById('evaluacion').innerText = "";

    fraseActualIndex = indice;
    notaSecuenciaIndex = 0;
    muestrasConsecutivasBien = 0;
    ultimaNotaValidadaTexto = "";

    try {
        await asegurarMicrofono();
        // Si mientras tanto se volvió al menú, no se hace nada
        if (document.getElementById('status-box').style.display !== 'block') return;

        if (CANCIONES_AFINACION_LIBRE.includes(cancionActual)) {
            iniciarCalibracion();           // primero se pide la primera nota; luego se empieza en esta palabra
        } else {
            cargarNuevaFrasePalabra();
        }
        if (!bucleAudioActivo) {
            bucleAudioActivo = true;
            bucleDeAudio();
        }
    } catch (err) {
        document.getElementById('palabra-pantalla').innerText = "Error";
        document.getElementById('evaluacion').innerHTML = `<span class='error'>❌ Error: ${err.message}</span>`;
    }
}

// ==========================================
// MODO KARAOKE
// ==========================================
// La melodía suena seguida, con el ritmo del MIDI, sin esperar a que se cante.
// Cada nota cuenta como acierto si, mientras suena, la voz entra en la tolerancia.

function construirLineaKaraoke() {
    notasLineaKaraoke = [];
    FRASES_JUEGO.forEach((palabra, indicePalabra) => {
        palabra.notesIngles.forEach((ingles, indiceNota) => {
            notasLineaKaraoke.push({
                palabraIndex: indicePalabra,
                notaIndex: indiceNota,
                tiempo: palabra.tiempos[indiceNota],
                duracion: palabra.duraciones[indiceNota] || 0.4,
                ingles: ingles,
                nombre: palabra.notes[indiceNota],
                acertada: false,
                juzgada: false
            });
        });
    });
}

// Misma cuenta de cents que el entrenamiento, para que la tolerancia se sienta igual.
// El margen del menú se aplica sobre esta distancia real: no se sustituye por un tope fijo.
function centsRespectoANota(frecuencia, notaIngles, ignorarOctava) {
    const valorMidiUsuario = 69 + 12 * Math.log2(frecuencia / 440);
    let letra = notaIngles.replace(/[0-9]/g, '').trim().toUpperCase();
    const octava = parseInt(notaIngles.replace(/[^0-9]/g, '')) || 4;
    const bemoles = { "DB": "C#", "EB": "D#", "GB": "F#", "AB": "G#", "BB": "A#" };
    if (bemoles[letra]) letra = bemoles[letra];
    const hzObjetivo = (FRECUENCIAS_BASE_OCTAVA_0[letra] || 18.35) * Math.pow(2, octava);
    const midiObjetivo = 69 + 12 * Math.log2(hzObjetivo / 440);
    let cents = (valorMidiUsuario - midiObjetivo) * 100;
    if (ignorarOctava) cents -= Math.round(cents / 1200) * 1200;
    return cents;
}

function comentarioKaraoke(porcentaje) {
    if (porcentaje >= 95) return "¡Afinación de disco! Si esto fuera un concierto, habría bis.";
    if (porcentaje >= 80) return "Qué bien suena. El coro se va a poner contento.";
    if (porcentaje >= 65) return "Buen karaoke: la melodía ya va contigo.";
    if (porcentaje >= 45) return "Has cantado la canción entera. Otra pasada y el promedio sube.";
    if (porcentaje >= 25) return "Unas cuantas notas han dado en el clavo. El resto se deja querer.";
    return "Hoy ha ganado la escucha. Sin forzar la voz, la próxima sale mejor.";
}

function pulsoDeTiempo(tiempo) {
    const pulso = Math.floor(tiempo / segundosPorPulso + 1e-4);
    return (pulso % pulsosPorCompas) + 1;
}

function actualizarLucesCompas() {
    const caja = document.getElementById('compas-karaoke');
    if (!caja) return;
    const enKaraoke = modoKaraoke && estadoKaraoke !== 'fin';
    const enEscucha = modoEscucha && estadoEscucha !== 'fin';
    if (esCalentamiento(cancionActual) || (!enKaraoke && !enEscucha)) {
        caja.hidden = true;
        return;
    }
    caja.hidden = false;
    if (caja.childElementCount !== pulsosPorCompas) {
        caja.replaceChildren();
        for (let i = 1; i <= pulsosPorCompas; i++) {
            const numero = document.createElement('span');
            numero.textContent = String(i);
            caja.appendChild(numero);
        }
    }
    if (modoKaraoke && estadoKaraoke === 'reproduciendo') {
        const tiempo = relojKaraoke.tiempoBase + (performance.now() - relojKaraoke.t0) / 1000 * velocidadKaraoke;
        pulsoCompasMarcado = pulsoDeTiempo(tiempo);
    } else if (modoEscucha && estadoEscucha === 'reproduciendo') {
        const tiempo = relojEscucha.tiempoBase + (performance.now() - relojEscucha.t0) / 1000;
        pulsoCompasMarcado = pulsoDeTiempo(tiempo);
    }
    Array.from(caja.children).forEach((el, i) => {
        el.classList.toggle('activo', i + 1 === pulsoCompasMarcado);
    });
}

function actualizarMarcadorKaraoke() {
    const total = notasLineaKaraoke.length;
    const van = Math.min(indiceNotaKaraoke + 1, total);
    const margen = aplicarToleranciaDelMenu();
    document.getElementById('evaluacion').innerText =
        `🎤 ${etiquetaDificultad(margen)} · ${aciertosKaraoke} aciertos · nota ${van} de ${total}`;
}

function actualizarControlesKaraoke() {
    const caja = document.getElementById('controles-karaoke');
    if (!caja) return;
    caja.style.display = modoKaraoke ? 'flex' : 'none';
    if (!modoKaraoke) return;
    const enMarcha = estadoKaraoke === 'reproduciendo' || estadoKaraoke === 'cuenta';
    document.getElementById('btn-pausa-karaoke').style.display = enMarcha ? 'inline-block' : 'none';
    document.getElementById('btn-seguir-karaoke').style.display = estadoKaraoke === 'pausada' ? 'inline-block' : 'none';
    document.getElementById('btn-repetir-karaoke').style.display = estadoKaraoke === 'fin' ? 'inline-block' : 'none';
    if (estadoKaraoke === 'reproduciendo') actualizarMarcadorKaraoke();
    if (estadoKaraoke === 'pausada') {
        const pieza = esCalentamiento(cancionActual) ? "Calentamiento" : "Karaoke";
        document.getElementById('evaluacion').innerText = `⏸ ${pieza} en pausa`;
    }
}

function programarKaraoke(tiempoObjetivo, accion, idEjecucion) {
    clearTimeout(temporizadorKaraoke);
    pendienteKaraoke = { tiempoObjetivo, accion, idEjecucion };
    temporizadorKaraoke = setTimeout(() => {
        if (!modoKaraoke || idEjecucion !== idGuia || estadoKaraoke !== 'reproduciendo') return;
        accion();
    }, esperaMsHasta(relojKaraoke, tiempoObjetivo, velocidadKaraoke));
}

function mostrarPalabraKaraoke(indice) {
    fraseActualIndex = indice;
    cargarNuevaFrasePalabra(true);
    notasLineaKaraoke.forEach(nota => {
        if (nota.palabraIndex !== indice || !nota.juzgada) return;
        const caja = document.getElementById(`caja-nota-${nota.notaIndex}`);
        if (caja) caja.className = nota.acertada ? "nota-caja completada" : "nota-caja fallada";
    });
}

function destacarNotaKaraoke(nota) {
    const caja = document.getElementById(`caja-nota-${nota.notaIndex}`);
    if (!caja || nota.palabraIndex !== palabraMostradaIndex || nota.acertada) return;
    caja.className = "nota-caja activa";
    marcarDireccionAfinacion(caja, null);
}

function pintarAciertoKaraoke(nota) {
    const caja = document.getElementById(`caja-nota-${nota.notaIndex}`);
    if (!caja || nota.palabraIndex !== palabraMostradaIndex) return;
    caja.className = "nota-caja completada";
    marcarDireccionAfinacion(caja, null);
}

function juzgarNotaKaraoke(nota) {
    if (!nota || nota.juzgada) return;
    nota.juzgada = true;
    if (notaEnJuicio === nota) notaEnJuicio = null;
    muestrasConsecutivasBien = 0;
    const caja = document.getElementById(`caja-nota-${nota.notaIndex}`);
    if (caja && nota.palabraIndex === palabraMostradaIndex) {
        caja.className = nota.acertada ? "nota-caja completada" : "nota-caja fallada";
        marcarDireccionAfinacion(caja, null);
    }
}

function mostrarSilencioKaraoke(tiempoSiguiente, siguienteNota) {
    enSilencio = true;
    notaEnJuicio = null;
    const pantalla = document.getElementById('palabra-pantalla');
    pantalla.className = "palabra-actual silencio";
    pantalla.innerText = "🤫 Aquí no cantamos";
    const palabra = FRASES_JUEGO[siguienteNota.palabraIndex].palabra
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const dibujar = () => {
        const quedaMs = esperaMsHasta(relojKaraoke, tiempoSiguiente, velocidadKaraoke);
        const restante = Math.max(1, Math.ceil(quedaMs / 1000));
        document.getElementById('secuencia-visual').innerHTML =
            `<div style="font-size:18px; color:#aaa;">Seguimos con «${palabra}» en ${restante} s</div>`;
    };
    dibujar();
    intervaloSilencio = setInterval(dibujar, 250);
}

function emitirNotaKaraoke(idEjecucion) {
    if (!modoKaraoke || idEjecucion !== idGuia || estadoKaraoke !== 'reproduciendo') return;
    if (indiceNotaKaraoke >= notasLineaKaraoke.length) {
        terminarKaraoke();
        return;
    }

    const nota = notasLineaKaraoke[indiceNotaKaraoke];
    if (enSilencio || nota.palabraIndex !== palabraMostradaIndex) {
        limpiarSilencioEscucha();
        mostrarPalabraKaraoke(nota.palabraIndex);
    }

    notaEnJuicio = nota;
    muestrasConsecutivasBien = 0;
    framesDesafinadosKaraoke = 0;
    ultimaNotaValidadaTexto = "";
    destacarNotaKaraoke(nota);
    sonarNota(nota.ingles, nota.duracion / velocidadKaraoke);
    actualizarMarcadorKaraoke();

    const siguiente = notasLineaKaraoke[indiceNotaKaraoke + 1];
    const finNatural = nota.tiempo + nota.duracion;
    const finJuicio = siguiente ? Math.min(finNatural, siguiente.tiempo) : finNatural;
    programarKaraoke(finJuicio, () => cerrarNotaKaraoke(idEjecucion, finJuicio), idEjecucion);
}

function cerrarNotaKaraoke(idEjecucion, finJuicio) {
    if (!modoKaraoke || idEjecucion !== idGuia || estadoKaraoke !== 'reproduciendo') return;
    const nota = notasLineaKaraoke[indiceNotaKaraoke];
    juzgarNotaKaraoke(nota);

    const siguiente = notasLineaKaraoke[indiceNotaKaraoke + 1];
    if (!siguiente) {
        terminarKaraoke();
        return;
    }

    indiceNotaKaraoke++;
    if ((siguiente.tiempo - finJuicio) > UMBRAL_SILENCIO_ESCUCHA) {
        mostrarSilencioKaraoke(siguiente.tiempo, siguiente);
    }
    programarKaraoke(siguiente.tiempo, () => emitirNotaKaraoke(idEjecucion), idEjecucion);
}

function guardarCompas(datosNotas) {
    const header = (datosNotas && datosNotas.header) || {};
    const firma = header.timeSignatures && header.timeSignatures[0] && header.timeSignatures[0].timeSignature;
    const numerador = firma && firma[0] ? firma[0] : 4;
    const denominador = firma && firma[1] ? firma[1] : 4;
    const bpm = (header.tempos && header.tempos[0] && header.tempos[0].bpm) || 100;
    pulsosPorCompas = Math.min(12, Math.max(1, Math.round(numerador)));
    segundosPorPulso = (60 / bpm) * (4 / denominador);
}

function clicDeCompas(acentuado) {
    asegurarAudioContext();
    const ahora = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const ganancia = audioContext.createGain();
    osc.type = "square";
    osc.frequency.value = acentuado ? 1400 : 900;
    ganancia.gain.setValueAtTime(acentuado ? 0.18 : 0.09, ahora);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.06);
    osc.connect(ganancia);
    ganancia.connect(audioContext.destination);
    osc.start(ahora);
    osc.stop(ahora + 0.06);
}

function mostrarCuentaKaraoke(texto, detalle) {
    const pantalla = document.getElementById("palabra-pantalla");
    pantalla.className = "palabra-actual cuenta";
    pantalla.innerText = texto;
    document.getElementById("evaluacion").innerText = detalle || "";
}

function programarPasoCuenta(esperaMs, accion, idEjecucion) {
    clearTimeout(temporizadorKaraoke);
    pasoCuentaKaraoke = { inicioMs: performance.now(), esperaMs, accion, idEjecucion };
    temporizadorKaraoke = setTimeout(() => {
        if (pasoCuentaKaraoke && pasoCuentaKaraoke.idEjecucion === idEjecucion) pasoCuentaKaraoke = null;
        if (!modoKaraoke || idEjecucion !== idGuia || estadoKaraoke !== "cuenta") return;
        accion();
    }, esperaMs);
}

function esCalentamiento(nombre) {
    return /^Calentamiento\b/.test(nombre || "");
}

// Primero suena la nota con la que empieza la canción. Luego un compás de cuenta atrás.
function prepararEntradaKaraoke(idEjecucion) {
    if (!modoKaraoke || idEjecucion !== idGuia) return;
    const nota = notasLineaKaraoke[indiceNotaKaraoke];
    if (!nota) {
        terminarKaraoke();
        return;
    }
    estadoKaraoke = "cuenta";
    notaEnJuicio = null;
    pulsoCompasMarcado = 0;
    actualizarLucesCompas();
    mostrarPalabraKaraoke(nota.palabraIndex);
    const nombre = nombreEspanolDesdeMidi(midiDesdeNombreIngles(nota.ingles));
    mostrarCuentaKaraoke(nombre, "Tono");
    const duracionTono = Math.max(1, segundosPorPulso * 2) / velocidadKaraoke;
    sonarNota(nota.ingles, duracionTono);
    actualizarControlesKaraoke();
    programarPasoCuenta(Math.max(1000, segundosPorPulso * 2000) / velocidadKaraoke, () => {
        silenciarSonidoEscucha();
        pulsarCuentaKaraoke(idEjecucion, pulsosPorCompas);
    }, idEjecucion);
}

function relojConAnticipo(tiempoNota) {
    const anticipo = anticipoAntesDe(tiempoNota, finMelodiaAntesDe(tiempoNota));
    return { t0: performance.now(), tiempoBase: tiempoNota - anticipo };
}

function comenzarReproduccionKaraoke(idEjecucion) {
    const nota = notasLineaKaraoke[indiceNotaKaraoke];
    if (!nota) {
        terminarKaraoke();
        return;
    }
    relojKaraoke = relojConAnticipo(nota.tiempo);
    estadoKaraoke = "reproduciendo";
    palabraMostradaIndex = -1;
    actualizarControlesKaraoke();
    actualizarLucesCompas();
    programarAcompanamiento(relojKaraoke, idEjecucion, () => modoKaraoke && estadoKaraoke === "reproduciendo", null, velocidadKaraoke);
    if (nota.tiempo - relojKaraoke.tiempoBase > 0.02) {
        mostrarPalabraKaraoke(nota.palabraIndex);
        programarKaraoke(nota.tiempo, () => emitirNotaKaraoke(idEjecucion), idEjecucion);
    } else {
        emitirNotaKaraoke(idEjecucion);
    }
}

function pulsarCuentaKaraoke(idEjecucion, numero) {
    if (!modoKaraoke || idEjecucion !== idGuia || estadoKaraoke !== "cuenta") return;
    if (numero < 1) {
        comenzarReproduccionKaraoke(idEjecucion);
        return;
    }
    mostrarCuentaKaraoke(String(numero), "");
    pulsoCompasMarcado = pulsosPorCompas - numero + 1;
    actualizarLucesCompas();
    clicDeCompas(numero === pulsosPorCompas);
    programarPasoCuenta(segundosPorPulso * 1000 / velocidadKaraoke, () => pulsarCuentaKaraoke(idEjecucion, numero - 1), idEjecucion);
}

function iniciarKaraokeDesde(indicePalabra) {
    cancelarTemporizadores();
    if (!FRASES_JUEGO.length) return;

    construirLineaKaraoke();
    aciertosKaraoke = 0;
    indiceNotaKaraoke = 0;
    if (indicePalabra > 0) {
        const encontrado = notasLineaKaraoke.findIndex(nota => nota.palabraIndex >= indicePalabra);
        indiceNotaKaraoke = encontrado < 0 ? 0 : encontrado;
    }

    modoKaraoke = true;
    estadoKaraoke = "cuenta";
    cuentaKaraokePendiente = false;
    fraseActualIndex = notasLineaKaraoke[indiceNotaKaraoke].palabraIndex;
    document.getElementById('zona-reinicio').style.display = 'none';
    document.getElementById('controles-escucha').style.display = 'none';

    const primera = notasLineaKaraoke[indiceNotaKaraoke];
    relojKaraoke = { t0: performance.now(), tiempoBase: primera.tiempo };
    palabraMostradaIndex = -1;             // obliga a dibujar la primera palabra
    idGuia++;
    document.getElementById("btn-volver-calentamiento").hidden = !esCalentamiento(cancionActual);
    if (esCalentamiento(cancionActual)) {
        comenzarReproduccionKaraoke(idGuia);
        return;
    }
    prepararEntradaKaraoke(idGuia);
}

function pausarKaraoke() {
    if (!modoKaraoke || (estadoKaraoke !== 'reproduciendo' && estadoKaraoke !== 'cuenta')) return;
    cuentaKaraokePendiente = estadoKaraoke === 'cuenta';
    clearTimeout(temporizadorKaraoke);
    temporizadorKaraoke = null;
    idGuia++;
    cancelarAcompanamiento();
    silenciarSonidoEscucha();
    const seguiaUnSilencio = enSilencio;
    limpiarSilencioEscucha();
    notaEnJuicio = null;
    estadoKaraoke = 'pausada';
    if (seguiaUnSilencio && notasLineaKaraoke[indiceNotaKaraoke]) {
        mostrarPalabraKaraoke(notasLineaKaraoke[indiceNotaKaraoke].palabraIndex);
    }
    actualizarControlesKaraoke();
}

function seguirKaraoke() {
    if (!modoKaraoke || estadoKaraoke !== 'pausada') return;
    const nota = notasLineaKaraoke[indiceNotaKaraoke];
    if (!nota) {
        terminarKaraoke();
        return;
    }
    idGuia++;
    if (cuentaKaraokePendiente) {
        cuentaKaraokePendiente = false;
        prepararEntradaKaraoke(idGuia);
        return;
    }
    comenzarReproduccionKaraoke(idGuia);
}

function terminarKaraoke() {
    if (estadoKaraoke === 'fin') return;
    clearTimeout(temporizadorKaraoke);
    temporizadorKaraoke = null;
    cancelarAcompanamiento();
    limpiarSilencioEscucha();
    silenciarSonidoEscucha();
    notaEnJuicio = null;
    estadoKaraoke = 'fin';

    const total = notasLineaKaraoke.length;
    const promedio = total ? Math.round((aciertosKaraoke * 100) / total) : 0;
    anotarCancionEstudiadaHoy({ aciertos: aciertosKaraoke, total, promedio });
    document.getElementById('palabra-pantalla').innerText = "🎉 Karaoke";
    document.getElementById('secuencia-visual').innerHTML = "";

    const resumen = document.createElement('div');
    resumen.className = 'resumen-final';

    const logro = document.createElement('div');
    logro.className = 'resumen-logro';
    logro.innerText = total === 1
        ? `Has acertado ${aciertosKaraoke} de 1 nota.`
        : `Has acertado ${aciertosKaraoke} de ${total} notas.`;
    resumen.appendChild(logro);

    const cifra = document.createElement('div');
    cifra.className = 'karaoke-promedio';
    cifra.innerText = `${promedio}%`;
    resumen.appendChild(cifra);

    const comentario = document.createElement('div');
    comentario.className = 'resumen-titulo';
    comentario.innerText = comentarioKaraoke(promedio);
    resumen.appendChild(comentario);

    document.getElementById('secuencia-visual').appendChild(resumen);
    document.getElementById('evaluacion').innerHTML = `<span class="success">Promedio: ${promedio}%</span>`;
    document.getElementById('zona-reinicio').style.display = 'flex';
    document.getElementById('btn-volver-calentamiento').hidden = !esCalentamiento(cancionActual);
    actualizarFlechas();
    actualizarControlesKaraoke();
}

function procesarKaraoke() {
    if (estadoKaraoke !== 'reproduciendo' || !notaEnJuicio || notaEnJuicio.juzgada || !analyser) return;

    const nota = notaEnJuicio;
    const ignorarOctava = esCalentamiento(cancionActual);
    analyser.getFloatTimeDomainData(dataArray);
    const frecuencia = autoCorrelacion(dataArray, audioContext.sampleRate);
    const caja = document.getElementById(`caja-nota-${nota.notaIndex}`);

    if (frecuencia === -1 || frecuencia <= (ignorarOctava ? 50 : 60) || frecuencia >= (ignorarOctava ? 2000 : 1000)) {
        framesDesafinadosKaraoke = 0;
        if (caja && !nota.acertada) {
            caja.className = "nota-caja activa";
            marcarDireccionAfinacion(caja, null);
        } else if (caja) {
            marcarDireccionAfinacion(caja, null);
        }
        return;
    }

    const margen = aplicarToleranciaDelMenu();
    const cents = centsRespectoANota(frecuencia, nota.ingles, ignorarOctava);
    const absDesviacion = Math.abs(cents);

    if (absDesviacion <= margen) {
        framesDesafinadosKaraoke = 0;
        muestrasConsecutivasBien++;
        if (caja) {
            caja.className = nota.acertada ? "nota-caja completada" : "nota-caja activa";
            marcarDireccionAfinacion(caja, null);
        }
        if (!nota.acertada && muestrasConsecutivasBien >= MUESTRAS_NECESARIAS) {
            nota.acertada = true;
            aciertosKaraoke++;
            pintarAciertoKaraoke(nota);
            actualizarMarcadorKaraoke();
        }
        return;
    }

    // Un frame de ruido no basta: hace falta un tono claro y sostenido para marcar el error.
    framesDesafinadosKaraoke++;
    if (!caja || nota.acertada || framesDesafinadosKaraoke < MUESTRAS_NECESARIAS) return;
    const intensidad = absDesviacion <= (margen + 15) ? "leve" : "fuerte";
    caja.className = intensidad === "leve" ? "nota-caja umbral-amarillo" : "nota-caja umbral-rojo";
    marcarDireccionAfinacion(caja, cents > 0 ? "aguda" : "grave", intensidad);
}

function regresarAlMenu() {
    ocultarResultadoMicrofono();
    cancelarTemporizadores();
    document.getElementById('titulo-cancion').style.display = "none";
    document.getElementById('controles-escucha').style.display = "none";
    document.getElementById('controles-karaoke').style.display = "none";
    document.getElementById('status-box').style.display = "none";
    document.getElementById('evaluacion').innerHTML = "";
    document.getElementById('secuencia-visual').innerHTML = "";
    document.getElementById('palabra-pantalla').innerText = "...";
    
    document.getElementById('zona-seleccion').style.display = "block";
    document.getElementById('botones-inicio').style.display = "flex";
    document.getElementById("btn-volver-calentamiento").hidden = true;
    cerrarCalentamientos();
}
