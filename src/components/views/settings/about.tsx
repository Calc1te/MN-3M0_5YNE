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

export default function About() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const avatar = "/assets/abouts/IMG_1427.PNG";
  const paragraphs = t("about.paragraphs", { returnObjects: true }) as string[];
  const imageSlots = t("about.imageSlots", { returnObjects: true }) as string[];

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
                {t("about.eyebrow")}
              </span>
              <h2 className="text-3xl font-semibold leading-tight">
                {t("about.title")}
              </h2>
              <p className="max-w-xl text-sm leading-6 text-white/75">
                {t("about.intro")}
              </p>
            </div>

            <div className="flex flex-col gap-4 text-sm leading-6 text-white/80">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              <p>
                {t("about.inspiredBy.prefix")} {" "}
                <a
                  href="https://calc1te.github.io/posts/data-bar/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#483D8B] transition-colors hover:text-white hover:underline"
                >
                  {t("about.inspiredBy.linkLabel")}
                </a>{" "}
                {t("about.inspiredBy.suffix")}
              </p>
            </div>
          </section>

          <aside className="grid gap-3 self-start">
            <div className="flex aspect-square h-32 w-32 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/5">
              <img
                src={avatar}
                alt={t("about.avatarAlt")}
                className="h-full w-full object-cover"
              />
            </div>
            {imageSlots.map((slot, index) => (
              <div
                key={`${slot}-${index}`}
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
