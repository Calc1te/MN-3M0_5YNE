import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import DirectorySelector from "@/components/directory-selector";
import { Button } from "@/components/ui/8bit/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/8bit/select";
import { cn } from "@/lib/utils";

export default function SettingsPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const selectValue = language === "zh-CN" ? "zh-CN" : "en";

  return (
    <main className={cn("container flex flex-col gap-6 ", isZh && "font-ui-cn")}>
      <div className="flex items-center justify-between w-full">
        <h1 className="text-lg font-semibold pl-6">{t("menu.settings")}</h1>
        <Button font="normal" onClick={() => navigate("/bartender-main")}>
          {t("ui.back")}
        </Button>
      </div>

      <div className="flex flex-col gap-6 pl-6 w-full">
        <section className="flex flex-col gap-6 max-w-xs">
          <span className="text-sm">{t("ui.language")}</span>
          <Select value={selectValue} onValueChange={(value) => void i18n.changeLanguage(value)}>
            <SelectTrigger font="normal">
              <SelectValue placeholder={t("ui.language")} font="normal" />
            </SelectTrigger>
            <SelectContent font="normal">
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh-CN">中文</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <DirectorySelector />
      </div>
    </main>
  );
}
