import * as path from 'path';
import * as fs from 'fs';

export interface ParameterDefinition {
    name: string;
    optional?: boolean;  // If true, parameter can be omitted with comma placeholder
}

export interface AttributeSignature {
    params: (string | ParameterDefinition)[];  // Support both string and object format
    description: string;
    syntax?: string;  // Optional explicit syntax like "AT([x] [,y] [,width] [,height])"
}

export interface AttributeDefinition {
    name: string;
    applicableTo: string[];
    signatures: AttributeSignature[];
    description: string;
    propertyEquate: string;
}

interface AttributeData {
    attributes: AttributeDefinition[];
}

export class AttributeService {
    private static instance: AttributeService;
    private attributes: Map<string, AttributeDefinition> = new Map();
    private attributesByContext: Map<string, AttributeDefinition[]> = new Map();

    private constructor() {
        this.loadAttributes();
    }

    public static getInstance(): AttributeService {
        if (!AttributeService.instance) {
            AttributeService.instance = new AttributeService();
        }
        return AttributeService.instance;
    }

    private loadAttributes(): void {
        try {
            const dataPath = path.join(__dirname, '..', 'data', 'clarion-attributes.json');
            const data = fs.readFileSync(dataPath, 'utf8');
            const attributeData: AttributeData = JSON.parse(data);

            // Load attributes into map (case-insensitive keys)
            for (const attr of attributeData.attributes) {
                const normalizedName = attr.name.toUpperCase();
                this.attributes.set(normalizedName, attr);
            }

            // Build context-based index
            this.buildContextIndex();
        } catch (error) {
            console.error('Failed to load attribute definitions:', error);
        }
    }

    private buildContextIndex(): void {
        // Group attributes by applicable context
        for (const attr of this.attributes.values()) {
            for (const context of attr.applicableTo) {
                const normalized = context.toUpperCase();
                if (!this.attributesByContext.has(normalized)) {
                    this.attributesByContext.set(normalized, []);
                }
                this.attributesByContext.get(normalized)!.push(attr);
            }
        }
    }

    /**
     * Check if a word is a known attribute
     */
    public isAttribute(name: string): boolean {
        return this.attributes.has(name.toUpperCase());
    }

    /**
     * Get attribute definition by name (case-insensitive)
     */
    public getAttribute(name: string): AttributeDefinition | undefined {
        return this.attributes.get(name.toUpperCase());
    }

    /**
     * Get all attributes applicable to a specific context
     * @param context - The context type (e.g., 'WINDOW', 'CONTROL', 'REPORT')
     */
    public getAttributesForContext(context: string): AttributeDefinition[] {
        const normalized = context.toUpperCase();
        return this.attributesByContext.get(normalized) || [];
    }

    /**
     * Get all attributes
     */
    public getAllAttributes(): AttributeDefinition[] {
        return Array.from(this.attributes.values());
    }

    /**
     * Get attribute names (for completion, etc.)
     */
    public getAttributeNames(): string[] {
        return Array.from(this.attributes.keys());
    }

    /**
     * Search attributes by partial name match
     */
    public searchAttributes(partialName: string): AttributeDefinition[] {
        const upperPartial = partialName.toUpperCase();
        return Array.from(this.attributes.values()).filter(attr =>
            attr.name.toUpperCase().includes(upperPartial)
        );
    }

    /**
     * Get formatted signature for an attribute
     */
    public getAttributeSignature(name: string): string {
        const attr = this.getAttribute(name);
        if (!attr) {
            return '';
        }

        if (attr.signatures.length === 0) {
            return attr.name;
        }

        // If only one signature with no params, return name without parentheses
        if (attr.signatures.length === 1 && attr.signatures[0].params.length === 0) {
            return attr.name;
        }

        // For attributes with parameters, show the most complete signature
        const fullSig = attr.signatures[attr.signatures.length - 1];
        const params = fullSig.params.map(p => this.formatParameter(p)).join(', ');
        return `${attr.name}(${params})`;
    }

    /**
     * Get all signatures for an attribute
     */
    public getAttributeSignatures(name: string): AttributeSignature[] {
        const attr = this.getAttribute(name);
        return attr?.signatures || [];
    }

    /**
     * Helper to format a parameter for display
     */
    private formatParameter(param: string | ParameterDefinition): string {
        if (typeof param === 'string') {
            return param;
        }
        return param.optional ? `[${param.name}]` : param.name;
    }

    /**
     * Helper to get parameter name (without optional brackets)
     */
    private getParameterName(param: string | ParameterDefinition): string {
        if (typeof param === 'string') {
            return param;
        }
        return param.name;
    }

    /**
     * Get documentation string for an attribute
     */
    public getAttributeDocumentation(name: string): string {
        const attr = this.getAttribute(name);
        if (!attr) {
            return '';
        }

        let doc = `**${attr.name}**\n\n`;
        doc += `${attr.description}\n\n`;

        // Show all signatures
        if (attr.signatures.length > 0) {
            doc += `**Signatures:**\n`;
            for (const sig of attr.signatures) {
                if (sig.params.length === 0) {
                    doc += `- \`${attr.name}\` - ${sig.description}\n`;
                } else {
                    const params = sig.params.map(p => this.formatParameter(p)).join(', ');
                    doc += `- \`${attr.name}(${params})\` - ${sig.description}\n`;
                }
            }
            doc += '\n';
        }

        doc += `**Applicable to:** ${attr.applicableTo.join(', ')}\n\n`;
        doc += `**Property Equate:** ${attr.propertyEquate}`;

        return doc;
    }
}
