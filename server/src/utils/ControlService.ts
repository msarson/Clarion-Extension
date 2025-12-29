import * as path from 'path';
import * as fs from 'fs';

export interface ControlDefinition {
    name: string;
    description: string;
    syntax: string;
    commonAttributes: string[];
}

interface ControlData {
    windowControls: ControlDefinition[];
    reportControls: ControlDefinition[];
}

export class ControlService {
    private static instance: ControlService;
    private windowControls: Map<string, ControlDefinition> = new Map();
    private reportControls: Map<string, ControlDefinition> = new Map();

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
            const dataPath = path.join(__dirname, '..', 'data', 'clarion-controls.json');
            const data = fs.readFileSync(dataPath, 'utf8');
            const controlData: ControlData = JSON.parse(data);

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
     * Get documentation for a control
     */
    public getControlDocumentation(name: string): string {
        const control = this.getControl(name);
        if (!control) {
            return '';
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
