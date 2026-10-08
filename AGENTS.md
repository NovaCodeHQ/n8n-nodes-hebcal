# PROJECT KNOWLEDGE BASE

## OVERVIEW

Project: **n8n-nodes-hebcal**

Self-hosted n8n community node package that exposes a single credential-free **Hebcal** node. All
calculations (Jewish calendar, Hebrew dates, Torah readings, zmanim, daily learning) run locally via
bundled `@hebcal/*` ESM packages — no REST API, no credentials, no network at execution time.

### Stack

- **Language:** TypeScript 5.9 (Node16 modules, ES2022 target, CommonJS output for n8n)
- **Framework/API:** n8n community nodes API v1
- **Primary tooling:** `@n8n/node-cli`, ESLint 9, Prettier 3, TypeScript, esbuild 0.28 (post-build bundler)
- **Integration layer:** `@hebcal/core` 6.13.1 (GPL-2.0) + `hdate`, `learning`, `leyning`, `triennial`,
  `locales`, `temporal-polyfill` — all ESM-only, loaded via preserved native `import()` and bundled
  into the single CJS node artifact
- **Package manager:** npm (`package-lock.json` committed)

## STRUCTURE

```text
.
├── .agents/                  # Local n8n-specific build guidance
├── .github/workflows/        # CI and publish automation
├── nodes/Hebcal/      # Node implementation, per-resource modules, metadata, icons
├── scripts/                  # Post-build esbuild bundling script
├── tests/                    # node:test suites (one file per feature group)
├── types/                    # Narrow ambient declarations (untyped side-effect packages)
├── dist/                     # Built output consumed by n8n
├── AGENTS.md                 # This file
├── CLAUDE.md                 # Delegates to AGENTS.md
├── README.md                 # Human-facing package docs
├── LICENSE                   # GPL-2.0 + bundled third-party attributions
├── eslint.config.mjs          # n8n self-hosted lint config (+ scoped GPL exception)
├── package.json              # Scripts, deps, n8n manifest
└── tsconfig.json             # TS compiler settings
```

### Key directories

- `nodes/Hebcal/`: Programmatic node. `Hebcal.node.ts` holds the description, resource/operation
  properties, and a thin `dispatchResource` router. Per-resource modules (`calendar.ts`, `zmanim.ts`,
  `torah.ts`, …) define properties + `execute*` handlers. Shared helpers: `library.ts` (native ESM
  loaders with side-effect registration), `dateUtils.ts`, `timeUtils.ts`, `locations.ts`,
  `events.ts`, `locales.ts`, `learningKeys.ts`.
- `tests/`: `node:test` suites that compile `nodes/Hebcal` with `tsc` and exercise real Hebcal
  packages (never against `dist`, which CI may not have built yet).
- `types/`: `hebcal-locales.d.ts` — narrow side-effect-module declaration (that package ships no
  typings). Do not broaden into global `any`.
- `dist/`: Generated build output; do not hand-edit.

## COMMANDS

| Action          | Command               |
| --------------- | --------------------- |
| Install         | `npm install`         |
| Type-check      | `npx tsc --noEmit`    |
| Lint            | `npm run lint`        |
| Lint fix        | `npm run lint:fix`    |
| Test            | `npm test`            |
| Build           | `npm run build`       |
| Watch TS        | `npm run build:watch` |
| Run locally     | `npm run dev`         |
| Release         | `npm run release`     |
| Pack smoke test | `npm pack --dry-run`  |

## BUILD / RELEASE WORKFLOWS

- **CI:** `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, `npm test`, `npm run build`.
- **Build:** `npm run build` = `n8n-node build` (tsc + asset copy, wipes `dist`) followed by
  `scripts/bundle-hebcal.mjs`, which bundles the Hebcal ESM graph into
  `dist/nodes/Hebcal/Hebcal.node.js` (Node 18 CJS, only `n8n-workflow` external, license comments
  inlined, stale sourcemaps removed).
- **Publish:** `.github/workflows/publish.yml` publishes on version tag push via GitHub Actions with
  npm provenance.
- **n8n manifest:** `package.json` → `n8n.nodes` must point at the compiled
  `dist/nodes/Hebcal/Hebcal.node.js`. There are no credentials.

## CODING STANDARDS

- **TypeScript strictness:** `strict: true`, `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`,
  `strictNullChecks` enabled. ESM type imports need `with { 'resolution-mode': 'import' }`.
- **Module style:** CommonJS package scope; TypeScript `module/moduleResolution: Node16` so dynamic
  `import()` of ESM deps is preserved natively. Never use `eval`/`Function`/sync `require` shims.
- **Formatting:** Prettier uses tabs, semicolons, single quotes, trailing commas, `printWidth: 100`.
- **Node style:** Programmatic node (local computation, not declarative HTTP).
- **Execution pattern:**
  - Resource/operation properties live in per-resource modules; `Hebcal.node.ts` only aggregates
    them into `hebcalResources` and routes via `dispatchResource`.
  - Handlers return `IDataObject[]` per input item; the node attaches `pairedItem` and honors
    `continueOnFail()` with `NodeOperationError` (never raw throws inside `execute`).
  - Named choices use explicit finite option allowlists; no arbitrary method dispatch or raw JSON
    option passthrough.
- **Output pattern:** Library objects (HDate, Event, Temporal, Date) are serialized to plain JSON.
  Missing solar times are `null`. Civil Gregorian dates are validated `YYYY-MM-DD` components parsed
  host-timezone-independently; instants require explicit ISO-8601 with timezone/offset.
- **Property pattern:** Resource/operation routing via `displayOptions.show`. Parameter names share
  one namespace: identical definitions may repeat across resources, but same-name/different-shape
  params must be renamed. Resource ids stay singular; options lists stay alphabetized (lint-enforced).

## WHERE TO LOOK

- **Main node source:** `nodes/Hebcal/Hebcal.node.ts`
- **Shared loaders:** `nodes/Hebcal/library.ts` (must import all add-ons for side-effect registration)
- **Shared parsing/serialization:** `nodes/Hebcal/dateUtils.ts`, `timeUtils.ts`, `events.ts`
- **Node metadata/docs links:** `nodes/Hebcal/Hebcal.node.json`
- **Feature coverage ledger:** `.plans/clover-to-hebcal/coverage-outline.md`
- **Human docs:** `README.md`

## CONTEXT FILES TO READ FIRST

`CLAUDE.md` simply points at this file.

Use these local guides before editing matching areas:

- `/.agents/workflow.md` — planning and verification expectations
- `/.agents/nodes.md` + `/.agents/properties.md` — any node file under `nodes/`
- `/.agents/nodes-programmatic.md` — this project uses the programmatic style
- `/.agents/versioning.md` — node versioning work

## TESTING REALITY

Executable suite via `npm test` (`node:test`, no extra runner). Conventions:

1. Each suite compiles `nodes/Hebcal` sources with `tsc` into `.tmp/<name>-test` and exercises the
   real (unmocked) Hebcal packages.
2. Pin known fixtures (verified library outputs), not wrapper-vs-library self-comparisons.
3. Cover leap-year/Adar edge cases, Israel/Diaspora divergence, polar/DST solar cases,
   host-timezone invariance, multi-item `pairedItem`/`continueOnFail` behavior, and nullable results.
4. `tests/coverage.test.cjs` asserts static allowlists against installed libraries, proves every
   resource/operation pair dispatches, and forbids `eval`/`require` in sources.
5. Practical verification order: `npx tsc --noEmit` → `npm run lint` → `npm test` →
   `npm run build` (+ smoke-test the built bundle) → `npm pack --dry-run`.

## IMPORTANT NOTES / GOTCHAS

- This package is **self-hosted only** (`n8n.strict: false`). Cloud support is disabled.
- License is **GPL-2.0** (required by `@hebcal/core`/`hdate`); `eslint.config.mjs` carries a narrow
  exception for the package-license lint rule. The `LICENSE` file bundles third-party attributions.
- n8n lint forbids runtime deps and non-n8n peer deps: Hebcal packages live in `devDependencies`
  and are bundled by esbuild. Never move them to `dependencies`/`peerDependencies`.
- The companion packages register via import side effects (`DailyLearning`, locales); the loader
  must import all of them or schedules/translations silently go missing.
- Upstream quirks encoded in code/tests: Zmanim lunar methods are date-relevant (`null` off-day);
  NOAA solar routines need UTC-hour instants; `il` is OR-ed with `location.getIsrael()` (enforce
  coherence, it cannot be overridden); triennial needs Hebrew year ≥ 5744 with 1-based UI cycles.
- `dist/` and `.tmp/` are generated/ignored. Edit sources, then rebuild.
- Keep `incremental: false` in `tsconfig.json`: `n8n-node build` wipes `dist` first, and a persistent
  buildinfo makes `tsc` skip emit on unchanged sources, which breaks the esbuild bundle step.
- Always run `npm run build` after `npm run dev` before packing: dev watch-mode `tsc` recompiles
  `dist` without bundling and clobbers the esbuild output.
- For local `n8n-node dev`, **Node 22 LTS** is the safest choice.
- Keep README aligned with actual operations and self-hosted constraints.
- If package version changes, also update `CHANGELOG.md`.
