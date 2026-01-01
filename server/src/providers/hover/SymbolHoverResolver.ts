import { Hover } from 'vscode-languageserver-protocol';
import { DataTypeService } from '../../utils/DataTypeService';
import { ControlService } from '../../utils/ControlService';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("SymbolHoverResolver");

/**
 * Context for symbol resolution
 */
export interface HoverContext {
    hasLabelBefore: boolean;
    isInWindowContext: boolean;
}

/**
 * Resolves hover information for Clarion symbols (data types, controls)
 * with context-aware priority
 */
export class SymbolHoverResolver {
    constructor(
        private dataTypeService: DataTypeService,
        private controlService: ControlService
    ) {}

    /**
     * Resolve symbol hover with context-aware priority
     * Returns first matching hover or null
     */
    resolve(word: string, context: HoverContext): Hover | null {
        const checkDataTypeFirst = context.hasLabelBefore || !context.isInWindowContext;

        if (checkDataTypeFirst) {
            // Data declaration context - check data type first
            const dataTypeHover = this.checkDataType(word);
            if (dataTypeHover) return dataTypeHover;
            
            // Then check control as fallback
            const controlHover = this.checkControl(word);
            if (controlHover) return controlHover;
        } else {
            // Window/control context - check control first
            const controlHover = this.checkControl(word);
            if (controlHover) return controlHover;
            
            // Then check data type as fallback
            const dataTypeHover = this.checkDataType(word);
            if (dataTypeHover) return dataTypeHover;
        }

        return null;
    }

    /**
     * Check if word is a Clarion data type
     */
    private checkDataType(word: string): Hover | null {
        if (this.dataTypeService.hasDataType(word)) {
            logger.info(`Found Clarion data type: ${word}`);
            const dataType = this.dataTypeService.getDataType(word);
            if (dataType) {
                const formattedDoc = this.dataTypeService.getFormattedDescription(dataType);
                return {
                    contents: {
                        kind: 'markdown',
                        value: formattedDoc
                    }
                };
            }
        }
        return null;
    }

    /**
     * Check if word is a Clarion control
     */
    private checkControl(word: string): Hover | null {
        if (this.controlService.isControl(word)) {
            logger.info(`Found Clarion control: ${word}`);
            const controlDoc = this.controlService.getControlDocumentation(word);
            if (controlDoc) {
                return {
                    contents: {
                        kind: 'markdown',
                        value: controlDoc
                    }
                };
            }
        }
        return null;
    }
}
