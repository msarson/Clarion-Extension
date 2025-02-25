// export class Logger {
//     private debugMode: boolean;
//     private procedureName: string | null = null;
//     private static activeProcedures: Set<string> = new Set();

//     constructor(enableDebugMode: boolean = false) {
//         this.debugMode = enableDebugMode;
//     }

//     /**
//      * Enables or disables debug logging for this instance.
//      */
//     public setDebugMode(enabled: boolean): void {
//         this.debugMode = enabled;
//     }

//     public getDebugMode(): boolean {
//         return this.debugMode;
//     }

//     /**
//      * Retrieves the caller function's name from the stack trace.
//      */
//     private getCallerFunction(): string {
//         const error = new Error();
//         const stackLines = error.stack?.split("\n") || [];
//         const callerLine = stackLines[3] || "Unknown"; // The actual caller function (3rd line in the stack)
//         const match = callerLine.match(/at (\S+) /);
//         return match ? match[1] : "Unknown";
//     }

//     /**
//      * Logs an informational message, only if debug mode is enabled.
//      */
//     public info(message: string, ...args: any[]): void {
//         if (this.debugMode) {
//             const functionName = this.getCallerFunction();

//             // Print procedure header only once per function call
//             if (!Logger.activeProcedures.has(functionName)) {
//                 console.log(`\n🔹 Procedure =========================================`);
//                 console.log(`🔍 [START] Function: ${functionName}`);
//                 Logger.activeProcedures.add(functionName);
//             }

//             console.log(`ℹ️ [INFO] [${functionName}] ${message}`, ...args);
//         }
//     }

//     /**
//      * Logs a warning message to the console.
//      */
//     public warn(message: string, ...args: any[]): void {
//         if (this.debugMode) {
//             const functionName = this.getCallerFunction();
//             console.warn(`⚠️ [WARN] [${functionName}] ${message}`, ...args);
//         }
//     }

//     /**
//      * Logs an error message to the console.
//      */
//     public error(message: string, ...args: any[]): void {
//         const functionName = this.getCallerFunction();
//         console.error(`❌ [ERROR] [${functionName}] ${message}`, ...args);
//     }

//     /**
//      * Disposes the logger, adding an end marker for logged procedures.
//      */
//     public dispose(): void {
//         if (this.debugMode && Logger.activeProcedures.size > 0) {
//             console.log(`\n🔹 End ================================================\n`);
//             Logger.activeProcedures.clear();
//         }
//     }
// }
