import * as fs from 'fs';
import * as path from 'path';

export interface DataTypeParameter {
    name: string;
    type: string;
    optional: boolean;
    description: string;
}

export interface DataTypeDefinition {
    name: string;
    category: 'numeric' | 'string' | 'date_time' | 'special';
    description: string;
    syntax: string;
    parameters: DataTypeParameter[];
    attributes: string[];
    size: string;
    range?: string;
    notes?: string;
}

interface DataTypesData {
    dataTypes: DataTypeDefinition[];
}

export class DataTypeService {
    private dataTypes: Map<string, DataTypeDefinition> = new Map();
    private static instance: DataTypeService;

    private constructor() {
        this.loadDataTypes();
    }

    public static getInstance(): DataTypeService {
        if (!DataTypeService.instance) {
            DataTypeService.instance = new DataTypeService();
        }
        return DataTypeService.instance;
    }

    private loadDataTypes(): void {
        try {
            const dataPath = path.join(__dirname, '..', 'data', 'clarion-datatypes.json');
            const rawData = fs.readFileSync(dataPath, 'utf8');
            const data: DataTypesData = JSON.parse(rawData);

            for (const dataType of data.dataTypes) {
                this.dataTypes.set(dataType.name.toUpperCase(), dataType);
            }

            console.log(`Loaded ${this.dataTypes.size} Clarion data types`);
        } catch (error) {
            console.error('Error loading Clarion data types:', error);
        }
    }

    public getDataType(name: string): DataTypeDefinition | undefined {
        return this.dataTypes.get(name.toUpperCase());
    }

    public getAllDataTypes(): DataTypeDefinition[] {
        return Array.from(this.dataTypes.values());
    }

    public getDataTypesByCategory(category: string): DataTypeDefinition[] {
        return Array.from(this.dataTypes.values()).filter(dt => dt.category === category);
    }

    public hasDataType(name: string): boolean {
        return this.dataTypes.has(name.toUpperCase());
    }

    public getFormattedDescription(dataType: DataTypeDefinition): string {
        let desc = `**${dataType.name}** - ${dataType.description}\n\n`;
        desc += `**Syntax:** \`${dataType.syntax}\`\n\n`;
        desc += `**Size:** ${dataType.size}\n`;
        
        if (dataType.range) {
            desc += `**Range:** ${dataType.range}\n`;
        }

        if (dataType.parameters.length > 0) {
            desc += '\n**Parameters:**\n';
            for (const param of dataType.parameters) {
                const optionalTag = param.optional ? ' _(optional)_' : ' _(required)_';
                desc += `- \`${param.name}\`${optionalTag}: ${param.description}\n`;
            }
        }

        if (dataType.attributes.length > 0) {
            desc += `\n**Valid Attributes:** ${dataType.attributes.join(', ')}\n`;
        }

        if (dataType.notes) {
            desc += `\n**Notes:** ${dataType.notes}\n`;
        }

        return desc;
    }

    public supportsAttribute(dataTypeName: string, attributeName: string): boolean {
        const dataType = this.getDataType(dataTypeName);
        if (!dataType) {
            return false;
        }
        return dataType.attributes.some(attr => attr.toUpperCase() === attributeName.toUpperCase());
    }

    public getSignatureHelp(dataTypeName: string): string {
        const dataType = this.getDataType(dataTypeName);
        if (!dataType) {
            return '';
        }

        if (dataType.parameters.length === 0) {
            return `${dataType.name}`;
        }

        const params = dataType.parameters.map(p => {
            if (p.optional) {
                return `[${p.name}]`;
            }
            return p.name;
        }).join(', ');

        return `${dataType.name}(${params})`;
    }
}
