import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
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
import SettingsPanel from "./components/views/settings/panel.tsx";
import {
  disableClick,
  enableClick,
  ghostModeRegionProps,
} from "@/lib/ghost-mode";

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

function AppRoutes() {
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
                <BartenderMain />
                <DebugMenu />
              </main>
            </PanelTransition>
          }
        />
        <Route
          path="/settings"
          element={
            <PanelTransition>
              <div onMouseEnter={enableClick} onMouseLeave={disableClick}>
                <SettingsPanel />
              </div>
            </PanelTransition>
          }
        />
        <Route
          path="/about"
          element={
            <PanelTransition>
              <div onMouseEnter={enableClick} onMouseLeave={disableClick}>
                <About />
              </div>
            </PanelTransition>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  useEffect(() => {
    const handleWindowMouseEnter = () => {
      disableClick();
    };

    window.addEventListener("mouseenter", handleWindowMouseEnter);
    return () => {
      window.removeEventListener("mouseenter", handleWindowMouseEnter);
      enableClick();
    };
  }, []);

  return (
    <Router>
      <Menu>
        <div className="min-h-screen w-full">
          <AppRoutes />
        </div>
      </Menu>
    </Router>
  );
}

export default App;
