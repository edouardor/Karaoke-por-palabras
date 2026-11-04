
let FRASES_JUEGO = []; 
let fraseActualIndex = 0;
let notaSecuenciaIndex = 0; 
let muestrasConsecutivasBien = 0;
const MUESTRAS_NECESARIAS = 3; 
let reproduciendoGuia = false;
let ultimaNotaValidadaTexto = "";
let toleranciaCentsConfigurada = 45; 

function actualizarTextoDificultad(valor) {
    const txt = document.getElementById('txt-dificultad');
    if(valor == "15") txt.innerHTML = "Profesional (±15 cents) 🎯";
    if(valor == "30") txt.innerHTML = "Coral (±30 cents) 🎙️";
    if(valor == "45") txt.innerHTML = "Fácil (±45 cents) ☕";
    if(valor == "60") txt.innerHTML = "Iniciación / Muy Fácil (±60 cents) 👶";
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
async function iniciarApp() {
    try {
        FRASES_JUEGO = [];
        fraseActualIndex = 0;
        notaSecuenciaIndex = 0;
        muestrasConsecutivasBien = 0;
        ultimaNotaValidadaTexto = "";

        toleranciaCentsConfigurada = parseInt(document.getElementById('selector-dificultad').value) || 45;

        const cancionSeleccionada = document.getElementById('selector-cancion').value;
        document.getElementById('btn-comenzar').style.display = 'none';
        document.getElementById('zona-seleccion').style.display = 'none';
        document.getElementById('zona-reinicio').style.display = 'none';
        document.getElementById('status-box').style.display = 'block';

        const [resNotas, resTexto] = await Promise.all([
            fetch(`./canciones/${cancionSeleccionada}.json`),
            fetch(`./canciones/${cancionSeleccionada} txt.json`) 
        ]);

        if (!resNotas.ok || !resTexto.ok) throw new Error("Archivos JSON no encontrados.");

        const datosNotas = await resNotas.json();
        let datosTexto = await resTexto.json();

        if (datosTexto.default) datosTexto = datosTexto.default;

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

        let notasListaCompleta = notasRaw.map(n => {
            let nombre = (typeof n === 'string') ? n : (n.name || n.note || n.pitch || "");
            let duracion = (typeof n === 'object' && n.duration) ? n.duration : 0.4;
            let notaLimpia = nombre.replace(/[0-9]/g, '').trim();
            const traducciones = {"C": "Do", "D": "Re", "E": "Mi", "F": "Fa", "G": "Sol", "A": "La", "B": "Si"};
            let notaBase = notaLimpia.charAt(0).toUpperCase() + notaLimpia.slice(1);
            return {
                nombre: traducciones[notaBase.charAt(0)] ? traducciones[notaBase.charAt(0)] + notaBase.slice(1) : notaLimpia,
                duracion: duracion
            };
        }).filter(n => n.nombre !== "");

        let notasContador = 0;
        lineasLetra.forEach(linea => {
            if (!linea.linea_completa) return;
            let palabrasFrase = linea.linea_completa.split(/\s+/);
            palabrasFrase.forEach(palBase => {
                let palabraLimpia = palBase.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
                let numeroSilabas = (palBase.match(/-/g) || []).length + 1;
                let silabasLista = palBase.replace(/[.,\/#!$%\^&\*;:{}=_`~()]/g,"").split("-");
                
                let notasDeEstaPalabra = [];
                let notasInglesDeEstaPalabra = [];
                let duracionesDeEstaPalabra = [];
                let silabasDeEstaPalabra = [];
                
                for (let i = 0; i < numeroSilabas; i++) {
                    if (notasListaCompleta[notasContador]) {
                        notasDeEstaPalabra.push(notasListaCompleta[notasContador].nombre);
                        notasInglesDeEstaPalabra.push(notasRaw[notasContador].name || notasRaw[notasContador].note || "D4");
                        duracionesDeEstaPalabra.push(notasListaCompleta[notasContador].duracion);
                        silabasDeEstaPalabra.push(silabasLista[i] || "...");
                        notasContador++;
                    }
                }
                
                if (notasDeEstaPalabra.length > 0) {
                    FRASES_JUEGO.push({
                        palabra: palabraLimpia,
                        notes: notasDeEstaPalabra,
                        notesIngles: notasInglesDeEstaPalabra,
                        duraciones: duracionesDeEstaPalabra,
                        silabas: silabasDeEstaPalabra
                    });
                }
            });
        });

        if (!audioContext) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            dataArray = new Float32Array(analyser.fftSize);
            source.connect(analyser);
        }
        
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        cargarNuevaFrasePalabra();
        bucleDeAudio();

    } catch (err) {
        document.getElementById('palabra-pantalla').innerText = "Error";
        document.getElementById('evaluacion').innerHTML = `<span class='error'>❌ Error: ${err.message}</span>`;
    }
}
function cargarNuevaFrasePalabra() {
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
    document.getElementById('palabra-pantalla').innerText = datosFrase.palabra;
    
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
            if (!reproduciendoGuia) {
                tocarNotaIndividualUsuario(notaIngles, cajaNota);
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

    reproducirCadenaNotasGuia(datosFrase.notesIngles, datosFrase.duraciones, 0);
}

function reproducirCadenaNotasGuia(listaNotas, listaDuraciones, indiceNota) {
    if (indiceNota >= listaNotas.length) {
        setTimeout(() => { 
            reproduciendoGuia = false; 
        }, 300);
        return;
    }
    
    reproduciendoGuia = true;
    const nombreNotaIngles = listaNotas[indiceNota];
    const duracionOriginal = listaDuraciones[indiceNota] || 0.4;
    
    const osciladorBase = audioContext.createOscillator();
    const osciladorHarmonico = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    osciladorBase.type = 'sine';       
    osciladorHarmonico.type = 'sine';  
    
    let notaLetra = nombreNotaIngles.replace(/[0-9]/g, '').trim().toUpperCase();
    let numeroOctava = parseInt(nombreNotaIngles.replace(/[^0-9]/g, '')) || 4;
    
    if (notaLetra === "DB") notaLetra = "C#";
    if (notaLetra === "EB") notaLetra = "D#";
    if (notaLetra === "GB") notaLetra = "F#";
    if (notaLetra === "AB") notaLetra = "G#";
    if (notaLetra === "BB") notaLetra = "A#";

    let hzBase = FRECUENCIAS_BASE_OCTAVA_0[notaLetra] || 18.35; 
    let frecuenciaCalculada = hzBase * Math.pow(2, numeroOctava);
    
    osciladorBase.frequency.value = frecuenciaCalculada;
    osciladorHarmonico.frequency.value = frecuenciaCalculada * 2;
    
    gainNode.gain.setValueAtTime(0.30, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.30, audioContext.currentTime + duracionOriginal - 0.08);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duracionOriginal);
    
    osciladorBase.connect(gainNode);
    osciladorHarmonico.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    osciladorBase.start();
    osciladorHarmonico.start();
    osciladorBase.stop(audioContext.currentTime + duracionOriginal);
    osciladorHarmonico.stop(audioContext.currentTime + duracionOriginal);
    
    setTimeout(() => {
        reproducirCadenaNotasGuia(listaNotas, listaDuraciones, indiceNota + 1);
    }, duracionOriginal * 1000);
}

function tocarNotaIndividualUsuario(nombreNotaIngles, elementoCaja) {
    reproduciendoGuia = true;
    const claseOriginal = elementoCaja.className;
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
        elementoCaja.className = claseOriginal;
        reproduciendoGuia = false;
    }, 1000);
}
function bucleDeAudio() {
    requestAnimationFrame(bucleDeAudio);
    if (reproduciendoGuia) return;

    if (fraseActualIndex >= FRASES_JUEGO.length) return; 

    const datosFraseActual = FRASES_JUEGO[fraseActualIndex];
    const notaAInterpretar = datosFraseActual.notes[notaSecuenciaIndex];
    const notaAInterpretarIngles = datosFraseActual.notesIngles[notaSecuenciaIndex];

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
                    setTimeout(() => {
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

function regresarAlMenu() {
    document.getElementById('status-box').style.display = "none";
    document.getElementById('evaluacion').innerHTML = "";
    document.getElementById('secuencia-visual').innerHTML = "";
    document.getElementById('palabra-pantalla').innerText = "...";
    
    document.getElementById('zona-seleccion').style.display = "block";
    document.getElementById('btn-comenzar').style.display = "inline-block";
}

function regresarAlMenu() {
    document.getElementById('status-box').style.display = "none";
    document.getElementById('evaluacion').innerHTML = "";
    document.getElementById('secuencia-visual').innerHTML = "";
    document.getElementById('palabra-pantalla').innerText = "...";
    
    document.getElementById('zona-seleccion').style.display = "block";
    document.getElementById('btn-comenzar').style.display = "inline-block";
}

