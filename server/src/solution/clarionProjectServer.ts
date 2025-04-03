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
    fileDrivers: string[] = [];
    libraries: string[] = [];
    projectReferences: { name: string, project: string }[] = [];
    noneFiles: string[] = [];
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

            if (!fs.existsSync(projectFile)) {
                logger.warn(`⚠️ Project file not found: ${projectFile}`);
                return;
            }

            try {
                const xmlContent = fs.readFileSync(projectFile, 'utf-8');
                const parsed = await xml2js.parseStringPromise(xmlContent);
                
                // Process all ItemGroups
                if (parsed?.Project?.ItemGroup) {
                    // Reset collections
                    this.sourceFiles = [];
                    this.fileDrivers = [];
                    this.libraries = [];
                    this.projectReferences = [];
                    this.noneFiles = [];
                    
                    // Process each ItemGroup
                    for (const group of parsed.Project.ItemGroup) {
                        // Process Compile items (source files)
                        if (group.Compile) {
                            for (const file of group.Compile) {
                                try {
                                    const fileName = file.$.Include;
                                    const resolvedPath = this.findFileInProjectPaths(fileName);
                                    if (resolvedPath) {
                                        const relativePath = path.relative(this.path, resolvedPath);
                                        this.sourceFiles.push(new ClarionSourcerFileServer(fileName, relativePath, this));
                                        logger.info(`✅ Added source file: ${fileName} (${relativePath})`);
                                    } else {
                                        logger.warn(`❌ Could not resolve file: ${fileName}`);
                                    }
                                } catch (fileError) {
                                    logger.error(`❌ Error processing file: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
                                }
                            }
                        }
                        
                        // Process FileDriver items
                        if (group.FileDriver) {
                            for (const driver of group.FileDriver) {
                                this.fileDrivers.push(driver.$.Include);
                            }
                            logger.info(`📂 Found ${this.fileDrivers.length} file drivers in project ${this.name}: ${this.fileDrivers.join(', ')}`);
                        }
                        
                        // Process Library items
                        if (group.Library) {
                            for (const lib of group.Library) {
                                this.libraries.push(lib.$.Include);
                            }
                            logger.info(`📂 Found ${this.libraries.length} libraries in project ${this.name}: ${this.libraries.join(', ')}`);
                        }
                        
                        // Process ProjectReference items
                        if (group.ProjectReference) {
                            for (const ref of group.ProjectReference) {
                                const projectGuid = ref.$.Project;
                                const projectName = ref.$.Name || path.basename(ref.$.Include, '.cwproj');
                                this.projectReferences.push({
                                    name: projectName,
                                    project: projectGuid
                                });
                            }
                            logger.info(`📂 Found ${this.projectReferences.length} project references in project ${this.name}: ${this.projectReferences.map(r => r.name).join(', ')}`);
                        }
                        
                        // Process None items (other files)
                        if (group.None) {
                            for (const none of group.None) {
                                this.noneFiles.push(none.$.Include);
                            }
                            logger.info(`📂 Found ${this.noneFiles.length} other files in project ${this.name}: ${this.noneFiles.join(', ')}`);
                        }
                    }
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
        
        // ✅ Ensure the project path is included
        paths.push(this.path);

        const uniquePaths = Array.from(new Set(paths));

        logger.info(`✅ Resolved search paths for ${normalizedExt}: (${uniquePaths.length})`);
        uniquePaths.forEach((p, i) => logger.info(`   ${i + 1}. ${p}`));

        // Cache the result
        this.searchPathsCache.set(cacheKey, uniquePaths);
        logger.info(`✅ Cached search paths for ${normalizedExt} in project ${this.name}`);

        return uniquePaths;
    }



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

    /**
     * Gets the redirection parser for this project
     * @returns A RedirectionFileParserServer instance
     */
    public getRedirectionParser(): RedirectionFileParserServer {
        const redParser = new RedirectionFileParserServer();
        redParser.parseRedFile(this.path);
        return redParser;
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
