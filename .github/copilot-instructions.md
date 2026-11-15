# Side Runner MVP instructions

This repository is a lightweight browser game implemented with plain HTML, CSS, and JavaScript. Keep the project simple and avoid introducing frameworks, build tooling, or dependencies unless the task explicitly requires them.

## Project layout
- `index.html` is the page structure and includes the canvas and HUD.
- `style.css` contains the visual theme, HUD layout, responsive layout, and game shell styling.
- `script.js` contains the game loop, input handling, collision logic, entities, particles, and rendering.
- `README.md` documents how to run the app and the controls.

## Coding expectations
- Keep changes small and focused; this is a single-screen canvas game.
- Preserve the existing vanilla JavaScript architecture and naming patterns.
- Favor direct, readable logic over abstraction for a tiny codebase.
- Maintain the current control scheme: A/D or arrow keys to move, W/↑/Space to jump, J/K to shoot, Enter to restart after a game over.
- Keep gameplay feedback readable: the HUD, notice text, and score updates should remain clear and consistent.
- Prefer CSS variables and existing design tokens instead of introducing a new styling system.
- Preserve the browser-only setup; do not assume a server framework or bundler.

## Behavior and quality
- Ensure the game still runs from a static file server such as `python3 -m http.server 8000`.
- Keep canvas rendering smooth and avoid unnecessary reflow or heavy DOM updates.
- Preserve browser compatibility with modern desktop browsers.
- For any user-facing update, keep the page content aligned with the game mechanics and README.
- When adding features, maintain the current game feel and avoid breaking score, hit detection, or restart flow.

## Validation
- Use a lightweight local check by serving the repo and opening it in a browser.
- Verify that the game loads without console errors and all basic controls continue to function.
- If you modify gameplay logic, confirm score tracking, enemy spawning, collisions, and restart behavior still work as expected.
