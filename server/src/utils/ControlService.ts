import * as controlsData from '../data/clarion-controls.json';

export interface ControlParam {
    name: string;
    description: string;
    optional: boolean;
}

export interface ControlDefinition {
    name: string;
    description: string;
    syntax: string;
    commonAttributes: string[];
    params?: ControlParam[];
    /** Every attribute the structure accepts: `X()` takes a value, `X` is a flag. Checked against the compiler. */
    attributes?: string[];
    /** The `attributes` of a STRING with a picture (`STRING(@n9)`), where they differ from a constant one's. */
    pictureAttributes?: string[];
    /** Groups of attributes of which at most one may be present (`[HSCROLL, HVSCROLL]`, `[DOUBLE, NOFRAME, RESIZE]`). */
    exclusive?: string[][];
    /** An attribute the compiler accepts only with another present (#746): `{ ENCRYPT: 'OWNER' }`. */
    requires?: Record<string, string>;
    /** Attributes the declaration must carry (#746): a FILE without DRIVER does not compile. */
    required?: string[];
}

interface ControlData {
    windowControls: ControlDefinition[];
    reportControls: ControlDefinition[];
    containerStructures: ControlDefinition[];
    fileStructures?: ControlDefinition[];
}

export class ControlService {
    private static instance: ControlService;
    private windowControls: Map<string, ControlDefinition> = new Map();
    private reportControls: Map<string, ControlDefinition> = new Map();
    private containerStructures: Map<string, ControlDefinition> = new Map();
    private fileStructures: Map<string, ControlDefinition> = new Map();

    private constructor() {
        this.loadControls();
    }

    public static getInstance(): ControlService {
        if (!ControlService.instance) {
            ControlService.instance = new ControlService();
        }
        return ControlService.instance;
    }

    private loadControls(): void {
        try {
            const controlData: ControlData = controlsData as unknown as ControlData;

            // Load window controls
            for (const control of controlData.windowControls) {
                const normalizedName = control.name.toUpperCase();
                this.windowControls.set(normalizedName, control);
            }

            // Load report controls
            for (const control of controlData.reportControls) {
                const normalizedName = control.name.toUpperCase();
                this.reportControls.set(normalizedName, control);
            }

            // Load container structures (WINDOW, APPLICATION, REPORT)
            for (const ctrl of (controlData.containerStructures ?? [])) {
                this.containerStructures.set(ctrl.name.toUpperCase(), ctrl);
            }

            // Load FILE declarations (FILE, KEY, INDEX, MEMO, BLOB) (#746)
            for (const def of (controlData.fileStructures ?? [])) {
                this.fileStructures.set(def.name.toUpperCase(), def);
            }
        } catch (error) {
            console.error('Failed to load control definitions:', error);
        }
    }

    /**
     * Check if a word is a known window control
     */
    public isWindowControl(name: string): boolean {
        return this.windowControls.has(name.toUpperCase());
    }

    /**
     * Check if a word is a known report control
     */
    public isReportControl(name: string): boolean {
        return this.reportControls.has(name.toUpperCase());
    }

    /**
     * Check if a word is any type of control
     */
    public isControl(name: string): boolean {
        return this.isWindowControl(name) || this.isReportControl(name);
    }

    /**
     * Get window control definition
     */
    public getWindowControl(name: string): ControlDefinition | undefined {
        return this.windowControls.get(name.toUpperCase());
    }

    /**
     * Get report control definition
     */
    public getReportControl(name: string): ControlDefinition | undefined {
        return this.reportControls.get(name.toUpperCase());
    }

    /**
     * Get control definition from either window or report controls
     */
    public getControl(name: string): ControlDefinition | undefined {
        return this.getWindowControl(name) || this.getReportControl(name);
    }

    /**
     * Get all window controls
     */
    public getAllWindowControls(): ControlDefinition[] {
        return Array.from(this.windowControls.values());
    }

    /**
     * Get all report controls
     */
    public getAllReportControls(): ControlDefinition[] {
        return Array.from(this.reportControls.values());
    }

    /**
     * Get control names for completion
     */
    public getWindowControlNames(): string[] {
        return Array.from(this.windowControls.keys());
    }

    /**
     * Get control names for completion
     */
    public getReportControlNames(): string[] {
        return Array.from(this.reportControls.keys());
    }

    /**
     * Get all container structures (WINDOW, APPLICATION, REPORT)
     */
    public getAllContainerStructures(): ControlDefinition[] {
        return Array.from(this.containerStructures.values());
    }

    /**
     * Get a single container structure definition by name
     */
    public getContainerStructure(name: string): ControlDefinition | undefined {
        return this.containerStructures.get(name.toUpperCase());
    }

    /**
     * The definition a labelled declaration's attributes are checked against: a WINDOW,
     * APPLICATION or REPORT header (#740), or a FILE and the KEY, INDEX, MEMO and BLOB
     * declarations inside it (#746).
     */
    public getDeclarationStructure(name: string): ControlDefinition | undefined {
        const upper = name.toUpperCase();
        return this.containerStructures.get(upper) ?? this.fileStructures.get(upper);
    }

    /**
     * Get documentation for a control
     */
    public getControlDocumentation(name: string, declarationSection?: string): string {
        const control = this.getControl(name);
        if (!control) {
            return '';
        }

        // A card for one specific declaration is kept compact: a one-line title, then
        // that declaration's attributes in place of the syntax and the generic list.
        if (declarationSection) {
            return `**${control.name}** — ${control.description}\n\n${declarationSection}`;
        }

        let doc = `**${control.name}**\n\n`;
        doc += `${control.description}\n\n`;
        doc += `**Syntax:** \`${control.syntax}\`\n\n`;
        
        if (control.commonAttributes.length > 0) {
            doc += `**Common Attributes:**\n`;
            doc += control.commonAttributes.map(attr => `- ${attr}`).join('\n');
        }

        return doc;
    }
}
