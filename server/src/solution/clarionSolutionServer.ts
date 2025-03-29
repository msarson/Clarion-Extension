import { ClarionProjectServer } from "./clarionProjectServer";

export class ClarionSolutionServer {
    constructor(
        public name: string = '',
        public path: string = '',         // ⬅️ NEW: Store the solution file path
        public guid: string = '',         // ⬅️ Optional: If the solution itself has a GUID
        public projects: ClarionProjectServer[] = []
    ) {}
}
