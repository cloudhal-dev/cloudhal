# Changesets

Every user-visible change to a published package needs a changeset: run `pnpm changeset`, pick the packages and bump type, describe the change. `release.yml` turns accumulated changesets into version bumps, changelogs and npm/crates publishes on merge to `main`.
