# Root Cause Project Constitution

This document lists the coding conventions, constraints, and quality bars to be enforced throughout the development of the "Root Cause" application.

---

## 1. Strict TypeScript Mode
- We follow strict checking standards configured in `tsconfig.json`.
- Avoid using the `any` type as a bypass. Use explicit interfaces or structural types.
- Ensure proper nullish handling checks when accessing API results.

## 2. Secrets & Operations Security
- Under no circumstances should `GITHUB_TOKEN` or `LLM_API_KEY` be referenced or used in any client-side component code.
- Prefixing of client-accessible env variables with `NEXT_PUBLIC_` must not apply to any API keys.
- All actions involving secrets occur solely inside API routes (`src/app/api/...`) running in the Node.js server environment.

## 3. Error Handling Integrity
- Every outward HTTP/REST invocation (calls to Github, calls to LLM endpoint) must wrap inside try-catch structures.
- In case of network drops or provider degradation (e.g. LLM timeout), the application should respond with structured error payloads to the client.
- When an API key is missing or invalid, the backend must return a friendly user message rather than crashing or throwing an unhandled exception.

## 4. UI/UX Excellence
- Leverage standard CSS Modules or globals stylesheet instead of utility CSS Frameworks.
- Adhere to the design aesthetic: Premium, responsive, glassmorphic styling, dark theme, fluid transitions, and clear progress states.

## 5. Testability
- Core utility skills (like the `stack-trace-parser`) must remain decoupled from server APIs to ensure they remain easily testable under mock framework states.
- Running tests must not require active ecosystem environment variables to be defined, enabling zero-conf CI pipeline status checks.
