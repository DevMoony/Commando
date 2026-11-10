import { toTitleCase } from "../util";

export class UnknownClientError extends Error {
    constructor(message: string) {
        super(message);

        this.name = "UnknownClientError";
        this.cause = new Error(message);
        this.stack = `[${toTitleCase(this.name).replace(/ /g, "_")}] ${this.message}`;
    }
}
