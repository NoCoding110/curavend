# docs/

Source-controlled documentation. The bulk lives under `docs/training/`,
which powers the in-app `/help-center` route.

## What's here

```
docs/
└─ training/
   ├─ README.md           # Master index — feature & workflow tables of contents
   ├─ personas/           # 6 role-specific quickstart guides
   ├─ features/           # 52 feature reference docs (01–52)
   └─ workflows/          # 23 workflow recipes (01–23)
```

## Help center pipeline

1. Markdown source lives in `docs/training/`.
2. A build step copies it to `packages/web/public/docs/` (committed for
   simplicity; could be a CI step later).
3. The web SPA reads from `/docs/*.md` at runtime, parses with
   `react-markdown` + `remark-gfm` + `rehype-highlight`.
4. `packages/web/src/features/helpCenter/pages/HelpCenter.tsx` holds
   the role-based visibility map (`FEATURE_VISIBILITY` / `WORKFLOW_VISIBILITY`).

## When you ship a new feature

1. Write the feature doc in `docs/training/features/NN-name.md`. Follow
   the conventions of existing docs (H2 sections, **bold** for UI labels,
   `monospace` for literals, image placeholders, Mermaid diagrams where
   they help).
2. Add an entry to `docs/training/README.md` in the appropriate section.
3. Add a visibility rule in `HelpCenter.tsx`'s `FEATURE_VISIBILITY` map
   keyed by the filename slug (without `.md`).
4. Copy the file to `packages/web/public/docs/training/features/`.
5. Rebuild + deploy web.

## Doc conventions

- Filename: `NN-kebab-case.md` where NN is a zero-padded number (continues
  the existing sequence per folder).
- 120–180 lines is the sweet spot — shorter is fine if natural.
- Always include sections: "Who uses it", "The page", "Common tasks",
  "Permissions", "Behind the scenes", "Related".
- Workflows follow a different template (look at
  `workflows/22-handle-damaged-shipment.md` as a model).
- Image placeholders: `![alt text](placeholder.png)` — no real images
  shipped yet.
- Use Mermaid for state diagrams + sequence diagrams where they aid
  comprehension.

## Current totals

- 52 feature docs (01-dashboard.md through 52-price-variance.md)
- 23 workflow recipes
- 6 persona quickstart guides

See `training/README.md` for the master index.
