// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasMissingGoModules, parseGoModRequires } from "./goBanner";

describe("Go module banner helpers", () => {
  it("parses single-line and block requires from go.mod", () => {
    const gomod = `
module example.com/myproject

go 1.23

require github.com/single/dep v1.2.3

require (
\tgithub.com/gorilla/mux v1.8.1
\tgithub.com/shopspring/decimal v1.4.0 // indirect
\t// Comment inside block
\tgithub.com/aws/aws-sdk-go v1.55.8
)
`;
    expect(parseGoModRequires(gomod)).toEqual([
      "github.com/single/dep",
      "github.com/gorilla/mux",
      "github.com/shopspring/decimal",
      "github.com/aws/aws-sdk-go",
    ]);
  });

  it("handles empty or requirement-less go.mod", () => {
    expect(parseGoModRequires("module example.com/empty\n\ngo 1.23\n")).toEqual([]);
    expect(parseGoModRequires("// only comments\n")).toEqual([]);
  });

  it("detects missing modules against downloaded roots", () => {
    const requires = ["github.com/gorilla/mux", "github.com/shopspring/decimal"];
    const partiallyDownloaded = [{ name: "github.com/shopspring/decimal@v1.4.0" }];
    expect(hasMissingGoModules(requires, partiallyDownloaded)).toBe(true);

    const fullyDownloaded = [
      { name: "github.com/gorilla/mux@v1.8.1" },
      { name: "github.com/shopspring/decimal@v1.4.0" },
    ];
    expect(hasMissingGoModules(requires, fullyDownloaded)).toBe(false);

    const spaceSeparatedRoots = [
      { name: "github.com/gorilla/mux v1.8.1" },
      { name: "github.com/shopspring/decimal v1.4.0" },
    ];
    expect(hasMissingGoModules(requires, spaceSeparatedRoots)).toBe(false);
  });

  it("handles replaced module root names", () => {
    const requires = ["github.com/replaced/mod"];
    const roots = [{ name: "github.com/replaced/mod@v1.0.0 => /local/dir" }];
    expect(hasMissingGoModules(requires, roots)).toBe(false);

    const spaceRoots = [{ name: "github.com/replaced/mod v1.0.0 => /local/dir" }];
    expect(hasMissingGoModules(requires, spaceRoots)).toBe(false);
  });
});
