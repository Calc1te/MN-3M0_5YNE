import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
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
  const { t } = useTranslation();
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
                <h1 className="w-fit" {...ghostModeRegionProps}>
                  {t("ui.title")}
                </h1>
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
  const [setupState, setSetupState] = useState<{
    loading: boolean;
    completed: boolean;
    config?: AppConfig;
  }>({ loading: true, completed: true });
  const [showSetupCompletePrompt, setShowSetupCompletePrompt] = useState(false);

  useEffect(() => {
    const handleWindowMouseEnter = () => {
      disableClick();
    };
    const handleWindowDeactivation = () => {
      enableClick();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        enableClick();
      }
    };

    window.addEventListener("mouseenter", handleWindowMouseEnter);
    window.addEventListener("blur", handleWindowDeactivation);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("mouseenter", handleWindowMouseEnter);
      window.removeEventListener("blur", handleWindowDeactivation);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      enableClick();
    };
  }, []);

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
