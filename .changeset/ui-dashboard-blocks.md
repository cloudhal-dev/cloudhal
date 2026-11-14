---
"@cloudhal/cli": patch
---

Studio's list toolbars come from one shared `@cloudhal/ui` block. The search now fills the free width of the row, and the filters, other actions, sort and refresh follow in a fixed order. `@cloudhal/ui` also gains `StatusIndicator`, `UsageMeterRow`, a "View docs" pill on `PageLayout`, and a resource mode for one resource's detail page: its tabs under the top bar, actions on the right, and no large title (#228).
