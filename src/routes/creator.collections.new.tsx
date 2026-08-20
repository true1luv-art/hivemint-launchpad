import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/creator/collections/new")({
  component: Page,
});

function Page() {
  return null;
}
