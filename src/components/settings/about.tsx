import { useTranslation } from "react-i18next";

export default function About() {
    const { t } = useTranslation();

    return (
        <p>{t("ui.about")}</p>
    )
}