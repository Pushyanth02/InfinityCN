# InfinityCN — Copilot System Instructions

You are working on the InfinityCN Cinematification system.

## Core Rules

- Always prioritize system architecture over UI changes
- Never mix business logic inside React components
- All logic must be modular and reusable
- Use strict TypeScript (no `any`)
- Preserve original text meaning in all transformations
- Never generate image/video logic

## Required Architecture

Follow this pipeline strictly:

Text Input  
→ Paragraph Rebuilder  
→ Scene Segmentation  
→ Narrative Analysis  
→ Cinematization  
→ Renderer  

Do NOT bypass steps.

## Code Structure Rules

- `/lib/ai` → AI orchestration only  
- `/lib/engine` → cinematification logic  
- `/lib/runtime` → rendering logic  
- `/components` → UI only  

## AI Usage Rules

- Minimize API calls
- Always cache responses
- Use chunk-based processing
- Validate AI outputs before rendering

## UI Rules

- Keep UI minimal and readable
- Typography > colors
- Dark mode = cinematic (not flashy)
- Light mode = paper-like

## Performance Rules

- Use lazy loading
- Avoid reprocessing unchanged text
- Process text in chunks (scene-level)

## Error Handling

- Never crash UI
- Always provide fallback state
- Add retry logic for AI calls

## Output Expectations

Always return:
- clean code
- modular structure
- typed interfaces
- no unnecessary complexity
