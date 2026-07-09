import * as fs from 'fs';
import * as path from 'path';
import { ClarionSolutionServer, ClarionApp } from './clarionSolutionServer';
import LoggerManager from '../logger';
import { ClarionProjectServer } from './clarionProjectServer';
import { Connection } from 'vscode-languageserver';
import { Token, ClarionTokenizer } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { solutionOperationInProgress } from '../server';
import { DirectoryFileIndex } from './DirectoryFileIndex';

const logger = LoggerManager.getLogger("SolutionManager");
logger.setLevel("error");
// Always-on ("perf" level) timeline for solution loading — emits even in a release VSIX so slow
// per-project source-file loads are visible in the "Clarion Language Server" output channel.
const perfLogger = LoggerManager.getLogger("SolutionLoadPerf", "perf");

export class SolutionManager {
    public solution: ClarionSolutionServer;
    public solutionFilePath: string;
    private static instance: SolutionManager | null = null;
    private fileCache: Map<string, string> = new Map();
    private static readonly CACHE_VERSION = 1; // Increment when cache format changes
    
    // Cache for equates.clw tokens — resolved once via redirection
    private equatesTokens: Token[] | null = null;
    private equatesPath: string | null = null;

    // Static in-memory cache to store solution data by file path (similar to client-side implementation)
    private static inMemoryCache: Map<string, {
        version: number,
        timestamp: number,
        solution: ClarionSolutionServer
    }> = new Map();

    private constructor(filePath: string) {
        this.solutionFilePath = filePath;
        const solutionName = path.basename(filePath);
        this.solution = new ClarionSolutionServer(solutionName, filePath);
        logger.info(`📂 Created SolutionManager for ${solutionName}`);
    }

    public getAllSourceFiles(): { fullPath: string, tokens: Token[] }[] {
        const allFiles: { fullPath: string, tokens: Token[] }[] = [];
    
        for (const project of this.solution.projects) {
            for (const file of project.sourceFiles) {
                const fullPath = path.join(project.path, file.relativePath);
                const documentUri = `file:///${fullPath.replace(/\\/g, "/")}`;
                const document = project.getTextDocumentByPath?.(fullPath);
                if (!document) continue;
    
                const tokens = TokenCache.getInstance().getTokens(document);
                allFiles.push({ fullPath, tokens });
            }
        }
    
        return allFiles;
    }
    
    /**
     * Clears the in-memory cache for a specific solution file
     * @param filePath The path to the solution file to clear the cache for
     */
    public static clearCache(filePath: string): void {
        if (SolutionManager.inMemoryCache.has(filePath)) {
            SolutionManager.inMemoryCache.delete(filePath);
            logger.info(`✅ Cleared in-memory cache for: ${filePath}`);
        }
    }

    /**
     * Clears all in-memory caches
     */
    public static clearAllCaches(): void {
        SolutionManager.inMemoryCache.clear();
        logger.info(`✅ Cleared all in-memory caches`);
    }

    public static async create(filePath: string): Promise<SolutionManager> {
        try {
            // Set the solution operation flag to true
            (global as any).solutionOperationInProgress = true;
            
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                throw new Error(`❌ Expected a file path but received a directory: ${filePath}`);
            }

            if (!SolutionManager.instance) {
                SolutionManager.instance = new SolutionManager(filePath);
                await SolutionManager.instance.initialize();
            } else if (SolutionManager.instance.solutionFilePath !== filePath) {
                // If the solution file has changed, create a new instance
                SolutionManager.instance = new SolutionManager(filePath);
                await SolutionManager.instance.initialize();
            }

            return SolutionManager.instance;
        } finally {
            // Reset the solution operation flag when done
            (global as any).solutionOperationInProgress = false;
        }
    }

    public static getInstance(): SolutionManager | null {
        return SolutionManager.instance;
    }

    private async initialize() {
        const startTime = performance.now();
        logger.info(`🕒 Starting initialize`);
        
        try {
            // Set the solution operation flag to true
            (global as any).solutionOperationInProgress = true;
            
            logger.info(`🔄 Initializing solution from ${this.solutionFilePath}`);
            
            // Log memory usage before parsing
            const memoryBefore = process.memoryUsage();
            logger.info(`📊 Memory usage before solution parsing:
                - RSS: ${Math.round(memoryBefore.rss / 1024 / 1024)} MB
                - Heap total: ${Math.round(memoryBefore.heapTotal / 1024 / 1024)} MB
                - Heap used: ${Math.round(memoryBefore.heapUsed / 1024 / 1024)} MB
            `);
            
            this.solution = await this.parseSolution();
            this.equatesTokens = null; // reset so equates.clw is re-resolved with new project paths
            this.equatesPath = null;
            
            // Log memory usage after parsing
            const memoryAfter = process.memoryUsage();
            logger.info(`📊 Memory usage after solution parsing:
                - RSS: ${Math.round(memoryAfter.rss / 1024 / 1024)} MB
                - Heap total: ${Math.round(memoryAfter.heapTotal / 1024 / 1024)} MB
                - Heap used: ${Math.round(memoryAfter.heapUsed / 1024 / 1024)} MB
            `);
            
            logger.info(`✅ Solution initialized with ${this.solution.projects.length} projects`);
            
            const endTime = performance.now();
            logger.info(`🕒 initialize completed in ${(endTime - startTime).toFixed(2)}ms`);
        } finally {
            // Reset the solution operation flag when done
            (global as any).solutionOperationInProgress = false;
        }
    }

    private async parseSolution(): Promise<ClarionSolutionServer> {
        const startTime = performance.now();
        logger.info(`🕒 Starting parseSolution`);
        // #290: sub-phase marks — an unattributed ~9.6s sync block was observed inside the
        // SolutionManager-init window BEFORE the (sub-second) project loop; these pin which
        // sub-phase carries it on the next perf capture.
        const mark = (phase: string, from: number) =>
            perfLogger.perf(`SolutionLoad: parseSolution ${phase}`, { ms: Math.round(performance.now() - from) });

        try {
            // Try to load from cache first
            const cacheStart = performance.now();
            if (await this.loadFromCache()) {
                const endTime = performance.now();
                logger.info(`🕒 parseSolution completed in ${(endTime - startTime).toFixed(2)}ms (loaded from cache)`);
                return this.solution;
            }
            mark('cache-miss check', cacheStart);

            // Use async file existence check
            const accessStart = performance.now();
            try {
                await fs.promises.access(this.solutionFilePath, fs.constants.F_OK);
            } catch {
                logger.error(`❌ Solution file not found: ${this.solutionFilePath}`);
                return new ClarionSolutionServer();
            }
            // #297: ~5s of unattributed sync occupancy sits between the cache-miss mark and the
            // first RED-parse outcome on Mark's VM — these marks bisect that window.
            mark('sln access', accessStart);

            try {
                // Use async file reading
                const readStart = performance.now();
                const content = await fs.promises.readFile(this.solutionFilePath, 'utf-8');
                mark('sln read', readStart);
                logger.info(`📂 Solution file content length: ${content.length} bytes`);
                
                // Count the number of project entries in the solution file
                const projectCount = (content.match(/Project\("/g) || []).length;
                logger.info(`📂 Found ${projectCount} project entries in solution file`);
                
                // #288: fresh directory index per load — projects share search dirs, so each unique
                // dir is readdir'd once for the whole solution instead of stat-per-file-per-dir.
                DirectoryFileIndex.getInstance().clear();

                const regex = /Project\("([^\"]+)"\) = "([^\"]+)", "([^\"]+)", "([^\"]+)"/g;
                let match: RegExpExecArray | null;
                
                const solution = new ClarionSolutionServer(
                    path.basename(this.solutionFilePath, '.sln'),
                    this.solutionFilePath
                );

                // Create an array of promises for loading projects in parallel
                const projectPromises: Promise<void>[] = [];
                const projectsToAdd: ClarionProjectServer[] = [];

                const loopStart = performance.now();
                while ((match = regex.exec(content)) !== null) {
                    try {
                        const [, projectType, projectName, projectPath, projectGuid] = match;
                        if (!projectPath.toLowerCase().endsWith('.cwproj')) continue;

                        logger.info(`📂 Found project: ${projectName} (${projectPath})`);
                        const absoluteProjectDir = path.dirname(path.resolve(this.solutionFilePath, '..', projectPath));
                        const project = new ClarionProjectServer(projectName, projectType, absoluteProjectDir, projectGuid);
                        
                        // Add to the list of projects to add to the solution
                        projectsToAdd.push(project);
                        
                        // Create a promise for loading this project's source files (timed per project
                        // so a slow redirection / source enumeration shows up against its neighbours).
                        const projectPromise = (async () => {
                            const projStart = performance.now();
                            try {
                                await project.loadSourceFilesFromProjectFile();
                            } catch (projectError) {
                                logger.error(`❌ Error loading source files for project ${projectName}: ${projectError instanceof Error ? projectError.message : String(projectError)}`);
                                // We'll still add the project even if loading source files failed
                            }
                            perfLogger.perf("SolutionLoad: project source files loaded", {
                                ms: Math.round(performance.now() - projStart),
                                read_parse_ms: project.lastLoadReadParseMs,
                                resolve_ms: project.lastLoadResolveMs,
                                project: projectName,
                                source_files: project.sourceFiles.length,
                                // #293: unresolved Compile items are kept with bare names and
                                // silently break every consumer that reconstructs absolute paths.
                                unresolved: project.lastLoadUnresolved,
                                unresolved_sample: project.lastLoadUnresolvedSample.join(';') || '(none)'
                            });
                        })();
                        
                        projectPromises.push(projectPromise);
                    } catch (matchError) {
                        logger.error(`❌ Error processing project match: ${matchError instanceof Error ? matchError.message : String(matchError)}`);
                    }
                }

                mark('project scan loop (constructors + promise starts)', loopStart);

                // Wait for all projects to load in parallel
                const loadAllStart = performance.now();
                await Promise.all(projectPromises);
                mark('all project loads', loadAllStart);

                // #288: how much stat traffic the directory index absorbed this load.
                const idx = DirectoryFileIndex.getInstance().stats();
                perfLogger.perf("SolutionLoad: directory index stats", {
                    dirs_read: idx.dirsRead,
                    dirs_cached: idx.dirsCached,
                    existence_lookups: idx.lookups
                });
                
                // Add all projects to the solution
                for (const project of projectsToAdd) {
                    solution.projects.push(project);
                    logger.info(`✅ Added project ${project.name} with ${project.sourceFiles.length} source files`);
                }

                // Parse Clarion .APP files from Solution Items section
                logger.info(`🔍 Searching for Solution Items with APP files`);
                const appFilesStart = performance.now();
                this.parseApplicationFiles(content, solution);
                mark('parseApplicationFiles', appFilesStart);

                logger.info(`📂 Finished parsing solution file. Found ${solution.projects.length} projects and ${solution.applications.length} applications.`);

                // Save the parsed solution to cache
                this.solution = solution;
                const saveCacheStart = performance.now();
                await this.saveToCache();
                mark('saveToCache', saveCacheStart);

                const endTime = performance.now();
                logger.info(`🕒 parseSolution completed in ${(endTime - startTime).toFixed(2)}ms`);
                
                return solution;
            } catch (readError) {
                logger.error(`❌ Error reading solution file: ${readError instanceof Error ? readError.message : String(readError)}`);
                return new ClarionSolutionServer();
            }
        } catch (error) {
            logger.error(`❌ Unexpected error in parseSolution: ${error instanceof Error ? error.message : String(error)}`);
            return new ClarionSolutionServer();
        }
    }

    /**
     * Parses .APP files from the Solution Items section of a .sln file
     * @param content The content of the .sln file
     * @param solution The solution object to add APP files to
     */
    private parseApplicationFiles(content: string, solution: ClarionSolutionServer): void {
        try {
            logger.info(`🔍 Parsing Clarion .APP files from Solution Items`);
            
            // Find the "Solution Items" project section
            const solutionItemsRegex = /Project\("\{2150E333-8FDC-42A3-9474-1A3956D46DE8\}"\)\s*=\s*"Solution Items"[^]*?ProjectSection\(SolutionItems\)\s*=\s*postProject([\s\S]*?)EndProjectSection/i;
            const solutionItemsMatch = solutionItemsRegex.exec(content);
            
            if (!solutionItemsMatch) {
                logger.info(`ℹ️ No Solution Items section found in .sln file`);
                return;
            }
            
            const solutionItemsContent = solutionItemsMatch[1];
            logger.info(`✅ Found Solution Items section`);
            
            // Extract APP file entries (format: "filename.app = filename.app")
            const appRegex = /^\s*(.+?\.app)\s*=\s*(.+?\.app)\s*$/gim;
            let appMatch;
            const solutionDir = path.dirname(this.solutionFilePath);
            
            while ((appMatch = appRegex.exec(solutionItemsContent)) !== null) {
                try {
                    const appFileName = appMatch[1].trim();
                    logger.info(`📱 Found APP file: ${appFileName}`);
                    
                    // Resolve the absolute path
                    let absolutePath: string;
                    if (path.isAbsolute(appFileName)) {
                        absolutePath = path.normalize(appFileName);
                    } else {
                        absolutePath = path.normalize(path.join(solutionDir, appFileName));
                    }
                    
                    // Check if file exists (but still add it even if it doesn't)
                    const exists = fs.existsSync(absolutePath);
                    if (!exists) {
                        logger.warn(`⚠️ APP file does not exist: ${absolutePath}`);
                    } else {
                        logger.info(`✅ Verified APP file exists: ${absolutePath}`);
                    }
                    
                    solution.applications.push({
                        name: path.basename(appFileName),
                        relativePath: appFileName,
                        absolutePath: absolutePath
                    });
                } catch (appError) {
                    logger.error(`❌ Error processing APP file: ${appError instanceof Error ? appError.message : String(appError)}`);
                }
            }
            
            logger.info(`📱 Found ${solution.applications.length} APP file(s)`);
        } catch (error) {
            logger.error(`❌ Error parsing APP files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public findProjectForFile(filePath: string): ClarionProjectServer | undefined {
        const normalizedPath = path.normalize(filePath).toLowerCase();
        const baseName = path.basename(normalizedPath);

        // Prefer exact absolute path match (handles duplicate basenames across projects)
        for (const project of this.solution.projects) {
            for (const f of project.sourceFiles) {
                const abs = f.getAbsolutePath();
                if (abs && path.normalize(abs).toLowerCase() === normalizedPath) {
                    return project;
                }
            }
        }

        // Fall back to basename match (for files resolved via redirection)
        return this.solution.projects.find(project =>
            project.sourceFiles.some(f => f.name.toLowerCase() === baseName)
        );
    }

    /**
     * Returns the project path that should be used as the SDI cache key for a given file.
     * Prefers the project's own path (from the .sln/.cwproj) so files in redirection
     * output directories (e.g. genfiles\src) resolve to the same key used at startup.
     * Falls back to the file's directory if no project is found.
     */
    public getProjectPathForFile(filePath: string): string {
        const project = this.findProjectForFile(filePath);
        return project?.path || path.dirname(filePath);
    }

    /** Returns the full path to the specific .cwproj file for the project owning filePath. */
    public getProjectCwprojForFile(filePath: string): string | undefined {
        const project = this.findProjectForFile(filePath);
        if (!project) return undefined;
        return path.join(project.path, `${project.name}.cwproj`);
    }

    /**
     * Resolves equates.clw via project redirection and returns its tokenized content.
     * equates.clw is implicitly in scope for all Clarion programs (global equates/constants).
     * Result is cached for the lifetime of the solution.
     */
    public getEquatesTokens(): Token[] | null {
        if (this.equatesTokens !== null) return this.equatesTokens;

        // findFile already walks RED + project + libsrc tiers (b8b2d748);
        // a separate libsrcPaths fallback here would re-probe the same dirs.
        for (const project of this.solution.projects) {
            const redParser = project.getRedirectionParser();
            const result = redParser.findFile('equates.clw');
            if (result?.path && fs.existsSync(result.path)) {
                if (this.loadEquatesFrom(result.path)) return this.equatesTokens;
            }
        }

        logger.info(`equates.clw not found via redirection`);
        return null;
    }

    private loadEquatesFrom(filePath: string): boolean {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            this.equatesTokens = new ClarionTokenizer(content).tokenize();
            this.equatesPath = filePath;
            logger.info(`✅ equates.clw resolved at ${filePath} (${this.equatesTokens.length} tokens)`);
            return true;
        } catch (e) {
            logger.warn(`Failed to tokenize equates.clw at ${filePath}: ${e}`);
            return false;
        }
    }

    /** Returns the resolved path of equates.clw, or null if not found. */
    public getEquatesPath(): string | null {
        this.getEquatesTokens(); // ensure resolved
        return this.equatesPath;
    }

    // #297 fix 7 (audit H1): the old implementation fanned out EVERY candidate across all 40
    // projects with Promise.all (no early exit), had no negative cache (every miss re-ran the
    // whole fan-out), and no in-flight coalescing (the client fires bursts of identical names).
    // The audit's own evidence: "113 parallel clarion/findFile requests block the server 5+
    // seconds". Now: positive cache → negative cache (TTL) → coalesced sequential search with
    // first-hit early exit, existence answered by the runtime directory index (memory).
    private inflightFinds: Map<string, Promise<{ path: string, source: string }>> = new Map();
    private negativeFindCache: Map<string, number> = new Map();
    private static readonly NEGATIVE_FIND_TTL_MS = 30_000;

    public async findFileWithExtension(filename: string): Promise<{ path: string, source: string }> {
        if (!filename) {
            logger.warn(`⚠️ Filename is undefined or null`);
            return { path: '', source: "" };
        }
        const key = filename.toLowerCase();

        // Positive cache (existence revalidated via the runtime index — cheap)
        if (this.fileCache.has(filename)) {
            const cachedPath = this.fileCache.get(filename)!;
            if (DirectoryFileIndex.getRuntime().existsPath(cachedPath)) {
                return { path: cachedPath, source: "cache" };
            }
            this.fileCache.delete(filename);
        }

        // Negative cache — a name that just missed will miss again; don't re-run the search
        const negAt = this.negativeFindCache.get(key);
        if (negAt !== undefined && Date.now() - negAt < SolutionManager.NEGATIVE_FIND_TTL_MS) {
            return { path: '', source: "" };
        }

        // In-flight coalescing — concurrent requests for the same name share one search
        const inflight = this.inflightFinds.get(key);
        if (inflight) {
            return inflight;
        }
        const search = this.findFileWithExtensionInner(filename, key);
        this.inflightFinds.set(key, search);
        try {
            return await search;
        } finally {
            this.inflightFinds.delete(key);
        }
    }

    private async findFileWithExtensionInner(filename: string, key: string): Promise<{ path: string, source: string }> {
        try {
            logger.info(`🔍 Searching for file: ${filename}`);
            const ext = path.extname(filename).toLowerCase();
            const runtimeIndex = DirectoryFileIndex.getRuntime();
            const baseNameLower = path.basename(filename).toLowerCase();

            // 1. Project source-file lists (authoritative post-#293) — first hit wins.
            for (const project of this.solution.projects) {
                if (!project.sourceFiles || project.sourceFiles.length === 0) continue;
                const sourceFile = project.sourceFiles.find(sf => sf?.name && sf.name.toLowerCase() === baseNameLower);
                if (sourceFile?.relativePath) {
                    const fullPath = path.join(project.path, sourceFile.relativePath);
                    if (runtimeIndex.existsPath(fullPath)) {
                        this.fileCache.set(filename, fullPath);
                        return { path: fullPath, source: "project" };
                    }
                }
            }

            // 2. Redirection resolution per project — findFile already answers existence from the
            //    runtime index, so this is a memory walk; first hit wins.
            for (const project of this.solution.projects) {
                const redResult = project.getRedirectionParser().findFile(filename);
                if (redResult?.path && runtimeIndex.existsPath(redResult.path)) {
                    this.fileCache.set(filename, redResult.path);
                    return { path: redResult.path, source: "redirected" };
                }
            }

            // 3. Raw search-path joins as the last tier — memory lookups via the index.
            for (const project of this.solution.projects) {
                for (const searchPath of project.getSearchPaths(ext)) {
                    const fullPath = path.join(searchPath, filename);
                    if (runtimeIndex.existsPath(fullPath)) {
                        this.fileCache.set(filename, fullPath);
                        return { path: fullPath, source: "project-search-path" };
                    }
                }
            }

            logger.warn(`❌ File '${filename}' not found in any project paths.`);
            this.negativeFindCache.set(key, Date.now());
            return { path: '', source: "" };
        } catch (error) {
            logger.error(`❌ Error searching for file: ${error instanceof Error ? error.message : String(error)}`);
            return { path: '', source: "" };
        }
    }

    public registerHandlers(connection: Connection): void {
        logger.info("🔄 Registering solution manager handlers");
        
        connection.onRequest('clarion/getSolutionTree', () => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                logger.info("📂 Received request for solution tree");
                const tree = this.getSolutionTree();
                logger.info(`📂 Returning solution tree with ${tree.projects.length} projects and ${tree.applications?.length || 0} applications`);
                return tree;
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
        
        // Add a new handler for getting project details on demand
        connection.onRequest('clarion/getProjectDetails', (params: { projectGuid: string }) => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                logger.info(`📂 Received request for project details: ${params.projectGuid}`);
                const details = this.getProjectDetails(params.projectGuid);
                return details;
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
        
        // Add a new handler for getting project files
        connection.onRequest('clarion/getProjectFiles', (params: { projectGuid: string }) => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                logger.info(`📂 Received request for project files: ${params.projectGuid}`);
                
                // Log all available project GUIDs for debugging
                logger.info(`📂 Available project GUIDs: ${this.solution.projects.map(p => p.guid).join(', ')}`);
                
                // Normalize the requested GUID by removing curly braces
                const normalizedRequestGuid = params.projectGuid.replace(/[{}]/g, '');
                logger.info(`📂 Normalized requested GUID: ${normalizedRequestGuid}`);
                
                // First try exact match with normalized GUIDs
                const project = this.solution.projects.find(p =>
                    p.guid.replace(/[{}]/g, '') === normalizedRequestGuid
                );
                
                if (!project) {
                    logger.warn(`⚠️ Project with GUID ${params.projectGuid} not found`);
                    
                    // Try a case-insensitive search as a fallback
                    const projectCaseInsensitive = this.solution.projects.find(p =>
                        p.guid.replace(/[{}]/g, '').toLowerCase() === normalizedRequestGuid.toLowerCase()
                    );
                    
                    if (projectCaseInsensitive) {
                        logger.info(`✅ Found project with case-insensitive GUID match: ${projectCaseInsensitive.name} (${projectCaseInsensitive.guid})`);
                        
                        // Add detailed logging about the project's source files
                        logger.info(`📂 Project ${projectCaseInsensitive.name} has ${projectCaseInsensitive.sourceFiles ? projectCaseInsensitive.sourceFiles.length : 0} source files (case-insensitive match)`);
                        
                        if (!projectCaseInsensitive.sourceFiles || projectCaseInsensitive.sourceFiles.length === 0) {
                            logger.warn(`⚠️ Project ${projectCaseInsensitive.name} has no source files (case-insensitive match)`);
                            
                            // Log additional project details for debugging
                            logger.info(`📂 Project details: path=${projectCaseInsensitive.path}, filename=${projectCaseInsensitive.filename}`);
                            
                            // Check if the project file exists
                            const projectFilePath = path.join(projectCaseInsensitive.path, projectCaseInsensitive.filename);
                            try {
                                const exists = fs.existsSync(projectFilePath);
                                logger.info(`📂 Project file ${projectFilePath} exists: ${exists}`);
                                
                                if (exists) {
                                    // Try to read the project file content
                                    try {
                                        const content = fs.readFileSync(projectFilePath, 'utf-8');
                                        logger.info(`📂 Project file content length: ${content.length} bytes`);
                                        
                                        // Count the number of source file entries in the project file
                                        const sourceFileCount = (content.match(/<Compile Include/g) || []).length;
                                        logger.info(`📂 Found ${sourceFileCount} <Compile Include> entries in project file`);
                                    } catch (readError) {
                                        logger.error(`❌ Error reading project file: ${readError instanceof Error ? readError.message : String(readError)}`);
                                    }
                                }
                            } catch (error) {
                                logger.error(`❌ Error checking project file: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        }
                        
                        // Filter the source files to only include Compile Include entries
                        // This ensures we only show source code files in the tree view
                        const sourceFiles = (projectCaseInsensitive.sourceFiles || []).filter(file => {
                            // We only want to include actual source files (from Compile Include entries)
                            // We can identify these by checking if they have a .clw or other source file extension
                            if (!file || !file.name) {
                                return false;
                            }
                            
                            const ext = path.extname(file.name).toLowerCase();
                            // Include only source code files with relevant extensions
                            return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                        });
                        
                        logger.info(`📂 Filtered source files for project ${projectCaseInsensitive.name}: ${sourceFiles.length} out of ${(projectCaseInsensitive.sourceFiles || []).length} total files`);
                        
                        // Return only the filtered source files for the project
                        const files = sourceFiles.map(file => {
                            if (!file) {
                                logger.warn(`⚠️ Found null or undefined source file in project ${projectCaseInsensitive.name}`);
                                return {
                                    name: "unknown",
                                    relativePath: "",
                                    project: {
                                        name: projectCaseInsensitive.name,
                                        type: projectCaseInsensitive.type,
                                        path: projectCaseInsensitive.path,
                                        guid: projectCaseInsensitive.guid,
                                        filename: projectCaseInsensitive.filename
                                    }
                                };
                            }
                            // Log the file details for debugging
                            logger.info(`📂 Processing file: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                            
                            // Ensure name is never undefined
                            // First try to use the file name directly
                            // If that's undefined, try to extract it from relativePath
                            // If both are undefined, use a unique identifier to avoid duplicate files
                            const fileName = file.name ||
                                (file.relativePath ? path.basename(file.relativePath) : null) ||
                                `unknown-file-${Math.random().toString(36).substring(2, 10)}`;
                            
                            // Log the file name resolution for debugging
                            logger.info(`📂 File name resolution for project ${projectCaseInsensitive.name}: name=${file.name}, relativePath=${file.relativePath}, resolved=${fileName}`);
                            
                            return {
                                name: fileName,
                                relativePath: file.relativePath || fileName,
                                project: {
                                    name: projectCaseInsensitive.name,
                                    type: projectCaseInsensitive.type,
                                    path: projectCaseInsensitive.path,
                                    guid: projectCaseInsensitive.guid,
                                    filename: projectCaseInsensitive.filename
                                }
                            };
                        });
                        
                        logger.info(`📂 Returning ${files.length} files for project ${projectCaseInsensitive.name} (case-insensitive match)`);
                        return { files };
                    }
                    
                    return { files: [] };
                }
                
                // Add detailed logging about the project's source files
                logger.info(`📂 Project ${project.name} has ${project.sourceFiles ? project.sourceFiles.length : 0} source files`);
                
                if (!project.sourceFiles || project.sourceFiles.length === 0) {
                    logger.warn(`⚠️ Project ${project.name} has no source files`);
                    
                    // Log additional project details for debugging
                    logger.info(`📂 Project details: path=${project.path}, filename=${project.filename}`);
                    
                    // Check if the project file exists
                    const projectFilePath = path.join(project.path, project.filename);
                    try {
                        const exists = fs.existsSync(projectFilePath);
                        logger.info(`📂 Project file ${projectFilePath} exists: ${exists}`);
                        
                        if (exists) {
                            // Try to read the project file content
                            try {
                                const content = fs.readFileSync(projectFilePath, 'utf-8');
                                logger.info(`📂 Project file content length: ${content.length} bytes`);
                                
                                // Count the number of source file entries in the project file
                                const sourceFileCount = (content.match(/<Compile Include/g) || []).length;
                                logger.info(`📂 Found ${sourceFileCount} <Compile Include> entries in project file`);
                            } catch (readError) {
                                logger.error(`❌ Error reading project file: ${readError instanceof Error ? readError.message : String(readError)}`);
                            }
                        }
                    } catch (error) {
                        logger.error(`❌ Error checking project file: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                
                // Filter the source files to only include Compile Include entries
                // This ensures we only show source code files in the tree view
                const sourceFiles = (project.sourceFiles || []).filter(file => {
                    // We only want to include actual source files (from Compile Include entries)
                    // We can identify these by checking if they have a .clw or other source file extension
                    if (!file || !file.name) {
                        return false;
                    }
                    
                    const ext = path.extname(file.name).toLowerCase();
                    // Include only source code files with relevant extensions
                    return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                });
                
                logger.info(`📂 Filtered source files for project ${project.name}: ${sourceFiles.length} out of ${(project.sourceFiles || []).length} total files`);
                
                // Return only the filtered source files for the project
                const files = sourceFiles.map(file => {
                    if (!file) {
                        logger.warn(`⚠️ Found null or undefined source file in project ${project.name}`);
                        return {
                            name: "unknown",
                            relativePath: "",
                            project: {
                                name: project.name,
                                type: project.type,
                                path: project.path,
                                guid: project.guid,
                                filename: project.filename
                            }
                        };
                    }
                    // Log the file details for debugging
                    logger.info(`📂 Processing file: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                    
                    // Ensure name is never undefined
                    // First try to use the file name directly
                    // If that's undefined, try to extract it from relativePath
                    // If both are undefined, use a unique identifier to avoid duplicate files
                    const fileName = file.name ||
                        (file.relativePath ? path.basename(file.relativePath) : null) ||
                        `unknown-file-${Math.random().toString(36).substring(2, 10)}`;
                    
                    // Log the file name resolution for debugging
                    logger.info(`📂 File name resolution for project ${project.name}: name=${file.name}, relativePath=${file.relativePath}, resolved=${fileName}`);
                    
                    return {
                        name: fileName,
                        relativePath: file.relativePath || fileName,
                        project: {
                            name: project.name,
                            type: project.type,
                            path: project.path,
                            guid: project.guid,
                            filename: project.filename
                        }
                    };
                });
                
                logger.info(`📂 Returning ${files.length} files for project ${project.name}`);
                return { files };
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
        
        // Add a new handler for clearing the solution cache
        connection.onRequest('clarion/clearSolutionCache', (params: { solutionPath?: string }) => {
            try {
                // Set the solution operation flag to true
                (global as any).solutionOperationInProgress = true;
                
                if (params.solutionPath) {
                    logger.info(`🔄 Clearing cache for solution: ${params.solutionPath}`);
                    SolutionManager.clearCache(params.solutionPath);
                    return { success: true, message: `Cache cleared for ${params.solutionPath}` };
                } else {
                    logger.info(`🔄 Clearing all solution caches`);
                    SolutionManager.clearAllCaches();
                    return { success: true, message: 'All solution caches cleared' };
                }
            } finally {
                // Reset the solution operation flag when done
                (global as any).solutionOperationInProgress = false;
            }
        });
    }

    public getSolutionTree() {
        const startTime = performance.now();
        logger.info(`🕒 Starting getSolutionTree`);
        
        if (!this.solution) {
            logger.warn("⚠️ No solution object available to return");
            return {
                name: "No Solution",
                path: "",
                projects: [],
                applications: []
            };
        }
        
        if (!this.solution.projects) {
            logger.warn("⚠️ Solution exists but projects array is undefined");
            return {
                name: this.solution.name || "Invalid Solution",
                path: this.solutionFilePath || "",
                projects: [],
                applications: []
            };
        }
        
        if (!Array.isArray(this.solution.projects)) {
            logger.warn(`⚠️ Solution projects is not an array: ${typeof this.solution.projects}`);
            return {
                name: this.solution.name || "Invalid Solution",
                path: this.solutionFilePath || "",
                projects: [],
                applications: []
            };
        }
        
        try {
            logger.info(`📂 Building solution tree with ${this.solution.projects.length} projects`);
            
            // Validate each project before mapping
            const validProjects = this.solution.projects.filter(project => {
                if (!project) {
                    logger.warn("⚠️ Found null or undefined project in solution");
                    return false;
                }
                if (!project.sourceFiles) {
                    logger.warn(`⚠️ Project ${project.name || 'unnamed'} has no sourceFiles array`);
                    return true; // Still include it, but with empty sourceFiles
                }
                return true;
            });
            
            logger.info(`📂 Found ${validProjects.length} valid projects out of ${this.solution.projects.length} total`);
            
            // Create a lightweight solution tree with minimal information
            // This speeds up the initial tree rendering
            const result = {
                name: this.solution.name,
                path: this.solutionFilePath,
                projects: validProjects.map(project => {
                    // For the initial tree, only include basic project info and source file count
                    return {
                        name: project.name,
                        type: project.type,
                        path: project.path,
                        guid: project.guid,
                        filename: project.filename,
                        // Include counts but not full details for initial load
                        fileDriversCount: project.fileDrivers?.length || 0,
                        librariesCount: project.libraries?.length || 0,
                        projectReferencesCount: project.projectReferences?.length || 0,
                        noneFilesCount: project.noneFiles?.length || 0,
                        sourceFilesCount: project.sourceFiles?.length || 0,
                        // Include empty arrays for these collections - they'll be populated on demand
                        fileDrivers: [],
                        libraries: [],
                        projectReferences: [],
                        noneFiles: [],
                        sourceFiles: []
                    };
                }),
                applications: this.solution.applications || []
            };
            
            const endTime = performance.now();
            logger.info(`🕒 getSolutionTree completed in ${(endTime - startTime).toFixed(2)}ms`);
            logger.info(`📂 Returning solution tree with ${result.projects.length} projects and ${result.applications.length} applications`);
            
            return result;
        } catch (error) {
            logger.error(`Error creating solution tree: ${error instanceof Error ? error.message : String(error)}`);
            return {
                name: "Error",
                path: this.solutionFilePath || "",
                projects: [],
                applications: []
            };
        }
    }
    
    /**
     * Loads the solution from in-memory cache if available and valid
     * @returns True if the solution was loaded from cache, false otherwise
     */
    private async loadFromCache(): Promise<boolean> {
        try {
            // Check if we have a cache entry for this solution file
            if (!SolutionManager.inMemoryCache.has(this.solutionFilePath)) {
                logger.info(`📂 No in-memory cache found for: ${this.solutionFilePath}`);
                return false;
            }
            
            // Get the cached data
            const cache = SolutionManager.inMemoryCache.get(this.solutionFilePath)!;
            
            // Check cache version
            if (cache.version !== SolutionManager.CACHE_VERSION) {
                logger.info(`📂 Cache version mismatch (${cache.version} vs ${SolutionManager.CACHE_VERSION})`);
                return false;
            }
            
            // Check if cache is still valid
            try {
                const solutionStat = await fs.promises.stat(this.solutionFilePath);
                if (cache.timestamp < solutionStat.mtimeMs) {
                    logger.info(`📂 Cache is outdated (${new Date(cache.timestamp).toISOString()} vs ${new Date(solutionStat.mtimeMs).toISOString()})`);
                    return false;
                }
                
                // Check if any project files have changed
                for (const project of cache.solution.projects) {
                    const projectFile = path.join(project.path, `${project.name}.cwproj`);
                    try {
                        const projectStat = await fs.promises.stat(projectFile);
                        if (cache.timestamp < projectStat.mtimeMs) {
                            logger.info(`📂 Project file ${projectFile} has changed since cache was created`);
                            return false;
                        }
                    } catch {
                        logger.info(`📂 Project file ${projectFile} not found`);
                        return false;
                    }
                }
                
                // Cache is valid, use it
                logger.info(`✅ Using solution from in-memory cache`);
                this.solution = cache.solution;
                return true;
            } catch (error) {
                logger.error(`❌ Error checking file timestamps: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error loading from in-memory cache: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    
    /**
     * Saves the solution to in-memory cache
     */
    private async saveToCache(): Promise<void> {
        try {
            const cache = {
                version: SolutionManager.CACHE_VERSION,
                timestamp: Date.now(),
                solution: this.solution
            };
            
            // Store in the static in-memory cache
            SolutionManager.inMemoryCache.set(this.solutionFilePath, cache);
            logger.info(`✅ Saved solution to in-memory cache`);
        } catch (error) {
            logger.error(`❌ Error saving to in-memory cache: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Gets detailed information for a specific project
     * This implements lazy loading of project details
     */
    public getProjectDetails(projectGuid: string) {
        try {
            // Normalize the requested GUID by removing curly braces
            const normalizedRequestGuid = projectGuid.replace(/[{}]/g, '');
            logger.info(`📂 Normalized requested GUID for project details: ${normalizedRequestGuid}`);
            
            // First try exact match with normalized GUIDs
            const project = this.solution.projects.find(p =>
                p.guid.replace(/[{}]/g, '') === normalizedRequestGuid
            );
            
            if (!project) {
                logger.warn(`⚠️ Project with GUID ${projectGuid} not found`);
                
                // Try a case-insensitive search as a fallback
                const projectCaseInsensitive = this.solution.projects.find(p =>
                    p.guid.replace(/[{}]/g, '').toLowerCase() === normalizedRequestGuid.toLowerCase()
                );
                
                if (projectCaseInsensitive) {
                    logger.info(`✅ Found project with normalized case-insensitive GUID match: ${projectCaseInsensitive.name} (${projectCaseInsensitive.guid})`);
                    
                    // Return the project details for the case-insensitive match
                    return {
                        name: projectCaseInsensitive.name,
                        type: projectCaseInsensitive.type,
                        path: projectCaseInsensitive.path,
                        guid: projectCaseInsensitive.guid,
                        filename: projectCaseInsensitive.filename,
                        // Include the full project information
                        fileDrivers: projectCaseInsensitive.fileDrivers || [],
                        libraries: projectCaseInsensitive.libraries || [],
                        projectReferences: projectCaseInsensitive.projectReferences || [],
                        noneFiles: projectCaseInsensitive.noneFiles || [],
                        sourceFiles: (projectCaseInsensitive.sourceFiles || [])
                            // Filter to only include source code files
                            .filter(file => {
                                if (!file || !file.name) {
                                    return false;
                                }
                                const ext = path.extname(file.name).toLowerCase();
                                return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                            })
                            .map(file => {
                                if (!file) {
                                    logger.warn(`⚠️ Found null or undefined source file in project ${projectCaseInsensitive.name}`);
                                    return {
                                        name: "unknown",
                                        relativePath: "",
                                        project: {
                                            name: projectCaseInsensitive.name,
                                            type: projectCaseInsensitive.type,
                                            path: projectCaseInsensitive.path,
                                            guid: projectCaseInsensitive.guid,
                                            filename: projectCaseInsensitive.filename
                                        }
                                    };
                                }
                                // Log the file details for debugging
                                logger.info(`📂 Processing file for project details: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                                
                                // Ensure name is never undefined
                                const fileName = file.name || path.basename(file.relativePath || "unknown-file");
                                
                                return {
                                    name: fileName,
                                    relativePath: file.relativePath || fileName,
                                    project: {
                                        name: projectCaseInsensitive.name,
                                        type: projectCaseInsensitive.type,
                                        path: projectCaseInsensitive.path,
                                        guid: projectCaseInsensitive.guid,
                                        filename: projectCaseInsensitive.filename
                                    }
                                };
                            })
                    };
                }
                
                return null;
            }
            
            logger.info(`📂 Getting detailed information for project ${project.name}`);
            
            return {
                name: project.name,
                type: project.type,
                path: project.path,
                guid: project.guid,
                filename: project.filename,
                // Include the full project information
                fileDrivers: project.fileDrivers || [],
                libraries: project.libraries || [],
                projectReferences: project.projectReferences || [],
                noneFiles: project.noneFiles || [],
                sourceFiles: (project.sourceFiles || [])
                    // Filter to only include source code files
                    .filter(file => {
                        if (!file || !file.name) {
                            return false;
                        }
                        const ext = path.extname(file.name).toLowerCase();
                        return ['.clw', '.inc', '.txa', '.tpl', '.tpw', '.trn', '.clw', '.txa'].includes(ext);
                    })
                    .map(file => {
                        if (!file) {
                            logger.warn(`⚠️ Found null or undefined source file in project ${project.name}`);
                            return {
                                name: "unknown",
                                relativePath: "",
                                project: {
                                    name: project.name,
                                    type: project.type,
                                    path: project.path,
                                    guid: project.guid,
                                    filename: project.filename
                                }
                            };
                        }
                        // Log the file details for debugging
                        logger.info(`📂 Processing file: name=${file.name || 'undefined'}, relativePath=${file.relativePath || 'undefined'}`);
                        
                        // Ensure name is never undefined
                        const fileName = file.name || path.basename(file.relativePath || "unknown-file");
                        
                        return {
                            name: fileName,
                            relativePath: file.relativePath || fileName,
                            project: {
                                name: project.name,
                                type: project.type,
                                path: project.path,
                                guid: project.guid,
                                filename: project.filename
                            }
                        };
                    })
            };
        } catch (error) {
            logger.error(`Error getting project details: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
