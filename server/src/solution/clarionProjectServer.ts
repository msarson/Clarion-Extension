import * as path from 'path';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import LoggerManager from '../logger';
import { RedirectionEntry, RedirectionFileParserServer } from './redirectionFileParserServer';
import { serverSettings } from '../serverSettings';
import { ClarionSourcerFileServer } from './clarionSourceFileServer';
import { TextDocument } from 'vscode-languageserver-textdocument';


const logger = LoggerManager.getLogger("ClarionProjectServer");
logger.setLevel("error");// Production: Only log errors

export class ClarionProjectServer {
    sourceFiles: ClarionSourcerFileServer[] = [];
    fileDrivers: string[] = [];
    libraries: string[] = [];
    projectReferences: { name: string, project: string }[] = [];
    noneFiles: string[] = [];
    redirectionEntries: RedirectionEntry[] = [];
    private searchPathsCache: Map<string, string[]> = new Map();
    private redirectionParser: RedirectionFileParserServer | null = null;

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
        logger.info(`🔄 Loading source files for project: ${this.name} (${this.path})`);
        
        // Reset collections before loading
        this.sourceFiles = [];
        this.fileDrivers = [];
        this.libraries = [];
        this.projectReferences = [];
        this.noneFiles = [];
        
        try {
            const projectFile = path.join(this.path, `${this.name}.cwproj`);
            logger.info(`📂 Project file path: ${projectFile}`);

            // Use async file existence check
            try {
                await fs.promises.access(projectFile, fs.constants.F_OK);
            } catch {
                logger.warn(`⚠️ Project file not found: ${projectFile}`);
                return;
            }

            try {
                // Use async file reading
                const xmlContent = await fs.promises.readFile(projectFile, 'utf-8');
                
                // Use a more efficient XML parsing approach
                const parser = new xml2js.Parser({
                    explicitArray: false, // Don't create arrays for single elements
                    mergeAttrs: true,     // Merge attributes into the object
                    normalizeTags: true,  // Normalize tag names to lowercase
                    trim: true            // Trim whitespace
                });
                
                const parsed = await parser.parseStringPromise(xmlContent);
                
                // Process all ItemGroups
                if (parsed?.project?.itemgroup) {
                    // Convert to array if it's not already (happens when there's only one itemgroup)
                    const itemGroups = Array.isArray(parsed.project.itemgroup)
                        ? parsed.project.itemgroup
                        : [parsed.project.itemgroup];
                    
                    // Create arrays to collect items from all groups
                    const compileItems = [];
                    const fileDriverItems = [];
                    const libraryItems = [];
                    const projectReferenceItems = [];
                    const noneItems = [];
                    
                    // Process each ItemGroup
                    for (const group of itemGroups) {
                        // Process Compile items (source files)
                        if (group.compile) {
                            const compiles = Array.isArray(group.compile) ? group.compile : [group.compile];
                            compileItems.push(...compiles);
                        }
                        
                        // Process FileDriver items
                        if (group.filedriver) {
                            const drivers = Array.isArray(group.filedriver) ? group.filedriver : [group.filedriver];
                            fileDriverItems.push(...drivers);
                        }
                        
                        // Process Library items
                        if (group.library) {
                            const libs = Array.isArray(group.library) ? group.library : [group.library];
                            libraryItems.push(...libs);
                        }
                        
                        // Process ProjectReference items
                        if (group.projectreference) {
                            const refs = Array.isArray(group.projectreference) ? group.projectreference : [group.projectreference];
                            projectReferenceItems.push(...refs);
                        }
                        
                        // Process None items (other files)
                        if (group.none) {
                            const nones = Array.isArray(group.none) ? group.none : [group.none];
                            noneItems.push(...nones);
                        }
                    }
                    
                    // Process file drivers (faster to process these simpler items first)
                    for (const driver of fileDriverItems) {
                        // Handle different possible formats
                        let driverPath = null;
                        if (typeof driver === 'string') {
                            driverPath = driver;
                        } else if (driver && typeof driver === 'object' && driver.include) {
                            driverPath = driver.include;
                        }
                        
                        if (driverPath) {
                            this.fileDrivers.push(driverPath);
                        }
                    }
                    logger.info(`📂 Found ${this.fileDrivers.length} file drivers in project ${this.name}`);
                    
                    // Process libraries
                    for (const lib of libraryItems) {
                        // Handle different possible formats
                        let libPath = null;
                        if (typeof lib === 'string') {
                            libPath = lib;
                        } else if (lib && typeof lib === 'object' && lib.include) {
                            libPath = lib.include;
                        }
                        
                        if (libPath) {
                            this.libraries.push(libPath);
                        }
                    }
                    logger.info(`📂 Found ${this.libraries.length} libraries in project ${this.name}`);
                    
                    // Process project references
                    for (const ref of projectReferenceItems) {
                        let projectGuid = null;
                        let projectName = null;
                        let includePath = null;
                        
                        if (typeof ref === 'object') {
                            projectGuid = ref.project;
                            projectName = ref.name;
                            includePath = ref.include;
                        }
                        
                        if (projectGuid && (projectName || includePath)) {
                            this.projectReferences.push({
                                name: projectName || (includePath ? path.basename(includePath, '.cwproj') : "Unknown"),
                                project: projectGuid
                            });
                        }
                    }
                    logger.info(`📂 Found ${this.projectReferences.length} project references in project ${this.name}`);
                    
                    // Process none files
                    for (const none of noneItems) {
                        // Handle different possible formats
                        let nonePath = null;
                        if (typeof none === 'string') {
                            nonePath = none;
                        } else if (none && typeof none === 'object' && none.include) {
                            nonePath = none.include;
                        }
                        
                        if (nonePath) {
                            this.noneFiles.push(nonePath);
                        }
                    }
                    logger.info(`📂 Found ${this.noneFiles.length} other files in project ${this.name}`);
                    
                    // Log the types of files found in the project
                    logger.info(`📂 Project ${this.name} contains:
                        - ${compileItems.length} Compile items (source files)
                        - ${fileDriverItems.length} FileDriver items
                        - ${libraryItems.length} Library items
                        - ${projectReferenceItems.length} ProjectReference items
                        - ${noneItems.length} None items
                    `);
                    
                    // Process source files (most expensive operation, do it last)
                    // Create an array of promises for resolving file paths in parallel
                    // We only process Compile items as source files
                    const filePromises = compileItems.map(async (file, index) => {
                        try {
                            // Log the raw file object to understand its structure
                            logger.info(`📂 Raw file object: ${JSON.stringify(file)}`);
                            
                            // For XML like: <Compile Include="CLASTR.clw" />
                            // With the current parser options, it should be parsed as:
                            // { include: "CLASTR.clw" }
                            
                            // Start with a null fileName and only use fallback if we can't extract it
                            let fileName = null;
                            
                            if (file) {
                                if (typeof file === 'string') {
                                    // If file is directly a string
                                    fileName = file;
                                    logger.info(`📄 File name extracted (string): ${fileName}`);
                                } else if (typeof file === 'object') {
                                    // Try multiple possible formats based on how xml2js might parse it
                                    if (file.include) {
                                        fileName = file.include;
                                        logger.info(`📄 File name extracted (include): ${fileName}`);
                                    } else if (file.$ && file.$.include) {
                                        fileName = file.$.include;
                                        logger.info(`📄 File name extracted ($.include): ${fileName}`);
                                    } else if (file.Include) {
                                        fileName = file.Include;
                                        logger.info(`📄 File name extracted (Include): ${fileName}`);
                                    } else {
                                        // Log all keys to help diagnose the structure
                                        logger.info(`🔍 Available keys in file object: ${Object.keys(file).join(', ')}`);
                                        
                                        // If it's an object but we can't find the include attribute,
                                        // try to find any property that might contain the file name
                                        for (const key of Object.keys(file)) {
                                            if (typeof file[key] === 'string' &&
                                                (key.toLowerCase().includes('include') ||
                                                 file[key].toLowerCase().endsWith('.clw') ||
                                                 file[key].toLowerCase().endsWith('.inc'))) {
                                                fileName = file[key];
                                                logger.info(`📄 File name extracted (key: ${key}): ${fileName}`);
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Only use fallback if we couldn't extract a file name
                            if (!fileName) {
                                fileName = `unknown-file-${index}-${Math.random().toString(36).substring(2, 10)}`;
                                logger.warn(`⚠️ Using fallback file name: ${fileName}`);
                            }
                            
                            logger.info(`📂 Processing file from project: ${fileName}`);
                            
                            // Use the async version of findFileInProjectPaths
                            const resolvedPath = await this.findFileInProjectPathsAsync(fileName);
                            if (resolvedPath) {
                                const relativePath = path.relative(this.path, resolvedPath);
                                logger.info(`✅ Resolved path for ${fileName}: ${relativePath}`);
                                return new ClarionSourcerFileServer(fileName, relativePath, this);
                            } else {
                                logger.warn(`❌ Could not resolve file: ${fileName}, but will still include it in the project`);
                                // Still include the file even if we can't resolve its path
                                // Use the fileName as both the name and relativePath
                                logger.info(`📂 Including file with original name: ${fileName}`);
                                return new ClarionSourcerFileServer(fileName, fileName, this);
                            }
                        } catch (fileError) {
                            logger.error(`❌ Error processing file: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
                            // Still include the file even if there was an error
                            // Try to extract the file name even in error cases
                            let fileName = null;
                            
                            if (file) {
                                if (typeof file === 'string') {
                                    fileName = file;
                                } else if (typeof file === 'object') {
                                    // Try multiple possible formats
                                    if (file.include) {
                                        fileName = file.include;
                                    } else if (file.$ && file.$.include) {
                                        fileName = file.$.include;
                                    } else if (file.Include) {
                                        fileName = file.Include;
                                    }
                                }
                            }
                            
                            // Use fallback only if we couldn't extract a name
                            if (!fileName) {
                                fileName = `unknown-file-error-${Math.random().toString(36).substring(2, 10)}`;
                                logger.warn(`⚠️ Using error fallback file name: ${fileName}`);
                            }
                            
                            logger.info(`⚠️ Including file ${fileName} despite error`);
                            return new ClarionSourcerFileServer(fileName, fileName, this);
                        }
                    });
                    
                    // Wait for all file resolutions to complete
                    const resolvedFiles = await Promise.all(filePromises);
                    
                    // No need to filter out null values since we always return a ClarionSourcerFileServer
                    this.sourceFiles = resolvedFiles as ClarionSourcerFileServer[];
                    
                    // Log the file extensions to help with debugging
                    const extensions = new Map<string, number>();
                    for (const file of this.sourceFiles) {
                        if (file.name) {
                            const ext = path.extname(file.name).toLowerCase();
                            extensions.set(ext, (extensions.get(ext) || 0) + 1);
                        }
                    }
                    
                    // Log the extension counts
                    let extensionLog = "File extensions in source files:";
                    extensions.forEach((count, ext) => {
                        extensionLog += `\n  - ${ext}: ${count} files`;
                    });
                    logger.info(extensionLog);
                    
                    logger.info(`✅ Resolved ${this.sourceFiles.length} source files for project ${this.name}`);
                }
                
                // Log summary of what was found
                logger.info(`📊 Project ${this.name} summary:`);
                logger.info(`  - Source Files: ${this.sourceFiles.length}`);
                logger.info(`  - File Drivers: ${this.fileDrivers.length}`);
                logger.info(`  - Libraries: ${this.libraries.length}`);
                logger.info(`  - Project References: ${this.projectReferences.length}`);
                logger.info(`  - None Files: ${this.noneFiles.length}`);
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

        // Use a singleton instance of RedirectionFileParserServer for better performance
        const redParser = this.getRedirectionParser();

        // Include both Common and configuration-specific entries
        const matchingEntries = this.redirectionEntries.filter(entry =>
            entry.section === "Common" || entry.section === serverSettings.configuration
        );

        logger.info(`📂 Found ${matchingEntries.length} matching entries for section Common or ${serverSettings.configuration}`);

        // Filter entries by extension and resolve paths
        // Use a Set to avoid duplicates from the beginning
        const pathSet = new Set<string>();
        
        // Add the project path first (always included)
        pathSet.add(this.path);
        // Note: Parent directory NOT automatically included - only paths from redirection file
        
        // Process matching entries
        for (const entry of matchingEntries) {
            if (entry.extension.toLowerCase() === normalizedExt || entry.extension === "*.*") {
                logger.info(`📂 Processing entry: ${entry.extension} from section ${entry.section}`);
                
                for (const p of entry.paths) {
                    const resolvedPath = path.isAbsolute(p) ? p : path.resolve(this.path, p);
                    
                    // Debug logging for dot paths
                    if (p === '.' || p === '.\\' || p === './') {
                        logger.info(`🔍 Resolving '${p}' for project ${this.name}: ${this.path} → ${resolvedPath}`);
                    }
                    
                    pathSet.add(resolvedPath);
                }
            }
        }

        const uniquePaths = Array.from(pathSet);

        // Only log detailed path info at debug level to reduce noise
        logger.info(`✅ Resolved ${uniquePaths.length} search paths for ${normalizedExt}`);

        // Cache the result
        this.searchPathsCache.set(cacheKey, uniquePaths);

        return uniquePaths;
    }



    // Keep the synchronous version for backward compatibility
    private findFileInProjectPaths(fileName: string): string | null {
        // First try using the redirection parser directly
        const redParser = this.getRedirectionParser();
        const redResult = redParser.findFile(fileName);
        if (redResult && redResult.path) {
            logger.info(`✅ Found file through redirection: ${redResult.path} (source: ${redResult.source})`);
            return redResult.path;
        }
        
        // Fallback to search paths
        const ext = path.extname(fileName).toLowerCase();
        const searchPaths = this.getSearchPaths(ext);

        for (const spath of searchPaths) {
            const full = path.normalize(path.join(spath, fileName));
            if (fs.existsSync(full)) {
                return full;
            }
        }

        // If no extension is provided, try with default lookup extensions
        if (!ext) {
            for (const defaultExt of serverSettings.defaultLookupExtensions) {
                const fileNameWithExt = `${fileName}${defaultExt}`;
                
                // Try with redirection parser first
                const redResultWithExt = redParser.findFile(fileNameWithExt);
                if (redResultWithExt && redResultWithExt.path) {
                    logger.info(`✅ Found file with added extension through redirection: ${redResultWithExt.path} (source: ${redResultWithExt.source})`);
                    return redResultWithExt.path;
                }
                
                // Then try search paths
                for (const spath of searchPaths) {
                    const full = path.normalize(path.join(spath, fileNameWithExt));
                    if (fs.existsSync(full)) {
                        logger.info(`✅ Found file with added extension in search path: ${full}`);
                        return full;
                    }
                }
            }
        }

        return null;
    }
    
    // Add an asynchronous version for better performance
    private async findFileInProjectPathsAsync(fileName: string): Promise<string | null> {
        // Helper for async existence check
        const fileExists = async (filePath: string) => {
            try {
                await fs.promises.access(filePath, fs.constants.F_OK);
                return true;
            } catch {
                return false;
            }
        };
        
        // First try using the redirection parser directly
        const redParser = this.getRedirectionParser();
        const redResult = redParser.findFile(fileName);
        if (redResult && redResult.path) {
            // Verify the file exists
            if (await fileExists(redResult.path)) {
                logger.info(`✅ Found file through redirection: ${redResult.path} (source: ${redResult.source})`);
                return redResult.path;
            }
        }
        
        // Fallback to search paths
        const ext = path.extname(fileName).toLowerCase();
        const searchPaths = this.getSearchPaths(ext);

        // Create an array of promises to check all paths in parallel
        const pathPromises = searchPaths.map(async (spath) => {
            const full = path.normalize(path.join(spath, fileName));
            if (await fileExists(full)) {
                return full;
            }
            return null;
        });
        
        // Wait for all path checks to complete
        const results = await Promise.all(pathPromises);
        const foundPath = results.find(p => p !== null);
        if (foundPath) {
            return foundPath;
        }

        // If no extension is provided, try with default lookup extensions
        if (!ext) {
            // Create an array of promises for each extension
            const extPromises = serverSettings.defaultLookupExtensions.map(async (defaultExt) => {
                const fileNameWithExt = `${fileName}${defaultExt}`;
                
                // Try with redirection parser first
                const redResultWithExt = redParser.findFile(fileNameWithExt);
                if (redResultWithExt && redResultWithExt.path) {
                    if (await fileExists(redResultWithExt.path)) {
                        logger.info(`✅ Found file with added extension through redirection: ${redResultWithExt.path} (source: ${redResultWithExt.source})`);
                        return redResultWithExt.path;
                    }
                }
                
                // Create promises for each search path with this extension
                const extPathPromises = searchPaths.map(async (spath) => {
                    const full = path.normalize(path.join(spath, fileNameWithExt));
                    if (await fileExists(full)) {
                        logger.info(`✅ Found file with added extension in search path: ${full}`);
                        return full;
                    }
                    return null;
                });
                
                // Wait for all path checks for this extension to complete
                const extResults = await Promise.all(extPathPromises);
                return extResults.find(p => p !== null) || null;
            });
            
            // Wait for all extension checks to complete
            const extResults = await Promise.all(extPromises);
            const foundExtPath = extResults.find(p => p !== null);
            if (foundExtPath) {
                return foundExtPath;
            }
        }

        return null;
    }

    /**
     * Gets the redirection parser for this project
     * @returns A RedirectionFileParserServer instance (singleton per project)
     */
    public getRedirectionParser(): RedirectionFileParserServer {
        // Use the cached instance if available
        if (this.redirectionParser) {
            logger.info(`✅ Using cached RedirectionFileParserServer instance for project: ${this.name}`);
            return this.redirectionParser;
        }

        // Create a new instance if not available
        logger.info(`🔄 Creating new RedirectionFileParserServer instance for project: ${this.name}`);
        this.redirectionParser = new RedirectionFileParserServer();
        this.redirectionEntries = this.redirectionParser.parseRedFile(this.path);
        return this.redirectionParser;
    }

    /**
     * Adds a new source file to the project
     * @param fileName The name of the source file to add (e.g., "someclwfile.clw")
     * @returns True if the file was added successfully, false otherwise
     */
    public async addSourceFile(fileName: string): Promise<boolean> {
        logger.info(`🔄 Adding source file ${fileName} to project ${this.name}`);
        
        try {
            const projectFile = path.join(this.path, `${this.name}.cwproj`);
            logger.info(`📂 Project file path: ${projectFile}`);

            if (!fs.existsSync(projectFile)) {
                logger.warn(`⚠️ Project file not found: ${projectFile}`);
                return false;
            }

            // Read the project file
            const xmlContent = fs.readFileSync(projectFile, 'utf-8');
            const parsed = await xml2js.parseStringPromise(xmlContent);
            
            // Check if the file already exists in the project
            let fileExists = false;
            if (parsed?.Project?.ItemGroup) {
                for (const group of parsed.Project.ItemGroup) {
                    if (group.Compile) {
                        for (const file of group.Compile) {
                            if (file.$.Include.toLowerCase() === fileName.toLowerCase()) {
                                fileExists = true;
                                logger.warn(`⚠️ File ${fileName} already exists in project ${this.name}`);
                                break;
                            }
                        }
                    }
                    if (fileExists) break;
                }
            }

            if (fileExists) {
                return false;
            }

            // Find an ItemGroup with Compile items or create a new one
            let compileItemGroup = null;
            if (parsed?.Project?.ItemGroup) {
                for (const group of parsed.Project.ItemGroup) {
                    if (group.Compile) {
                        compileItemGroup = group;
                        break;
                    }
                }
            }

            if (!compileItemGroup) {
                // Create a new ItemGroup for Compile items
                if (!parsed.Project.ItemGroup) {
                    parsed.Project.ItemGroup = [];
                }
                compileItemGroup = { Compile: [] };
                parsed.Project.ItemGroup.push(compileItemGroup);
            }

            // Add the new file to the ItemGroup
            compileItemGroup.Compile.push({
                $: { Include: fileName },
                Generated: ['true']
            });

            // Write the updated project file
            try {
                const builder = new xml2js.Builder();
                const updatedXml = builder.buildObject(parsed);
                fs.writeFileSync(projectFile, updatedXml);
            } catch (writeError) {
                logger.error(`❌ Error writing project file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
                return false;
            }

            // Determine where to create the file on disk
            let fileCreated = false;
            
            // Create a proper template for the new .clw file
            let template = '';
            
            // Find the first .clw file in the project to reference in the MEMBER statement
            try {
                const projectFile = path.join(this.path, `${this.name}.cwproj`);
                const xmlContent = fs.readFileSync(projectFile, 'utf-8');
                const projectData = await xml2js.parseStringPromise(xmlContent);
                
                let firstClwFile = '';
                
                // Search for the first .clw file in the project
                if (projectData?.Project?.ItemGroup) {
                    for (const group of projectData.Project.ItemGroup) {
                        if (group.Compile) {
                            for (const file of group.Compile) {
                                const includeFile = file.$.Include;
                                if (includeFile.toLowerCase().endsWith('.clw') &&
                                    includeFile.toLowerCase() !== fileName.toLowerCase()) {
                                    firstClwFile = includeFile;
                                    break;
                                }
                            }
                        }
                        if (firstClwFile) break;
                    }
                }
                
                if (firstClwFile) {
                    logger.info(`✅ Found first CLW file in project: ${firstClwFile}`);
                    template = `  MEMBER('${firstClwFile}')\n\n`;
                } else {
                    // If this is the first .clw file in the project, use PROGRAM template
                    logger.info(`⚠️ No existing CLW files found in project, using PROGRAM template`);
                    template = `  PROGRAM\n\n  MAP\n  END\n\n  CODE\n  RETURN\n`;
                }
            } catch (templateError) {
                logger.error(`❌ Error creating template: ${templateError instanceof Error ? templateError.message : String(templateError)}`);
                // Fallback to basic template
                template = `  PROGRAM\n\n  MAP\n  END\n\n  CODE\n  RETURN\n`;
            }
            let filePath = '';
            
            // Get the file extension
            const ext = path.extname(fileName).toLowerCase();
            
            // Get the redirection entries for this project
            const redParser = this.getRedirectionParser();
            const redirectionEntries = redParser.parseRedFile(this.path);
            
            // Find specific entries for .clw files in the current configuration or Common section
            const clwEntries = redirectionEntries.filter(entry =>
                (entry.section === "Common" || entry.section === serverSettings.configuration) &&
                (entry.extension.toLowerCase() === "*.clw" || entry.extension === "*.*")
            );
            
            logger.info(`🔍 Found ${clwEntries.length} redirection entries for .clw files`);
            
            // If we have specific entries for .clw files, use the first one
            if (clwEntries.length > 0) {
                // Sort entries to prioritize specific *.clw over general *.*
                clwEntries.sort((a, b) => {
                    if (a.extension.toLowerCase() === "*.clw" && b.extension !== "*.clw") return -1;
                    if (b.extension.toLowerCase() === "*.clw" && a.extension !== "*.clw") return 1;
                    return 0;
                });
                
                // Try each path from the first matching entry
                const firstEntry = clwEntries[0];
                logger.info(`🔍 Using redirection entry: ${firstEntry.extension} from section [${firstEntry.section}]`);
                
                for (const entryPath of firstEntry.paths) {
                    try {
                        // Resolve the path relative to the project directory if it's not absolute
                        const resolvedPath = path.isAbsolute(entryPath)
                            ? entryPath
                            : path.resolve(this.path, entryPath);
                            
                        filePath = path.join(resolvedPath, fileName);
                        const dirPath = path.dirname(filePath);
                        
                        logger.info(`🔍 Trying to create file at: ${filePath}`);
                        
                        // Create directory if it doesn't exist
                        if (!fs.existsSync(dirPath)) {
                            fs.mkdirSync(dirPath, { recursive: true });
                            logger.info(`✅ Created directory: ${dirPath}`);
                        }
                        
                        // Create the file with the template if it doesn't exist
                        if (!fs.existsSync(filePath)) {
                            fs.writeFileSync(filePath, template, 'utf-8');
                            logger.info(`✅ Created new CLW file on disk: ${filePath}`);
                            fileCreated = true;
                            break;
                        } else {
                            logger.info(`⚠️ File already exists on disk: ${filePath}`);
                            fileCreated = true;
                            break;
                        }
                    } catch (fileError) {
                        logger.error(`❌ Error creating file at ${filePath}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
                        // Continue to try the next path
                    }
                }
            } else {
                logger.info(`⚠️ No specific redirection entries found for .clw files, falling back to project directory`);
            }
            
            // If no valid path was found from redirection entries, create the file in the project directory
            if (!fileCreated) {
                try {
                    filePath = path.join(this.path, fileName);
                    logger.info(`🔍 Creating file in project directory: ${filePath}`);
                    
                    fs.writeFileSync(filePath, template, 'utf-8');
                    logger.info(`✅ Created new CLW file in project directory: ${filePath}`);
                    fileCreated = true;
                } catch (fileError) {
                    logger.error(`❌ Error creating file in project directory: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
                }
            }

            // Add the file to the sourceFiles collection
            if (fileCreated) {
                const relativePath = path.relative(this.path, filePath);
                this.sourceFiles.push(new ClarionSourcerFileServer(fileName, relativePath, this));
                logger.info(`✅ Added source file: ${fileName} (${relativePath})`);
            } else {
                // Even if we couldn't create the file, still add it to the collection
                this.sourceFiles.push(new ClarionSourcerFileServer(fileName, fileName, this));
                logger.info(`✅ Added source file: ${fileName} (path not resolved)`);
            }

            logger.info(`✅ Successfully added source file ${fileName} to project ${this.name}`);
            return true;
        } catch (error) {
            logger.error(`❌ Error adding source file ${fileName} to project ${this.name}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Removes a source file from the project
     * @param fileName The name of the source file to remove (e.g., "someclwfile.clw")
     * @returns True if the file was removed successfully, false otherwise
     */
    public async removeSourceFile(fileName: string): Promise<boolean> {
        logger.info(`🔄 Removing source file ${fileName} from project ${this.name}`);
        
        try {
            const projectFile = path.join(this.path, `${this.name}.cwproj`);
            logger.info(`📂 Project file path: ${projectFile}`);

            if (!fs.existsSync(projectFile)) {
                logger.warn(`⚠️ Project file not found: ${projectFile}`);
                return false;
            }

            // Read the project file
            const xmlContent = fs.readFileSync(projectFile, 'utf-8');
            const parsed = await xml2js.parseStringPromise(xmlContent);
            
            // Check if the file exists in the project
            let fileExists = false;
            let fileRemoved = false;
            
            if (parsed?.Project?.ItemGroup) {
                for (const group of parsed.Project.ItemGroup) {
                    if (group.Compile) {
                        // Find the index of the file to remove
                        const fileIndex = group.Compile.findIndex(
                            (file: any) => file.$.Include.toLowerCase() === fileName.toLowerCase()
                        );
                        
                        if (fileIndex !== -1) {
                            fileExists = true;
                            // Remove the file from the Compile items
                            group.Compile.splice(fileIndex, 1);
                            fileRemoved = true;
                            logger.info(`✅ Removed file ${fileName} from project file`);
                        }
                    }
                }
            }

            if (!fileExists) {
                logger.warn(`⚠️ File ${fileName} not found in project ${this.name}`);
                return false;
            }

            if (fileRemoved) {
                // Write the updated project file
                try {
                    const builder = new xml2js.Builder();
                    const updatedXml = builder.buildObject(parsed);
                    fs.writeFileSync(projectFile, updatedXml);
                } catch (writeError) {
                    logger.error(`❌ Error writing project file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
                    return false;
                }

                // Remove the file from the sourceFiles collection
                const fileIndex = this.sourceFiles.findIndex(
                    file => file.name.toLowerCase() === fileName.toLowerCase()
                );
                
                if (fileIndex !== -1) {
                    this.sourceFiles.splice(fileIndex, 1);
                    logger.info(`✅ Removed source file: ${fileName} from memory`);
                }

                logger.info(`✅ Successfully removed source file ${fileName} from project ${this.name}`);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`❌ Error removing source file ${fileName} from project ${this.name}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
}
