# Contributing to grounded-json

Thanks for helping make evidence-backed extraction easier to trust.

## Before you start

- Use an issue for behavior changes, new transforms, or changes to the receipt format.
- Keep the verifier deterministic and offline.
- Treat every HTML document, receipt, selector, schema, and terminal string as untrusted.
- Do not add network fetching, dynamic schema imports, telemetry, or executable page code to the core package.
- Never describe evidence as proof that a source is factually true.

Small fixes, tests, documentation improvements, and new safe fixtures can go directly to a pull request.

## Local setup

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run check
npm run demo
```

Useful focused commands:

```bash
npm run build:package
npm test
npm run build:site
npm run pack:smoke
```

## Design rules

1. A supported terminal value must be reproducible from submitted evidence.
2. Transform behavior must be deterministic, allowlisted, documented, and tested.
3. Ambiguity and conflicts cause an explicit issue; they are never resolved by confidence.
4. `null`, `false`, `0`, empty strings, and empty containers are values—not missing data.
5. Portable inputs are data. Do not `import`, `eval`, render, or execute them.
6. New limits must fail closed with a useful error.
7. Receipt format changes require a versioning discussion and compatibility fixtures.

## Tests expected with changes

- A happy-path test
- A missing, ambiguous, or malformed input test
- A tampering or hostile-input test when a trust boundary changes
- A deterministic replay assertion for verifier changes

Use invented fixture data. Do not commit scraped personal data, credentials, proprietary pages, or secrets.

## Pull requests

Keep pull requests focused. Explain the user-visible behavior, security implications, and tests performed. By contributing, you agree that your contribution is licensed under the repository's MIT License.
