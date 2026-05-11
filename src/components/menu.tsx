import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/8bit/context-menu.tsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function Menu() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleSetting = () => {
    console.log("to setting")
  }
  const handleAbout = () => {
    navigate("/about");
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
