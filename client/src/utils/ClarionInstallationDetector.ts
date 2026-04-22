import * as fs from 'fs';
import * as path from 'path';
import { parseString } from 'xml2js';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("ClarionInstallationDetector", "info");

export interface ClarionInstallation {
    ideVersion: string; // e.g., "12.0", "11.0"
    propertiesPath: string; // Full path to ClarionProperties.xml
    compilerVersions: ClarionCompilerVersion[];
}

export interface ClarionCompilerVersion {
    name: string; // e.g., "Clarion 11.1.13855"
    path: string; // e.g., "C:\Clarion\Clarion11.1\bin"
    redirectionFile: string;
    macros: Record<string, string>;
    libsrc: string;
}

export class ClarionInstallationDetector {
    private static cachedInstallations: ClarionInstallation[] | null = null;

    /**
     * Detects all Clarion IDE installations by scanning the standard AppData directory
     */
    static async detectInstallations(): Promise<ClarionInstallation[]> {
        logger.info("🚀 detectInstallations() CALLED");
        
        // Return cached results if available
        if (this.cachedInstallations) {
            logger.info(`📦 Returning cached installations (${this.cachedInstallations.length} found)`);
            return this.cachedInstallations;
        }
        
        logger.info("🔍 Starting fresh Clarion installation detection...");

        const installations: ClarionInstallation[] = [];
        
        try {
            const appDataPath = process.env.APPDATA;
            if (!appDataPath) {
                logger.warn("⚠️ APPDATA environment variable not found");
                return installations;
            }

            const clarionBasePath = path.join(appDataPath, "SoftVelocity", "Clarion");
            
            if (!fs.existsSync(clarionBasePath)) {
                logger.warn(`⚠️ Clarion base path not found: ${clarionBasePath}`);
                return installations;
            }

            // Get all version directories (e.g., 10.0, 11.0, 11.1, 12.0)
            const versionDirs = fs.readdirSync(clarionBasePath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name)
                .sort((a, b) => {
                    // Sort in descending order (newest first)
                    const aNum = parseFloat(a);
                    const bNum = parseFloat(b);
                    return bNum - aNum;
                });

            logger.info(`🔍 Found Clarion IDE versions: ${versionDirs.join(', ')}`);

            for (const version of versionDirs) {
                const propertiesPath = path.join(clarionBasePath, version, "ClarionProperties.xml");
                
                if (!fs.existsSync(propertiesPath)) {
                    logger.warn(`⚠️ ClarionProperties.xml not found for version ${version}`);
                    continue;
                }
                
                logger.info(`✅ Found ClarionProperties.xml for version ${version}`);

                try {
                    const compilerVersions = await this.parseCompilerVersions(propertiesPath);
                    
                    logger.info(`✅ Parsed ${compilerVersions.length} compiler version(s) for ${version}: ${compilerVersions.join(', ')}`);
                    
                    if (compilerVersions.length > 0) {
                        installations.push({
                            ideVersion: version,
                            propertiesPath: propertiesPath,
                            compilerVersions: compilerVersions
                        });
                        
                        logger.info(`✅ Detected Clarion ${version} with ${compilerVersions.length} compiler(s)`);
                    } else {
                        logger.warn(`⚠️ No compilers found in ClarionProperties.xml for version ${version}`);
                    }
                } catch (error) {
                    logger.error(`❌ Error parsing ClarionProperties.xml for version ${version}:`, error);
                }
            }
            
            logger.info(`🎯 Total installations detected: ${installations.length}`);
            installations.forEach(inst => {
                logger.info(`   - Version ${inst.ideVersion}: ${inst.compilerVersions.join(', ')}`);
            });

            // Promote ideVersion if a higher sibling folder exists with no ClarionProperties.xml.
            // e.g. folder "11.1" exists but has no properties → the "11.0" installation is shown as "11.1".
            const foldersWithoutProperties = versionDirs.filter(v =>
                !fs.existsSync(path.join(clarionBasePath, v, "ClarionProperties.xml"))
            );

            for (const emptyFolder of foldersWithoutProperties) {
                const emptyMajor = Math.floor(parseFloat(emptyFolder));
                const emptyVal = parseFloat(emptyFolder);
                // Find an installation in the same major family with a lower version number
                const candidate = installations.find(inst => {
                    const instMajor = Math.floor(parseFloat(inst.ideVersion));
                    return instMajor === emptyMajor && parseFloat(inst.ideVersion) < emptyVal;
                });
                if (candidate) {
                    logger.info(`⬆️ Promoting Clarion ${candidate.ideVersion} → ${emptyFolder} (empty sibling folder)`);
                    candidate.ideVersion = emptyFolder;
                }
            }

            // Cache the results
            this.cachedInstallations = installations;
            
        } catch (error) {
            logger.error("❌ Error detecting Clarion installations:", error);
        }

        return installations;
    }

    /**
     * Parses ClarionProperties.xml to extract compiler version information
     */
    private static async parseCompilerVersions(propertiesPath: string): Promise<ClarionCompilerVersion[]> {
        const xmlContent = fs.readFileSync(propertiesPath, 'utf-8');
        const compilerVersions: ClarionCompilerVersion[] = [];

        return new Promise((resolve, reject) => {
            parseString(xmlContent, (err: Error | null, result: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    const propertiesArray = result?.ClarionProperties?.Properties;
                    if (!propertiesArray) {
                        resolve(compilerVersions);
                        return;
                    }

                    // Find the Clarion.Versions section
                    for (const properties of propertiesArray) {
                        if (properties.$.name === 'Clarion.Versions') {
                            for (const versionProperty of properties.Properties) {
                                const versionName = versionProperty.$.name;
                                
                                // Skip Clarion.NET versions for now
                                if (versionName.includes("Clarion.NET")) {
                                    continue;
                                }

                                const compilerVersion: ClarionCompilerVersion = {
                                    name: versionName,
                                    path: versionProperty.path?.[0]?.$.value || '',
                                    redirectionFile: this.extractRedirectionFile(versionProperty.Properties),
                                    macros: this.extractMacros(versionProperty.Properties),
                                    libsrc: versionProperty.libsrc?.[0]?.$.value || ''
                                };

                                compilerVersions.push(compilerVersion);
                            }
                            break;
                        }
                    }

                    resolve(compilerVersions);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    private static extractRedirectionFile(properties: any[]): string {
        if (!properties) return '';
        
        const redirectionFileProperty = properties.find((p: any) => p.$.name === 'RedirectionFile');
        return redirectionFileProperty?.Name?.[0]?.$.value || '';
    }

    private static extractMacros(properties: any[]): Record<string, string> {
        const macros: Record<string, string> = {};
        
        if (!properties) return macros;

        const redirectionFileProperty = properties.find((p: any) => p.$.name === 'RedirectionFile');
        if (!redirectionFileProperty?.Properties) return macros;

        const macrosProperty = redirectionFileProperty.Properties.find((p: any) => p.$.name === 'Macros');
        if (!macrosProperty) return macros;

        for (const prop in macrosProperty) {
            if (prop.toLowerCase() === "$") continue;
            
            if (Array.isArray(macrosProperty[prop]) && macrosProperty[prop].length > 0) {
                const firstItem = macrosProperty[prop][0];
                if (firstItem && typeof firstItem === "object" && "$" in firstItem && "value" in firstItem.$) {
                    macros[prop.toLowerCase()] = String(firstItem.$.value);
                }
            }
        }

        return macros;
    }

    /**
     * Clears the cached installations (useful for testing or forcing refresh)
     */
    static clearCache(): void {
        this.cachedInstallations = null;
    }

    /**
     * Gets the most recent Clarion installation (highest version number)
     */
    static async getMostRecentInstallation(): Promise<ClarionInstallation | null> {
        const installations = await this.detectInstallations();
        return installations.length > 0 ? installations[0] : null;
    }

    /**
     * Finds a specific installation by IDE version
     */
    static async getInstallationByVersion(ideVersion: string): Promise<ClarionInstallation | null> {
        const installations = await this.detectInstallations();
        return installations.find(i => i.ideVersion === ideVersion) || null;
    }

    /**
     * Parses a ClarionProperties.xml at an arbitrary path and returns a ClarionInstallation.
     * Used when the user browses for a properties file manually (e.g. /Configdir setups).
     */
    static async parseInstallationFromPropertiesPath(propertiesPath: string): Promise<ClarionInstallation | null> {
        try {
            const compilerVersions = await this.parseCompilerVersions(propertiesPath);
            if (compilerVersions.length === 0) return null;
            // Use the folder name containing the file as a best-effort ideVersion label
            const folderName = path.basename(path.dirname(propertiesPath));
            return {
                ideVersion: folderName,
                propertiesPath,
                compilerVersions
            };
        } catch (error) {
            logger.error(`❌ Error parsing user-selected ClarionProperties.xml: ${propertiesPath}`, error);
            return null;
        }
    }
}
