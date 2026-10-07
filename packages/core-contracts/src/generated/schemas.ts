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
    "Slug": {
      "type": "string",
      "description": "Lower-case URL segment.",
      "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      "minLength": 1,
      "maxLength": 128
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
    "ImageRef": {
      "type": "object",
      "description": "Reference to a media asset. src may be a relative asset path or an absolute URL.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
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
            }
          }
        }
      ]
    },
    "Seo": {
      "type": "object",
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
    "ImageRef": {
      "type": "object",
      "description": "Reference to a media asset. src may be a relative asset path or an absolute URL.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
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
      "items": {
        "$ref": "#/$defs/Slug"
      },
      "uniqueItems": true,
      "maxItems": 50
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
      "description": "Reference to a media asset. src may be a relative asset path or an absolute URL.",
      "additionalProperties": false,
      "required": [
        "src",
        "alt"
      ],
      "properties": {
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
            "contentEntry"
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

export const schemas = {
  "project": ProjectSchema,
  "site": SiteSchema,
  "page": PageSchema,
  "section": SectionSchema,
  "content-entry": ContentEntrySchema,
  "snapshot": SnapshotSchema,
  "skill-manifest": SkillManifestSchema,
} as const;
