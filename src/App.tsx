import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
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
import DebugMenu from "./components/debug.tsx";
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
                <DebugMenu />
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
  const isZh = Boolean(language && language.startsWith("zh"));
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
        enableClick();
        return;
      }

      disableClick();
    };
    const handleWindowDeactivation = () => {
      console.debug("[ghost-mode]", "window:blur");
      enableClick();
    };
    const handleVisibilityChange = () => {
      console.debug("[ghost-mode]", "document:visibilitychange", {
        hidden: document.hidden,
      });
      if (document.hidden) {
        enableClick();
      }
    };

    window.addEventListener("mouseenter", handleWindowMouseEnter);
    window.addEventListener("blur", handleWindowDeactivation);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let disposed = false;
    let unlistenMoved: (() => void) | null = null;

    if (isWindowsGhostModePlatform()) {
      void getCurrentWindow()
        .onMoved(async ({ payload }) => {
          try {
            const pointer = await cursorPosition();
            if (disposed) {
              return;
            }

            const scale = window.devicePixelRatio || 1;
            const clientX = (pointer.x - payload.x) / scale;
            const clientY = (pointer.y - payload.y) / scale;

            console.debug("[ghost-mode]", "window:moved", {
              windowX: payload.x,
              windowY: payload.y,
              pointerX: pointer.x,
              pointerY: pointer.y,
              clientX,
              clientY,
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              scale,
            });

            if (
              clientX >= 0 &&
              clientY >= 0 &&
              clientX <= window.innerWidth &&
              clientY <= window.innerHeight
            ) {
              reconcileGhostModeFromPoint(clientX, clientY);
            } else {
              disableClick();
            }
          } catch (error) {
            console.debug("[ghost-mode]", "window:moved:error", error);
          }
        })
        .then((unlisten) => {
          if (disposed) {
            unlisten();
            return;
          }
          unlistenMoved = unlisten;
        })
        .catch((error) => {
          console.debug("[ghost-mode]", "window:moved:listen-error", error);
        });
    }

    return () => {
      disposed = true;
      unlistenMoved?.();
      window.removeEventListener("mouseenter", handleWindowMouseEnter);
      window.removeEventListener("blur", handleWindowDeactivation);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      enableClick();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("font-ui-cn", isZh);
    document.body.classList.toggle("font-ui-en", !isZh);
    document.documentElement.lang = language || "en";

    return () => {
      document.body.classList.remove("font-ui-cn");
      document.body.classList.remove("font-ui-en");
    };
  }, [isZh, language]);

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
