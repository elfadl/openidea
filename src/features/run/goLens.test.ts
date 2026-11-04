// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findGoModRequireBlocks } from "./goLens";

describe("goModCodeLenses helper", () => {
  it("finds require blocks and separates direct from indirect dependencies", () => {
    const text = `
module example.com/app

go 1.22.0

require (
\tcloud.google.com/go/auth v0.20.0
\tgithub.com/aws/aws-sdk-go-v2 v1.41.5
\tgithub.com/shopspring/decimal v1.4.0 // indirect
\t// comment line
\tgithub.com/labstack/echo/v5 v5.2.0
)

require github.com/single/dep v1.0.0
require github.com/single/indirect v1.0.0 // indirect
`;

    const blocks = findGoModRequireBlocks(text);
    expect(blocks).toHaveLength(3);

    // Block 1: require (...)
    expect(blocks[0]?.directDeps).toEqual([
      "cloud.google.com/go/auth",
      "github.com/aws/aws-sdk-go-v2",
      "github.com/labstack/echo/v5",
    ]);

    // Block 2: single direct require
    expect(blocks[1]?.directDeps).toEqual(["github.com/single/dep"]);

    // Block 3: single indirect require
    expect(blocks[2]?.directDeps).toEqual([]);
  });

  it("handles go.mod with no require blocks", () => {
    const text = `
module example.com/empty

go 1.22.0
`;
    expect(findGoModRequireBlocks(text)).toEqual([]);
  });
});
