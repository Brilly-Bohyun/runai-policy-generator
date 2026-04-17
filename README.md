# runai-policy-generator

A webpage for creating NVIDIA Run:ai policies without trial and error.

## Stack

- Frontend: React + TypeScript + Vite

## UX direction reflected from the plan

- Step 1: choose a workload type
- Step 2+: add fields by section instead of editing raw YAML
- Final review: inspect warnings and generated YAML
- Right panel: keep a compact human-readable summary while editing

## Local run

```bash
npm install
npm run dev
```

The app now runs entirely in the frontend. Policy field metadata and YAML generation are bundled locally, so no Go server is required.
