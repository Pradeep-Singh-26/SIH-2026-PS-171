# SIH-2026-PS-171: Privacy-Preserving Autonomous Browser Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-success.svg)](extension/manifest.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](tsconfig.json)
[![Runtime](https://img.shields.io/badge/Runtime-Bun%20%2F%20Node.js-orange.svg)](https://bun.com)
[![Privacy Gate](https://img.shields.io/badge/Privacy%20Gate-Fail--Closed-green.svg)](extension/src/privacy/PrivacyGate.ts)

> **Smart India Hackathon (SIH 2026) — Problem Statement 171**  
> A zero-leakage, client-side perception and privacy redaction engine for autonomous web browsing agents. Guarantees that sensitive user data (passwords, auth tokens, credit cards, emails, phone numbers, PII) never leaves the browser.

---

## 📖 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Documentation & Deep-Dive](#documentation--deep-dive)
- [Testing](#testing)
- [Privacy & Security Guarantees](#privacy--security-guarantees)

---

## 🌟 Overview

Conventional web agents take full-page screenshots or dump raw DOM trees and transmit them directly to cloud LLM providers. This causes critical privacy leaks (passwords, bank info, PII) and violates global regulations such as **DPDP Act 2023 (India)** and **GDPR**.

This repository implements a **100% local, client-side perception and privacy pipeline** running inside a Manifest V3 browser extension:
1. **Local DOM Perception**: Extracts interactive and semantic nodes without ever accessing form input values (`.value`).
2. **Deterministic Relevance Scoring**: Ranks and filters elements against the user's task using mathematical keyword, phrase, and intent matching—no LLM or remote embeddings needed.
3. **13-Stage Privacy Engine**: Local PII detection, evidence fusion, taint tracking, S0-S4 sensitivity classification, local token vault mapping (`<EMAIL_1>`), DOM redaction, and data minimization.
4. **Fail-Closed Privacy Gate**: Evaluates structural validity, age, and residual leakage before releasing sanitized context.

---

## 🚀 Key Features

- 🔒 **Zero-Read Invariant**: The content script never reads `.value` properties of inputs or textareas.
- 🛡️ **Fail-Closed Privacy Gate**: Outbound data is strictly blocked if any residual leakage, untransformed taint, or anomaly is detected.
- 🎯 **Deterministic Relevance Scoring**: Top-K element ranking based on exact match, keyword overlap, intent alignment, and form heuristics.
- 🏷️ **Local Token Vault**: Sensitive entities are mapped to sequential tokens (`<EMAIL_1>`, `<PHONE_1>`). The reverse lookup table is strictly isolated in browser RAM.
- 📜 **Safe Privacy Receipts**: Emits comprehensive, audit-ready developer logs with detection counts and gate verdicts without disclosing raw user data.
- ⚡ **Ultra-Fast & Lightweight**: Zero external network dependencies for perception and privacy—executes in milliseconds on-device.

---

## 🏗️ Architecture Overview

```
[ Active Webpage DOM ]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│             CHROME EXTENSION (CONTENT SCRIPT)          │
│                                                        │
│  1. DomPerceptionAdapter                               │
│     Extracts semantic & interactive nodes (No values) │
│                                                        │
│  2. ContextSelector                                    │
│     Deterministic scoring against user task (Top-K)    │
│                                                        │
│  3. Local PrivacyEngine Pipeline                       │
│     Detect ──► Fuse ──► Taint ──► Classify ──► Tokenize│
│                                                        │
│  4. Residual Leakage Verification                      │
│     Regex pattern scan + local token vault check       │
│                                                        │
│  5. PrivacyGate (ALLOW / BLOCK)                        │
└────────────────────────────────────────────────────────┘
          │
          │ (ALLOW verdict with tokens only)
          ▼
┌────────────────────────────────────────────────────────┐
│               REMOTE AGENT SERVER / LLM                │
│  POST /agent  --> Receives sanitized context only      │
└────────────────────────────────────────────────────────┘
```

For the exhaustive architectural specification, see **[DOCUMENTATION.md](DOCUMENTATION.md)**.

---

## 📁 Repository Structure

```
.
├── DOCUMENTATION.md                 # Full technical & architectural documentation
├── README.md                        # Project landing & quickstart guide
├── package.json                     # Root configuration
├── bun.lock                         # Root lockfile
│
├── extension/                       # Browser Extension (Manifest V3)
│   ├── manifest.json                # Extension manifest configuration
│   ├── package.json                 # Extension dependencies & build scripts
│   ├── src/
│   │   ├── content.ts               # Injected content script entry point
│   │   ├── popup.html / popup.ts    # Extension user interface
│   │   ├── types/index.ts           # Core shared types & candidate models
│   │   ├── orchestrator/            # Pipeline coordination (TaskOrchestrator)
│   │   ├── perception/              # DOM extraction & canonicalization
│   │   ├── context/                 # Deterministic relevance scoring
│   │   └── privacy/                 # 13-stage Privacy Engine & Security Gate
│   │       ├── types.ts             # Privacy types & receipts
│   │       ├── PrivacyEngine.ts     # Main Privacy Engine facade
│   │       ├── PrivacyGate.ts       # Fail-closed security boundary
│   │       ├── TokenizationEngine.ts# Local client-side token vault
│   │       ├── PolicyEngine.ts      # Deterministic action mapping
│   │       └── __tests__/           # Full privacy test suite
│
├── server/                          # Agent Coordination Backend
│   ├── package.json                 # Express.js server dependencies
│   └── src/
│       ├── index.ts                 # Server entry point & CORS configuration
│       └── routes/agent.ts          # /agent endpoint accepting sanitized context
│
└── test-sites/                      # Test fixtures & synthetic PII testbeds
    └── dom-test.html                # Form & PII test page for local validation
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **[Bun](https://bun.com)** (v1.1+) or **[Node.js](https://nodejs.org)** (v20+)
- Any Chromium-based browser (Chrome, Brave, Edge)

### 2. Install Dependencies
```bash
# In the extension directory
cd extension
bun install

# In the server directory
cd ../server
bun install
```

### 3. Build Extension
```bash
cd extension
bun run build
```
This compiles `src/content.ts` into `dist/content.js`.

### 4. Load Extension in Browser
1. Open your browser and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in top right).
3. Click **Load unpacked** and select the [`extension/`](extension/) directory.
4. Open [`test-sites/dom-test.html`](test-sites/dom-test.html) in your browser.
5. Open Chrome DevTools Console (`F12`) to inspect the local perception counts, privacy detections, and `PrivacyReceipt`.

### 5. Launch Backend Server
```bash
cd server
bun run src/index.ts
# Running on http://localhost:3001
```

---

## 🧪 Testing

The repository features comprehensive unit and integration test coverage:

```bash
cd extension
bun test
```

### Targeted Test Suites
- **Privacy Engine Integration**: `bun test src/privacy/__tests__/privacy-engine.test.ts`
- **Relevance Scoring & Intent**: `bun test src/context/ContextSelector.test.ts`
- **Residual Leakage Checker**: `bun test src/privacy/__tests__/leakage.test.ts`
- **Privacy Gate Verification**: `bun test src/privacy/__tests__/gate.test.ts`

---

## 🛡️ Privacy & Security Guarantees

| Invariant | Guarantee |
|---|---|
| **Zero Value Leakage** | Form values (`input.value`) are never read during perception. |
| **Airgapped Credentials** | Passwords and Auth Tokens are classified as `S4 Critical` and always `REDACT`ed. |
| **Token Isolation** | Token-to-value mappings reside exclusively in browser RAM and are never emitted. |
| **Fail-Closed Boundary** | If any leak check or structural audit fails, the Privacy Gate defaults to `BLOCK`. |
| **Context Minimization** | Irrelevant sensitive elements are pruned before network dispatch. |

---

## 📚 Documentation & Deep-Dive

For complete details on:
- Formal scoring mathematics & weight distributions
- 13-stage Privacy Engine architecture & dataflow diagrams
- Threat models and DPDP Act / GDPR compliance mapping
- Complete TypeScript interface definitions

👉 Read the **[Complete Technical Documentation](DOCUMENTATION.md)**.
