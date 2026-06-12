import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import MemoryAdder from "@/components/memory-adder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/8bit/select";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import { cn } from "@/lib/utils";
import {
  BARTENDER_STATES,
  changeBartenderState,
  getBartenderState,
  isBartenderState,
  onBartenderStateChange,
  type BartenderState,
} from "@/uiControllers/bartender";
import {
  getIdleTriggerState,
  onIdleTriggerStateChange,
  type IdleTriggerState,
} from "@/uiControllers/idle-trigger";

export default function DebugMenu() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const [state, setState] = useState<BartenderState>(() => getBartenderState());
  const [idleTrigger, setIdleTrigger] = useState<IdleTriggerState>(() =>
    getIdleTriggerState(),
  );

  useEffect(() => onBartenderStateChange(setState), []);
  useEffect(() => onIdleTriggerStateChange(setIdleTrigger), []);

  const handleStateChange = (value: string) => {
    if (!isBartenderState(value)) {
      return;
    }
    setState(changeBartenderState(value));
  };

  const countdownText = idleTrigger.running
    ? t("ui.debugIdleCountdownRunning")
    : !idleTrigger.enabled
      ? t("ui.debugIdleCountdownDisabled")
      : `${Math.floor(idleTrigger.remainingMs / 1000)}s`;

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
        <section className="flex w-full max-w-xs flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="debug-state-select">
            {t("ui.debugState") || "Bartender state"}
          </label>
          <Select value={state} onValueChange={handleStateChange}>
            <SelectTrigger id="debug-state-select" font="normal">
              <SelectValue
                placeholder={t("ui.debugStatePlaceholder") || "Select state"}
                font="normal"
              />
            </SelectTrigger>
            <SelectContent {...ghostModeRegionProps} font="normal">
              {BARTENDER_STATES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
        <section className="flex w-full max-w-xs flex-col gap-2">
          <div className="text-sm font-medium">
            {t("ui.debugIdleCountdown")}
          </div>
          <div className="border border-border rounded px-3 py-2 text-sm">
            {countdownText}
          </div>
        </section>
        <MemoryAdder />
      </div>
    </details>
  );
}
