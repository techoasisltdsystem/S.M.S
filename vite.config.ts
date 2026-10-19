import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Local database mode (VITE_DB_PROVIDER=local): forward the REST calls
      // made by src/lib/db.ts to PostgREST running in front of local Postgres.
      // The Authorization header carries the signed-in session token.
      "/rest/v1": {
        target: "http://127.0.0.1:3001",
        rewrite: (p) => p.replace(/^\/rest\/v1/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (req) => {
            req.removeHeader("apikey");
          });
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
