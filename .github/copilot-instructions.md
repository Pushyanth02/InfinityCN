# InfinityCN — Global Copilot Rules

You are working on the InfinityCN cinematic reading platform.

Core rules:

- Preserve original text meaning.
- Do not rewrite story content unless a cinematized transformation is explicitly requested.
- Use strict TypeScript.
- Keep UI, AI orchestration, runtime rendering, and storage separate.
- Avoid duplicate logic.
- Prefer small, testable modules.
- Minimize AI calls and token usage.
- Use caching, batching, and fallback providers.
- Never expose API keys in frontend code.

Required architecture:
Text/Input
→ Cleanup
→ Scene Segmentation
→ Narrative Analysis
→ Cinematization
→ Streaming Renderer
→ UI Update

Do not bypass stages.
Do not mix AI logic into UI components.
Always add error handling, retry logic, and safe fallback states.
