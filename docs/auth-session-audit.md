# Authentication audit

Server-only diagnostics for App and `/manage/` logins. This does not change the
single-session policy, account roles, scoring, or client error handling.

Structured `auth-audit` records are written to the runtime worker's container
log. Fields include UTC timestamp with milliseconds, runtime, server-generated
request ID, method, query-free API path, attempted username, verified actor,
affected account, issuance/revocation reason, replacement flag and HTTP status.
Passwords, credentials, session tokens, their hashes, headers and bodies are not
logged. Unrecognized or token-shaped paths are replaced with `/api/other`.

Events:

- `session-issued`: App registration/login/password change or control login.
- `session-revoked`: logout, password reset/change, deletion or suspension.
- `auth-rejected`: session/permission failure in `requireSession`.
- `request-rejected`: unsuccessful response from auth/control/announcement routes.

A rejection and its response can both appear; correlate by `requestId`. Actor
means the authenticated caller; `accountId` means the account being changed.
For expired tokens the server cannot recover the original account from the
sessions table, so no identity is guessed. Login attempts can be unverified.

Logging failures do not change auth results. Failure records are capped at 1,000
per worker per minute; issuance/revocation is not subject to this cap. Production
workers retain three rotating 10 MB container log files. This is a diagnostic
trail, not a durable security ledger or an App log-upload UI.

Read logs with a bounded `docker logs --since <UTC timestamp> <worker>` and parse
only JSON lines with `kind=auth-audit`. Never dump requests or the sessions table.

Deploy a new immutable worker using the normal runtime rollout; do not restart
the stable gateway or workers owning ongoing tables. Existing workers and the
gateway do not gain audit logging retroactively. Gateway-local WebSocket closures
are not covered by these HTTP/session audit records. Reproduction should use
the lobby/new worker; old-table auth requests may still reach the old owner.
No mobile repackaging is required.
