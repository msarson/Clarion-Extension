import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("ClarionIdePreferences");
logger.setLevel("error");

export interface IdePreferences {
    startupProjectGuid?: string;   // e.g. "{641834BD-D565-472D-85FB-0D2A2450866E}"
    activeConfiguration?: string;  // e.g. "Debug"
    activePlatform?: string;       // e.g. "Win32"
}

/**
 * Computes the .NET 4.x 32-bit WIN32 string.GetHashCode() on the lowercased sln path.
 * Uses the WIN32 variant: hash1 = hash2 = (5381<<16)+5381, processes char-pairs as int32.
 * All arithmetic wraps at 32-bit signed integer boundaries (matching .NET behaviour).
 *
 * Test vector: "c:\development\ibsworking\ap1.sln" → "ecfee7f0"
 */
export function computeSlnHash(slnPath: string): string {
    const s = slnPath.toLowerCase();
    let hash1 = ((5381 << 16) + 5381) | 0;
    let hash2 = hash1;
    let len = s.length;
    let i = 0;
    while (len > 0) {
        const c0 = s.charCodeAt(i);
        const c1 = len > 1 ? s.charCodeAt(i + 1) : 0;
        const pint0 = (c0 | (c1 << 16)) | 0;
        hash1 = ((((hash1 << 5) + hash1) | 0) + (hash1 >> 27)) ^ pint0;
        hash1 = hash1 | 0;
        if (len <= 2) { break; }
        const c2 = s.charCodeAt(i + 2);
        const c3 = len > 3 ? s.charCodeAt(i + 3) : 0;
        const pint1 = (c2 | (c3 << 16)) | 0;
        hash2 = ((((hash2 << 5) + hash2) | 0) + (hash2 >> 27)) ^ pint1;
        hash2 = hash2 | 0;
        i += 4;
        len -= 4;
    }
    const result = (hash1 + Math.imul(hash2, 1566083941)) | 0;
    return (result >>> 0).toString(16);
}

/**
 * Returns the full path to the Clarion IDE preferences XML for the given solution.
 * The folder is derived from the propertiesFile path:
 *   e.g. C:\...\SoftVelocity\Clarion\10.0\ClarionProperties.xml
 *     →  C:\...\SoftVelocity\Clarion\10.0\preferences\MySln.sln.ecfee7f0.xml
 */
export function getPreferencesFilePath(slnPath: string, propertiesFile: string): string {
    const preferencesDir = path.join(path.dirname(propertiesFile), 'preferences');
    const slnBasename = path.basename(slnPath); // keep .sln extension: "MySln.sln.hash.xml"
    const hash = computeSlnHash(slnPath);
    return path.join(preferencesDir, `${slnBasename}.${hash}.xml`);
}

/**
 * Reads the Clarion IDE preferences XML for the given solution.
 * Returns null if the file does not exist or cannot be parsed.
 */
export async function readIdePreferences(slnPath: string, propertiesFile: string): Promise<IdePreferences | null> {
    const prefsPath = getPreferencesFilePath(slnPath, propertiesFile);
    if (!fs.existsSync(prefsPath)) {
        logger.info(`🔍 No IDE preferences file found at ${prefsPath}`);
        return null;
    }

    try {
        const content = fs.readFileSync(prefsPath, 'utf8');
        const prefs: IdePreferences = {};

        const startupMatch = /<StartupProject\s+value="([^"]+)"\s*\/>/i.exec(content);
        if (startupMatch) { prefs.startupProjectGuid = startupMatch[1]; }

        const configMatch = /<ActiveConfiguration\s+value="([^"]+)"\s*\/>/i.exec(content);
        if (configMatch) { prefs.activeConfiguration = configMatch[1]; }

        const platformMatch = /<ActivePlatform\s+value="([^"]+)"\s*\/>/i.exec(content);
        if (platformMatch) { prefs.activePlatform = platformMatch[1]; }

        logger.info(`✅ Read IDE prefs: startup=${prefs.startupProjectGuid}, config=${prefs.activeConfiguration}|${prefs.activePlatform}`);
        return prefs;
    } catch (err) {
        logger.warn(`⚠️ Failed to read IDE preferences at ${prefsPath}: ${err}`);
        return null;
    }
}

/**
 * Writes (or creates) the Clarion IDE preferences XML for the given solution.
 * Updates only the fields provided; preserves other content if the file already exists.
 */
export async function writeIdePreferences(slnPath: string, propertiesFile: string, prefs: IdePreferences): Promise<void> {
    const prefsPath = getPreferencesFilePath(slnPath, propertiesFile);
    const preferencesDir = path.dirname(prefsPath);

    try {
        if (!fs.existsSync(preferencesDir)) {
            fs.mkdirSync(preferencesDir, { recursive: true });
        }

        let content: string;

        if (fs.existsSync(prefsPath)) {
            content = fs.readFileSync(prefsPath, 'utf8');

            if (prefs.startupProjectGuid !== undefined) {
                content = replaceOrInsertProperty(content, 'StartupProject', prefs.startupProjectGuid);
            }
            if (prefs.activeConfiguration !== undefined) {
                content = replaceOrInsertProperty(content, 'ActiveConfiguration', prefs.activeConfiguration);
            }
            if (prefs.activePlatform !== undefined) {
                content = replaceOrInsertProperty(content, 'ActivePlatform', prefs.activePlatform);
            }
        } else {
            content = buildDefaultXml(prefs);
        }

        fs.writeFileSync(prefsPath, content, 'utf8');
        logger.info(`✅ Wrote IDE prefs to ${prefsPath}`);
    } catch (err) {
        logger.warn(`⚠️ Failed to write IDE preferences to ${prefsPath}: ${err}`);
    }
}

function replaceOrInsertProperty(xml: string, name: string, value: string): string {
    const pattern = new RegExp(`(<${name}\\s+value=")[^"]*("\\s*\\/>)`, 'i');
    if (pattern.test(xml)) {
        return xml.replace(pattern, `$1${value}$2`);
    }
    // Insert before closing </Properties>
    return xml.replace(/<\/Properties>/i, `  <${name} value="${value}" />\r\n</Properties>`);
}

function buildDefaultXml(prefs: IdePreferences): string {
    const startup = prefs.startupProjectGuid ? `  <StartupProject value="${prefs.startupProjectGuid}" />\r\n` : '';
    const config = prefs.activeConfiguration ? `  <ActiveConfiguration value="${prefs.activeConfiguration}" />\r\n` : '';
    const platform = prefs.activePlatform ? `  <ActivePlatform value="${prefs.activePlatform}" />\r\n` : '';
    return `<Properties>\r\n${startup}${config}${platform}</Properties>`;
}
