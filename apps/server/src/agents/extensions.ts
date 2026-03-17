/**
 * Default Pi extensions loaded for every agent spawn.
 * Add new extensions here and they'll be picked up by all spawn paths
 * (solo, team, workflow, resume, structured).
 */
import * as path from "node:path";
import * as os from "node:os";

const PI_EXTENSIONS_DIR = path.join(os.homedir(), ".pi", "agent", "extensions");

/**
 * Extensions loaded for every Pi agent, regardless of mode.
 * Paths are relative to ~/.pi/agent/extensions/
 */
const DEFAULT_EXTENSIONS: string[] = [
  "cursor-provider.ts",
  "dd-telemetry/index.ts",
];

/** Resolve a list of extension filenames to absolute paths. */
function resolve(exts: string[]): string[] {
  return exts.map((ext) => path.join(PI_EXTENSIONS_DIR, ext));
}

/**
 * Build the extension CLI args for a Pi agent.
 * Always starts with --no-extensions, then adds -e flags for each default
 * extension plus any extra extensions passed in.
 *
 * @param extra - Additional extension filenames (relative to PI_EXTENSIONS_DIR)
 * @returns Array of CLI args, e.g. ["--no-extensions", "-e", "/path/a.ts", "-e", "/path/b.ts"]
 */
export function extensionArgs(extra: string[] = []): string[] {
  const all = resolve([...DEFAULT_EXTENSIONS, ...extra]);
  const args: string[] = ["--no-extensions"];
  for (const ext of all) {
    args.push("-e", ext);
  }
  return args;
}
