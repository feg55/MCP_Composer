import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const summaryStyles = readFileSync(resolve(process.cwd(), "src/components/GatewaySummary.module.scss"), "utf8");

describe("Gateway Summary intrinsic sizing", () => {
  it("contains the guards required for uninterrupted text", () => {
    expect(summaryStyles).toMatch(
      /\.content\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*min-width:\s*0;/s
    );
    expect(summaryStyles).toMatch(/\.card,\s*\.metric\s*\{[^}]*min-width:\s*0;/s);
    expect(summaryStyles).toMatch(/\.gatewayName\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s);
    expect(summaryStyles).toMatch(
      /\.description\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s
    );
  });
});
