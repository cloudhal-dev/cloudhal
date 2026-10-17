/** The server's resources: the MCP Apps preview View and the skills (`skill://`). */
import type { LoadedSkill } from "@cloudhal/agent-runtime";
import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { MCP_APP_MIME, PREVIEW_UI_URI, PREVIEW_VIEW_HTML } from "./preview-view.ts";

export function registerResources(server: McpServer, skills: Map<string, LoadedSkill>): void {
  // RFC-0020 §6: the MCP Apps View behind `preview_page` and `patch_draft` (our own HTML).
  server.registerResource(
    "cloudhal-preview",
    PREVIEW_UI_URI,
    {
      title: "Cloudhal preview",
      description: "Shows the page an agent is building, inside the conversation (MCP Apps).",
      mimeType: MCP_APP_MIME,
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APP_MIME,
          text: PREVIEW_VIEW_HTML,
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    }),
  );

  for (const skill of skills.values()) {
    const name = skill.manifest.name;
    server.registerResource(
      `skill:${name}`,
      `skill://${name}/SKILL.md`,
      {
        title: name,
        description: skill.manifest.description,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: await skill.source() }],
      }),
    );
  }
  if (skills.size > 0) {
    server.registerResource(
      "skill-reference",
      new ResourceTemplate("skill://{name}/references/{file}", {
        list: async () => ({
          resources: (
            await Promise.all(
              [...skills.values()].map(async (s) =>
                (
                  await s.references()
                ).map((file) => ({
                  uri: `skill://${s.manifest.name}/references/${file}`,
                  name: `${s.manifest.name}/references/${file}`,
                  mimeType: "text/markdown",
                })),
              ),
            )
          ).flat(),
        }),
      }),
      {
        title: "Skill reference",
        description: "Supporting notes for a skill",
        mimeType: "text/markdown",
      },
      async (uri, variables) => {
        const skill = skills.get(String(variables.name));
        if (!skill) throw new Error(`unknown skill ${String(variables.name)}`);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: await skill.reference(String(variables.file)),
            },
          ],
        };
      },
    );
  }
}
