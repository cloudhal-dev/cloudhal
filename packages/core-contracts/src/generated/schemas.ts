/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

export const ProjectSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/project.schema.json",
  "title": "Project",
  "description": "Top-level ownership boundary. A project belongs to one owner (human or organisation) and groups one or more sites. In Cloud it maps to a tenant.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "name",
    "slug",
    "ownerId",
    "siteIds",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "slug": {
      "$ref": "#/$defs/Slug"
    },
    "ownerId": {
      "$ref": "#/$defs/Id"
    },
    "siteIds": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/Id"
      },
      "uniqueItems": true
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const SiteSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/site.schema.json",
  "title": "Site",
  "description": "Root node of a Site Graph: one deployable website with its locales, domains, theme and page index. Pages and content entries are separate nodes referenced by id so they can be versioned and locked independently.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "projectId",
    "name",
    "slug",
    "defaultLocale",
    "locales",
    "domains",
    "pageIds",
    "theme",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "projectId": {
      "$ref": "#/$defs/Id"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "slug": {
      "$ref": "#/$defs/Slug"
    },
    "defaultLocale": {
      "$ref": "#/$defs/Locale"
    },
    "locales": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/Locale"
      },
      "minItems": 1,
      "uniqueItems": true
    },
    "domains": {
      "type": "array",
      "description": "Hostnames serving this site. Exactly one should be primary; the *.cloudhal.app subdomain is always present in Cloud.",
      "items": {
        "$ref": "#/$defs/Domain"
      }
    },
    "pageIds": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/Id"
      },
      "uniqueItems": true
    },
    "homePageId": {
      "$ref": "#/$defs/Id"
    },
    "theme": {
      "$ref": "#/$defs/ThemeRef"
    },
    "design": {
      "$ref": "#/$defs/Design"
    },
    "brand": {
      "$ref": "#/$defs/Brand"
    },
    "chrome": {
      "$ref": "#/$defs/Chrome"
    },
    "timeZone": {
      "$ref": "#/$defs/TimeZone",
      "description": "The site's time zone (RFC-0008): Studio's calendar, schedules entered as wall-clock times and recurring automations use it. Absent means UTC."
    },
    "publishedSnapshotId": {
      "$ref": "#/$defs/Id",
      "description": "Snapshot currently serving production. Rollback = pointing this at an older snapshot."
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "Announcement": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "text"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9-]{0,40}$",
          "description": "Change it when the text changes, so readers who dismissed the old one see the new one."
        },
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "label": {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        },
        "href": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "tone": {
          "type": "string",
          "enum": [
            "info",
            "brand",
            "warning"
          ]
        },
        "dismissible": {
          "type": "boolean"
        }
      }
    },
    "BodyBlock": {
      "type": "object",
      "description": "One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.",
      "additionalProperties": false,
      "required": [
        "id",
        "hash"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^blk_[0-9A-Za-z]{8,24}$",
          "description": "Stable across writes that keep the block's content or its place among unchanged blocks."
        },
        "hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$",
          "description": "SHA-256 (hex) of the block's markdown without trailing whitespace."
        },
        "by": {
          "$ref": "#/$defs/Actor"
        },
        "via": {
          "type": "string",
          "enum": [
            "studio",
            "mcp",
            "api",
            "import",
            "ai-command",
            "proposal"
          ],
          "description": "The channel of that change."
        },
        "at": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "BodyBlocks": {
      "type": "array",
      "description": "A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.",
      "maxItems": 5000,
      "items": {
        "$ref": "#/$defs/BodyBlock"
      }
    },
    "BodyProfile": {
      "type": "integer",
      "enum": [
        1
      ],
      "description": "The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."
    },
    "Brand": {
      "type": "object",
      "description": "The site's logo and social links (RFC-0025 §1), shared by the header, the footer and SEO.",
      "additionalProperties": false,
      "properties": {
        "logo": {
          "$ref": "#/$defs/ImageRef"
        },
        "logoDark": {
          "$ref": "#/$defs/ImageRef"
        },
        "logoHeight": {
          "type": "string",
          "enum": [
            "s",
            "m",
            "l"
          ]
        },
        "social": {
          "type": "array",
          "maxItems": 8,
          "items": {
            "$ref": "#/$defs/SocialLink"
          }
        }
      }
    },
    "Chrome": {
      "type": "object",
      "description": "The site's header, footer and bars as data (RFC-0025): enums, menu keys and short texts; the theme renders them with landmarks, focus and contrast guaranteed.",
      "additionalProperties": false,
      "properties": {
        "header": {
          "$ref": "#/$defs/ChromeHeader"
        },
        "footer": {
          "$ref": "#/$defs/ChromeFooter"
        },
        "announcement": {
          "$ref": "#/$defs/Announcement"
        },
        "consent": {
          "$ref": "#/$defs/Consent"
        }
      }
    },
    "ChromeFooter": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "layout": {
          "type": "string",
          "enum": [
            "simple",
            "columns",
            "cta-band",
            "minimal"
          ]
        },
        "surface": {
          "type": "string",
          "enum": [
            "plain",
            "muted",
            "inverse"
          ]
        },
        "tagline": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "columns": {
          "type": "array",
          "maxItems": 5,
          "items": {
            "$ref": "#/$defs/FooterColumn"
          }
        },
        "ctaHeading": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        "ctaLabel": {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        },
        "ctaHref": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "social": {
          "type": "boolean"
        },
        "copyright": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200,
          "description": "The legal line; {year} and {site} are the only placeholders."
        },
        "legal": {
          "$ref": "#/$defs/Slug",
          "description": "A menu key (RFC-0003)."
        },
        "extras": {
          "type": "array",
          "maxItems": 3,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "enum": [
              "locale",
              "theme-toggle",
              "motion-toggle"
            ]
          }
        },
        "credit": {
          "type": "boolean"
        },
        "region": {
          "$ref": "#/$defs/Section",
          "description": "RFC-0025 §2: one optional surface (kind `surface`) above the footer's columns, built and checked like any surface; the store refuses other section kinds."
        }
      }
    },
    "ChromeHeader": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "layout": {
          "type": "string",
          "enum": [
            "logo-left",
            "logo-left-nav-center",
            "centered",
            "split",
            "minimal"
          ]
        },
        "behavior": {
          "type": "string",
          "enum": [
            "static",
            "sticky",
            "hide-on-scroll",
            "fixed"
          ]
        },
        "shrink": {
          "type": "boolean"
        },
        "overHero": {
          "type": "string",
          "enum": [
            "solid",
            "transparent"
          ]
        },
        "width": {
          "type": "string",
          "enum": [
            "content",
            "wide",
            "full"
          ]
        },
        "surface": {
          "type": "string",
          "enum": [
            "plain",
            "muted",
            "raised",
            "inverse",
            "brand"
          ]
        },
        "mobileStyle": {
          "type": "string",
          "enum": [
            "dropdown",
            "drawer-start",
            "drawer-end",
            "fullscreen"
          ]
        },
        "collapseAt": {
          "type": "string",
          "enum": [
            "sm",
            "md",
            "lg",
            "always"
          ]
        },
        "nav": {
          "$ref": "#/$defs/Slug",
          "description": "A menu key (RFC-0003)."
        },
        "utility": {
          "$ref": "#/$defs/Slug",
          "description": "A menu key (RFC-0003)."
        },
        "actions": {
          "type": "array",
          "maxItems": 3,
          "items": {
            "$ref": "#/$defs/HeaderAction"
          }
        }
      }
    },
    "Consent": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "mode"
      ],
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "none",
            "notice",
            "choices"
          ]
        },
        "policy": {
          "$ref": "#/$defs/Path"
        }
      }
    },
    "Design": {
      "type": "object",
      "description": "The site's design rules for people and agents (RFC-0021): Markdown that agents read with the theme's DESIGN.md before they build. Guidance only: it changes neither rendering nor permissions.",
      "additionalProperties": false,
      "required": [
        "markdown"
      ],
      "properties": {
        "markdown": {
          "type": "string",
          "minLength": 1,
          "maxLength": 24000
        }
      }
    },
    "Domain": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "hostname",
        "primary"
      ],
      "properties": {
        "hostname": {
          "type": "string",
          "pattern": "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$",
          "maxLength": 253
        },
        "primary": {
          "type": "boolean"
        }
      }
    },
    "FooterColumn": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "heading",
        "menu"
      ],
      "properties": {
        "heading": {
          "type": "string",
          "minLength": 1,
          "maxLength": 60
        },
        "menu": {
          "$ref": "#/$defs/Slug",
          "description": "A menu key (RFC-0003)."
        }
      }
    },
    "HeaderAction": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind"
      ],
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "button",
            "search",
            "locale",
            "theme-toggle",
            "motion-toggle"
          ]
        },
        "label": {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        },
        "href": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "variant": {
          "type": "string",
          "enum": [
            "primary",
            "secondary"
          ]
        }
      }
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "ImageRef": {
      "type": "object",
      "description": "Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
        "assetId": {
          "$ref": "#/$defs/Id",
          "description": "The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."
        },
        "src": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "alt": {
          "type": "string",
          "maxLength": 500
        },
        "width": {
          "type": "integer",
          "minimum": 1
        },
        "height": {
          "type": "integer",
          "minimum": 1
        }
      }
    },
    "Link": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "label",
        "href"
      ],
      "properties": {
        "label": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "href": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "external": {
          "type": "boolean"
        }
      }
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "Path": {
      "type": "string",
      "description": "Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.",
      "pattern": "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
      "maxLength": 1024
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Section": {
      "title": "Section",
      "description": "A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.",
      "oneOf": [
        {
          "type": "object",
          "title": "HeroSection",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "heading"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "hero"
              ]
            },
            "heading": {
              "type": "string",
              "minLength": 1,
              "maxLength": 300
            },
            "subheading": {
              "type": "string",
              "maxLength": 1000
            },
            "image": {
              "$ref": "#/$defs/ImageRef"
            },
            "cta": {
              "$ref": "#/$defs/Link"
            }
          }
        },
        {
          "type": "object",
          "title": "RichTextSection",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "format",
            "body"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "richText"
              ]
            },
            "format": {
              "type": "string",
              "enum": [
                "markdown",
                "html"
              ]
            },
            "body": {
              "type": "string",
              "maxLength": 200000
            },
            "profile": {
              "$ref": "#/$defs/BodyProfile"
            },
            "blocks": {
              "$ref": "#/$defs/BodyBlocks"
            }
          }
        },
        {
          "type": "object",
          "title": "ImageSection",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "image"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "image"
              ]
            },
            "image": {
              "$ref": "#/$defs/ImageRef"
            },
            "caption": {
              "type": "string",
              "maxLength": 1000
            }
          }
        },
        {
          "type": "object",
          "title": "ContentListSection",
          "description": "Renders the newest entries of a content collection (e.g. blog posts).",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "collection",
            "limit",
            "sort"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "contentList"
              ]
            },
            "collection": {
              "$ref": "#/$defs/Slug"
            },
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            },
            "sort": {
              "type": "string",
              "enum": [
                "newest",
                "oldest",
                "title"
              ]
            },
            "filter": {
              "type": "string",
              "description": "Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.",
              "minLength": 1,
              "maxLength": 512
            }
          }
        },
        {
          "type": "object",
          "title": "ComponentSection",
          "description": "A typed block from the block registry (RFC-0015): `type` names a registered block type (one global namespace of English names), `props` follow that type's props schema, which the store validates.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "type",
            "props"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "component"
              ]
            },
            "type": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9-]{1,40}$"
            },
            "props": {
              "type": "object",
              "description": "Validated against the type's props schema by the store, not by this contract.",
              "additionalProperties": true
            }
          }
        },
        {
          "type": "object",
          "title": "SurfaceSection",
          "description": "A generative UI surface (RFC-0020): a flat list of catalog components with a `root`, plus a data model their props may bind to. Written and streamed by agents as data, never code; the store checks the tree, the catalog and the limits.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "catalog",
            "components"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "surface"
              ]
            },
            "catalog": {
              "type": "string",
              "description": "The catalog the surface was written for: `<theme>@<major>` (RFC-0018 manifest).",
              "pattern": "^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$"
            },
            "components": {
              "type": "array",
              "minItems": 1,
              "maxItems": 200,
              "items": {
                "$ref": "#/$defs/SurfaceComponent"
              }
            },
            "data": {
              "type": "object",
              "description": "The surface's data model: JSON its components bind to with `{path}` (at most 64 KB serialized; the store enforces the size).",
              "additionalProperties": true
            }
          }
        }
      ]
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "SocialLink": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "network",
        "href"
      ],
      "properties": {
        "network": {
          "type": "string",
          "enum": [
            "x",
            "bluesky",
            "mastodon",
            "github",
            "linkedin",
            "instagram",
            "facebook",
            "youtube",
            "tiktok",
            "threads",
            "rss",
            "email"
          ]
        },
        "href": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        }
      }
    },
    "SurfaceComponent": {
      "type": "object",
      "description": "One element of a generative UI surface (RFC-0020 §1), in a flat list: `component` names a catalog entry (a PascalCase built-in primitive such as `Stack`, or a registry block type such as `callout`), `children` refer to other ids of the same surface, and `props` follow the entry's schema, which the store checks. Field names follow A2UI v0.9.",
      "additionalProperties": false,
      "required": [
        "id",
        "component"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/SurfaceComponentId"
        },
        "component": {
          "type": "string",
          "pattern": "^(?:[A-Z][A-Za-z0-9]{1,40}|[a-z][a-z0-9-]{1,40})$"
        },
        "children": {
          "type": "array",
          "maxItems": 200,
          "items": {
            "$ref": "#/$defs/SurfaceComponentId"
          }
        },
        "props": {
          "type": "object",
          "description": "Literal values, `{path}` bindings into the surface's data, or `{call}` named functions; validated by the store against the catalog, not by this contract.",
          "additionalProperties": true
        },
        "visible": {
          "type": "object",
          "description": "A visibility condition over the surface's data (`eq`, `ne`, `gt`, `lt`, `and`, `or`, `not`); validated by the store.",
          "additionalProperties": true
        },
        "motion": {
          "type": "object",
          "description": "Motion presets for this component (RFC-0024 §2): `reveal`, `hover`, `speed`, `delay`, `stagger`, `replay` and later `scroll`, `loop`; enums and clamped numbers only, validated by the store against the catalog. The renderer turns them into CSS; agents never write CSS.",
          "additionalProperties": true
        }
      }
    },
    "SurfaceComponentId": {
      "type": "string",
      "description": "A component's id, unique within its surface; `root` is the tree's root (RFC-0020 §1).",
      "pattern": "^[a-z][a-z0-9-]{0,40}$"
    },
    "ThemeRef": {
      "type": "object",
      "description": "Theme (a.k.a. Experience) applied by the renderer. Config is theme-defined and validated by the theme's own schema, not here.",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "$ref": "#/$defs/Slug"
        },
        "version": {
          "type": "string",
          "maxLength": 64
        },
        "config": {
          "type": "object",
          "additionalProperties": true
        }
      }
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    },
    "TimeZone": {
      "type": "string",
      "description": "IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.",
      "pattern": "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$",
      "maxLength": 64
    }
  }
} as const;

export const PageSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/page.schema.json",
  "title": "Page",
  "description": "A routable page of a site: a path, editorial status and an ordered list of sections. Sections are embedded (not separate nodes) so a page is the unit of locking, snapshotting and diffing.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "path",
    "title",
    "locale",
    "status",
    "sections",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "path": {
      "type": "string",
      "description": "Absolute URL path, starting with '/', no trailing slash except root.",
      "pattern": "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
      "maxLength": 1024
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 300
    },
    "locale": {
      "$ref": "#/$defs/Locale"
    },
    "status": {
      "$ref": "#/$defs/PublishStatus"
    },
    "sections": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/Section"
      }
    },
    "seo": {
      "$ref": "#/$defs/Seo"
    },
    "availability": {
      "$ref": "#/$defs/Availability"
    },
    "chrome": {
      "type": "object",
      "description": "This page's own header and footer (RFC-0025 §1): a landing page without the menu, a checkout without the footer.",
      "additionalProperties": false,
      "properties": {
        "header": {
          "type": "string",
          "enum": [
            "default",
            "transparent",
            "hidden"
          ]
        },
        "footer": {
          "type": "string",
          "enum": [
            "default",
            "minimal",
            "hidden"
          ]
        }
      }
    },
    "motion": {
      "$ref": "#/$defs/MotionLevel",
      "description": "Overrides the site's motion level for this page, up or down (RFC-0024 §1); absent follows the site."
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "Availability": {
      "type": "object",
      "description": "Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "from": {
          "$ref": "#/$defs/Timestamp"
        },
        "until": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "BodyBlock": {
      "type": "object",
      "description": "One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.",
      "additionalProperties": false,
      "required": [
        "id",
        "hash"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^blk_[0-9A-Za-z]{8,24}$",
          "description": "Stable across writes that keep the block's content or its place among unchanged blocks."
        },
        "hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$",
          "description": "SHA-256 (hex) of the block's markdown without trailing whitespace."
        },
        "by": {
          "$ref": "#/$defs/Actor"
        },
        "via": {
          "type": "string",
          "enum": [
            "studio",
            "mcp",
            "api",
            "import",
            "ai-command",
            "proposal"
          ],
          "description": "The channel of that change."
        },
        "at": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "BodyBlocks": {
      "type": "array",
      "description": "A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.",
      "maxItems": 5000,
      "items": {
        "$ref": "#/$defs/BodyBlock"
      }
    },
    "BodyProfile": {
      "type": "integer",
      "enum": [
        1
      ],
      "description": "The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "ImageRef": {
      "type": "object",
      "description": "Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
        "assetId": {
          "$ref": "#/$defs/Id",
          "description": "The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."
        },
        "src": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "alt": {
          "type": "string",
          "maxLength": 500
        },
        "width": {
          "type": "integer",
          "minimum": 1
        },
        "height": {
          "type": "integer",
          "minimum": 1
        }
      }
    },
    "Link": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "label",
        "href"
      ],
      "properties": {
        "label": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "href": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "external": {
          "type": "boolean"
        }
      }
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "MotionLevel": {
      "type": "string",
      "description": "How much a page may move (RFC-0024 §1); the reader's reduced-motion preference and pause control can only lower it.",
      "enum": [
        "none",
        "subtle",
        "standard",
        "expressive"
      ]
    },
    "PublishStatus": {
      "type": "string",
      "description": "Editorial lifecycle of a page or content entry.",
      "enum": [
        "draft",
        "review",
        "published",
        "archived"
      ]
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Section": {
      "title": "Section",
      "description": "A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.",
      "oneOf": [
        {
          "type": "object",
          "title": "HeroSection",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "heading"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "hero"
              ]
            },
            "heading": {
              "type": "string",
              "minLength": 1,
              "maxLength": 300
            },
            "subheading": {
              "type": "string",
              "maxLength": 1000
            },
            "image": {
              "$ref": "#/$defs/ImageRef"
            },
            "cta": {
              "$ref": "#/$defs/Link"
            }
          }
        },
        {
          "type": "object",
          "title": "RichTextSection",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "format",
            "body"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "richText"
              ]
            },
            "format": {
              "type": "string",
              "enum": [
                "markdown",
                "html"
              ]
            },
            "body": {
              "type": "string",
              "maxLength": 200000
            },
            "profile": {
              "$ref": "#/$defs/BodyProfile"
            },
            "blocks": {
              "$ref": "#/$defs/BodyBlocks"
            }
          }
        },
        {
          "type": "object",
          "title": "ImageSection",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "image"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "image"
              ]
            },
            "image": {
              "$ref": "#/$defs/ImageRef"
            },
            "caption": {
              "type": "string",
              "maxLength": 1000
            }
          }
        },
        {
          "type": "object",
          "title": "ContentListSection",
          "description": "Renders the newest entries of a content collection (e.g. blog posts).",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "collection",
            "limit",
            "sort"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "contentList"
              ]
            },
            "collection": {
              "$ref": "#/$defs/Slug"
            },
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            },
            "sort": {
              "type": "string",
              "enum": [
                "newest",
                "oldest",
                "title"
              ]
            },
            "filter": {
              "type": "string",
              "description": "Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.",
              "minLength": 1,
              "maxLength": 512
            }
          }
        },
        {
          "type": "object",
          "title": "ComponentSection",
          "description": "A typed block from the block registry (RFC-0015): `type` names a registered block type (one global namespace of English names), `props` follow that type's props schema, which the store validates.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "type",
            "props"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "component"
              ]
            },
            "type": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9-]{1,40}$"
            },
            "props": {
              "type": "object",
              "description": "Validated against the type's props schema by the store, not by this contract.",
              "additionalProperties": true
            }
          }
        },
        {
          "type": "object",
          "title": "SurfaceSection",
          "description": "A generative UI surface (RFC-0020): a flat list of catalog components with a `root`, plus a data model their props may bind to. Written and streamed by agents as data, never code; the store checks the tree, the catalog and the limits.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "catalog",
            "components"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "surface"
              ]
            },
            "catalog": {
              "type": "string",
              "description": "The catalog the surface was written for: `<theme>@<major>` (RFC-0018 manifest).",
              "pattern": "^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$"
            },
            "components": {
              "type": "array",
              "minItems": 1,
              "maxItems": 200,
              "items": {
                "$ref": "#/$defs/SurfaceComponent"
              }
            },
            "data": {
              "type": "object",
              "description": "The surface's data model: JSON its components bind to with `{path}` (at most 64 KB serialized; the store enforces the size).",
              "additionalProperties": true
            }
          }
        }
      ]
    },
    "Seo": {
      "type": "object",
      "description": "Search and social metadata of a routable node (page, term archive).",
      "additionalProperties": false,
      "properties": {
        "title": {
          "type": "string",
          "maxLength": 300
        },
        "description": {
          "type": "string",
          "maxLength": 500
        },
        "noindex": {
          "type": "boolean"
        },
        "canonical": {
          "type": "string",
          "maxLength": 2048
        },
        "ogImage": {
          "$ref": "#/$defs/ImageRef"
        }
      }
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "SurfaceComponent": {
      "type": "object",
      "description": "One element of a generative UI surface (RFC-0020 §1), in a flat list: `component` names a catalog entry (a PascalCase built-in primitive such as `Stack`, or a registry block type such as `callout`), `children` refer to other ids of the same surface, and `props` follow the entry's schema, which the store checks. Field names follow A2UI v0.9.",
      "additionalProperties": false,
      "required": [
        "id",
        "component"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/SurfaceComponentId"
        },
        "component": {
          "type": "string",
          "pattern": "^(?:[A-Z][A-Za-z0-9]{1,40}|[a-z][a-z0-9-]{1,40})$"
        },
        "children": {
          "type": "array",
          "maxItems": 200,
          "items": {
            "$ref": "#/$defs/SurfaceComponentId"
          }
        },
        "props": {
          "type": "object",
          "description": "Literal values, `{path}` bindings into the surface's data, or `{call}` named functions; validated by the store against the catalog, not by this contract.",
          "additionalProperties": true
        },
        "visible": {
          "type": "object",
          "description": "A visibility condition over the surface's data (`eq`, `ne`, `gt`, `lt`, `and`, `or`, `not`); validated by the store.",
          "additionalProperties": true
        },
        "motion": {
          "type": "object",
          "description": "Motion presets for this component (RFC-0024 §2): `reveal`, `hover`, `speed`, `delay`, `stagger`, `replay` and later `scroll`, `loop`; enums and clamped numbers only, validated by the store against the catalog. The renderer turns them into CSS; agents never write CSS.",
          "additionalProperties": true
        }
      }
    },
    "SurfaceComponentId": {
      "type": "string",
      "description": "A component's id, unique within its surface; `root` is the tree's root (RFC-0020 §1).",
      "pattern": "^[a-z][a-z0-9-]{0,40}$"
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const SectionSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/section.schema.json",
  "title": "Section",
  "description": "A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.",
  "oneOf": [
    {
      "type": "object",
      "title": "HeroSection",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "heading"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "hero"
          ]
        },
        "heading": {
          "type": "string",
          "minLength": 1,
          "maxLength": 300
        },
        "subheading": {
          "type": "string",
          "maxLength": 1000
        },
        "image": {
          "$ref": "#/$defs/ImageRef"
        },
        "cta": {
          "$ref": "#/$defs/Link"
        }
      }
    },
    {
      "type": "object",
      "title": "RichTextSection",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "format",
        "body"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "richText"
          ]
        },
        "format": {
          "type": "string",
          "enum": [
            "markdown",
            "html"
          ]
        },
        "body": {
          "type": "string",
          "maxLength": 200000
        },
        "profile": {
          "$ref": "#/$defs/BodyProfile"
        },
        "blocks": {
          "$ref": "#/$defs/BodyBlocks"
        }
      }
    },
    {
      "type": "object",
      "title": "ImageSection",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "image"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "image"
          ]
        },
        "image": {
          "$ref": "#/$defs/ImageRef"
        },
        "caption": {
          "type": "string",
          "maxLength": 1000
        }
      }
    },
    {
      "type": "object",
      "title": "ContentListSection",
      "description": "Renders the newest entries of a content collection (e.g. blog posts).",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "collection",
        "limit",
        "sort"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "contentList"
          ]
        },
        "collection": {
          "$ref": "#/$defs/Slug"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "sort": {
          "type": "string",
          "enum": [
            "newest",
            "oldest",
            "title"
          ]
        },
        "filter": {
          "type": "string",
          "description": "Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.",
          "minLength": 1,
          "maxLength": 512
        }
      }
    },
    {
      "type": "object",
      "title": "ComponentSection",
      "description": "A typed block from the block registry (RFC-0015): `type` names a registered block type (one global namespace of English names), `props` follow that type's props schema, which the store validates.",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "type",
        "props"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "component"
          ]
        },
        "type": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]{1,40}$"
        },
        "props": {
          "type": "object",
          "description": "Validated against the type's props schema by the store, not by this contract.",
          "additionalProperties": true
        }
      }
    },
    {
      "type": "object",
      "title": "SurfaceSection",
      "description": "A generative UI surface (RFC-0020): a flat list of catalog components with a `root`, plus a data model their props may bind to. Written and streamed by agents as data, never code; the store checks the tree, the catalog and the limits.",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "catalog",
        "components"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "surface"
          ]
        },
        "catalog": {
          "type": "string",
          "description": "The catalog the surface was written for: `<theme>@<major>` (RFC-0018 manifest).",
          "pattern": "^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$"
        },
        "components": {
          "type": "array",
          "minItems": 1,
          "maxItems": 200,
          "items": {
            "$ref": "#/$defs/SurfaceComponent"
          }
        },
        "data": {
          "type": "object",
          "description": "The surface's data model: JSON its components bind to with `{path}` (at most 64 KB serialized; the store enforces the size).",
          "additionalProperties": true
        }
      }
    }
  ],
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "BodyBlock": {
      "type": "object",
      "description": "One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.",
      "additionalProperties": false,
      "required": [
        "id",
        "hash"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^blk_[0-9A-Za-z]{8,24}$",
          "description": "Stable across writes that keep the block's content or its place among unchanged blocks."
        },
        "hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$",
          "description": "SHA-256 (hex) of the block's markdown without trailing whitespace."
        },
        "by": {
          "$ref": "#/$defs/Actor"
        },
        "via": {
          "type": "string",
          "enum": [
            "studio",
            "mcp",
            "api",
            "import",
            "ai-command",
            "proposal"
          ],
          "description": "The channel of that change."
        },
        "at": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "BodyBlocks": {
      "type": "array",
      "description": "A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.",
      "maxItems": 5000,
      "items": {
        "$ref": "#/$defs/BodyBlock"
      }
    },
    "BodyProfile": {
      "type": "integer",
      "enum": [
        1
      ],
      "description": "The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "ImageRef": {
      "type": "object",
      "description": "Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
        "assetId": {
          "$ref": "#/$defs/Id",
          "description": "The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."
        },
        "src": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "alt": {
          "type": "string",
          "maxLength": 500
        },
        "width": {
          "type": "integer",
          "minimum": 1
        },
        "height": {
          "type": "integer",
          "minimum": 1
        }
      }
    },
    "Link": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "label",
        "href"
      ],
      "properties": {
        "label": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "href": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "external": {
          "type": "boolean"
        }
      }
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "SurfaceComponent": {
      "type": "object",
      "description": "One element of a generative UI surface (RFC-0020 §1), in a flat list: `component` names a catalog entry (a PascalCase built-in primitive such as `Stack`, or a registry block type such as `callout`), `children` refer to other ids of the same surface, and `props` follow the entry's schema, which the store checks. Field names follow A2UI v0.9.",
      "additionalProperties": false,
      "required": [
        "id",
        "component"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/SurfaceComponentId"
        },
        "component": {
          "type": "string",
          "pattern": "^(?:[A-Z][A-Za-z0-9]{1,40}|[a-z][a-z0-9-]{1,40})$"
        },
        "children": {
          "type": "array",
          "maxItems": 200,
          "items": {
            "$ref": "#/$defs/SurfaceComponentId"
          }
        },
        "props": {
          "type": "object",
          "description": "Literal values, `{path}` bindings into the surface's data, or `{call}` named functions; validated by the store against the catalog, not by this contract.",
          "additionalProperties": true
        },
        "visible": {
          "type": "object",
          "description": "A visibility condition over the surface's data (`eq`, `ne`, `gt`, `lt`, `and`, `or`, `not`); validated by the store.",
          "additionalProperties": true
        },
        "motion": {
          "type": "object",
          "description": "Motion presets for this component (RFC-0024 §2): `reveal`, `hover`, `speed`, `delay`, `stagger`, `replay` and later `scroll`, `loop`; enums and clamped numbers only, validated by the store against the catalog. The renderer turns them into CSS; agents never write CSS.",
          "additionalProperties": true
        }
      }
    },
    "SurfaceComponentId": {
      "type": "string",
      "description": "A component's id, unique within its surface; `root` is the tree's root (RFC-0020 §1).",
      "pattern": "^[a-z][a-z0-9-]{0,40}$"
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const ContentEntrySchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/content-entry.schema.json",
  "title": "ContentEntry",
  "description": "A structured content item in a named collection (e.g. collection 'posts'). Core fields are typed; collection-specific fields live in `fields` and are validated by the collection's own schema in a later phase.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "collection",
    "slug",
    "locale",
    "status",
    "title",
    "body",
    "fields",
    "tags",
    "author",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "collection": {
      "$ref": "#/$defs/Slug"
    },
    "slug": {
      "$ref": "#/$defs/Slug"
    },
    "locale": {
      "$ref": "#/$defs/Locale"
    },
    "status": {
      "$ref": "#/$defs/PublishStatus"
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 300
    },
    "summary": {
      "type": "string",
      "maxLength": 2000
    },
    "body": {
      "$ref": "#/$defs/Body"
    },
    "fields": {
      "type": "object",
      "description": "Collection-specific values; any JSON.",
      "additionalProperties": true
    },
    "tags": {
      "type": "array",
      "description": "Deprecated by RFC-0002: use `terms.tag`. Still accepted on input for one release and translated into terms; the store then writes []. Removed in schemaVersion 2.",
      "deprecated": true,
      "items": {
        "$ref": "#/$defs/Slug"
      },
      "uniqueItems": true,
      "maxItems": 50
    },
    "terms": {
      "type": "object",
      "description": "Term assignments by taxonomy key (e.g. 'category', 'tag'). Terms are referenced by id, independent of locale. A taxonomy without terms is omitted, never an empty object.",
      "propertyNames": {
        "$ref": "#/$defs/Slug"
      },
      "minProperties": 1,
      "maxProperties": 10,
      "additionalProperties": {
        "$ref": "#/$defs/TermAssignment"
      }
    },
    "author": {
      "$ref": "#/$defs/Actor"
    },
    "coverImage": {
      "$ref": "#/$defs/ImageRef"
    },
    "publishedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "availability": {
      "$ref": "#/$defs/Availability"
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    },
    "corrections": {
      "type": "array",
      "description": "Corrections, clarifications and updates appended to the entry, oldest first (RFC-0019 §2). The store stamps `at`; an item that has been live can no longer be removed, and only a person may edit its note.",
      "items": {
        "$ref": "#/$defs/Correction"
      },
      "maxItems": 100
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "Availability": {
      "type": "object",
      "description": "Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "from": {
          "$ref": "#/$defs/Timestamp"
        },
        "until": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "Body": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "format",
        "value"
      ],
      "properties": {
        "format": {
          "type": "string",
          "enum": [
            "markdown",
            "html"
          ]
        },
        "value": {
          "type": "string",
          "maxLength": 1000000
        },
        "profile": {
          "$ref": "#/$defs/BodyProfile"
        },
        "blocks": {
          "$ref": "#/$defs/BodyBlocks"
        }
      }
    },
    "BodyBlock": {
      "type": "object",
      "description": "One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.",
      "additionalProperties": false,
      "required": [
        "id",
        "hash"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^blk_[0-9A-Za-z]{8,24}$",
          "description": "Stable across writes that keep the block's content or its place among unchanged blocks."
        },
        "hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$",
          "description": "SHA-256 (hex) of the block's markdown without trailing whitespace."
        },
        "by": {
          "$ref": "#/$defs/Actor"
        },
        "via": {
          "type": "string",
          "enum": [
            "studio",
            "mcp",
            "api",
            "import",
            "ai-command",
            "proposal"
          ],
          "description": "The channel of that change."
        },
        "at": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "BodyBlocks": {
      "type": "array",
      "description": "A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.",
      "maxItems": 5000,
      "items": {
        "$ref": "#/$defs/BodyBlock"
      }
    },
    "BodyProfile": {
      "type": "integer",
      "enum": [
        1
      ],
      "description": "The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."
    },
    "Correction": {
      "type": "object",
      "description": "One correction notice (RFC-0019 §2).",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "at",
        "note"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "correction",
            "clarification",
            "update"
          ]
        },
        "at": {
          "$ref": "#/$defs/Timestamp",
          "description": "When it was written; set by the store, never by the caller."
        },
        "note": {
          "type": "string",
          "description": "What changed, in markdown (inline).",
          "minLength": 1,
          "maxLength": 2000
        },
        "snapshotId": {
          "$ref": "#/$defs/Id",
          "description": "The snapshot it was first published in."
        }
      }
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "ImageRef": {
      "type": "object",
      "description": "Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
        "assetId": {
          "$ref": "#/$defs/Id",
          "description": "The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."
        },
        "src": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "alt": {
          "type": "string",
          "maxLength": 500
        },
        "width": {
          "type": "integer",
          "minimum": 1
        },
        "height": {
          "type": "integer",
          "minimum": 1
        }
      }
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "PublishStatus": {
      "type": "string",
      "description": "Editorial lifecycle of a page or content entry.",
      "enum": [
        "draft",
        "review",
        "published",
        "archived"
      ]
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "TermAssignment": {
      "type": "object",
      "description": "Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.",
      "additionalProperties": false,
      "required": [
        "ids"
      ],
      "properties": {
        "ids": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Id"
          },
          "minItems": 1,
          "maxItems": 50,
          "uniqueItems": true
        },
        "primary": {
          "$ref": "#/$defs/Id",
          "description": "The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."
        }
      }
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const SnapshotSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/snapshot.schema.json",
  "title": "Snapshot",
  "description": "Immutable record of a site's node set at one instant: which nodes existed, at which revision, with which content hash. Every mutation by an agent produces one; publish and rollback point the site at one. Node bodies are stored by hash in the blob store, not here.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "siteRev",
    "reason",
    "actor",
    "nodes",
    "summary",
    "createdAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "parentId": {
      "$ref": "#/$defs/Id",
      "description": "Previous snapshot in this site's history; absent for the first one."
    },
    "siteRev": {
      "$ref": "#/$defs/Revision"
    },
    "reason": {
      "type": "string",
      "enum": [
        "manual",
        "agentMutation",
        "publish",
        "rollback",
        "scheduled",
        "import"
      ]
    },
    "label": {
      "type": "string",
      "maxLength": 200
    },
    "actor": {
      "$ref": "#/$defs/Actor"
    },
    "nodes": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/NodeRef"
      }
    },
    "summary": {
      "$ref": "#/$defs/ChangeSummary"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "ChangeSummary": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "added",
        "changed",
        "removed"
      ],
      "properties": {
        "added": {
          "type": "integer",
          "minimum": 0
        },
        "changed": {
          "type": "integer",
          "minimum": 0
        },
        "removed": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "NodeRef": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "kind",
        "rev",
        "hash"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/Id"
        },
        "kind": {
          "type": "string",
          "enum": [
            "site",
            "page",
            "contentEntry",
            "taxonomy",
            "term",
            "redirect",
            "menu",
            "asset"
          ]
        },
        "rev": {
          "$ref": "#/$defs/Revision"
        },
        "hash": {
          "type": "string",
          "description": "Lower-case hex SHA-256 of the node's canonical JSON.",
          "pattern": "^[0-9a-f]{64}$"
        }
      }
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const SkillManifestSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/skill-manifest.schema.json",
  "title": "SkillManifest",
  "description": "YAML frontmatter of a SKILL.md, exactly the six fields of the Agent Skills specification (agentskills.io). Cloudhal-specific data goes under `metadata` as flat string keys prefixed `cloudhal.` (schemaVersion, requiresCapabilities, scopes, approval); nested vendor blocks are rejected by hosted skill uploaders.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "name",
    "description"
  ],
  "properties": {
    "name": {
      "type": "string",
      "description": "Lower-case kebab-case; must equal the skill directory name.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 64
    },
    "description": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1024
    },
    "license": {
      "type": "string",
      "maxLength": 200
    },
    "compatibility": {
      "type": "string",
      "maxLength": 500
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    },
    "allowed-tools": {
      "type": "string",
      "description": "Space-separated tool names the skill may call (experimental in the spec).",
      "maxLength": 2000
    }
  },
  "$defs": {
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    }
  }
} as const;

export const TaxonomySchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/taxonomy.schema.json",
  "title": "Taxonomy",
  "description": "A classification scheme of a site (e.g. 'category', 'tag', 'series') and its rules: hierarchy, who may create terms, how many terms an entry takes, and how its archives are published. Terms are separate nodes (term.schema.json) that point here by id (RFC-0002).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "key",
    "labels",
    "hierarchical",
    "allowNewTerms",
    "required",
    "archive",
    "feed",
    "minEntriesToIndex",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "key": {
      "$ref": "#/$defs/Slug",
      "description": "Stable name of the taxonomy, unique per site and immutable once created. ContentEntry.terms and filter expressions use it (e.g. 'category:news')."
    },
    "labels": {
      "type": "object",
      "description": "Display names per locale. Must contain the site's default locale.",
      "propertyNames": {
        "$ref": "#/$defs/Locale"
      },
      "minProperties": 1,
      "additionalProperties": {
        "$ref": "#/$defs/TaxonomyLabel"
      }
    },
    "hierarchical": {
      "type": "boolean",
      "description": "Terms may have a parent term (categories). Flat when false (tags)."
    },
    "allowNewTerms": {
      "type": "string",
      "description": "Who may add terms. none: people only. propose: agents may create terms with status 'proposed' that wait for a person. free: agents may create active terms.",
      "enum": [
        "none",
        "propose",
        "free"
      ]
    },
    "required": {
      "type": "boolean",
      "description": "An entry in review or published status must have at least one term of this taxonomy and an explicit primary term."
    },
    "maxPerEntry": {
      "type": "integer",
      "description": "Most terms of this taxonomy one entry may carry. Absent: the contract limit of 50.",
      "minimum": 1,
      "maximum": 50
    },
    "collections": {
      "type": "array",
      "description": "Collections this taxonomy applies to. Absent: every collection.",
      "items": {
        "$ref": "#/$defs/Slug"
      },
      "minItems": 1,
      "maxItems": 50,
      "uniqueItems": true
    },
    "archive": {
      "$ref": "#/$defs/TaxonomyArchive"
    },
    "feed": {
      "type": "boolean",
      "description": "Publish an RSS feed per term at <archive.basePath>/<slug>/rss.xml. Requires archive.enabled."
    },
    "minEntriesToIndex": {
      "type": "integer",
      "description": "Archives listing fewer published entries than this are served with robots 'noindex, follow' and left out of the sitemap.",
      "minimum": 0,
      "maximum": 1000
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "Path": {
      "type": "string",
      "description": "Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.",
      "pattern": "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
      "maxLength": 1024
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "TaxonomyArchive": {
      "type": "object",
      "description": "Public archive pages: <basePath>/<term-slug> and <basePath>/<term-slug>/page/<n>.",
      "additionalProperties": false,
      "required": [
        "enabled",
        "basePath"
      ],
      "properties": {
        "enabled": {
          "type": "boolean"
        },
        "basePath": {
          "$ref": "#/$defs/Path"
        }
      }
    },
    "TaxonomyLabel": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "singular",
        "plural"
      ],
      "properties": {
        "singular": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "plural": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "description": {
          "type": "string",
          "maxLength": 1000
        }
      }
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const TermSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/term.schema.json",
  "title": "Term",
  "description": "One concept in a taxonomy (a category, a tag, a series). Content refers to terms by id, independent of locale; names, synonyms, archive intro and SEO are per locale. Renames, merges and retirements keep the id and leave redirects behind; `proposedBy` records the actor that proposed it (RFC-0002).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "taxonomyId",
    "slug",
    "status",
    "visibility",
    "labels",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "taxonomyId": {
      "$ref": "#/$defs/Id"
    },
    "slug": {
      "$ref": "#/$defs/Slug",
      "description": "URL segment of the term's archive; unique within its taxonomy, together with every slug in any term's slugHistory."
    },
    "status": {
      "type": "string",
      "description": "active: usable and public (subject to visibility). proposed: created by an agent, waiting for a person; assignable but never public. retired: no new assignments, no archive.",
      "enum": [
        "active",
        "proposed",
        "retired"
      ]
    },
    "visibility": {
      "type": "string",
      "description": "internal terms have no archive, feed or sitemap entry and are not shown on entries; themes and filters may still use them.",
      "enum": [
        "public",
        "internal"
      ]
    },
    "labels": {
      "type": "object",
      "description": "Names per locale. Must contain the site's default locale.",
      "propertyNames": {
        "$ref": "#/$defs/Locale"
      },
      "minProperties": 1,
      "additionalProperties": {
        "$ref": "#/$defs/TermLabel"
      }
    },
    "parentId": {
      "$ref": "#/$defs/Id",
      "description": "Parent term in the same taxonomy; only in hierarchical taxonomies. No cycles."
    },
    "position": {
      "type": "integer",
      "description": "Order among sibling terms (same taxonomy and parent), lowest first, for menus and sidebars. Terms without a position follow, by name.",
      "minimum": 0,
      "maximum": 100000
    },
    "image": {
      "$ref": "#/$defs/ImageRef"
    },
    "links": {
      "type": "array",
      "description": "Profile links shown with the term and given to search engines as sameAs, such as an author's pages elsewhere (RFC-0019 §1).",
      "maxItems": 10,
      "items": {
        "$ref": "#/$defs/Link"
      }
    },
    "slugHistory": {
      "type": "array",
      "description": "Earlier slugs, oldest first. Old slugs stay reserved in the taxonomy and still resolve when an agent assigns by slug.",
      "items": {
        "$ref": "#/$defs/Slug"
      },
      "minItems": 1,
      "maxItems": 50,
      "uniqueItems": true
    },
    "mergedInto": {
      "$ref": "#/$defs/Id",
      "description": "Set when this term was merged into another active term of the same taxonomy; status is then 'retired'."
    },
    "proposedBy": {
      "$ref": "#/$defs/Actor"
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "ImageRef": {
      "type": "object",
      "description": "Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
        "assetId": {
          "$ref": "#/$defs/Id",
          "description": "The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."
        },
        "src": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "alt": {
          "type": "string",
          "maxLength": 500
        },
        "width": {
          "type": "integer",
          "minimum": 1
        },
        "height": {
          "type": "integer",
          "minimum": 1
        }
      }
    },
    "Link": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "label",
        "href"
      ],
      "properties": {
        "label": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "href": {
          "type": "string",
          "minLength": 1,
          "maxLength": 2048
        },
        "external": {
          "type": "boolean"
        }
      }
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Seo": {
      "type": "object",
      "description": "Search and social metadata of a routable node (page, term archive).",
      "additionalProperties": false,
      "properties": {
        "title": {
          "type": "string",
          "maxLength": 300
        },
        "description": {
          "type": "string",
          "maxLength": 500
        },
        "noindex": {
          "type": "boolean"
        },
        "canonical": {
          "type": "string",
          "maxLength": 2048
        },
        "ogImage": {
          "$ref": "#/$defs/ImageRef"
        }
      }
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "TermLabel": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "altNames": {
          "type": "array",
          "description": "Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "minItems": 1,
          "maxItems": 50,
          "uniqueItems": true
        },
        "description": {
          "type": "string",
          "description": "Markdown introduction shown at the top of the archive.",
          "maxLength": 20000
        },
        "role": {
          "type": "string",
          "description": "A short role or title shown with the term, such as an author's \"Senior reporter\" (RFC-0019 §1).",
          "minLength": 1,
          "maxLength": 120
        },
        "seo": {
          "$ref": "#/$defs/Seo"
        }
      }
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const RedirectSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/redirect.schema.json",
  "title": "Redirect",
  "description": "An HTTP redirect from a path the site no longer serves. Created automatically when a published entry or a term changes slug, when terms are merged or retired, and by people. Snapshotted and published like every other node (RFC-0002).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "from",
    "to",
    "status",
    "match",
    "reason",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "from": {
      "type": "string",
      "description": "Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site; never a path the site currently serves.",
      "pattern": "^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$",
      "maxLength": 1024
    },
    "to": {
      "type": "string",
      "description": "Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected.",
      "pattern": "^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$",
      "maxLength": 2048
    },
    "status": {
      "type": "integer",
      "description": "301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects.",
      "enum": [
        301,
        302
      ]
    },
    "match": {
      "type": "string",
      "description": "exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2).",
      "enum": [
        "exact",
        "prefix"
      ]
    },
    "reason": {
      "type": "string",
      "enum": [
        "slug-change",
        "merge",
        "retire",
        "manual"
      ]
    },
    "source": {
      "$ref": "#/$defs/RedirectSource"
    },
    "note": {
      "type": "string",
      "maxLength": 500
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "RedirectSource": {
      "type": "object",
      "description": "The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "page",
            "contentEntry",
            "term"
          ]
        },
        "id": {
          "$ref": "#/$defs/Id"
        }
      }
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const AssetSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/asset.schema.json",
  "title": "Asset",
  "description": "A media file of a site (image, video, audio, document, data) as a graph node: its bytes are identified by SHA-256 and stored once per site in the blob store under a content-addressed key, or kept elsewhere (`storage.kind: external`, e.g. a Zenodo or Hugging Face file). Pages, entries and terms refer to it by id (`ImageRef.assetId`, markdown `asset:<id>`). Snapshotted like every node, so a deleted asset's bytes stay while any snapshot references it (RFC-0004).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "kind",
    "mediaType",
    "bytes",
    "sha256",
    "slug",
    "storage",
    "status",
    "uploadedBy",
    "source",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "kind": {
      "type": "string",
      "description": "What the file is, derived from the sniffed media type (never chosen by the client). `other` is allowed for external storage only.",
      "enum": [
        "image",
        "video",
        "audio",
        "document",
        "data",
        "other"
      ]
    },
    "mediaType": {
      "type": "string",
      "description": "MIME type of the stored bytes as sniffed by the server (RFC 6838, lower case, no parameters), e.g. image/webp, text/csv. Served as Content-Type.",
      "pattern": "^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$",
      "maxLength": 255
    },
    "bytes": {
      "type": "integer",
      "description": "Size of the stored bytes. For external files: the size the source reports or the uploader declares.",
      "minimum": 0
    },
    "sha256": {
      "$ref": "#/$defs/Sha256",
      "description": "SHA-256 of the stored bytes (lower-case hex): the blob key, the public URL prefix, the ETag and the checksum shown with downloads. Unique per site. For external files see `storage.checksum`."
    },
    "originalSha256": {
      "$ref": "#/$defs/Sha256",
      "description": "SHA-256 of the bytes as uploaded, present only when the server changed them (image metadata stripping)."
    },
    "slug": {
      "$ref": "#/$defs/Slug",
      "description": "File name in the public URL, without extension: /media/<sha256[0..16]>/<slug>.<ext>. May change; the old URL then answers 301 to the new one."
    },
    "storage": {
      "$ref": "#/$defs/AssetStorage"
    },
    "image": {
      "$ref": "#/$defs/AssetImage"
    },
    "title": {
      "type": "object",
      "description": "Display title per locale (download lists, library search).",
      "propertyNames": {
        "$ref": "#/$defs/Locale"
      },
      "minProperties": 1,
      "additionalProperties": {
        "type": "string",
        "minLength": 1,
        "maxLength": 300
      }
    },
    "alt": {
      "type": "object",
      "description": "Alternative text per locale. An `ImageRef.alt` that is not empty overrides it for one use.",
      "propertyNames": {
        "$ref": "#/$defs/Locale"
      },
      "minProperties": 1,
      "additionalProperties": {
        "type": "string",
        "minLength": 1,
        "maxLength": 500
      }
    },
    "decorative": {
      "type": "boolean",
      "description": "The image carries no information and renders with alt=\"\". Absent means false; the store never writes false."
    },
    "caption": {
      "type": "object",
      "description": "Caption per locale (plain text), the default for figures that show this asset.",
      "propertyNames": {
        "$ref": "#/$defs/Locale"
      },
      "minProperties": 1,
      "additionalProperties": {
        "type": "string",
        "minLength": 1,
        "maxLength": 1000
      }
    },
    "credit": {
      "type": "string",
      "description": "Who made it, as shown next to it (e.g. 'Photo: Ayşe Yılmaz').",
      "minLength": 1,
      "maxLength": 300
    },
    "license": {
      "$ref": "#/$defs/AssetLicense"
    },
    "status": {
      "type": "string",
      "description": "active: listed and pickable. retired: hidden from the library and pickers and cannot be newly referenced; existing references keep rendering.",
      "enum": [
        "active",
        "retired"
      ]
    },
    "uploadedBy": {
      "$ref": "#/$defs/Actor"
    },
    "source": {
      "$ref": "#/$defs/AssetSource"
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "AssetImage": {
      "type": "object",
      "description": "Intrinsic size and placeholders of an image. Present for every image stored as a blob.",
      "additionalProperties": false,
      "required": [
        "width",
        "height"
      ],
      "properties": {
        "width": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100000
        },
        "height": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100000
        },
        "animated": {
          "type": "boolean",
          "description": "Animated GIF or WebP: never resized or re-encoded. Absent means false; the store never writes false."
        },
        "blurhash": {
          "type": "string",
          "description": "BlurHash of the image for themes that decode it client-side.",
          "pattern": "^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"
        },
        "lqip": {
          "type": "string",
          "description": "Low-quality placeholder: a raster data: URL of at most about 3 KB, shown while the image loads.",
          "pattern": "^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$",
          "maxLength": 4096
        }
      }
    },
    "AssetLicense": {
      "description": "Terms the asset may be reused under: an SPDX license expression or a license URL.",
      "oneOf": [
        {
          "type": "object",
          "title": "SpdxLicense",
          "additionalProperties": false,
          "required": [
            "kind",
            "id"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "spdx"
              ]
            },
            "id": {
              "type": "string",
              "description": "SPDX license identifier or simple expression, e.g. CC-BY-4.0, CC0-1.0, MIT OR Apache-2.0, LicenseRef-AllRightsReserved.",
              "pattern": "^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$",
              "maxLength": 200
            }
          }
        },
        {
          "type": "object",
          "title": "UrlLicense",
          "additionalProperties": false,
          "required": [
            "kind",
            "url"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "url"
              ]
            },
            "url": {
              "$ref": "#/$defs/HttpsUrl"
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            }
          }
        }
      ]
    },
    "AssetSource": {
      "description": "How the asset came in. Immutable after create.",
      "oneOf": [
        {
          "type": "object",
          "title": "UploadSource",
          "description": "Bytes uploaded by a person (REST) or an agent (MCP upload_asset).",
          "additionalProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "upload"
              ]
            },
            "filename": {
              "type": "string",
              "description": "Original file name as sent (never used as a storage key or served).",
              "pattern": "^[^/\\\\\\u0000-\\u001f\\u007f]+$",
              "minLength": 1,
              "maxLength": 255
            }
          }
        },
        {
          "type": "object",
          "title": "FetchSource",
          "description": "Bytes the server fetched from an https URL (MCP fetch_asset_url, Studio 'From URL') under the SSRF rules.",
          "additionalProperties": false,
          "required": [
            "kind",
            "url",
            "fetchedAt"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "fetch"
              ]
            },
            "url": {
              "$ref": "#/$defs/HttpsUrl"
            },
            "fetchedAt": {
              "$ref": "#/$defs/Timestamp"
            }
          }
        },
        {
          "type": "object",
          "title": "ImportSource",
          "description": "Created by a migration or importer (e.g. `cloudhal media import-urls` from an ImageRef.src).",
          "additionalProperties": false,
          "required": [
            "kind",
            "from"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "import"
              ]
            },
            "from": {
              "type": "string",
              "description": "The reference it was imported from: a URL or a site path.",
              "minLength": 1,
              "maxLength": 2048
            },
            "importer": {
              "$ref": "#/$defs/Slug"
            }
          }
        },
        {
          "type": "object",
          "title": "LinkSource",
          "description": "An external file registered by URL without copying its bytes (storage.kind external).",
          "additionalProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "link"
              ]
            }
          }
        }
      ]
    },
    "AssetStorage": {
      "description": "Where the bytes live. `blob`: in this deployment's blob store (R2 or the filesystem) under the content-addressed key media/<siteId>/<sha256>, derived and never stored, so the node is portable between backends. `external`: elsewhere, linked rather than hosted (large research files on Zenodo or Hugging Face).",
      "oneOf": [
        {
          "type": "object",
          "title": "BlobStorage",
          "additionalProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "blob"
              ]
            }
          }
        },
        {
          "type": "object",
          "title": "ExternalStorage",
          "additionalProperties": false,
          "required": [
            "kind",
            "url",
            "checksum"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "external"
              ]
            },
            "url": {
              "$ref": "#/$defs/HttpsUrl",
              "description": "Direct download URL of the file."
            },
            "landingPage": {
              "$ref": "#/$defs/HttpsUrl",
              "description": "Human page of the record the file belongs to (e.g. a Zenodo record or a Hugging Face dataset)."
            },
            "checksum": {
              "type": "string",
              "description": "How `sha256` was obtained. computed: the server or `cloudhal media verify` streamed the URL and hashed it. declared: given by the person who linked it, not verified (shown as such).",
              "enum": [
                "computed",
                "declared"
              ]
            },
            "verifiedAt": {
              "$ref": "#/$defs/Timestamp",
              "description": "When the URL last produced bytes with this SHA-256 (checksum `computed`)."
            }
          }
        }
      ]
    },
    "HttpsUrl": {
      "type": "string",
      "description": "Absolute https URL without credentials, whitespace or backslashes.",
      "pattern": "^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$",
      "maxLength": 2048
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Sha256": {
      "type": "string",
      "description": "Lower-case hex SHA-256 digest.",
      "pattern": "^[0-9a-f]{64}$"
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const MenuSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/menu.schema.json",
  "title": "Menu",
  "description": "A named navigation menu of a site (e.g. 'primary', 'footer', 'sidebar'): an ordered tree of items. Items point at pages, entries and terms by id, so renames and slug changes never break them; an item whose target is gone, retired or unpublished is hidden by the renderer, never rendered as a dead link (RFC-0003).",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "key",
    "maxDepth",
    "items",
    "rev",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/Id"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "key": {
      "$ref": "#/$defs/Slug",
      "description": "Where themes place the menu ('primary', 'footer', 'sidebar', …). Unique per site and immutable once created."
    },
    "maxDepth": {
      "type": "integer",
      "description": "Deepest level an item may sit at; top-level items are level 1. The store refuses deeper trees.",
      "minimum": 1,
      "maximum": 6
    },
    "items": {
      "type": "array",
      "description": "Top-level items in display order. Empty means the site deliberately shows no items here (a missing menu means the theme's derived default).",
      "items": {
        "$ref": "#/$defs/MenuItem"
      },
      "maxItems": 100
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "MenuDisplay": {
      "type": "string",
      "description": "RFC-0025 25d (RFC-0003 amendment): how a top-level item with children opens in the header. `mega`: one wide panel, its children as columns (a group's children are the column's links).",
      "enum": [
        "mega"
      ]
    },
    "MenuItem": {
      "description": "One item, discriminated by `kind` (what it links to). Children, in display order, form the tree; an item has exactly one parent by construction, so the tree has no cycles.",
      "oneOf": [
        {
          "type": "object",
          "title": "PageMenuItem",
          "description": "Links to a page by id; the label falls back to the page title.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "pageId"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "page"
              ]
            },
            "pageId": {
              "$ref": "#/$defs/Id"
            },
            "labels": {
              "$ref": "#/$defs/MenuLabels"
            },
            "display": {
              "$ref": "#/$defs/MenuDisplay"
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/MenuItem"
              },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "EntryMenuItem",
          "description": "Links to a content entry by id (at /<collection>/<slug>); the label falls back to the entry title.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "entryId"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "contentEntry"
              ]
            },
            "entryId": {
              "$ref": "#/$defs/Id"
            },
            "labels": {
              "$ref": "#/$defs/MenuLabels"
            },
            "display": {
              "$ref": "#/$defs/MenuDisplay"
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/MenuItem"
              },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "TermMenuItem",
          "description": "Links to a term's archive by term id; the label falls back to the term name in the locale.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "termId"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "term"
              ]
            },
            "termId": {
              "$ref": "#/$defs/Id"
            },
            "labels": {
              "$ref": "#/$defs/MenuLabels"
            },
            "display": {
              "$ref": "#/$defs/MenuDisplay"
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/MenuItem"
              },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "CollectionMenuItem",
          "description": "Links to the index of a content collection, wherever the theme serves it. Collections have no node and no title, so labels are required.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "collection",
            "labels"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "collection"
              ]
            },
            "collection": {
              "$ref": "#/$defs/Slug"
            },
            "labels": {
              "$ref": "#/$defs/MenuLabels"
            },
            "display": {
              "$ref": "#/$defs/MenuDisplay"
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/MenuItem"
              },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "UrlMenuItem",
          "description": "Links to an external https URL. The host is ASCII (internationalised names in punycode) and carries no user-info, so a label cannot hide where the link goes.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "href",
            "labels"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "url"
              ]
            },
            "href": {
              "type": "string",
              "pattern": "^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$",
              "maxLength": 2048
            },
            "newTab": {
              "type": "boolean",
              "description": "Open in a new tab (rendered with rel=\"noopener noreferrer\")."
            },
            "labels": {
              "$ref": "#/$defs/MenuLabels"
            },
            "display": {
              "$ref": "#/$defs/MenuDisplay"
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/MenuItem"
              },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "GroupMenuItem",
          "description": "A label without a link that holds other items: a dropdown parent or a sidebar section heading. Hidden when none of its children is shown.",
          "additionalProperties": false,
          "required": [
            "id",
            "kind",
            "labels",
            "children"
          ],
          "properties": {
            "id": {
              "$ref": "#/$defs/Id"
            },
            "kind": {
              "type": "string",
              "enum": [
                "group"
              ]
            },
            "labels": {
              "$ref": "#/$defs/MenuLabels"
            },
            "display": {
              "$ref": "#/$defs/MenuDisplay"
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/MenuItem"
              },
              "minItems": 1,
              "maxItems": 100
            }
          }
        }
      ]
    },
    "MenuLabels": {
      "type": "object",
      "description": "Item label per locale; plain text, no control characters or surrounding whitespace. A locale without a label falls back to the default locale's label, then to the target's own title or name.",
      "propertyNames": {
        "$ref": "#/$defs/Locale"
      },
      "minProperties": 1,
      "additionalProperties": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100,
        "pattern": "^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"
      }
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const AnalyticsEventSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/analytics-event.schema.json",
  "title": "AnalyticsEvent",
  "description": "One site analytics event as stored (RFC-0006): a page view or a Core Web Vitals sample reported by the site's first-party script, or a response the site Worker rendered itself (cache miss, redirect, 404, 410, 5xx). Written by the site Worker after it validated and enriched a beacon. The named fields are the columns of the local/self-host SQLite store; each one documents its fixed slot in a Workers Analytics Engine data point (index1 = siteId, blob1 = kind, blob2 = schemaVersion). Slots never move and new fields are only appended. Never carries an IP address, a user agent, a full referrer URL, a query string or a cookie.",
  "oneOf": [
    {
      "type": "object",
      "title": "AnalyticsPageviewEvent",
      "description": "A published page, article or archive was shown to a visitor (the site's script ran).",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "kind",
        "siteId",
        "timestamp",
        "path",
        "nodeId",
        "nodeKind",
        "channel",
        "entrance",
        "device",
        "browser",
        "os",
        "navType"
      ],
      "properties": {
        "schemaVersion": {
          "$ref": "#/$defs/SchemaVersion"
        },
        "kind": {
          "type": "string",
          "enum": [
            "pageview"
          ]
        },
        "siteId": {
          "$ref": "#/$defs/Id",
          "description": "WAE index1."
        },
        "timestamp": {
          "$ref": "#/$defs/Timestamp"
        },
        "path": {
          "$ref": "#/$defs/Path",
          "description": "WAE blob3. The published route the view resolved to; never a query string."
        },
        "nodeId": {
          "$ref": "#/$defs/Id",
          "description": "WAE blob4. The page, entry or term the server resolved the path to, so stats survive slug changes."
        },
        "nodeKind": {
          "$ref": "#/$defs/AnalyticsNodeKind"
        },
        "refHost": {
          "$ref": "#/$defs/AnalyticsHostname"
        },
        "channel": {
          "$ref": "#/$defs/AnalyticsChannel"
        },
        "utmSource": {
          "$ref": "#/$defs/AnalyticsUtmValue",
          "description": "WAE blob8."
        },
        "utmMedium": {
          "$ref": "#/$defs/AnalyticsUtmValue",
          "description": "WAE blob9."
        },
        "utmCampaign": {
          "$ref": "#/$defs/AnalyticsUtmValue",
          "description": "WAE blob10."
        },
        "country": {
          "$ref": "#/$defs/AnalyticsCountry"
        },
        "device": {
          "$ref": "#/$defs/AnalyticsDevice"
        },
        "browser": {
          "$ref": "#/$defs/AnalyticsBrowser"
        },
        "os": {
          "$ref": "#/$defs/AnalyticsOs"
        },
        "visitor": {
          "$ref": "#/$defs/AnalyticsVisitorHash"
        },
        "navType": {
          "$ref": "#/$defs/AnalyticsNavType"
        },
        "locale": {
          "$ref": "#/$defs/Locale",
          "description": "WAE blob17. Locale of the resolved node, not the visitor's Accept-Language."
        },
        "entrance": {
          "type": "boolean",
          "description": "WAE double1 (1 or 0). The view starts a visit: the referrer is empty or another site, and the navigation is not a reload, back/forward or restore."
        },
        "privacySignal": {
          "type": "boolean",
          "description": "WAE double10 (1 or 0). The beacon request carried Global Privacy Control (Sec-GPC: 1) or Do Not Track (DNT: 1), so no visitor hash was formed. Only this flag is kept, never which signal or any header. Absent means no signal (and on events written before the field existed)."
        }
      }
    },
    {
      "type": "object",
      "title": "AnalyticsVitalsEvent",
      "description": "Core Web Vitals of one sampled page view, measured by the site's own script and sent when the page is hidden. Code checks that at least one metric is present (the schema subset has no cross-property rules).",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "kind",
        "siteId",
        "timestamp",
        "path",
        "nodeId",
        "nodeKind",
        "device",
        "sampleOneIn"
      ],
      "properties": {
        "schemaVersion": {
          "$ref": "#/$defs/SchemaVersion"
        },
        "kind": {
          "type": "string",
          "enum": [
            "vitals"
          ]
        },
        "siteId": {
          "$ref": "#/$defs/Id",
          "description": "WAE index1."
        },
        "timestamp": {
          "$ref": "#/$defs/Timestamp"
        },
        "path": {
          "$ref": "#/$defs/Path",
          "description": "WAE blob3."
        },
        "nodeId": {
          "$ref": "#/$defs/Id",
          "description": "WAE blob4."
        },
        "nodeKind": {
          "$ref": "#/$defs/AnalyticsNodeKind"
        },
        "country": {
          "$ref": "#/$defs/AnalyticsCountry"
        },
        "device": {
          "$ref": "#/$defs/AnalyticsDevice"
        },
        "browser": {
          "$ref": "#/$defs/AnalyticsBrowser"
        },
        "lcp": {
          "$ref": "#/$defs/AnalyticsMillis",
          "description": "WAE double3. Largest Contentful Paint."
        },
        "inp": {
          "$ref": "#/$defs/AnalyticsMillis",
          "description": "WAE double4. Interaction to Next Paint."
        },
        "cls": {
          "type": "number",
          "description": "WAE double5, stored multiplied by 1000. Cumulative Layout Shift (unitless).",
          "minimum": 0,
          "maximum": 100
        },
        "ttfb": {
          "$ref": "#/$defs/AnalyticsMillis",
          "description": "WAE double6. Time to First Byte."
        },
        "fcp": {
          "$ref": "#/$defs/AnalyticsMillis",
          "description": "WAE double7. First Contentful Paint."
        },
        "sampleOneIn": {
          "$ref": "#/$defs/AnalyticsSampleOneIn"
        }
      }
    },
    {
      "type": "object",
      "title": "AnalyticsRenderEvent",
      "description": "The site Worker answered a request itself (a cache miss, redirect, 404, 410 or error). Cache hits never run the Worker, so these are not page views. The requested path is visitor-controlled text and is always shown as such.",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "kind",
        "siteId",
        "timestamp",
        "path",
        "status",
        "device"
      ],
      "properties": {
        "schemaVersion": {
          "$ref": "#/$defs/SchemaVersion"
        },
        "kind": {
          "type": "string",
          "enum": [
            "render"
          ]
        },
        "siteId": {
          "$ref": "#/$defs/Id",
          "description": "WAE index1."
        },
        "timestamp": {
          "$ref": "#/$defs/Timestamp"
        },
        "path": {
          "$ref": "#/$defs/AnalyticsRequestPath"
        },
        "status": {
          "type": "integer",
          "description": "WAE double2. HTTP status the Worker answered with.",
          "minimum": 100,
          "maximum": 599
        },
        "nodeId": {
          "$ref": "#/$defs/Id",
          "description": "WAE blob4. The node rendered or redirected from, when the path resolved to one."
        },
        "nodeKind": {
          "$ref": "#/$defs/AnalyticsNodeKind"
        },
        "redirectTo": {
          "type": "string",
          "description": "WAE blob19. Target of a 301, 302 or 308: a site path or an https URL, without query string.",
          "pattern": "^(?:/|https://)[!-~]*$",
          "maxLength": 512
        },
        "refHost": {
          "$ref": "#/$defs/AnalyticsHostname"
        },
        "refPath": {
          "$ref": "#/$defs/Path",
          "description": "WAE blob20. Same-site referrers only: the page that linked here, which finds broken internal links."
        },
        "country": {
          "$ref": "#/$defs/AnalyticsCountry"
        },
        "device": {
          "$ref": "#/$defs/AnalyticsDevice"
        },
        "crawler": {
          "$ref": "#/$defs/AnalyticsCrawlerName"
        },
        "renderMs": {
          "$ref": "#/$defs/AnalyticsMillis",
          "description": "WAE double8. Time the Worker spent answering."
        },
        "sampleOneIn": {
          "$ref": "#/$defs/AnalyticsSampleOneIn"
        }
      }
    }
  ],
  "$defs": {
    "AnalyticsBrowser": {
      "type": "string",
      "description": "WAE blob13. Browser family, without version.",
      "enum": [
        "chrome",
        "edge",
        "firefox",
        "safari",
        "samsung",
        "opera",
        "other"
      ]
    },
    "AnalyticsChannel": {
      "type": "string",
      "description": "WAE blob7. Where the view came from, classified by the server from the referrer host and utm_medium; internal = another page of this site.",
      "enum": [
        "direct",
        "internal",
        "search",
        "social",
        "ai",
        "email",
        "paid",
        "referral"
      ]
    },
    "AnalyticsCountry": {
      "type": "string",
      "description": "WAE blob11. ISO 3166-1 alpha-2 country from Cloudflare's request.cf.country (XX unknown, T1 Tor). Never a city or region.",
      "pattern": "^[A-Z][A-Z0-9]$"
    },
    "AnalyticsCrawlerName": {
      "type": "string",
      "description": "WAE blob18. A known crawler identified from the user agent (e.g. googlebot, gptbot, claudebot, perplexitybot). The list and each crawler's class (search, AI, social, monitor) live in code.",
      "pattern": "^[a-z0-9][a-z0-9-]{0,31}$"
    },
    "AnalyticsDevice": {
      "type": "string",
      "description": "WAE blob12. Device class derived from the user agent and client hints, neither of which is stored.",
      "enum": [
        "desktop",
        "mobile",
        "tablet",
        "bot",
        "unknown"
      ]
    },
    "AnalyticsHostname": {
      "type": "string",
      "description": "WAE blob6. Host of an external referrer: lower case, without www., port, path or query.",
      "pattern": "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$",
      "maxLength": 253
    },
    "AnalyticsMillis": {
      "type": "integer",
      "description": "Whole milliseconds (the server rounds), capped at ten minutes.",
      "minimum": 0,
      "maximum": 600000
    },
    "AnalyticsNavType": {
      "type": "string",
      "description": "WAE blob16. How the page was reached; restore = back/forward cache.",
      "enum": [
        "navigate",
        "reload",
        "back_forward",
        "prerender",
        "restore"
      ]
    },
    "AnalyticsNodeKind": {
      "type": "string",
      "description": "WAE blob5. The kind of node the path resolved to.",
      "enum": [
        "page",
        "entry",
        "archive"
      ]
    },
    "AnalyticsOs": {
      "type": "string",
      "description": "WAE blob14. Operating system family, without version.",
      "enum": [
        "windows",
        "macos",
        "ios",
        "android",
        "linux",
        "chromeos",
        "other"
      ]
    },
    "AnalyticsRequestPath": {
      "type": "string",
      "description": "WAE blob3. The requested path as received: percent-encoded printable ASCII, without query string or fragment, cut to 256 characters.",
      "pattern": "^/[!-~]*$",
      "maxLength": 256
    },
    "AnalyticsSampleOneIn": {
      "type": "integer",
      "description": "WAE double9. One in this many events of this kind was recorded (vitals sampling; render events under a flood); 1 = every event. Counts weight each event by this number. An integer, so a rate never suffers rounding.",
      "minimum": 1,
      "maximum": 1000
    },
    "AnalyticsUtmValue": {
      "type": "string",
      "description": "A normalised UTM value: lower case, a small alphabet, at most 64 characters. Values that do not fit are dropped, never stored as free text.",
      "pattern": "^[a-z0-9][a-z0-9._+-]{0,63}$"
    },
    "AnalyticsVisitorHash": {
      "type": "string",
      "description": "WAE blob15. Present only when the site owner turned on unique visitors and the request carried no GPC or DNT signal: the first 64 bits of SHA-256(dailySalt ‖ siteId ‖ ip ‖ userAgent) in hex. The salt is random, lives for one UTC day and is then deleted, so the hash can neither be recomputed nor linked across days.",
      "pattern": "^[0-9a-f]{16}$"
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Locale": {
      "type": "string",
      "description": "BCP 47 language tag, e.g. en, tr, en-US.",
      "pattern": "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
    },
    "Path": {
      "type": "string",
      "description": "Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.",
      "pattern": "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
      "maxLength": 1024
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const AnalyticsBeaconSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/analytics-beacon.schema.json",
  "title": "AnalyticsBeacon",
  "description": "What a site's first-party analytics script sends to POST /__cloudhal/e (RFC-0006): JSON as text/plain, at most 2 KB. Everything in it is untrusted. The server keeps a beacon only after the same-origin, bot and rate checks, normalises the path and resolves it to a published route, reduces the referrer to a host, normalises UTM values, and derives everything else (node, country, device, visitor) itself. The script never sends an identifier, a cookie or a full URL.",
  "oneOf": [
    {
      "type": "object",
      "title": "AnalyticsPageviewBeacon",
      "description": "Sent once per page view, when the page is first visible (after prerendering, and again on a back/forward cache restore).",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "kind",
        "path"
      ],
      "properties": {
        "schemaVersion": {
          "$ref": "#/$defs/SchemaVersion"
        },
        "kind": {
          "type": "string",
          "enum": [
            "pageview"
          ]
        },
        "path": {
          "$ref": "#/$defs/BeaconPath"
        },
        "referrer": {
          "type": "string",
          "description": "The host of document.referrer only (the script drops scheme, path and query); empty or absent for direct visits.",
          "maxLength": 253
        },
        "utmSource": {
          "$ref": "#/$defs/BeaconUtm"
        },
        "utmMedium": {
          "$ref": "#/$defs/BeaconUtm"
        },
        "utmCampaign": {
          "$ref": "#/$defs/BeaconUtm"
        },
        "navType": {
          "type": "string",
          "enum": [
            "navigate",
            "reload",
            "back_forward",
            "prerender",
            "restore"
          ]
        }
      }
    },
    {
      "type": "object",
      "title": "AnalyticsVitalsBeacon",
      "description": "Sent once, when a sampled page view is hidden, with the Core Web Vitals measured so far.",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "kind",
        "path",
        "sampleOneIn"
      ],
      "properties": {
        "schemaVersion": {
          "$ref": "#/$defs/SchemaVersion"
        },
        "kind": {
          "type": "string",
          "enum": [
            "vitals"
          ]
        },
        "path": {
          "$ref": "#/$defs/BeaconPath"
        },
        "lcp": {
          "$ref": "#/$defs/BeaconMillis"
        },
        "inp": {
          "$ref": "#/$defs/BeaconMillis"
        },
        "cls": {
          "type": "number",
          "minimum": 0,
          "maximum": 100
        },
        "ttfb": {
          "$ref": "#/$defs/BeaconMillis"
        },
        "fcp": {
          "$ref": "#/$defs/BeaconMillis"
        },
        "sampleOneIn": {
          "type": "integer",
          "description": "The vitals sampling the script was served with (one page view in N); the server checks it against the site's setting.",
          "minimum": 1,
          "maximum": 1000
        }
      }
    }
  ],
  "$defs": {
    "BeaconMillis": {
      "type": "number",
      "minimum": 0,
      "maximum": 600000
    },
    "BeaconPath": {
      "type": "string",
      "description": "location.pathname as the browser reports it (no query string, no fragment).",
      "pattern": "^/[^?#\\s]*$",
      "maxLength": 1024
    },
    "BeaconUtm": {
      "type": "string",
      "description": "A raw utm_* value from the page URL; the server lower-cases it and drops it unless it fits the stored alphabet.",
      "minLength": 1,
      "maxLength": 128
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    }
  }
} as const;

export const CommentSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/comment.schema.json",
  "title": "Comment",
  "description": "A reader comment on a published content entry, as stored in D1 (outside the site graph), returned to people and agents, and exported (RFC-0007). It is not a graph node: it never enters a snapshot, a diff or a site bundle, and a content rollback never changes it. The record carries no personal data beyond the display name the commenter chose: an email address, an IP address or its hash, a user agent and a proof-of-work challenge live in separate columns and tables that this contract cannot express (additionalProperties: false), so no reader of the contract — Studio lists, MCP tools, exports — can leak them. Text is plain text; renderers escape it and turn only https links into anchors with rel=\"ugc nofollow noopener noreferrer\".",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "nodeId",
    "source",
    "author",
    "status",
    "createdAt",
    "rev"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/CommentId"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "nodeId": {
      "$ref": "#/$defs/Id",
      "description": "The content entry the comment belongs to, by id, so threads survive slug changes (RFC-0002)."
    },
    "parentId": {
      "$ref": "#/$defs/CommentId",
      "description": "The comment this one is nested under for display. Absent for a top-level comment. In v1 the tree is two levels deep: a parent is always top-level, and a reply to a reply is nested under the same top-level comment with `inReplyToId` pointing at the comment it answers."
    },
    "inReplyToId": {
      "$ref": "#/$defs/CommentId",
      "description": "The comment this one answers when that is not `parentId` itself (a reply to a reply). Only with `parentId`, in the same thread."
    },
    "source": {
      "type": "string",
      "description": "Where the comment came from: `native` (the site's own form or Studio), `import` (an importer; see `origin`). `webmention` and `activitypub` are reserved for later RFCs and are refused by v1 writers.",
      "enum": [
        "native",
        "import",
        "webmention",
        "activitypub"
      ]
    },
    "origin": {
      "$ref": "#/$defs/CommentOrigin"
    },
    "author": {
      "$ref": "#/$defs/CommentAuthor"
    },
    "body": {
      "$ref": "#/$defs/CommentBody"
    },
    "status": {
      "$ref": "#/$defs/CommentStatus"
    },
    "labels": {
      "type": "array",
      "description": "Advisory labels from rules, classifiers, agents and people. Labels never change what readers see; only a status change does.",
      "items": {
        "$ref": "#/$defs/CommentLabel"
      },
      "maxItems": 32
    },
    "moderation": {
      "$ref": "#/$defs/CommentModeration"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "editedAt": {
      "$ref": "#/$defs/Timestamp",
      "description": "Set when the text changed after it was first stored (v1.1 edit window; staff replies edited in Studio)."
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "CommentAuthor": {
      "description": "Who wrote the comment, discriminated by `kind`. There is deliberately no email, address or account handle here.",
      "oneOf": [
        {
          "type": "object",
          "title": "GuestCommentAuthor",
          "description": "A guest: only the display name they typed. Guest comments are always held for moderation in v1.",
          "additionalProperties": false,
          "required": [
            "kind",
            "name"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "guest"
              ]
            },
            "name": {
              "$ref": "#/$defs/CommentDisplayName"
            }
          }
        },
        {
          "type": "object",
          "title": "ReaderCommentAuthor",
          "description": "A verified reader (v1.1: email code or magic link on the site's own host). `readerId` is the site's reader account id, never the email.",
          "additionalProperties": false,
          "required": [
            "kind",
            "readerId",
            "name"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "reader"
              ]
            },
            "readerId": {
              "$ref": "#/$defs/Id"
            },
            "name": {
              "$ref": "#/$defs/CommentDisplayName"
            }
          }
        },
        {
          "type": "object",
          "title": "StaffCommentAuthor",
          "description": "A reply on the site's behalf. It is always attributed to a person (`personId` is a staff actor id, `user_…`): an agent may draft the text (`draftedBy`), but a person approved it. `draftedBy` names the agent that drafted the text, when one did (shown in Studio and the audit, not on the public page).",
          "additionalProperties": false,
          "required": [
            "kind",
            "personId",
            "name",
            "badge"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "staff"
              ]
            },
            "personId": {
              "type": "string",
              "description": "The person who wrote or approved the reply.",
              "pattern": "^user_[A-Za-z0-9]{6,32}$"
            },
            "name": {
              "$ref": "#/$defs/CommentDisplayName"
            },
            "badge": {
              "type": "string",
              "description": "What the public page shows next to the name: `author` when the person wrote the entry, otherwise `team`.",
              "enum": [
                "author",
                "team"
              ]
            },
            "draftedBy": {
              "$ref": "#/$defs/Actor"
            }
          }
        },
        {
          "type": "object",
          "title": "ErasedCommentAuthor",
          "description": "The commenter's identity was erased on request (RFC-0007 privacy model). Pages show a localised \"Anonymous\".",
          "additionalProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "erased"
              ]
            }
          }
        }
      ]
    },
    "CommentBody": {
      "type": "object",
      "description": "The comment text. v1 has only `text`: plain text with line breaks, no markup. A later RFC may add a restricted Markdown format. Absent only when the text was deleted (status `deleted`, or an erasure that removed the text); the record then stays as a tombstone while approved replies hang under it.",
      "additionalProperties": false,
      "required": [
        "format",
        "text"
      ],
      "properties": {
        "format": {
          "type": "string",
          "enum": [
            "text"
          ]
        },
        "text": {
          "type": "string",
          "description": "NFC-normalised, CRLF turned into LF, trimmed: 1 to 5,000 characters. Tabs and line feeds are the only control characters allowed; bidirectional overrides are refused so a comment cannot disguise itself in Studio.",
          "minLength": 1,
          "maxLength": 5000,
          "pattern": "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"
        }
      }
    },
    "CommentDisplayName": {
      "type": "string",
      "description": "Plain text chosen by the commenter (or the staff member's name), NFC-normalised and trimmed by the server: 1 to 80 characters, no control characters, no bidirectional overrides, no surrounding whitespace.",
      "minLength": 1,
      "maxLength": 80,
      "pattern": "^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"
    },
    "CommentId": {
      "type": "string",
      "description": "A comment id: `cmt_` and 6 to 32 letters or digits.",
      "pattern": "^cmt_[A-Za-z0-9]{6,32}$"
    },
    "CommentLabel": {
      "type": "object",
      "description": "An advisory label. `rule` labels come from the submission pipeline (word lists, link count, instruction-like text); `classifier` from an opt-in classifier (Workers AI, Akismet); `agent` from `label_comments`; `person` from Studio. `by` is the agent or person that set it (absent for rules and classifiers).",
      "additionalProperties": false,
      "required": [
        "label",
        "source",
        "at"
      ],
      "properties": {
        "label": {
          "type": "string",
          "enum": [
            "spam-suspect",
            "toxic",
            "off-topic",
            "question",
            "needs-reply",
            "praise",
            "personal-data",
            "links",
            "watch-word",
            "instruction-like"
          ]
        },
        "source": {
          "type": "string",
          "enum": [
            "rule",
            "classifier",
            "agent",
            "person"
          ]
        },
        "by": {
          "$ref": "#/$defs/Actor"
        },
        "confidence": {
          "type": "integer",
          "description": "0 to 100, when the source reports one.",
          "minimum": 0,
          "maximum": 100
        },
        "at": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "CommentModeration": {
      "type": "object",
      "description": "The latest moderation decision, kept as a statement of reasons (EU DSA Art. 17). The full history is in `comment_events`. Approvals are always a person's decision; agents may only hide, mark as spam or hold.",
      "additionalProperties": false,
      "required": [
        "action",
        "actor",
        "at",
        "automated"
      ],
      "properties": {
        "action": {
          "type": "string",
          "enum": [
            "approve",
            "hide",
            "spam",
            "hold",
            "restore",
            "delete",
            "erase"
          ]
        },
        "actor": {
          "$ref": "#/$defs/Actor"
        },
        "at": {
          "$ref": "#/$defs/Timestamp"
        },
        "reasonCode": {
          "type": "string",
          "description": "Required by writers for hide, spam, delete and erase.",
          "enum": [
            "spam",
            "abuse",
            "off-topic",
            "personal-data",
            "illegal-content",
            "legal-order",
            "author-request",
            "erasure-request",
            "duplicate",
            "other"
          ]
        },
        "note": {
          "type": "string",
          "description": "Free text from the moderator, plain text, at most 500 characters.",
          "maxLength": 500,
          "pattern": "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"
        },
        "automated": {
          "type": "boolean",
          "description": "True when the decision was taken without a person (an agent, a rule or a ban), as a statement of reasons must say."
        }
      }
    },
    "CommentOrigin": {
      "type": "object",
      "description": "For imported comments: the system and its id, so importers are idempotent.",
      "additionalProperties": false,
      "required": [
        "system",
        "id"
      ],
      "properties": {
        "system": {
          "type": "string",
          "enum": [
            "cloudhal",
            "disqus",
            "wordpress"
          ]
        },
        "id": {
          "type": "string",
          "description": "The comment's id in that system: printable ASCII, at most 200 characters.",
          "minLength": 1,
          "maxLength": 200,
          "pattern": "^[!-~]+$"
        }
      }
    },
    "CommentStatus": {
      "type": "string",
      "description": "Lifecycle. `pending` waits for a person (every guest comment starts here); `approved` is public; `hidden` is withdrawn and reversible; `spam` is never shown and is deleted after the retention period; `deleted` is a soft delete, hard-deleted after the retention period unless approved replies keep it as a tombstone.",
      "enum": [
        "pending",
        "approved",
        "hidden",
        "spam",
        "deleted"
      ]
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const CommentSubmissionSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/comment-submission.schema.json",
  "title": "CommentSubmission",
  "description": "What a browser may send to the site Worker's comment endpoints (RFC-0007): `POST /__cloudhal/comments` (a comment) and `POST /__cloudhal/comments/report` (a report). Forms post application/x-www-form-urlencoded and the comments module posts JSON; the server builds this object from either (the endpoint sets `kind`, the server sets `schemaVersion`) and checks it with the precompiled validator before anything else reads it. Everything in it is untrusted. It is loose where the server normalises (it trims, NFC-normalises and re-checks text against the stored Comment contract) and strict where a browser has no business sending something: there is no field for a status, a site, an author kind, a label, an IP address or anything the server derives itself.",
  "oneOf": [
    {
      "type": "object",
      "title": "CommentPostSubmission",
      "description": "A new comment or a reply.",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "kind",
        "nodeId",
        "name",
        "body"
      ],
      "properties": {
        "schemaVersion": {
          "$ref": "#/$defs/SchemaVersion"
        },
        "kind": {
          "type": "string",
          "enum": [
            "comment"
          ]
        },
        "nodeId": {
          "$ref": "#/$defs/Id",
          "description": "The entry commented on. The server accepts it only for a published entry with an open thread, and works out the page to return to itself."
        },
        "parentId": {
          "$ref": "#/$defs/SubmissionCommentId",
          "description": "The comment replied to; it must be approved and in the same thread. The server decides `parentId`/`inReplyToId` of the stored comment."
        },
        "name": {
          "type": "string",
          "description": "The display name as typed (the form says it is shown publicly).",
          "minLength": 1,
          "maxLength": 200
        },
        "email": {
          "type": "string",
          "description": "Optional and never shown. Kept only for moderation, erasure and export requests (v1.1: reply notifications after double opt-in).",
          "maxLength": 254,
          "pattern": "^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"
        },
        "body": {
          "type": "string",
          "description": "The comment as typed; the server trims and normalises it, then requires 2 to 5,000 characters.",
          "minLength": 1,
          "maxLength": 20000
        },
        "challenge": {
          "$ref": "#/$defs/SubmissionChallenge"
        },
        "solution": {
          "$ref": "#/$defs/SubmissionSolution"
        },
        "turnstileToken": {
          "$ref": "#/$defs/SubmissionTurnstileToken"
        },
        "website": {
          "$ref": "#/$defs/SubmissionHoneypot"
        }
      }
    },
    {
      "type": "object",
      "title": "CommentReportSubmission",
      "description": "A reader's notice that a comment breaks the site's rules or the law (EU DSA Art. 16). A report never hides anything by itself: it puts the comment in front of a person.",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "kind",
        "commentId",
        "reason"
      ],
      "properties": {
        "schemaVersion": {
          "$ref": "#/$defs/SchemaVersion"
        },
        "kind": {
          "type": "string",
          "enum": [
            "report"
          ]
        },
        "commentId": {
          "$ref": "#/$defs/SubmissionCommentId"
        },
        "reason": {
          "type": "string",
          "enum": [
            "spam",
            "abuse",
            "personal-data",
            "illegal-content",
            "other"
          ]
        },
        "details": {
          "type": "string",
          "description": "Why, as typed; at most 1,000 characters after normalising.",
          "maxLength": 4000
        },
        "email": {
          "type": "string",
          "description": "Optional, never shown: where the site may answer the notice.",
          "maxLength": 254,
          "pattern": "^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"
        },
        "challenge": {
          "$ref": "#/$defs/SubmissionChallenge"
        },
        "solution": {
          "$ref": "#/$defs/SubmissionSolution"
        },
        "turnstileToken": {
          "$ref": "#/$defs/SubmissionTurnstileToken"
        },
        "website": {
          "$ref": "#/$defs/SubmissionHoneypot"
        }
      }
    }
  ],
  "$defs": {
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "SubmissionChallenge": {
      "type": "string",
      "description": "The signed proof-of-work challenge from `GET /__cloudhal/comments/challenge`, as issued (base64url segments joined by dots).",
      "minLength": 16,
      "maxLength": 512,
      "pattern": "^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$"
    },
    "SubmissionCommentId": {
      "type": "string",
      "pattern": "^cmt_[A-Za-z0-9]{6,32}$"
    },
    "SubmissionHoneypot": {
      "type": "string",
      "description": "A field people never see. The schema accepts any short value so that a filled honeypot gets the same answer as a real submission (\"held for moderation\") and nothing is stored.",
      "maxLength": 2048
    },
    "SubmissionSolution": {
      "type": "string",
      "description": "The counter that solves the challenge, in decimal.",
      "pattern": "^(?:0|[1-9][0-9]{0,15})$"
    },
    "SubmissionTurnstileToken": {
      "type": "string",
      "description": "Cloudflare Turnstile's response token, when the site turned Turnstile on.",
      "minLength": 1,
      "maxLength": 2048
    }
  }
} as const;

export const ReleaseSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/release.schema.json",
  "title": "Release",
  "description": "A scheduled content change set (RFC-0008): node versions pinned by id, rev and content hash, applied on top of whatever is live at the release's time. A single scheduled publish is a one-item release. Each item records the version that was live when the release was pinned (`base`); if a pinned node or its live base changed before the release runs, the release is held as a conflict instead of overwriting anything. A person's approval is bound to `hash` (`rl1:`), which digests the items only, so a person may move an approved release without re-approving it while an agent's move or any content change voids the approval. Releases live in D1 next to the graph; they are not graph nodes, never enter a snapshot and are not part of site bundles.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "items",
    "state",
    "hash",
    "createdBy",
    "createdAt",
    "updatedAt",
    "rev"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/ReleaseId"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "title": {
      "type": "string",
      "description": "Optional name shown in Studio (\"Election night\"). A one-item release without a title is shown under its entry's or page's title.",
      "minLength": 1,
      "maxLength": 200,
      "pattern": "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"
    },
    "items": {
      "type": "array",
      "description": "The pinned changes, at most one per node. A release never contains the site node: site settings, domains and structure are published the ordinary way.",
      "items": {
        "$ref": "#/$defs/ReleaseItem"
      },
      "minItems": 1,
      "maxItems": 100
    },
    "when": {
      "$ref": "#/$defs/ReleaseWhen"
    },
    "state": {
      "$ref": "#/$defs/ReleaseState"
    },
    "hash": {
      "$ref": "#/$defs/ReleaseHash"
    },
    "approval": {
      "$ref": "#/$defs/ReleaseApproval"
    },
    "outcome": {
      "$ref": "#/$defs/ReleaseOutcome"
    },
    "createdBy": {
      "$ref": "#/$defs/Actor"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "Actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "id"
      ],
      "properties": {
        "kind": {
          "$ref": "#/$defs/ActorKind"
        },
        "id": {
          "$ref": "#/$defs/Id"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ActorKind": {
      "type": "string",
      "description": "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.",
      "enum": [
        "human",
        "agent",
        "system"
      ]
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "LocalDateTime": {
      "type": "string",
      "description": "A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).",
      "pattern": "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "ReleaseApproval": {
      "description": "Why the release may run, discriminated by `kind`.",
      "oneOf": [
        {
          "type": "object",
          "title": "ReleasePersonApproval",
          "description": "A person approved these items (bound to `hash`) for `executeAt`, either by deciding an agent's request (`approvalId`) or by scheduling it themselves. The person's rights are checked again when the release runs.",
          "additionalProperties": false,
          "required": [
            "kind",
            "by",
            "at"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "person"
              ]
            },
            "by": {
              "$ref": "#/$defs/ReleasePerson"
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "executeAt": {
              "$ref": "#/$defs/Timestamp"
            },
            "approvalId": {
              "$ref": "#/$defs/Id"
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseAutoApproval",
          "description": "An agent key in `auto` mode scheduled a low-risk release without a person (ADR-0015). Valid only while the release runs before `windowEnds`: the end of the key's elevation, or 24 hours after scheduling, whichever comes first.",
          "additionalProperties": false,
          "required": [
            "kind",
            "by",
            "keyId",
            "at",
            "windowEnds"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "auto"
              ]
            },
            "by": {
              "$ref": "#/$defs/Actor"
            },
            "keyId": {
              "type": "string",
              "pattern": "^[A-Za-z0-9_-]{6,64}$"
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "windowEnds": {
              "$ref": "#/$defs/Timestamp"
            }
          }
        }
      ]
    },
    "ReleaseConflict": {
      "type": "object",
      "description": "A node whose live version was not the pinned base when the release ran. `expected` absent: the node was not expected to be live; `found` absent: it was not live.",
      "additionalProperties": false,
      "required": [
        "nodeId"
      ],
      "properties": {
        "nodeId": {
          "$ref": "#/$defs/Id"
        },
        "expected": {
          "$ref": "#/$defs/ReleaseNodeVersion"
        },
        "found": {
          "$ref": "#/$defs/ReleaseNodeVersion"
        }
      }
    },
    "ReleaseHash": {
      "type": "string",
      "description": "`rl1:` and the lower-case hex SHA-256 of the release's canonical item lines (site id, then one line per item sorted by node id: kind, node id, target and base versions). The prefix keeps it apart from the graph state hash and from comment bindings (`cm1:`); approvals store it as their state.",
      "pattern": "^rl1:[0-9a-f]{64}$"
    },
    "ReleaseId": {
      "type": "string",
      "description": "A release id: `rel_` and 6 to 32 letters or digits.",
      "pattern": "^rel_[A-Za-z0-9]{6,32}$"
    },
    "ReleaseItem": {
      "description": "One pinned change, discriminated by `kind`.",
      "oneOf": [
        {
          "type": "object",
          "title": "ReleaseSetItem",
          "description": "Make `target` the live version of the node. `base` is the version that was live when the item was pinned; absent when the node was not live (a new entry or page).",
          "additionalProperties": false,
          "required": [
            "kind",
            "nodeId",
            "nodeKind",
            "target"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "set"
              ]
            },
            "nodeId": {
              "$ref": "#/$defs/Id"
            },
            "nodeKind": {
              "$ref": "#/$defs/ReleaseNodeKind"
            },
            "target": {
              "$ref": "#/$defs/ReleaseNodeVersion"
            },
            "base": {
              "$ref": "#/$defs/ReleaseNodeVersion"
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseRemoveItem",
          "description": "Take the node out of the live snapshot. `base` is the live version that is removed.",
          "additionalProperties": false,
          "required": [
            "kind",
            "nodeId",
            "nodeKind",
            "base"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "remove"
              ]
            },
            "nodeId": {
              "$ref": "#/$defs/Id"
            },
            "nodeKind": {
              "$ref": "#/$defs/ReleaseNodeKind"
            },
            "base": {
              "$ref": "#/$defs/ReleaseNodeVersion"
            }
          }
        }
      ]
    },
    "ReleaseNodeKind": {
      "type": "string",
      "description": "Kinds of graph node a release may carry. The site node is never one of them.",
      "enum": [
        "page",
        "contentEntry",
        "taxonomy",
        "term",
        "redirect",
        "menu",
        "asset"
      ]
    },
    "ReleaseNodeVersion": {
      "type": "object",
      "description": "One version of a node: its revision and the SHA-256 of its canonical JSON, whose body the blob store keeps under `nodes/<hash>.json`.",
      "additionalProperties": false,
      "required": [
        "rev",
        "hash"
      ],
      "properties": {
        "rev": {
          "$ref": "#/$defs/Revision"
        },
        "hash": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$"
        }
      }
    },
    "ReleaseOutcome": {
      "description": "What happened when the release was due, discriminated by `kind` (it matches the terminal `state`).",
      "oneOf": [
        {
          "type": "object",
          "title": "ReleasePublishedOutcome",
          "description": "Applied: `snapshotId` is the new live snapshot (reason `scheduled`), composed from `baseSnapshotId` and the items. `purge` says how the edge cache followed.",
          "additionalProperties": false,
          "required": [
            "kind",
            "runId",
            "at",
            "snapshotId",
            "baseSnapshotId",
            "latenessSeconds",
            "purge"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "published"
              ]
            },
            "runId": {
              "$ref": "#/$defs/Id"
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "snapshotId": {
              "$ref": "#/$defs/Id"
            },
            "baseSnapshotId": {
              "$ref": "#/$defs/Id"
            },
            "latenessSeconds": {
              "type": "integer",
              "minimum": 0
            },
            "purge": {
              "type": "string",
              "enum": [
                "tags",
                "everything",
                "deferred",
                "failed",
                "none"
              ]
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseConflictOutcome",
          "description": "Held: these nodes changed since the release was pinned. Nothing was published.",
          "additionalProperties": false,
          "required": [
            "kind",
            "at",
            "conflicts"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "conflict"
              ]
            },
            "runId": {
              "$ref": "#/$defs/Id"
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "conflicts": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/ReleaseConflict"
              },
              "minItems": 1,
              "maxItems": 100
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseFailedOutcome",
          "description": "Refused at run time; nothing was published.",
          "additionalProperties": false,
          "required": [
            "kind",
            "at",
            "code"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "failed"
              ]
            },
            "runId": {
              "$ref": "#/$defs/Id"
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "code": {
              "type": "string",
              "enum": [
                "dependency_missing",
                "invalid_snapshot",
                "site_missing",
                "node_body_missing",
                "store_error"
              ]
            },
            "message": {
              "type": "string",
              "maxLength": 500,
              "pattern": "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseMissedOutcome",
          "description": "The scheduler reached the release more than an hour after its time; nothing was published. A person may publish it now.",
          "additionalProperties": false,
          "required": [
            "kind",
            "at",
            "latenessSeconds"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "missed"
              ]
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "latenessSeconds": {
              "type": "integer",
              "minimum": 0
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseExpiredOutcome",
          "description": "No valid approval when the release was due: never approved, the approver can no longer publish it, the agent's `auto` window ended, or its creator left.",
          "additionalProperties": false,
          "required": [
            "kind",
            "at",
            "reason"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "expired"
              ]
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "reason": {
              "type": "string",
              "enum": [
                "unapproved",
                "approval_lost",
                "auto_window_ended",
                "creator_removed"
              ]
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseCanceledOutcome",
          "description": "Withdrawn by a person or an agent; its nodes are unlocked.",
          "additionalProperties": false,
          "required": [
            "kind",
            "at",
            "by"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "canceled"
              ]
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "by": {
              "$ref": "#/$defs/Actor"
            }
          }
        }
      ]
    },
    "ReleasePerson": {
      "type": "object",
      "description": "A staff person (`user_…`). Agents never appear here.",
      "additionalProperties": false,
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^user_[A-Za-z0-9]{6,32}$"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "ReleaseState": {
      "type": "string",
      "description": "Lifecycle. `draft`: proposed or being assembled, nothing locked. `awaiting_approval`: waiting for a person; its nodes are locked. `scheduled`: approved (or allowed by `auto` mode) and locked until it runs. `running`: claimed by the scheduler. `published`: applied; `outcome` names the snapshot. `conflict`: a pinned node or its live base changed; held, nothing published. `missed`: the scheduler reached it more than an hour late; nothing published. `expired`: no valid approval at its time. `failed`: refused at run time (e.g. a dependency is missing). `canceled`: withdrawn.",
      "enum": [
        "draft",
        "awaiting_approval",
        "scheduled",
        "running",
        "published",
        "conflict",
        "missed",
        "expired",
        "failed",
        "canceled"
      ]
    },
    "ReleaseWhen": {
      "description": "When the release runs, discriminated by `kind`. Absent while a draft has no time yet.",
      "oneOf": [
        {
          "type": "object",
          "title": "ReleaseAt",
          "description": "At an instant. `at` is what the scheduler compares with the clock; when a person entered a wall-clock time, `localTime` keeps it and `at` is recomputed from it and `timeZone` before the release runs, never earlier than the wall-clock time.",
          "additionalProperties": false,
          "required": [
            "kind",
            "at",
            "timeZone"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "at"
              ]
            },
            "at": {
              "$ref": "#/$defs/Timestamp"
            },
            "timeZone": {
              "$ref": "#/$defs/TimeZone"
            },
            "localTime": {
              "$ref": "#/$defs/LocalDateTime"
            }
          }
        },
        {
          "type": "object",
          "title": "ReleaseOnApproval",
          "description": "As soon as it is approved (a gate-only change such as setting an expiry on live content, or \"publish when approved\").",
          "additionalProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "on-approval"
              ]
            }
          }
        }
      ]
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    },
    "TimeZone": {
      "type": "string",
      "description": "IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.",
      "pattern": "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$",
      "maxLength": 64
    }
  }
} as const;

export const AutomationSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/automation.schema.json",
  "title": "Automation",
  "description": "A recurring job on a site (RFC-0008), created by a person in Studio: either a built-in deterministic job that Cloudhal runs itself (reports, findings and notifications; it never publishes), or a scheduled agent task that an external agent picks up over MCP with the automation's own key, inside a run window, under a mode cap and budgets. No language model runs inside Cloudhal. Scheduling never grants rights: every call of a task runs with the key's scopes narrowed to its owner's current role. Automations live in D1 next to the graph; they are not graph nodes and are not part of site bundles.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "name",
    "job",
    "recurrence",
    "state",
    "consecutiveFailures",
    "owner",
    "createdAt",
    "updatedAt",
    "rev"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/AutomationId"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120,
      "pattern": "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"
    },
    "job": {
      "$ref": "#/$defs/AutomationJob"
    },
    "recurrence": {
      "$ref": "#/$defs/AutomationRecurrence"
    },
    "state": {
      "$ref": "#/$defs/AutomationState"
    },
    "pausedReason": {
      "type": "string",
      "description": "Why the automation is not `active`: a person paused it; its agent paused it; three consecutive failures; a run exceeded its budget; the site's kill switch; its key was revoked; its owner left or no longer holds the scopes it needs.",
      "enum": [
        "person",
        "agent",
        "failures",
        "budget",
        "kill-switch",
        "key-revoked",
        "owner-removed",
        "role-changed"
      ]
    },
    "consecutiveFailures": {
      "type": "integer",
      "minimum": 0
    },
    "owner": {
      "$ref": "#/$defs/AutomationOwner"
    },
    "nextRunAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    },
    "metadata": {
      "$ref": "#/$defs/Metadata"
    }
  },
  "$defs": {
    "AutomationBudget": {
      "type": "object",
      "description": "Per-run limits Cloudhal counts and enforces for an agent task: tool calls, mutations, approval requests filed and minutes since the run began. Exceeding one ends the run (`budget-exceeded`) and pauses the automation.",
      "additionalProperties": false,
      "required": [
        "maxToolCalls",
        "maxWrites",
        "maxApprovalRequests",
        "maxMinutes"
      ],
      "properties": {
        "maxToolCalls": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500
        },
        "maxWrites": {
          "type": "integer",
          "minimum": 0,
          "maximum": 200
        },
        "maxApprovalRequests": {
          "type": "integer",
          "minimum": 0,
          "maximum": 20
        },
        "maxMinutes": {
          "type": "integer",
          "minimum": 1,
          "maximum": 240
        }
      }
    },
    "AutomationId": {
      "type": "string",
      "description": "An automation id: `aut_` and 6 to 32 letters or digits.",
      "pattern": "^aut_[A-Za-z0-9]{6,32}$"
    },
    "AutomationJob": {
      "description": "What runs, discriminated by `kind`.",
      "oneOf": [
        {
          "type": "object",
          "title": "BuiltinAutomationJob",
          "description": "A deterministic job Cloudhal runs itself, in bounded steps. Its outputs are findings, reports and Studio notifications; it never changes or publishes content.",
          "additionalProperties": false,
          "required": [
            "kind",
            "builtin"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "builtin"
              ]
            },
            "builtin": {
              "type": "string",
              "enum": [
                "broken-links",
                "stale-content",
                "feed-check",
                "weekly-digest",
                "cleanup"
              ]
            },
            "staleAfterDays": {
              "type": "integer",
              "description": "`stale-content` only: entries not updated for this many days are listed for review.",
              "minimum": 30,
              "maximum": 1095
            }
          }
        },
        {
          "type": "object",
          "title": "AgentTaskAutomationJob",
          "description": "A task an external agent performs over MCP. At each occurrence a run window opens for `windowMinutes`; the automation's key (`keyId`, owned by the automation's owner) is valid only inside an open run, which the agent starts with `begin_run` and ends with `end_run`. The run's mode is the key's effective mode capped by `modeCap`; it never waits for a person: calls that need one leave an approval request and the run ends. `readsUntrustedText` declares that the task reads visitor-supplied text (comments, 404 paths, fetched pages); such an automation's key cannot hold write scopes, and any run that reads such text is limited to reading, labelling and hiding from then on.",
          "additionalProperties": false,
          "required": [
            "kind",
            "keyId",
            "instructions",
            "modeCap",
            "readsUntrustedText",
            "windowMinutes",
            "budget"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "agent-task"
              ]
            },
            "keyId": {
              "type": "string",
              "pattern": "^[A-Za-z0-9_-]{6,64}$"
            },
            "instructions": {
              "type": "string",
              "description": "What the owner asks the agent to do, shown to the agent by `begin_run`. Plain text.",
              "minLength": 1,
              "maxLength": 2000,
              "pattern": "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"
            },
            "skill": {
              "type": "string",
              "description": "A skill the run declares (its scopes and approval list narrow the run further).",
              "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
              "maxLength": 64
            },
            "modeCap": {
              "type": "string",
              "description": "The most autonomous mode a run may use; never `bypass`.",
              "enum": [
                "plan",
                "manual",
                "edits",
                "auto"
              ]
            },
            "readsUntrustedText": {
              "type": "boolean"
            },
            "windowMinutes": {
              "type": "integer",
              "minimum": 5,
              "maximum": 240
            },
            "budget": {
              "$ref": "#/$defs/AutomationBudget"
            }
          }
        }
      ]
    },
    "AutomationOwner": {
      "type": "object",
      "description": "The person who created the automation and owns its key (`user_…`). Agents never own automations.",
      "additionalProperties": false,
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^user_[A-Za-z0-9]{6,32}$"
        },
        "name": {
          "type": "string",
          "maxLength": 200
        }
      }
    },
    "AutomationRecurrence": {
      "type": "object",
      "description": "When the automation runs: the first occurrence as a wall-clock time in `timeZone`, repeated by `rule` (absent: once). Occurrences are computed in the zone, so \"Mondays 09:07\" stays 09:07 across daylight-saving changes; a time that does not exist on a given day (a spring-forward gap) runs at the next valid minute, and a time that occurs twice runs once, at the first (a documented deviation from RFC 5545 §3.3.10, which drops such occurrences). `preset` records which Studio choice produced the rule.",
      "additionalProperties": false,
      "required": [
        "start",
        "timeZone",
        "preset"
      ],
      "properties": {
        "start": {
          "$ref": "#/$defs/LocalDateTime"
        },
        "timeZone": {
          "$ref": "#/$defs/TimeZone"
        },
        "rule": {
          "$ref": "#/$defs/AutomationRule"
        },
        "preset": {
          "type": "string",
          "enum": [
            "once",
            "hourly",
            "daily",
            "weekdays",
            "weekly",
            "monthly",
            "custom"
          ]
        }
      }
    },
    "AutomationRule": {
      "type": "string",
      "description": "The recurrence as an RFC 5545 RRULE value in Cloudhal's subset, without the `RRULE:` prefix: FREQ DAILY, WEEKLY or MONTHLY; INTERVAL; BYDAY (ordinals such as 2TU or -1FR only with MONTHLY); BYMONTHDAY (1–31 or -1); BYHOUR; BYMINUTE; COUNT or UNTIL. The pattern bounds the vocabulary; the parser refuses repeated parts, COUNT with UNTIL, ordinals outside MONTHLY and runs closer than the job's minimum interval.",
      "maxLength": 300,
      "pattern": "^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$"
    },
    "AutomationState": {
      "type": "string",
      "description": "`active` runs on its recurrence; `paused` and `auto-paused` (by failures or a budget) wait for a person to resume; `broken` needs a person to repair it (key revoked, owner gone); `ended` reached its COUNT or UNTIL.",
      "enum": [
        "active",
        "paused",
        "auto-paused",
        "broken",
        "ended"
      ]
    },
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "LocalDateTime": {
      "type": "string",
      "description": "A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).",
      "pattern": "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
    },
    "Metadata": {
      "type": "object",
      "description": "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).",
      "additionalProperties": {
        "type": "string"
      }
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    },
    "TimeZone": {
      "type": "string",
      "description": "IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.",
      "pattern": "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$",
      "maxLength": 64
    }
  }
} as const;

export const ScheduleRunSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cloudhal.dev/schemas/v1/schedule-run.schema.json",
  "title": "ScheduleRun",
  "description": "One occurrence of something scheduled (RFC-0008): a release's execution or an automation's run. Its id is derived from the subject and `occurrenceAt`, so a second scheduler tick that reaches the same occurrence finds the same row and the effect happens at most once. `state` says whether the run itself completed; `outcome` says whether it did any work, because a run that ended cleanly may still have done nothing. Runs live in D1 and are kept 90 days; the audit log keeps what each call did.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "id",
    "siteId",
    "subject",
    "occurrenceAt",
    "state",
    "attempt",
    "createdAt",
    "updatedAt",
    "rev"
  ],
  "properties": {
    "schemaVersion": {
      "$ref": "#/$defs/SchemaVersion"
    },
    "id": {
      "$ref": "#/$defs/ScheduleRunId"
    },
    "siteId": {
      "$ref": "#/$defs/Id"
    },
    "subject": {
      "$ref": "#/$defs/ScheduleRunSubject"
    },
    "occurrenceAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "state": {
      "$ref": "#/$defs/ScheduleRunState"
    },
    "outcome": {
      "type": "string",
      "description": "What the run achieved, separately from whether it completed: `did-work` changed something or produced findings; `nothing-to-do`; `proposed` left drafts or proposals for people; `waiting-approval` filed requests a person must decide.",
      "enum": [
        "did-work",
        "nothing-to-do",
        "proposed",
        "waiting-approval"
      ]
    },
    "trigger": {
      "type": "string",
      "description": "What woke the scheduler: the every-minute cron trigger, the Durable Object clock's alarm, an admin request (backstop), the Node timer, or a person (\"Run now\", \"Publish now\").",
      "enum": [
        "cron",
        "alarm",
        "request",
        "node",
        "manual"
      ]
    },
    "attempt": {
      "type": "integer",
      "minimum": 1
    },
    "startedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "endedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "latenessSeconds": {
      "type": "integer",
      "minimum": 0
    },
    "adjusted": {
      "type": "string",
      "description": "The occurrence was moved: `dst-gap` (the wall-clock time did not exist that day, so it ran at the next valid minute) or `tzdata` (the zone's rules changed after it was planned).",
      "enum": [
        "dst-gap",
        "tzdata"
      ]
    },
    "window": {
      "$ref": "#/$defs/ScheduleRunWindow"
    },
    "usage": {
      "$ref": "#/$defs/ScheduleRunUsage"
    },
    "taint": {
      "$ref": "#/$defs/ScheduleRunTaint"
    },
    "summary": {
      "type": "string",
      "description": "The agent's own account of the run (`end_run`) or the built-in job's report line. Plain text written by an agent: Studio renders it as text and never as an instruction.",
      "maxLength": 2000,
      "pattern": "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"
    },
    "counts": {
      "type": "object",
      "description": "Findings by name (e.g. `broken-links`, `stale-entries`, `proposals`).",
      "propertyNames": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]{0,40}$"
      },
      "maxProperties": 20,
      "additionalProperties": {
        "type": "integer",
        "minimum": 0
      }
    },
    "approvalIds": {
      "type": "array",
      "description": "Approval requests the run filed.",
      "items": {
        "$ref": "#/$defs/Id"
      },
      "uniqueItems": true,
      "maxItems": 50
    },
    "error": {
      "$ref": "#/$defs/ScheduleRunError"
    },
    "createdAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "updatedAt": {
      "$ref": "#/$defs/Timestamp"
    },
    "rev": {
      "$ref": "#/$defs/Revision"
    }
  },
  "$defs": {
    "Id": {
      "type": "string",
      "description": "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.",
      "pattern": "^[a-z]+_[A-Za-z0-9]{6,32}$",
      "minLength": 8,
      "maxLength": 48
    },
    "Revision": {
      "type": "integer",
      "description": "Monotonic per-node revision used for optimistic locking (compare-and-swap on write).",
      "minimum": 0
    },
    "ScheduleRunError": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "code"
      ],
      "properties": {
        "code": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_]{0,63}$"
        },
        "message": {
          "type": "string",
          "maxLength": 500,
          "pattern": "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"
        }
      }
    },
    "ScheduleRunId": {
      "type": "string",
      "description": "A run id: `run_` and 6 to 32 letters or digits, derived from the subject id and `occurrenceAt` (the occurrence's idempotency key).",
      "pattern": "^run_[A-Za-z0-9]{6,32}$"
    },
    "ScheduleRunState": {
      "type": "string",
      "description": "`due`: claimed occurrence not started yet; `ready`: an agent task's window is open and waits for `begin_run`; `running`; `succeeded`; `failed`; `missed`: the window closed or the scheduler came too late; `skipped`: a missed occurrence coalesced into a later one; `budget-exceeded`; `killed`: stopped by a pause or a kill switch.",
      "enum": [
        "due",
        "ready",
        "running",
        "succeeded",
        "failed",
        "missed",
        "skipped",
        "budget-exceeded",
        "killed"
      ]
    },
    "ScheduleRunSubject": {
      "description": "What ran, discriminated by `kind`.",
      "oneOf": [
        {
          "type": "object",
          "title": "ReleaseRunSubject",
          "additionalProperties": false,
          "required": [
            "kind",
            "releaseId"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "release"
              ]
            },
            "releaseId": {
              "type": "string",
              "pattern": "^rel_[A-Za-z0-9]{6,32}$"
            }
          }
        },
        {
          "type": "object",
          "title": "AutomationRunSubject",
          "additionalProperties": false,
          "required": [
            "kind",
            "automationId",
            "job"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "automation"
              ]
            },
            "automationId": {
              "type": "string",
              "pattern": "^aut_[A-Za-z0-9]{6,32}$"
            },
            "job": {
              "type": "string",
              "enum": [
                "builtin",
                "agent-task"
              ]
            }
          }
        }
      ]
    },
    "ScheduleRunTaint": {
      "type": "object",
      "description": "The run read visitor-supplied text at `at` through `tool`; from then on it may only read, label, hide and pause.",
      "additionalProperties": false,
      "required": [
        "at",
        "tool"
      ],
      "properties": {
        "at": {
          "$ref": "#/$defs/Timestamp"
        },
        "tool": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_]{0,63}$"
        }
      }
    },
    "ScheduleRunUsage": {
      "type": "object",
      "description": "What the run used against its budget, counted by the server.",
      "additionalProperties": false,
      "required": [
        "toolCalls",
        "writes",
        "approvalRequests"
      ],
      "properties": {
        "toolCalls": {
          "type": "integer",
          "minimum": 0
        },
        "writes": {
          "type": "integer",
          "minimum": 0
        },
        "approvalRequests": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "ScheduleRunWindow": {
      "type": "object",
      "description": "An agent task's run window: the automation's key is valid only between `opensAt` and `closesAt`, and only inside a run it began.",
      "additionalProperties": false,
      "required": [
        "opensAt",
        "closesAt"
      ],
      "properties": {
        "opensAt": {
          "$ref": "#/$defs/Timestamp"
        },
        "closesAt": {
          "$ref": "#/$defs/Timestamp"
        }
      }
    },
    "SchemaVersion": {
      "type": "integer",
      "description": "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.",
      "enum": [
        1
      ]
    },
    "Timestamp": {
      "type": "string",
      "description": "RFC 3339 / ISO 8601 instant in UTC.",
      "format": "date-time"
    }
  }
} as const;

export const schemas = {
  "project": ProjectSchema,
  "site": SiteSchema,
  "page": PageSchema,
  "section": SectionSchema,
  "content-entry": ContentEntrySchema,
  "snapshot": SnapshotSchema,
  "skill-manifest": SkillManifestSchema,
  "taxonomy": TaxonomySchema,
  "term": TermSchema,
  "redirect": RedirectSchema,
  "asset": AssetSchema,
  "menu": MenuSchema,
  "analytics-event": AnalyticsEventSchema,
  "analytics-beacon": AnalyticsBeaconSchema,
  "comment": CommentSchema,
  "comment-submission": CommentSubmissionSchema,
  "release": ReleaseSchema,
  "automation": AutomationSchema,
  "schedule-run": ScheduleRunSchema,
} as const;
