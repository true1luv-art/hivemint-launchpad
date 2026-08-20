import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/creator/")({
  component: Page,
});

function Page() {
  return null;
}
