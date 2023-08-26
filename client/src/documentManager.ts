import * as vscode from 'vscode';
import LocationProvider from './UtilityClasses/LocationProvider'; // Adjust the import path based on your project structure
import { ClarionLocation } from './UtilityClasses/LocationProvider'; // Make sure this import is correct

interface DocumentInfo {
    statementLocations: ClarionLocation[];
}

export class DocumentManager implements vscode.Disposable {
    private openDocuments: Map<string, DocumentInfo> = new Map(); // Store document info by URI
    private locationProvider: LocationProvider;
    private refreshNeededEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onRefreshNeeded = this.refreshNeededEmitter.event;
    private disposables: vscode.Disposable[] = [];
    constructor() {
        this.locationProvider = new LocationProvider();
        this.handleRefreshNeeded = this.handleRefreshNeeded.bind(this);
        vscode.workspace.onDidOpenTextDocument(this.onDidOpenTextDocument, this);
        vscode.workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this);
        vscode.workspace.onDidSaveTextDocument(this.onDidSaveTextDocument, this);
        vscode.workspace.onDidRenameFiles(this.onDidRenameFiles, this);
        vscode.workspace.onDidDeleteFiles(this.onDidDeleteFiles, this);
        this.onRefreshNeeded(this.handleRefreshNeeded);
        this.disposables.push(this.refreshNeededEmitter);
    }

    private handleRefreshNeeded = (uri: vscode.Uri) => {

        
        const matchingDocument = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
        try {
            if (matchingDocument) {
                this.updateDocumentInfo(matchingDocument);
            } else {
                console.log('No matching document found for:', uri.toString());
            }
        } catch (error) {
            console.log('Error in handleRefreshNeeded:', error);
        }

    }


    private async onDidSaveTextDocument(document: vscode.TextDocument) {
        await this.updateDocumentInfo(document);
    }

    private async onDidDeleteFiles(event: vscode.FileDeleteEvent) {
        for (const fileDelete of event.files) {
            const deletedUri = fileDelete;
            // Handle deletion by removing entries from openDocuments map
        }
    }
    private async onDidRenameFiles(event: vscode.FileRenameEvent) {
        for (const fileRename of event.files) {
            const oldUri = fileRename.oldUri;
            const newUri = fileRename.newUri;
            //get new document info from newUri


            
            this.updateAllDocumentLocations(newUri.toString());
            // Handle renaming by updating the entries in openDocuments map
            // You might need to adjust the keys in the map accordingly
        }
    }
    private async onDidOpenTextDocument(document: vscode.TextDocument) {
        await this.updateDocumentInfo(document);
        await this.updateDocumentInfo(document);
        this.updateAllDocumentLocations(document.uri.toString());
    }

    private async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
        const doc = event.document;
        
        await this.updateDocumentInfo(event.document);
        this.updateAllDocumentLocations(doc.uri.toString());
    }

    updateAllDocumentLocations(currentFileName: string) {
        // Notify listeners that a refresh is needed
        // Parse all open documents and send a refresh event to each one
        // seems to only work on documents that are open in the editor and have been viewed
        //can this be fixed?
        vscode.workspace.textDocuments.forEach(document => {

            try {
                // Check if the document's URI is not the same as the URI being processed
                if (document.uri.toString() !== currentFileName) {
                    console.log('Event being sent to to:', document.uri.toString());
                    this.refreshNeededEmitter.fire(document.uri);
                } else {
                   // console.log('Event not sent to:', document.uri.toString());
                }
            } catch (error) {
                console.log('Error in updateAllDocumentLocations:', error);
            }
        });

    }

    getLinkUri(documentUri: vscode.Uri, position: vscode.Position): vscode.Uri | undefined {
        const location = this.findLinkAtPosition(documentUri, position);
        if (location) {
            let targetUri = vscode.Uri.file(location.fullFileName);

            if (location.statementType === "SECTION" && location.sectionLineLocation) {
                const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                targetUri = targetUri.with({ fragment: lineQueryParam });
            }
            return targetUri;
        }

        return undefined;
    }

    generateDocumentLinks(uri: vscode.Uri): vscode.DocumentLink[] {
        const documentInfo = this.getDocumentInfo(uri);
        const links: vscode.DocumentLink[] = [];

        if (documentInfo) {
            for (const location of documentInfo.statementLocations) {
                // Generate links based on ClarionLocation properties and statementType
                if (
                    (location.statementType === "INCLUDE" || location.statementType === "MODULE" || location.statementType === "SECTION") &&
                    location.linePosition &&
                    location.linePositionEnd
                ) {
                    let targetUri = vscode.Uri.file(location.fullFileName);

                    if (location.statementType === "SECTION" && location.sectionLineLocation) {
                        const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                        targetUri = targetUri.with({ fragment: lineQueryParam });
                    }

                    const link = new vscode.DocumentLink(
                        new vscode.Range(location.linePosition, location.linePositionEnd),
                        targetUri
                    );
                    links.push(link);
                }
            }
        }

        return links;
    }



    findLinkAtPosition(documentUri: vscode.Uri, position: vscode.Position): ClarionLocation | undefined {
        const documentInfo = this.getDocumentInfo(documentUri);

        if (documentInfo) {
            for (const location of documentInfo.statementLocations) {
                const linkRange = new vscode.Range(
                    location.linePosition || new vscode.Position(0, 0),
                    location.linePositionEnd || new vscode.Position(0, 0)
                );

                if (linkRange.contains(position)) {
                    return location;
                }
            }
        }

        return undefined;
    }

    public async updateDocumentInfo(document: vscode.TextDocument) {
        const statementLocations: ClarionLocation[] = [];
      //  console.log('updateDocumentInfo:', document.uri.toString());
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            this.processPattern(document, /INCLUDE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?(?:,\s*ONCE)?\)/i, "INCLUDE", lineIndex, statementLocations);
            this.processPattern(document, /MODULE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/i, "MODULE", lineIndex, statementLocations);
        }

        this.openDocuments.set(document.uri.toString(), {
            statementLocations
        });
    }

    private processPattern(document: vscode.TextDocument, pattern: RegExp, statementType: string, lineIndex: number, statementLocations: ClarionLocation[]) {
        const location = this.locationProvider.getLocationFromPattern(document, lineIndex, pattern);

        if (location) {
            statementLocations.push({
                fullFileName: location.fullFileName,
                sectionLineLocation: null,
                linePosition: location.linePosition,
                linePositionEnd: location.linePositionEnd,
                statementType: statementType,
                result: location.result
            });
            if (location.sectionLineLocation && location.result && location.linePosition && location.linePositionEnd && location.result[2] !== undefined) {
                const sectionOffset = location.result[1].length + 2; // Include ', and ' in offset
                const sectionStartCharacter = location.linePosition.character + sectionOffset + 1;
                const sectionEndCharacter = sectionStartCharacter + location.result[2].length;
                const linkStartPosition = location.linePosition.with({ character: sectionStartCharacter });
                const linkEndPosition = location.linePosition.with({ character: sectionEndCharacter });
                statementLocations.push({
                    fullFileName: location.fullFileName,
                    sectionLineLocation: location.sectionLineLocation,
                    linePosition: linkStartPosition,
                    linePositionEnd: linkEndPosition,
                    result: location.result,
                    statementType: "SECTION"
                });
            }

        }
    }

    getDocumentInfo(uri: vscode.Uri): DocumentInfo | undefined {
        try {
            return this.openDocuments.get(uri.toString());
        } catch (error) {
            console.error('Error in getDocumentInfo:', error);
            return undefined;
        }
    }
    getDocumentContent(uri: vscode.Uri): string | undefined {
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (document) {
            return document.getText();
        }
        return undefined;
    }
    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
