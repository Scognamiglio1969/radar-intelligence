# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report them privately via GitHub's
[Security Advisories](../../security/advisories/new) (Report a vulnerability), or by
email to the maintainer. We aim to acknowledge reports within a few days and will keep
you updated on the fix.

## Handling secrets

- **Never commit API keys, tokens, or passwords.** `.env*` files are gitignored.
- The app is designed for **bring-your-own-keys**: connector credentials are entered from
  the UI and stored encrypted at rest; the Anthropic key is provided per-deployment.
- If you fork or self-host, set a strong `SESSION_SECRET` and a real `ADMIN_PASSWORD`
  (otherwise the app forces a password change at first login).
- If you ever expose a key, **rotate it immediately** at the provider.

## Scope

This project is provided as-is under the AGPL-3.0 license, without warranty. Operators are
responsible for the security of their own deployments and for complying with the Terms of
Service of the data sources they enable.
