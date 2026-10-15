# Bundled demos

- Original Drawing Museum: https://github.com/saitiger/Drawing-to-live at `34ba33c9d40c7dfff4abacb7c7ff97a3ed83582d`, extended into this showcase.
- Einstein character implementation: https://github.com/sachin1705s/interactive-studio-reactor.
- Stylized Worlds: https://github.com/saitiger/Experimentation/tree/finger-frame-effect.

- `off-season`: https://github.com/sachin1705s/the-off-season at `fbf1cbd4164abaa58edb70351aef2efec2750dd8`.
- `news-studio`: https://github.com/sachin1705s/news-studio at `f8b8393f3ce66eb17eb31a18503cc1f532c8c061`. Original MIT license retained.

Original application logic, prompts, and interfaces are retained. Showcase adaptations add an origin-checked stop bridge, session-only key storage for Off Season, and explicit click-to-start plus missing-key setup guidance for News Studio. No original project secrets are copied.

The apps run separately because they use different Next.js versions. Both are embedded by the Vite showcase. Set `VITE_OFF_SEASON_URL` / `VITE_NEWS_STUDIO_URL` when using other origins, and set `NEXT_PUBLIC_SHOWCASE_ORIGIN` on each Next.js app to the parent origin. These local defaults are not a public deployment configuration.
