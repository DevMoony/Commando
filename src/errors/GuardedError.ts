import { toTitleCase } from "../util";

export class GuardedError extends Error {
    constructor(message: string) {
        super(message);

        this.name = "GuardedError";
        this.cause = new Error(message);
        this.stack = `[${toTitleCase(this.name).replace(/ /g, "_")}] ${this.message}`;
    }
}
