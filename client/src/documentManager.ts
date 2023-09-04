import { 
    Uri,
    workspace,
    Disposable,
    TextDocument,
    TextDocumentChangeEvent,
    Position,
    Range,
    FileDeleteEvent,
    FileRenameEvent,
    DocumentLink
} from 'vscode';

import LocationProvider from './UtilityClasses/LocationProvider'; // Adjust the import path based on your project structure
import { ClarionLocation } from './UtilityClasses/LocationProvider'; // Make sure this import is correct
import { SolutionParser } from './SolutionParser'; // Adjust the import path based on your project structure
import * as path from 'path';
interface DocumentInfo {
    statementLocations: ClarionLocation[];
}

export class DocumentManager implements Disposable {

    private readonly modulePattern = /MODULE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/ig;
    private readonly includePattern = /INCLUDE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?(?:,\s*ONCE)?\)/ig;
    private readonly memberPattern = /MEMBER\s*\(\s*'([^']+)'\s*\)/ig;
    private openDocuments: Map<string, DocumentInfo> = new Map(); // Store document info by URI
    private locationProvider: LocationProvider;
    private disposables: Disposable[] = [];
    private solutionParser: SolutionParser;
    

    constructor(solutionParser: SolutionParser) {
        
        workspace.onDidOpenTextDocument(this.onDidOpenTextDocument, this);
        workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this);
        workspace.onDidSaveTextDocument(this.onDidSaveTextDocument, this);
        workspace.onDidRenameFiles(this.onDidRenameFiles, this);
        workspace.onDidDeleteFiles(this.onDidDeleteFiles, this);
        this.solutionParser = solutionParser;
        this.locationProvider = new LocationProvider(this.solutionParser);
    }
    async initialize(solutionParser: SolutionParser) {
        this.solutionParser = solutionParser;
       await this.locationProvider.initialize(solutionParser);
    }
    public inspectFullPath() {


        
       // this.locationProvider.inspectFullPath();
    }


    private async onDidSaveTextDocument(document: TextDocument) {
        await this.updateDocumentInfo(document);
    }

    private async onDidDeleteFiles(event: FileDeleteEvent) {
        for (const fileDelete of event.files) {
            const deletedUri = fileDelete;
            // Handle deletion by removing entries from openDocuments map
        }
    }
    private async onDidRenameFiles(event: FileRenameEvent) {
        for (const fileRename of event.files) {
            const oldUri = fileRename.oldUri;
            const newUri = fileRename.newUri;
            // Handle renaming by updating the entries in openDocuments map
            // You might need to adjust the keys in the map accordingly
        }
    }
    private async onDidOpenTextDocument(document: TextDocument) {
        await this.updateDocumentInfo(document);

    }

    private async onDidChangeTextDocument(event: TextDocumentChangeEvent) {
        const doc = event.document;

        await this.updateDocumentInfo(event.document);
    }



    getLinkUri(documentUri: Uri, position: Position): Uri | undefined {
        const location = this.findLinkAtPosition(documentUri, position);
        if (location) {
            let targetUri = Uri.file(location.fullFileName);

            if (location.statementType === "SECTION" && location.sectionLineLocation) {
                const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                targetUri = targetUri.with({ fragment: lineQueryParam });
            }
            return targetUri;
        }

        return undefined;
    }

    generateDocumentLinks(uri: Uri): DocumentLink[] {
        const documentInfo = this.getDocumentInfo(uri);
        const links: DocumentLink[] = [];

        if (documentInfo) {
            for (const location of documentInfo.statementLocations) {
                // Generate links based on ClarionLocation properties and statementType
                if (
                    (location.statementType === "INCLUDE" || location.statementType === "MODULE" || location.statementType === "MEMBER" || location.statementType === "SECTION") &&
                    location.linePosition &&
                    location.linePositionEnd
                ) {
                    let targetUri = Uri.file(location.fullFileName);

                    if (location.statementType === "SECTION" && location.sectionLineLocation) {
                        const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                        targetUri = targetUri.with({ fragment: lineQueryParam });
                    }

                    const link = new DocumentLink(
                        new Range(location.linePosition, location.linePositionEnd),
                        targetUri
                    );
                    links.push(link);
                }
            }
        }

        return links;
    }



    findLinkAtPosition(documentUri: Uri, position: Position): ClarionLocation | undefined {
        const documentInfo = this.getDocumentInfo(documentUri);

        if (documentInfo) {
            for (const location of documentInfo.statementLocations) {
                const linkRange = new Range(
                    location.linePosition || new Position(0, 0),
                    location.linePositionEnd || new Position(0, 0)
                );

                if (linkRange.contains(position)) {
                    return location;
                }
            }
        }

        return undefined;
    }
   
    
    public async updateDocumentInfo(document: TextDocument) {
        if (document.uri.scheme !== 'file'|| document.uri.fsPath.endsWith('.code-workspace')) {
            return;
        }
        const statementLocations: ClarionLocation[] = [];
        const includeLocations = this.processPattern(document, this.includePattern, "INCLUDE");
        statementLocations.push(...includeLocations);
        const moduleLocations = this.processPattern(document, this.modulePattern, "MODULE");
        statementLocations.push(...moduleLocations);
        const memberLocation = this.processPattern(document, this.memberPattern, "MEMBER");
        statementLocations.push(...memberLocation);
        this.openDocuments.set(document.uri.toString(), {
            statementLocations
        });
    }

    private processPattern(document: TextDocument, pattern: RegExp, statementType: string): ClarionLocation[] {
        const statementLocations: ClarionLocation[] = [];
        const locations = this.locationProvider.getLocationFromPattern(document, pattern);
        if(!locations) {
            return statementLocations;
        }
        for (const location of locations) {
            const statementLocation: ClarionLocation = {
                fullFileName: location.fullFileName,
                sectionLineLocation: null,
                linePosition: location.linePosition,
                linePositionEnd: location.linePositionEnd,
                statementType: statementType,
                result: location.result
            };

            statementLocations.push(statementLocation);

            if (location.sectionLineLocation && location.result && location.linePosition && location.linePositionEnd && location.result[2] !== undefined) {
                const sectionOffset = location.result[1].length + 2; // Include ', and ' in offset
                const sectionStartCharacter = location.linePosition.character + sectionOffset + 1;
                const sectionEndCharacter = sectionStartCharacter + location.result[2].length;
                const linkStartPosition = location.linePosition.with({ character: sectionStartCharacter });
                const linkEndPosition = location.linePosition.with({ character: sectionEndCharacter });

                const sectionLocation: ClarionLocation = {
                    fullFileName: location.fullFileName,
                    sectionLineLocation: location.sectionLineLocation,
                    linePosition: linkStartPosition,
                    linePositionEnd: linkEndPosition,
                    result: location.result,
                    statementType: "SECTION"
                };

                statementLocations.push(sectionLocation);
            }
        }
        return statementLocations;
    }

    getDocumentInfo(uri: Uri): DocumentInfo | undefined {
        try {
            return this.openDocuments.get(uri.toString());
        } catch (error) {
            console.error('Error in getDocumentInfo:', error);
            return undefined;
        }
    }
    getDocumentContent(uri: Uri): string | undefined {
        const document = workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (document) {
            return document.getText();
        }
        return undefined;
    }
    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
    }
    
}
