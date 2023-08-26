// import * as vscode from 'vscode';

// import { ClarionDependencyAnalyzer } from '../ClarionDependencyAnalyzer';
// import  LocationProvider   from '../UtilityClasses/LocationProvider';

// const xml2js = require('xml2js');
// export class ClarionDefinitionProvider implements vscode.DefinitionProvider {
    
    
    
//     private locationProvider: LocationProvider;

//     constructor() {
//         this.locationProvider = new LocationProvider();
//     }

//     public provideDefinition(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {

//         if (_token.isCancellationRequested) {
//             // The user canceled the operation
//             return Promise.resolve(null);
//         }
//         const includePattern = /INCLUDE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?(?:,\s*ONCE)?\)/i;
        
//         const locationFromInclude = this.locationProvider.getLocationFromPattern(document, position.line, includePattern);
//         if (locationFromInclude) {
//             return locationFromInclude;;
//         }

//         const modulePattern = /MODULE\s*\('([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/i;
//         const locationFromModule = this.locationProvider.getLocationFromPattern(document, position.line, modulePattern);
//         if (locationFromModule) {
//             return locationFromModule;
//         }

//         return null; // No definition found

//     }
    
// }


