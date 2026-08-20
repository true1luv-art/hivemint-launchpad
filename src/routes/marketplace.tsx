import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/marketplace")({
  component: Page,
});

function Page() {
  return null;
}
