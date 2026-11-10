import { escapeMarkdown, Message } from "discord.js";
import { oneLine, stripIndents } from "common-tags";
import isPromise from "is-promise";
import { ArgumentUnionType } from "../types/union";
import { ArgumentType } from "../types/base";

type ArgumentValue =
    | string
    | number
    | boolean
    | bigint
    | object
    | null
    | undefined
    | Array<string | number | boolean | bigint | object>;

/** Either a value or a function that returns a value. The function is passed the CommandoMessage and the Argument. */
type ArgumentDefault =
    | string
    | number
    | boolean
    | ((...args: any[]) => string | number | boolean)
    | ((...args: any[]) => Promise<string | number | boolean>)
    | Function;

type ArgumentInfo = {
    /** Key for the argument. */
    key: string;
    /** Label for the argument. */
    label?: string;
    /** First prompt for the argument when it wasn't specified. */
    prompt: string;
    /** Predefined error message to output for the argument when it isn't valid. */
    error?: string;
    /** Type of the argument (must be the ID of one of the registered argument types
     * or multiple IDs in order of priority separated by `|` for a union type - see
     * {@link CommandoRegistry#registerDefaultTypes} for the built-in types). */
    type?: string;
    /** If type is `integer` or `float`, this is the maximum value of the number.
     * If type is `string`, this is the maximum length of the string. */
    max?: number;
    /** If type is `integer` or `float`, this is the minimum value of the number.
     * If type is `string`, this is the minimum length of the string. */
    min?: number;
    /** Default value for the argument (makes the arg optional - cannot be `null`). */
    default?: ArgumentDefault;
    /** An array of values that are allowed to be used. */
    oneOf?: string[];
    /** Whether the argument accepts infinite values. */
    infinite?: boolean;
    /** Validator function for the argument (see {@link ArgumentType#validate}). */
    validate?: ArgumentType["validate"];
    /** Parser function for the argument (see {@link ArgumentType#parse}). */
    parse?: ArgumentType["parse"];
    /** Empty checker for the argument (see {@link ArgumentType#isEmpty}). */
    isEmpty?: ArgumentType["isEmpty"];
    /** How long to wait for input (in seconds). */
    wait?: number;
};

/** Result object from obtaining a single {@link Argument}'s value(s). */
type ArgumentResult = {
    /** Final value(s) for the argument. */
    value: ArgumentValue;
    /**
     * One of:
     * - `user` (user cancelled)
     * - `time` (wait time exceeded)
     * - `promptLimit` (prompt limit exceeded).
     */
    cancelled: "user" | "time" | "promptLimit" | null;
    /** All messages that were sent to prompt the user. */
    prompts: Message[];
    /** All of the user's messages that answered a prompt. */
    answers: Message[];
};

function DefaultArgumentInfo(payload: ArgumentInfo): ArgumentInfo {
    return {
        label: payload.label || payload.key,
        infinite: payload.infinite || false,
        wait: 30,
        ...payload,
    };
}

/** A fancy argument. */
export class Argument {
    /** Key for the argument. */
    key: ArgumentInfo["key"];
    /** Label for the argument. */
    label: ArgumentInfo["label"];
    /** Question prompt for the argument. */
    prompt: ArgumentInfo["prompt"];
    /** Error message for when a value is invalid. */
    error: ArgumentInfo["error"] | null;
    /** Type for the argument. */
    type?: ArgumentType;
    /**
     * If type is `integer` or `float`, this is the maximum value of the number.
     * If type is `string`, this is the maximum length of the string.
     */
    max?: ArgumentInfo["max"];
    /**
     * If type is `integer` or `float`, this is the minimum value of the number.
     * If type is `string`, this is the minimum length of the string.
     */
    min?: ArgumentInfo["min"];
    /** The default value for the argument. */
    default?: ArgumentInfo["default"];
    /**
     * Values the user can choose from
     * If type is `string`, this will be case-insensitive
     * If type is `channel`, `member`, `role`, or `user`, this will be the IDs.
     */
    oneOf?: ArgumentInfo["oneOf"];
    /** Whether the argument accepts an infinite number of values. */
    infinite: ArgumentInfo["infinite"];
    /**
     * Validator function for validating a value for the argument
     * @see {@link ArgumentType#validate}
     */
    validator?: ArgumentInfo["validate"];
    /**
     * Parser function for parsing a value for the argument.
     * @see {@link ArgumentType#parse}
     */
    parser?: ArgumentInfo["parse"];
    /**
     * Function to check whether a raw value is considered empty
     * @see {@link ArgumentType#isEmpty}
     */
    emptyChecker?: ArgumentInfo["isEmpty"];
    /** How long to wait for input (in seconds). */
    wait: ArgumentInfo["wait"];

    /**
     * @param client - Client the argument belongs to.
     * @param info - Information for the command argument.
     */
    constructor(client: CommandoClient, info: ArgumentInfo) {
        this.constructor.validateInfo(client, DefaultArgumentInfo(info));

        this.key = info.key;
        this.label = info.label || info.key;
        this.prompt = info.prompt;
        this.error = info.error || null;
        this.type = this.constructor.determineType(client, info.type);
        this.max = typeof info.max !== "undefined" ? info.max : undefined;
        this.min = typeof info.min !== "undefined" ? info.min : undefined;
        this.default =
            typeof info.default !== "undefined" ? info.default : undefined;
        this.oneOf =
            typeof info.oneOf !== "undefined"
                ? info.oneOf.map((el) =>
                      el.toLowerCase ? el.toLowerCase() : el
                  )
                : undefined;
        this.infinite = Boolean(info.infinite);
        this.validator = info.validate || null;
        this.parser = info.parse || null;
        this.emptyChecker = info.isEmpty || null;
        this.wait = typeof info.wait !== "undefined" ? info.wait : 30;
    }

    /**
     * Prompts the user and obtains the value for the argument.
     * @param msg - The message that triggered the command.
     * @param val - Pre-provided value for the argument.
     * @param promptLimit - Maximum number of times to prompt for the argument.
     */
    async obtain(
        msg: CommandoMessage,
        val: string,
        promptLimit?: number = Infinity
    ): Promise<ArgumentResult> {
        let empty = this.isEmpty(val, msg);
        if (empty && this.default !== null) {
            return {
                value:
                    typeof this.default === "function"
                        ? await this.default(msg, this)
                        : this.default,
                cancelled: null,
                prompts: [],
                answers: [],
            };
        }
        if (this.infinite) return this.obtainInfinite(msg, val, promptLimit);

        // @ts-ignore
        const wait =
            this.wait > 0 && this.wait !== Infinity
                ? this.wait * 1000
                : undefined;
        const prompts: Message[] = [];
        const answers: Message[] = [];
        let valid = !empty ? await this.validate(val, msg) : false;

        while (!valid || typeof valid === "string") {
            /* eslint-disable no-await-in-loop */
            if (prompts.length >= promptLimit) {
                return {
                    value: null,
                    cancelled: "promptLimit",
                    prompts,
                    answers,
                };
            }

            // Prompt the user for a new value
            prompts.push(
                await msg.reply(stripIndents`
                ${empty ? this.prompt : valid ? valid : `You provided an invalid ${this.label}. Please try again.`}
                ${oneLine`
                    Respond with \`cancel\` to cancel the command.
                    ${wait ? `The command will automatically be cancelled in ${this.wait} seconds` : ""}
                `}
            `)
            );

            // Get the user's response
            const responses = await msg.channel.awaitMessages(
                (msg2) => msg2.author.id === msg.author.id,
                {
                    max: 1,
                    time: wait,
                }
            );

            // Make sure they actually answered
            if (responses && responses.size === 1) {
                answers.push(responses.first());
                val = answers[answers.length - 1].content;
            } else {
                return {
                    value: null,
                    cancelled: "time",
                    prompts,
                    answers,
                };
            }

            // See if they want to cancel
            if (val.toLowerCase() === "cancel") {
                return {
                    value: null,
                    cancelled: "user",
                    prompts,
                    answers,
                };
            }

            empty = this.isEmpty(val, msg, responses.first());
            valid = await this.validate(val, msg, responses.first());
            /* eslint-enable no-await-in-loop */
        }

        return {
            value: await this.parse(
                val,
                msg,
                answers.length ? answers[answers.length - 1] : msg
            ),
            cancelled: null,
            prompts,
            answers,
        };
    }

    /**
     * Prompts the user and obtains multiple values for the argument.
     * @param msg - Message that triggered the command.
     * @param vals - Pre-provided values for the argument.
     * @param promptLimit - Maximum number of times to prompt for the argument.
     */
    private async obtainInfinite(
        msg: CommandoMessage,
        vals: string[],
        promptLimit: number = Infinity
    ): Promise<ArgumentResult> {
        // eslint-disable-line complexity
        // @ts-ignore
        const wait =
            this.wait > 0 && this.wait !== Infinity
                ? this.wait * 1000
                : undefined;
        const results = [];
        const prompts: Message[] = [];
        const answers: Message[] = [];
        let currentVal = 0;

        while (true) {
            // eslint-disable-line no-constant-condition
            /* eslint-disable no-await-in-loop */
            let val = vals && vals[currentVal] ? vals[currentVal] : null;
            let valid = val ? await this.validate(val, msg) : false;
            let attempts = 0;

            while (!valid || typeof valid === "string") {
                attempts++;
                if (attempts > promptLimit) {
                    return {
                        value: null,
                        cancelled: "promptLimit",
                        prompts,
                        answers,
                    };
                }

                // Prompt the user for a new value
                if (val) {
                    const escaped = escapeMarkdown(val).replace(
                        /@/g,
                        "@\u200b"
                    );
                    prompts.push(
                        await msg.reply(stripIndents`
                        ${
                            valid
                                ? valid
                                : oneLine`
                            You provided an invalid ${this.label}, "${escaped.length < 1850 ? escaped : "[too long to show]"}".
                            Please try again.
                        `
                        }
                        ${oneLine`
                            Respond with \`cancel\` to cancel the command, or \`finish\` to finish entry up to this point.
                            ${wait ? `The command will automatically be cancelled in ${this.wait} seconds.` : ""}
                        `}
                    `)
                    );
                } else if (results.length === 0) {
                    prompts.push(
                        await msg.reply(stripIndents`
                        ${this.prompt}
                        ${oneLine`
                            Respond with \`cancel\` to cancel the command, or \`finish\` to finish entry.
                            ${wait ? `The command will automatically be cancelled in ${this.wait} seconds, unless you respond` : ""}
                        `}
                    `)
                    );
                }

                // Get the user's response
                const responses = await msg.channel.awaitMessages(
                    (msg2) => msg2.author.id === msg.author.id,
                    {
                        max: 1,
                        time: wait,
                    }
                );

                // Make sure they actually answered
                if (responses && responses.size === 1) {
                    answers.push(responses.first());
                    val = answers[answers.length - 1].content;
                } else {
                    return {
                        value: null,
                        cancelled: "time",
                        prompts,
                        answers,
                    };
                }

                // See if they want to finish or cancel
                const lc = val.toLowerCase();
                if (lc === "finish") {
                    return {
                        value: results.length > 0 ? results : null,
                        cancelled: this.default
                            ? null
                            : results.length > 0
                              ? null
                              : "user",
                        prompts,
                        answers,
                    };
                }
            }
        }
    }
}
