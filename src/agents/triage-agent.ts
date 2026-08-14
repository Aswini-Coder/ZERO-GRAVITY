/**
 * Root Cause Debugging Agent (Triage Agent)
 *
 * Custom agent that orchestrates the full root-cause analysis pipeline.
 * It directly uses the Stack Trace Parser skill to parse raw traces,
 * rank commits by relevance, and then calls the LLM for correlation.
 *
 * Integration:
 *   API Route → TriageAgent.analyze() → Stack Trace Parser Skill
 *                                     → Commit Ranking (skill)
 *                                     → Issue Filtering
 *                                     → LLM Correlation
 *                                     → CorrelationResult
 */

import {
  parseStackTrace,
  extractErrorMessage,
  rankCommitsByRelevance,
  type ParsedTrace,
  type Commit,
} from "../skills/stack-trace-parser";

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  url: string;
}

export interface CorrelationResult {
  rootCause: string;
  citedCommitHash: string | null;
  citedIssueNumber: number | null;
  suggestedLocation: string;
}

export interface TriageInput {
  rawTrace: string;
  commits: Commit[];
  issues: Issue[];
}

export interface TriageOutput {
  parsedTrace: ParsedTrace[];
  errorMessage: string;
  rankedCommits: Commit[];
  matchingIssues: Issue[];
  correlation: CorrelationResult;
}

// Re-export types consumed by the API route
export type { Commit, ParsedTrace };

const SYSTEM_PROMPT = `You are a production triage agent. Your job is to analyze a stack trace, recent commits with their diff content, and related GitHub issues, to identify the most likely root cause of the error.

RULES:
1. Never invent commit hashes — only cite hashes provided in the input.
2. Never invent GitHub issue numbers — only cite issues provided in the input.
3. Never claim a file was modified without evidence from the diffs.
4. Always cite the relevant commit hash when available.
5. Use the actual diff content as primary evidence.
6. Clearly separate confirmed facts from hypotheses.
7. Explicitly state uncertainty when evidence is insufficient.

You must respond with a JSON object matching this schema:
{
  "rootCause": "Detailed explanation of why the crash happened, referencing evidence from the commits or issues.",
  "citedCommitHash": "Commit hash that introduced the issue, or null if none is found.",
  "citedIssueNumber": 123,
  "suggestedLocation": "file_path.ts:line_number or file_path.py (where to look to fix this issue)"
}

Do not include any text outside the JSON block. Ensure it is valid JSON.`;

/**
 * The Root Cause Debugging Agent.
 *
 * Provides a single `analyze()` entry point that:
 * 1. Parses the raw stack trace using the Stack Trace Parser skill
 * 2. Ranks commits by relevance using the skill's ranking function
 * 3. Filters issues by error-message similarity
 * 4. Sends all evidence to the LLM for correlation
 * 5. Returns a structured TriageOutput
 */
export class TriageAgent {
  /**
   * Full analysis pipeline. This is the main entry point.
   *
   * Uses the Stack Trace Parser skill internally for:
   *  - parseStackTrace()      → extract structured frames
   *  - extractErrorMessage()  → extract the error title
   *  - rankCommitsByRelevance() → score and sort commits
   */
  async analyze(input: TriageInput): Promise<TriageOutput> {
    const { rawTrace, commits, issues } = input;

    // ── Step 1: Use Stack Trace Parser skill ──────────────────────────
    const parsedTrace = parseStackTrace(rawTrace);
    const errorMessage = extractErrorMessage(rawTrace);

    // ── Step 2: Use skill's commit relevance ranking ──────────────────
    const rankedCommits = rankCommitsByRelevance(commits, parsedTrace, errorMessage);

    // ── Step 3: Filter issues by error similarity ─────────────────────
    const matchingIssues = this.filterIssuesBySimilarity(issues, errorMessage);

    // ── Step 4: Call LLM for evidence-backed correlation ──────────────
    const correlation = await this.correlateWithLLM(
      parsedTrace,
      rankedCommits,
      matchingIssues,
      rawTrace
    );

    return {
      parsedTrace,
      errorMessage,
      rankedCommits: rankedCommits.slice(0, 10),
      matchingIssues: matchingIssues.slice(0, 5),
      correlation,
    };
  }

  /**
   * Filters GitHub issues whose title or body textually overlap
   * with the extracted error message (≥40 % token match).
   */
  filterIssuesBySimilarity(issues: Issue[], errorMessage: string): Issue[] {
    const errorLower = errorMessage.toLowerCase();
    if (!errorLower) return [];

    return issues.filter((issue) => {
      const titleLower = issue.title.toLowerCase();
      const bodyLower = issue.body.toLowerCase();

      if (titleLower.includes(errorLower) || bodyLower.includes(errorLower)) {
        return true;
      }

      const errorTokens = errorLower.split(/\s+/).filter((t) => t.length > 3);
      if (errorTokens.length === 0) return false;

      let tokenMatches = 0;
      for (const token of errorTokens) {
        if (titleLower.includes(token) || bodyLower.includes(token)) {
          tokenMatches++;
        }
      }

      return tokenMatches >= errorTokens.length * 0.4;
    });
  }

  /**
   * Sends parsed evidence to the LLM and returns a CorrelationResult.
   * All secrets are read from server-side env vars only.
   */
  private async correlateWithLLM(
    trace: ParsedTrace[],
    commits: Commit[],
    issues: Issue[],
    rawTrace: string
  ): Promise<CorrelationResult> {
    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) {
      throw new Error("LLM_API_KEY environment variable is missing.");
    }

    const userPrompt = this.buildUserPrompt(trace, commits, issues, rawTrace);

    const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        ...(baseUrl.includes("openai")
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `LLM call failed with status ${response.status}: ${errText}`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("No response content returned by the LLM.");
    }

    return this.parseCorrelationJSON(content);
  }

  /** Builds the user-facing prompt sent to the LLM. */
  private buildUserPrompt(
    trace: ParsedTrace[],
    commits: Commit[],
    issues: Issue[],
    rawTrace: string
  ): string {
    return `
Here is the raw stack trace:
\`\`\`
${rawTrace}
\`\`\`

Here are the parsed files and lines of interest:
${JSON.stringify(trace, null, 2)}

Here are the recent commits with diff content:
${commits
  .map(
    (c) => `
Commit: ${c.hash}
Date: ${c.date}
Author: ${c.author}
Message: ${c.message}
Changed Files: ${c.changedFiles.join(", ")}
Diff:
${c.diffText.substring(0, 3000)}
`
  )
  .join("\n--- \n")}

Here are the similar GitHub issues:
${issues
  .map(
    (i) => `
Issue #${i.number} (${i.state}): ${i.title}
Body: ${i.body.substring(0, 1000)}
`
  )
  .join("\n--- \n")}

Review the information above and determine the root cause, citing any relevant commits or issues. Suggest the specific file and location to look at. Provide output in JSON format only.
    `;
  }

  /** Safely parses the LLM's JSON response into a CorrelationResult. */
  private parseCorrelationJSON(content: string): CorrelationResult {
    try {
      const jsonStr = content
        .replace(/^```json\s*/i, "")
        .replace(/```$/, "")
        .trim();
      const result = JSON.parse(jsonStr) as CorrelationResult;
      return {
        rootCause: result.rootCause || "Unknown root cause",
        citedCommitHash: result.citedCommitHash || null,
        citedIssueNumber:
          typeof result.citedIssueNumber === "number"
            ? result.citedIssueNumber
            : parseInt(result.citedIssueNumber as unknown as string, 10) ||
              null,
        suggestedLocation: result.suggestedLocation || "Unknown location",
      };
    } catch {
      console.error("Failed to parse LLM response as JSON:", content);
      return {
        rootCause: content,
        citedCommitHash: null,
        citedIssueNumber: null,
        suggestedLocation: "Could not parse JSON. See root cause details.",
      };
    }
  }
}

/**
 * Legacy function wrapper kept for backward-compatibility.
 * Delegates to TriageAgent.analyze().
 */
export async function runTriageAgent(
  input: TriageInput
): Promise<TriageOutput> {
  const agent = new TriageAgent();
  return agent.analyze(input);
}
