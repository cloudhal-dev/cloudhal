/**
 * The primitives' renderers by component name (docs/engineering/code-structure.md §5). Its keys
 * are the catalog's primitives (`PRIMITIVES` in `@cloudhal/core-ts/surfaces`; a test keeps them
 * equal).
 */
import { escapeHtml } from "../../markdown.ts";
import type { MediaContext } from "../../media.ts";
import type { PrimitiveNode, PrimitiveRenderer } from "../markup.ts";
import { carouselHtml } from "./carousel.ts";
import {
  badgeHtml,
  buttonLinkHtml,
  headingHtml,
  iconHtml,
  imageHtml,
  listHtml,
  markdownHtml,
  quoteHtml,
  statHtml,
  textHtml,
} from "./content.ts";
import { chartHtml, tableHtml } from "./data.ts";
import {
  checkboxHtml,
  numberFieldHtml,
  radioGroupHtml,
  selectHtml,
  sliderHtml,
  textFieldHtml,
  toggleHtml,
} from "./inputs.ts";
import {
  accordionHtml,
  bandHtml,
  cardHtml,
  columnsHtml,
  disclosureHtml,
  dividerHtml,
  gridHtml,
  rowHtml,
  spacerHtml,
  stackHtml,
  tabPanelHtml,
  tabsHtml,
} from "./layout.ts";
import { counterHtml, marqueeHtml, scrollProgressHtml, scrollyHtml, stepHtml } from "./motion.ts";
import { dialogHtml, lightboxNodeHtml, popoverHtml, tooltipHtml } from "./overlays.ts";

export const PRIMITIVE_HTML = {
  Stack: stackHtml,
  Row: rowHtml,
  Grid: gridHtml,
  Columns: columnsHtml,
  Band: bandHtml,
  Card: cardHtml,
  Spacer: spacerHtml,
  Divider: dividerHtml,
  Heading: headingHtml,
  Text: textHtml,
  Markdown: markdownHtml,
  Image: imageHtml,
  Button: buttonLinkHtml,
  Link: buttonLinkHtml,
  Badge: badgeHtml,
  Icon: iconHtml,
  Stat: statHtml,
  Toggle: toggleHtml,
  Select: selectHtml,
  Slider: sliderHtml,
  Chart: chartHtml,
  Table: tableHtml,
  NumberField: numberFieldHtml,
  TextField: textFieldHtml,
  Checkbox: checkboxHtml,
  RadioGroup: radioGroupHtml,
  Quote: quoteHtml,
  List: listHtml,
  Tabs: tabsHtml,
  TabPanel: tabPanelHtml,
  Accordion: accordionHtml,
  Marquee: marqueeHtml,
  Counter: counterHtml,
  Scrolly: scrollyHtml,
  Step: stepHtml,
  ScrollProgress: scrollProgressHtml,
  Carousel: carouselHtml,
  Dialog: dialogHtml,
  Drawer: dialogHtml,
  Popover: popoverHtml,
  Tooltip: tooltipHtml,
  Lightbox: lightboxNodeHtml,
  Disclosure: disclosureHtml,
} as const satisfies Readonly<Record<string, PrimitiveRenderer>>;

/** A primitive's name, as the table knows it. */
export type PrimitiveName = keyof typeof PRIMITIVE_HTML;

/**
 * A primitive's markup around `CHILDREN`, from resolved props (escaped here); `""` for a name
 * the table does not know. `Tabs` reads its children's labels for the tab buttons.
 */
export function primitiveHtml(node: PrimitiveNode, scope: string, media?: MediaContext): string {
  if (!Object.hasOwn(PRIMITIVE_HTML, node.component)) return "";
  const render: PrimitiveRenderer = PRIMITIVE_HTML[node.component as PrimitiveName];
  return render(node, { id: escapeHtml(`${scope}-${node.id}`), scope, media });
}
