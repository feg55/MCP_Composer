import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readStyles = (fileName: string) => readFileSync(resolve(process.cwd(), `src/components/${fileName}`), "utf8");

describe("wide-screen layout sizing", () => {
  it("keeps the application flush with the viewport instead of capping its width", () => {
    const styles = readStyles("AppShell.module.scss");

    expect(styles).toMatch(/\.wrapper\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
    expect(styles).not.toContain("max-width: 120rem");
  });

  it("uses fixed-size tool tiles that wrap into a grid", () => {
    const pickerStyles = readStyles("ToolPicker.module.scss");
    const cardStyles = readStyles("ToolCard.module.scss");

    expect(pickerStyles).toMatch(
      /\.toolList\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*20rem\),\s*20rem\)\);[^}]*grid-auto-rows:\s*12\.5rem;/s
    );
    expect(cardStyles).toMatch(/\.card\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*auto;/s);
    expect(cardStyles).toMatch(
      /\.description\s*\{[^}]*height:\s*2\.5rem;[^}]*min-height:\s*2\.5rem;[^}]*overflow-y:\s*auto;/s
    );
  });
});
