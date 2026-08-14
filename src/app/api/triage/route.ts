import { NextResponse } from "next/server";
import {
  parseStackTrace,
  extractErrorMessage,
  type ParsedTrace,
  type Commit,
} from "@/skills/stack-trace-parser";
import {
  TriageAgent,
  runTriageAgent,
  type Issue,
  type CorrelationResult,
} from "@/agents/triage-agent";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { repoOwner, repoName, stackTrace } = await req.json();

    if (!repoOwner || !repoName || !stackTrace) {
      return NextResponse.json(
        {
          error:
            "Missing required parameters: repoOwner, repoName, and stackTrace are required.",
        },
        { status: 400 }
      );
    }

    const owner = repoOwner.trim();
    const repo = repoName.trim();
    const rawTrace = stackTrace.trim();

    // ── Demo / Mock fallback (no credentials required) ────────────────
    if (owner.toLowerCase() === "mock" && repo.toLowerCase() === "demo") {
      // Even demo mode uses the real parser skill for the user's trace:
      const parsedTrace = parseStackTrace(rawTrace);
      const errorMessage = extractErrorMessage(rawTrace);
      return NextResponse.json(
        getMockData(parsedTrace, errorMessage, rawTrace)
      );
    }

    // ── Credential checks ─────────────────────────────────────────────
    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json(
        {
          error:
            "GITHUB_TOKEN is not configured on the server. Please add it to your .env.local file. (To run in demo mode, use the repository: 'mock/demo')",
        },
        { status: 400 }
      );
    }
    if (!process.env.LLM_API_KEY) {
      return NextResponse.json(
        {
          error:
            "LLM_API_KEY is not configured on the server. Please add it to your .env.local file. (To run in demo mode, use the repository: 'mock/demo')",
        },
        { status: 400 }
      );
    }

    // ── Fetch commits from GitHub REST API ─────────────────────────────
    const ghHeaders = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NextJS-RootCause-App",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    };

    const commitsListUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`;
    const commitsListRes = await fetch(commitsListUrl, { headers: ghHeaders });

    if (!commitsListRes.ok) {
      const errBody = await commitsListRes.text();
      return NextResponse.json(
        {
          error: `GitHub API error fetching commits: ${commitsListRes.statusText} (${commitsListRes.status}) - ${errBody}`,
        },
        { status: commitsListRes.status }
      );
    }

    const commitsList = await commitsListRes.json();
    if (!Array.isArray(commitsList)) {
      return NextResponse.json(
        { error: "Invalid response from GitHub: commits is not an array." },
        { status: 500 }
      );
    }
    if (commitsList.length === 0) {
      return NextResponse.json(
        { error: "This repository has no commits." },
        { status: 400 }
      );
    }

    // Retrieve diff details per commit concurrently
    const commitDetailsPromises = commitsList.map(
      async (c: Record<string, unknown>): Promise<Commit | null> => {
        try {
          const sha = (c as { sha: string }).sha;
          const commitUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
          const detailRes = await fetch(commitUrl, { headers: ghHeaders });
          if (!detailRes.ok) return null;

          const detail = await detailRes.json();
          const changedFiles = (
            (detail.files as Array<{ filename: string }>) || []
          ).map((f) => f.filename);
          const diffText = (
            (detail.files as Array<{ patch?: string }>) || []
          )
            .map((f) => f.patch || "")
            .join("\n");

          const commit = (c as { commit?: { author?: { name?: string; date?: string }; message?: string } }).commit;

          return {
            hash: sha,
            author: commit?.author?.name || "Unknown Author",
            message: commit?.message || "No commit message",
            date: commit?.author?.date || "",
            changedFiles,
            diffText,
          };
        } catch (err) {
          console.error(`Failed to load commit details:`, err);
          return null;
        }
      }
    );

    const detailedCommits = (await Promise.all(commitDetailsPromises)).filter(
      (c): c is Commit => c !== null
    );

    // ── Fetch issues from GitHub REST API ──────────────────────────────
    let issues: Issue[] = [];
    try {
      const issuesUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=30`;
      const issuesRes = await fetch(issuesUrl, { headers: ghHeaders });
      if (issuesRes.ok) {
        const issuesData = await issuesRes.json();
        if (Array.isArray(issuesData)) {
          issues = issuesData
            .filter((i: Record<string, unknown>) => !i.pull_request)
            .map((i: Record<string, unknown>) => ({
              number: i.number as number,
              title: (i.title as string) || "",
              body: (i.body as string) || "",
              state: i.state as "open" | "closed",
              url: (i.html_url as string) || "",
            }));
        }
      }
    } catch (err) {
      console.error("Failed to load issues from GitHub:", err);
    }

    // ── Delegate entire analysis to the Triage Agent ───────────────────
    // The agent internally calls the Stack Trace Parser skill to:
    //   1. Parse the raw trace   → parseStackTrace()
    //   2. Extract error message → extractErrorMessage()
    //   3. Rank commits          → rankCommitsByRelevance()
    // Then it filters issues and calls the LLM for correlation.
    try {
      const result = await runTriageAgent({
        rawTrace,
        commits: detailedCommits,
        issues,
      });

      return NextResponse.json(result);
    } catch (llmErr: unknown) {
      const message =
        llmErr instanceof Error ? llmErr.message : String(llmErr);
      return NextResponse.json(
        { error: `Triage agent failed: ${message}` },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("General error in triage route:", message);
    return NextResponse.json(
      { error: `Internal server error: ${message}` },
      { status: 500 }
    );
  }
}

// ── Mock demo data ──────────────────────────────────────────────────────

function getMockData(
  parsedTrace: ParsedTrace[],
  errorMessage: string,
  _rawTrace: string
) {
  const primaryFile =
    parsedTrace.length > 0 ? parsedTrace[0].file : "src/db.ts";
  const primaryLine = parsedTrace.length > 0 ? parsedTrace[0].line : 15;
  const primaryFunc =
    parsedTrace.length > 0 ? parsedTrace[0].function : "connectToDatabase";

  const mockedCommits: Commit[] = [
    {
      hash: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b",
      author: "Alice Developer",
      message:
        "refactor: optimize connection pool config and drop bounds checking (#45)",
      date: new Date().toISOString(),
      changedFiles: [primaryFile],
      diffText: `--- a/${primaryFile}
+++ b/${primaryFile}
@@ -10,6 +10,6 @@
 export function ${primaryFunc}() {
-  const limit = process.env.POOL_LIMIT ? parseInt(process.env.POOL_LIMIT) : 10;
-  return new ConnectionPool({ size: limit });
+  // Optimize pooling configuration by removing strict size caps
+  return new ConnectionPool({ size: undefined });
 }`,
    },
    {
      hash: "1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e",
      author: "Bob Operations",
      message: "docs: update server setup guidelines in README",
      date: new Date(Date.now() - 86400000).toISOString(),
      changedFiles: ["README.md"],
      diffText:
        "+## Troubleshoot: pool crashes can happen if local configs are unset.",
    },
  ];

  const mockedIssues: Issue[] = [
    {
      number: 142,
      title: "Connection pool crashes when size is undefined",
      body: "After pool limit change in PR, customers report database connection timeouts. The internal driver throws type errors expecting numeric bounds.",
      state: "open",
      url: "https://github.com/mock/demo/issues/142",
    },
  ];

  const mockCorrelation: CorrelationResult = {
    rootCause: `Demo Mode Diagnostics:\nThe crash was likely introduced in commit **9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b** by Alice Developer, which replaced the strict database connection size cap with 'undefined' in file \`${primaryFile}\` during pool configurations. This matches the bug described in GitHub Issue #142 where the inner driver throws exception errors when pool size is not numeric.`,
    citedCommitHash: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b",
    citedIssueNumber: 142,
    suggestedLocation: `${primaryFile}:${primaryLine}`,
  };

  return {
    parsedTrace,
    errorMessage:
      errorMessage || "Database connection pool crash limit undefined",
    rankedCommits: mockedCommits,
    matchingIssues: mockedIssues,
    correlation: mockCorrelation,
    isMock: true,
  };
}
