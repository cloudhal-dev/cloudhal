// cloudhal.dev (ADR-0037, ADR-0039): Starlight over the repo's docs/, served as static assets
// by the `cloudhal-dev` Worker. scripts/postbuild.ts adds the schemas, the Markdown copies,
// llms.txt and the redirects to dist/.
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://cloudhal.dev",
  trailingSlash: "never",
  build: { format: "directory" },
  integrations: [
    starlight({
      title: "Cloudhal",
      description: "Open-source, agent-native site platform.",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/cloudhal-dev/cloudhal" },
      ],
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "link",
          attrs: { rel: "alternate", type: "text/markdown", href: "/llms.txt", title: "llms.txt" },
        },
      ],
      lastUpdated: false,
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Overview", link: "/docs" },
            { label: "Deploy to Cloudflare", link: "/docs/guides/deploy-button" },
            { label: "Playground", link: "https://try.cloudhal.com" },
          ],
        },
        { label: "Guides", items: [{ autogenerate: { directory: "docs/guides" } }] },
        {
          label: "Contributing",
          collapsed: true,
          items: [
            { label: "How to contribute", link: "/docs/contributing" },
            { label: "Code structure", link: "/docs/engineering/code-structure" },
            { label: "Threat model", link: "/docs/security/threat-model" },
            {
              label: "Studio design",
              collapsed: true,
              items: [{ autogenerate: { directory: "docs/design" } }],
            },
          ],
        },
        {
          label: "Decisions (ADRs)",
          collapsed: true,
          items: [{ autogenerate: { directory: "docs/adr" } }],
        },
        {
          label: "Proposals (RFCs)",
          collapsed: true,
          items: [{ autogenerate: { directory: "docs/rfcs" } }],
        },
        {
          label: "Reference",
          items: [
            { label: "JSON Schemas v1", link: "/schemas/v1/index.json" },
            { label: "Cloudhal-Fetch", link: "/fetch" },
            { label: "llms.txt", link: "/llms.txt" },
          ],
        },
      ],
    }),
  ],
});
