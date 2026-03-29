import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/8bit/context-menu.tsx";

export default function Menu() {

  const handleSetting = () => {
    console.log("to setting")
  }
  const handleAbout = () => {
    console.log("to About")
  }

  return (
      <ContextMenu>
        <ContextMenuTrigger >Right click</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={handleSetting}>Settings</ContextMenuItem>
          <ContextMenuItem onSelect={handleAbout}>About</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
  );
}
