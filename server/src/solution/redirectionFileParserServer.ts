// Updated server-side version using serverSettings and supporting per-project redirection files, respecting compile mode/configuration

import * as path from "path";
import * as fs from "fs";
import LoggerManager from "../logger";
import { serverSettings } from "../serverSettings";

const logger = LoggerManager.getLogger("RedirectionParserServer");
logger.setLevel("error");

/**
 * Represents the source of a resolved file path
 */
export enum FilePathSource {
  Redirected = "redirected",
  Project = "project",
  Solution = "solution"
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

export class RedirectionFileParserServer {
  private readonly macros: Record<string, string>;
  private static redFileCache: Map<string, RedirectionEntry[]> = new Map();
  private entries: RedirectionEntry[] = [];

  constructor() {
    this.macros = serverSettings.macros;
  }

  public parseRedFile(projectPath: string): RedirectionEntry[] {
    // Check if we have cached entries for this project path
    const cacheKey = projectPath;
    if (RedirectionFileParserServer.redFileCache.has(cacheKey)) {
      logger.info(`✅ Using cached redirection entries for project: ${projectPath}`);
      this.entries = RedirectionFileParserServer.redFileCache.get(cacheKey) || [];
      return this.entries;
    }

    const projectRedFile = path.join(projectPath, serverSettings.redirectionFile);
    const globalRedFile = path.join(serverSettings.primaryRedirectionPath, serverSettings.redirectionFile);

    let redFileToParse = "";
    if (fs.existsSync(projectRedFile)) {
      redFileToParse = projectRedFile;
      logger.info(`Using project-specific redirection file: ${projectRedFile}`);
    } else if (fs.existsSync(globalRedFile)) {
      redFileToParse = globalRedFile;
      logger.warn(`Project-specific redirection file not found. Using global: ${globalRedFile}`);
    } else {
      logger.error("No valid redirection file found.");
      this.entries = [];
      return this.entries;
    }

    this.entries = this.parseRedFileRecursive(redFileToParse, [], true);
    
    // Cache the result
    RedirectionFileParserServer.redFileCache.set(cacheKey, this.entries);
    logger.info(`✅ Cached ${this.entries.length} redirection entries for project: ${projectPath}`);
    
    return this.entries;
  }

  private parseRedFileRecursive(
    redFileToParse: string,
    entries: RedirectionEntry[],
    isFirst: boolean
  ): RedirectionEntry[] {
    if (!fs.existsSync(redFileToParse)) {
      logger.error(`Redirection file not found: ${redFileToParse}`);
      return entries;
    }

    try {
      logger.info(`Parsing redirection file: ${redFileToParse}`);
      const content = fs.readFileSync(redFileToParse, "utf-8");
      const redPath = path.dirname(redFileToParse);
      let currentSection: string | null = null;

      if (isFirst) {
        entries.push({ redFile: redFileToParse, section: "Common", extension: "*.*", paths: ["."] });
        logger.info(`Added default *.* = '.' entry for ${redFileToParse}`);
      }

      for (const line of content.split("\n")) {
        const trimmed = line.trim();
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
            this.parseRedFileRecursive(includePath, entries, false);
          }
          continue;
        }

        if (trimmed.includes("=") && currentSection) {
          // Process all sections, filtering will happen when using the entries
          const parts = trimmed.split("=").map(s => s.trim());
          if (parts.length === 2) {
            const [mask, raw] = parts;
            const paths = raw.split(";").map((p: string) => {
              const resolved = this.resolveMacro(p.trim());
              logger.info(`Resolved path: ${p.trim()} -> ${resolved}`);
              return resolved;
            });
            
            entries.push({
              redFile: redFileToParse,
              section: currentSection,
              extension: mask,
              paths
            });
            
            logger.info(`Added entry: ${mask} = ${paths.join(';')} in section [${currentSection}]`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error parsing redirection file ${redFileToParse}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return entries;
  }

  private resolveMacro(input: string): string {
    const macroPattern = /%([^%]+)%/g;
    let resolved = input;
    let match;

    while ((match = macroPattern.exec(resolved)) !== null) {
      const macro = match[1].toLowerCase();
      let value = this.macros[macro];

      if (!value) {
        if (macro === "bin") {
          value = serverSettings.primaryRedirectionPath;
        } else if (macro === "redname") {
          value = path.basename(serverSettings.redirectionFile);
        } else {
          value = match[0];
        }
      }

      resolved = resolved.replace(match[0], value);
    }

    return path.normalize(resolved);
  }

  /**
   * Finds a file in the redirection paths
   * @param filename The filename to find
   * @returns The resolved file path info if found, null otherwise
   */
  public findFile(filename: string): ResolvedFilePath | null {
    for (const entry of this.entries) {
      if (this.matchesMask(entry.extension, filename)) {
        for (const dir of entry.paths) {
          const candidate = path.join(dir, filename);
          if (fs.existsSync(candidate)) {
            return {
              path: path.normalize(candidate),
              source: FilePathSource.Redirected,
              entry: entry
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Checks if a filename matches a mask
   * @param mask The mask to check against (e.g., "*.inc")
   * @param filename The filename to check
   * @returns True if the filename matches the mask
   */
  private matchesMask(mask: string, filename: string): boolean {
    if (mask === "*.*") return true;
    return filename.toLowerCase().endsWith(mask.toLowerCase().replace("*", ""));
  }
}
