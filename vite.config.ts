import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Serves /api/billing/* from the same handlers the deployed site runs as Vercel functions, so checkout
// works on a laptop with no extra process. Secrets come from .env.local and never reach the browser.
const billingApi = (mode: string): Plugin => ({
  name: "billing-api",
  configureServer(server) {
    const env = loadEnv(mode, process.cwd(), "");
    server.middlewares.use("/api/billing", async (req, res) => {
      const { handle } = await import("./server/billing/http.mjs");
      const action = (req.url ?? "").split("?")[0].replace(/^\//, "");
      await handle(req, res, action, env);
    });
  },
});

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
  plugins: [react(), billingApi(mode)],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
