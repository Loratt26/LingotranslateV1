# OpenAI Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic browser integration with a Vercel-hosted OpenAI proxy and add a model selector.

**Architecture:** The browser sends normalized generation requests to `/api/openai`. The Vercel function owns the OpenAI secret via `OPENAI_API_KEY`, validates optional access tokens, calls the Responses API, and returns plain text plus token usage. The Preact app keeps existing translation prompts and UX while switching provider plumbing.

**Tech Stack:** Vite, Preact, Vercel Serverless Functions, OpenAI Responses API, Node built-in test runner.

---

### Task 1: Server Contract Tests

**Files:**
- Create: `tests/openai-api.test.mjs`
- Modify: `package.json`

- [ ] Add a `test` script that runs Node's built-in test runner.
- [ ] Write tests for extracting text from OpenAI Responses payloads.
- [ ] Write tests for model fallback ordering.
- [ ] Run `npm test` and verify it fails before the endpoint exists.

### Task 2: Vercel OpenAI Function

**Files:**
- Create: `api/openai.js`
- Create: `vercel.json`

- [ ] Implement `POST /api/openai` with `OPENAI_API_KEY`.
- [ ] Accept `model`, `system`, `input`, `maxOutputTokens`, and `temperature`.
- [ ] Return `{ text, usage, model }`.
- [ ] Retry compatible fallback models when the selected model is unavailable.
- [ ] Keep secrets out of responses and source files.
- [ ] Run `npm test` and verify the endpoint helpers pass.

### Task 3: Frontend Provider Swap

**Files:**
- Create: `src/lib/model-options.ts`
- Create: `src/lib/openai-client.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/lib/translate.ts`
- Modify: `src/lib/detect-lang.ts`

- [ ] Add OpenAI model option metadata.
- [ ] Store selected model in localStorage.
- [ ] Replace Anthropic request bodies and SSE parsing with normalized `/api/openai` calls.
- [ ] Preserve existing prompts, glossary handling, alternatives, rewrites, and language detection.
- [ ] Allow empty browser token when using the same-origin Vercel function.

### Task 4: Settings UI

**Files:**
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/lib/usage-tracker.ts`

- [ ] Rename API key fields to access-token/server endpoint language.
- [ ] Add a model selector with low-cost and balanced options.
- [ ] Estimate usage cost based on the selected model.

### Task 5: Verify and Deploy

**Files:**
- Vercel project configuration and environment only.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Deploy with Vercel.
- [ ] Set `OPENAI_API_KEY` as a Vercel environment variable without committing it.
- [ ] Trigger a production redeploy if the environment variable is added after the first deploy.
