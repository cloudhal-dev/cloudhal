/** RFC-0040: the icons a collection may name (`CollectionSettings.icon`), loaded lazily. */
import {
  Article,
  BookOpen,
  Briefcase,
  CalendarBlank,
  Files,
  Images,
  MapPin,
  Megaphone,
  Package,
  Question,
  Quotes,
  Users,
} from "@phosphor-icons/react";
import type { CollectionIconSet } from "./collections.ts";

export const COLLECTION_ICONS: CollectionIconSet = {
  article: Article,
  calendar: CalendarBlank,
  briefcase: Briefcase,
  users: Users,
  images: Images,
  package: Package,
  "book-open": BookOpen,
  megaphone: Megaphone,
  quotes: Quotes,
  question: Question,
  "map-pin": MapPin,
  files: Files,
};
