# AGENTS.md

This repository contains a simple side-scrolling browser game called Side Runner MVP.

## Scope
- The app is a static web project built with plain HTML, CSS, and JavaScript.
- There are no package installs, build steps, or framework conventions to follow.

## Working conventions
- Keep changes minimal and local to the relevant file(s).
- Prefer updating `index.html`, `style.css`, and `script.js` directly instead of introducing new infrastructure.
- Preserve the canvas-game architecture: gameplay logic in `script.js`, layout in `index.html`, and styling in `style.css`.
- Keep the controls and game feel consistent with the current design.
- When user-facing text changes, keep it in sync with the README and the in-game HUD.

## Verification
- Run the project with a static server, for example:
  `cd /workspaces/my-first-app && python3 -m http.server 8000`
- Open `http://localhost:8000` and verify the page loads and gameplay works.
- Check that movement, jumping, shooting, collision, scoring, and restart flow remain functional after changes.
