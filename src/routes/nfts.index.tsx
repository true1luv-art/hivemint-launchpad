import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/nfts/")({
  component: Page,
});

function Page() {
  return null;
}
