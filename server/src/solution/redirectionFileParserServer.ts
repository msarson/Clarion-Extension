// Updated server-side version using serverSettings and supporting per-project redirection files, respecting compile mode/configuration

import * as path from "path";
import * as fs from "fs";
import LoggerManager from "../logger";
import { serverSettings } from "../serverSettings";
import { DirectoryFileIndex } from "./DirectoryFileIndex";

const logger = LoggerManager.getLogger("RedirectionParserServer");
logger.setLevel("error");

/**
 * Represents the source of a resolved file path
 */
export enum FilePathSource {
  Redirected = "redirected",
  Project = "project",
  Solution = "solution",
  LibSrc = "libsrc"
}

/**
 * Represents a resolved file path with its source
 */
export interface ResolvedFilePath {
  path: string;
  source: FilePathSource;
  entry?: RedirectionEntry;
}

export interface RedirectionEntry {
  redFile: string;
  section: string;
  extension: string;
  paths: string[];
}

/**
 * Returns true when the given redirection entry's section is either `Common`
 * (always active regardless of build configuration) OR matches the active
 * build configuration. Comparison is case-insensitive — real-world `.red`
 * files are hand-edited and case drift on section names is plausible
 * (`[debug]` vs `[Debug]` vs `[DEBUG]`). Defensive normalization centralised
 * here per task `a3c341cf` (filed during `bd7e4a29` review).
 *
 * Section names captured at parse time preserve original case for display
 * (logs / sectionLabel rendering); this helper is the single point where
 * case is normalised for comparison. Future contributors who add a new
 * filter site should reach for this helper rather than re-implementing the
 * comparison — that's the maintainability win over inline `.toLowerCase()`
 * at every callsite.
 *
 * **Section-merging semantics (Aspect 3 of `3f9f91c8` audit)** — sections
 * are NOT merged at parse time across `{include}` chains. They are flat-list
 * tags: each entry carries its source section name as a `section: string`
 * field, case-preserved as-written. When a parent file declares `[Debug]`
 * and an included file declares `[debug]`, both entries co-exist in the
 * flat list with their as-written section values. Section equality is
 * resolved at consumer time via this helper's case-insensitive comparison.
 * Same-extension key conflicts within a section are resolved first-match-
 * wins by iteration order — there is no parse-time concatenation or
 * merging of paths. See `docs/audits/include-chaining-audit-3f9f91c8.md`
 * Step 4 for the empirical verdict.
 */
export function matchesActiveConfiguration(
  entry: RedirectionEntry,
  configuration: string,
  projectPath?: string
): boolean {
  const sectionLower = entry.section.toLowerCase();
  if (sectionLower === 'common') return true;
  const configLower = configuration.toLowerCase();
  if (sectionLower === configLower) return true;
  // #293 — a solution build configuration arrives as "Config|Platform" (e.g. "Debug|Win32")
  // while RED sections are named by the build configuration alone ([Debug]/[Release]/custom).
  // The strict comparison dropped every configuration section, silently collapsing the search
  // paths to [Common]-only — on a real 40-project solution that left ~99% of source files
  // unresolvable at load (generated sources live under [Debug]/[Release] paths).
  const configSegment = configLower.split('|')[0].trim();
  if (configSegment.length > 0 && sectionLower === configSegment) return true;

  // #331 — the docs (redirection_file.htm) activate [DEBUG]/[RELEASE] by the
  // Project System's Debug/Release MODE switch, not by configuration NAME. A
  // custom-named build configuration (e.g. "Test") therefore still drives one
  // of the two sections through its debug-mode property. Name matching above
  // stays as tier 1 (it also serves custom [Test]-style sections, which the
  // docs don't define but real .red files use); this tier maps an
  // unrecognized configuration name onto its mode via the owning project's
  // cwproj (DebugSymbols/DebugType in the config-conditioned PropertyGroup).
  // When the mode cannot be determined at all, BOTH sections are treated as
  // active for lookup resilience — the compiler always has a definite mode,
  // so "unknown" means WE lack the information, and silently losing
  // [Debug]/[Release] entries kills generated-source resolution (verified
  // against a real generated .red where `*.clw = genfiles\src` lives only in
  // those sections). A one-time warning flags the state.
  // Degenerate configurations ('' / '|Win32') are uninitialized states, not
  // real configs — they get no mode mapping and no union (#293 pin).
  if (configSegment.length > 0 && (sectionLower === 'debug' || sectionLower === 'release')) {
    const mode = resolveConfigurationMode(configuration, projectPath);
    if (mode === sectionLower) return true;
    if (mode === 'unknown') {
      warnUnknownConfigurationOnce(configuration, projectPath);
      return true;
    }
  }
  return false;
}

const configModeCache = new Map<string, 'debug' | 'release' | 'unknown'>();
const warnedUnknownConfigs = new Set<string>();

function warnUnknownConfigurationOnce(configuration: string, projectPath?: string): void {
  const key = configuration.toLowerCase();
  if (warnedUnknownConfigs.has(key)) return;
  warnedUnknownConfigs.add(key);
  logger.warn(
    `⚠️ [#331] Build configuration "${configuration}" is neither Debug/Release nor mappable to a mode` +
    `${projectPath ? ` via a cwproj in ${projectPath}` : ''} — treating BOTH [Debug] and [Release] ` +
    `sections as active for lookups so redirection entries are not silently lost.`
  );
}

/**
 * #331 — resolve a build configuration to its Debug/Release MODE.
 *
 * "Debug"/"Release" (with or without the "|Platform" suffix) map directly.
 * Any other name is looked up in the owning project's .cwproj: the
 * config-conditioned `<PropertyGroup Condition=" '$(Configuration)…' ==
 * 'Name…' ">` block's `DebugSymbols` (or `DebugType`) property decides the
 * mode — the same switch the docs say drives section activation. Results are
 * cached per (projectPath, configuration): cwproj configuration blocks are
 * effectively static for a session.
 */
export function resolveConfigurationMode(
  configuration: string,
  projectPath?: string
): 'debug' | 'release' | 'unknown' {
  const segment = configuration.toLowerCase().split('|')[0].trim();
  if (segment === 'debug') return 'debug';
  if (segment === 'release') return 'release';
  if (!projectPath) return 'unknown';

  const cacheKey = `${projectPath.toLowerCase()}|${segment}`;
  const cached = configModeCache.get(cacheKey);
  if (cached) return cached;

  let mode: 'debug' | 'release' | 'unknown' = 'unknown';
  try {
    const cwproj = fs.readdirSync(projectPath).find(f => f.toLowerCase().endsWith('.cwproj'));
    if (cwproj) {
      const content = fs.readFileSync(path.join(projectPath, cwproj), 'utf-8');
      // Config-conditioned PropertyGroup blocks: Condition=" '$(Configuration)' == 'Name' "
      // (real generated cwprojs; also tolerate the '$(Configuration)|$(Platform)' form).
      const groupRe = /<PropertyGroup[^>]*Condition\s*=\s*"[^"]*\$\(Configuration\)[^"]*==\s*'([^'|]+)(?:\|[^']*)?'\s*"[^>]*>([\s\S]*?)<\/PropertyGroup>/gi;
      let m: RegExpExecArray | null;
      while ((m = groupRe.exec(content)) !== null) {
        if (m[1].trim().toLowerCase() !== segment) continue;
        const body = m[2];
        const symbols = body.match(/<DebugSymbols>\s*(true|false)\s*<\/DebugSymbols>/i);
        if (symbols) {
          mode = symbols[1].toLowerCase() === 'true' ? 'debug' : 'release';
          break;
        }
        const debugType = body.match(/<DebugType>\s*([A-Za-z]+)\s*<\/DebugType>/i);
        if (debugType) {
          mode = debugType[1].toLowerCase() === 'none' ? 'release' : 'debug';
          break;
        }
      }
    }
  } catch {
    // unreadable dir/cwproj — stay unknown
  }
  configModeCache.set(cacheKey, mode);
  return mode;
}

export class RedirectionFileParserServer {
  private readonly macros: Record<string, string>;
  private static redFileCache: Map<string, RedirectionEntry[]> = new Map();
  private static includeCache: Map<string, RedirectionEntry[]> = new Map();
  private entries: RedirectionEntry[] = [];
  // Track parse sequence for debugging
  private static parseSeq: number = 0;
  // Project directory passed to parseRedFile / parseRedFileAsync. Used as the
  // anchor for `.`/`..` resolution and the synthetic `*.*` catch-all per
  // Clarion 11.1 docs (redirection_file.htm) — the .red file's own dir is
  // wrong for global-fallback reds (01d635ef).
  private projectPath: string | undefined;

  /**
   * Macro source semantics (Aspect 2 of `3f9f91c8` audit).
   *
   * `.red` files have NO syntax for defining macros at parse time. The parser
   * only CONSUMES macros from two sources:
   *   1. `serverSettings.macros` — config-driven, injected at constructor time
   *      and constant for the parser instance's lifetime. Single global context
   *      shared across the entire `{include}` chain.
   *   2. Hardcoded fallbacks — `%bin%` (→ `serverSettings.primaryRedirectionPath`)
   *      and `%redname%` (→ basename of the `.red` file currently being parsed).
   *
   * Macros are expanded at PARSE TIME (per-line, in `resolveMacro`). Lookup-time
   * consumers see pre-resolved paths. The `includeCache` holds entries with
   * macros pre-resolved at first-parse time — possible stale-cache concern if
   * `serverSettings.macros` mutates after first parse, but bounded (config
   * reloads typically invalidate caches).
   *
   * Cross-file macro DEFINITION is not a feature — the bare `name = value`
   * shape is parsed as a redirection entry, not a macro definition. Earlier
   * task plan-field framings of "cross-file macro reference" trapped this
   * incorrectly; see `docs/audits/include-chaining-audit-3f9f91c8.md` Step 3.
   */
  constructor() {
    this.macros = serverSettings.macros;
  }

  /**
   * Gets the modification time of a file
   * @param filePath The path to the file
   * @returns The modification time in milliseconds, or 0 if the file doesn't exist
   */
  private getFileMtime(filePath: string): number {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return stats.mtimeMs;
      }
    } catch (error) {
      logger.error(`Error getting file mtime: ${error instanceof Error ? error.message : String(error)}`);
    }
    return 0;
  }

  /**
   * Creates a cache key using the file path and modification time
   * @param filePath The path to the file
   * @returns A cache key string in the format "filePath|mtime"
   */
  private createCacheKey(filePath: string): string {
    const mtime = this.getFileMtime(filePath);
    return `${filePath}|${mtime}`;
  }

  /**
   * Generate a simple hash code for this instance (for logging)
   */
  private hashCode(): number {
    return Math.floor(Math.random() * 10000);
  }

  /** #293 diagnostics: the red file the last parse actually used ('(none)' when not found). */
  public lastRedFileParsed = '';

  public parseRedFile(projectPath: string): RedirectionEntry[] {
    this.projectPath = projectPath;
    if (!serverSettings.redirectionFile) {
      logger.info("redirectionFile not configured — skipping red file lookup");
      this.lastRedFileParsed = '(no redirectionFile setting)';
      return [];
    }
    const projectRedFile = path.join(projectPath, serverSettings.redirectionFile);
    const globalRedFile = path.join(serverSettings.primaryRedirectionPath, serverSettings.redirectionFile);

    let redFileToParse = "";
    try {
      if (fs.existsSync(projectRedFile)) {
        redFileToParse = projectRedFile;
        logger.info(`Using project-specific redirection file: ${projectRedFile}`);
      } else if (fs.existsSync(globalRedFile)) {
        redFileToParse = globalRedFile;
        logger.warn(`Project-specific redirection file not found. Using global: ${globalRedFile}`);
      } else {
        logger.test("No valid redirection file found.");
        this.lastRedFileParsed = '(none)';
        this.entries = [];
        return this.entries;
      }
      this.lastRedFileParsed = redFileToParse;

      // Create a cache key using the file path and mtime
      const cacheKey = this.createCacheKey(redFileToParse);
      
      // Check if we have cached entries for this file path and mtime
      if (RedirectionFileParserServer.redFileCache.has(cacheKey)) {
        logger.info(`✅ Using cached redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
        this.entries = RedirectionFileParserServer.redFileCache.get(cacheKey) || [];
        return this.entries;
      }

      // Add instrumentation
      const id = ++RedirectionFileParserServer.parseSeq;
      const caller = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown';
      const started = Date.now();
      logger.info(`[RED][parse:start] #${id} file=${redFileToParse} mtime=${this.getFileMtime(redFileToParse)} caller=${caller}`);

      this.entries = this.parseRedFileRecursive(redFileToParse, [], true);
      
      // Cache the result with the new cache key
      RedirectionFileParserServer.redFileCache.set(cacheKey, this.entries);
      
      const duration = Date.now() - started;
      logger.info(`[RED][parse:end] #${id} file=${redFileToParse} rules=${this.entries.length} durMs=${duration}`);
      logger.info(`✅ Cached ${this.entries.length} redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
      
      return this.entries;
    } catch (error) {
      logger.error(`Error in parseRedFile: ${error instanceof Error ? error.message : String(error)}`);
      this.entries = [];
      return this.entries;
    }
  }

  // Async version of parseRedFile for better performance
  public async parseRedFileAsync(projectPath: string): Promise<RedirectionEntry[]> {
    this.projectPath = projectPath;
    if (!serverSettings.redirectionFile) {
      logger.info("redirectionFile not configured — skipping red file lookup");
      this.lastRedFileParsed = '(no redirectionFile setting)';
      return [];
    }
    const projectRedFile = path.join(projectPath, serverSettings.redirectionFile);
    const globalRedFile = path.join(serverSettings.primaryRedirectionPath, serverSettings.redirectionFile);

    try {
      // Use async file existence check
      let redFileToParse = "";
      try {
        await fs.promises.access(projectRedFile, fs.constants.F_OK);
        redFileToParse = projectRedFile;
        logger.info(`Using project-specific redirection file: ${projectRedFile}`);
      } catch {
        try {
          await fs.promises.access(globalRedFile, fs.constants.F_OK);
          redFileToParse = globalRedFile;
          logger.warn(`Project-specific redirection file not found. Using global: ${globalRedFile}`);
        } catch {
          logger.test("No valid redirection file found.");
          this.lastRedFileParsed = '(none)';
          this.entries = [];
          return this.entries;
        }
      }
      this.lastRedFileParsed = redFileToParse;

      // Create a cache key using the file path and mtime
      const cacheKey = this.createCacheKey(redFileToParse);
      
      // Check if we have cached entries for this file path and mtime
      if (RedirectionFileParserServer.redFileCache.has(cacheKey)) {
        logger.info(`✅ Using cached redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
        this.entries = RedirectionFileParserServer.redFileCache.get(cacheKey) || [];
        return this.entries;
      }

      // Add instrumentation
      const id = ++RedirectionFileParserServer.parseSeq;
      const caller = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown';
      const started = Date.now();
      logger.info(`[RED][parse:start] #${id} file=${redFileToParse} mtime=${this.getFileMtime(redFileToParse)} caller=${caller}`);

      this.entries = await this.parseRedFileRecursiveAsync(redFileToParse, [], true);
      
      // Cache the result with the new cache key
      RedirectionFileParserServer.redFileCache.set(cacheKey, this.entries);
      
      const duration = Date.now() - started;
      logger.info(`[RED][parse:end] #${id} file=${redFileToParse} rules=${this.entries.length} durMs=${duration}`);
      logger.info(`✅ Cached ${this.entries.length} redirection entries for: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
      
      return this.entries;
    } catch (error) {
      logger.error(`Error in parseRedFileAsync: ${error instanceof Error ? error.message : String(error)}`);
      this.entries = [];
      return this.entries;
    }
  }

  private parseRedFileRecursive(
    redFileToParse: string,
    entries: RedirectionEntry[],
    isFirst: boolean
  ): RedirectionEntry[] {
    if (!fs.existsSync(redFileToParse)) {
      logger.test(`Redirection file not found: ${redFileToParse}`);
      return entries;
    }

    try {
      // Check if we have this include file cached
      if (!isFirst) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        if (RedirectionFileParserServer.includeCache.has(includeCacheKey)) {
          logger.info(`✅ Using cached include file: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
          const cachedEntries = RedirectionFileParserServer.includeCache.get(includeCacheKey) || [];
          // Add the cached entries to our entries array
          entries.push(...cachedEntries);
          return entries;
        }
      }

      logger.info(`Parsing redirection file: ${redFileToParse}`);
      const content = fs.readFileSync(redFileToParse, "utf-8");
      const redPath = path.dirname(redFileToParse);
      let currentSection: string | null = null;

      // For include files, we'll collect their entries separately to cache them
      const includeEntries: RedirectionEntry[] = [];

      // Compiler-truth (3161ea89): no synthetic *.* catch-all is injected.
      // RED entries reflect what the user / global red declares; nothing
      // implicit. The bare-filename Tier 2 in `findFile` provides the explicit
      // project-root fallback that was previously emergent from the synthetic.

      // Use a more efficient approach to process the file
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("--")) continue;

        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1].trim();
          logger.info(`Found section: [${currentSection}] in ${redFileToParse}`);
          continue;
        }

        if (!currentSection) currentSection = "Common";

        if (trimmed.startsWith("{include")) {
          // Sync `{include}` ordering (Aspect 1 of `3f9f91c8` audit) —
          // synchronous recursion shares the parent's `entries` array and
          // pushes child entries at the include directive's position BEFORE
          // the parent loop continues to the next iteration. Result:
          // interleaved-at-include-position. The async counterpart at line
          // ~407 mirrors this semantics deterministically via `await` per
          // include (post-3f9f91c8 fix). DO NOT switch to a queue-then-
          // Promise.all shape here — the async path's pre-fix bug was
          // exactly that, and produced appended-after-parent ordering with
          // multi-include non-determinism. See `docs/audits/include-chaining-audit-3f9f91c8.md`.
          const includeMatch = trimmed.match(/\{include\s+([^}]+)\}/i);
          if (includeMatch && includeMatch[1]) {
            let includePath = this.resolveMacro(includeMatch[1]);
            includePath = path.isAbsolute(includePath) ? includePath : path.resolve(redPath, includePath);
            logger.info(`Processing include: ${includePath} from ${redFileToParse}`);
            this.parseRedFileRecursive(includePath, entries, false);
          }
          continue;
        }

        if (trimmed.includes("=") && currentSection) {
          // Process all sections, filtering will happen when using the entries
          const equalPos = trimmed.indexOf('=');
          if (equalPos > 0) {
            const mask = trimmed.substring(0, equalPos).trim();
            const raw = trimmed.substring(equalPos + 1).trim();
            
            // Pre-allocate array size for better performance
            const pathParts = raw.split(";");
            const paths = new Array(pathParts.length);
            
            for (let j = 0; j < pathParts.length; j++) {
              const resolved = this.resolveMacro(pathParts[j].trim());
              paths[j] = resolved;
            }
            
            const entry = {
              redFile: redFileToParse,
              section: currentSection,
              extension: mask,
              paths
            };
            
            entries.push(entry);
            
            // If this is an include file, also add to the include entries
            if (!isFirst) {
              includeEntries.push(entry);
            }
            
            logger.info(`Added entry: ${mask} = ${paths.join(';')} in section [${currentSection}]`);
          }
        }
      }

      // Cache the include file entries if this is an include
      if (!isFirst && includeEntries.length > 0) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        RedirectionFileParserServer.includeCache.set(includeCacheKey, includeEntries);
        logger.info(`✅ Cached ${includeEntries.length} entries for include file: ${redFileToParse}`);
      }
    } catch (error) {
      logger.error(`Error parsing redirection file ${redFileToParse}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return entries;
  }
  
  // Async version of parseRedFileRecursive
  private async parseRedFileRecursiveAsync(
    redFileToParse: string,
    entries: RedirectionEntry[],
    isFirst: boolean
  ): Promise<RedirectionEntry[]> {
    try {
      // Check if file exists
      try {
        await fs.promises.access(redFileToParse, fs.constants.F_OK);
      } catch {
        logger.test(`Redirection file not found: ${redFileToParse}`);
        return entries;
      }

      // Check if we have this include file cached
      if (!isFirst) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        if (RedirectionFileParserServer.includeCache.has(includeCacheKey)) {
          logger.info(`✅ Using cached include file: ${redFileToParse} (mtime: ${this.getFileMtime(redFileToParse)})`);
          const cachedEntries = RedirectionFileParserServer.includeCache.get(includeCacheKey) || [];
          // Add the cached entries to our entries array
          entries.push(...cachedEntries);
          return entries;
        }
      }

      logger.info(`Parsing redirection file: ${redFileToParse}`);
      const content = await fs.promises.readFile(redFileToParse, "utf-8");
      const redPath = path.dirname(redFileToParse);
      let currentSection: string | null = null;

      // For include files, we'll collect their entries separately to cache them
      const includeEntries: RedirectionEntry[] = [];

      // Compiler-truth (3161ea89): no synthetic *.* catch-all is injected.
      // RED entries reflect what the user / global red declares; nothing
      // implicit. The bare-filename Tier 2 in `findFileAsync` provides the
      // explicit project-root fallback that was previously emergent from
      // the synthetic.

      // Process the file line by line
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("--")) continue;

        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1].trim();
          logger.info(`Found section: [${currentSection}] in ${redFileToParse}`);
          continue;
        }

        if (!currentSection) currentSection = "Common";

        if (trimmed.startsWith("{include")) {
          const includeMatch = trimmed.match(/\{include\s+([^}]+)\}/i);
          if (includeMatch && includeMatch[1]) {
            let includePath = this.resolveMacro(includeMatch[1]);
            includePath = path.isAbsolute(includePath) ? includePath : path.resolve(redPath, includePath);
            logger.info(`Processing include: ${includePath} from ${redFileToParse}`);

            // Serialise the recursive call: await each include at its position
            // so child entries push into the shared array BEFORE the parent loop
            // continues. Mirrors sync `parseRedFileRecursive`'s interleaved-at-
            // include-position semantics deterministically. Pre-fix path queued
            // promises onto includePromises[] and awaited Promise.all AFTER the
            // parent loop, producing appended-after-parent shape with multi-include
            // non-determinism (3f9f91c8 Phase A audit). Parallelism cost is
            // negligible for typical .red sizes (<100 lines); OS file-cache
            // warmth on serial sibling reads dominates anyway.
            await this.parseRedFileRecursiveAsync(includePath, entries, false);
          }
          continue;
        }

        if (trimmed.includes("=") && currentSection) {
          // Process all sections, filtering will happen when using the entries
          const equalPos = trimmed.indexOf('=');
          if (equalPos > 0) {
            const mask = trimmed.substring(0, equalPos).trim();
            const raw = trimmed.substring(equalPos + 1).trim();
            
            // Pre-allocate array size for better performance
            const pathParts = raw.split(";");
            const paths = new Array(pathParts.length);
            
            for (let j = 0; j < pathParts.length; j++) {
              const resolved = this.resolveMacro(pathParts[j].trim());
              paths[j] = resolved;
            }
            
            const entry = {
              redFile: redFileToParse,
              section: currentSection,
              extension: mask,
              paths
            };
            
            entries.push(entry);
            
            // If this is an include file, also add to the include entries
            if (!isFirst) {
              includeEntries.push(entry);
            }
            
            logger.info(`Added entry: ${mask} = ${paths.join(';')} in section [${currentSection}]`);
          }
        }
      }

      // Cache the include file entries if this is an include
      if (!isFirst && includeEntries.length > 0) {
        const includeCacheKey = this.createCacheKey(redFileToParse);
        RedirectionFileParserServer.includeCache.set(includeCacheKey, includeEntries);
        logger.info(`✅ Cached ${includeEntries.length} entries for include file: ${redFileToParse}`);
      }
    } catch (error) {
      logger.error(`Error parsing redirection file ${redFileToParse}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return entries;
  }

  private resolveMacro(input: string): string {
    // Quick check if there are any macros to resolve
    if (!input.includes('%')) {
      return path.normalize(input);
    }
    
    const macroPattern = /%([^%]+)%/g;
    let resolved = input;
    
    // Use a more efficient approach with a single replace call
    resolved = resolved.replace(macroPattern, (match, macroName) => {
      const macro = macroName.toLowerCase();
      let value = this.macros[macro];

      if (!value) {
        if (macro === "bin") {
          value = serverSettings.primaryRedirectionPath;
        } else if (macro === "redname") {
          value = path.basename(serverSettings.redirectionFile);
        } else {
          value = match;
        }
      }

      return value;
    });

    return path.normalize(resolved);
  }

  /**
   * Finds a file in the redirection paths.
   *
   * Strict compiler-truth resolution (3161ea89 + 2a2656b1):
   *   1. Absolute filename → existsSync direct.
   *   2. Pathed (filename contains `/` or `\`) → `path.join(projectPath, filename)` direct,
   *      SKIP the entries walk entirely (compiler doesn't consult redirection for pathed includes).
   *   3. Bare filename → 3-tier:
   *      Tier 1: walk RED entries (user-declared only, build-config-filtered).
   *      Tier 2: explicit `<projectPath>/<filename>` probe.
   *      Tier 3: walk `serverSettings.libsrcPaths` sequentially.
   *
   * @param filename The filename to find
   * @param dirIndex #288 — optional batch existence index. The solution-load path passes the
   *   load-scoped index (no TTL, cleared per load). When omitted, the shared RUNTIME index is
   *   used (#289): per-candidate existence checks cost one cached readdir per directory per
   *   TTL window instead of an existsSync each — this is what makes cross-file validators
   *   (which resolve hundreds of include names through every project's entries) affordable.
   *   Worst-case staleness for a newly created file is DirectoryFileIndex.RUNTIME_TTL_MS.
   * @returns The resolved file path info if found, null otherwise
   */
  public findFile(filename: string, dirIndex?: DirectoryFileIndex): ResolvedFilePath | null {
    // Add instrumentation
    const t0 = Date.now();
    const resolverInstanceId = this.hashCode();
    logger.debug(`[RED][resolve] name="${filename}" instId=${resolverInstanceId}`);
    const idx = dirIndex ?? DirectoryFileIndex.getRuntime();
    const candidateExists = (p: string): boolean => idx.existsPath(p);

    // 1. Absolute filename — existsSync direct.
    if (path.isAbsolute(filename)) {
      const result = candidateExists(filename)
        ? { path: filename, source: FilePathSource.Project, entry: undefined }
        : null;
      const duration = Date.now() - t0;
      logger.debug(`[RED][resolve:end] name="${filename}" → ${result?.path ?? 'NOT_FOUND'} (absolute) durMs=${duration}`);
      return result;
    }

    // 2. Pathed (contains `/` or `\`) — direct project-root join, SKIP RED entirely.
    if (filename.includes('/') || filename.includes('\\')) {
      if (!this.projectPath) {
        const duration = Date.now() - t0;
        logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND (pathed, no projectPath) durMs=${duration}`);
        return null;
      }
      const candidate = path.normalize(path.join(this.projectPath, filename));
      if (candidateExists(candidate)) {
        const duration = Date.now() - t0;
        logger.debug(`[RED][resolve:end] name="${filename}" → ${candidate} (pathed) durMs=${duration}`);
        return { path: candidate, source: FilePathSource.Project, entry: undefined };
      }
      const duration = Date.now() - t0;
      logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND (pathed) durMs=${duration}`);
      return null;
    }

    // 3. Bare filename — canonical 3-tier chain.
    // Create a map to track which paths we've already checked to avoid duplicates
    const checkedPaths = new Set<string>();
    
    // If we have redirection entries, search through them
    if (this.entries.length > 0) {
      for (const entry of this.entries) {
        // Build-configuration filter (bd7e4a29). Mirrors
        // clarionProjectServer.getSearchPaths:381-383: only Common entries
        // and entries for the active configuration are consulted.
        // Lookup-time (not parse-time) so a configuration switch on the
        // same parser instance picks up the new active section without
        // re-parsing.
        if (!matchesActiveConfiguration(entry, serverSettings.configuration, this.projectPath)) {
          continue;
        }
        if (this.matchesMask(entry.extension, filename)) {
          for (const dir of entry.paths) {
            // Resolve relative paths against the project dir per Clarion 11.1
            // docs (01d635ef). The .red file's own dir is wrong for the
            // global-fallback case (e.g. %ClarionRoot%\bin\Clarion110.red).
            // Fall back to the .red dir only if no project dir was supplied.
            let resolvedDir = dir;
            if (dir === '.' || dir === '..') {
              const baseDir = this.projectPath ?? path.dirname(entry.redFile);
              resolvedDir = path.resolve(baseDir, dir);
            } else if (!path.isAbsolute(dir)) {
              // Other relative paths (e.g. `.\classes`, `.\SharedCode\equates`)
              // also resolve against the project dir per Clarion 11.1 docs
              // (cfaa7584 — completes the 01d635ef Layer 1 work). Fall back
              // to the .red dir only if projectPath is unset.
              const baseDir = this.projectPath ?? path.dirname(entry.redFile);
              resolvedDir = path.resolve(baseDir, dir);
            }

            const candidate = path.join(resolvedDir, filename);
            const normalizedCandidate = path.normalize(candidate);

            // Skip if we've already checked this path
            if (checkedPaths.has(normalizedCandidate)) {
              continue;
            }

            checkedPaths.add(normalizedCandidate);

            if (candidateExists(normalizedCandidate)) {
              const result = {
                path: normalizedCandidate,
                source: FilePathSource.Redirected,
                entry: entry
              };
              
              const duration = Date.now() - t0;
              logger.debug(`[RED][resolve:end] name="${filename}" → ${normalizedCandidate} durMs=${duration}`);
              return result;
            }
          }
        }
      }
    }
    
    // Tier 2: explicit project-root probe (3161ea89). Replaces the implicit
    // behavior previously emergent from the synthetic *.* catch-all. Returns
    // FilePathSource.Project (not Redirected) since this is a direct probe,
    // not a redirection-entries hit.
    if (this.projectPath) {
      const projectCandidate = path.normalize(path.join(this.projectPath, filename));
      if (!checkedPaths.has(projectCandidate)) {
        checkedPaths.add(projectCandidate);
        if (candidateExists(projectCandidate)) {
          const duration = Date.now() - t0;
          logger.debug(`[RED][resolve:end] name="${filename}" → ${projectCandidate} (Tier 2 projRoot) durMs=${duration}`);
          return {
            path: projectCandidate,
            source: FilePathSource.Project,
            entry: undefined
          };
        }
      }
    }

    // Tier 3: libsrc fallback (b8b2d748). When Tier 1 entries + Tier 2 project
    // root both miss, walk serverSettings.libsrcPaths in declared order and
    // return the first existing match. No-op when libsrcPaths is empty.
    if (serverSettings.libsrcPaths?.length) {
      for (const libDir of serverSettings.libsrcPaths) {
        const candidate = path.join(libDir, filename);
        const normalized = path.normalize(candidate);
        if (checkedPaths.has(normalized)) continue;
        checkedPaths.add(normalized);
        if (candidateExists(normalized)) {
          const result = {
            path: normalized,
            source: FilePathSource.LibSrc,
            entry: undefined
          };
          const duration = Date.now() - t0;
          logger.debug(`[RED][resolve:end] name="${filename}" → ${normalized} (libsrc) durMs=${duration}`);
          return result;
        }
      }
    }

    const duration = Date.now() - t0;
    logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND durMs=${duration}`);
    return null;
  }

  // Async version of findFile — see `findFile` JSDoc for the strict
  // compiler-truth resolution chain (3161ea89 + 2a2656b1).
  public async findFileAsync(filename: string): Promise<ResolvedFilePath | null> {
    // Add instrumentation
    const t0 = Date.now();
    const resolverInstanceId = this.hashCode();
    logger.debug(`[RED][resolve] name="${filename}" instId=${resolverInstanceId}`);

    // Existence check via the shared runtime directory index (#289) — one cached readdir per
    // directory per TTL window instead of an fs access per candidate. See findFile's JSDoc.
    const runtimeIndex = DirectoryFileIndex.getRuntime();
    const fileExists = async (filePath: string) => runtimeIndex.existsPath(filePath);

    // 1. Absolute filename — existsSync direct.
    if (path.isAbsolute(filename)) {
      const exists = await fileExists(filename);
      const result = exists
        ? { path: filename, source: FilePathSource.Project, entry: undefined }
        : null;
      const duration = Date.now() - t0;
      logger.debug(`[RED][resolve:end] name="${filename}" → ${result?.path ?? 'NOT_FOUND'} (absolute) durMs=${duration}`);
      return result;
    }

    // 2. Pathed (contains `/` or `\`) — direct project-root join, SKIP RED entirely.
    if (filename.includes('/') || filename.includes('\\')) {
      if (!this.projectPath) {
        const duration = Date.now() - t0;
        logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND (pathed, no projectPath) durMs=${duration}`);
        return null;
      }
      const candidate = path.normalize(path.join(this.projectPath, filename));
      if (await fileExists(candidate)) {
        const duration = Date.now() - t0;
        logger.debug(`[RED][resolve:end] name="${filename}" → ${candidate} (pathed) durMs=${duration}`);
        return { path: candidate, source: FilePathSource.Project, entry: undefined };
      }
      const duration = Date.now() - t0;
      logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND (pathed) durMs=${duration}`);
      return null;
    }

    // 3. Bare filename — canonical 3-tier chain.
    // Create a map to track which paths we've already checked to avoid duplicates
    const checkedPaths = new Set<string>();
    
    // Create an array of promises to check all possible paths in parallel
    const checkPromises: Promise<ResolvedFilePath | null>[] = [];
    
    // If we have redirection entries, search through them
    if (this.entries.length > 0) {
      for (const entry of this.entries) {
        // Build-configuration filter (bd7e4a29). Mirrors
        // clarionProjectServer.getSearchPaths:381-383: only Common entries
        // and entries for the active configuration are consulted.
        // Lookup-time (not parse-time) so a configuration switch on the
        // same parser instance picks up the new active section without
        // re-parsing.
        if (!matchesActiveConfiguration(entry, serverSettings.configuration, this.projectPath)) {
          continue;
        }
        if (this.matchesMask(entry.extension, filename)) {
          for (const dir of entry.paths) {
            // Resolve relative paths against the project dir per Clarion 11.1
            // docs (01d635ef). The .red file's own dir is wrong for the
            // global-fallback case (e.g. %ClarionRoot%\bin\Clarion110.red).
            // Fall back to the .red dir only if no project dir was supplied.
            let resolvedDir = dir;
            if (dir === '.' || dir === '..') {
              const baseDir = this.projectPath ?? path.dirname(entry.redFile);
              resolvedDir = path.resolve(baseDir, dir);
            } else if (!path.isAbsolute(dir)) {
              // Other relative paths (e.g. `.\classes`, `.\SharedCode\equates`)
              // also resolve against the project dir per Clarion 11.1 docs
              // (cfaa7584 — completes the 01d635ef Layer 1 work). Fall back
              // to the .red dir only if projectPath is unset.
              const baseDir = this.projectPath ?? path.dirname(entry.redFile);
              resolvedDir = path.resolve(baseDir, dir);
            }

            const candidate = path.join(resolvedDir, filename);
            const normalizedCandidate = path.normalize(candidate);

            // Skip if we've already checked this path
            if (checkedPaths.has(normalizedCandidate)) {
              continue;
            }

            checkedPaths.add(normalizedCandidate);

            // Create a promise to check this path
            const checkPromise = fileExists(normalizedCandidate).then(exists => {
              if (exists) {
                return {
                  path: normalizedCandidate,
                  source: FilePathSource.Redirected,
                  entry: entry
                };
              }
              return null;
            });
            
            checkPromises.push(checkPromise);
          }
        }
      }
    }
    
    // Wait for all checks to complete and find the first successful result
    const results = await Promise.all(checkPromises);
    let result = results.find(result => result !== null) || null;

    // Tier 2: explicit project-root probe (3161ea89). Replaces the implicit
    // behavior previously emergent from the synthetic *.* catch-all. Returns
    // FilePathSource.Project (not Redirected) since this is a direct probe,
    // not a redirection-entries hit.
    if (!result && this.projectPath) {
      const projectCandidate = path.normalize(path.join(this.projectPath, filename));
      if (!checkedPaths.has(projectCandidate)) {
        checkedPaths.add(projectCandidate);
        if (await fileExists(projectCandidate)) {
          result = {
            path: projectCandidate,
            source: FilePathSource.Project,
            entry: undefined
          };
        }
      }
    }

    // Tier 3: libsrc fallback (b8b2d748). When Tier 1 entries + Tier 2 project
    // root both miss, walk serverSettings.libsrcPaths in declared order and
    // return the first existing match. Sequential rather than parallel —
    // declared-order priority matters and the fallback only fires after a
    // miss, so the cost is bounded.
    if (!result && serverSettings.libsrcPaths?.length) {
      for (const libDir of serverSettings.libsrcPaths) {
        const candidate = path.join(libDir, filename);
        const normalized = path.normalize(candidate);
        if (checkedPaths.has(normalized)) continue;
        checkedPaths.add(normalized);
        if (await fileExists(normalized)) {
          result = {
            path: normalized,
            source: FilePathSource.LibSrc,
            entry: undefined
          };
          break;
        }
      }
    }

    const duration = Date.now() - t0;
    if (result) {
      logger.debug(`[RED][resolve:end] name="${filename}" → ${result.path} durMs=${duration}`);
    } else {
      logger.debug(`[RED][resolve:end] name="${filename}" → NOT_FOUND durMs=${duration}`);
    }

    return result;
  }

  /**
   * Checks if a filename matches a mask
   * @param mask The mask to check against (e.g., "*.inc")
   * @param filename The filename to check
   * @returns True if the filename matches the mask
   */
  private matchesMask(mask: string, filename: string): boolean {
    if (mask === "*.*") return true;
    
    // Cache the processed mask for better performance
    const maskLower = mask.toLowerCase();
    const filenameLower = filename.toLowerCase();
    
    // Handle the common case of extension matching (e.g., "*.clw")
    if (maskLower.startsWith("*.")) {
      const ext = maskLower.substring(1); // Get ".clw"
      return filenameLower.endsWith(ext);
    }
    
    // Handle other mask patterns
    return filenameLower.endsWith(maskLower.replace("*", ""));
  }
}
