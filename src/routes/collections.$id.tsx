import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/collections/$id")({
  component: Page,
});

function Page() {
  return null;
}
