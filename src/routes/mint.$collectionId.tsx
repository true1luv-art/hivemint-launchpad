import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/mint/$collectionId")({
  component: Page,
});

function Page() {
  return null;
}
