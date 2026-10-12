/**
 * ECharts, registered once with exactly the modules the analytics blocks draw with (RFC-0006
 * §10.4). Kumo's chart components take the ECharts instance as a prop so the bundle holds only
 * these modules; this file is imported only from `@cloudhal/ui/charts`, which the lazy Analytics
 * route (and the editor's Readers card) load — nothing else in Studio pays for ECharts.
 *
 * SVG rendering keeps text crisp, scales with the container and respects the page's fonts.
 */
import { BarChart, LineChart, MapChart } from "echarts/charts";
import {
  AriaComponent,
  BrushComponent,
  GridComponent,
  MarkLineComponent,
  ToolboxComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  MapChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  AriaComponent,
  MarkLineComponent,
  // TimeseriesChart always declares a (dormant) brush and a hidden toolbox.
  BrushComponent,
  ToolboxComponent,
  SVGRenderer,
]);

export { echarts };
