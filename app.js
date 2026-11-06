
let FRASES_JUEGO = []; 
let fraseActualIndex = 0;
let notaSecuenciaIndex = 0; 
let muestrasConsecutivasBien = 0;
const MUESTRAS_NECESARIAS = 3; 
let reproduciendoGuia = false;
let ultimaNotaValidadaTexto = "";
let toleranciaCentsConfigurada = 45; 
let palabraMostradaIndex = 0;            // palabra que se ve en pantalla (para las flechas)
let temporizadorSiguientePalabra = null; // pausa de 800 ms tras acertar una palabra
let idGuia = 0;                          // identifica la reproducción de guía vigente
let esperandoSiguientePalabra = false;   // pausa del micro entre una palabra acertada y la siguiente
// ---- Modo escucha solo ----
// ---- Guía sonora del modo entrenamiento ----
const GUIA_PROPORCION_SOSTENIDO = 0.85;  // cada nota suena al menos el 85 % del tiempo hasta la siguiente...
const GUIA_SOSTENIDO_MAXIMO = 0.6;       // ...pero sin alargarla más de 0,6 s por encima de su duración original
const GUIA_DURACION_MINIMA_ULTIMA = 0.35; // y la última nota de cada palabra suena al menos 0,35 s

const UMBRAL_SILENCIO_ESCUCHA = 3;       // segundos: a partir de aquí se avisa "Aquí no cantamos"
let modoEscucha = false;                 // true mientras se está en el modo escucha
let estadoEscucha = 'reproduciendo';     // 'reproduciendo' | 'pausada' | 'fin'
let temporizadorEscucha = null;          // temporizador de la siguiente nota
let relojEscucha = { t0: 0, tiempoBase: 0 }; // referencia para no acumular retraso
let sonidoEscuchaActual = null;          // última nota sonando (para silenciarla al pausar)
let enSilencio = false;                  // true mientras se muestra "Aquí no cantamos"
let intervaloSilencio = null;            // actualiza la cuenta atrás del silencio
let cancionActual = "";                  // canción elegida (para pasar de escucha a entrenamiento)

let bucleAudioActivo = false;            // evita arrancar varios bucles de audio a la vez

// ---- Ajustes específicos por canción ----
// Canciones en las que el usuario canta primero la nota inicial y la melodía se transpone a ella
const CANCIONES_AFINACION_LIBRE = ["Cumpleanos Feliz"];
// Dificultad (cents) que se propone al elegir cada canción
const DIFICULTAD_POR_CANCION = { "Cumpleanos Feliz": 60 };   // 60 = Muy Fácil
let dificultadPreviaUsuario = null;

let modoCalibracion = false;             // true mientras se espera la primera nota
let muestrasCalibracion = [];
const MUESTRAS_CALIBRACION = 25;         // ~0,4 s de nota estable
const MIDI_MIN_PRIMERA_NOTA = 36;        // Do2
const MIDI_MAX_PRIMERA_NOTA = 64;        // Mi4 (la melodía sube hasta una octava por encima)

const NOMBRES_NOTA_INGLES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const NOMBRES_NOTA_ESPANOL = ["Do","Do#","Re","Re#","Mi","Fa","Fa#","Sol","Sol#","La","La#","Si"];

function actualizarTextoDificultad(valor) {
    const txt = document.getElementById('txt-dificultad');
    if(valor == "15") txt.innerHTML = "Profesional 🎯";
    if(valor == "30") txt.innerHTML = "Coral 🎙️";
    if(valor == "45") txt.innerHTML = "Fácil ☕";
    if(valor == "60") txt.innerHTML = "Iniciación / Muy Fácil 👶";
}

let audioContext;
let analyser;
let dataArray;
let source;

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
    if (rrms < 0.015) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buffer[i]) < thres) { r1 = i; break; } }
    for (let i = SIZE - 1; i >= SIZE / 2; i--) { if (Math.abs(buffer[i]) < thres) { r2 = i; break; } }
    buffer = buffer.slice(r1, r2); SIZE = buffer.length;

    let c = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) { c[i] = c[i] + buffer[j] * buffer[j + i]; }
    }
    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
    let T0 = maxpos;
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2; let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    return sampleRate / T0;
}
// Carga un archivo de la carpeta "canciones". Si falla, prueba las otras formas de escribir
// la ñ y las tildes (NFC/NFD), que cambian según el sistema operativo con el que se creó el archivo.
async function cargarArchivoCancion(nombreArchivo) {
    const variantes = [...new Set([nombreArchivo, nombreArchivo.normalize('NFC'), nombreArchivo.normalize('NFD')])];
    let respuesta;
    for (const nombre of variantes) {
        respuesta = await fetch(`./canciones/${nombre}`);
        if (respuesta.ok) return respuesta;
    }
    return respuesta;
}

async function iniciarApp(modo = 'entrenamiento') {
    try {
        cancelarTemporizadores();
        FRASES_JUEGO = [];
        fraseActualIndex = 0;
        notaSecuenciaIndex = 0;
        muestrasConsecutivasBien = 0;
        ultimaNotaValidadaTexto = "";

        toleranciaCentsConfigurada = parseInt(document.getElementById('selector-dificultad').value) || 45;

        const cancionSeleccionada = document.getElementById('selector-cancion').value.trim();
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

        if (datosTexto.default) datosTexto = datosTexto.default;

        // Mostrar el nombre de la canción junto al del coro
        const tituloCancion = datosTexto.titulo || cancionSeleccionada;
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
        if (datosNotas.tracks && Array.isArray(datosNotas.tracks)) {
            const pista = datosNotas.tracks.find(t => t.notes && t.notes.length > 0);
            if (pista) notasRaw = pista.notes;
        }

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
            return;
        }

        // ----- MODO ENTRENAMIENTO -----
        await asegurarMicrofono();

        if (CANCIONES_AFINACION_LIBRE.includes(cancionSeleccionada)) {
            iniciarCalibracion();
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
        document.getElementById('evaluacion').innerHTML = "<span class='success'>¡Felicidades, cantaste todas las palabras correctamente!</span>";
        document.getElementById('zona-reinicio').style.display = "block";
        return;
    }
    
    notaSecuenciaIndex = 0;
    muestrasConsecutivasBien = 0;
    ultimaNotaValidadaTexto = "";
    
    const datosFrase = FRASES_JUEGO[fraseActualIndex];
    const pantallaPalabra = document.getElementById('palabra-pantalla');
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
        cajaNota.style.cursor = "pointer";
        
        cajaNota.onclick = () => {
            if (!reproduciendoGuia && !modoEscucha) {
                tocarNotaIndividualUsuario(notaIngles, cajaNota, idx, palabraMostradaIndex);
            }
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
            let diferenciaSemitonosReales = valorMidiActual - valorMidiPrimeraReferencia;
            let desplazamientoPixeles = diferenciaSemitonosReales * -5; 
            
            bloque.style.transform = `translateY(${desplazamientoPixeles}px)`;
            bloque.style.marginTop = "45px"; 
            bloque.style.marginBottom = "45px";
        }
        
        bloque.appendChild(divSilaba);
        bloque.appendChild(cajaNota);
        contenedorVisual.appendChild(bloque);
    });

    if (!sinGuia) {
        idGuia++;
        reproducirCadenaNotasGuia(datosFrase.notesIngles, datosFrase.duraciones, 0, idGuia, datosFrase.tiempos);
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
    limpiarSilencioEscucha();
    silenciarSonidoEscucha();
    modoEscucha = false;
}

function actualizarFlechas() {
    const btnAnt = document.getElementById('btn-anterior');
    const btnSig = document.getElementById('btn-siguiente');
    if (!btnAnt || !btnSig) return;
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
    sonarNota(listaNotas[indiceNota], sonido);

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
    document.getElementById('evaluacion').innerText = "";
}
function bucleDeAudio() {
    requestAnimationFrame(bucleDeAudio);
    if (modoCalibracion) { procesarCalibracion(); return; }
    if (reproduciendoGuia || esperandoSiguientePalabra || modoEscucha) return;

    if (fraseActualIndex >= FRASES_JUEGO.length) return; 

    const datosFraseActual = FRASES_JUEGO[fraseActualIndex];
    const notaAInterpretar = datosFraseActual.notes[notaSecuenciaIndex];
    const notaAInterpretarIngles = datosFraseActual.notesIngles[notaSecuenciaIndex];
    if (!notaAInterpretar || !notaAInterpretarIngles) return; // seguridad: índice fuera de la palabra

    analyser.getFloatTimeDomainData(dataArray);
    const frecuencia = autoCorrelacion(dataArray, audioContext.sampleRate);

    if (frecuencia === -1) {
        ultimaNotaValidadaTexto = ""; 
        return;
    }

    if (frecuencia > 60 && frecuencia < 1000) {
        const valorMidiUsuario = 69 + 12 * Math.log2(frecuencia / 440);
        const idUsuarioCromatico = Math.round(valorMidiUsuario) % 12;
        const notaUsuarioTexto = hzANombreEspanol(frecuencia);

        if (notaUsuarioTexto === ultimaNotaValidadaTexto && notaSecuenciaIndex > 0 && datosFraseActual.notes[notaSecuenciaIndex - 1] === notaAInterpretar) {
            return;
        }

        const idObjective = MAPA_NOTAS_A_NUMERO[notaAInterpretar.toLowerCase()];

        const distanciaCromatica = Math.min(
            Math.abs(idUsuarioCromatico - idObjective), 
            12 - Math.abs(idUsuarioCromatico - idObjective)
        );

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

        if (distanciaCromatica > 0) {
            if (desviacionCents > 0) desviacionCents = 150;
            if (desviacionCents < 0) desviacionCents = -150;
        }

        let cajaActiva = document.getElementById(`caja-nota-${notaSecuenciaIndex}`);
        let absDesviacion = Math.abs(desviacionCents);

        if (absDesviacion <= toleranciaCentsConfigurada) {
            // AFINACIÓN CORRECTA (ZONA DE ESCUCHA ACTIVA)
            muestrasConsecutivasBien++;
            if (cajaActiva) {
                cajaActiva.className = "nota-caja activa"; 
            }

            if (muestrasConsecutivasBien >= MUESTRAS_NECESARIAS) {
                if (cajaActiva) {
                    cajaActiva.className = "nota-caja completada"; 
                }
                
                ultimaNotaValidadaTexto = notaUsuarioTexto;
                notaSecuenciaIndex++;
                muestrasConsecutivasBien = 0;
                
                if (notaSecuenciaIndex >= datosFraseActual.notes.length) {
                    document.getElementById('evaluacion').innerHTML = "<span class='success'>¡Palabra correcta! ✨</span>";
                    fraseActualIndex++;
                    ultimaNotaValidadaTexto = ""; 
                    esperandoSiguientePalabra = true; // ignora el micro hasta cargar la siguiente palabra
                    temporizadorSiguientePalabra = setTimeout(() => {
                        document.getElementById('evaluacion').innerText = "";
                        cargarNuevaFrasePalabra();
                    }, 800);
                } else {
                    let siguienteCaja = document.getElementById(`caja-nota-${notaSecuenciaIndex}`);
                    if (siguienteCaja) siguienteCaja.className = "nota-caja activa";
                }
            }
        } else {
            // DESVIACIÓN DE AFINACIÓN fuera del rango elástico base
            muestrasConsecutivasBien = 0;
            if (notaUsuarioTexto !== "..." && notaUsuarioTexto !== ultimaNotaValidadaTexto) {
                ultimaNotaValidadaTexto = "";
            }

        
            if (cajaActiva) {
                // --- AJUSTE DEFINITIVO: AMARILLO FIJO A TOLERANCIA + 15 CENTS ---
                if (absDesviacion <= (toleranciaCentsConfigurada + 15)) {
                    cajaActiva.className = "nota-caja umbral-amarillo"; // Rango intermedio visible
                } else {
                    cajaActiva.className = "nota-caja umbral-rojo";     // Fuera del amarillo (Alerta roja)
                }
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
        cargarNuevaFrasePalabra();
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
    const cancion = document.getElementById('selector-cancion').value.trim();

    if (cancion in DIFICULTAD_POR_CANCION) {
        if (dificultadPreviaUsuario === null) dificultadPreviaUsuario = slider.value;
        slider.value = DIFICULTAD_POR_CANCION[cancion];
    } else if (dificultadPreviaUsuario !== null) {
        slider.value = dificultadPreviaUsuario;   // recupera la dificultad que tenía el usuario
        dificultadPreviaUsuario = null;
    }
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

async function asegurarMicrofono() {
    asegurarAudioContext();
    if (!analyser) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        dataArray = new Float32Array(analyser.fftSize);
        source.connect(analyser);
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}

// ==========================================
// MODO ESCUCHA SOLO
// ==========================================
// Suena la canción entera, palabra tras palabra, con el ritmo real del MIDI
// (incluidos los silencios) y sin parar al final de cada palabra.

function sonarNota(nombreNotaIngles, duracion) {
    asegurarAudioContext();
    const dur = Math.max(duracion || 0.4, 0.12);
    const ahora = audioContext.currentTime;

    let letra = nombreNotaIngles.replace(/[0-9]/g, '').trim().toUpperCase();
    const octava = parseInt(nombreNotaIngles.replace(/[^0-9]/g, '')) || 4;
    if (letra === "DB") letra = "C#";
    if (letra === "EB") letra = "D#";
    if (letra === "GB") letra = "F#";
    if (letra === "AB") letra = "G#";
    if (letra === "BB") letra = "A#";
    const frecuencia = (FRECUENCIAS_BASE_OCTAVA_0[letra] || 18.35) * Math.pow(2, octava);

    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const ganancia = audioContext.createGain();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = frecuencia;
    osc2.frequency.value = frecuencia * 2;

    ganancia.gain.setValueAtTime(0.30, ahora);
    ganancia.gain.setValueAtTime(0.30, ahora + Math.max(0, dur - 0.08));
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + dur);

    osc1.connect(ganancia);
    osc2.connect(ganancia);
    ganancia.connect(audioContext.destination);
    osc1.start();
    osc2.start();
    osc1.stop(ahora + dur);
    osc2.stop(ahora + dur);

    sonidoEscuchaActual = { ganancia, osciladores: [osc1, osc2] };
}

// Apaga con un fundido corto la nota que esté sonando (al pausar o salir)
function silenciarSonidoEscucha() {
    if (!sonidoEscuchaActual || !audioContext) return;
    const { ganancia, osciladores } = sonidoEscuchaActual;
    sonidoEscuchaActual = null;
    try {
        const ahora = audioContext.currentTime;
        ganancia.gain.cancelScheduledValues(ahora);
        ganancia.gain.setValueAtTime(Math.max(ganancia.gain.value, 0.0001), ahora);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + 0.06);
        osciladores.forEach(o => o.stop(ahora + 0.07));
    } catch (e) { /* la nota ya había terminado */ }
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

    relojEscucha = { t0: performance.now(), tiempoBase: FRASES_JUEGO[indicePalabra].tiempos[0] };
    idGuia++;
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
    tocarNotaEscucha(0, idEjecucion);
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
    sonarNota(palabra.notesIngles[i], palabra.duraciones[i]);

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
    limpiarSilencioEscucha();
    silenciarSonidoEscucha();
    estadoEscucha = 'pausada';              // fraseActualIndex = palabra en la que se paró
    if (estabaEnSilencio) cargarNuevaFrasePalabra(true);   // se muestra la palabra que vendría tras el silencio
    actualizarControlesEscucha();
}

function terminarEscucha() {
    limpiarSilencioEscucha();
    estadoEscucha = 'fin';
    fraseActualIndex = 0;                   // "volver a escuchar" y "entrenar" parten del principio
    palabraMostradaIndex = FRASES_JUEGO.length;   // la flecha ◀ lleva a la última palabra
    actualizarFlechas();
    document.getElementById('palabra-pantalla').innerText = "🎧 Fin de la canción";
    document.getElementById('secuencia-visual').innerHTML = "";
    actualizarControlesEscucha();
}

// Flechas ◀ ▶ durante la escucha
function irAPalabraEnEscucha(nuevoIndice) {
    if (estadoEscucha === 'reproduciendo') {
        iniciarEscuchaDesde(nuevoIndice);   // sigue sonando desde la palabra elegida
    } else {
        // En pausa (o al final): solo se muestra la palabra y se mantiene la pausa
        estadoEscucha = 'pausada';
        fraseActualIndex = nuevoIndice;
        cargarNuevaFrasePalabra(true);
        actualizarControlesEscucha();
    }
}

// Pasa del modo escucha al entrenamiento, empezando por la palabra en que se paró
async function pasarAEntrenamiento() {
    if (!modoEscucha) return;
    const indice = fraseActualIndex;        // 0 si la escucha había terminado
    cancelarTemporizadores();               // detiene todo y desactiva el modo escucha
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

function regresarAlMenu() {
    cancelarTemporizadores();
    document.getElementById('titulo-cancion').style.display = "none";
    document.getElementById('controles-escucha').style.display = "none";
    document.getElementById('status-box').style.display = "none";
    document.getElementById('evaluacion').innerHTML = "";
    document.getElementById('secuencia-visual').innerHTML = "";
    document.getElementById('palabra-pantalla').innerText = "...";
    
    document.getElementById('zona-seleccion').style.display = "block";
    document.getElementById('botones-inicio').style.display = "flex";
}
