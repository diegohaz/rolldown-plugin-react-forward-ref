import { createFilter, normalizePath } from "@rollup/pluginutils";
import type { FilterPattern } from "@rollup/pluginutils";
import type { SourceMap } from "magic-string";
import { transform } from "./transform.js";

export type { FilterPattern } from "@rollup/pluginutils";

/** An imported helper that accepts a component without calling it directly. */
export interface ImportedElementFactory {
  /** Exact import source as written in the selected module. */
  source: string;
  /** Named export, or "default" for a default import. */
  imported: string;
  /** Zero-based component argument position. Defaults to 0. */
  argumentIndex?: number;
}

export interface Options {
  /** Source files to adapt. Globs resolve from the current working directory. */
  include: FilterPattern;
  /** Additional files to leave unchanged. Exclusion takes priority. */
  exclude?: FilterPattern;
  /** Trusted element factories. Strings match local names at argument 0. */
  elementFactories?: ReadonlyArray<string | ImportedElementFactory>;
}

/** A structural plugin type shared by Rolldown and Vite (including Vitest). */
export interface ReactForwardRefPlugin {
  name: string;
  enforce: "pre";
  transform: {
    order: "pre";
    handler(code: string, id: string): { code: string; map: SourceMap } | null;
  };
}

/** Adapt selected source modules for a consumer-configured React 18 target. */
export default function reactForwardRef(
  options: Options,
): ReactForwardRefPlugin {
  if (
    !options?.include ||
    (Array.isArray(options.include) && !options.include.length)
  ) {
    throw new Error("react-forward-ref requires a non-empty include filter");
  }
  const filter = createFilter(options.include, options.exclude);
  for (const factory of options.elementFactories ?? []) {
    if (typeof factory === "string") continue;
    const index = factory.argumentIndex ?? 0;
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new Error(
        "react-forward-ref: element factory argumentIndex must be a non-negative safe integer",
      );
    }
  }
  return {
    name: "react-forward-ref",
    enforce: "pre",
    transform: {
      order: "pre",
      handler(code, id) {
        if (id.includes("\0")) return null;
        const [path = "", query] = normalizePath(id).split("?", 2);
        // Raw/URL requests are assets, not source modules. Other Vite query
        // variants (such as timestamps) still need the source transform.
        if (query && /(?:^|&)(?:raw|url)(?:[=&]|$)/.test(query)) return null;
        if (
          !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) ||
          /\.d\.[cm]?ts$/.test(path)
        )
          return null;
        if (path.split("/").includes("node_modules") || !filter(path))
          return null;
        return transform(code, path, options.elementFactories);
      },
    },
  };
}
