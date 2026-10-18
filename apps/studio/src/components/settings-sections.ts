/** Site › Settings: its sections in page order, and the key of each one's title. */
import { AI_SETTINGS_SECTION } from "./AiSettings.tsx";
import { ANALYTICS_SETTINGS_SECTION } from "./AnalyticsSettings.tsx";
import { APPEARANCE_SETTINGS_SECTION } from "./AppearanceSettings.tsx";
import { CHROME_SETTINGS_SECTION } from "./ChromeSettings.tsx";
import { COMMENT_SETTINGS_SECTION } from "./CommentSettings.tsx";
import { DESIGN_RULES_SECTION } from "./DesignRulesSettings.tsx";
import { GLOSSARY_SETTINGS_SECTION } from "./GlossarySettings.tsx";
import { LANGUAGE_SETTINGS_SECTION } from "./LanguageSettings.tsx";
import { SCHEDULE_SETTINGS_SECTION } from "./ScheduleSettings.tsx";

export const SETTINGS_SECTIONS = [
  "general",
  "domains",
  APPEARANCE_SETTINGS_SECTION,
  CHROME_SETTINGS_SECTION,
  DESIGN_RULES_SECTION,
  ANALYTICS_SETTINGS_SECTION,
  COMMENT_SETTINGS_SECTION,
  SCHEDULE_SETTINGS_SECTION,
  AI_SETTINGS_SECTION,
  LANGUAGE_SETTINGS_SECTION,
  GLOSSARY_SETTINGS_SECTION,
  "previews",
] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

/** Sections whose title comes from their own namespace; the rest are `siteSettings.sections.*`. */
const TITLES = {
  [ANALYTICS_SETTINGS_SECTION]: "analyticsSettings.title",
  [COMMENT_SETTINGS_SECTION]: "commentsSettings.title",
  [SCHEDULE_SETTINGS_SECTION]: "scheduleSettings.title",
  [AI_SETTINGS_SECTION]: "aiSettings.title",
  [CHROME_SETTINGS_SECTION]: "appearance.chrome.title",
  [LANGUAGE_SETTINGS_SECTION]: "languages.title",
  [GLOSSARY_SETTINGS_SECTION]: "glossary.title",
} as const;
type Titled = keyof typeof TITLES;

export function sectionTitleKey(id: SettingsSectionId) {
  return id in TITLES
    ? TITLES[id as Titled]
    : (`siteSettings.sections.${id as Exclude<SettingsSectionId, Titled>}` as const);
}
