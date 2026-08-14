"use client";

import React, { useState } from "react";

interface ParsedTrace {
  file: string;
  function: string;
  line: number;
}

interface Commit {
  hash: string;
  author: string;
  message: string;
  date: string;
  changedFiles: string[];
  diffText: string;
}

interface Issue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  url: string;
}

interface CorrelationResult {
  rootCause: string;
  citedCommitHash: string | null;
  citedIssueNumber: number | null;
  suggestedLocation: string;
}

interface TriageResponse {
  parsedTrace: ParsedTrace[];
  errorMessage: string;
  rankedCommits: Commit[];
  matchingIssues: Issue[];
  correlation: CorrelationResult;
  isMock?: boolean;
}

export default function RootCausePage() {
  const [repoInput, setRepoInput] = useState("");
  const [stackTraceInput, setStackTraceInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResponse | null>(null);

  // Steps pipeline markers: 0=idle, 1=parsing, 2=fetching, 3=issues, 4=triage_engine
  const [pipelineStep, setPipelineStep] = useState<0 | 1 | 2 | 3 | 4>(0);

  const handleDemoClick = () => {
    setRepoInput("mock/demo");
    setStackTraceInput(`
TypeError: Cannot read properties of undefined (reading 'map')
    at connectToDatabase (src/db.ts:15:23)
    at async initApp (src/index.ts:40:9)
    at startServer (src/server.ts:10:5)
    `.trim());
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);
    setPipelineStep(1);

    // Parse repository input owner/repo
    // Accepts simple "owner/repo" or full HTTPS url "https://github.com/owner/repo"
    const ghUrlRegex = /(?:https?:\/\/github\.com\/)?([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/;
    const match = repoInput.trim().match(ghUrlRegex);

    if (!match) {
      setError("Repository must be in 'owner/repo' format or a valid GitHub link.");
      setIsLoading(false);
      setPipelineStep(0);
      return;
    }

    const repoOwner = match[1];
    const repoName = match[2];

    if (!stackTraceInput.trim()) {
      setError("Please paste a stack trace or error log to analyze.");
      setIsLoading(false);
      setPipelineStep(0);
      return;
    }

    try {
      // Simulate pipeline progressions sequentially in UI
      setTimeout(() => setPipelineStep(2), 600);
      setTimeout(() => setPipelineStep(3), 1500);
      setTimeout(() => setPipelineStep(4), 2200);

      const response = await fetch("/api/triage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoOwner,
          repoName,
          stackTrace: stackTraceInput,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server responded with status ${response.status}`);
      }

      setResult(data);
    } catch (err: any) {
      console.error("Error running triage analysis:", err);
      setError(err.message || "An unexpected error occurred during analysis.");
    } finally {
      setIsLoading(false);
      setPipelineStep(0);
    }
  };

  return (
    <main className="container">
      {/* SEO & Semantic Header */}
      <header>
        <div className="logo-section">
          <h1>
            🛡️ Root Cause <span className="logo-badge">Beta</span>
          </h1>
          <p className="subtitle">
            Correlate production crash logs with recent commits and historic issues instantly.
          </p>
        </div>
      </header>

      {/* Input layout grid */}
      <section className="main-grid" aria-label="Triage Dashboard Configuration">
        {/* Input Panel */}
        <article className="glass-panel" style={{ padding: "2rem" }}>
          <form id="triage-form" onSubmit={handleFormSubmit}>
            <div className="form-group">
              <label htmlFor="git-repo-input">GitHub Repository</label>
              <input
                id="git-repo-input"
                type="text"
                className="text-input"
                placeholder="e.g. facebook/react or mock/demo"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                disabled={isLoading}
                required
              />
              <p className="input-helper">
                Accepts <code>owner/repository</code> or full GitHub repository link. Type <strong>mock/demo</strong> for instant sandbox preview.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="stack-trace-input">Stack Trace or Error Log</label>
              <textarea
                id="stack-trace-input"
                className="textarea-input"
                placeholder="Paste the raw stack trace or log dump here..."
                value={stackTraceInput}
                onChange={(e) => setStackTraceInput(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <button
                id="analyze-btn"
                type="submit"
                className="submit-btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="spin" style={{ marginRight: "0.5rem" }}>⏳</span> Correlating...
                  </>
                ) : (
                  "Analyze & Identify Root Cause"
                )}
              </button>

              <button
                id="demo-btn"
                type="button"
                className="submit-btn"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "var(--text-secondary)",
                  width: "auto"
                }}
                disabled={isLoading}
                onClick={handleDemoClick}
              >
                ✨ Try Demo
              </button>
            </div>
          </form>
        </article>

        {/* Real-time Triage Progress Steps Layout */}
        <article className="glass-panel pipeline-card" aria-label="Analysis Progression Status">
          <h2 className="pipeline-title">⚡ Core Triage Pipeline</h2>
          
          <div className="pipeline-steps">
            <div className={`step-item ${isLoading && pipelineStep === 1 ? "active" : ""} ${result || (isLoading && pipelineStep > 1) ? "completed" : ""}`}>
              <div className="step-icon">1</div>
              <div className="step-content">
                <div className="step-name">Parse Stack Trace</div>
                <div className="step-desc">Extracting function frames and file path locations.</div>
              </div>
            </div>

            <div className={`step-item ${isLoading && pipelineStep === 2 ? "active" : ""} ${result || (isLoading && pipelineStep > 2) ? "completed" : ""}`}>
              <div className="step-icon">2</div>
              <div className="step-content">
                <div className="step-name">Fetch Commits & Patches</div>
                <div className="step-desc">Loading last 20 git commits including diff changes.</div>
              </div>
            </div>

            <div className={`step-item ${isLoading && pipelineStep === 3 ? "active" : ""} ${result || (isLoading && pipelineStep > 3) ? "completed" : ""}`}>
              <div className="step-icon">3</div>
              <div className="step-content">
                <div className="step-name">Match Github Issues</div>
                <div className="step-desc">Searching historic open & closed database issues.</div>
              </div>
            </div>

            <div className={`step-item ${isLoading && pipelineStep === 4 ? "active" : ""} ${result ? "completed" : ""}`}>
              <div className="step-icon">4</div>
              <div className="step-content">
                <div className="step-name">AI Triage Agent Correlation</div>
                <div className="step-desc">Analyzing code changes and issues via LLM to locate regression root cause.</div>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* Error banner section */}
      {error && (
        <section id="error-banner" className="error-banner" style={{ marginTop: "2rem" }} aria-label="Error Alert">
          <div className="error-title">
            <span>⚠️</span> Diagnostic Error
          </div>
          <div className="error-msg">{error}</div>
        </section>
      )}

      {/* Triage Output Area */}
      {result && (
        <section className="results-container" aria-label="Debugging Analysis Results">
          
          {/* Demo Sandbox Alert Badge */}
          {result.isMock && (
            <div className="demo-banner">
              <span>💡</span> <strong>Demo Mode:</strong> Loaded synthetic files and commits. Setup <code>GITHUB_TOKEN</code> and <code>LLM_API_KEY</code> on your server to parse live repositories.
            </div>
          )}

          {/* Primary Correlation Result */}
          <article className="glass-panel correlation-card">
            <div className="correlation-header">
              <div className="correlation-meta">
                <span className="correlation-tag">AI Triaged Verdict</span>
                <h2 className="workspace-title" style={{ fontSize: "1.75rem", fontWeight: 800 }}>Root Cause Analysis</h2>
              </div>
              {result.correlation.suggestedLocation && (
                <div className="location-badge">
                  📍 Fix Location: {result.correlation.suggestedLocation}
                </div>
              )}
            </div>

            <p className="root-cause-text">
              {result.correlation.rootCause}
            </p>

            <div className="cites-section">
              <div className="cite-box">
                <span className="cite-label">Cited Commit</span>
                {result.correlation.citedCommitHash ? (
                  <a
                    id="cited-commit-link"
                    href={result.isMock ? "#" : `https://github.com/${repoInput.trim().replace(/^https:\/\/github\.com\//, "")}/commit/${result.correlation.citedCommitHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cite-link"
                  >
                    🔗 {result.correlation.citedCommitHash.substring(0, 7)} (Git change)
                  </a>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No specific commit cited.</span>
                )}
              </div>

              <div className="cite-box">
                <span className="cite-label">Cited Issue</span>
                {result.correlation.citedIssueNumber ? (
                  <a
                    id="cited-issue-link"
                    href={result.isMock ? result.matchingIssues[0]?.url : `https://github.com/${repoInput.trim().replace(/^https:\/\/github\.com\//, "")}/issues/${result.correlation.citedIssueNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cite-link"
                  >
                    #️⃣ Issue #{result.correlation.citedIssueNumber} (Historic context)
                  </a>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No specific issue cited.</span>
                )}
              </div>
            </div>
          </article>

          {/* Diffs & Issues Side-by-side details */}
          <div className="details-grid">
            {/* Scored Commits list */}
            <article className="glass-panel detail-card">
              <div className="detail-header">
                <span>Commits Scanned For Relevance</span>
                <span className="detail-count">{result.rankedCommits.length} commits</span>
              </div>
              <div className="detail-list">
                {result.rankedCommits.map((c, idx) => (
                  <div key={c.hash + idx} className="commit-item">
                    <div className="commit-title-row">
                      <span className="commit-hash">{c.hash.substring(0, 7)}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{new Date(c.date).toLocaleDateString()}</span>
                    </div>
                    <div className="commit-msg">{c.message}</div>
                    <div className="commit-meta">
                      <span>By: {c.author}</span>
                    </div>
                    {c.changedFiles.length > 0 && (
                      <div className="commit-files">
                        <span className="commit-file-title">Changed Files</span>
                        {c.changedFiles.map((f, fidx) => (
                          <span key={fidx} className="commit-file-name">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>

            {/* Keyword Matched Issues */}
            <article className="glass-panel detail-card">
              <div className="detail-header">
                <span>Similar GitHub Issues Matched</span>
                <span className="detail-count">{result.matchingIssues.length} issues</span>
              </div>
              <div className="detail-list">
                {result.matchingIssues.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>
                    No matching GitHub issues for this error text.
                  </p>
                ) : (
                  result.matchingIssues.map((issue, idx) => (
                    <div key={issue.number + idx} className="issue-item">
                      <div className="issue-title-row">
                        <span className="issue-title">#{issue.number}: {issue.title}</span>
                        <span className={`issue-state ${issue.state}`}>{issue.state}</span>
                      </div>
                      <p className="issue-desc">{issue.body}</p>
                      <a
                        href={result.isMock ? issue.url : `https://github.com/${repoInput.trim().replace(/^https:\/\/github\.com\//, "")}/issues/${issue.number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="issue-link-btn"
                      >
                        Visit Issue discussion &rarr;
                      </a>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        </section>
      )}
    </main>
  );
}
