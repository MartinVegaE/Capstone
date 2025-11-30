import  {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../../app/AuthContext";

const INACTIVITY_LIMIT_MS = 60 * 1000;
const WARNING_DURATION_MS = 15 * 1000;
const WARNING_DURATION_SECONDS = WARNING_DURATION_MS / 1000;

interface SessionTimeoutManagerProps {
  children: ReactNode;
}

export function SessionTimeoutManager({
  children,
}: SessionTimeoutManagerProps) {
  const { isAuthenticated, logout } = useAuth();

  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const lastActivityRef = useRef(Date.now());
  const warningTimeoutRef = useRef<number | null>(null);
  const logoutTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // Limpia todos los timers/intervalos
  const clearTimers = () => {
    if (warningTimeoutRef.current !== null) {
      window.clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (logoutTimeoutRef.current !== null) {
      window.clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  // Arranca los timers desde "ahora"
  const startTimers = () => {
    if (!isAuthenticated) return;

    clearTimers();
    lastActivityRef.current = Date.now();

    const warningDelay = INACTIVITY_LIMIT_MS - WARNING_DURATION_MS;

    // Timer para mostrar el aviso 30s antes de cerrar sesión
    warningTimeoutRef.current = window.setTimeout(() => {
      setShowWarning(true);
      setSecondsLeft(WARNING_DURATION_SECONDS);

      // Contador regresivo visual
      countdownIntervalRef.current = window.setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            // Dejamos que el timer de logout haga el cierre
            window.clearInterval(countdownIntervalRef.current!);
            countdownIntervalRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, warningDelay);

    // Timer de cierre de sesión definitivo
    logoutTimeoutRef.current = window.setTimeout(() => {
      setShowWarning(false);
      setSecondsLeft(0);
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      logout();
    }, INACTIVITY_LIMIT_MS);
  };

  // Manejo de eventos de actividad + lifecycle
  useEffect(() => {
    if (!isAuthenticated) {
      clearTimers();
      setShowWarning(false);
      setSecondsLeft(0);
      return;
    }

    // Primera vez que entra con sesión activa
    startTimers();

    const handleActivity = () => {
      if (!isAuthenticated) return;
      lastActivityRef.current = Date.now();
      setShowWarning(false);
      setSecondsLeft(0);
      clearTimers();
      startTimers();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleActivity();
      }
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ] as const;

    events.forEach((event) =>
      window.addEventListener(event, handleActivity),
    );
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      events.forEach((event) =>
        window.removeEventListener(event, handleActivity),
      );
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      clearTimers();
    };
  }, [isAuthenticated, logout]);

  const handleStayConnected = () => {
    setShowWarning(false);
    setSecondsLeft(0);
    clearTimers();
    startTimers();
  };

  const handleLogoutNow = () => {
    setShowWarning(false);
    setSecondsLeft(0);
    clearTimers();
    logout();
  };

  const progressPercent =
    secondsLeft > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (secondsLeft / WARNING_DURATION_SECONDS) * 100,
          ),
        )
      : 0;

  return (
    <>
      {children}

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">
              ¿Sigues ahí?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Por seguridad, tu sesión se cerrará automáticamente en{" "}
              <span className="font-semibold text-rose-600">
                {secondsLeft}s
              </span>{" "}
              por inactividad.
            </p>

            {/* Barra de progreso del contador */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-rose-500 transition-[width] duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleLogoutNow}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar sesión ahora
              </button>
              <button
                type="button"
                onClick={handleStayConnected}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-rose-700"
              >
                Seguir conectado
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}