import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/8bit/button";
import { cn } from "@/lib/utils";

export default function About() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));

  const copy = isZh
    ? {
        eyebrow: "LOCAL DATA BAR",
        title: "B4-rt 3n-der",
        intro:
          "一个透明窗口里的本地数据酒保。它不假装自己温柔，也不把文件当成干净的原料。",
        paragraphs: [
          "P 会读取你指定的 base 目录，把废弃文件、临时文本和零散记忆当作调酒材料。它可以列出原料、查看内容、暂存混合，也能在你确认后删除或恢复那些数据饮品。",
          "这个界面刻意保留一点像素感和空白：左边放说明，右边留给角色图、场景图、饮品图，或者任何你想塞进吧台灯光里的东西。",
          "所有核心动作都尽量保持本地化。窗口透明、可点击区域收窄，没内容的地方让鼠标穿过去，像一块浮在桌面上的小招牌。",
        ],
        notes: ["Tauri + React", "Transparent window", "Local file mixing"],
        imageSlots: ["角色图", "吧台/场景", "饮品或图标"],
      }
    : {
        eyebrow: "LOCAL DATA BAR",
        title: "B4-rt 3n-der",
        intro:
          "A local data bartender living in a transparent window, mixing discarded files into virtual drinks.",
        paragraphs: [
          "P reads the base directory you choose and treats abandoned files, temporary text, and memory fragments as ingredients. It can list, inspect, stage, mix, delete, or restore data drinks after confirmation.",
          "The interface leaves room for atmosphere: words on the left, image slots on the right for character art, bar scenes, drink renders, or anything else that belongs under the counter light.",
          "The app keeps its core actions local. Transparent space passes clicks through, while only visible controls catch the cursor.",
        ],
        notes: ["Tauri + React", "Transparent window", "Local file mixing"],
        imageSlots: ["Character", "Bar / scene", "Drink or icon"],
      };

  return (
    <main
      className={cn(
        "container flex min-h-screen flex-col gap-8 px-6 py-8 text-foreground",
        isZh && "font-ui-cn",
      )}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("menu.about")}</h1>
        <Button font="normal" onClick={() => navigate("/bartender-main")}>
          {t("ui.back")}
        </Button>
      </div>

      <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="flex max-w-2xl flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-foreground/55">
              {copy.eyebrow}
            </span>
            <h2 className="text-3xl font-semibold leading-tight">{copy.title}</h2>
            <p className="max-w-xl text-sm leading-6 text-foreground/75">
              {copy.intro}
            </p>
          </div>

          <div className="flex flex-col gap-4 text-sm leading-6 text-foreground/80">
            {copy.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {copy.notes.map((note) => (
              <span
                key={note}
                className="border border-foreground/35 bg-foreground px-2 py-1 text-xs text-background"
              >
                {note}
              </span>
            ))}
          </div>
        </section>

        <aside className="grid gap-3 self-start">
          {copy.imageSlots.map((slot, index) => (
            <div
              key={slot}
              className={cn(
                "flex items-center justify-center border border-dashed border-foreground/45 bg-foreground/5 text-center text-xs text-foreground/55",
                index === 0 ? "aspect-[4/5]" : "aspect-[16/9]",
              )}
            >
              {slot}
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
