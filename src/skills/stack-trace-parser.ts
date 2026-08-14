export interface ParsedTrace {
  file: string;
  function: string;
  line: number;
}

/**
 * Extracts error message text from the stack trace header, removing error-type prefixes.
 */
export function extractErrorMessage(trace: string): string {
  const lines = trace.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return "";
  
  for (const line of lines) {
    // If it looks like a stack frame line, skip it for the error title retrieval
    if (/^\s*at\s/i.test(line) || /^\s*File\s*"/i.test(line) || /:\d+(:\d+)?$/.test(line)) {
      continue;
    }
    // Strip error prefixes e.g. "TypeError: cannot read property..." -> "cannot read property..."
    return line.replace(/^([a-zA-Z]+Error|Error|Exception|RuntimeError|Fail|Failure):\s*/i, "");
  }
  
  return lines[0];
}

/**
 * Parses stack trace lines to extract files, functions, and line numbers.
 */
export function parseStackTrace(trace: string): ParsedTrace[] {
  const lines = trace.split(/\r?\n/);
  const results: ParsedTrace[] = [];

  // V8 trace with function: at functionName (path/to/file.ext:line:col)
  // Or at async functionName (path/to/file.ext:line:col)
  const v8WithFunc = /^\s*at\s+(?:async\s+)?([^\s(]+)\s+\((.+?):(\d+):(\d+)\)/i;
  
  // V8 trace without function: at path/to/file.ext:line:col
  const v8NoFunc = /^\s*at\s+(.+?):(\d+):(\d+)/i;
  
  // Python trace: File "path/to/file.ext", line lineNum, in functionName
  const pythonWithFunc = /^\s*File\s+"(.+?)",\s*line\s*(\d+),\s*in\s+(.+)/i;
  
  // Python trace without function: File "path/to/file.ext", line lineNum
  const pythonNoFunc = /^\s*File\s+"(.+?)",\s*line\s*(\d+)/i;
  
  // Java/Rust/Go style: path/to/file.ext:line
  const structuredPath = /(?:^|\s)([\w./\\-]+?\.[a-zA-Z0-9]+):(\d+)\b/;

  for (const line of lines) {
    // V8 With Function
    let match = line.match(v8WithFunc);
    if (match) {
      results.push({
        function: match[1].trim(),
        file: match[2].trim(),
        line: parseInt(match[3], 10),
      });
      continue;
    }

    // V8 No Function
    match = line.match(v8NoFunc);
    if (match) {
      results.push({
        function: "<anonymous>",
        file: match[1].trim(),
        line: parseInt(match[2], 10),
      });
      continue;
    }

    // Python With Function
    match = line.match(pythonWithFunc);
    if (match) {
      results.push({
        function: match[3].trim(),
        file: match[1].trim(),
        line: parseInt(match[2], 10),
      });
      continue;
    }

    // Python No Function
    match = line.match(pythonNoFunc);
    if (match) {
      results.push({
        function: "<anonymous>",
        file: match[1].trim(),
        line: parseInt(match[2], 10),
      });
      continue;
    }

    // Generic Structured Path
    match = line.match(structuredPath);
    if (match) {
      // Exclude strings starting with URL prefixes to avoid resolving HTTP addresses
      if (line.includes("http://") || line.includes("https://")) {
        continue;
      }
      results.push({
        function: "<unknown>",
        file: match[1].trim(),
        line: parseInt(match[2], 10),
      });
    }
  }

  // Normalize all paths to use forward slashes for uniform analysis
  return results.map(r => ({
    ...r,
    file: r.file.replace(/\\/g, "/"),
  }));
}

export interface Commit {
  hash: string;
  author: string;
  message: string;
  date: string;
  changedFiles: string[];
  diffText: string;
}

/**
 * Ranks commits by relevance to the parsed stack trace files and error description keywords.
 */
export function rankCommitsByRelevance(
  commits: Commit[],
  parsedTrace: ParsedTrace[],
  errorMessage: string
): Commit[] {
  const parsedFiles = parsedTrace.map(t => {
    const parts = t.file.split("/");
    return parts[parts.length - 1].toLowerCase();
  });

  const scoredCommits = commits.map(commit => {
    let score = 0;
    
    for (const changedFile of commit.changedFiles) {
      const changedLower = changedFile.toLowerCase();
      
      for (const parsedFile of parsedFiles) {
        if (parsedFile && (changedLower.includes(parsedFile) || parsedFile.includes(changedLower))) {
          score += 10;
        }
      }
    }

    const messageLower = commit.message.toLowerCase();
    const errWords = errorMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const word of errWords) {
      if (messageLower.includes(word)) {
        score += 2;
      }
    }

    return { commit, score };
  });

  return scoredCommits
    .sort((a, b) => b.score - a.score)
    .map(sc => sc.commit);
}
