
let FRASES_JUEGO = []; 
let fraseActualIndex = 0;
let notaSecuenciaIndex = 0; 
let muestrasConsecutivasBien = 0;
const MUESTRAS_NECESARIAS = 3; 
let reproduciendoGuia = false;

// En el móvil, con el micrófono abierto el sistema baja el altavoz (modo llamada).
// Mientras suena la guía se corta la pista, para que el piano suene como en escucha.
function fijarSesionAudio(tipo) {
    if (!navigator.audioSession) return;
    try { navigator.audioSession.type = tipo; } catch (e) { /* Safari antiguo */ }
}

function sincronizarAltavozConMicrofono() {
    const pista = streamMicrofono && streamMicrofono.getAudioTracks()[0];
    if (!pista) {
        fijarSesionAudio("playback");
        return;
    }
    const cortarParaGuia = esTelefono() && reproduciendoGuia;
    pista.enabled = !cortarParaGuia;
    fijarSesionAudio(cortarParaGuia ? "playback" : "play-and-record");
}

function ponerGuiaSonando(activa) {
    reproduciendoGuia = !!activa;
    sincronizarAltavozConMicrofono();
}
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
// ---- Juego de ritmo: como escucha, pero el sonido solo al pulsar ----
let modoRitmo = false;
let estadoRitmo = 'fin';                 // 'cuenta' | 'reproduciendo' | 'fin'
let notasRitmo = [];
let indiceNotaRitmo = 0;
let relojRitmo = { t0: 0, tiempoBase: 0 };
let pulsacionRitmo = null;               // { inicioMs, notaIndex, tecla }
let animacionRitmoId = 0;
let listenersRitmoActivos = false;
let aciertosMomentoRitmo = 0;
let aciertosDuracionRitmo = 0;
let notasJuzgadasRitmo = 0;
const RITMO_VENTANA_BIEN = 0.12;         // s: ataque muy bueno
const RITMO_VENTANA_OK = 0.25;           // s: ataque aceptable
const RITMO_VENTANA_PRIMERA = 0.45;      // 1ª nota en el downbeat: más margen
const RITMO_ANTICIPO_LETRA = 0.08;       // con anacrusa, mostrar letra/notas justo al llegar
const RITMO_DURACION_BIEN = 0.25;        // error relativo de duración
const RITMO_DURACION_OK = 0.45;
let metronomoRitmoActivo = true;         // clic de compás audible por defecto
let ultimoBeatMetronomoRitmo = -999;     // índice de pulso musical (puede ser negativo)
let velocidadRitmo = 0.6;                // inicio al 60 % del tempo de la pieza
// ---- Juego del pájaro: la voz mueve el pájaro; las cerezas son las notas ----
let modoPajaro = false;
let estadoPajaro = "fin";                // 'calibracion' | 'prep' | 'jugando' | 'pausada' | 'fin'
let midiBasePajaro = 48;
let midiSuavePajaro = null;              // midi cantado suavizado
let cerezasPajaro = [];                  // { midi, tLlegada, el, recogida, fallida }
let melodiaPajaroBase = [];              // { midi, tiempo, duracion } antes de transponer
let aciertosPajaro = 0;
let animacionPajaroId = 0;
let relojPajaro = { t0: 0, tiempoBase: 0 };
let velocidadPajaro = 0.6;               // inicio al 60 % del tempo de la pieza
let escenaMidiMin = 42;
let escenaMidiMax = 60;
const PIEZA_PRUEBA_FRERE = "Frere Jacques";
const PIEZAS_CON_CALIBRACION = [PIEZA_PRUEBA_FRERE, "Cumpleanos Feliz"];
function tituloPajaroHtml(conCereza) {
    return conCereza ? "Pájaro 🍒" : "Pájaro";
}

function esPiezaConCalibracion(pieza) {
    return PIEZAS_CON_CALIBRACION.includes((pieza || "").trim());
}
const PAJARO_MARGEN_CENTS = 70;          // ventana para recoger cereza
const PAJARO_ANTICIPO = 2.2;             // s: la cereza aparece a la derecha antes de llegar
const PAJARO_X_PAJARO = 12;              // % desde la izquierda
// ---- Juego del colibrí: voz + flores en intervalos desde la nota inicial ----
let modoColibri = false;
let estadoColibri = "fin";               // 'calibracion' | 'prep' | 'jugando' | 'pausada' | 'transicion' | 'fin'
let midiBaseColibri = 48;
let midiSuaveColibri = null;
let indiceIntervaloColibri = 0;
let florColibri = null;                  // { midi, etiqueta, tLlegada, el, libada, escapada, sonada }
let aciertosColibri = 0;                 // solo libadas a la primera (sin escape previo)
let reintentoIntervaloColibri = false;   // true si esta flor ya se escapó
let guiaNotasColibri = true;             // suenan las notas del intervalo por defecto (9 primeras)
let animacionColibriId = 0;
let relojColibri = { t0: 0, tiempoBase: 0 };
let velocidadColibri = 0.7;
let escenaMidiMinColibri = 42;
let escenaMidiMaxColibri = 60;
let framesLibandoColibri = 0;
let floresSecuenciaColibri = [];         // flores de la secuencia final (como cerezas del pájaro)
let framesLibandoSecuenciaColibri = {};  // índice → frames afinados seguidos
let pausaColibriEraSecuencia = false;
const COLIBRI_MARGEN_CENTS = 70;
const COLIBRI_ANTICIPO = 2.4;
const COLIBRI_X_INICIO = 10;             // % : el colibrí parte de la izquierda
const COLIBRI_X_FLOR = 82;               // % : la flor se queda fija a la derecha
const COLIBRI_FRAMES_LIBAR = 10;         // ~ Frames seguidos afinados cerca de la flor
const COLIBRI_VELOCIDAD_INICIAL = 0.7;
const COLIBRI_GAP_SECUENCIA_S = 2;       // s musicales entre flores de la secuencia
const INTERVALOS_COLIBRI = [
    { semis: 0, etiqueta: "Unísono" },
    { semis: 2, etiqueta: "2ª mayor" },
    { semis: 4, etiqueta: "3ª mayor" },
    { semis: 5, etiqueta: "4ª mayor" },
    { semis: 7, etiqueta: "5ª mayor" },
    { semis: 5, etiqueta: "4ª mayor" },
    { semis: 4, etiqueta: "3ª mayor" },
    { semis: 2, etiqueta: "2ª mayor" },
    { semis: 0, etiqueta: "Unísono" }
];
// ---- Modo karaoke: la melodía sigue sola y se puntúan las notas al vuelo ----
let modoKaraoke = false;
let estadoKaraoke = 'reproduciendo';     // 'cuenta' | 'reproduciendo' | 'pausada' | 'fin'
let cuentaKaraokePendiente = false;      // la pausa pilló el tono o la cuenta atrás
let pulsosPorCompas = 4;
let segundosPorPulso = 0.6;
let firmasCompas = [{ time: 0, pulsos: 4, segundosPorPulso: 0.6 }];
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
// ---- Coro (canon): sopranos, contraltos y bajos; el cantante es siempre el bajo ----
let configCoro = null;                   // metadatos de la pieza (null si no tiene versión coro)
let datosCoroEntradas = null;            // notas absolutas de sopranos/contraltos (tipo entradas)
let notasBaseCanon = [];                 // melodía original, para construir las otras voces
let vocesCoro = [];                      // notas que se oyen y no se cantan (sopranos + contraltos)
let fuentesCoroActivas = [];             // notas de coro sonando a la vez
let temporizadoresCoro = [];
let eligioCoro = false;                  // karaoke en modo Coro en esta reproducción
const VOLUMEN_CORO = 0.22;               // cada voz del coro, un poco por debajo de la melodía karaoke
let estrofasSolo = [];                   // letras extra solo para karaoke Solo (misma melodía)
let indiceEstrofaSolo = 0;
let notasMelodiaCancion = [];            // notas crudas para rearmar sílabas al cambiar de estrofa
let aciertosKaraokeSesion = 0;           // aciertos de estrofas ya cantadas en esta sesión
let totalNotasKaraokeSesion = 0;

function piezaConCoro(coro) {
    return !!(coro && (coro.tipo === "canon" || coro.tipo === "entradas"));
}

let bucleAudioActivo = false;            // evita arrancar varios bucles de audio a la vez

// ---- Ajustes específicos por canción ----
// Canciones en las que el usuario canta primero la nota inicial y la melodía se transpone a ella
const CANCIONES_AFINACION_LIBRE = PIEZAS_CON_CALIBRACION.slice();
const DIFICULTAD_INICIAL = 60;   // Iniciación / Muy Fácil, para cualquier canción

let modoCalibracion = false;             // true mientras se espera la primera nota
let muestrasCalibracion = [];
const MUESTRAS_CALIBRACION = 25;         // ~0,4 s de nota estable
const MIDI_MIN_PRIMERA_NOTA = 36;        // Do2
const MIDI_MAX_PRIMERA_NOTA = 64;        // Mi4 (la melodía sube hasta una octava por encima)

const NOMBRES_NOTA_INGLES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const NOMBRES_NOTA_ESPANOL = ["Do","Do#","Re","Re#","Mi","Fa","Fa#","Sol","Sol#","La","La#","Si"];

function enAyudaRitmo() {
    return document.body.classList.contains("vista-ritmo") || !!modoRitmo;
}

function enAyudaPajaro() {
    return document.body.classList.contains("vista-pajaro") || !!modoPajaro;
}

function enAyudaColibri() {
    return document.body.classList.contains("vista-colibri") || !!modoColibri;
}

function actualizarBotonAyuda() {
    const btn = document.getElementById("btn-ayuda");
    if (!btn) return;
    if (enAyudaColibri()) btn.textContent = "Ayuda colibrí ❓";
    else if (enAyudaPajaro()) btn.textContent = "Ayuda pájaro ❓";
    else if (enAyudaRitmo()) btn.textContent = "Ayuda ritmo ❓";
    else btn.textContent = "Ayuda ❓";
}

function abrirAyuda() {
    if (enAyudaColibri()) {
        const dialogo = document.getElementById("ayuda-colibri");
        if (dialogo) dialogo.showModal();
        return;
    }
    if (enAyudaPajaro()) {
        const dialogo = document.getElementById("ayuda-pajaro");
        if (dialogo) dialogo.showModal();
        return;
    }
    if (enAyudaRitmo()) {
        const dialogo = document.getElementById("ayuda-ritmo");
        if (dialogo) dialogo.showModal();
        return;
    }
    document.getElementById("ayuda").showModal();
}

function cerrarAyuda() {
    const general = document.getElementById("ayuda");
    const ritmo = document.getElementById("ayuda-ritmo");
    const pajaro = document.getElementById("ayuda-pajaro");
    const colibri = document.getElementById("ayuda-colibri");
    if (general && general.open) general.close();
    if (ritmo && ritmo.open) ritmo.close();
    if (pajaro && pajaro.open) pajaro.close();
    if (colibri && colibri.open) colibri.close();
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
        tipo: "cancion",
        titulo: tituloCancionActual || cancionActual,
        exigencia: exigenciaUsada || etiquetaDificultad(toleranciaCentsConfigurada)
    };
    if (puntuacionKaraoke) pieza.karaoke = puntuacionKaraoke;
    piezas.push(pieza);
    try {
        localStorage.setItem(CLAVE_ESTUDIO_HOY, JSON.stringify({ fecha: fechaHoy(), piezas }));
    } catch (e) { /* si el navegador no guarda, la lista de esta sesión no sobrevive al recargar */ }
}

function anotarJuegoHoy(nombreJuego, puntuacion) {
    const piezas = leerCancionesHoy();
    const pieza = {
        tipo: "juego",
        juego: nombreJuego || "Ritmo",
        titulo: tituloCancionActual || cancionActual
    };
    if (puntuacion) pieza.puntuacion = puntuacion;
    piezas.push(pieza);
    try {
        localStorage.setItem(CLAVE_ESTUDIO_HOY, JSON.stringify({ fecha: fechaHoy(), piezas }));
    } catch (e) { /* si el navegador no guarda, la lista de esta sesión no sobrevive al recargar */ }
}

function textoPiezaEstudiada(pieza) {
    if (pieza.tipo === "juego") {
        let texto = `Juego ${pieza.juego || "Ritmo"}`;
        if (pieza.titulo && pieza.titulo !== pieza.juego) texto += ` — ${pieza.titulo}`;
        const p = pieza.puntuacion || {};
        if (typeof p.momento === "number" && typeof p.duracion === "number") {
            texto += ` — momento ${p.momento}% · duración ${p.duracion}%`;
        } else if (typeof p.aciertos === "number" && typeof p.total === "number") {
            const juego = (pieza.juego || "").toLowerCase();
            const unidad = juego.includes("colibr") ? "flores"
                : (juego.includes("pájaro") || juego.includes("pajaro")) ? "cerezas"
                : "aciertos";
            texto += ` — ${p.aciertos} de ${p.total} ${unidad}`;
        }
        return texto;
    }
    let texto = `${pieza.titulo} — ${pieza.exigencia || ""}`;
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
    const titulo = document.getElementById('titulo-canciones-hoy');
    const enhorabuena = document.getElementById('enhorabuena-hoy');
    const canciones = piezas.filter(p => p.tipo !== "juego").length;
    const juegos = piezas.filter(p => p.tipo === "juego").length;
    if (piezas.length === 0) {
        if (titulo) titulo.textContent = "Hoy";
        enhorabuena.textContent = "Hoy no ha podido ser, mañana será otro día.";
    } else {
        if (titulo) titulo.textContent = "Enhorabuena";
        const partes = [];
        if (canciones === 1) partes.push("1 pieza");
        else if (canciones > 1) partes.push(`${canciones} piezas`);
        if (juegos === 1) partes.push("1 juego");
        else if (juegos > 1) partes.push(`${juegos} juegos`);
        enhorabuena.textContent = partes.length
            ? `Enhorabuena por el trabajo realizado hoy. Has hecho ${partes.join(" y ")}.`
            : "Enhorabuena por el trabajo realizado hoy.";
    }
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
let gananciaMicrofono = null;
const GANANCIA_MICRO_TELEFONO = 8;   // sin el cancelador de eco el móvil no sube la voz: hay que amplificarla aquí

function nivelMicrofono(modo) {
    return (esTelefono() && modo !== "karaoke") ? GANANCIA_MICRO_TELEFONO : 1;
}

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
        const btnVolverRitmo = document.getElementById('btn-volver-ritmo');
        if (btnVolverRitmo) btnVolverRitmo.hidden = modo !== 'ritmo';

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
        // En ritmo el metrónomo va a tempo fijo: se ignoran ritardandos del MIDI.
        if (modo === "ritmo") notasRaw = notasSinRitardando(notasRaw, datosNotas);
        acompanamiento = acordesDe(datosNotas, pistaMelodia);
        configCoro = piezaConCoro(datosTexto.coro) ? datosTexto.coro : null;
        datosCoroEntradas = null;
        if (configCoro && configCoro.tipo === "entradas" && configCoro.archivo) {
            const resCoro = await cargarArchivoCancion(configCoro.archivo);
            if (resCoro.ok) datosCoroEntradas = await resCoro.json();
        }
        notasBaseCanon = (notasRaw || []).map(n => ({
            time: typeof n.time === "number" ? n.time : 0,
            duration: n.duration || 0.4,
            midi: typeof n.midi === "number" ? n.midi : midiDesdeNombreIngles(n.name || n.note || "A3"),
            name: n.name || n.note || ""
        }));
        vocesCoro = [];
        eligioCoro = false;

        notasMelodiaCancion = Array.isArray(notasRaw) ? notasRaw.slice() : [];
        estrofasSolo = Array.isArray(datosTexto.estrofasSolo) && datosTexto.estrofasSolo.length
            ? datosTexto.estrofasSolo.filter(e => Array.isArray(e) && e.length)
            : [];
        indiceEstrofaSolo = 0;
        aciertosKaraokeSesion = 0;
        totalNotasKaraokeSesion = 0;
        FRASES_JUEGO = armarFrasesDesdeLineas(lineasLetra, notasMelodiaCancion);

        if (FRASES_JUEGO.length === 0) throw new Error("No se encontraron palabras en la canción.");

        await cargarPiano();

        // ----- MODO ESCUCHA o RITMO: no hace falta micrófono -----
        if (modo === 'escucha' || modo === 'ritmo') {
            soltarMicrofono();
            asegurarAudioContext();
            if (audioContext.state === 'suspended') await audioContext.resume();
            if (modo === 'ritmo') iniciarJuegoRitmo();
            else iniciarEscuchaDesde(0);
            if (!bucleAudioActivo) {
                bucleAudioActivo = true;
                bucleDeAudio();
            }
            return;
        }

        // ----- MODO ENTRENAMIENTO o KARAOKE (los dos escuchan el micrófono) -----
        await asegurarMicrofono(modo);

        if (modo === 'karaoke') {
            eligioCoro = !!(configCoro && document.querySelector('input[name="modo-coro"]:checked')?.value === 'coro');
            if (eligioCoro) vocesCoro = armarVocesCoro(notasBaseCanon, configCoro);
        }

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
        if (cargarSiguienteEstrofaSolo()) {
            tiemposPalabras = {};
            fraseActualIndex = 0;
            cargarNuevaFrasePalabra(sinGuia);
            return;
        }
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
        if (modoRitmo) {
            flechaAguda.hidden = true;
            flechaGrave.hidden = true;
            cajaNota.style.cursor = "default";
        } else {
            cajaNota.style.cursor = "pointer";
        }
        
            cajaNota.onclick = () => {
            if (modoRitmo) return;
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
        ponerGuiaSonando(true);
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
    ponerGuiaSonando(false);
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
    cancelarVocesCoro();
    limpiarSilencioEscucha();
    silenciarSonidoEscucha();
    detenerJuegoRitmo();
    detenerJuegoPajaro();
    detenerJuegoColibri();
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
    // En karaoke/ritmo/pájaro la pieza va sola: las flechas no aplican.
    if (modoKaraoke || modoRitmo || modoPajaro || modoColibri) {
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
            if (idEjecucion === idGuia) ponerGuiaSonando(false);
        }, 300);
        return;
    }

    ponerGuiaSonando(true);

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
    ponerGuiaSonando(true);
    const idLocal = ++idGuia; // si se navega o se sale al menú, este temporizador queda anulado
    elementoCaja.className = "nota-caja activa";

    sonarNota(nombreNotaIngles, 1, VOLUMEN_MELODIA_GUIA);

    setTimeout(() => {
        if (idLocal !== idGuia) return;
        ponerGuiaSonando(false);
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
    ponerGuiaSonando(true);
    const idLocal = ++idGuia;
    const cantada = notaCantadaAyuda;
    const comparacion = cantada.objetivoMasAgudo ? "más aguda" : "más grave";
    document.getElementById('evaluacion').innerHTML =
        `Estás cantando <strong>${cantada.nombre}</strong> y tienes que cantar <strong>${cantada.objetivo}</strong>, que es ${comparacion}.`;
    sonarNota(cantada.ingles, 1, VOLUMEN_MELODIA_GUIA);
    setTimeout(() => {
        if (idLocal !== idGuia) return;
        sonarNota(notaObjetivoIngles, 2, VOLUMEN_MELODIA_GUIA);
    }, 1000);
    setTimeout(() => {
        if (idLocal !== idGuia) return;
        ponerGuiaSonando(false);
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
        } else if (fraseActualIndex >= FRASES_JUEGO.length && !haySiguienteEstrofaSolo()) {
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
    if (modoPajaro) {
        if (estadoPajaro === "calibracion") procesarCalibracionPajaro();
        return;
    }
    if (modoColibri) {
        if (estadoColibri === "calibracion") procesarCalibracionColibri();
        return;
    }
    if (modoKaraoke || modoEscucha || modoRitmo) {
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
    ponerGuiaSonando(false);

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
    ponerGuiaSonando(true); // pausa la evaluación hasta que arranque la primera palabra
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
    actualizarOpcionCoro();
}

function alCambiarCoro() {
    // Solo afecta al próximo karaoke; no hace falta recargar la pieza.
}

async function actualizarOpcionCoro() {
    const caja = document.getElementById('opcion-coro');
    if (!caja) return;
    const stem = (document.getElementById('selector-cancion')?.value || "").trim();
    if (!stem) {
        caja.hidden = true;
        return;
    }
    try {
        const res = await cargarArchivoCancion(`${stem} txt.json`);
        if (!res.ok) {
            caja.hidden = true;
            return;
        }
        let datos = await res.json();
        if (datos.default) datos = datos.default;
        const tiene = piezaConCoro(datos.coro);
        caja.hidden = !tiene;
        if (!tiene) {
            const solo = caja.querySelector('input[value="solo"]');
            if (solo) solo.checked = true;
        }
    } catch (e) {
        caja.hidden = true;
    }
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

// Piano acústico (FluidR3), una muestra cada tres semitonos. El resto se afina con la velocidad de reproducción.
const MIDIS_PIANO = Array.from({ length: 21 }, (_, i) => 24 + i * 3);
const NOMBRES_MUESTRA_PIANO = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const buffersPiano = new Map();
let cargaPiano = null;
const FACTOR_PIANO = 5;     // las muestras de piano pican hacia 0,1: así el ataque queda como el tono de antes

function nombreMuestraPiano(midi) {
    return NOMBRES_MUESTRA_PIANO[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function muestraPianoCercana(midi) {
    return MIDIS_PIANO.reduce((mejor, candidato) =>
        Math.abs(candidato - midi) < Math.abs(mejor - midi) ? candidato : mejor
    );
}

function cargarPiano() {
    if (cargaPiano) return cargaPiano;
    asegurarAudioContext();
    cargaPiano = Promise.all(MIDIS_PIANO.map(async (midi) => {
        try {
            const respuesta = await fetch(`sonidos/piano/${nombreMuestraPiano(midi)}.mp3`);
            if (!respuesta.ok) return;
            const datos = await respuesta.arrayBuffer();
            const audio = await audioContext.decodeAudioData(datos.slice(0));
            buffersPiano.set(midi, audio);
        } catch (e) { /* si falta una muestra, esa nota usa el tono de reserva */ }
    }));
    return cargaPiano;
}

function fuentePiano(ganancia, midi, cuandoFin) {
    if (!buffersPiano.size) return null;
    const base = muestraPianoCercana(midi);
    const buffer = buffersPiano.get(base);
    if (!buffer) return null;
    const fuente = audioContext.createBufferSource();
    fuente.buffer = buffer;
    fuente.playbackRate.value = Math.pow(2, (midi - base) / 12);
    fuente.connect(ganancia);
    fuente.start();
    fuente.stop(cuandoFin);
    return fuente;
}

function tonoReserva(ganancia, frecuencia, cuandoFin) {
    return [1, 0.35, 0.12].map((nivel, i) => {
        const osc = audioContext.createOscillator();
        const parcial = audioContext.createGain();
        osc.type = "sine";
        osc.frequency.value = frecuencia * (i + 1);
        parcial.gain.value = nivel;
        osc.connect(parcial);
        parcial.connect(ganancia);
        osc.start();
        osc.stop(cuandoFin);
        return osc;
    });
}

function envolverNota(ganancia, nivel, ahora, dur) {
    const fin = ahora + dur;
    const cola = Math.min(0.04, dur * 0.3);
    ganancia.gain.setValueAtTime(Math.max(nivel, 0.0001), ahora);
    ganancia.gain.setValueAtTime(Math.max(nivel, 0.0001), ahora + Math.max(0, dur - cola));
    ganancia.gain.exponentialRampToValueAtTime(0.0001, fin);
    ganancia.connect(audioContext.destination);
    return fin;
}

function esTelefono() {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
    // iPadOS se presenta como Mac, pero tiene pantalla táctil.
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function pedidosMicrofono(modo) {
    // En el karaoke del teléfono el cancelador quita la melodía del micrófono,
    // si no la nota se pone verde sola. En el Mac no hace falta: ahí se come la voz.
    if (modo === "karaoke" && esTelefono()) {
        return [{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }];
    }
    // Con el cancelador encendido, el altavoz baja en cuanto entra sonido por el micrófono.
    // {exact:false} es lo que de verdad lo apaga; un false suelto a veces se queda en el valor de antes.
    const agc = esTelefono();
    return [
        {
            echoCancellation: { exact: false },
            noiseSuppression: { exact: false },
            autoGainControl: agc ? true : { exact: false },
            voiceIsolation: false
        },
        { noiseSuppression: { exact: false }, echoCancellation: false, autoGainControl: agc },
        { echoCancellation: false, noiseSuppression: false, autoGainControl: agc, voiceIsolation: false },
        { echoCancellation: false, noiseSuppression: false, autoGainControl: agc }
    ];
}

async function abrirStreamMicrofono(modo) {
    const pedidos = pedidosMicrofono(modo);
    const exigeSinEco = !(modo === "karaoke" && esTelefono());
    if (esTelefono()) fijarSesionAudio("play-and-record");
    let ultimoError = null;
    let conEco = null;
    for (const audio of pedidos) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio });
            const pista = stream.getAudioTracks()[0];
            if (pista && pista.applyConstraints) {
                try { await pista.applyConstraints(audio); } catch (e) { /* el navegador no aplica alguno */ }
            }
            const cancelaEco = !!(pista && pista.getSettings && pista.getSettings().echoCancellation);
            if (exigeSinEco && cancelaEco) {
                if (conEco) conEco.getTracks().forEach(p => p.stop());
                conEco = stream;
                continue;
            }
            if (conEco) conEco.getTracks().forEach(p => p.stop());
            return stream;
        } catch (e) {
            ultimoError = e;
            if (e.name !== "OverconstrainedError" && e.name !== "ConstraintNotSatisfiedError") throw e;
        }
    }
    if (conEco) return conEco;
    throw ultimoError;
}

function conectarMicrofono(stream, modo) {
    streamMicrofono = stream;
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    dataArray = new Float32Array(analyser.fftSize);
    gananciaMicrofono = audioContext.createGain();
    gananciaMicrofono.gain.value = nivelMicrofono(modo);
    source.connect(gananciaMicrofono);
    gananciaMicrofono.connect(analyser);
    sincronizarAltavozConMicrofono();
}

function soltarMicrofono() {
    if (streamMicrofono) {
        streamMicrofono.getTracks().forEach(pista => pista.stop());
        streamMicrofono = null;
    }
    if (source) {
        try { source.disconnect(); } catch (e) { /* ya estaba suelto */ }
        source = null;
    }
    analyser = null;
    dataArray = null;
    gananciaMicrofono = null;
    fijarSesionAudio("playback");
}

function microfonoEnMarcha() {
    const pista = streamMicrofono && streamMicrofono.getAudioTracks()[0];
    return !!(pista && pista.readyState === "live" && analyser);
}

async function fijarProcesadoMicrofono(modo) {
    const pista = streamMicrofono && streamMicrofono.getAudioTracks()[0];
    if (gananciaMicrofono) gananciaMicrofono.gain.value = nivelMicrofono(modo);
    if (!pista) return;
    for (const audio of pedidosMicrofono(modo)) {
        try {
            await pista.applyConstraints(audio);
            const cancelaEco = pista.getSettings && pista.getSettings().echoCancellation === true;
            if (modo === "karaoke" && esTelefono()) return;
            if (!cancelaEco) return;
        } catch (e) { /* se prueba el siguiente juego de ajustes */ }
    }
    soltarMicrofono();
    conectarMicrofono(await abrirStreamMicrofono(modo), modo);
}

async function asegurarMicrofono(modo) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error = new Error("Este navegador no deja usar el micrófono desde esta dirección.");
        error.name = "SecurityError";
        throw error;
    }
    asegurarAudioContext();
    if (!microfonoEnMarcha()) {
        soltarMicrofono();
        conectarMicrofono(await abrirStreamMicrofono(modo || "entrenamiento"), modo || "entrenamiento");
    } else {
        await fijarProcesadoMicrofono(modo || "entrenamiento");
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
    cerrarJuegos(false);
    document.body.classList.add("vista-calentamiento");
    document.getElementById("lista-calentamiento").hidden = false;
    document.getElementById("botones-inicio").style.display = "none";
}

function cerrarCalentamientos(restaurarBotones = true) {
    document.body.classList.remove("vista-calentamiento");
    document.getElementById("lista-calentamiento").hidden = true;
    if (restaurarBotones) document.getElementById("botones-inicio").style.display = "flex";
}

function mostrarJuegos() {
    ocultarResultadoMicrofono();
    cerrarCalentamientos(false);
    cerrarPantallaRitmo();
    cerrarPantallaPajaro();
    cerrarPantallaColibri();
    document.body.classList.remove("vista-ritmo", "vista-pajaro", "vista-colibri");
    document.body.classList.add("vista-juegos");
    document.getElementById("lista-juegos").hidden = false;
    document.getElementById("botones-inicio").style.display = "none";
    actualizarBotonAyuda();
}

function cerrarJuegos(restaurarBotones = true) {
    document.body.classList.remove("vista-juegos");
    document.body.classList.remove("vista-ritmo");
    document.body.classList.remove("vista-pajaro");
    document.body.classList.remove("vista-colibri");
    const lista = document.getElementById("lista-juegos");
    if (lista) lista.hidden = true;
    cerrarPantallaRitmo();
    cerrarPantallaPajaro();
    cerrarPantallaColibri();
    if (restaurarBotones) document.getElementById("botones-inicio").style.display = "flex";
    actualizarBotonAyuda();
}

function cerrarApartadosMenu() {
    cerrarCalentamientos(false);
    cerrarJuegos(false);
    document.getElementById("botones-inicio").style.display = "flex";
}

function rellenarSelectorRitmo() {
    const origen = document.getElementById("selector-cancion");
    const destino = document.getElementById("selector-ritmo");
    if (!origen || !destino) return;
    const valor = destino.value || origen.value;
    destino.innerHTML = origen.innerHTML;
    if ([...destino.options].some(o => o.value === valor)) destino.value = valor;
}

function cerrarPantallaRitmo() {
    const pantalla = document.getElementById("pantalla-ritmo");
    if (pantalla) pantalla.hidden = true;
}

function cerrarPantallaPajaro() {
    const pantalla = document.getElementById("pantalla-pajaro");
    if (pantalla) pantalla.hidden = true;
}

function cerrarPantallaColibri() {
    const pantalla = document.getElementById("pantalla-colibri");
    if (pantalla) pantalla.hidden = true;
}

function mostrarPantallaRitmo() {
    ocultarResultadoMicrofono();
    rellenarSelectorRitmo();
    cerrarPantallaPajaro();
    cerrarPantallaColibri();
    document.getElementById("lista-juegos").hidden = true;
    document.body.classList.remove("vista-juegos", "vista-pajaro", "vista-colibri");
    document.body.classList.add("vista-ritmo");
    document.getElementById("pantalla-ritmo").hidden = false;
    document.getElementById("botones-inicio").style.display = "none";
    actualizarBotonAyuda();
}

function rellenarSelectorPajaro() {
    const origen = document.getElementById("selector-cancion");
    const destino = document.getElementById("selector-pajaro");
    if (!origen || !destino) return;
    const valor = destino.value || origen.value || PIEZA_PRUEBA_FRERE;
    destino.innerHTML = origen.innerHTML;
    if ([...destino.options].some(o => o.value === valor)) destino.value = valor;
    else destino.value = PIEZA_PRUEBA_FRERE;
}

function mostrarPantallaPajaro() {
    ocultarResultadoMicrofono();
    cerrarPantallaRitmo();
    cerrarPantallaColibri();
    rellenarSelectorPajaro();
    document.getElementById("lista-juegos").hidden = true;
    document.body.classList.remove("vista-juegos", "vista-ritmo", "vista-colibri");
    document.body.classList.add("vista-pajaro");
    document.getElementById("pantalla-pajaro").hidden = false;
    document.getElementById("botones-inicio").style.display = "none";
    actualizarBotonAyuda();
}

function mostrarPantallaColibri() {
    ocultarResultadoMicrofono();
    cerrarPantallaRitmo();
    cerrarPantallaPajaro();
    document.getElementById("lista-juegos").hidden = true;
    document.body.classList.remove("vista-juegos", "vista-ritmo", "vista-pajaro");
    document.body.classList.add("vista-colibri");
    document.getElementById("pantalla-colibri").hidden = false;
    document.getElementById("botones-inicio").style.display = "none";
    actualizarBotonAyuda();
}

function volverAListaJuegos() {
    cerrarPantallaRitmo();
    cerrarPantallaPajaro();
    cerrarPantallaColibri();
    document.body.classList.remove("vista-ritmo", "vista-pajaro", "vista-colibri");
    document.body.classList.add("vista-juegos");
    document.getElementById("lista-juegos").hidden = false;
    actualizarBotonAyuda();
}

function empezarJuego(numero) {
    if (numero < 1 || numero > 4) return;
    if (numero === 1) {
        mostrarPantallaRitmo();
        return;
    }
    if (numero === 2) {
        mostrarPantallaColibri();
        return;
    }
    if (numero === 3) {
        mostrarPantallaPajaro();
        return;
    }
}

function alCambiarMetronomoRitmo() {
    const check = document.getElementById("check-metronomo-ritmo");
    metronomoRitmoActivo = !!(check && check.checked);
}

function empezarRitmoConPieza() {
    const sel = document.getElementById("selector-ritmo");
    const pieza = ((sel && sel.value) || document.getElementById("selector-cancion").value || "").trim();
    if (!pieza) return;
    alCambiarMetronomoRitmo();
    piezaPendiente = pieza;
    iniciarApp("ritmo");
}

function ventanaAtaqueRitmo(indice) {
    return indice === 0 ? RITMO_VENTANA_PRIMERA : RITMO_VENTANA_OK;
}

// True si la nota cae en el primer tiempo del compás (sin anacrusa).
function notaEnPrimerTiempoDelCompas(tiempo) {
    const firma = firmaEnTiempo(Math.max(0, tiempo || 0));
    const durCompas = Math.max(0.01, (firma.pulsos || 4) * (firma.segundosPorPulso || 0.6));
    const origen = firma.time || 0;
    const pos = (((tiempo || 0) - origen) % durCompas + durCompas) % durCompas;
    return pos <= 0.06;
}

function pulsoEnCompasDeTiempo(tiempo) {
    const firma = firmaEnTiempo(Math.max(0, tiempo || 0));
    const esp = Math.max(0.01, firma.segundosPorPulso || 0.6);
    const durCompas = Math.max(0.01, (firma.pulsos || 4) * esp);
    const origen = firma.time || 0;
    const pos = (((tiempo || 0) - origen) % durCompas + durCompas) % durCompas;
    return Math.min(firma.pulsos || 4, Math.floor(pos / esp + 1e-6) + 1);
}

function esperandoAnacrusaRitmo() {
    const primera = notasRitmo[0];
    return !!(
        modoRitmo &&
        estadoRitmo === "reproduciendo" &&
        fraseActualIndex < 0 &&
        primera &&
        !notaEnPrimerTiempoDelCompas(primera.tiempo)
    );
}

function mostrarEsperaAnacrusaRitmo() {
    fraseActualIndex = -1;
    const secuencia = document.getElementById("secuencia-visual");
    if (secuencia) secuencia.innerHTML = "";
    const primera = notasRitmo[0];
    const pulso = primera ? pulsoEnCompasDeTiempo(primera.tiempo) : 1;
    const pantalla = document.getElementById("palabra-pantalla");
    if (pantalla) {
        pantalla.className = "palabra-actual cuenta";
        pantalla.innerText = String(pulso);
    }
    const evaluacion = document.getElementById("evaluacion");
    if (evaluacion) evaluacion.innerText = `Espera al tiempo ${pulso}`;
}

function limpiarLetraRitmo() {
    fraseActualIndex = -1;
    const secuencia = document.getElementById("secuencia-visual");
    if (secuencia) secuencia.innerHTML = "";
    const pantalla = document.getElementById("palabra-pantalla");
    if (pantalla) {
        pantalla.className = "palabra-actual";
        pantalla.innerText = "";
    }
}

// Con anacrusa, la 1ª letra/nota no se adelanta: aparece al llegar su tiempo.
function letraRitmoListaParaMostrar(nota, ahora) {
    if (!nota) return false;
    const primera = notasRitmo[0];
    if (
        indiceNotaRitmo === 0 &&
        primera &&
        nota === primera &&
        !nota.momento &&
        !notaEnPrimerTiempoDelCompas(primera.tiempo)
    ) {
        return ahora >= primera.tiempo - RITMO_ANTICIPO_LETRA;
    }
    return true;
}

function arrancarReproduccionRitmo(zona, anticipoMusical) {
    estadoRitmo = "reproduciendo";
    const primera = notasRitmo[0];
    const conAnacrusa = !!(primera && !notaEnPrimerTiempoDelCompas(primera.tiempo));
    if (!conAnacrusa) mostrarPalabraRitmo(0);
    activarListenersRitmo();
    if (zona) zona.focus();
    ultimoBeatMetronomoRitmo = -999;
    relojRitmo = { t0: performance.now(), tiempoBase: -(anticipoMusical || 0) };
    animacionRitmoId = requestAnimationFrame(bucleJuegoRitmo);
    actualizarMarcadorRitmo();
    // Anacrusa (p. ej. Gia en el 4.º tiempo): número + «Espera al tiempo».
    if (conAnacrusa) mostrarEsperaAnacrusaRitmo();
    actualizarControlesRitmo();
}

function beatIndexRitmo(tiempoMusical) {
    const esp = firmaEnTiempo(Math.max(0, tiempoMusical)).segundosPorPulso || 0.6;
    return Math.floor(tiempoMusical / esp + 1e-6);
}

function clicMetronomoRitmoSiToca(tiempoMusical) {
    if (!metronomoRitmoActivo || !modoRitmo) return;
    const beat = beatIndexRitmo(tiempoMusical);
    if (beat === ultimoBeatMetronomoRitmo) return;
    if (beat < -1) return;
    ultimoBeatMetronomoRitmo = beat;
    const pulsos = firmaEnTiempo(Math.max(0, tiempoMusical)).pulsos || pulsosPorCompas;
    const puesto = ((beat % pulsos) + pulsos) % pulsos; // 0 = acento
    pulsoCompasMarcado = puesto + 1;
    clicDeCompas(puesto === 0);
}

function volverAPantallaRitmo() {
    detenerJuegoRitmo();
    soltarMicrofono();
    cancelarTemporizadores();
    document.getElementById("titulo-cancion").style.display = "none";
    document.getElementById("controles-escucha").style.display = "none";
    document.getElementById("controles-karaoke").style.display = "none";
    const contRitmo = document.getElementById("controles-ritmo");
    if (contRitmo) contRitmo.style.display = "none";
    document.getElementById("status-box").style.display = "none";
    document.getElementById("evaluacion").innerHTML = "";
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("palabra-pantalla").innerText = "...";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("btn-volver-calentamiento").hidden = true;
    document.getElementById("btn-volver-ritmo").hidden = true;
    document.getElementById("zona-seleccion").style.display = "block";
    document.getElementById("botones-inicio").style.display = "none";
    mostrarPantallaRitmo();
    actualizarBotonAyuda();
}

// Recalcula time/duration con el BPM inicial (sin mapa de tempos / ritardando).
function notasSinRitardando(notasRaw, datosNotas) {
    const lista = Array.isArray(notasRaw) ? notasRaw : [];
    const header = (datosNotas && datosNotas.header) || {};
    const tempos = header.tempos || [];
    if (tempos.length <= 1) return lista.slice();
    const bpm = (tempos[0] && tempos[0].bpm) || 100;
    const ppq = header.ppq || 480;
    const segPorTick = (60 / bpm) / ppq;
    return lista.map(n => {
        const copia = Object.assign({}, n);
        if (typeof n.ticks === "number") copia.time = n.ticks * segPorTick;
        if (typeof n.durationTicks === "number") copia.duration = n.durationTicks * segPorTick;
        return copia;
    });
}

function construirNotasRitmo() {
    const lista = [];
    FRASES_JUEGO.forEach((palabra, indicePalabra) => {
        palabra.notesIngles.forEach((ingles, indiceNota) => {
            lista.push({
                palabraIndex: indicePalabra,
                notaIndex: indiceNota,
                tiempo: palabra.tiempos[indiceNota],
                duracion: palabra.duraciones[indiceNota] || 0.4,
                ingles,
                nombre: palabra.notes[indiceNota],
                momento: null,   // 'bien' | 'ok' | 'mal' | null
                duracionOk: null
            });
        });
    });
    return lista;
}

function tiempoActualRitmo() {
    return relojRitmo.tiempoBase + (performance.now() - relojRitmo.t0) / 1000 * velocidadRitmo;
}

function cambiarVelocidadRitmo(valor) {
    const nueva = Math.max(0.5, Math.min(2, Number(valor) || 1));
    const etiqueta = document.getElementById("txt-velocidad-ritmo");
    const control = document.getElementById("velocidad-ritmo");
    if (etiqueta) etiqueta.textContent = `×${nueva.toFixed(2).replace(/\.?0+$/, "")}`;
    if (control && Number(control.value) !== nueva) control.value = String(nueva);
    if (modoRitmo && (estadoRitmo === "reproduciendo" || estadoRitmo === "pausada")) {
        const ahora = tiempoActualRitmo();
        relojRitmo = { t0: performance.now(), tiempoBase: ahora };
    }
    velocidadRitmo = nueva;
}

function actualizarControlesRitmo() {
    const caja = document.getElementById("controles-ritmo");
    if (!caja) return;
    caja.style.display = modoRitmo ? "flex" : "none";
    if (!modoRitmo) return;
    const enMarcha = estadoRitmo === "reproduciendo" || estadoRitmo === "cuenta";
    document.getElementById("btn-pausa-ritmo").style.display = enMarcha ? "inline-block" : "none";
    document.getElementById("btn-seguir-ritmo").style.display = estadoRitmo === "pausada" ? "inline-block" : "none";
    document.getElementById("btn-repetir-ritmo").style.display = estadoRitmo === "fin" ? "inline-block" : "none";
}

function pausarRitmo() {
    if (!modoRitmo || (estadoRitmo !== "reproduciendo" && estadoRitmo !== "cuenta")) return;
    if (estadoRitmo === "reproduciendo") {
        relojRitmo = { t0: performance.now(), tiempoBase: tiempoActualRitmo() };
    }
    if (pulsacionRitmo) soltarPulsacionRitmo(pulsacionRitmo.origen);
    silenciarMelodia();
    if (animacionRitmoId) {
        cancelAnimationFrame(animacionRitmoId);
        animacionRitmoId = 0;
    }
    idGuia++; // cancela la cuenta atrás si estaba en marcha
    estadoRitmo = "pausada";
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona) {
        zona.classList.remove("pulsando");
        zona.hidden = false;
    }
    const aviso = document.getElementById("aviso-ritmo");
    if (aviso) aviso.textContent = "Pulsa la pantalla o la barra espaciadora para seguir.";
    document.getElementById("evaluacion").innerText = "⏸ Ritmo en pausa · pulsa para seguir";
    actualizarControlesRitmo();
    actualizarLucesCompas();
}

function seguirRitmo() {
    if (!modoRitmo || estadoRitmo !== "pausada") return;
    if (indiceNotaRitmo >= notasRitmo.length) {
        terminarJuegoRitmo();
        return;
    }
    estadoRitmo = "reproduciendo";
    relojRitmo = { t0: performance.now(), tiempoBase: relojRitmo.tiempoBase };
    ultimoBeatMetronomoRitmo = beatIndexRitmo(relojRitmo.tiempoBase) - 1;
    const aviso = document.getElementById("aviso-ritmo");
    if (aviso) aviso.textContent = "Pulsa la pantalla o la barra espaciadora al ritmo. Mantén para la duración.";
    activarListenersRitmo();
    animacionRitmoId = requestAnimationFrame(bucleJuegoRitmo);
    actualizarMarcadorRitmo();
    actualizarControlesRitmo();
}

function detenerJuegoRitmo() {
    if (animacionRitmoId) {
        cancelAnimationFrame(animacionRitmoId);
        animacionRitmoId = 0;
    }
    quitarListenersRitmo();
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona) {
        zona.hidden = true;
        zona.classList.remove("pulsando");
    }
    if (pulsacionRitmo) {
        silenciarMelodia();
        pulsacionRitmo = null;
    }
    modoRitmo = false;
    estadoRitmo = "fin";
    const caja = document.getElementById("controles-ritmo");
    if (caja) caja.style.display = "none";
    actualizarBotonAyuda();
}

function activarListenersRitmo() {
    if (listenersRitmoActivos) return;
    listenersRitmoActivos = true;
    document.body.classList.add("jugando-ritmo");
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona) {
        zona.addEventListener("pointerdown", onRitmoPointerDown);
        zona.addEventListener("pointerup", onRitmoPointerUp);
        zona.addEventListener("pointercancel", onRitmoPointerUp);
        // En móvil, touchstart con preventDefault evita la lupa y el menú al mantener.
        zona.addEventListener("touchstart", onRitmoTouchStart, { passive: false });
        zona.addEventListener("touchend", onRitmoTouchEnd, { passive: false });
        zona.addEventListener("touchcancel", onRitmoTouchEnd, { passive: false });
        zona.addEventListener("contextmenu", onRitmoContextMenu);
    }
    window.addEventListener("keydown", onRitmoKeyDown);
    window.addEventListener("keyup", onRitmoKeyUp);
}

function quitarListenersRitmo() {
    if (!listenersRitmoActivos) return;
    listenersRitmoActivos = false;
    document.body.classList.remove("jugando-ritmo");
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona) {
        zona.removeEventListener("pointerdown", onRitmoPointerDown);
        zona.removeEventListener("pointerup", onRitmoPointerUp);
        zona.removeEventListener("pointercancel", onRitmoPointerUp);
        zona.removeEventListener("touchstart", onRitmoTouchStart);
        zona.removeEventListener("touchend", onRitmoTouchEnd);
        zona.removeEventListener("touchcancel", onRitmoTouchEnd);
        zona.removeEventListener("contextmenu", onRitmoContextMenu);
    }
    window.removeEventListener("keydown", onRitmoKeyDown);
    window.removeEventListener("keyup", onRitmoKeyUp);
}

function onRitmoContextMenu(ev) {
    ev.preventDefault();
}

function onRitmoTouchStart(ev) {
    if (!modoRitmo) return;
    ev.preventDefault();
    if (estadoRitmo === "pausada") {
        seguirRitmo();
        return;
    }
    if (estadoRitmo !== "reproduciendo") return;
    iniciarPulsacionRitmo("touch");
}

function onRitmoTouchEnd(ev) {
    if (!modoRitmo) return;
    ev.preventDefault();
    if (estadoRitmo !== "reproduciendo") return;
    soltarPulsacionRitmo("touch");
}

function onRitmoPointerDown(ev) {
    if (!modoRitmo) return;
    // En táctil ya gestiona touchstart (así se puede cancelar la lupa del sistema).
    if (ev.pointerType === "touch") return;
    if (estadoRitmo === "pausada") {
        ev.preventDefault();
        seguirRitmo();
        return;
    }
    if (estadoRitmo !== "reproduciendo") return;
    ev.preventDefault();
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona && ev.pointerId != null) {
        try { zona.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    iniciarPulsacionRitmo("pointer");
}

function onRitmoPointerUp(ev) {
    if (!modoRitmo || estadoRitmo !== "reproduciendo") return;
    if (ev && ev.pointerType === "touch") return;
    if (ev) ev.preventDefault();
    soltarPulsacionRitmo("pointer");
}

function onRitmoKeyDown(ev) {
    if (!modoRitmo) return;
    if (ev.repeat) return;
    if (ev.code !== "Space" && ev.key !== " " && ev.code !== "Enter") return;
    ev.preventDefault();
    if (estadoRitmo === "pausada") {
        seguirRitmo();
        return;
    }
    if (estadoRitmo !== "reproduciendo") return;
    iniciarPulsacionRitmo("tecla");
}

function onRitmoKeyUp(ev) {
    if (!modoRitmo || estadoRitmo !== "reproduciendo") return;
    if (ev.code !== "Space" && ev.key !== " " && ev.code !== "Enter") return;
    ev.preventDefault();
    soltarPulsacionRitmo("tecla");
}

function mostrarPalabraRitmo(indicePalabra) {
    if (!FRASES_JUEGO[indicePalabra]) return;
    fraseActualIndex = indicePalabra;
    cargarNuevaFrasePalabra(true);
    resaltarNotaRitmo();
}

function claseColorRitmo(juzgada) {
    if (!juzgada || !juzgada.momento) return null;
    const momento = juzgada.momento;
    const duracion = juzgada.duracionOk;
    // Mientras se mantiene, solo el ataque; al soltar, el peor de momento y duración.
    if (!duracion) {
        if (momento === "bien") return "ritmo-bien";
        if (momento === "ok") return "ritmo-regular";
        return "ritmo-mal";
    }
    if (momento === "mal" || duracion === "mal") return "ritmo-mal";
    if (momento === "bien" && duracion === "bien") return "ritmo-bien";
    return "ritmo-regular";
}

function resaltarNotaRitmo() {
    const notaActual = notasRitmo[indiceNotaRitmo];
    const palabra = FRASES_JUEGO[fraseActualIndex];
    if (!palabra) return;
    for (let k = 0; k < palabra.notes.length; k++) {
        const caja = document.getElementById(`caja-nota-${k}`);
        if (!caja) continue;
        const juzgada = notasRitmo.find(n => n.palabraIndex === fraseActualIndex && n.notaIndex === k && n.momento);
        const color = claseColorRitmo(juzgada);
        if (color) {
            caja.className = `nota-caja ${color}`;
        } else {
            const esActual = notaActual && notaActual.palabraIndex === fraseActualIndex && k === notaActual.notaIndex;
            caja.className = esActual ? "nota-caja activa" : "nota-caja";
        }
    }
}

function claseMomentoRitmo(errorAbs) {
    if (errorAbs <= RITMO_VENTANA_BIEN) return "bien";
    if (errorAbs <= RITMO_VENTANA_OK) return "ok";
    return "mal";
}

function claseDuracionRitmo(hold, esperada) {
    // hold es tiempo real; la duración musical se acorta/alarga con la velocidad.
    const ref = Math.max(0.12, (esperada || 0.4) / Math.max(0.5, velocidadRitmo));
    const rel = Math.abs(hold - ref) / ref;
    if (rel <= RITMO_DURACION_BIEN) return "bien";
    if (rel <= RITMO_DURACION_OK) return "ok";
    return "mal";
}

function actualizarMarcadorRitmo() {
    if (esperandoAnacrusaRitmo()) {
        const pulso = pulsoEnCompasDeTiempo(notasRitmo[0].tiempo);
        document.getElementById("evaluacion").innerText = `Espera al tiempo ${pulso}`;
        return;
    }
    const total = notasRitmo.length;
    const van = Math.min(indiceNotaRitmo + 1, total);
    document.getElementById("evaluacion").innerText =
        `Ritmo · momento ${aciertosMomentoRitmo}/${notasJuzgadasRitmo || 0} · duración ${aciertosDuracionRitmo}/${notasJuzgadasRitmo || 0} · nota ${van} de ${total}`;
}

function iniciarPulsacionRitmo(origen) {
    if (pulsacionRitmo) return;
    const ahoraMusical = tiempoActualRitmo();
    // Solo cuenta si la pulsación cae dentro de la ventana de una nota pendiente.
    // Si no, se ignora (p. ej. silencio o anacrusa antes de la primera nota).
    let candidata = -1;
    let mejor = Infinity;
    for (let i = indiceNotaRitmo; i < Math.min(notasRitmo.length, indiceNotaRitmo + 4); i++) {
        const n = notasRitmo[i];
        if (n.momento) continue;
        const err = Math.abs(ahoraMusical - n.tiempo);
        if (err <= ventanaAtaqueRitmo(i) && err < mejor) {
            mejor = err;
            candidata = i;
        }
    }
    if (candidata < 0) return;

    // Si nos hemos pasado de notas anteriores sin pulsarlas, márcalas fallidas.
    while (indiceNotaRitmo < candidata) {
        marcarFalloRitmo(indiceNotaRitmo, "sin pulsar");
        indiceNotaRitmo++;
    }

    const nota = notasRitmo[candidata];
    indiceNotaRitmo = candidata;
    if (nota.palabraIndex !== fraseActualIndex) mostrarPalabraRitmo(nota.palabraIndex);

    const momento = claseMomentoRitmo(Math.abs(ahoraMusical - nota.tiempo));
    nota.momento = momento;
    if (momento === "bien" || momento === "ok") aciertosMomentoRitmo++;

    pulsacionRitmo = {
        origen,
        inicioMs: performance.now(),
        notaIndex: candidata
    };
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona) zona.classList.add("pulsando");
    sonarNota(nota.ingles, Math.max(nota.duracion, 0.8), VOLUMEN_MELODIA_GUIA);
    resaltarNotaRitmo();
    actualizarMarcadorRitmo();
}

function soltarPulsacionRitmo(origen) {
    if (!pulsacionRitmo || pulsacionRitmo.origen !== origen) return;
    const hold = (performance.now() - pulsacionRitmo.inicioMs) / 1000;
    const nota = notasRitmo[pulsacionRitmo.notaIndex];
    silenciarMelodia();
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona) zona.classList.remove("pulsando");
    pulsacionRitmo = null;
    if (!nota) return;

    const duracionOk = claseDuracionRitmo(hold, nota.duracion);
    nota.duracionOk = duracionOk;
    notasJuzgadasRitmo++;
    if (duracionOk === "bien" || duracionOk === "ok") aciertosDuracionRitmo++;
    resaltarNotaRitmo();
    actualizarMarcadorRitmo();

    if (pulsacionRitmo === null && indiceNotaRitmo === notasRitmo.indexOf(nota)) {
        indiceNotaRitmo++;
        if (indiceNotaRitmo >= notasRitmo.length) {
            terminarJuegoRitmo();
            return;
        }
        const siguiente = notasRitmo[indiceNotaRitmo];
        if (siguiente.palabraIndex !== fraseActualIndex) mostrarPalabraRitmo(siguiente.palabraIndex);
        else resaltarNotaRitmo();
    }
}

function marcarFalloRitmo(indice, motivo) {
    const nota = notasRitmo[indice];
    if (!nota || nota.momento) return;
    nota.momento = "mal";
    nota.duracionOk = "mal";
    notasJuzgadasRitmo++;
    if (nota.palabraIndex === fraseActualIndex) resaltarNotaRitmo();
}

function bucleJuegoRitmo() {
    if (!modoRitmo || estadoRitmo !== "reproduciendo") {
        animacionRitmoId = 0;
        return;
    }
    const ahora = tiempoActualRitmo();
    clicMetronomoRitmoSiToca(ahora);
    if (pulsacionRitmo) {
        const notaHold = notasRitmo[pulsacionRitmo.notaIndex];
        if (notaHold && ahora > notaHold.tiempo + Math.max(notaHold.duracion, 0.4) + RITMO_VENTANA_OK) {
            soltarPulsacionRitmo(pulsacionRitmo.origen);
        }
    }
    // Notas que ya pasaron la ventana sin pulsación → fallo
    while (indiceNotaRitmo < notasRitmo.length) {
        const nota = notasRitmo[indiceNotaRitmo];
        if (nota.momento) {
            if (!pulsacionRitmo && nota.duracionOk) indiceNotaRitmo++;
            else break;
        } else if (ahora > nota.tiempo + ventanaAtaqueRitmo(indiceNotaRitmo)) {
            marcarFalloRitmo(indiceNotaRitmo, "tarde");
            indiceNotaRitmo++;
            if (indiceNotaRitmo >= notasRitmo.length) {
                terminarJuegoRitmo();
                return;
            }
            const siguiente = notasRitmo[indiceNotaRitmo];
            if (letraRitmoListaParaMostrar(siguiente, ahora)) {
                if (siguiente.palabraIndex !== fraseActualIndex) mostrarPalabraRitmo(siguiente.palabraIndex);
                else resaltarNotaRitmo();
            }
            actualizarMarcadorRitmo();
        } else {
            if (letraRitmoListaParaMostrar(nota, ahora)) {
                if (nota.palabraIndex !== fraseActualIndex) mostrarPalabraRitmo(nota.palabraIndex);
                else resaltarNotaRitmo();
            }
            break;
        }
    }
    animacionRitmoId = requestAnimationFrame(bucleJuegoRitmo);
}

function iniciarJuegoRitmo() {
    detenerJuegoRitmo();
    soltarMicrofono();
    notasRitmo = construirNotasRitmo();
    if (!notasRitmo.length) return;
    cambiarVelocidadRitmo(0.6);
    modoRitmo = true;
    estadoRitmo = "cuenta";
    indiceNotaRitmo = 0;
    aciertosMomentoRitmo = 0;
    aciertosDuracionRitmo = 0;
    notasJuzgadasRitmo = 0;
    pulsacionRitmo = null;
    document.getElementById("controles-escucha").style.display = "none";
    document.getElementById("controles-karaoke").style.display = "none";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("btn-volver-ritmo").hidden = false;
    const zona = document.getElementById("zona-pulso-ritmo");
    zona.hidden = false;
    zona.classList.remove("pulsando");
    document.getElementById("aviso-ritmo").textContent =
        "Pulsa la pantalla o la barra espaciadora al ritmo. Mantén para la duración.";
    limpiarLetraRitmo();
    actualizarMarcadorRitmo();
    restaurarCompasInicial();
    alCambiarMetronomoRitmo();
    ultimoBeatMetronomoRitmo = -999;
    actualizarControlesRitmo();
    actualizarBotonAyuda();
    // Cuenta de un compás, luego arranca el reloj musical en 0.
    estadoRitmo = "cuenta";
    pulsoCompasMarcado = 0;
    actualizarLucesCompas();
    idGuia++;
    const idEjecucion = idGuia;
    let quedan = pulsosPorCompas;
    const primeraEnDownbeat = !!(notasRitmo[0] && notaEnPrimerTiempoDelCompas(notasRitmo[0].tiempo));
    const pulsar = () => {
        if (!modoRitmo || idEjecucion !== idGuia || estadoRitmo === "pausada") return;
        if (quedan < 1) {
            // Piezas con anacrusa: arranque en 0 tras la cuenta.
            arrancarReproduccionRitmo(zona, 0);
            return;
        }
        mostrarCuentaKaraoke(String(quedan), "");
        pulsoCompasMarcado = pulsosPorCompas - quedan + 1;
        actualizarLucesCompas();
        if (metronomoRitmoActivo) clicDeCompas(quedan === pulsosPorCompas);
        // Si la 1ª nota es el primer tiempo, el pulso tras el «1» es ya su ataque.
        if (quedan === 1 && primeraEnDownbeat) {
            arrancarReproduccionRitmo(zona, segundosPorPulso);
            return;
        }
        quedan--;
        setTimeout(pulsar, segundosPorPulso * 1000 / velocidadRitmo);
    };
    setTimeout(pulsar, 200);
}

function terminarJuegoRitmo() {
    if (!modoRitmo || estadoRitmo === "fin") return;
    if (pulsacionRitmo) {
        silenciarMelodia();
        pulsacionRitmo = null;
    }
    estadoRitmo = "fin";
    quitarListenersRitmo();
    if (animacionRitmoId) {
        cancelAnimationFrame(animacionRitmoId);
        animacionRitmoId = 0;
    }
    const zona = document.getElementById("zona-pulso-ritmo");
    if (zona) {
        zona.classList.remove("pulsando");
        zona.hidden = true;
    }
    const total = Math.max(1, notasRitmo.length);
    const pctMomento = Math.round((aciertosMomentoRitmo * 100) / total);
    const pctDuracion = Math.round((aciertosDuracionRitmo * 100) / total);
    document.getElementById("palabra-pantalla").innerHTML =
        `Ritmo <img src="./imagenes/tambor-ritmo.jpg?v=2" alt="" class="icono-tambor icono-tambor-titulo">`;
    document.getElementById("secuencia-visual").innerHTML = "";
    const resumen = document.createElement("div");
    resumen.className = "resumen-final";
    resumen.innerHTML =
        `<div class="resumen-logro">Momento: ${aciertosMomentoRitmo} de ${total} (${pctMomento}%).</div>` +
        `<div class="resumen-logro">Duración: ${aciertosDuracionRitmo} de ${total} (${pctDuracion}%).</div>` +
        `<div class="resumen-titulo">${pctMomento >= 70 && pctDuracion >= 70 ? "Buen pulso. El ritmo ya va contigo." : "Sigue ensayando: el oído interno se entrena pulsando."}</div>`;
    document.getElementById("secuencia-visual").appendChild(resumen);
    document.getElementById("evaluacion").innerHTML =
        `<span class="success">Momento ${pctMomento}% · Duración ${pctDuracion}%</span>`;
    anotarJuegoHoy("Ritmo", {
        momento: pctMomento,
        duracion: pctDuracion,
        aciertosMomento: aciertosMomentoRitmo,
        aciertosDuracion: aciertosDuracionRitmo,
        total
    });
    document.getElementById("zona-reinicio").style.display = "flex";
    actualizarControlesRitmo();
    actualizarLucesCompas();
}

// ==========================================
// JUEGO 2: PÁJARO Y CEREZAS (tono de la voz)
// ==========================================
function midiAPorcentajePajaro(midi) {
    const acotado = Math.max(escenaMidiMin, Math.min(escenaMidiMax, midi));
    return ((escenaMidiMax - acotado) / Math.max(0.01, escenaMidiMax - escenaMidiMin)) * 100;
}

function actualizarMarcadorPajaro() {
    const el = document.getElementById("marcador-pajaro");
    const total = Math.max(1, melodiaPajaroBase.length || cerezasPajaro.length);
    if (el) el.textContent = `${aciertosPajaro} / ${total}`;
}

function pintarLineasPajaro() {
    const caja = document.getElementById("lineas-pajaro");
    if (!caja) return;
    caja.innerHTML = "";
    const midis = new Set(cerezasPajaro.map(c => c.midi));
    midis.add(midiBasePajaro);
    [...midis].sort((a, b) => a - b).forEach(midi => {
        const linea = document.createElement("div");
        linea.className = "linea-tono-pajaro" + (midi === midiBasePajaro ? " base" : "");
        linea.style.top = midiAPorcentajePajaro(midi) + "%";
        caja.appendChild(linea);
    });
}

function tiempoActualPajaro() {
    return relojPajaro.tiempoBase + (performance.now() - relojPajaro.t0) / 1000 * velocidadPajaro;
}

function cambiarVelocidadPajaro(valor) {
    const nueva = Math.max(0.5, Math.min(2, Number(valor) || 1));
    const etiqueta = document.getElementById("txt-velocidad-pajaro");
    const control = document.getElementById("velocidad-pajaro");
    if (etiqueta) etiqueta.textContent = `×${nueva.toFixed(2).replace(/\.?0+$/, "")}`;
    if (control && Number(control.value) !== nueva) control.value = String(nueva);
    if (modoPajaro && (estadoPajaro === "jugando" || estadoPajaro === "pausada")) {
        const ahora = tiempoActualPajaro();
        relojPajaro = { t0: performance.now(), tiempoBase: ahora };
    }
    velocidadPajaro = nueva;
}

function actualizarControlesPajaro() {
    const caja = document.getElementById("controles-pajaro");
    if (!caja) return;
    caja.style.display = modoPajaro ? "flex" : "none";
    if (!modoPajaro) return;
    document.getElementById("btn-pausa-pajaro").style.display = estadoPajaro === "jugando" ? "inline-block" : "none";
    document.getElementById("btn-seguir-pajaro").style.display = estadoPajaro === "pausada" ? "inline-block" : "none";
    document.getElementById("btn-repetir-pajaro").style.display = estadoPajaro === "fin" ? "inline-block" : "none";
}

function pausarPajaro() {
    if (!modoPajaro || estadoPajaro !== "jugando") return;
    relojPajaro = { t0: performance.now(), tiempoBase: tiempoActualPajaro() };
    silenciarMelodia();
    if (animacionPajaroId) {
        cancelAnimationFrame(animacionPajaroId);
        animacionPajaroId = 0;
    }
    estadoPajaro = "pausada";
    const pajaro = document.getElementById("pajaro");
    if (pajaro) pajaro.classList.remove("cantando");
    document.getElementById("evaluacion").innerText = "⏸ Pájaro en pausa";
    actualizarControlesPajaro();
}

function seguirPajaro() {
    if (!modoPajaro || estadoPajaro !== "pausada") return;
    if (!cerezasPajaro.length || cerezasPajaro.every(c => c.recogida || c.fallida)) {
        terminarJuegoPajaro();
        return;
    }
    estadoPajaro = "jugando";
    relojPajaro = { t0: performance.now(), tiempoBase: relojPajaro.tiempoBase };
    document.getElementById("evaluacion").innerText = "Recoge cada cereza con la voz";
    animacionPajaroId = requestAnimationFrame(bucleJuegoPajaro);
    actualizarControlesPajaro();
}

function detenerJuegoPajaro() {
    if (animacionPajaroId) {
        cancelAnimationFrame(animacionPajaroId);
        animacionPajaroId = 0;
    }
    modoPajaro = false;
    estadoPajaro = "fin";
    midiSuavePajaro = null;
    cerezasPajaro = [];
    const escenario = document.getElementById("escenario-pajaro");
    if (escenario) escenario.hidden = true;
    const cerezas = document.getElementById("cerezas-pajaro");
    if (cerezas) cerezas.innerHTML = "";
    const cont = document.getElementById("controles-pajaro");
    if (cont) cont.style.display = "none";
    const btnVolver = document.getElementById("btn-volver-pajaro");
    if (btnVolver) btnVolver.hidden = true;
    actualizarBotonAyuda();
}

function volverAPantallaPajaro() {
    detenerJuegoPajaro();
    soltarMicrofono();
    cancelarTemporizadores();
    document.getElementById("titulo-cancion").style.display = "none";
    document.getElementById("controles-escucha").style.display = "none";
    document.getElementById("controles-karaoke").style.display = "none";
    const contRitmo = document.getElementById("controles-ritmo");
    if (contRitmo) contRitmo.style.display = "none";
    const contPajaro = document.getElementById("controles-pajaro");
    if (contPajaro) contPajaro.style.display = "none";
    document.getElementById("status-box").style.display = "none";
    document.getElementById("evaluacion").innerHTML = "";
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("palabra-pantalla").innerText = "...";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("btn-volver-calentamiento").hidden = true;
    document.getElementById("btn-volver-ritmo").hidden = true;
    document.getElementById("btn-volver-pajaro").hidden = true;
    document.getElementById("zona-seleccion").style.display = "block";
    document.getElementById("botones-inicio").style.display = "none";
    mostrarPantallaPajaro();
    actualizarBotonAyuda();
}

async function cargarMelodiaPajaro(pieza) {
    const [resNotas, resTexto] = await Promise.all([
        cargarArchivoCancion(`${pieza}.json`),
        cargarArchivoCancion(`${pieza} txt.json`)
    ]);
    if (!resNotas.ok) {
        throw new Error(`No se encuentra «${pieza}.json» en la carpeta "canciones".`);
    }
    const datosNotas = await resNotas.json();
    let notasRaw = datosNotas.notes || datosNotas;
    if (datosNotas.tracks && Array.isArray(datosNotas.tracks)) {
        const pista = datosNotas.tracks.find(t => t.notes && t.notes.length > 0);
        if (pista) notasRaw = pista.notes;
    }
    if (!Array.isArray(notasRaw) || !notasRaw.length) {
        throw new Error("Esta pieza no tiene notas para el pájaro.");
    }

    let titulo = pieza;
    let lineasLetra = [];
    if (resTexto.ok) {
        try {
            let datosTexto = await resTexto.json();
            if (datosTexto.default) datosTexto = datosTexto.default;
            if (datosTexto.titulo) titulo = datosTexto.titulo;
            if (datosTexto.lineas && Array.isArray(datosTexto.lineas)) lineasLetra = datosTexto.lineas;
            else if (Array.isArray(datosTexto)) lineasLetra = datosTexto;
        } catch (e) { /* sin letra: las cerezas van sin sílaba */ }
    }

    const frases = armarFrasesDesdeLineas(lineasLetra, notasRaw);
    const silabasPlanas = [];
    frases.forEach(f => (f.silabas || []).forEach(s => silabasPlanas.push(s)));

    const t0 = typeof notasRaw[0].time === "number" ? notasRaw[0].time : 0;
    melodiaPajaroBase = notasRaw.map((n, i) => ({
        midi: typeof n.midi === "number" ? n.midi : midiDesdeNombreIngles(n.name || n.note || "A3"),
        tiempo: (typeof n.time === "number" ? n.time : 0) - t0,
        duracion: n.duration || 0.4,
        silaba: silabasPlanas[i] || ""
    }));
    tituloCancionActual = titulo;
    cancionActual = pieza;
}

function prepararPantallaJuegoPajaro() {
    document.body.classList.remove("vista-juegos", "vista-ritmo", "vista-pajaro", "vista-colibri");
    document.getElementById("botones-inicio").style.display = "none";
    document.getElementById("zona-seleccion").style.display = "none";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("status-box").style.display = "block";
    document.getElementById("btn-volver-calentamiento").hidden = true;
    document.getElementById("btn-volver-ritmo").hidden = true;
    document.getElementById("btn-volver-pajaro").hidden = false;
    const btnColibri = document.getElementById("btn-volver-colibri");
    if (btnColibri) btnColibri.hidden = true;
    document.getElementById("controles-escucha").style.display = "none";
    document.getElementById("controles-karaoke").style.display = "none";
    const contRitmo = document.getElementById("controles-ritmo");
    if (contRitmo) contRitmo.style.display = "none";
    const contColibri = document.getElementById("controles-colibri");
    if (contColibri) contColibri.style.display = "none";
    const zonaRitmo = document.getElementById("zona-pulso-ritmo");
    if (zonaRitmo) zonaRitmo.hidden = true;
    const escenarioColibri = document.getElementById("escenario-colibri");
    if (escenarioColibri) escenarioColibri.hidden = true;
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("evaluacion").innerHTML = "";
    const elTitulo = document.getElementById("titulo-cancion");
    if (elTitulo && tituloCancionActual) {
        elTitulo.textContent = `· 🎼 ${tituloCancionActual}`;
        elTitulo.style.display = "inline";
    }
}

async function empezarPajaroConPieza() {
    const sel = document.getElementById("selector-pajaro");
    const pieza = ((sel && sel.value) || PIEZA_PRUEBA_FRERE).trim();
    if (!pieza) return;
    try {
        detenerPruebaMicrofono();
        cancelarTemporizadores();
        cerrarPantallaPajaro();
        await cargarMelodiaPajaro(pieza);
        prepararPantallaJuegoPajaro();

        cambiarVelocidadPajaro(0.6);

        await cargarPiano();
        await asegurarMicrofono("entrenamiento");

        modoPajaro = true;
        aciertosPajaro = 0;
        midiSuavePajaro = null;
        actualizarBotonAyuda();
        if (esPiezaConCalibracion(pieza)) iniciarCalibracionPajaro();
        else prepararEntradaPajaro();
        actualizarControlesPajaro();

        if (!bucleAudioActivo) {
            bucleAudioActivo = true;
            bucleDeAudio();
        }
    } catch (err) {
        document.getElementById("status-box").style.display = "block";
        document.getElementById("palabra-pantalla").innerText = "Error";
        document.getElementById("evaluacion").innerHTML =
            `<span class='error'>❌ Error: ${err.message}</span>`;
        document.getElementById("zona-reinicio").style.display = "flex";
        document.getElementById("btn-volver-pajaro").hidden = false;
    }
}

function reiniciarJuegoPajaro() {
    if (!melodiaPajaroBase.length) {
        empezarPajaroConPieza();
        return;
    }
    if (animacionPajaroId) {
        cancelAnimationFrame(animacionPajaroId);
        animacionPajaroId = 0;
    }
    silenciarMelodia();
    idGuia++; // cancela el tono de entrada si estaba sonando
    aciertosPajaro = 0;
    midiSuavePajaro = null;
    cerezasPajaro = [];
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("secuencia-visual").innerHTML = "";
    const escenario = document.getElementById("escenario-pajaro");
    if (escenario) escenario.hidden = true;
    if (esPiezaConCalibracion(cancionActual)) iniciarCalibracionPajaro();
    else prepararEntradaPajaro();
    actualizarControlesPajaro();
}

function prepararEntradaPajaro() {
    if (!melodiaPajaroBase.length) return;
    estadoPajaro = "prep";
    muestrasCalibracion = [];
    ponerGuiaSonando(false);
    document.getElementById("btn-anterior").style.visibility = "hidden";
    document.getElementById("btn-siguiente").style.visibility = "hidden";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("escenario-pajaro").hidden = true;
    document.getElementById("secuencia-visual").innerHTML = "";

    midiBasePajaro = melodiaPajaroBase[0].midi;
    midiSuavePajaro = midiBasePajaro;
    const nombre = nombreEspanolDesdeMidi(midiBasePajaro);
    document.getElementById("palabra-pantalla").innerText = nombre;
    document.getElementById("evaluacion").innerText = "Tono · escucha la primera nota";
    actualizarControlesPajaro();

    idGuia++;
    const idEjecucion = idGuia;
    const duracionTono = Math.max(1.2, 1.6 / velocidadPajaro);
    sonarNota(nombreInglesDesdeMidi(midiBasePajaro), duracionTono, VOLUMEN_MELODIA_GUIA);
    setTimeout(() => {
        if (!modoPajaro || estadoPajaro !== "prep" || idEjecucion !== idGuia) return;
        silenciarMelodia();
        arrancarPartidaPajaro();
    }, Math.max(1200, duracionTono * 1000));
}

function iniciarCalibracionPajaro() {
    estadoPajaro = "calibracion";
    muestrasCalibracion = [];
    ponerGuiaSonando(false);
    document.getElementById("btn-anterior").style.visibility = "hidden";
    document.getElementById("btn-siguiente").style.visibility = "hidden";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("escenario-pajaro").hidden = true;
    document.getElementById("palabra-pantalla").innerText = "🎤 Canta tu primera nota";
    const nombrePieza = tituloCancionActual || "la melodía";
    document.getElementById("secuencia-visual").innerHTML =
        "<div style='font-size:16px; color:#aaa; line-height:1.5; max-width:420px;'>" +
        "Elige una nota cómoda, ni muy grave ni muy aguda, y mantenla un momento. " +
        `Las cerezas seguirán «${nombrePieza}» a partir de esa nota.</div>`;
    document.getElementById("evaluacion").innerText = "Esperando tu voz...";
    actualizarControlesPajaro();
}

function procesarCalibracionPajaro() {
    if (!modoPajaro || estadoPajaro !== "calibracion") return;
    const mensaje = document.getElementById("evaluacion");
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
        mensaje.innerText =
            `${nombre} queda fuera de rango. Prueba con una nota entre ` +
            `${nombreEspanolDesdeMidi(MIDI_MIN_PRIMERA_NOTA)} y ${nombreEspanolDesdeMidi(MIDI_MAX_PRIMERA_NOTA)}.`;
        muestrasCalibracion = [];
        return;
    }

    muestrasCalibracion = [];
    midiBasePajaro = notaMidi;
    midiSuavePajaro = notaMidi;
    estadoPajaro = "prep";
    mensaje.innerHTML = `<span class='success'>✔ Primera nota: ${nombre}. ¡Allá vamos!</span>`;
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("palabra-pantalla").innerHTML = tituloPajaroHtml(false);
    actualizarControlesPajaro();

    ponerGuiaSonando(true);
    sonarNota(nombreInglesDesdeMidi(notaMidi), 1.1, VOLUMEN_MELODIA_GUIA);
    setTimeout(() => {
        if (!modoPajaro || estadoPajaro !== "prep") return;
        ponerGuiaSonando(false);
        arrancarPartidaPajaro();
    }, 1400);
}

function arrancarPartidaPajaro() {
    if (!modoPajaro || !melodiaPajaroBase.length) return;
    estadoPajaro = "jugando";
    aciertosPajaro = 0;
    const midiOriginal0 = melodiaPajaroBase[0].midi;
    const desplazamiento = midiBasePajaro - midiOriginal0;
    const midis = melodiaPajaroBase.map(n => n.midi + desplazamiento);
    escenaMidiMin = Math.min(...midis) - 1;
    escenaMidiMax = Math.max(...midis) + 1;

    document.getElementById("evaluacion").innerText = "Recoge cada cereza con la voz";
    document.getElementById("secuencia-visual").innerHTML = "";
    const escenario = document.getElementById("escenario-pajaro");
    escenario.hidden = false;
    const pajaro = document.getElementById("pajaro");
    pajaro.style.top = midiAPorcentajePajaro(midiBasePajaro) + "%";
    pajaro.classList.remove("recogiendo", "cantando");

    const cajaCerezas = document.getElementById("cerezas-pajaro");
    cajaCerezas.innerHTML = "";
    cerezasPajaro = melodiaPajaroBase.map((nota, i) => {
        const midi = midis[i];
        const el = document.createElement("div");
        el.className = "cereza-pajaro";
        const icono = document.createElement("span");
        icono.className = "cereza-icono";
        icono.setAttribute("aria-hidden", "true");
        icono.textContent = "🍒";
        const textoSilaba = document.createElement("span");
        textoSilaba.className = "cereza-silaba";
        textoSilaba.textContent = nota.silaba || "";
        el.appendChild(icono);
        el.appendChild(textoSilaba);
        el.style.top = midiAPorcentajePajaro(midi) + "%";
        el.style.left = "110%";
        cajaCerezas.appendChild(el);
        return {
            midi,
            duracion: nota.duracion,
            tLlegada: nota.tiempo,
            silaba: nota.silaba || "",
            el,
            recogida: false,
            fallida: false
        };
    });
    pintarLineasPajaro();
    actualizarMarcadorPajaro();
    relojPajaro = { t0: performance.now(), tiempoBase: 0 };
    actualizarControlesPajaro();
    if (animacionPajaroId) cancelAnimationFrame(animacionPajaroId);
    animacionPajaroId = requestAnimationFrame(bucleJuegoPajaro);
}

function leerMidiVozPajaro() {
    if (!analyser || !dataArray || !audioContext) return null;
    analyser.getFloatTimeDomainData(dataArray);
    const frecuencia = autoCorrelacion(dataArray, audioContext.sampleRate);
    if (frecuencia === -1 || frecuencia < 60 || frecuencia > 1000) return null;
    return 69 + 12 * Math.log2(frecuencia / 440);
}

function bucleJuegoPajaro() {
    if (!modoPajaro || estadoPajaro !== "jugando") {
        animacionPajaroId = 0;
        return;
    }
    const t = tiempoActualPajaro();
    const midiVoz = leerMidiVozPajaro();
    if (midiVoz != null) {
        if (midiSuavePajaro == null) midiSuavePajaro = midiVoz;
        else midiSuavePajaro = midiSuavePajaro * 0.72 + midiVoz * 0.28;
    }
    const pajaro = document.getElementById("pajaro");
    if (pajaro) {
        if (midiSuavePajaro != null) {
            pajaro.style.top = midiAPorcentajePajaro(midiSuavePajaro) + "%";
        }
        pajaro.classList.toggle("cantando", midiVoz != null);
    }

    cerezasPajaro.forEach(cereza => {
        if (cereza.recogida || cereza.fallida) return;
        const x = PAJARO_X_PAJARO + ((cereza.tLlegada - t) / PAJARO_ANTICIPO) * (100 - PAJARO_X_PAJARO);
        cereza.el.style.left = x + "%";
        cereza.el.style.top = midiAPorcentajePajaro(cereza.midi) + "%";

        const ventana = Math.max(0.18, Math.min(0.28, cereza.duracion * 0.45));
        const cercaX = Math.abs(t - cereza.tLlegada) <= ventana;
        if (cercaX && midiSuavePajaro != null) {
            const cents = (midiSuavePajaro - cereza.midi) * 100;
            if (Math.abs(cents) <= PAJARO_MARGEN_CENTS) {
                cereza.recogida = true;
                cereza.el.classList.add("recogida");
                aciertosPajaro++;
                actualizarMarcadorPajaro();
                // Solo suena al tocar la cereza, no antes.
                const durGuia = Math.max(0.28, Math.min(0.7, cereza.duracion * 0.85));
                sonarNota(nombreInglesDesdeMidi(cereza.midi), durGuia, VOLUMEN_MELODIA * 0.9);
                if (pajaro) {
                    pajaro.classList.add("recogiendo");
                    setTimeout(() => pajaro.classList.remove("recogiendo"), 180);
                }
                return;
            }
        }
        if (t > cereza.tLlegada + ventana + 0.12) {
            cereza.fallida = true;
            cereza.el.classList.add("fallida");
        }
    });

    const ultima = cerezasPajaro[cerezasPajaro.length - 1];
    if (ultima && t > ultima.tLlegada + Math.max(0.9, ultima.duracion + 0.4)) {
        terminarJuegoPajaro();
        return;
    }
    animacionPajaroId = requestAnimationFrame(bucleJuegoPajaro);
}

function terminarJuegoPajaro() {
    if (!modoPajaro || estadoPajaro === "fin") return;
    estadoPajaro = "fin";
    if (animacionPajaroId) {
        cancelAnimationFrame(animacionPajaroId);
        animacionPajaroId = 0;
    }
    ponerGuiaSonando(false);
    silenciarMelodia();
    const pajaro = document.getElementById("pajaro");
    if (pajaro) pajaro.classList.remove("cantando", "recogiendo");
    const total = Math.max(1, melodiaPajaroBase.length);
    document.getElementById("palabra-pantalla").innerHTML = tituloPajaroHtml(true);
    document.getElementById("secuencia-visual").innerHTML = "";
    const resumen = document.createElement("div");
    resumen.className = "resumen-final";
    resumen.innerHTML =
        `<div class="resumen-logro">Cerezas: ${aciertosPajaro} de ${total}.</div>` +
        `<div class="resumen-titulo">${aciertosPajaro >= total
            ? "¡Todas! El pájaro voló contigo."
            : aciertosPajaro >= Math.ceil(total * 0.6)
                ? "Buen vuelo. Sigue afinando con la voz."
                : "Prueba otra vez: sube y baja la voz con calma."}</div>`;
    document.getElementById("secuencia-visual").appendChild(resumen);
    document.getElementById("evaluacion").innerHTML = "";
    anotarJuegoHoy("Pájaro", { aciertos: aciertosPajaro, total });
    document.getElementById("zona-reinicio").style.display = "flex";
    actualizarControlesPajaro();
    actualizarBotonAyuda();
}

// ==========================================
// JUEGO 3: COLIBRÍ E INTERVALOS
// ==========================================
function midiAPorcentajeColibri(midi) {
    const acotado = Math.max(escenaMidiMinColibri, Math.min(escenaMidiMaxColibri, midi));
    return ((escenaMidiMaxColibri - acotado) / Math.max(0.01, escenaMidiMaxColibri - escenaMidiMinColibri)) * 100;
}

function actualizarMarcadorColibri() {
    const el = document.getElementById("marcador-colibri");
    if (el) el.textContent = `${Math.min(indiceIntervaloColibri + 1, INTERVALOS_COLIBRI.length)} / ${INTERVALOS_COLIBRI.length}`;
}

function actualizarEtiquetaIntervaloColibri() {
    const el = document.getElementById("etiqueta-intervalo-colibri");
    const paso = INTERVALOS_COLIBRI[indiceIntervaloColibri];
    if (el) el.textContent = paso ? paso.etiqueta : "";
}

function pintarLineasColibri() {
    const caja = document.getElementById("lineas-colibri");
    if (!caja) return;
    caja.innerHTML = "";
    const midis = new Set(INTERVALOS_COLIBRI.map(p => midiBaseColibri + p.semis));
    [...midis].sort((a, b) => a - b).forEach(midi => {
        const linea = document.createElement("div");
        linea.className = "linea-tono-colibri" + (midi === midiBaseColibri ? " base" : "");
        linea.style.top = midiAPorcentajeColibri(midi) + "%";
        caja.appendChild(linea);
    });
}

function tiempoActualColibri() {
    return relojColibri.tiempoBase + (performance.now() - relojColibri.t0) / 1000 * velocidadColibri;
}

function cambiarVelocidadColibri(valor) {
    const nueva = Math.max(0.5, Math.min(2, Number(valor) || 1));
    const etiqueta = document.getElementById("txt-velocidad-colibri");
    const control = document.getElementById("velocidad-colibri");
    if (etiqueta) etiqueta.textContent = `×${nueva.toFixed(2).replace(/\.?0+$/, "")}`;
    if (control && Number(control.value) !== nueva) control.value = String(nueva);
    if (modoColibri && (estadoColibri === "jugando" || estadoColibri === "secuencia" || estadoColibri === "pausada")) {
        const ahora = tiempoActualColibri();
        relojColibri = { t0: performance.now(), tiempoBase: ahora };
    }
    velocidadColibri = nueva;
}

function gapMusicalSecuenciaColibri() {
    // A velocidad inicial, ~2 s de reloj entre flores (tiempoActual ya aplica velocidad).
    return COLIBRI_GAP_SECUENCIA_S * COLIBRI_VELOCIDAD_INICIAL;
}

function xColibriHaciaFlor(t, tLlegada) {
    // El colibrí vuela de izquierda a derecha; llega a la flor en tLlegada.
    const llegada = Math.max(0.05, tLlegada);
    const progreso = Math.max(0, Math.min(1.15, t / llegada));
    return COLIBRI_X_INICIO + progreso * (COLIBRI_X_FLOR - COLIBRI_X_INICIO);
}

function xFlorFijaPorTiempo(tLlegada, tUltima) {
    const fin = Math.max(0.05, tUltima);
    return COLIBRI_X_INICIO + (tLlegada / fin) * (COLIBRI_X_FLOR - COLIBRI_X_INICIO);
}

function actualizarControlesColibri() {
    const caja = document.getElementById("controles-colibri");
    if (!caja) return;
    caja.style.display = modoColibri ? "flex" : "none";
    if (!modoColibri) return;
    const enPartida = estadoColibri === "jugando" || estadoColibri === "secuencia";
    document.getElementById("btn-pausa-colibri").style.display = enPartida ? "inline-block" : "none";
    document.getElementById("btn-seguir-colibri").style.display = estadoColibri === "pausada" ? "inline-block" : "none";
    document.getElementById("btn-repetir-colibri").style.display = estadoColibri === "fin" ? "inline-block" : "none";
}

function pausarColibri() {
    if (!modoColibri || (estadoColibri !== "jugando" && estadoColibri !== "secuencia")) return;
    relojColibri = { t0: performance.now(), tiempoBase: tiempoActualColibri() };
    silenciarMelodia();
    if (animacionColibriId) {
        cancelAnimationFrame(animacionColibriId);
        animacionColibriId = 0;
    }
    pausaColibriEraSecuencia = estadoColibri === "secuencia";
    estadoColibri = "pausada";
    const colibri = document.getElementById("colibri");
    if (colibri) colibri.classList.remove("cantando", "libando");
    document.getElementById("evaluacion").innerText = "⏸ Colibrí en pausa";
    actualizarControlesColibri();
}

function seguirColibri() {
    if (!modoColibri || estadoColibri !== "pausada") return;
    const eraSecuencia = pausaColibriEraSecuencia && floresSecuenciaColibri.length;
    estadoColibri = eraSecuencia ? "secuencia" : "jugando";
    relojColibri = { t0: performance.now(), tiempoBase: relojColibri.tiempoBase };
    document.getElementById("evaluacion").innerText = eraSecuencia
        ? "Secuencia · canta cada intervalo"
        : "Liba la flor con la voz";
    animacionColibriId = requestAnimationFrame(
        eraSecuencia ? bucleSecuenciaFinalColibri : bucleJuegoColibri
    );
    actualizarControlesColibri();
}

function detenerJuegoColibri() {
    if (animacionColibriId) {
        cancelAnimationFrame(animacionColibriId);
        animacionColibriId = 0;
    }
    modoColibri = false;
    estadoColibri = "fin";
    midiSuaveColibri = null;
    florColibri = null;
    floresSecuenciaColibri = [];
    framesLibandoSecuenciaColibri = {};
    framesLibandoColibri = 0;
    reintentoIntervaloColibri = false;
    guiaNotasColibri = true;
    pausaColibriEraSecuencia = false;
    const escenario = document.getElementById("escenario-colibri");
    if (escenario) escenario.hidden = true;
    const flores = document.getElementById("flores-colibri");
    if (flores) flores.innerHTML = "";
    const cont = document.getElementById("controles-colibri");
    if (cont) cont.style.display = "none";
    const btnVolver = document.getElementById("btn-volver-colibri");
    if (btnVolver) btnVolver.hidden = true;
    actualizarBotonAyuda();
}

function volverAPantallaColibri() {
    detenerJuegoColibri();
    soltarMicrofono();
    cancelarTemporizadores();
    document.getElementById("titulo-cancion").style.display = "none";
    document.getElementById("controles-escucha").style.display = "none";
    document.getElementById("controles-karaoke").style.display = "none";
    const contRitmo = document.getElementById("controles-ritmo");
    if (contRitmo) contRitmo.style.display = "none";
    const contPajaro = document.getElementById("controles-pajaro");
    if (contPajaro) contPajaro.style.display = "none";
    const contColibri = document.getElementById("controles-colibri");
    if (contColibri) contColibri.style.display = "none";
    document.getElementById("status-box").style.display = "none";
    document.getElementById("evaluacion").innerHTML = "";
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("palabra-pantalla").innerText = "...";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("btn-volver-calentamiento").hidden = true;
    document.getElementById("btn-volver-ritmo").hidden = true;
    document.getElementById("btn-volver-pajaro").hidden = true;
    document.getElementById("btn-volver-colibri").hidden = true;
    document.getElementById("zona-seleccion").style.display = "block";
    document.getElementById("botones-inicio").style.display = "none";
    mostrarPantallaColibri();
    actualizarBotonAyuda();
}

function prepararPantallaJuegoColibri() {
    document.body.classList.remove("vista-juegos", "vista-ritmo", "vista-pajaro", "vista-colibri");
    document.getElementById("botones-inicio").style.display = "none";
    document.getElementById("zona-seleccion").style.display = "none";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("status-box").style.display = "block";
    document.getElementById("btn-volver-calentamiento").hidden = true;
    document.getElementById("btn-volver-ritmo").hidden = true;
    document.getElementById("btn-volver-pajaro").hidden = true;
    document.getElementById("btn-volver-colibri").hidden = false;
    document.getElementById("controles-escucha").style.display = "none";
    document.getElementById("controles-karaoke").style.display = "none";
    const contRitmo = document.getElementById("controles-ritmo");
    if (contRitmo) contRitmo.style.display = "none";
    const contPajaro = document.getElementById("controles-pajaro");
    if (contPajaro) contPajaro.style.display = "none";
    const zonaRitmo = document.getElementById("zona-pulso-ritmo");
    if (zonaRitmo) zonaRitmo.hidden = true;
    const escenarioPajaro = document.getElementById("escenario-pajaro");
    if (escenarioPajaro) escenarioPajaro.hidden = true;
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("evaluacion").innerHTML = "";
    const elTitulo = document.getElementById("titulo-cancion");
    if (elTitulo) {
        elTitulo.textContent = "· Colibrí 🌺";
        elTitulo.style.display = "inline";
    }
}

async function empezarColibri() {
    try {
        detenerPruebaMicrofono();
        cancelarTemporizadores();
        cerrarPantallaColibri();
        tituloCancionActual = "Colibrí";
        cancionActual = "Colibri";
        prepararPantallaJuegoColibri();
        cambiarVelocidadColibri(0.7);
        await cargarPiano();
        await asegurarMicrofono("entrenamiento");

        modoColibri = true;
        aciertosColibri = 0;
        reintentoIntervaloColibri = false;
        guiaNotasColibri = true;
        indiceIntervaloColibri = 0;
        midiSuaveColibri = null;
        actualizarBotonAyuda();
        iniciarCalibracionColibri();
        actualizarControlesColibri();

        if (!bucleAudioActivo) {
            bucleAudioActivo = true;
            bucleDeAudio();
        }
    } catch (err) {
        document.getElementById("status-box").style.display = "block";
        document.getElementById("palabra-pantalla").innerText = "Error";
        document.getElementById("evaluacion").innerHTML =
            `<span class='error'>❌ Error: ${err.message}</span>`;
        document.getElementById("zona-reinicio").style.display = "flex";
        document.getElementById("btn-volver-colibri").hidden = false;
    }
}

function reiniciarJuegoColibri() {
    if (animacionColibriId) {
        cancelAnimationFrame(animacionColibriId);
        animacionColibriId = 0;
    }
    silenciarMelodia();
    idGuia++;
    aciertosColibri = 0;
    reintentoIntervaloColibri = false;
    guiaNotasColibri = true;
    indiceIntervaloColibri = 0;
    midiSuaveColibri = null;
    florColibri = null;
    floresSecuenciaColibri = [];
    framesLibandoSecuenciaColibri = {};
    pausaColibriEraSecuencia = false;
    framesLibandoColibri = 0;
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("secuencia-visual").innerHTML = "";
    const escenario = document.getElementById("escenario-colibri");
    if (escenario) escenario.hidden = true;
    iniciarCalibracionColibri();
    actualizarControlesColibri();
}

function iniciarCalibracionColibri() {
    estadoColibri = "calibracion";
    muestrasCalibracion = [];
    ponerGuiaSonando(false);
    document.getElementById("btn-anterior").style.visibility = "hidden";
    document.getElementById("btn-siguiente").style.visibility = "hidden";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("escenario-colibri").hidden = true;
    document.getElementById("palabra-pantalla").innerText = "🎤 Canta tu primera nota";
    document.getElementById("secuencia-visual").innerHTML =
        "<div style='font-size:16px; color:#aaa; line-height:1.5; max-width:420px;'>" +
        "Elige una nota cómoda, ni muy grave ni muy aguda, y mantenla un momento. " +
        "Después la oirás y saldrá la primera flor a esa altura.</div>";
    document.getElementById("evaluacion").innerText = "Esperando tu voz...";
    actualizarControlesColibri();
}

function procesarCalibracionColibri() {
    if (!modoColibri || estadoColibri !== "calibracion") return;
    const mensaje = document.getElementById("evaluacion");
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

    // Deja margen para llegar a la 5ª mayor (+7).
    const midiMax = MIDI_MAX_PRIMERA_NOTA - 7;
    if (notaMidi < MIDI_MIN_PRIMERA_NOTA || notaMidi > midiMax) {
        mensaje.innerText =
            `${nombre} queda fuera de rango. Prueba con una nota entre ` +
            `${nombreEspanolDesdeMidi(MIDI_MIN_PRIMERA_NOTA)} y ${nombreEspanolDesdeMidi(midiMax)}.`;
        muestrasCalibracion = [];
        return;
    }

    muestrasCalibracion = [];
    midiBaseColibri = notaMidi;
    midiSuaveColibri = notaMidi;
    estadoColibri = "prep";
    mensaje.innerHTML = `<span class='success'>✔ Primera nota: ${nombre}. Escúchala…</span>`;
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("palabra-pantalla").innerText = nombre;
    actualizarControlesColibri();

    ponerGuiaSonando(true);
    sonarNota(nombreInglesDesdeMidi(notaMidi), 1.2, VOLUMEN_MELODIA_GUIA);
    setTimeout(() => {
        if (!modoColibri || estadoColibri !== "prep") return;
        ponerGuiaSonando(false);
        arrancarPartidaColibri();
    }, 1500);
}

function arrancarPartidaColibri() {
    if (!modoColibri) return;
    indiceIntervaloColibri = 0;
    aciertosColibri = 0;
    reintentoIntervaloColibri = false;
    guiaNotasColibri = true;
    escenaMidiMinColibri = midiBaseColibri - 1;
    escenaMidiMaxColibri = midiBaseColibri + 8;
    document.getElementById("palabra-pantalla").innerText = "🌺";
    document.getElementById("secuencia-visual").innerHTML = "";
    const escenario = document.getElementById("escenario-colibri");
    escenario.hidden = false;
    const colibri = document.getElementById("colibri");
    colibri.style.top = midiAPorcentajeColibri(midiBaseColibri) + "%";
    colibri.classList.remove("cantando", "libando");
    pintarLineasColibri();
    actualizarMarcadorColibri();
    actualizarEtiquetaIntervaloColibri();
    lanzarFlorColibri();
}

function lanzarFlorColibri() {
    if (!modoColibri) return;
    const paso = INTERVALOS_COLIBRI[indiceIntervaloColibri];
    if (!paso) {
        terminarJuegoColibri();
        return;
    }
    estadoColibri = "jugando";
    framesLibandoColibri = 0;
    const midi = midiBaseColibri + paso.semis;
    const caja = document.getElementById("flores-colibri");
    caja.innerHTML = "";
    const el = document.createElement("div");
    el.className = "flor-colibri";
    const icono = document.createElement("span");
    icono.className = "flor-icono";
    icono.setAttribute("aria-hidden", "true");
    icono.textContent = "🌺";
    const etiqueta = document.createElement("span");
    etiqueta.className = "flor-etiqueta";
    etiqueta.textContent = paso.etiqueta;
    el.appendChild(icono);
    el.appendChild(etiqueta);
    el.style.top = midiAPorcentajeColibri(midi) + "%";
    el.style.left = COLIBRI_X_FLOR + "%";
    caja.appendChild(el);

    const colibri = document.getElementById("colibri");
    if (colibri) colibri.style.left = COLIBRI_X_INICIO + "%";

    florColibri = {
        midi,
        etiqueta: paso.etiqueta,
        tLlegada: COLIBRI_ANTICIPO,
        el,
        libada: false,
        escapada: false,
        sonada: false
    };
    actualizarMarcadorColibri();
    actualizarEtiquetaIntervaloColibri();
    const etiquetaGuia = document.getElementById("etiqueta-intervalo-colibri");
    if (etiquetaGuia && guiaNotasColibri) {
        etiquetaGuia.textContent = `${paso.etiqueta} · con guía`;
    }
    document.getElementById("evaluacion").innerText = guiaNotasColibri
        ? `Liba la flor · ${paso.etiqueta} (suena la nota del intervalo)`
        : `Liba la flor · ${paso.etiqueta}`;
    // Guía de las 9 primeras: la nota suena al aparecer la flor (no espera a libar).
    if (guiaNotasColibri) {
        florColibri.sonada = true;
        sonarNota(nombreInglesDesdeMidi(midi), 0.9, VOLUMEN_MELODIA_GUIA);
    }
    relojColibri = { t0: performance.now(), tiempoBase: 0 };
    actualizarControlesColibri();
    if (animacionColibriId) cancelAnimationFrame(animacionColibriId);
    animacionColibriId = requestAnimationFrame(bucleJuegoColibri);
}

function leerMidiVozColibri() {
    if (!analyser || !dataArray || !audioContext) return null;
    analyser.getFloatTimeDomainData(dataArray);
    const frecuencia = autoCorrelacion(dataArray, audioContext.sampleRate);
    if (frecuencia === -1 || frecuencia < 60 || frecuencia > 1000) return null;
    return 69 + 12 * Math.log2(frecuencia / 440);
}

function bucleJuegoColibri() {
    if (!modoColibri || estadoColibri !== "jugando") {
        animacionColibriId = 0;
        return;
    }
    const t = tiempoActualColibri();
    const midiVoz = leerMidiVozColibri();
    if (midiVoz != null) {
        if (midiSuaveColibri == null) midiSuaveColibri = midiVoz;
        else midiSuaveColibri = midiSuaveColibri * 0.72 + midiVoz * 0.28;
    }
    const flor = florColibri;
    const colibri = document.getElementById("colibri");
    if (colibri) {
        if (flor && !flor.libada && !flor.escapada) {
            colibri.style.left = xColibriHaciaFlor(t, flor.tLlegada) + "%";
        }
        if (midiSuaveColibri != null) {
            colibri.style.top = midiAPorcentajeColibri(midiSuaveColibri) + "%";
        }
        colibri.classList.toggle("cantando", midiVoz != null);
    }

    if (!flor || flor.libada || flor.escapada) {
        animacionColibriId = requestAnimationFrame(bucleJuegoColibri);
        return;
    }

    flor.el.style.left = COLIBRI_X_FLOR + "%";
    flor.el.style.top = midiAPorcentajeColibri(flor.midi) + "%";

    const ventana = 0.28;
    const cercaX = Math.abs(t - flor.tLlegada) <= ventana;
    if (cercaX && midiSuaveColibri != null) {
        const cents = (midiSuaveColibri - flor.midi) * 100;
        if (Math.abs(cents) <= COLIBRI_MARGEN_CENTS) {
            framesLibandoColibri++;
            if (framesLibandoColibri >= COLIBRI_FRAMES_LIBAR) {
                flor.libada = true;
                flor.el.classList.add("libada");
                if (!reintentoIntervaloColibri) aciertosColibri++;
                if (colibri) {
                    colibri.classList.add("libando");
                    setTimeout(() => colibri.classList.remove("libando"), 220);
                }
                if (!guiaNotasColibri || !flor.sonada) {
                    sonarNota(nombreInglesDesdeMidi(flor.midi), 0.55, VOLUMEN_MELODIA * 0.9);
                    flor.sonada = true;
                }
                document.getElementById("evaluacion").innerHTML = reintentoIntervaloColibri
                    ? `<span class="success">✔ ${flor.etiqueta} (reintento)</span>`
                    : `<span class="success">✔ ${flor.etiqueta} · a la primera</span>`;
                avanzarTrasLibarColibri();
                return;
            }
        } else {
            framesLibandoColibri = 0;
        }
    } else {
        framesLibandoColibri = 0;
    }

    if (t > flor.tLlegada + ventana + 0.15) {
        flor.escapada = true;
        flor.el.classList.add("escapada");
        reintentoIntervaloColibri = true;
        document.getElementById("evaluacion").innerText =
            `Se escapó · oye la base y la ${flor.etiqueta}`;
        const midiIntervalo = flor.midi;
        estadoColibri = "transicion";
        actualizarControlesColibri();
        // Primero la nota de base, luego la del intervalo escapado; después se reintenta.
        sonarNota(nombreInglesDesdeMidi(midiBaseColibri), 0.7, VOLUMEN_MELODIA_GUIA * 0.85);
        setTimeout(() => {
            if (!modoColibri || estadoColibri !== "transicion") return;
            sonarNota(nombreInglesDesdeMidi(midiIntervalo), 0.85, VOLUMEN_MELODIA_GUIA);
            setTimeout(() => {
                if (!modoColibri || estadoColibri !== "transicion") return;
                silenciarMelodia();
                estadoColibri = "jugando";
                lanzarFlorColibri();
            }, 950);
        }, 800);
        return;
    }

    animacionColibriId = requestAnimationFrame(bucleJuegoColibri);
}

function avanzarTrasLibarColibri() {
    if (animacionColibriId) {
        cancelAnimationFrame(animacionColibriId);
        animacionColibriId = 0;
    }
    estadoColibri = "transicion";
    actualizarControlesColibri();
    const siguiente = indiceIntervaloColibri + 1;
    if (siguiente >= INTERVALOS_COLIBRI.length) {
        setTimeout(() => {
            if (modoColibri) avisarFinGuiaIntervalosColibri();
        }, 700);
        return;
    }
    setTimeout(() => {
        if (!modoColibri || estadoColibri !== "transicion") return;
        indiceIntervaloColibri = siguiente;
        reintentoIntervaloColibri = false;
        // Breve recuerdo de la nota inicial antes de la siguiente flor.
        sonarNota(nombreInglesDesdeMidi(midiBaseColibri), 0.7, VOLUMEN_MELODIA_GUIA * 0.85);
        document.getElementById("evaluacion").innerText =
            `Siguiente: ${INTERVALOS_COLIBRI[siguiente].etiqueta}`;
        setTimeout(() => {
            if (!modoColibri || estadoColibri !== "transicion") return;
            silenciarMelodia();
            lanzarFlorColibri();
        }, 900);
    }, 700);
}

function avisarFinGuiaIntervalosColibri() {
    if (!modoColibri || estadoColibri === "fin" || estadoColibri === "secuencia") return;
    if (animacionColibriId) {
        cancelAnimationFrame(animacionColibriId);
        animacionColibriId = 0;
    }
    estadoColibri = "aviso";
    guiaNotasColibri = false;
    actualizarControlesColibri();
    ponerGuiaSonando(false);
    silenciarMelodia();
    const flores = document.getElementById("flores-colibri");
    if (flores) flores.innerHTML = "";
    document.getElementById("palabra-pantalla").innerText = "🌺";
    document.getElementById("secuencia-visual").innerHTML =
        "<div class='resumen-final'>" +
        "<div class='resumen-titulo'>¡9 primeras conseguidas!</div>" +
        "<div class='resumen-logro'>Las notas del intervalo dejan de sonar. Ahora canta tú la secuencia.</div>" +
        "</div>";
    document.getElementById("evaluacion").innerHTML =
        "<span class='success'>Aviso · las notas del intervalo ya no suenan solas</span>";
    const etiquetaEl = document.getElementById("etiqueta-intervalo-colibri");
    if (etiquetaEl) etiquetaEl.textContent = "Sin notas guía";
    setTimeout(() => {
        if (!modoColibri || estadoColibri !== "aviso") return;
        document.getElementById("secuencia-visual").innerHTML = "";
        arrancarSecuenciaFinalColibri();
    }, 3500);
}

function terminarJuegoColibri() {
    if (!modoColibri || estadoColibri === "fin" || estadoColibri === "secuencia" || estadoColibri === "aviso") return;
    if (animacionColibriId) {
        cancelAnimationFrame(animacionColibriId);
        animacionColibriId = 0;
    }
    ponerGuiaSonando(false);
    silenciarMelodia();
    avisarFinGuiaIntervalosColibri();
}

function arrancarSecuenciaFinalColibri() {
    if (!modoColibri) return;
    estadoColibri = "secuencia";
    framesLibandoSecuenciaColibri = {};
    pausaColibriEraSecuencia = false;
    document.getElementById("palabra-pantalla").innerText = "🌺";
    document.getElementById("secuencia-visual").innerHTML = "";
    document.getElementById("zona-reinicio").style.display = "none";
    document.getElementById("evaluacion").innerText =
        "Secuencia · canta cada intervalo (como el pájaro)";
    const etiquetaEl = document.getElementById("etiqueta-intervalo-colibri");
    if (etiquetaEl) etiquetaEl.textContent = "Secuencia";
    const escenario = document.getElementById("escenario-colibri");
    if (escenario) escenario.hidden = false;

    const gap = gapMusicalSecuenciaColibri();
    const caja = document.getElementById("flores-colibri");
    caja.innerHTML = "";
    const tUltima = COLIBRI_ANTICIPO + (INTERVALOS_COLIBRI.length - 1) * gap;
    floresSecuenciaColibri = INTERVALOS_COLIBRI.map((paso, i) => {
        const midi = midiBaseColibri + paso.semis;
        const tLlegada = COLIBRI_ANTICIPO + i * gap;
        const el = document.createElement("div");
        el.className = "flor-colibri";
        const icono = document.createElement("span");
        icono.className = "flor-icono";
        icono.setAttribute("aria-hidden", "true");
        icono.textContent = "🌺";
        const etiqueta = document.createElement("span");
        etiqueta.className = "flor-etiqueta";
        etiqueta.textContent = paso.etiqueta;
        el.appendChild(icono);
        el.appendChild(etiqueta);
        el.style.top = midiAPorcentajeColibri(midi) + "%";
        el.style.left = xFlorFijaPorTiempo(tLlegada, tUltima) + "%";
        caja.appendChild(el);
        return {
            midi,
            etiqueta: paso.etiqueta,
            tLlegada,
            el,
            libada: false,
            escapada: false
        };
    });
    const colibri = document.getElementById("colibri");
    if (colibri) colibri.style.left = COLIBRI_X_INICIO + "%";
    actualizarMarcadorSecuenciaColibri();
    relojColibri = { t0: performance.now(), tiempoBase: 0 };
    actualizarControlesColibri();
    if (animacionColibriId) cancelAnimationFrame(animacionColibriId);
    animacionColibriId = requestAnimationFrame(bucleSecuenciaFinalColibri);
}

function actualizarMarcadorSecuenciaColibri() {
    const el = document.getElementById("marcador-colibri");
    if (!el) return;
    const hechas = floresSecuenciaColibri.filter(f => f.libada).length;
    el.textContent = `${hechas} / ${INTERVALOS_COLIBRI.length}`;
}

function bucleSecuenciaFinalColibri() {
    if (!modoColibri || estadoColibri !== "secuencia") {
        animacionColibriId = 0;
        return;
    }
    const t = tiempoActualColibri();
    const midiVoz = leerMidiVozColibri();
    if (midiVoz != null) {
        if (midiSuaveColibri == null) midiSuaveColibri = midiVoz;
        else midiSuaveColibri = midiSuaveColibri * 0.72 + midiVoz * 0.28;
    }
    const ultima = floresSecuenciaColibri[floresSecuenciaColibri.length - 1];
    const tUltima = ultima ? ultima.tLlegada : COLIBRI_ANTICIPO;
    const colibri = document.getElementById("colibri");
    if (colibri) {
        colibri.style.left = xColibriHaciaFlor(t, tUltima) + "%";
        if (midiSuaveColibri != null) {
            colibri.style.top = midiAPorcentajeColibri(midiSuaveColibri) + "%";
        }
        colibri.classList.toggle("cantando", midiVoz != null);
    }

    const ventana = 0.28;
    floresSecuenciaColibri.forEach((flor, i) => {
        if (flor.libada || flor.escapada) return;
        flor.el.style.left = xFlorFijaPorTiempo(flor.tLlegada, tUltima) + "%";
        flor.el.style.top = midiAPorcentajeColibri(flor.midi) + "%";

        const cercaX = Math.abs(t - flor.tLlegada) <= ventana;
        if (cercaX && midiSuaveColibri != null) {
            const cents = (midiSuaveColibri - flor.midi) * 100;
            if (Math.abs(cents) <= COLIBRI_MARGEN_CENTS) {
                framesLibandoSecuenciaColibri[i] = (framesLibandoSecuenciaColibri[i] || 0) + 1;
                if (framesLibandoSecuenciaColibri[i] >= COLIBRI_FRAMES_LIBAR) {
                    flor.libada = true;
                    flor.el.classList.add("libada");
                    actualizarMarcadorSecuenciaColibri();
                    // Como el pájaro: la nota solo suena al libar.
                    sonarNota(nombreInglesDesdeMidi(flor.midi), 0.55, VOLUMEN_MELODIA * 0.9);
                    if (colibri) {
                        colibri.classList.add("libando");
                        setTimeout(() => colibri.classList.remove("libando"), 220);
                    }
                    document.getElementById("evaluacion").innerHTML =
                        `<span class="success">✔ ${flor.etiqueta}</span>`;
                }
            } else {
                framesLibandoSecuenciaColibri[i] = 0;
            }
        } else {
            framesLibandoSecuenciaColibri[i] = 0;
        }

        if (t > flor.tLlegada + ventana + 0.15) {
            flor.escapada = true;
            flor.el.classList.add("escapada");
        }
    });

    if (ultima && t > ultima.tLlegada + 1.2) {
        mostrarResumenFinalColibri();
        return;
    }
    animacionColibriId = requestAnimationFrame(bucleSecuenciaFinalColibri);
}

function mostrarResumenFinalColibri() {
    if (!modoColibri || estadoColibri === "fin") return;
    estadoColibri = "fin";
    if (animacionColibriId) {
        cancelAnimationFrame(animacionColibriId);
        animacionColibriId = 0;
    }
    silenciarMelodia();
    const colibri = document.getElementById("colibri");
    if (colibri) colibri.classList.remove("cantando", "libando");
    const total = INTERVALOS_COLIBRI.length;
    const libadasSecuencia = floresSecuenciaColibri.filter(f => f.libada).length;
    document.getElementById("secuencia-visual").innerHTML = "";
    const resumen = document.createElement("div");
    resumen.className = "resumen-final";
    resumen.innerHTML =
        `<div class="resumen-logro">A la primera: ${aciertosColibri} de ${total}.</div>` +
        `<div class="resumen-logro">Secuencia final: ${libadasSecuencia} de ${total}.</div>` +
        `<div class="resumen-titulo">${aciertosColibri >= total
            ? "¡Todas a la primera! El colibrí clavó cada intervalo."
            : "Buen vuelo. Solo cuentan las flores libadas a la primera en la primera parte."}</div>`;
    document.getElementById("secuencia-visual").appendChild(resumen);
    document.getElementById("evaluacion").innerHTML = "";
    anotarJuegoHoy("Colibrí", {
        aciertos: aciertosColibri,
        total,
        secuencia: libadasSecuencia
    });
    document.getElementById("zona-reinicio").style.display = "flex";
    actualizarControlesColibri();
    actualizarBotonAyuda();
}

function volverACalentamientos() {
    ocultarResultadoMicrofono();
    soltarMicrofono();
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
    cerrarJuegos(false);
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
        await asegurarMicrofono("entrenamiento");
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

function nombreInglesDesdeMidi(midi) {
    return NOMBRES_NOTA_INGLES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function entradaBajosCoro(config) {
    const bajos = (config.voces || []).find(v => v.parte === "bajos");
    return bajos && typeof bajos.entrada === "number" ? bajos.entrada : 2;
}

function pasosDesplazamientoBajos() {
    if (!eligioCoro || !configCoro) return [0];
    if (configCoro.tipo === "entradas") {
        const pasos = datosCoroEntradas && datosCoroEntradas.pasosBajos;
        return (pasos && pasos.length) ? pasos : [0];
    }
    if (configCoro.tipo === "canon") {
        return [entradaBajosCoro(configCoro) * (configCoro.retraso || 0)];
    }
    return [0];
}

function offsetEntradaBajos() {
    return pasosDesplazamientoBajos()[0] || 0;
}

function tiempoInicioCoro() {
    if (configCoro && configCoro.tipo === "entradas") {
        if (datosCoroEntradas && typeof datosCoroEntradas.inicio === "number") return datosCoroEntradas.inicio;
        return 0;
    }
    if (!notasBaseCanon.length) return 0;
    return Math.min(...notasBaseCanon.map(n => n.time));
}

// Canon: misma melodía desfasada y en bucle. Entradas: pistas ya montadas (sopranos/contraltos).
function armarVocesCoro(notasBase, config) {
    if (!config) return [];
    if (config.tipo === "entradas") {
        const lista = (datosCoroEntradas && datosCoroEntradas.voces) || [];
        const base = lista.map(n => ({
            time: n.time,
            duracion: n.duration || n.duracion || 0.4,
            nombre: n.name || n.nombre || nombreInglesDesdeMidi(n.midi)
        }));
        const pasadas = datosCoroEntradas && datosCoroEntradas.pasadas;
        if (!Array.isArray(pasadas) || !pasadas.length) return base;
        const sueltos = [];
        pasadas.forEach(p => {
            if (!p.sopranos) return;
            const offset = typeof p.offset === "number" ? p.offset : 0;
            base.forEach(n => {
                sueltos.push({
                    time: n.time + offset,
                    duracion: n.duracion,
                    nombre: n.nombre
                });
            });
        });
        sueltos.sort((a, b) => a.time - b.time);
        return sueltos;
    }
    if (config.tipo !== "canon" || !notasBase.length) return [];
    const retraso = config.retraso || 0;
    const inicio = Math.min(...notasBase.map(n => n.time));
    const finUna = Math.max(...notasBase.map(n => n.time + (n.duration || 0.4)));
    const ciclo = Math.max(0.12, finUna - inicio);
    const finBajos = finUna + entradaBajosCoro(config) * retraso;
    const sueltos = [];
    (config.voces || []).forEach(voz => {
        if (voz.parte === "bajos") return;
        const entrada = (voz.entrada || 0) * retraso;
        const oct = (voz.octava || 0) * 12;
        for (let vuelta = 0; ; vuelta++) {
            const desfase = entrada + vuelta * ciclo;
            if (inicio + desfase >= finBajos - 0.001) break;
            notasBase.forEach(n => {
                const time = n.time + desfase;
                if (time >= finBajos - 0.001) return;
                const natural = n.duration || 0.4;
                sueltos.push({
                    time,
                    duracion: Math.min(natural, Math.max(0.12, finBajos - time)),
                    nombre: nombreInglesDesdeMidi(n.midi + oct)
                });
            });
        }
    });
    sueltos.sort((a, b) => a.time - b.time);
    return sueltos;
}

function cancelarVocesCoro() {
    temporizadoresCoro.forEach(t => clearTimeout(t));
    temporizadoresCoro = [];
}

function silenciarVocesCoro() {
    cancelarVocesCoro();
    fuentesCoroActivas.forEach(voz => apagarVoz(voz));
    fuentesCoroActivas = [];
}

function sonarNotaCoro(nombreNotaIngles, duracion) {
    asegurarAudioContext();
    const dur = Math.max(duracion || 0.4, 0.12);
    const ahora = audioContext.currentTime;
    const ganancia = audioContext.createGain();
    const fin = envolverNota(ganancia, VOLUMEN_CORO * FACTOR_PIANO, ahora, dur);
    const midi = midiDesdeNombreIngles(nombreNotaIngles);
    const piano = fuentePiano(ganancia, midi, fin + 0.05);
    const fuentes = piano ? [piano] : tonoReserva(ganancia, 440 * Math.pow(2, (midi - 69) / 12), fin + 0.05);
    const voz = { ganancia, osciladores: fuentes };
    fuentesCoroActivas.push(voz);
    const limpiar = setTimeout(() => {
        fuentesCoroActivas = fuentesCoroActivas.filter(v => v !== voz);
    }, (dur + 0.1) * 1000);
    temporizadoresCoro.push(limpiar);
}

function programarVocesCoro(reloj, idEjecucion, activo, velocidad) {
    const ritmo = velocidad || 1;
    cancelarVocesCoro();
    if (!eligioCoro || !vocesCoro.length) return;
    vocesCoro.forEach(nota => {
        if (nota.time < reloj.tiempoBase - 0.001) return;
        const espera = esperaMsHasta(reloj, nota.time, ritmo);
        const timer = setTimeout(() => {
            if (idEjecucion !== idGuia || !activo()) return;
            sonarNotaCoro(nota.nombre, nota.duracion / ritmo);
        }, espera);
        temporizadoresCoro.push(timer);
    });
}

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
        const activo = () => modoKaraoke && estadoKaraoke === "reproduciendo";
        programarAcompanamiento(relojKaraoke, idGuia, activo, null, nueva);
        programarVocesCoro(relojKaraoke, idGuia, activo, nueva);
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
    const nivel = ((typeof volumen === "number") ? volumen : VOLUMEN_MELODIA) * FACTOR_PIANO;
    const ganancia = audioContext.createGain();
    const fin = envolverNota(ganancia, nivel, ahora, dur);
    const midi = midiDesdeNombreIngles(nombreNotaIngles);
    const piano = fuentePiano(ganancia, midi, fin + 0.05);
    const fuentes = piano ? [piano] : tonoReserva(ganancia, 440 * Math.pow(2, (midi - 69) / 12), fin + 0.05);
    sonidoEscuchaActual = { ganancia, osciladores: fuentes };
}

function sonarAcorde(nombres, duracion) {
    asegurarAudioContext();
    silenciarAcorde();
    const dur = Math.max(duracion || 0.4, 0.12);
    const ahora = audioContext.currentTime;
    const ganancia = audioContext.createGain();
    const nivel = (nombres.length > 1 ? 0.16 : 0.22) * FACTOR_PIANO;
    const fin = envolverNota(ganancia, nivel, ahora, dur);
    const fuentes = [];
    nombres.forEach(nombre => {
        const midi = midiDesdeNombreIngles(nombre);
        const piano = fuentePiano(ganancia, midi, fin + 0.05);
        if (piano) fuentes.push(piano);
        else tonoReserva(ganancia, 440 * Math.pow(2, (midi - 69) / 12), fin + 0.05).forEach(o => fuentes.push(o));
    });
    sonidoAcordeActual = { ganancia, osciladores: fuentes };
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
    silenciarVocesCoro();
}

function actualizarControlesEscucha() {
    const caja = document.getElementById('controles-escucha');
    caja.style.display = modoEscucha ? 'flex' : 'none';

    const sonando = (estadoEscucha === 'reproduciendo');
    document.getElementById('btn-pausa-escucha').style.display = sonando ? 'inline-block' : 'none';
    document.getElementById('btn-seguir-escucha').style.display = sonando ? 'none' : 'inline-block';
    document.getElementById('btn-entrenar-aqui').style.display = sonando ? 'none' : 'inline-block';

    document.getElementById('btn-seguir-escucha').innerText =
        (estadoEscucha === 'fin') ? 'Escuchar de nuevo ↺' : 'Seguir escuchando ▶';
    document.getElementById('btn-entrenar-aqui').innerText =
        (estadoEscucha === 'fin') ? 'Entrenar desde el principio 🎤' : 'Entrenar desde esta palabra 🎤';

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
        if (cargarSiguienteEstrofaSolo()) {
            iniciarEscuchaDesde(0);
            return;
        }
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
    // Tras todas las estrofas, la repetición vuelve a la primera letra.
    if (estrofasSolo.length) {
        indiceEstrofaSolo = 0;
        FRASES_JUEGO = armarFrasesDesdeLineas(estrofasSolo[0], notasMelodiaCancion);
    }
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
        await asegurarMicrofono("entrenamiento");
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

function armarFrasesDesdeLineas(lineasLetra, notasRaw) {
    let tAcumulado = 0;
    const notasListaCompleta = (notasRaw || []).map(n => {
        let nombre = (typeof n === 'string') ? n : (n.name || n.note || n.pitch || "");
        let duracion = (typeof n === 'object' && n.duration) ? n.duration : 0.4;
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

    const frases = [];
    let notasContador = 0;
    (lineasLetra || []).forEach(linea => {
        if (!linea.linea_completa) return;
        let palabrasFrase = linea.linea_completa.split(/\s+/);
        const palabrasVisibles = (linea.texto_visible || "").split(/\s+/).filter(Boolean);
        palabrasFrase.forEach((palBase, idxPalabra) => {
            let palabraLimpia = palBase.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
            let palabraMarcada = null;
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
                frases.push({
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
    return frases;
}

function construirLineaKaraokeCoroPasadas() {
    const pasadas = datosCoroEntradas.pasadas;
    notasLineaKaraoke = [];
    const frasesAcumuladas = [];
    let indicePasadaBajos = 0;
    pasadas.forEach(p => {
        if (!p.bajos) return;
        const offset = typeof p.offset === "number" ? p.offset : 0;
        const idxEstrofa = typeof p.estrofa === "number" ? p.estrofa : 0;
        const lineas = (estrofasSolo[idxEstrofa] && estrofasSolo[idxEstrofa].length)
            ? estrofasSolo[idxEstrofa]
            : null;
        const frases = lineas
            ? armarFrasesDesdeLineas(lineas, notasMelodiaCancion)
            : FRASES_JUEGO.map(f => ({
                palabra: f.palabra,
                palabraMarcada: f.palabraMarcada,
                notes: f.notes.slice(),
                notesIngles: f.notesIngles.slice(),
                duraciones: f.duraciones.slice(),
                tiempos: f.tiempos.slice(),
                silabas: f.silabas.slice()
            }));
        const baseIdx = frasesAcumuladas.length;
        frases.forEach((palabra, iPalabra) => {
            frasesAcumuladas.push({
                palabra: palabra.palabra,
                palabraMarcada: palabra.palabraMarcada,
                notes: palabra.notes.slice(),
                notesIngles: palabra.notesIngles.slice(),
                duraciones: palabra.duraciones.slice(),
                tiempos: palabra.tiempos.map(t => t + offset),
                silabas: palabra.silabas.slice()
            });
            palabra.notesIngles.forEach((ingles, indiceNota) => {
                notasLineaKaraoke.push({
                    palabraIndex: baseIdx + iPalabra,
                    notaIndex: indiceNota,
                    tiempo: palabra.tiempos[indiceNota] + offset,
                    duracion: palabra.duraciones[indiceNota] || 0.4,
                    ingles,
                    nombre: palabra.notes[indiceNota],
                    pasada: indicePasadaBajos,
                    acertada: false,
                    juzgada: false
                });
            });
        });
        indicePasadaBajos++;
    });
    FRASES_JUEGO = frasesAcumuladas;
}

function construirLineaKaraoke() {
    if (eligioCoro && datosCoroEntradas && Array.isArray(datosCoroEntradas.pasadas) && datosCoroEntradas.pasadas.length) {
        construirLineaKaraokeCoroPasadas();
        return;
    }
    const pasos = pasosDesplazamientoBajos();
    notasLineaKaraoke = [];
    pasos.forEach((offset, pasada) => {
        FRASES_JUEGO.forEach((palabra, indicePalabra) => {
            palabra.notesIngles.forEach((ingles, indiceNota) => {
                notasLineaKaraoke.push({
                    palabraIndex: indicePalabra,
                    notaIndex: indiceNota,
                    tiempo: palabra.tiempos[indiceNota] + offset,
                    duracion: palabra.duraciones[indiceNota] || 0.4,
                    ingles: ingles,
                    nombre: palabra.notes[indiceNota],
                    pasada,
                    acertada: false,
                    juzgada: false
                });
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

function firmaEnTiempo(tiempo) {
    let activa = firmasCompas[0] || { time: 0, pulsos: pulsosPorCompas, segundosPorPulso };
    for (const firma of firmasCompas) {
        if (tiempo + 1e-6 >= firma.time) activa = firma;
        else break;
    }
    return activa;
}

function restaurarCompasInicial() {
    const firma = firmasCompas[0] || { pulsos: 4, segundosPorPulso: 0.6 };
    pulsosPorCompas = firma.pulsos;
    segundosPorPulso = firma.segundosPorPulso;
}

function pulsoDeTiempo(tiempo) {
    const firma = firmaEnTiempo(tiempo);
    const local = Math.max(0, tiempo - (firma.time || 0));
    const pulso = Math.floor(local / firma.segundosPorPulso + 1e-4);
    return (pulso % firma.pulsos) + 1;
}

function actualizarLucesCompas() {
    const caja = document.getElementById('compas-karaoke');
    if (!caja) return;
    const enKaraoke = modoKaraoke && estadoKaraoke !== 'fin';
    const enEscucha = modoEscucha && estadoEscucha !== 'fin';
    const enRitmo = modoRitmo && (estadoRitmo === 'reproduciendo' || estadoRitmo === 'cuenta' || estadoRitmo === 'pausada');
    if (esCalentamiento(cancionActual) || (!enKaraoke && !enEscucha && !enRitmo)) {
        caja.hidden = true;
        return;
    }
    caja.hidden = false;
    let tiempoActual = null;
    if (modoKaraoke && estadoKaraoke === 'reproduciendo') {
        tiempoActual = relojKaraoke.tiempoBase + (performance.now() - relojKaraoke.t0) / 1000 * velocidadKaraoke;
        pulsoCompasMarcado = pulsoDeTiempo(tiempoActual);
    } else if (modoEscucha && estadoEscucha === 'reproduciendo') {
        tiempoActual = relojEscucha.tiempoBase + (performance.now() - relojEscucha.t0) / 1000;
        pulsoCompasMarcado = pulsoDeTiempo(tiempoActual);
    } else if (modoRitmo && estadoRitmo === 'reproduciendo') {
        tiempoActual = tiempoActualRitmo();
        pulsoCompasMarcado = pulsoDeTiempo(tiempoActual);
    } else if (modoRitmo && estadoRitmo === 'pausada') {
        tiempoActual = relojRitmo.tiempoBase;
        pulsoCompasMarcado = pulsoDeTiempo(tiempoActual);
    }
    if (tiempoActual != null) {
        const firma = firmaEnTiempo(tiempoActual);
        pulsosPorCompas = firma.pulsos;
        segundosPorPulso = firma.segundosPorPulso;
    }
    if (caja.childElementCount !== pulsosPorCompas) {
        caja.replaceChildren();
        for (let i = 1; i <= pulsosPorCompas; i++) {
            const numero = document.createElement('span');
            numero.textContent = String(i);
            caja.appendChild(numero);
        }
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
    let aviso = "🤫 Aquí no cantamos";
    if (eligioCoro && configCoro) {
        const mensajeCoro = (datosCoroEntradas && datosCoroEntradas.mensajeEspera) || configCoro.mensajeEspera;
        if (siguienteNota === notasLineaKaraoke[0] && mensajeCoro) {
            aviso = `🤫 ${mensajeCoro}`;
        } else if (datosCoroEntradas && Array.isArray(datosCoroEntradas.pasadas) && mensajeCoro) {
            aviso = `🤫 ${mensajeCoro}`;
        } else if (configCoro.tipo === "entradas" && siguienteNota.pasada === 1) {
            aviso = "🤫 Esperamos a las contraltos";
        }
    }
    pantalla.innerText = aviso;
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
    const bpm = (header.tempos && header.tempos[0] && header.tempos[0].bpm) || 100;
    const ppq = header.ppq || 480;
    const lista = (header.timeSignatures && header.timeSignatures.length)
        ? header.timeSignatures
        : [{ ticks: 0, timeSignature: [4, 4] }];
    firmasCompas = lista.map(entrada => {
        const firma = entrada.timeSignature || [4, 4];
        const numerador = firma[0] || 4;
        const denominador = firma[1] || 4;
        const ticks = typeof entrada.ticks === "number" ? entrada.ticks : 0;
        const time = typeof entrada.time === "number" ? entrada.time : ticks / ppq * (60 / bpm);
        return {
            time,
            pulsos: Math.min(12, Math.max(1, Math.round(numerador))),
            segundosPorPulso: (60 / bpm) * (4 / denominador)
        };
    }).sort((a, b) => a.time - b.time);
    pulsosPorCompas = firmasCompas[0].pulsos;
    segundosPorPulso = firmasCompas[0].segundosPorPulso;
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
    restaurarCompasInicial();
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
    if (eligioCoro && indiceNotaKaraoke === 0) {
        relojKaraoke = { t0: performance.now(), tiempoBase: tiempoInicioCoro() };
    } else {
        relojKaraoke = relojConAnticipo(nota.tiempo);
    }
    estadoKaraoke = "reproduciendo";
    palabraMostradaIndex = -1;
    actualizarControlesKaraoke();
    actualizarLucesCompas();
    const activo = () => modoKaraoke && estadoKaraoke === "reproduciendo";
    programarAcompanamiento(relojKaraoke, idEjecucion, activo, null, velocidadKaraoke);
    programarVocesCoro(relojKaraoke, idEjecucion, activo, velocidadKaraoke);
    const espera = nota.tiempo - relojKaraoke.tiempoBase;
    if (espera > UMBRAL_SILENCIO_ESCUCHA) {
        mostrarSilencioKaraoke(nota.tiempo, nota);
        programarKaraoke(nota.tiempo, () => emitirNotaKaraoke(idEjecucion), idEjecucion);
    } else if (espera > 0.02) {
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

function haySiguienteEstrofaSolo() {
    if (modoKaraoke && eligioCoro) return false;
    return estrofasSolo.length > 1 && indiceEstrofaSolo + 1 < estrofasSolo.length;
}

function cargarSiguienteEstrofaSolo() {
    if (!haySiguienteEstrofaSolo()) return false;
    indiceEstrofaSolo++;
    FRASES_JUEGO = armarFrasesDesdeLineas(estrofasSolo[indiceEstrofaSolo], notasMelodiaCancion);
    fraseActualIndex = 0;
    return FRASES_JUEGO.length > 0;
}

function iniciarKaraokeDesde(indicePalabra, opciones) {
    cancelarTemporizadores();
    const seguirEstrofa = !!(opciones && opciones.seguirEstrofa);
    const sinCuenta = !!(opciones && opciones.sinCuenta);
    if (!seguirEstrofa) {
        indiceEstrofaSolo = 0;
        aciertosKaraokeSesion = 0;
        totalNotasKaraokeSesion = 0;
        if (!eligioCoro && estrofasSolo.length) {
            FRASES_JUEGO = armarFrasesDesdeLineas(estrofasSolo[0], notasMelodiaCancion);
        }
    }
    if (!FRASES_JUEGO.length) return;

    construirLineaKaraoke();
    aciertosKaraoke = 0;
    indiceNotaKaraoke = 0;
    if (indicePalabra > 0) {
        const encontrado = notasLineaKaraoke.findIndex(nota => nota.palabraIndex >= indicePalabra);
        indiceNotaKaraoke = encontrado < 0 ? 0 : encontrado;
    }

    modoKaraoke = true;
    estadoKaraoke = sinCuenta ? "reproduciendo" : "cuenta";
    cuentaKaraokePendiente = false;
    fraseActualIndex = notasLineaKaraoke[indiceNotaKaraoke].palabraIndex;
    document.getElementById('zona-reinicio').style.display = 'none';
    document.getElementById('controles-escucha').style.display = 'none';

    const primera = notasLineaKaraoke[indiceNotaKaraoke];
    relojKaraoke = { t0: performance.now(), tiempoBase: primera.tiempo };
    palabraMostradaIndex = -1;             // obliga a dibujar la primera palabra
    idGuia++;
    document.getElementById("btn-volver-calentamiento").hidden = !esCalentamiento(cancionActual);
    if (esCalentamiento(cancionActual) || sinCuenta) {
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
    silenciarVocesCoro();
    notaEnJuicio = null;

    // Solo: tras la 1ª estrofa, misma melodía con la 2ª letra desde el principio (sin cuenta ni tono).
    if (haySiguienteEstrofaSolo()) {
        aciertosKaraokeSesion += aciertosKaraoke;
        totalNotasKaraokeSesion += notasLineaKaraoke.length;
        if (cargarSiguienteEstrofaSolo()) {
            iniciarKaraokeDesde(0, { seguirEstrofa: true, sinCuenta: true });
            return;
        }
    }

    estadoKaraoke = 'fin';

    const aciertos = aciertosKaraokeSesion + aciertosKaraoke;
    const total = totalNotasKaraokeSesion + notasLineaKaraoke.length;
    const promedio = total ? Math.round((aciertos * 100) / total) : 0;
    anotarCancionEstudiadaHoy({ aciertos, total, promedio });
    document.getElementById('palabra-pantalla').innerText = "🎉 Karaoke";
    document.getElementById('secuencia-visual').innerHTML = "";

    const resumen = document.createElement('div');
    resumen.className = 'resumen-final';

    const logro = document.createElement('div');
    logro.className = 'resumen-logro';
    logro.innerText = total === 1
        ? `Has acertado ${aciertos} de 1 nota.`
        : `Has acertado ${aciertos} de ${total} notas.`;
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
    soltarMicrofono();
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
    const btnRitmo = document.getElementById("btn-volver-ritmo");
    if (btnRitmo) btnRitmo.hidden = true;
    const btnPajaro = document.getElementById("btn-volver-pajaro");
    if (btnPajaro) btnPajaro.hidden = true;
    const btnColibri = document.getElementById("btn-volver-colibri");
    if (btnColibri) btnColibri.hidden = true;
    const zonaRitmo = document.getElementById("zona-pulso-ritmo");
    if (zonaRitmo) zonaRitmo.hidden = true;
    const escenario = document.getElementById("escenario-pajaro");
    if (escenario) escenario.hidden = true;
    const escenarioColibri = document.getElementById("escenario-colibri");
    if (escenarioColibri) escenarioColibri.hidden = true;
    const contPajaro = document.getElementById("controles-pajaro");
    if (contPajaro) contPajaro.style.display = "none";
    const contColibri = document.getElementById("controles-colibri");
    if (contColibri) contColibri.style.display = "none";
    cerrarApartadosMenu();
    actualizarBotonAyuda();
}

cargarPiano();
