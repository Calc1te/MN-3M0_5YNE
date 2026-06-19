import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cursorPosition } from "@tauri-apps/api/window";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import "./App.css";
import Menu from "./components/views/menu.tsx";
import About from "./components/views/settings/about.tsx";
import BartenderMain from "./components/views/bartender_main.tsx";
// import DebugMenu from "./components/debug.tsx";
import InitialSetup from "./components/views/initial_setup.tsx";
import SettingsPanel from "./components/views/settings/panel.tsx";
import {
  disableClick,
  enableClick,
  ghostModeRegionProps,
  isWindowsGhostModePlatform,
  reconcileGhostModeFromPoint,
} from "@/lib/ghost-mode";
import {
  getInitialSetupStatus,
  simulateFirstInstall,
  type AppConfig,
} from "@/lib/app-config";
import { getUIFontClass, resolveAppLanguage } from "@/lib/language";

function PanelTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="min-h-screen w-full isolate contain-paint"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14, ease: "linear" }}
    >
      {children}
    </motion.div>
  );
}

function SolidClickSurface({ children }: { children: ReactNode }) {
  return (
    <div {...ghostModeRegionProps}>
      {children}
    </div>
  );
}

function AppRoutes({
  showSetupCompletePrompt,
  onSetupCompletePromptShown,
}: {
  showSetupCompletePrompt: boolean;
  onSetupCompletePromptShown: () => void;
}) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/bartender-main" replace />} />
        <Route
          path="/bartender-main"
          element={
            <PanelTransition>
              <main className="container" color="none">
                <BartenderMain
                  showSetupCompletePrompt={showSetupCompletePrompt}
                  onSetupCompletePromptShown={onSetupCompletePromptShown}
                />
                {/* <DebugMenu /> */}
              </main>
            </PanelTransition>
          }
        />
        <Route
          path="/settings"
          element={
            <PanelTransition>
              <SolidClickSurface>
                <SettingsPanel />
              </SolidClickSurface>
            </PanelTransition>
          }
        />
        <Route
          path="/about"
          element={
            <PanelTransition>
              <SolidClickSurface>
                <About />
              </SolidClickSurface>
            </PanelTransition>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const resolvedLanguage = resolveAppLanguage(language);
  const uiFontClass = getUIFontClass(language);
  const [setupState, setSetupState] = useState<{
    loading: boolean;
    completed: boolean;
    config?: AppConfig;
  }>({ loading: true, completed: true });
  const [showSetupCompletePrompt, setShowSetupCompletePrompt] = useState(false);

  useEffect(() => {
    const handleWindowMouseEnter = (event: MouseEvent) => {
      console.debug("[ghost-mode]", "window:mouseenter", {
        clientX: event.clientX,
        clientY: event.clientY,
        isWindows: isWindowsGhostModePlatform(),
      });

      if (isWindowsGhostModePlatform()) {
        reconcileGhostModeFromPoint(event.clientX, event.clientY);
        return;
      }

      disableClick();
    };
    const handleWindowDeactivation = () => {
      console.debug("[ghost-mode]", "window:blur");
      if (isWindowsGhostModePlatform()) {
        return;
      }
      enableClick();
    };
    const handleVisibilityChange = () => {
      console.debug("[ghost-mode]", "document:visibilitychange", {
        hidden: document.hidden,
      });
      if (isWindowsGhostModePlatform()) {
        return;
      }
      if (document.hidden) {
        enableClick();
      }
    };

    window.addEventListener("mouseenter", handleWindowMouseEnter);
    window.addEventListener("blur", handleWindowDeactivation);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let disposed = false;
    let ghostPollTimer: number | null = null;
    let pollInFlight = false;
    let lastSample:
      | {
          insideWindow: boolean;
          clientX: number;
          clientY: number;
        }
      | null = null;

    if (isWindowsGhostModePlatform()) {
      const pollGhostMode = async () => {
        if (disposed || pollInFlight) {
          return;
        }

        pollInFlight = true;
        try {
          const pointer = await cursorPosition();
          if (disposed) {
            return;
          }

          const scale = window.devicePixelRatio || 1;
          const clientX = (pointer.x - window.screenX) / scale;
          const clientY = (pointer.y - window.screenY) / scale;
          const insideWindow =
            clientX >= 0 &&
            clientY >= 0 &&
            clientX <= window.innerWidth &&
            clientY <= window.innerHeight;

          const roundedSample = {
            insideWindow,
            clientX: Math.round(clientX),
            clientY: Math.round(clientY),
          };

          const sampleChanged =
            !lastSample ||
            lastSample.insideWindow !== roundedSample.insideWindow ||
            lastSample.clientX !== roundedSample.clientX ||
            lastSample.clientY !== roundedSample.clientY;

          if (sampleChanged) {
            console.debug("[ghost-mode]", "windows:poll", {
              pointerX: pointer.x,
              pointerY: pointer.y,
              screenX: window.screenX,
              screenY: window.screenY,
              clientX: roundedSample.clientX,
              clientY: roundedSample.clientY,
              insideWindow,
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scale,
            });
            lastSample = roundedSample;
          }

          if (insideWindow) {
            reconcileGhostModeFromPoint(clientX, clientY);
          } else {
            disableClick();
          }
        } catch (error) {
          console.debug("[ghost-mode]", "windows:poll:error", error);
        } finally {
          pollInFlight = false;
        }
      };

      void pollGhostMode();
      ghostPollTimer = window.setInterval(() => {
        void pollGhostMode();
      }, 120);
    }

    return () => {
      disposed = true;
      if (ghostPollTimer !== null) {
        window.clearInterval(ghostPollTimer);
      }
      window.removeEventListener("mouseenter", handleWindowMouseEnter);
      window.removeEventListener("blur", handleWindowDeactivation);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      enableClick();
    };
  }, []);

  useEffect(() => {
    document.body.classList.remove("font-ui-en", "font-ui-cn", "font-ui-jp");
    document.body.classList.add(uiFontClass);
    document.documentElement.lang = resolvedLanguage === "jp" ? "ja" : resolvedLanguage;

    return () => {
      document.body.classList.remove("font-ui-en", "font-ui-cn", "font-ui-jp");
    };
  }, [resolvedLanguage, uiFontClass]);

  useEffect(() => {
    void getInitialSetupStatus()
      .then((status) => {
        setSetupState({
          loading: false,
          completed: simulateFirstInstall ? false : status.completed,
          config: status.config,
        });
      })
      .catch((error: unknown) => {
        console.warn("Failed to load initial setup status:", error);
        setSetupState({ loading: false, completed: true });
      });
  }, []);

  if (setupState.loading) {
    return null;
  }

  const shouldShowSetup = !setupState.completed;

  return (
    <Router>
      {shouldShowSetup ? (
        <SolidClickSurface>
          <InitialSetup
            initialConfig={setupState.config}
            onComplete={() => {
              setShowSetupCompletePrompt(true);
              setSetupState((current) => ({
                ...current,
                completed: true,
              }));
            }}
          />
        </SolidClickSurface>
      ) : (
        <Menu>
          <div className="min-h-screen w-full">
            <AppRoutes
              showSetupCompletePrompt={showSetupCompletePrompt}
              onSetupCompletePromptShown={() =>
                setShowSetupCompletePrompt(false)
              }
            />
          </div>
        </Menu>
      )}
    </Router>
  );
}

export default App;
