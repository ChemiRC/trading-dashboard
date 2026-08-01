import { useCallback, useEffect, useRef, useState } from "react";

import {
  aplicarDelta,
  aplicarSnapshot,
  crearLibro,
  esContiguo,
} from "../lib/orderbook.js";

/**
 * El libro de órdenes en vivo, por WebSocket público de Bybit.
 *
 * **Directo del navegador al exchange, sin pasar por el backend.** Es el mismo
 * principio que el gráfico de TradingView: datos de mercado públicos, iguales
 * para todo el mundo, que no tienen nada que ver con la cuenta del trader.
 * Aquí no hay API key —el tópico `orderbook` no la pide— así que no hay
 * ningún secreto que proteger, y meter el backend por medio solo añadiría
 * latencia a un flujo de cincuenta mensajes por segundo y un proceso que
 * mantener despierto en Railway. La regla del proyecto sigue intacta: lo que
 * toca la **cuenta** (historial, PnL, posiciones) pasa por el backend y solo
 * el backend tiene credenciales.
 *
 * Este hook se ocupa solo del socket: conectar, suscribirse, mantener vivo,
 * reconectar y detectar que se ha perdido un mensaje. Reconstruir el libro es
 * de `lib/orderbook.js`, que es puro y está probado aparte.
 */

/** Mainnet. Esto es solo mirar el mercado: no toca la cuenta, así que no
 *  depende de `BYBIT_TESTNET` — el libro de testnet no es un mercado real y
 *  enseñarlo sería enseñar ruido. */
const URL_WS = "wss://stream.bybit.com/v5/public/linear";

/** `orderbook.50` da 50 niveles por lado: es el techo de lo que se puede medir. */
export const PROFUNDIDAD = 50;

/**
 * Bybit acepta un ping cada 20 s; aquí va cada 8. No es por mantener viva la
 * conexión —para eso sobra con 20— sino porque el pong es la única prueba de
 * vida cuando el mercado no manda nada: fija un mensaje cada 8 s como suelo, y
 * eso es lo que permite que el vigilante de abajo dispare a los 12 sin dar
 * falsas alarmas.
 */
const INTERVALO_PING = 8_000;

/**
 * Si no llega ni un mensaje en este tiempo, la conexión está muerta aunque el
 * navegador no lo sepa. Un WiFi que se cae no dispara `close`: el socket se
 * queda abierto contra nadie, y sin esto la pantalla seguiría enseñando el
 * libro de hace un minuto **con el rótulo de «en vivo» puesto**. Es el fallo
 * que más importa evitar aquí, porque no se ve: un libro congelado y uno
 * quieto son idénticos en pantalla.
 */
const SILENCIO_MAXIMO = 12_000;

/**
 * Los deltas llegan cada 20 ms. Repintar a esa velocidad es tirar CPU: el ojo
 * no lo distingue y React no está para 50 renders por segundo. El libro se
 * mantiene siempre al día en una `ref` —no se pierde ni un mensaje— y solo se
 * publica a React cinco veces por segundo.
 */
const INTERVALO_PINTADO = 200;

const ESPERA_MINIMA = 500;
const ESPERA_MAXIMA = 10_000;

export function useOrderBook(simbolo) {
  const [libro, setLibro] = useState(crearLibro);
  const [estado, setEstado] = useState("conectando"); // conectando | vivo | caido
  const [error, setError] = useState(null);
  const [ultimoMensaje, setUltimoMensaje] = useState(null);
  const [diagnostico, setDiagnostico] = useState({ reconexiones: 0, resincronizaciones: 0 });

  // Reconectar a mano, desde la interfaz, sin esperar a que venza la espera.
  const [reintento, setReintento] = useState(0);
  const reconectarYa = useCallback(() => setReintento((n) => n + 1), []);

  useEffect(() => {
    if (!simbolo) return undefined;

    const topico = `orderbook.${PROFUNDIDAD}.${simbolo}`;

    let ws = null;
    let cancelado = false; // el efecto se ha limpiado: no tocar nada más
    let intentos = 0;
    let temporizadorReconexion = null;
    let temporizadorPing = null;
    let vigilante = null;
    let pintor = null;

    let libroLocal = crearLibro();
    let sucio = false;
    let ultimo = 0;
    // Se cuenta la vuelta, no cada intento fallido: un corte de veinte
    // segundos es **una** reconexión, no las cinco veces que se probó mientras
    // no había red. Lo segundo mide la longitud del corte, que ya la dice el
    // contador de antigüedad, y de paso convertiría un corte del WiFi en un
    // número alarmante sin motivo.
    let contarLaProxima = false;

    // --- Publicar a React, a ritmo humano ---------------------------------
    pintor = setInterval(() => {
      if (cancelado || !sucio) return;
      sucio = false;
      setLibro(libroLocal);
      setUltimoMensaje(ultimo);
    }, INTERVALO_PINTADO);

    /**
     * Desengancharse de un socket para siempre.
     *
     * Los manejadores se quitan **antes** de cerrar, y esa es la parte que
     * importa: así el socket abandonado no puede disparar un `onclose` tardío
     * que cuente una caída de más o programe una reconexión que compita con la
     * buena. Después de esto, ese socket ya no existe para nadie.
     */
    function descartar(socket) {
      if (!socket) return;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Cerrar algo que ya estaba muerto no es un problema.
      }
    }

    /** Único sitio que declara la conexión caída y pide otra. */
    function caerse({ contar = true } = {}) {
      if (cancelado) return;
      clearInterval(temporizadorPing);
      setEstado("caido");
      if (contar) contarLaProxima = true;
      programarReconexion();
    }

    // --- Vigilante de silencio --------------------------------------------
    vigilante = setInterval(() => {
      if (cancelado || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (!ultimo || Date.now() - ultimo <= SILENCIO_MAXIMO) return;

      // El vigilante **cambia el estado él mismo** en vez de limitarse a
      // cerrar y esperar a `onclose`. Sin red, `close()` no puede completar su
      // saludo de cierre: el socket se queda en CLOSING y `onclose` no llega
      // hasta que vuelve la conexión -- se midió, veintidós segundos --
      // durante los cuales la pantalla seguiría diciendo «en vivo» sobre datos
      // congelados. Justo lo que este vigilante existe para impedir.
      const muerto = ws;
      ws = null;
      descartar(muerto);
      caerse();
    }, 1_000);

    function programarReconexion() {
      if (cancelado || temporizadorReconexion) return;
      // Espera creciente con un poco de azar: si el corte fue de Bybit y no
      // del WiFi, medio mundo reconectaría a la vez en el mismo milisegundo.
      const base = Math.min(ESPERA_MINIMA * 2 ** intentos, ESPERA_MAXIMA);
      const espera = base + Math.random() * 400;
      intentos += 1;
      temporizadorReconexion = setTimeout(() => {
        temporizadorReconexion = null;
        conectar();
      }, espera);
    }

    function conectar() {
      if (cancelado) return;
      descartar(ws); // nunca dos sockets vivos a la vez
      ws = null;
      setEstado((previo) => (previo === "vivo" ? "conectando" : previo));

      try {
        ws = new WebSocket(URL_WS);
      } catch (fallo) {
        setError({ message: `No se pudo abrir la conexión: ${fallo.message}` });
        caerse({ contar: false });
        return;
      }

      ws.onopen = () => {
        if (cancelado) return;
        intentos = 0;
        ultimo = Date.now();
        setError(null);
        if (contarLaProxima) {
          contarLaProxima = false;
          setDiagnostico((d) => ({ ...d, reconexiones: d.reconexiones + 1 }));
        }
        ws.send(JSON.stringify({ op: "subscribe", args: [topico] }));

        clearInterval(temporizadorPing);
        temporizadorPing = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: "ping" }));
        }, INTERVALO_PING);
      };

      ws.onmessage = (evento) => {
        if (cancelado) return;
        ultimo = Date.now();

        let mensaje;
        try {
          mensaje = JSON.parse(evento.data);
        } catch {
          return; // basura por el cable: ignorar, no tumbar la pantalla
        }

        // Respuesta a `subscribe`: es donde se ve si el símbolo no existe.
        if (mensaje.op === "subscribe") {
          if (mensaje.success === false) {
            setError({ message: mensaje.ret_msg || `Bybit rechazó ${topico}` });
            setEstado("caido");
          } else {
            setEstado("vivo");
          }
          return;
        }
        if (mensaje.op === "ping" || mensaje.op === "pong") return;
        if (mensaje.topic !== topico || !mensaje.data) return;

        if (mensaje.type === "snapshot") {
          libroLocal = aplicarSnapshot(mensaje.data);
          sucio = true;
          setEstado("vivo");
          return;
        }

        if (mensaje.type === "delta") {
          if (!esContiguo(libroLocal, mensaje.data)) {
            // Falta un mensaje: el libro local ya no es el de Bybit. Se tira y
            // se pide uno nuevo. Seguir aplicando deltas sobre un libro roto
            // no da un error visible -- da un libro que miente, que es peor.
            setDiagnostico((d) => ({ ...d, resincronizaciones: d.resincronizaciones + 1 }));
            libroLocal = crearLibro();
            sucio = true;
            intentos = 0; // no es un corte: reconectar cuanto antes
            const viejo = ws;
            ws = null;
            descartar(viejo);
            caerse({ contar: false }); // se cuenta como resincronización, no como caída
            return;
          }
          libroLocal = aplicarDelta(libroLocal, mensaje.data);
          sucio = true;
        }
      };

      ws.onerror = () => {
        // `onerror` en un WebSocket no dice qué pasó, por diseño del navegador.
        // El que decide es `onclose`, que siempre llega detrás.
        if (!cancelado) setEstado("caido");
      };

      ws.onclose = () => {
        if (cancelado) return;
        ws = null;
        caerse();
      };
    }

    // Volver a tener red no debería esperarse en la cola de la espera creciente:
    // si el WiFi vuelve al segundo 9 de una espera de 10, reconectar ya.
    function alVolverLaRed() {
      if (cancelado) return;
      if (temporizadorReconexion) {
        clearTimeout(temporizadorReconexion);
        temporizadorReconexion = null;
      }
      intentos = 0;
      if (!ws || ws.readyState === WebSocket.CLOSED) conectar();
    }
    window.addEventListener("online", alVolverLaRed);

    conectar();

    return () => {
      cancelado = true;
      window.removeEventListener("online", alVolverLaRed);
      clearInterval(pintor);
      clearInterval(vigilante);
      clearInterval(temporizadorPing);
      clearTimeout(temporizadorReconexion);
      // `descartar` desarma los manejadores antes de cerrar, que es lo que
      // hace esto seguro en StrictMode: el efecto se monta, se limpia y se
      // vuelve a montar, y sin desarmarlos el `onclose` del socket desechado
      // programaría una reconexión fantasma compitiendo con la del montaje
      // bueno.
      descartar(ws);
      ws = null;
    };
  }, [simbolo, reintento]);

  // Al cambiar de símbolo el libro anterior deja de valer al instante: es de
  // otro activo. Se limpia aquí y no en el efecto para que el repintado ocurra
  // en el mismo ciclo que el cambio, sin un parpadeo con el libro de BTC bajo
  // el rótulo de ETH.
  const anterior = useRef(simbolo);
  if (anterior.current !== simbolo) {
    anterior.current = simbolo;
    setLibro(crearLibro());
    setUltimoMensaje(null);
    setEstado("conectando");
    setError(null);
  }

  return { libro, estado, error, ultimoMensaje, diagnostico, reconectarYa };
}
