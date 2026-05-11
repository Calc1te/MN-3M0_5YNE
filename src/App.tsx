import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import Menu from "./components/menu.tsx";
import About from "./components/settings/about.tsx";
import ApiTestDialog from "./components/api-test-dialog.tsx";

function App() {
  const { t, i18n } = useTranslation();
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

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

                  <div className="row">
                    <a href="https://vite.dev" target="_blank">
                      <img
                        src="/vite.svg"
                        className="logo vite"
                        alt={t("ui.viteLogoAlt")}
                      />
                    </a>
                    <a href="https://tauri.app" target="_blank">
                      <img
                        src="/tauri.svg"
                        className="logo tauri"
                        alt={t("ui.tauriLogoAlt")}
                      />
                    </a>
                  </div>
                  <p>{t("ui.hint")}</p>

                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      greet();
                    }}
                  >
                    <input
                      id="greet-input"
                      onChange={(e) => setName(e.currentTarget.value)}
                      placeholder={t("ui.inputPlaceholder")}
                    />
                    <button type="submit">{t("ui.greet")}</button>
                  </form>
                  <p>{greetMsg}</p>
                </main>
              }
            />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      </Menu>
      <ApiTestDialog />
    </Router>
  );
}

export default App;
