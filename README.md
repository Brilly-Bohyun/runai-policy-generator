# Run:ai Policy Generator

A frontend policy studio for building NVIDIA Run:ai policy YAML with guided workload-specific defaults, rules, and review feedback.

The app is designed around Run:ai 2.24 policy behavior and keeps the official YAML reference close at hand:
[Official Run:ai YAML reference](https://run-ai-docs.nvidia.com/self-hosted/platform-management/policies/policy-yaml-reference).

## What It Does

- Starts from a workload type such as Workspace, Standard Training, Distributed Training, Inference, or NVIDIA NIM Service.
- Shows only policy keys supported by the selected workload.
- Lets users add defaults and rule controls without editing raw YAML first.
- Supports common policy constraints such as `canEdit`, `canAdd`, `required`, `options`, `min`, and `max`.
- Generates YAML locally in the browser.
- Provides warnings, rule coverage, and a compact review panel before copying the policy.

## UX Flow

1. Open Policy studio.
2. Select a workload type.
3. Move through the generated steps for that workload.
4. Add policy keys and fill in default values or rule settings.
5. Review warnings and generated YAML.
6. Copy the YAML into the Run:ai policy screen.

Before a workload is selected, the app stays in a clean landing state. Step navigation, key counts, and summaries appear only after a workload type is chosen.

## Tech Stack

- React
- TypeScript
- Vite
- Vitest
- `yaml`

The app runs entirely in the frontend. Policy metadata and YAML generation logic are bundled locally, so no backend server is required.

## Local Development

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm test
npm run build
npm run preview
```

## Project Structure

```text
src/App.tsx        Main policy builder UI
src/catalog.ts    Workload, section, field, and rule metadata
src/policy.ts     YAML generation and validation logic
src/types.ts      Shared TypeScript types
src/api.ts        Frontend API shim over local catalog/generator logic
src/styles.css    Run:ai-inspired UI styling
test/             Catalog and policy generator tests
```

## Validation Notes

Generated YAML should be validated against the real Run:ai console, not only by local tests. A policy is considered correct when the Run:ai UI reflects the generated defaults and rules, and allowed workloads can be created and opened successfully.

Credentials for real-console QA must not be stored in files, environment variables, logs, screenshots, commits, or generated artifacts.
