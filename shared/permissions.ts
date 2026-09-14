import type { Account } from "./types";
export function mayCreateTables(account: Account | null | undefined): boolean {
  return (
    !!account &&
    !account.mustChangePassword &&
    (account.role === "admin" || account.canCreateTables === true)
  );
}
