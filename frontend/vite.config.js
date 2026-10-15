import { cpSync } from "fs";
import { join, resolve } from "path";
import { defineConfig } from "vite";

function pdfjsAssets() {
  const root = join(__dirname, "node_modules", "pdfjs-dist");
  return {
    name: "pdfjs-assets",
    closeBundle() {
      for (const dir of ["standard_fonts", "cmaps"]) {
        cpSync(join(root, dir), join(__dirname, "dist", "pdfjs", dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [pdfjsAssets()],
  optimizeDeps: {
    exclude: ["@reactor-team/js-sdk", "@reactor-models/vidu-s2-editing", "@reactor-models/vidu-s2-avatar"],
    include: ["@reactor-team/js-sdk > awaitqueue", "react", "react/jsx-runtime"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        playground: resolve(__dirname, "playground.html"),
        draw: resolve(__dirname, "draw.html"),
        canvas: resolve(__dirname, "canvas.html"),
        showcase: resolve(__dirname, "showcase.html"),
        einstein: resolve(__dirname, "einstein.html"),
        stylized: resolve(__dirname, "stylized.html"),
        dance: resolve(__dirname, "dance.html"),
        drip: resolve(__dirname, "drip.html"),
        roast: resolve(__dirname, "roast.html"),
      },
    },
  },
});
