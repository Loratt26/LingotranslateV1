# Prompt For Codex Chat With Jarvis Access

Copy this prompt into the Codex chat that has access to Jarvis.

```text
You are Codex working in my Jarvis project. I need you to update the existing Jarvis "Traductor" section with the latest deployed Lingo translator experience.

Context:
- The new Lingo production app is deployed at:
  https://lingotranslate-v1.vercel.app
- It uses a secure server-side routed AI API proxy. Do not expose the API token in frontend code.
- The routed AI base URL is:
  https://api.trannhatcse.tokyo
- The server-side token is configured as OPENAI_API_KEY and starts with rtk_live_. If the project already has secrets management, store it there. Never commit it.
- Recommended server environment:
  OPENAI_API_KEY=<rtk_live token from the project owner>
  OPENAI_BASE_URL=https://api.trannhatcse.tokyo
  OPENAI_UPSTREAM_MODE=responses
  OPENAI_DEFAULT_MODEL=auto

Goal:
Integrate the new Lingo translator into Jarvis under the existing "Traductor" section so users can translate text quickly, choose models, use the routed API securely, and keep the Jarvis UI style.

Important behavior to preserve:
- Translation input and output areas.
- Source/target language selection.
- Auto-detect if Jarvis currently supports it, or keep the existing source language flow if not.
- Model selector with these options, in this speed-first order:
  auto
  gpt-5.4-mini
  claude-haiku-4.5
  minimax-m2.1
  minimax-m2.5
  gpt-5.4
  claude-sonnet-4
  claude-sonnet-4.5
  claude-sonnet-4.6
  gpt-5.5
  gpt-5.2
  gpt-5.2-codex
  gpt-5.3-codex
  claude-opus-4.5
  claude-opus-4.6
  claude-opus-4.7
  deepseek-3.2
  qwen3-coder-next
  glm-5
- Default model should be auto.
- Recommended fast models in UI copy or ordering: auto, gpt-5.4-mini, claude-haiku-4.5, minimax-m2.1, minimax-m2.5.
- The translation prompt should force output-only translation, no explanations, no labels, no answering the user text.

Implementation approach:
1. Inspect the Jarvis codebase and locate the current "Traductor" section.
2. Identify how Jarvis handles server routes, API routes, secrets, and deployment.
3. Add or update a server-side route equivalent to /api/openai. The frontend must call Jarvis's own backend, not https://api.trannhatcse.tokyo directly.
4. The backend should call:
   https://api.trannhatcse.tokyo/v1/responses
   using:
   Authorization: Bearer ${OPENAI_API_KEY}
   Content-Type: application/json
5. Request body for the router should be:
   {
     "model": selectedModel || "auto",
     "instructions": systemPrompt,
     "input": userPrompt,
     "max_output_tokens": 1024,
     "temperature": 0,
     "store": false
   }
6. Normalize router responses into:
   {
     "text": "...",
     "usage": {
       "inputTokens": 0,
       "outputTokens": 0
     },
     "model": "auto"
   }
7. Update the Traductor frontend to call the backend route and render errors clearly.
8. Keep styling consistent with Jarvis. Do not create a separate landing page.
9. If Jarvis already embeds external tools instead of native sections, embed https://lingotranslate-v1.vercel.app in the Traductor section as a fallback. Prefer native integration if feasible.
10. Verify with a production-like health check:
    model: auto
    system: Reply OK only.
    input: health
    maxOutputTokens: 3
    temperature: 0
    Expected output text: OK

Security rules:
- Do not place rtk_live tokens in client code, localStorage, public env vars, logs, screenshots, docs, or committed files.
- Use server-only environment variables.
- If the repo has .env files, ensure they are gitignored.

Acceptance criteria:
- Jarvis "Traductor" opens and works.
- Translating a short phrase returns only translated text.
- Model selector includes the full list above and defaults to auto.
- Server route health check returns OK.
- Build/test commands pass.
- Deployment instructions or actual deployment result are reported clearly.

Reference implementation:
The Lingo project has a working server route in api/openai.js and a model list in src/lib/model-options.ts. Recreate the same pattern in Jarvis using Jarvis's framework conventions.
```

