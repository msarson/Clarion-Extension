import { Hover } from 'vscode-languageserver-protocol';
import { DataTypeService } from '../../utils/DataTypeService';
import { ControlService } from '../../utils/ControlService';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("SymbolHoverResolver");
logger.setLevel("error");

/**
 * Context for symbol resolution
 */
export interface HoverContext {
    hasLabelBefore: boolean;
    isInWindowContext: boolean;
    isFollowedByIdentifier: boolean;
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
        // A bare word immediately followed by another identifier is a label with an
        // explicit type ("Toolbar              ToolbarClass"), never a real
        // control/data-type keyword reference — those always take '(', ',', '!' or
        // end-of-line right after. checkDataType/checkControl below are pure name
        // lookups with no positional awareness, so without this guard a custom class
        // whose name happens to start with a control's name (ToolbarClass, MenuHandler,
        // …) always wins the control lookup by elimination once the type fails the
        // (much narrower) built-in-data-type check. Skip straight to downstream
        // variable resolution instead of guessing.
        if (context.isFollowedByIdentifier) {
            return null;
        }

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
