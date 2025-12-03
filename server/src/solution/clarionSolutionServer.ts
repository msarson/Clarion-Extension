import { ClarionProjectServer } from "./clarionProjectServer";

export interface ClarionApp {
    name: string;
    relativePath: string;
    absolutePath: string;
}

export class ClarionSolutionServer {
    constructor(
        public name: string = '',
        public path: string = '',         // ⬅️ NEW: Store the solution file path
        public guid: string = '',         // ⬅️ Optional: If the solution itself has a GUID
        public projects: ClarionProjectServer[] = [],
        public applications: ClarionApp[] = []
    ) {}
}
