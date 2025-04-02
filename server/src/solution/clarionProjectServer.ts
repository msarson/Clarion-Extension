import * as path from 'path';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import LoggerManager from '../logger';
import { RedirectionEntry, RedirectionFileParserServer } from './redirectionFileParserServer';
import { serverSettings } from '../serverSettings';
import { ClarionSourcerFileServer } from './clarionSourceFileServer';
import { TextDocument } from 'vscode-languageserver-protocol';

const logger = LoggerManager.getLogger("ClarionProjectServer");

export class ClarionProjectServer {
    sourceFiles: ClarionSourcerFileServer[] = [];
    redirectionEntries: RedirectionEntry[] = [];
    private searchPathsCache: Map<string, string[]> = new Map();

    constructor(
        public name: string,
        public type: string,
        public path: string,
        public guid: string,
        public filename: string = `${name}.cwproj`
    ) {
        logger.info(`📁 Initializing ClarionProjectServer: ${name}`);
    }

    async loadSourceFilesFromProjectFile(): Promise<void> {
        try {
            const projectFile = path.join(this.path, `${this.name}.cwproj`);

            if (!fs.existsSync(projectFile)) {
                logger.warn(`⚠️ Project file not found: ${projectFile}`);
                return;
            }

            try {
                const xmlContent = fs.readFileSync(projectFile, 'utf-8');
                const parsed = await xml2js.parseStringPromise(xmlContent);
                const compileItems = parsed?.Project?.ItemGroup?.flatMap((group: any) =>
                    group.Compile?.map((c: any) => c.$.Include) || []
                ) ?? [];

                logger.info(`📂 Found ${compileItems.length} compile items in project ${this.name}`);

                for (const file of compileItems) {
                    try {
                        const resolvedPath = this.findFileInProjectPaths(file);
                        if (resolvedPath) {
                            const relativePath = path.relative(this.path, resolvedPath);
                            this.sourceFiles.push(new ClarionSourcerFileServer(file, relativePath, this));
                            logger.info(`✅ Added source file: ${file} (${relativePath})`);
                        } else {
                            logger.warn(`❌ Could not resolve file: ${file}`);
                        }
                    } catch (fileError) {
                        logger.error(`❌ Error processing file ${file}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
                    }
                }
            } catch (parseErr) {
                logger.error(`❌ Failed to parse .cwproj: ${projectFile}`, parseErr);
            }
        } catch (error) {
            logger.error(`❌ Unexpected error in loadSourceFilesFromProjectFile: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    public findSourceFileByName(name: string): ClarionSourcerFileServer | undefined {
        const lowerName = name.toLowerCase();
        return this.sourceFiles.find(f => f.name.toLowerCase() === lowerName);
    }
    

    public async readFileContents(filePath: string): Promise<string | null> {
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf-8');
            }
        } catch (e) {
            logger.error(`Failed to read file: ${filePath}`, e);
        }
        return null;
    }
    public getTextDocumentByPath(filePath: string): TextDocument | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const uri = `file:///${filePath.replace(/\\/g, '/')}`;
            return TextDocument.create(uri, 'clarion', 1, content);
        } catch (e) {
            logger.error(`Failed to read file for TextDocument: ${filePath}`, e);
            return null;
        }
    }
    public getSearchPaths(fileExtension: string): string[] {
        const normalizedExt = fileExtension.startsWith('.') ?
            `*${fileExtension.toLowerCase()}` :
            `*.${fileExtension.toLowerCase()}`;

        // Check cache first
        const cacheKey = `${normalizedExt}|${serverSettings.configuration}`;
        if (this.searchPathsCache.has(cacheKey)) {
            logger.info(`✅ Using cached search paths for ${normalizedExt} in project ${this.name}`);
            return this.searchPathsCache.get(cacheKey) || [];
        }

        logger.info(`🔍 Resolving search paths for extension: ${fileExtension}, using configuration: ${serverSettings.configuration}`);

        const redParser = new RedirectionFileParserServer();

        if (!this.redirectionEntries.length) {
            this.redirectionEntries = redParser.parseRedFile(this.path);
            logger.info(`📂 Parsed redirection file for project ${this.name}, found ${this.redirectionEntries.length} entries`);
        }

        // Include both Common and configuration-specific entries
        const matchingEntries = this.redirectionEntries.filter(entry =>
            entry.section === "Common" || entry.section === serverSettings.configuration
        );

        logger.info(`📂 Found ${matchingEntries.length} matching entries for section Common or ${serverSettings.configuration}`);

        // Filter entries by extension and resolve paths
        const paths = matchingEntries
            .filter(entry => entry.extension.toLowerCase() === normalizedExt || entry.extension === "*.*")
            .flatMap(entry => {
                logger.info(`📂 Processing entry: ${entry.extension} from section ${entry.section}`);
                return entry.paths.map(p => {
                    const resolvedPath = path.isAbsolute(p) ? p : path.resolve(this.path, p);
                    logger.info(`📂 Resolved path: ${p} -> ${resolvedPath}`);
                    return resolvedPath;
                });
            });

        // ✅ Ensure the directory containing the redirection file is included
        paths.push(path.dirname(this.path));

        const uniquePaths = Array.from(new Set(paths));

        logger.info(`✅ Resolved search paths for ${normalizedExt}: (${uniquePaths.length})`);
        uniquePaths.forEach((p, i) => logger.info(`   ${i + 1}. ${p}`));

        // Cache the result
        this.searchPathsCache.set(cacheKey, uniquePaths);
        logger.info(`✅ Cached search paths for ${normalizedExt} in project ${this.name}`);

        return uniquePaths;
    }



    private findFileInProjectPaths(fileName: string): string | null {
        const ext = path.extname(fileName).toLowerCase();
        const searchPaths = this.getSearchPaths(ext);

        for (const spath of searchPaths) {
            const full = path.normalize(path.join(spath, fileName));
            if (fs.existsSync(full)) {
                return full;
            }
        }

        return null;
    }

    /**
     * Gets the redirection parser for this project
     * @returns A RedirectionFileParserServer instance
     */
    public getRedirectionParser(): RedirectionFileParserServer {
        const redParser = new RedirectionFileParserServer();
        redParser.parseRedFile(this.path);
        return redParser;
    }
}
