import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { generateArtwork, mockTxId } from "@/lib/art";
import { buildNFT, createSeedData, CURRENT_USER, rarityMultiplier, RANK_POOL_CAP } from "@/lib/mock-data";
import { buildCollectionTraitLayers } from "@/lib/traits/presets";
import type { TraitLayerConfig } from "@/lib/traits/types";
import type {
  Activity,
  Collection,
  Listing,
  NFT,
  RarityConfig,
  Transaction,
  User,
} from "@/lib/types";
import {
  COLLECTION_CREATION_FEE,
  MARKETPLACE_FEE_RATE,
  PLATFORM_FEE_RATE,
  databaseService,
  hiveService,
  marketplaceService,
} from "@/services";

const seed = createSeedData();

export interface CreateCollectionInput {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  maxSupply: number;
  mintPrice: number;
  creatorFee: number;
  platformFee: number;
  rarities: RarityConfig[];
  /** Generative configuration: layers -> values -> weights. */
  traitLayers?: TraitLayerConfig[];
  metadataBaseUri: string;
  /** IPFS reference bundle from `uploadCollectionAssets` — required once assets exist. */
  assets?: Collection["storage"];
  /** maxSupply-based deployment fee; falls back to the flat legacy fee. */
  creationCost?: number;
  /**
   * Imported, already-authored NFTs. They are stored as an UNMINTED pool —
   * minting hands one over, it never generates a token.
   */
  importedNfts?: NFT[];
}

export interface MintResult {
  nft: NFT;
  txId: string;
}

interface AppState {
  user: User | null;
  walletConnected: boolean;
  hiveBalance: number;
  balances: Record<string, number>;
  collections: Collection[];
  nfts: NFT[];
  listings: Listing[];
  transactions: Transaction[];
  activities: Activity[];
  /** Unminted imported NFTs, keyed by collection id. */
  unminted: Record<string, NFT[]>;
  connecting: boolean;

  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  updateBalance: (username: string, delta: number) => void;
  addActivity: (activity: Omit<Activity, "id" | "createdAt"> & { createdAt?: string }) => void;
  addTransaction: (tx: Omit<Transaction, "id" | "createdAt"> & { createdAt?: string }) => void;

  createCollection: (input: CreateCollectionInput) => Promise<Collection>;
  selectRandomNFT: (collectionId: string) => Promise<NFT | null>;
  mintNFT: (collectionId: string) => Promise<MintResult>;
  listNFT: (nftId: string, price: number) => Promise<Listing>;
  cancelListing: (listingId: string) => void;
  buyNFT: (listingId: string) => Promise<void>;
  transferNFT: (nftId: string, to: string) => Promise<void>;
  resetMockData: () => void;
}

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const baseBalances: Record<string, number> = {
  alice: 125.5,
  bob: 940.2,
  charlie: 512.75,
  david: 288.4,
  eve: 1_204.0,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: CURRENT_USER,
      walletConnected: true,
      hiveBalance: 125.5,
      balances: { ...baseBalances },
      collections: seed.collections,
      nfts: seed.nfts,
      listings: seed.listings,
      transactions: seed.transactions,
      activities: seed.activities,
      unminted: {},
      connecting: false,

      connectWallet: async () => {
        set({ connecting: true });
        const { username, balance } = await hiveService.connect("alice");
        set((s) => ({
          connecting: false,
          walletConnected: true,
          user: { username, displayName: "Alice", avatarSeed: username },
          hiveBalance: s.balances[username] ?? balance,
        }));
      },

      disconnectWallet: async () => {
        await hiveService.disconnect();
        set({ walletConnected: false, user: null });
      },

      updateBalance: (username, delta) =>
        set((s) => {
          const next = Number(((s.balances[username] ?? 0) + delta).toFixed(2));
          const balances = { ...s.balances, [username]: next };
          return {
            balances,
            hiveBalance:
              s.user?.username === username ? next : (balances[s.user?.username ?? ""] ?? s.hiveBalance),
          };
        }),

      addActivity: (activity) =>
        set((s) => ({
          activities: [
            { ...activity, id: uid("act"), createdAt: activity.createdAt ?? new Date().toISOString() },
            ...s.activities,
          ],
        })),

      addTransaction: (tx) =>
        set((s) => ({
          transactions: [
            { ...tx, id: uid("tx"), createdAt: tx.createdAt ?? new Date().toISOString() },
            ...s.transactions,
          ],
        })),

      createCollection: async (input) => {
        const state = get();
        const creator = state.user?.username ?? "alice";
        const collectionId = uid("col");
        const collection: Collection = {
          id: collectionId,
          name: input.name,
          symbol: input.symbol.toUpperCase(),
          creator,
          description: input.description,
          image: input.image || generateArtwork(`collection-${input.symbol}-${input.name}`, "Epic"),
          maxSupply: input.maxSupply,
          minted: 0,
          mintPrice: input.mintPrice,
          creatorFee: input.creatorFee,
          platformFee: input.platformFee,
          rarities: input.rarities,
          traitLayers: input.traitLayers ?? buildCollectionTraitLayers(collectionId, input.name.split(" ").filter(Boolean)),
          status: "Minting",
          createdAt: new Date().toISOString(),
          floorPrice: input.mintPrice,
          volume: 0,
          holders: 0,
          trendingScore: 50,
          metadataBaseUri: input.metadataBaseUri,
          ...(input.assets ? { storage: input.assets } : {}),
        };

        const fee = input.creationCost ?? COLLECTION_CREATION_FEE;
        if ((state.balances[creator] ?? 0) < fee) {
          throw new Error(`Insufficient HIVE balance — deployment costs ${fee.toFixed(2)} HIVE`);
        }

        const tx = await hiveService.transfer(
          creator,
          "hivemint",
          fee,
          `Collection deployment · ${collection.name}`,
        );
        await databaseService.saveCollection(collection);

        set((s) => ({
          collections: [collection, ...s.collections],
          ...(input.importedNfts?.length
            ? {
                unminted: {
                  ...s.unminted,
                  [collectionId]: input.importedNfts.map((nft) => ({ ...nft, collectionId })),
                },
              }
            : {}),
        }));
        get().updateBalance(creator, -fee);
        get().addTransaction({
          txId: tx.txId,
          type: "collection_create",
          from: creator,
          to: "hivemint",
          amount: fee,
          memo: `Collection deployment · ${collection.name}`,
        });
        get().addActivity({
          type: "Collection Created",
          actor: creator,
          collectionId: collection.id,
          label: `@${creator} created ${collection.name}`,
          amount: fee,
          txId: tx.txId,
        });
        return collection;
      },

      selectRandomNFT: async (collectionId) => {
        const collection = get().collections.find((c) => c.id === collectionId);
        if (!collection || collection.minted >= collection.maxSupply) return null;

        // Imported collection: claim an existing unminted record at random.
        const pool = get().unminted[collectionId];
        if (pool?.length) {
          const index = Math.floor(Math.random() * pool.length);
          const picked = pool[index]!;
          set((s) => ({
            unminted: { ...s.unminted, [collectionId]: (s.unminted[collectionId] ?? []).filter((_, i) => i !== index) },
          }));
          return { ...picked, owner: get().user?.username ?? "alice", createdAt: new Date().toISOString() };
        }

        const tokenId = await databaseService.nextTokenId(collection);
        const token = await marketplaceService.generateToken(collection, tokenId);
        return buildNFT({
          collection,
          mintNumber: tokenId,
          owner: get().user?.username ?? "alice",
          token,
          rankTotal: Math.max(1, Math.min(collection.maxSupply, RANK_POOL_CAP)),
          createdAt: new Date().toISOString(),
          seedKey: `${collection.id}-${tokenId}-${Date.now()}`,
        });
      },

      mintNFT: async (collectionId) => {
        const collection = get().collections.find((c) => c.id === collectionId);
        if (!collection) throw new Error("Collection not found");
        const buyer = get().user?.username ?? "alice";
        const quote = await marketplaceService.quoteMint(collection);
        if ((get().balances[buyer] ?? 0) < quote.total) throw new Error("Insufficient HIVE balance");

        const nft = await get().selectRandomNFT(collectionId);
        if (!nft) throw new Error("Collection is sold out");

        const tx = await hiveService.transfer(buyer, "hivemint", quote.total, `Mint · ${collection.name}`);
        await hiveService.issueNft(collection.symbol, buyer, nft.tokenId);
        await databaseService.saveNft(nft);

        const creatorShare = Number((quote.mintPrice * (collection.creatorFee / 100)).toFixed(2));

        set((s) => ({
          nfts: [nft, ...s.nfts],
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  minted: c.minted + 1,
                  volume: Number((c.volume + quote.total).toFixed(2)),
                  holders: c.holders + 1,
                  status: c.minted + 1 >= c.maxSupply ? "Sold Out" : c.status,
                }
              : c,
          ),
        }));

        get().updateBalance(buyer, -quote.total);
        get().updateBalance(collection.creator, creatorShare);
        get().addTransaction({
          txId: tx.txId,
          type: "mint",
          from: buyer,
          to: "hivemint",
          amount: quote.total,
          memo: `Mint · ${collection.name} · ${nft.name}`,
        });
        get().addActivity({
          type: "Minted",
          actor: buyer,
          nftId: nft.id,
          collectionId,
          label: `@${buyer} minted ${nft.name}`,
          amount: quote.mintPrice,
          txId: tx.txId,
        });

        return { nft, txId: tx.txId };
      },

      listNFT: async (nftId, price) => {
        const nft = get().nfts.find((n) => n.id === nftId);
        if (!nft) throw new Error("NFT not found");
        const tx = await hiveService.transfer(nft.owner, "hivemint-market", 0, `List · ${nft.name}`);
        const listing: Listing = {
          id: uid("lst"),
          nftId,
          seller: nft.owner,
          price,
          currency: "HIVE",
          listedAt: new Date().toISOString(),
          featured: false,
        };
        set((s) => ({
          listings: [listing, ...s.listings],
          nfts: s.nfts.map((n) => (n.id === nftId ? { ...n, status: "Listed" } : n)),
        }));
        get().addTransaction({
          txId: tx.txId,
          type: "list",
          from: nft.owner,
          to: "hivemint-market",
          amount: price,
          memo: `Listing created · ${nft.name}`,
        });
        get().addActivity({
          type: "Listed",
          actor: nft.owner,
          nftId,
          collectionId: nft.collectionId,
          label: `@${nft.owner} listed ${nft.name}`,
          amount: price,
          txId: tx.txId,
        });
        return listing;
      },

      cancelListing: (listingId) => {
        const listing = get().listings.find((l) => l.id === listingId);
        if (!listing) return;
        set((s) => ({
          listings: s.listings.filter((l) => l.id !== listingId),
          nfts: s.nfts.map((n) => (n.id === listing.nftId ? { ...n, status: "Owned" } : n)),
        }));
        const nft = get().nfts.find((n) => n.id === listing.nftId);
        get().addActivity({
          type: "Delisted",
          actor: listing.seller,
          nftId: listing.nftId,
          collectionId: nft?.collectionId ?? "",
          label: `@${listing.seller} cancelled listing for ${nft?.name ?? "NFT"}`,
          amount: listing.price,
        });
      },

      buyNFT: async (listingId) => {
        const state = get();
        const listing = state.listings.find((l) => l.id === listingId);
        if (!listing) throw new Error("Listing not found");
        const nft = state.nfts.find((n) => n.id === listing.nftId);
        if (!nft) throw new Error("NFT not found");
        const buyer = state.user?.username ?? "alice";
        const quote = await marketplaceService.quotePurchase(listing.price);
        if ((state.balances[buyer] ?? 0) < quote.total) throw new Error("Insufficient HIVE balance");

        const tx = await hiveService.transfer(buyer, listing.seller, quote.total, `Purchase · ${nft.name}`);

        set((s) => ({
          listings: s.listings.filter((l) => l.id !== listingId),
          nfts: s.nfts.map((n) =>
            n.id === nft.id
              ? {
                  ...n,
                  owner: buyer,
                  status: "Owned",
                  estimatedValue: Number(
                    (listing.price * 1.05 * (rarityMultiplier(n.rarity) > 4 ? 1.05 : 1)).toFixed(2),
                  ),
                }
              : n,
          ),
          collections: s.collections.map((c) =>
            c.id === nft.collectionId
              ? {
                  ...c,
                  volume: Number((c.volume + listing.price).toFixed(2)),
                  floorPrice: Math.min(c.floorPrice, listing.price),
                }
              : c,
          ),
        }));

        get().updateBalance(buyer, -quote.total);
        get().updateBalance(listing.seller, listing.price - quote.fee);
        get().addTransaction({
          txId: tx.txId,
          type: "sale",
          from: buyer,
          to: listing.seller,
          amount: quote.total,
          memo: `Marketplace purchase · ${nft.name}`,
        });
        get().addActivity({
          type: "Sold",
          actor: buyer,
          target: listing.seller,
          nftId: nft.id,
          collectionId: nft.collectionId,
          label: `@${buyer} purchased ${nft.name}`,
          amount: listing.price,
          txId: tx.txId,
        });
      },

      transferNFT: async (nftId, to) => {
        const nft = get().nfts.find((n) => n.id === nftId);
        if (!nft) throw new Error("NFT not found");
        const tx = await hiveService.issueNft(nft.collectionName, to, nft.tokenId);
        set((s) => ({
          nfts: s.nfts.map((n) => (n.id === nftId ? { ...n, owner: to, status: "Owned" } : n)),
          listings: s.listings.filter((l) => l.nftId !== nftId),
        }));
        get().addTransaction({
          txId: tx.txId,
          type: "transfer",
          from: nft.owner,
          to,
          amount: 0,
          memo: `Transfer · ${nft.name}`,
        });
        get().addActivity({
          type: "Transferred",
          actor: nft.owner,
          target: to,
          nftId,
          collectionId: nft.collectionId,
          label: `@${nft.owner} transferred ${nft.name} to @${to}`,
          txId: tx.txId,
        });
      },

      resetMockData: () => {
        const fresh = createSeedData();
        set({
          collections: fresh.collections,
          nfts: fresh.nfts,
          listings: fresh.listings,
          activities: fresh.activities,
          transactions: fresh.transactions,
          balances: { ...baseBalances },
          hiveBalance: 125.5,
          user: CURRENT_USER,
          walletConnected: true,
        });
      },
    }),
    {
      name: "hivemint-store-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        user: s.user,
        walletConnected: s.walletConnected,
        hiveBalance: s.hiveBalance,
        balances: s.balances,
        collections: s.collections,
        nfts: s.nfts,
        listings: s.listings,
        transactions: s.transactions,
        activities: s.activities,
      }),
    },
  ),
);

export const FEES = { PLATFORM_FEE_RATE, MARKETPLACE_FEE_RATE, COLLECTION_CREATION_FEE };
export { mockTxId };
