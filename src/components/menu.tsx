import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/8bit/context-menu.tsx";
import { useTranslation } from "react-i18next";

export default function Menu() {
  const { t } = useTranslation();

  const handleSetting = () => {
    console.log("to setting")
  }
  const handleAbout = () => {
    console.log("to About")
  }

  return (
      <ContextMenu>
        <ContextMenuTrigger >{t("menu.trigger")}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={handleSetting}>{t("menu.settings")}</ContextMenuItem>
          <ContextMenuItem onSelect={handleAbout}>{t("menu.about")}</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
  );
}
