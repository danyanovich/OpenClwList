# Security Policy

## Supported Scope

This is an early-stage self-hosted project. Security fixes are applied on a best-effort basis to the latest `main` branch.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for credential leaks, auth bypasses, or remote execution risks.

Instead, contact the maintainer privately with:
- affected version / commit
- reproduction steps
- impact assessment
- suggested fix (optional)

If private contact is not available, open a minimal public issue without exploit details and request a secure contact channel.

## Secret Handling Notes

- Do not commit `.env`, `.env.local`, or files from `data/` containing runtime tokens.
- Rotate tokens immediately if they were ever committed or exposed in logs/screenshots.
- For remote mode, prefer a reverse proxy (Caddy/Nginx) and keep the app bound to `127.0.0.1`.
