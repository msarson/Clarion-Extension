
export class ClarionSourcerFile {
    constructor(public name: string, public relativePath: string) { }
}



export class ClarionProject {
    sourceFiles: ClarionSourcerFile[] = [];
    pathsToLookin: Record<string, string[]> = {};
    constructor(
        public name: string,
        public type: string,
        public path: string,
        public guid: string
    ) { }
    addSourceFile(name: string, relativePath: string) {
        this.sourceFiles.push(new ClarionSourcerFile(name, relativePath));
    }
}
