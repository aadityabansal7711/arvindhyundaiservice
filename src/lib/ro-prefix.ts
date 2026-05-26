// Compulsory branch prefix on RO numbers so per-branch 1..N series don't collide.
// Keep this mapping in sync with the SQL migration that back-fills existing rows.
export const RO_PREFIX_BY_BRANCH_NAME: Record<string, string> = {
  bypass: "BP",
  fatehabad: "FT",
  dharera: "DH",
};

export const RO_PREFIX_SEPARATOR = "-";

export function getRoPrefixForBranchName(branchName: string | null | undefined): string | null {
  if (!branchName) return null;
  return RO_PREFIX_BY_BRANCH_NAME[branchName.trim().toLowerCase()] ?? null;
}

const ALL_PREFIXES = Object.values(RO_PREFIX_BY_BRANCH_NAME);

/** Strip any leading known branch prefix (and optional separator) from a raw RO. */
export function stripAnyRoPrefix(raw: string): string {
  let value = raw.trim();
  for (const p of ALL_PREFIXES) {
    const re = new RegExp(`^${p}[-/_ ]?`, "i");
    if (re.test(value)) {
      value = value.replace(re, "");
      break;
    }
  }
  return value;
}

/**
 * Returns the canonical RO number for the given branch.
 * - Strips any existing branch prefix the user may have typed.
 * - Prepends the prefix for `branchName` (when one is configured).
 * - Returns the trimmed input unchanged if the branch has no configured prefix.
 */
export function applyRoPrefix(branchName: string | null | undefined, rawRo: string): string {
  const trimmed = rawRo.trim();
  if (!trimmed) return trimmed;
  const prefix = getRoPrefixForBranchName(branchName);
  if (!prefix) return trimmed;
  const base = stripAnyRoPrefix(trimmed);
  return `${prefix}${RO_PREFIX_SEPARATOR}${base}`;
}
