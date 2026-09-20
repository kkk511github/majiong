import type { Account } from "./types";
export const TABLE_CREATOR_USERNAME = "guanli@1";

/** Creating tables is separate from the other administrator capabilities. */
export function isTableCreator(account: Pick<Account, "username" | "role">): boolean {
  return account.role === "admin" && account.username.toLowerCase() === TABLE_CREATOR_USERNAME;
}

export function mayCreateTables(account: Account | null | undefined): boolean {
  return (
    !!account &&
    !account.mustChangePassword &&
    account.canCreateTables === true
  );
}
