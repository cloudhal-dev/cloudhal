/**
 * English `menus.*`, a lazy message namespace (`../namespaces.ts`, DESIGN.md §1): menus and
 * the navigation editor, menu items, saving with a summary, and menu references from pages,
 * articles and terms (RFC-0003), loaded with the routes that show them. The source of truth for
 * its keys; `menus.tr.ts` is typed against it.
 */
export const messages = {
  menus: {
    places: { primary: "Header", footer: "Footer", sidebar: "Sidebar" },
    placeWithKey: "{place} ({key})",
    newMenu: "New menu",
    depthOne: "1 level",
    depthMany: "{count} levels",
    saved: "{name} saved",
    created: "{name} menu created",
    deleted: "{name} menu deleted",
    readOnly: {
      title: "You can look, but not change",
      description:
        "Menus appear on every page, so only Editors and above change them. Ask one of them, or an Administrator, to make the change.",
    },
    conflict: {
      title: "This menu changed somewhere else",
      description:
        "Someone saved {name} after you started editing. Your edits are still here: compare them with the latest version and save again, or load the latest and drop yours.",
      keep: "Compare with latest",
      reload: "Load latest",
    },
    problems: {
      title: "This menu can't be saved yet",
      emptyGroup: "“{label}” is a group with nothing in it. Add an item under it or remove it.",
      label:
        "“{label}” needs a label: groups, collections and external links have no title of their own.",
      depth:
        "“{label}” sits deeper than this menu's {max} levels. Move it up or allow more levels in Settings.",
      perLevel: "One level holds more than {max} items.",
      total: "This menu holds more than {max} items.",
    },
    items: {
      title: "{place} items",
      titleLoading: "Items",
      add: "Add item",
      count: "{count} / {limit}",
      countHint: "Items at every level. A menu holds at most {limit}.",
      description:
        "Drag the handle, or select an item and use Alt with the arrow keys: up and down reorder, right nests it under the item above, left moves it out. This menu goes {max} levels deep.",
      descriptionReadOnly: "The items as visitors get them after the next publish.",
      empty: "No items yet",
      emptyDescription: {
        primary:
          "An empty header shows no links on your site. Add pages, articles, categories, collections, external links or groups.",
        footer:
          "An empty footer shows no links. Add pages, articles, categories, collections, external links or groups.",
        custom: "Add pages, articles, categories, collections, external links or groups.",
      },
    },
    tree: {
      label: "{place} items",
      instructions:
        "Arrow keys move between items; Right and Left open and close an item. Alt with Up or Down moves the item, Alt with Right nests it under the item above, Alt with Left moves it out one level. Enter edits, Delete removes.",
      expand: "Show items under {label}",
      collapse: "Hide items under {label}",
      topLevel: "top level",
      under: "under {parent}, level {level}",
      moved: "{label} moved: position {position} of {total}, {where}.",
      indented: "{label} nested: position {position} of {total}, {where}.",
      outdented: "{label} moved out: position {position} of {total}, {where}.",
      blocked: {
        first: "{label} is already first.",
        last: "{label} is already last.",
        "no-previous": "{label} has no item above it to go under.",
        "top-level": "{label} is already at the top level.",
        depth: "{label} can't go deeper: this menu has at most {max} levels.",
        size: "That level is full.",
      },
      refused: {
        depth: "{label} can't go there: this menu has at most {max} levels.",
        size: "{label} can't go there: that level is full.",
        "inside-itself": "{label} can't go inside itself.",
      },
    },
    hint: {
      page: "from the page title",
      contentEntry: "from the article title",
      term: "from the term's name",
    },
    chips: {
      page: "Page {where}",
      contentEntry: "Article {where}",
      term: "{taxonomy} {name}",
      termFallback: "Term",
      collection: "Collection {where}",
      url: "External {where} ↗",
      group: "Group",
      newTab: "(opens in a new tab)",
      missing: {
        page: "Deleted page",
        contentEntry: "Deleted article",
        term: "Deleted term",
      },
    },
    hidden: {
      badge: "Hidden: {reason}",
      bannerOne: "1 item is hidden on your site",
      banner: "{count} items are hidden on your site",
      bannerDescription:
        "Visitors don't see a hidden item or anything under it, so your menus never link to a page that's gone. Use Fix to point it somewhere else or remove it.",
      reasons: {
        missing: { page: "page deleted", contentEntry: "article deleted", term: "term deleted" },
        unpublished: {
          page: "page not published",
          contentEntry: "article not published",
          term: "not published",
        },
        "other-locale": "other language",
        "not-served": "archive empty or not public",
        retired: "term retired",
        "no-index": "no page lists it",
        "empty-group": "nothing inside is shown",
        "parent-hidden": "item above is hidden",
      },
      explain: {
        missing: {
          page: "The page was deleted. The item stays in the menu, hidden, until you choose another target or remove it.",
          contentEntry:
            "The article was deleted. The item stays in the menu, hidden, until you choose another target or remove it.",
          term: "The term was deleted. The item stays in the menu, hidden, until you choose another target or remove it.",
        },
        unpublished: {
          page: "The page isn't published yet. The item shows up on its own once it is.",
          contentEntry: "The article isn't published yet. The item shows up on its own once it is.",
          term: "The term isn't published yet.",
        },
        "other-locale": "The target is in another language than this menu's preview.",
        "not-served":
          "Its archive isn't served: it has no published articles yet, isn't public, or archives are off.",
        retired: "The term was retired. Point the item at the term that replaced it.",
        "no-index": "No page lists this collection, so there's nowhere to link to.",
        "empty-group": "None of the items in this group is shown, so the group is hidden too.",
        "parent-hidden": "An item above it is hidden, and it hides everything under it.",
      },
    },
    row: {
      noLabel: "No label",
      edit: "Edit",
      editLabel: "Edit {label}",
      menu: "More actions",
      menuLabel: "More actions for {label}",
      fix: "Fix",
      retarget: "Choose another target…",
      addInside: "Add item inside",
      addInsideLimit:
        "Items here are already at the deepest level this menu allows ({max}). Allow more levels in Settings to nest further.",
      moveUp: "Move up",
      moveDown: "Move down",
      indent: "Move under the item above",
      indentLimit:
        "This menu goes {max} levels deep. Allow more levels in Settings to nest further.",
      indentFull: "The item above already holds {max} items.",
      indentNoPrevious: "There's no item above to nest it under.",
      outdent: "Move out one level",
      remove: "Remove",
    },
    removeTree: {
      title: "Remove “{label}” and what's under it?",
      description:
        "The {count} items under it go too. Nothing changes on your site until you save the menu.",
    },
    item: {
      addTitle: "Add item",
      editTitle: "Edit item",
      description:
        "Pages, articles and categories are linked by id, so renames and new addresses never break the menu.",
      target: "Links to",
      targetHint:
        "Search pages, articles, categories, tags and collections, or pick an external link or a group.",
      targetPlaceholder: "Search or choose…",
      href: "Web address",
      hrefHint: "An https:// address on another site. Link your own pages by choosing them above.",
      leavesFor: "Visitors leave for {host}.",
      newTab: "Open in a new tab",
      groupHint:
        "A group has no link of its own: it holds the items you nest under it, like a dropdown in the header. It's hidden while none of them is shown.",
      labels: "Labels",
      label: "Label",
      labelIn: "Label ({locale})",
      labelRequired: "Required: this kind of item has no title of its own.",
      labelPickFirst: "Choose what the item links to first.",
      labelFallback: {
        page: "Leave empty to show the page title, so renames carry over.",
        contentEntry: "Leave empty to show the article title, so renames carry over.",
        term: "Leave empty to show the term's name, so renames carry over.",
      },
      labelOtherLocale: "Leave empty to show the {locale} label.",
      place: "Place",
      placeHint: "Where the new item goes. You can drag it anywhere afterwards.",
      topLevel: "Top level",
      under: "Under “{label}”",
      add: "Add item",
      apply: "Apply",
      targetGone: {
        page: "The page this item linked to was deleted. Choose another target, or remove the item.",
        contentEntry:
          "The article this item linked to was deleted. Choose another target, or remove the item.",
        term: "The term this item linked to is gone or retired. Choose another target, or remove the item.",
      },
      hiddenUntil: {
        draft: "This is a draft. The item stays hidden on your site until it's published.",
        review: "This is in review. The item stays hidden on your site until it's published.",
        archived: "This is archived. The item stays hidden on your site.",
        proposed: "This term is a proposal. The item stays hidden until someone approves it.",
        internal: "This term is internal. Its archive isn't public, so the item stays hidden.",
      },
      errors: {
        target: "Choose what the item links to.",
        href: {
          required: "Enter an https:// address.",
          insecure: "Use https://. Plain http:// links aren't allowed in menus.",
          invalid:
            "Use an https:// address with a plain host name, without spaces or user names (international names in punycode).",
        },
        label: {
          required: "Enter a label.",
          tooLong: "At most {max} characters.",
          invalid: "Labels are plain text on one line.",
        },
      },
    },
    picker: {
      url: "External link",
      group: "Group (no link)",
      groups: {
        pages: "Pages",
        articles: "Articles",
        collections: "Collections",
        other: "Other",
      },
      status: {
        draft: "Draft",
        review: "In review",
        archived: "Archived",
        proposed: "Proposed",
        internal: "Internal",
      },
    },
    save: {
      button: "Save menu",
      title: "Save {name}",
      summaryOne: "1 change · {before} → {after} items",
      summary: "{count} changes · {before} → {after} items",
      changes: "Changes",
      onlyDepth: "Only the number of levels changes.",
      hiddenOne: "1 item stays hidden on your site",
      hidden: "{count} items stay hidden on your site",
      hiddenDescription:
        "You can save anyway: they show up on their own once their target is published.",
      confirm: "Save menu",
    },
    delta: {
      quoted: "“{label}”",
      quotedTitle: "“{label}” (title)",
      none: "(none)",
      noArchive: "no archive",
      topLevel: "top level, position {position}",
      under: "under “{parent}”, position {position}",
      withBelowOne: ", with 1 item below it",
      withBelow: ", with {count} items below it",
      add: "{label} → {where}, {place}{below}",
      remove: "{label} → {where}",
      removeTreeOne: "{label} and 1 item below it",
      removeTree: "{label} and {count} items below it",
      move: "{label}: position {from} → {to}",
      reparent: "{label} moved under “{parent}” (was under “{was}”)",
      reparentFromTop: "{label} moved under “{parent}” (was top level)",
      toTop: "{label} moved to the top level (was under “{was}”)",
      label: "{label}: label [{locale}] {from} → {to}",
      target: "{label}: target {from} → {to}",
      newTabOn: "{label}: opens in a new tab",
      newTabOff: "{label}: opens in the same tab",
      hidden: "{label} stays hidden: {reason}",
      where: {
        page: "{where} (page)",
        contentEntry: "{where} (article)",
        term: "{where} ({taxonomy} “{name}”)",
        collection: "collection {where}",
        url: "external: {host}",
        urlNewTab: "external: {host}, new tab",
        group: "group",
        missing: {
          page: "a deleted page",
          contentEntry: "a deleted article",
          term: "a deleted term",
        },
      },
    },
    settings: {
      title: "Settings",
      depth: "Levels",
      depthHint: {
        primary:
          "How deep items may nest. The blog theme shows three levels in the header as dropdowns.",
        footer: "How deep items may nest. Footers usually stay flat or two levels deep.",
        custom: "How deep items may nest. Your theme decides how many it shows.",
      },
      depthTooLow: "Items already sit {depth} levels deep. Move them up first.",
      items: "Items",
      itemsHint: "At every level, out of the most a menu holds.",
      levels: "Deepest level",
      levelsHint: "The deepest item, out of the levels this menu allows.",
      levelsValue: "{depth} of {max}",
      fullest: "Fullest level",
      fullestHint: "One level holds at most {limit} items.",
    },
    details: { key: "Key" },
    delete: {
      title: "Delete the {name} menu",
      action: "Delete menu",
      confirmTitle: "Delete the {name} menu?",
      detail: "Earlier snapshots keep the menu, so a rollback brings it back.",
      hint: {
        primary:
          "With the next publish your site goes back to the header the theme builds from your top-level pages and categories.",
        footer: "With the next publish your site goes back to the theme's own footer.",
        custom: "With the next publish themes stop showing this menu.",
      },
    },
    leave: {
      title: "Discard your changes to {name}?",
      description: "You haven't saved them. Switching menus drops them.",
      confirm: "Discard changes",
    },
    derived: {
      title: { primary: "Current header", footer: "Current footer" },
      description: {
        primary:
          "This site has no header menu, so the theme builds the header from your published top-level pages and categories. Create a menu to reorder or rename items, hide some, or add dropdowns and external links.",
        footer:
          "This site has no footer menu, so the footer shows the theme's own links. Create a menu to choose them.",
      },
      empty: {
        primary: "The derived header is empty: publish a top-level page to fill it.",
        footer: "The theme's own footer links (RSS) show here.",
      },
      treeLabel: "Current {place} items",
      treeHint: "Read only: this is what the theme shows today.",
      startEmpty: "Start empty",
      fromPages: "Create menu from current pages",
    },
    fromPages: {
      title: "Create the {name} menu from current pages",
      description:
        "These are the items your site shows today. Labels stay empty, so page renames keep flowing into the menu.",
      items: "Items",
      none: "No top-level pages yet. The menu starts empty.",
      page: "Page",
      category: "Category",
      categories: "Include top-level categories ({count})",
      labelsHint: "Draft pages are listed too: they stay hidden until you publish them.",
      confirm: "Create menu",
    },
    create: {
      title: "New menu",
      description: "Menus start empty. Add items once it's created.",
      place: "Where it goes",
      placeHint: {
        primary: "The links at the top of every page.",
        footer: "The links at the bottom of every page.",
      },
      custom: "Custom key",
      customHint: "For places your theme defines, like a sidebar or social links.",
      key: "Key",
      keyHint: "Lowercase letters, numbers and single dashes. It can't change later.",
      depth: "Levels",
      depthHint: "How deep items may nest. You can change it later.",
      confirm: "Create menu",
      errors: {
        required: "Enter a key.",
        invalid: "Use lowercase letters, numbers and single dashes.",
        tooLong: "At most 128 characters.",
        taken: "This site already has a menu with this key.",
      },
    },
    preview: {
      title: "Preview",
      description:
        "How the header and footer look with your unsaved changes. Enter a path to see which item is marked as current.",
      path: "Preview as",
      pathHint: "A path on your site, like /about or /category/news.",
      locale: "Language",
      header: "Header preview",
      footer: "Footer preview",
      defaultFooter: "RSS",
      credit: "Built with Cloudhal",
      empty: "No items are shown",
      menu: "Menu",
      customTitle: "Your theme places this menu",
      customDescription:
        "The blog theme shows the header and the footer; a “{key}” menu appears where a theme puts it. Below: its items as they resolve.",
      match: {
        exact: "The underlined item is the exact match for this path.",
        prefix: "The marked item is the closest parent of this path.",
        context: "The marked item matches by context: the article's category or collection.",
      },
    },
    inMenu: { badge: "In menu", hint: "Linked from {menus}." },
    usedIn: {
      title: "In menus",
      none: "Not in any menu",
      noneDescription: {
        page: "Add it to the header or the footer in Navigation.",
        contentEntry: "Add it to a menu in Navigation.",
        term: "Add its archive to a menu in Navigation.",
      },
      description: {
        page: "Renaming the page renames items without a label of their own. Deleting it hides them.",
        contentEntry:
          "Renaming the article renames items without a label of their own. Deleting it hides them.",
        term: "Retiring or making the term internal hides these items.",
      },
      open: "Open Navigation",
    },
    deleteNotice: {
      titleOne: {
        page: "A menu links to this page",
        contentEntry: "A menu links to this article",
      },
      title: {
        page: "{count} menu items link to this page",
        contentEntry: "{count} menu items link to this article",
      },
      description:
        "After you delete it they stay in the menu, hidden on your site and flagged in Navigation until you fix them.",
    },
    how: {
      title: "How menus work",
      ids: "Linked by id",
      idsHint:
        "Items point at pages, articles and categories, not addresses, so renames never break them.",
      hidden: "Hidden, never broken",
      hiddenHint:
        "An item whose page is deleted or unpublished is hidden on the site and flagged here.",
      agents: "Agents ask first",
      agentsHint: "Every menu change an agent proposes waits for a person's approval.",
      snapshot: "One save, one snapshot",
    },
    diff: {
      summary: "+{added} −{removed} ↕{moved} ~{changed}",
      items: "{before} → {after} items",
    },
  },
} as const;
