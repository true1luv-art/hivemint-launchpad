import { createFileRoute } from "@tanstack/react-router";
import { handleApiRequest } from "@/server/api/router";

/**
 * Catch-all server route that mounts the Phase 2 HTTP API under `/api/*`.
 *
 * Pure server route — no component, no loader — so the handler module
 * (`@/server/api/router`) and its server-only transitive imports stay in the
 * server bundle.
 */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ params }) => handleApiRequest("GET", params._splat),
      POST: ({ params, request }) => handleApiRequest("POST", params._splat, request),
    },
  },
});
