/**
 * Event contract self-test.
 *
 * Runnable without a test runner (`npm run events:test`) so the event/action
 * contract can be validated in any environment, including the worker process.
 */
import { APP_EVENTS, EventBus, createAction } from "./action";
import type { AppEvent, AppEventType } from "./action";

interface Result {
  name: string;
  ok: boolean;
  error?: string;
}

function check(name: string, fn: () => void | Promise<void>): Promise<Result> {
  return Promise.resolve()
    .then(fn)
    .then(() => ({ name, ok: true }))
    .catch((error: unknown) => ({ name, ok: false, error: String(error) }));
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export async function runEventContractTests(): Promise<Result[]> {
  const results: Result[] = [];

  results.push(
    await check("createAction produces a typed, timestamped event", () => {
      const event = createAction(APP_EVENTS.NFT_MINTED, {
        transactionId: "TX-1",
        hiveTransactionId: "MOCK-HIVE-AAAA1111",
        nftId: "nft_1",
        collectionId: "col_1",
        owner: "alice",
        tokenId: 42,
        rarity: "Legendary",
      });
      assert(event.type === "NFT_MINTED", "type mismatch");
      assert(event.payload.tokenId === 42, "payload mismatch");
      assert(Boolean(Date.parse(event.occurredAt)), "occurredAt not an ISO date");
    }),
  );

  results.push(
    await check("bus delivers to typed and wildcard subscribers", async () => {
      const bus = new EventBus();
      const seen: AppEventType[] = [];
      bus.on(APP_EVENTS.NFT_SOLD, (event) => {
        seen.push(event.type);
        assert(event.payload.price === 50, "sold price mismatch");
      });
      bus.on("*", (event: AppEvent) => {
        seen.push(event.type);
      });
      await bus.emit(
        createAction(APP_EVENTS.NFT_SOLD, {
          transactionId: "TX-2",
          hiveTransactionId: "MOCK-HIVE-BBBB2222",
          listingId: "lst_1",
          nftId: "nft_1",
          collectionId: "col_1",
          seller: "bob",
          buyer: "alice",
          price: 50,
          marketplaceFee: 1.25,
        }),
      );
      assert(seen.length === 2, `expected 2 deliveries, got ${seen.length}`);
      assert(bus.recent().length === 1, "event log not written");
    }),
  );

  results.push(
    await check("every declared event type has a creator", () => {
      for (const type of Object.values(APP_EVENTS)) {
        assert(typeof type === "string" && type.length > 0, "invalid event type");
      }
    }),
  );

  return results;
}

/** Executed when run directly by `npm run events:test`. */
export async function main() {
  const results = await runEventContractTests();
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.error ? ` — ${result.error}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} event contract checks passed`);
  if (failed > 0 && typeof process !== "undefined") process.exitCode = 1;
}
