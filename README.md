# Root Cause — Production Debugging Assistant

Root Cause is a developer accelerator that automates the initial triage phase of production service failures. By correlating a stack trace with recent git changes and historical GitHub issues, it highlights the likely regression and suggests a specific fix location.

---

## Prerequisites & Installation

To run this project on a clean development machine, you must have **Node.js (LTS version, >=18)** installed.

1. **Clone the repository** and navigate to the project directory:
   ```bash
   cd root-cause
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

---

## Environment Variables Configuration

Create a file named `.env.local` in the root directory and configure the following variables:

```bash
# Personal GitHub Token used to fetch commit histories & search issues.
# Permissions required: read access to public repos.
GITHUB_TOKEN=your_github_token_here

# LLM API Authentication Key.
LLM_API_KEY=your_llm_api_key_here

# LLM API Base URL (OpenAI-compatible endpoints).
# Example: https://api.openai.com/v1 or any compatible endpoints.
LLM_BASE_URL=https://api.openai.com/v1
```

> [!WARNING]
> Never commit `.env.local` to source control. It contains sensitive credentials.

---

## Live Production Debugging Workflow

To test Root Cause with a live, real-world GitHub repository:

1. **Obtain your credentials**:
   - **GitHub Personal Access Token (`GITHUB_TOKEN`)**: Create a token at GitHub Developer Settings with read access to public repositories.
   - **LLM API Key (`LLM_API_KEY`)**: Create an API key with your chosen provider (e.g. OpenAI API, NVIDIA NIM, Gemini, or Deepseek).
   - **LLM Base URL (`LLM_BASE_URL`)**: Defaults to `https://api.openai.com/v1`. If you use alternate providers, update it accordingly.

2. **Save credentials** in `.env.local` inside the project root:
   ```bash
   GITHUB_TOKEN=ghp_ABC123...
   LLM_API_KEY=sk-proj-xyz...
   LLM_BASE_URL=https://api.openai.com/v1
   ```

3. **Start the local server**:
   ```bash
   npm run dev
   ```

4. **Run live analysis**:
   - Go to `http://localhost:3000` in your web browser.
   - Type in the owner/repo path of a public repository you want to triage (e.g. `facebook/react`).
   - Paste a raw stack trace referencing files in that project scope (e.g. containing `packages/react-dom/src/client/ReactDOMRoot.js:50`).
   - Click **Analyze & Identify Root Cause**.
   - Review the detailed analysis card, direct cited links to GitHub, and the list of related commits and issues.
   - **Demo Mode**: If you do not have credential keys ready, click **✨ Try Demo** or type `mock/demo` as the repository name to run a simulation.

---

## Running the Application

### Development Server
Run the local next development environment:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) using your web browser.

### Production Build
Validate production compilation and run check processes:
```bash
npm run build
```

### Run Tests
Execute the unit tests verifying parsing capability on a clean mock:
```bash
npm run test
```

---

## Project Structure
- `src/skills/stack-trace-parser.ts`: Parsing skill extracting files, methods, lines, and ranking commits.
- `src/agents/triage-agent.ts`: LLM integration correlating diffs and logs.
- `src/app/api/triage/route.ts`: Mid-layer routing that aggregates GitHub and LLM outputs.
- `src/app/page.tsx`: Single-page visual debugger UI.
- `src/app/globals.css`: Premium dark mode CSS layout rules.
- `.github/workflows/ci.yml`: CI validation checking compilation and tests.

