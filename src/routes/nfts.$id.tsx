import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/nfts/$id")({
  component: Page,
});

function Page() {
  return null;
}
