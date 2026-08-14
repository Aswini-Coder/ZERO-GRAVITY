import { describe, it, expect } from "vitest";
import { parseStackTrace, extractErrorMessage, rankCommitsByRelevance, Commit } from "./stack-trace-parser";

describe("stack-trace-parser skill", () => {
  describe("parseStackTrace", () => {
    it("should parse V8 Node.js stack traces with function names", () => {
      const trace = `
Error: database connection timeout
    at Object.connect (d:\\project\\src\\db.ts:15:23)
    at async initApp (src/index.ts:40:9)
      `.trim();

      const result = parseStackTrace(trace);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        function: "Object.connect",
        file: "d:/project/src/db.ts",
        line: 15,
      });
      expect(result[1]).toEqual({
        function: "initApp",
        file: "src/index.ts",
        line: 40,
      });
    });

    it("should parse V8 Node.js anonymous stack traces", () => {
      const trace = `
TypeError: Cannot read properties of undefined (reading 'map')
    at src/components/List.tsx:124:32
      `.trim();

      const result = parseStackTrace(trace);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        function: "<anonymous>",
        file: "src/components/List.tsx",
        line: 124,
      });
    });

    it("should parse Python stack traces", () => {
      const trace = `
Traceback (most recent call last):
  File "src/main.py", line 12, in start_server
    run()
  File "src/server/core.py", line 45, in run
    raise Exception("port occupied")
  File "src/utils.py", line 8
    print(error)
      `.trim();

      const result = parseStackTrace(trace);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        function: "start_server",
        file: "src/main.py",
        line: 12,
      });
      expect(result[1]).toEqual({
        function: "run",
        file: "src/server/core.py",
        line: 45,
      });
      expect(result[2]).toEqual({
        function: "<anonymous>",
        file: "src/utils.py",
        line: 8,
      });
    });

    it("should parse Go/generic structured traces and bypass HTTP links", () => {
      const trace = `
main.go:94
Error retrieved from http://localhost:8080/health
      `.trim();

      const result = parseStackTrace(trace);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        function: "<unknown>",
        file: "main.go",
        line: 94,
      });
    });
  });

  describe("extractErrorMessage", () => {
    it("should extract error messages by removing prefixes", () => {
      expect(extractErrorMessage("Error: connection refused")).toBe("connection refused");
      expect(extractErrorMessage("TypeError: undefined is not a function")).toBe("undefined is not a function");
      expect(extractErrorMessage("RuntimeError: segmentation fault")).toBe("segmentation fault");
    });

    it("should skip stack frames when finding the error title message", () => {
      const trace = `
    at Object.connect (d:\\project\\src\\db.ts:15:23)
TypeError: invalid connection configuration
      `.trim();
      expect(extractErrorMessage(trace)).toBe("invalid connection configuration");
    });

    it("should fallback to the first line if all else fails", () => {
      expect(extractErrorMessage("")).toBe("");
      expect(extractErrorMessage("Fatal system crash")).toBe("Fatal system crash");
    });
  });

  describe("rankCommitsByRelevance", () => {
    it("should prioritize commits modifying files mentioned in the trace", () => {
      const parsedTrace = [
        { file: "src/db.ts", function: "connect", line: 10 },
        { file: "src/index.ts", function: "main", line: 40 }
      ];

      const commits: Commit[] = [
        {
          hash: "commit1",
          author: "Alice",
          message: "docs: update help documentation",
          date: "2026-08-08",
          changedFiles: ["README.md", "docs/help.md"],
          diffText: ""
        },
        {
          hash: "commit2",
          author: "Bob",
          message: "fix: crash in connect interface",
          date: "2026-08-08",
          changedFiles: ["src/db.ts"],
          diffText: ""
        },
        {
          hash: "commit3",
          author: "Charlie",
          message: "feat: add main loader configurations",
          date: "2026-08-08",
          changedFiles: ["src/index.ts", "package.json"],
          diffText: ""
        }
      ];

      const ranked = rankCommitsByRelevance(commits, parsedTrace, "crash in connect");
      
      expect(ranked[0].hash).toBe("commit2");
      expect(ranked[1].hash).toBe("commit3");
      expect(ranked[2].hash).toBe("commit1");
    });
  });
});
