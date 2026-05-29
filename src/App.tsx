import { useTranslation } from "react-i18next";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import Menu from "./components/views/menu.tsx";
import About from "./components/settings/about.tsx";
import BartenderMain from "./components/views/bartender_main.tsx";
import DebugMenu from "./components/debug.tsx";

function App() {
  const { t, i18n } = useTranslation();

  return (
    <Router>
      <Menu>
        <div className="min-h-screen w-full">
          <Routes>
            <Route
              path="/"
              element={
                <main className="container" color="none">
                  <h1>{t("ui.title")}</h1>
                  <label className="row language-row" htmlFor="language-select">
                    <span>{t("ui.language")}</span>
                    <select
                      id="language-select"
                      value={i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en"}
                      onChange={(e) =>
                        void i18n.changeLanguage(e.currentTarget.value)
                      }
                    >
                      <option value="en">English</option>
                      <option value="zh-CN">中文</option>
                    </select>
                  </label>
                  <BartenderMain />
                  <DebugMenu />
                </main>
              }
            />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </Menu>
    </Router>
  );
}

export default App;
