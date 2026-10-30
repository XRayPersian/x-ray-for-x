# Privacy Policy

**Extension:** X-Ray: Account Check for X  
**Version:** 1.0.0  
**Last Updated:** October 2026  

---

## 1. Principles & Privacy by Design
User privacy is the fundamental priority of **X-Ray: Account Check for X**. This browser extension has been architected strictly following the *Privacy by Design* paradigm:

* **Zero Tracking:** No tracking pixels, analytics suites (such as Google Analytics), or telemetry software are bundled.
* **No Intermediary Servers:** We operate zero central backend servers, databases, or user accounts. User data is never transmitted to, collected on, or stored in any third-party repository.
* **No Data Monetization:** No personal or browsing information is ever sold, rented, or distributed.

---

## 2. Processed Data & Technical Purpose

### A. Groq API Key
* **Purpose:** Required to execute LLM inferences directly with the Groq Cloud API.
* **Storage:** Your private API key is stored exclusively within your browser's encrypted sandbox via the official Chrome Extension API (`chrome.storage.sync`).
* **Transmission:** The key is transmitted exclusively via encrypted TLS/HTTPS in the `Authorization: Bearer <KEY>` header directly to Groq's official API endpoint (`https://api.groq.com/openai/v1/chat/completions`).

### B. Tweet and Profile Content (Text & Metadata)
* **Purpose:** Analyzing ideological alignments, bot characteristics, and rhetorical patterns on x.com.
* **On-Demand Processing:** The extension processes content only when you explicitly and intentionally click the **🕵️ Account Check** button or initiate a profile scan. No background automated scraping is conducted.
* **Ephemeral Processing:** Tweet text and public metadata are dispatched via encrypted HTTPS to Groq's API for immediate inference and are neither logged nor retained.

---

## 3. Third-Party Services (Groq Inc.)
Inference is powered by **Groq Inc. (USA)** utilizing open-source models (e.g. `llama-3.3-70b-versatile`).
* Analysis requests adhere to Groq's standard privacy practices: [Groq Privacy Policy](https://groq.com/privacy-policy/).
* According to Groq's API developer terms, data submitted via their enterprise API endpoints is not used to train generative AI models.

---

## 4. Extension Permissions

| Permission | Technical Purpose |
| :--- | :--- |
| `storage` | Safely saves your Groq API key in `chrome.storage.sync` so you do not need to re-enter it on each session. |
| `https://x.com/*` | Enables the content script to insert the inspection button into tweet cards and profile headers. |
| `https://twitter.com/*` | Ensures legacy and redirect compatibility for twitter.com URLs. |
| `https://api.groq.com/*` | Grants the background service worker permission to communicate with Groq's inference endpoint. |

---

## 5. Control, Data Erasure & Removal
* **Remove API Key:** You can permanently delete your saved Groq API key at any time by opening the extension popup and selecting *Remove Key*.
* **Full Uninstallation:** Removing the extension from your browser (`chrome://extensions`) completely and irreversibly deletes all stored configuration and cached data.

---

## 6. Contact & Open Source Auditing
X-Ray is free and open-source software. The full source code is publicly accessible and auditable directly within this repository.
