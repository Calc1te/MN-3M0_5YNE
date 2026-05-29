import { useTranslation } from "react-i18next";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Menu from "./components/views/menu.tsx";
import About from "./components/settings/about.tsx";
import BartenderMain from "./components/views/bartender_main.tsx";
import DebugMenu from "./components/debug.tsx";
import SettingsPanel from "./components/settings/panel.tsx";

function App() {
  const { t } = useTranslation();

  return (
    <Router>
      <Menu>
        <div className="min-h-screen w-full">
          <Routes>
            <Route path="/" element={<Navigate to="/bartender-main" replace />} />
            <Route
              path="/bartender-main"
              element={
                <main className="container" color="none">
                  <h1>{t("ui.title")}</h1>
                  <BartenderMain />
                  <DebugMenu />
                </main>
              }
            />
            <Route path="/settings" element={<SettingsPanel />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </Menu>
    </Router>
  );
}

export default App;
