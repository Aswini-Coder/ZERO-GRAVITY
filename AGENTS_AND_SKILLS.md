# Triage Agent and Custom Skills

This document details the configuration and usage of the custom agent and custom skill embedded in the Root Cause application.

---

## 1. Custom Skill: Stack Trace Parser

### Location
[`src/skills/stack-trace-parser.ts`](file:///d:/gdg/src/skills/stack-trace-parser.ts)

### Description
The `stack-trace-parser` parses raw error logs or traces into structured elements (`{ file, function, line }`). This acts as the translation layer to identify which files and line numbers were active when the execution failed.

### How it is used in the app
1. Inside the API orchestration route (`/api/triage`), the stack trace input is sent to the parser.
2. The extracted filenames are used to filter and sort GitHub commit relevance (by checking which commits touched the matching files/folders).
3. The parsed context is provided alongside git commit data to the LLM agent to focus the correlation analysis.

---

## 2. Custom Agent: Triage Agent

### Location
[`src/agents/triage-agent.ts`](file:///d:/gdg/src/agents/triage-agent.ts)

### Description
The `triage-agent` simulates a production triage engineer. Its job is to:
- Correlate Stack Trace frames with git diff content.
- Inspect similarities in past GitHub Issues.
- Formulate a hypothesis of *why* the crash happened, pinpointing the actual regression (citing the exact commit payload or issue context). Our frontend calls this agent as the final correlation step.

### Prompt Configuration
The agent formats a structured system prompt directing the LLM to behave like a triage specialist. It instructs the LLM not to halluncinate, enforce citing a specific commit hash (or issue ID) where the offending code resides, and output standard structure maps.
