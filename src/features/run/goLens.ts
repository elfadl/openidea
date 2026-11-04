/**
 * CodeLens provider for `go.mod` files:
 * Renders GoLand-style inlay action links above `require (` blocks:
 *   - "Update all dependencies"
 *   - "Update direct dependencies"
 */
import { codeLenses, registerEditorContribution, type CodeLens, type EditorDocContext } from "@/editor/api";
import { executeAction } from "@/platform/actions";
import { tx } from "@/platform/i18n";
import type { EditorState } from "@codemirror/state";

export interface GoModRequireBlock {
  pos: number;
  directDeps: string[];
}

export function findGoModRequireBlocks(text: string): GoModRequireBlock[] {
  const blocks: GoModRequireBlock[] = [];
  const lines = text.split("\n");
  let offset = 0;
  let currentBlock: GoModRequireBlock | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("require (") || trimmed === "require (") {
      currentBlock = { pos: offset, directDeps: [] };
      blocks.push(currentBlock);
    } else if (currentBlock) {
      if (trimmed === ")") {
        currentBlock = null;
      } else if (trimmed && !trimmed.startsWith("//")) {
        const parts = trimmed.split(/\s+/);
        const isIndirect = trimmed.includes("// indirect");
        if (parts[0] && !isIndirect) {
          currentBlock.directDeps.push(parts[0]);
        }
      }
    } else if (trimmed.startsWith("require ") && !trimmed.includes("(")) {
      const rest = trimmed.slice(8).trim();
      const parts = rest.split(/\s+/);
      const isIndirect = rest.includes("// indirect");
      blocks.push({
        pos: offset,
        directDeps: parts[0] && !isIndirect ? [parts[0]] : [],
      });
    }
    offset += line.length + 1;
  }
  return blocks;
}

export function goModCodeLenses(path: string, state: EditorState): readonly CodeLens[] {
  const text = state.doc.toString();
  const blocks = findGoModRequireBlocks(text);
  const lenses: CodeLens[] = [];

  for (const block of blocks) {
    lenses.push(
      {
        pos: block.pos,
        title: tx("Update all dependencies"),
        icon: "refresh",
        order: 10,
        run: () => {
          void executeAction("go.mod.updateAll", { path });
        },
      },
      {
        pos: block.pos,
        title: tx("Update direct dependencies"),
        icon: "refresh",
        order: 20,
        run: () => {
          void executeAction("go.mod.updateDirect", {
            path,
            directory: block.directDeps.join(" "),
          });
        },
      },
    );
  }

  return lenses;
}

export function registerGoLens(): () => void {
  return registerEditorContribution({
    id: "go.mod.lens",
    order: 40,
    extensions: (doc: EditorDocContext) => {
      if (doc.virtual || !doc.path.endsWith("/go.mod")) return [];
      return [codeLenses.compute(["doc"], (state) => goModCodeLenses(doc.path, state))];
    },
  });
}
