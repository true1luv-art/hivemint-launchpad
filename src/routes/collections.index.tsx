import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/collections")({
  component: Page,
});

function Page() {
  return null;
}
