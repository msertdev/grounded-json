# Security policy

## Supported versions

Security fixes are provided for the latest `0.1.x` release while the project is pre-1.0.

## Report a vulnerability

Please use GitHub's **Report a vulnerability** flow in the Security tab of this repository. Do not open a public issue for a suspected vulnerability or include exploit details in a public pull request.

Include the affected version, operating system and Node.js version, a minimal reproduction, impact, and any suggested mitigation. You should receive an acknowledgement within seven days. Timelines for a fix or disclosure depend on severity and complexity.

## v0.1 trust boundary

The CLI intentionally accepts local UTF-8 files only. It does not fetch URLs, follow redirects, load `.js` or `.ts` schemas, execute HTML, run a browser, load plugins, read `.env`, or send telemetry.

The following are untrusted inputs:

- HTML, text, JSON-LD, schemas, and receipts
- CSS selectors, JSON Pointers, evidence quotes, and source metadata
- Paths and strings printed to a terminal

The package applies input-size and nesting limits, parses HTML inertly, uses a narrow declarative schema subset, rejects prototype-pollution keys, strips terminal controls, escapes its offline report, and replays evidence rather than trusting stored status labels.

## Important meaning of a receipt

A valid receipt shows that its values can be reproduced from the supplied snapshot and that the receipt is internally consistent. SHA-256 is not a signature. It does not establish who published the source, when it existed, whether it is factually correct, or whether using the data is lawful.

Source embedding is opt-in because source bytes and evidence quotes may contain credentials, personal data, or proprietary content.

## Out of scope

- Vulnerabilities that require a modified local runtime or compromised Node.js installation
- Denial of service using inputs above documented limits that were deliberately accepted by application code
- Factual errors in third-party source material
- Social engineering and attacks against services not operated by this project

Please still report uncertain cases privately; the maintainer will help determine scope.
