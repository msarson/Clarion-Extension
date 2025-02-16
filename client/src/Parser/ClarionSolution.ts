import { ClarionProject } from './ClarionProject';


export class ClarionSolution {
    constructor(public name: string = '', public projects: ClarionProject[] = []) { }
}
