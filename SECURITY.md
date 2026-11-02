# Security Policy

## Supported Versions

The following versions of Viezan are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | ✅ Yes             |
| < 1.0   | ❌ No              |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in Viezan, please follow responsible disclosure practices.

### How to Report

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, report security vulnerabilities via one of the following channels:

- **Email**: [support@viezan.app](mailto:phamhieu.vn48@gmail.com)  
  Use the subject line: `[SECURITY] <brief description>`

- **GitHub Private Vulnerability Reporting**: Use the [Security Advisories](https://github.com/trunghieupham59/viezan/security/advisories/new) feature on GitHub.

### What to Include

Please include as much of the following information as possible to help us understand and resolve the issue quickly:

- Type of vulnerability (e.g., XSS, RCE, privilege escalation, data exposure)
- Full path of source file(s) related to the vulnerability
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if available)
- Potential impact of the vulnerability

### Response Timeline

| Stage                          | Timeline       |
| ------------------------------ | -------------- |
| Acknowledgement of report      | Within 48 hours |
| Initial assessment             | Within 5 days  |
| Fix and patch release          | Within 30 days (depending on severity) |

We will keep you informed of our progress throughout the process.

## Security Considerations

### API Key Storage

Viezan stores API keys (Google Gemini, Anthropic Claude, OpenAI GPT) **exclusively in the OS Keychain** (macOS Keychain, Windows Credential Manager). Keys are **never**:

- Sent to any intermediate server
- Stored in plain text on disk
- Included in logs or crash reports

### Network Communication

All AI API calls are made **directly** from your device to the respective AI provider's API endpoint. Viezan does not operate any backend servers that proxy or intercept your requests or data.

### Native application boundaries

SwiftUI and Qt Quick views delegate privileged work to native services.
Security reports may cover credential access, macOS helper authorization,
and native backup or update handling.

## Scope

The following are **in scope** for vulnerability reports:

- The Viezan desktop application (macOS, Windows and Linux)
- Any logic that handles API keys or user data

The following are **out of scope**:

- Third-party AI provider APIs (Google, Anthropic, OpenAI)
- Issues in upstream dependencies (please report those to the respective maintainers)
- Social engineering attacks

## Acknowledgements

We appreciate responsible disclosure and will acknowledge security researchers who help us keep Viezan safe for everyone.
