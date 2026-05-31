import { useTranslation } from "react-i18next";

import MemoryAdder from "@/components/memory-adder";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import { cn } from "@/lib/utils";

export default function DebugMenu() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));

  return (
    <details
      {...ghostModeRegionProps}
      className={cn(
        "w-full max-w-3xl mx-auto mt-6 border border-border rounded-lg bg-card p-4",
        isZh && "font-ui-cn",
      )}
    >
      <summary className="cursor-pointer select-none font-semibold">
        {t("ui.debug") || "Debug"}
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <MemoryAdder />
      </div>
    </details>
  );
}
