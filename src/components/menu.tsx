import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/8bit/context-menu.tsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

type MenuProps = {
  children: ReactNode;
};

export default function Menu({ children }: MenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleSetting = () => {
    console.log("to setting");
  };
  const handleAbout = () => {
    navigate("/about");
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="min-h-screen w-full">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleSetting}>
          {t("menu.settings")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleAbout}>{t("menu.about")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
