/**
 * Metadata <-> image matching.
 *
 * Matching is by (normalised) FILENAME, never by array order.
 *   "image": "images/otter-#1.png"  ->  uploaded file  otter-#1.png   ✓ MATCHED
 *   "image": "ipfs://Qm.../7.PNG"   ->  uploaded file  7.png          ✓ MATCHED
 */

/** Strips directories, ipfs:// prefixes and query strings from an image ref. */
export function imageBasename(reference: string): string {
  const withoutQuery = reference.split(/[?#]/)[0] ?? reference;
  const withoutScheme = withoutQuery.replace(/^[a-z]+:\/\//i, "");
  return (withoutScheme.split(/[\\/]/).pop() ?? withoutScheme).trim();
}

/**
 * Normalised match key: lowercased basename with whitespace and separators
 * collapsed so `Otter #1.png`, `otter-#1.PNG` and `otter_#1.png` all match.
 */
export function imageKey(reference: string): string {
  return imageBasename(reference)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]+/g, "-");
}

export interface ImageIndex {
  /** key -> filename (first wins) */
  byKey: Map<string, string>;
  /** filenames that produced the same key */
  duplicates: string[];
}

export function indexImages(filenames: string[]): ImageIndex {
  const byKey = new Map<string, string>();
  const duplicates: string[] = [];
  for (const filename of filenames) {
    const key = imageKey(filename);
    if (byKey.has(key)) duplicates.push(filename);
    else byKey.set(key, filename);
  }
  return { byKey, duplicates };
}

export interface MatchResult {
  /** metadata index -> uploaded filename */
  matched: Map<number, string>;
  /** metadata indices with no uploaded image */
  missing: number[];
  /** uploaded filenames no metadata references */
  orphans: string[];
}

export function matchImages(imageRefs: string[], filenames: string[]): MatchResult {
  const index = indexImages(filenames);
  const used = new Set<string>();
  const matched = new Map<number, string>();
  const missing: number[] = [];

  imageRefs.forEach((reference, i) => {
    const filename = index.byKey.get(imageKey(reference));
    if (filename) {
      matched.set(i, filename);
      used.add(filename);
    } else {
      missing.push(i);
    }
  });

  const orphans = filenames.filter((filename) => !used.has(filename));
  return { matched, missing, orphans };
}
