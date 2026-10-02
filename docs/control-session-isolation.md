# Control session isolation

The `/api/control/` namespace uses `control_sessions`, separate from the App's
`sessions`. Both retain one token per account within their own namespace.
Control login/logout never replace App tokens or invoke App socket revocation.
App login/logout never replace control tokens. Tokens cannot cross namespaces.

Existing control browser tabs must log in again. Existing App tokens are kept;
legacy shared tokens are not copied, migrated, or deleted during deployment.
Administrator role checks are unchanged; this does not restrict accounts to a
hardcoded username or demote existing administrators.

Password changes, administrative resets, account suspension and deletion revoke
both namespaces. Control requests also compare the current password hash and
suspension update timestamp, so password resets and suspension/restoration by
older table workers cannot reactivate a stale control token. Role and temporary
password requirements are rechecked on every authorized request.

Deploy from `main` with an immutable release manifest. Do not bundle unrelated
worktree changes. Keep old table workers and their App sockets running. The
control HTTP route must reach the new active worker, not legacy table owners;
rehearse any edge routing change with a held WebSocket before production use.
No APK/IPA rebuild is needed for this server-only change.
