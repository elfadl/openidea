/**
 * Editor notification banner for Go modules:
 * Displays a banner above `go.mod` and `.go` files when dependencies declared
 * in `go.mod` are missing from the Go module cache, offering "Download Go Modules"
 * to sync them with `go mod download`. Also displays a sync banner above `go.work`.
 */
import { useEffect, useMemo, useState } from "react";
import { commands } from "@/bindings";
import { executeAction } from "@/platform/actions";
import { call, onIdeEvent } from "@/platform/ipc";
import { useProject } from "@/platform/project";
import { registerEditorBanner, type EditorBanner } from "@/workbench/contributions";
import { goModuleDir } from "./producers";

export function parseGoModRequires(gomodText: string): string[] {
  const requires: string[] = [];
  let inRequireBlock = false;
  for (const line of gomodText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (trimmed === "require (") {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock) {
      if (trimmed === ")") {
        inRequireBlock = false;
        continue;
      }
      const parts = trimmed.split(/\s+/);
      if (parts[0] && !parts[0].startsWith("//")) {
        requires.push(parts[0]);
      }
    } else if (trimmed.startsWith("require ")) {
      const rest = trimmed.slice(8).trim();
      if (rest.startsWith("(")) {
        inRequireBlock = true;
        continue;
      }
      const parts = rest.split(/\s+/);
      if (parts[0] && !parts[0].startsWith("//")) {
        requires.push(parts[0]);
      }
    }
  }
  return requires;
}

export function hasMissingGoModules(requires: readonly string[], roots: readonly { name: string }[]): boolean {
  if (!requires.length) return false;
  const downloaded = new Set(
    roots.map((r) => {
      const arrow = r.name.indexOf("=>");
      const base = (arrow > 0 ? r.name.slice(0, arrow) : r.name).trim();
      const firstToken = base.split(/[@\s]/)[0] ?? base;
      return firstToken.trim();
    }),
  );
  return requires.some((req) => !downloaded.has(req));
}

function targetGoMod(root: string | null, path: string): string | null {
  if (path.endsWith("/go.mod")) return path;
  if (path.endsWith(".go") && root) {
    const dir = goModuleDir(root, path);
    return `${dir}/go.mod`;
  }
  return null;
}

export function useGoBanner(path: string): EditorBanner | null {
  const projectRoot = useProject((s) => s.project?.root ?? null);
  const gomodPath = targetGoMod(projectRoot, path);
  const isGoWork = path.endsWith("/go.work");

  const [requires, setRequires] = useState<string[]>([]);
  const [downloadedRoots, setDownloadedRoots] = useState<{ name: string }[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!gomodPath) return;
    let active = true;
    call(commands.fsReadText(gomodPath))
      .then((text) => {
        if (active) setRequires(parseGoModRequires(text));
      })
      .catch(() => {
        if (active) setRequires([]);
      });
    return () => {
      active = false;
    };
  }, [gomodPath, version]);

  useEffect(() => {
    if (!gomodPath) return;
    let active = true;
    call(commands.sdkProjectLibraries())
      .then((groups) => {
        if (!active) return;
        const goModules = groups.find((g) => g.kind === "goModules");
        setDownloadedRoots(goModules?.roots ?? []);
      })
      .catch(() => {
        if (active) setDownloadedRoots([]);
      });
    return () => {
      active = false;
    };
  }, [gomodPath, version]);

  useEffect(() => {
    const unsubFs = onIdeEvent("fsChanged", (e) => {
      const all = [...e.created, ...e.modified, ...e.removed];
      if (all.some((p) => p.endsWith("/go.mod") || p.endsWith("/go.sum") || p.endsWith("/go.work"))) {
        setVersion((v) => v + 1);
      }
    });
    const unsubRun = onIdeEvent("runExited", () => {
      setVersion((v) => v + 1);
    });
    return () => {
      unsubFs();
      unsubRun();
    };
  }, []);

  const isMissing = useMemo(
    () => (gomodPath ? hasMissingGoModules(requires, downloadedRoots) : false),
    [gomodPath, requires, downloadedRoots],
  );

  if (isGoWork) {
    return {
      text: "Go workspace modules may need synchronization",
      level: "info",
      actions: [
        {
          label: "Sync Go Workspace",
          run: () => {
            void executeAction("go.work.sync", { path });
          },
        },
      ],
    };
  }

  if (gomodPath && isMissing) {
    return {
      text: "Dependencies are not downloaded",
      level: "warning",
      actions: [
        {
          label: "Download Go Modules",
          run: () => {
            void executeAction("go.mod.download", { path: gomodPath });
          },
        },
      ],
    };
  }

  return null;
}

export function registerGoBanner(): () => void {
  return registerEditorBanner({
    id: "go.modules",
    order: 4,
    useBanner: useGoBanner,
  });
}
