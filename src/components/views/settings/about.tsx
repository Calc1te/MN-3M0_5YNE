import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/8bit/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { color } from "motion/react";

export default function About() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const avatar = "/assets/abouts/IMG_1427.PNG";

  const copy = isZh
    ? {
        eyebrow: "LOCAL DATA BAR",
        title: "B4-rt 3n-der",
        intro: "一个本地数据酒保。没有真的调制饮料，大概也无法改变人生",
        paragraphs: [
          <span key="1">P 会读取你指定的 base 目录，把废弃文件、临时文本和零散记忆当作调酒材料。它可以列出原料、查看内容、暂存混合，也能在你确认后删除或恢复那些数据饮品。</span>,
          <span key="2">当前版本尚在开发中，包括吧台上的所有东西和主界面 UI 都是未完成版。</span>,
          <span key="3">
            灵感来自{" "}
            <a
              href="https://calc1te.github.io/posts/data-bar/"
              target="_blank"
              rel="noreferrer"
              className="text-[#483D8B] hover:underline hover:text-white transition-colors"
            >
              data bar \\ rev-2604
            </a>{" "}
            by Nymiad。本重制版致力于在 LLM 浪潮下赋予 P 真正的动态交互灵魂。
          </span>,
          <span key="4">Made by Calciiite,</span>,
          <span key="5">没有许可协议没有知识库没有产权没有十八禁没有人类受到伤害没有预警没有吃到章鱼烧</span>,
          <span key="6" className="text-black">献给Nymiad，我想我还是无法移开视线</span>
        ],
        imageSlots: [],
      }
    : {
        eyebrow: "LOCAL DATA BAR",
        title: "B4-rt 3n-der",
        intro: "A local data bartender. Not actually mixing drinks, and probably won't change lives.",
        paragraphs: [
          <span key="1">P reads your specified base directory, treating discarded files, temporary text, and fragmented memories as mixing ingredients. It can list materials, inspect content, stage mixes, and either permanently delete or restore those data drinks after your confirmation.</span>,
          <span key="2">The current version is still in development; everything on the counter and the main UI are works in progress.</span>,
          <span key="3">
            Inspired by{" "}
            <a
              href="https://calc1te.github.io/posts/data-bar/"
              target="_blank"
              rel="noreferrer"
              className="text-[#483D8B] hover:underline hover:text-white transition-colors"
            >
              data bar \\ rev-2604
            </a>{" "}
            by Nymiad. This remake is dedicated to giving P a true, dynamically interactive soul in the wave of LLMs.
          </span>,
          <span key="4">Made by Calciiite,</span>,
          <span key="5">No license agreement, no knowledge base, no property rights, no R-18, no humans harmed, no trigger warnings, no takoyaki.</span>,
        ],
        imageSlots: [],
      };

  return (
    <main
      className={cn(
        "container flex min-h-screen flex-col gap-8 px-6 py-8 text-white",
        isZh && "font-ui-cn",
      )}
    >
      <Card className="w-full max-w-5xl">
        <CardHeader>
          <CardTitle className="text-lg">{t("menu.about")}</CardTitle>
          <CardAction>
            <Button font="normal" onClick={() => navigate("/bartender-main")}>
              {t("ui.back")}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="flex max-w-2xl flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-white/55">
                {copy.eyebrow}
              </span>
              <h2 className="text-3xl font-semibold leading-tight">
                {copy.title}
              </h2>
              <p className="max-w-xl text-sm leading-6 text-white/75">
                {copy.intro}
              </p>
            </div>

            <div className="flex flex-col gap-4 text-sm leading-6 text-white/80">
              {copy.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>

          <aside className="grid gap-3 self-start">
            <div className="h-32 w-32 overflow-hidden rounded-md border border-white/10 bg-white/5 aspect-square flex items-center justify-center">
              <img
                src={avatar}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            </div>
            {copy.imageSlots.map((slot, index) => (
              <div
                key={slot}
                className={cn(
                  "flex items-center justify-center border border-dashed border-[#483D8B] bg-white/5 text-center text-xs text-white/55",
                  index === 0 ? "aspect-[4/5]" : "aspect-[16/9]",
                )}
              >
                {slot}
              </div>
            ))}
          </aside>
        </CardContent>
      </Card>
    </main>
  );
}