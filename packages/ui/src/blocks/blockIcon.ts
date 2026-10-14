import type { BlockType } from "@cloudhal/core-ts/blocks";
import { Cube, CursorClick, type Icon, Info, Play, Question } from "@phosphor-icons/react";

/** Phosphor icons block types may name (RFC-0015 §1); others show as a cube. */
const ICONS: Record<string, Icon> = { Info, CursorClick, Play, Question };

/** A block type's icon in Studio's menus, sections and the body editor. */
export const blockIcon = (type: BlockType | undefined): Icon =>
  (type?.icon && ICONS[type.icon]) || Cube;
