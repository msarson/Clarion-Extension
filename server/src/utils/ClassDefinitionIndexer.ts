import * as path from 'path';
import LoggerManager from '../logger';
import {
    StructureDeclarationIndexer,
    StructureDeclarationInfo,
    StructureIndex,
} from './StructureDeclarationIndexer';

const logger = LoggerManager.getLogger('ClassDefinitionIndexer');
logger.setLevel('error');

/**
 * Represents a single class/queue/group definition found in a file
 * @deprecated Use StructureDeclarationInfo from StructureDeclarationIndexer instead.
 */
export interface ClassDefinitionInfo {
    className: string;
    filePath: string;
    /** 1-based line number (legacy contract) */
    lineNumber: number;
    isType: boolean;
    parentClass?: string;
    lineContent: string;
    structureType: 'CLASS' | 'QUEUE' | 'GROUP';
}

/**
 * Represents the complete index of class definitions for a project
 * @deprecated Use StructureIndex from StructureDeclarationIndexer instead.
 */
export interface ClassIndex {
    classes: Map<string, ClassDefinitionInfo[]>;
    lastIndexed: number;
    projectPath: string;
}

/** Convert 0-based StructureDeclarationInfo to 1-based ClassDefinitionInfo */
function toClassDefInfo(d: StructureDeclarationInfo): ClassDefinitionInfo {
    return {
        className: d.name,
        filePath: d.filePath,
        lineNumber: d.line + 1,
        isType: d.isType,
        parentClass: d.parentName,
        lineContent: d.lineContent,
        structureType: d.structureType as 'CLASS' | 'QUEUE' | 'GROUP',
    };
}

const LEGACY_TYPES = new Set(['CLASS', 'QUEUE', 'GROUP']);

/** Convert a StructureIndex to a legacy ClassIndex (CLASS/QUEUE/GROUP only) */
function toClassIndex(si: StructureIndex): ClassIndex {
    const classes = new Map<string, ClassDefinitionInfo[]>();
    for (const [key, decls] of si.byName) {
        const filtered = decls
            .filter(d => LEGACY_TYPES.has(d.structureType))
            .map(toClassDefInfo);
        if (filtered.length) classes.set(key, filtered);
    }
    return { classes, lastIndexed: si.lastIndexed, projectPath: si.projectPath };
}

/**
 * @deprecated Shim over StructureDeclarationIndexer. Migrate callers to StructureDeclarationIndexer directly.
 *
 * Indexes class definitions from .inc files found via redirection paths.
 * Delegates all real work to StructureDeclarationIndexer; only CLASS/QUEUE/GROUP
 * entries are surfaced through this API to preserve the existing contract.
 */
export class ClassDefinitionIndexer {
    private static instance: ClassDefinitionIndexer;
    private sdi = StructureDeclarationIndexer.getInstance();

    private constructor() {}

    public static getInstance(): ClassDefinitionIndexer {
        if (!ClassDefinitionIndexer.instance) {
            ClassDefinitionIndexer.instance = new ClassDefinitionIndexer();
        }
        return ClassDefinitionIndexer.instance;
    }

    async getOrBuildIndex(projectPath: string): Promise<ClassIndex> {
        const si = await this.sdi.getOrBuildIndex(projectPath);
        return toClassIndex(si);
    }

    async buildIndex(projectPath: string): Promise<ClassIndex> {
        const si = await this.sdi.buildIndex(projectPath);
        return toClassIndex(si);
    }

    findClass(className: string, projectPath?: string): ClassDefinitionInfo[] | null {
        const results = this.sdi
            .find(className, projectPath)
            .filter(d => LEGACY_TYPES.has(d.structureType))
            .map(toClassDefInfo);
        return results.length ? results : null;
    }

    findClassesByFile(fileName: string, projectPath?: string): ClassDefinitionInfo[] {
        return this.sdi
            .findInFile(fileName, projectPath)
            .filter(d => LEGACY_TYPES.has(d.structureType))
            .map(toClassDefInfo);
    }

    clearCache(): void { this.sdi.clearCache(); }
    clearProjectCache(projectPath: string): void { this.sdi.clearProjectCache(projectPath); }
}