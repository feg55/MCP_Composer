# Security policy

## Supported deployment modes

`APP_MODE=local` is a trusted-workstation mode. It can execute user-supplied stdio commands by design. Bind it to loopback and never expose it to an untrusted network.

`APP_MODE=hosted` is the deployment baseline. It blocks stdio, restricts remote MCP connections, validates browser origins, disables client-defined proxy calls, and turns off API documentation by default.

## Public deployment checklist

- Terminate TLS at a trusted reverse proxy.
- Require authentication before traffic reaches MCP Composer.
- Apply request rate limits and concurrency limits at the reverse proxy.
- Keep the application port bound to a private interface or loopback.
- Set exact allowed origins and HTTP hosts.
- Allowlist exact remote MCP hostnames.
- Restrict outbound traffic with a firewall or container network policy.
- Keep the container non-root and its root filesystem read-only.
- Do not add a writable data mount in hosted mode. Generated artifacts are returned to the browser without server-side persistence.
- Never mount a Docker socket, host filesystem, cloud credentials, or SSH keys.
- Rotate credentials if they were ever committed or stored in an old browser state.
- Keep dependency audit and backend tests green.

## XSS

No direct HTML execution sink is used in the React application. Dynamic values are rendered as text. Generated Markdown escapes HTML and Markdown control characters. Production responses include CSP, `nosniff`, frame denial, a strict referrer policy, and a restrictive permissions policy.

This reduces risk but does not prove that future code is XSS-free. Treat any introduction of raw HTML, Markdown rendering, dynamic URLs, or third-party widgets as a security review trigger.

## CSRF

The project currently has no cookie-based authentication, so classic authenticated CSRF is not the primary threat. Hosted mode still requires an allowed `Origin` for state-changing requests and accepts only `application/json`.

CORS is not a replacement for CSRF protection. If cookie authentication is added, require an unpredictable CSRF token and use `Secure`, `HttpOnly`, and `SameSite` cookie attributes.

## Command execution and SSRF

Local stdio is equivalent to local command execution. Only add commands and packages you trust.
Registry entries and built-in templates can contain package commands such as `npx` or `uvx`. Treat them as untrusted suggestions, pin an exact version or digest where the package manager supports it, and review the command before discovery or execution.

Hosted mode:

- rejects all stdio transports;
- accepts only HTTPS remote MCP URLs;
- rejects URL credentials;
- requires an exact remote hostname allowlist;
- rejects non-public DNS and IP results;
- disables HTTP redirects and proxy environment variables in hosted connector clients;
- disables client-defined proxy calls.
- limits concurrent upstream connection and discovery requests;
- bounds discovered tool counts and serialized schema sizes.

Application checks do not replace network isolation. DNS rebinding and future connector changes are reasons to enforce outbound policy outside the process.

## Secrets

Do not put raw secrets in committed server definitions. Prefer environment references such as `${GITHUB_TOKEN}` for local runtime configuration. The frontend does not persist runtime server configs, task details, notes, audit logs, or generated output to localStorage.

Generated artifacts can still contain sensitive runtime configuration. Hosted mode does not store them server-side. Local-mode files are ignored by Git, written atomically with restricted permissions, and should be protected with filesystem and backup policies.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/feg55/MCP_Composer/security/advisories/new). If that form is unavailable, open a minimal issue asking the owner for a private contact method and do not include exploit details. Include the affected version, deployment mode, reproduction steps, impact, and a proposed mitigation if available.
