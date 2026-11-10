import * as discord from "discord.js";
import { CommandoClient } from "../client";
import { UnknownClientError } from "../errors/UnknownClient";
import { GuardedError } from "../errors/GuardedError";
import { Collection, GuildResolvable } from "discord.js";
import { Command } from "./base";
import { isGroupEnabled, setGroupEnabled } from "../util";

/** A group for commands. Whodathunkit? */
export class CommandGroup {
    /** Client that this group is for. */
    readonly client: CommandoClient;
    /** ID of this group. */
    id: string;
    /** Name of this group. */
    name: string;
    /** The commands in this group (added upon their registration). */
    commands: Collection<string, Command>;
    /** Whether or not this group is protected from being disabled. */
    guarded: boolean;
    _globalEnabled: boolean = true;

    /**
     * @param client The client the group is for
     * @param id The ID for the group
     * @param name The name for the group (defaults to the ID if not specified)
     * @param guarded Whether the group should be protected from being disabled or unloaded (defaults to false)
     */
    constructor(
        client: CommandoClient,
        id: string,
        name: string = id,
        guarded: boolean = false
    ) {
        if (!client)
            throw new UnknownClientError("A client must be specified.");
        if (typeof id !== "string")
            throw new TypeError("Group ID must be a string.");
        if (id !== id.toLowerCase())
            throw new Error("Group ID must be lowercase.");

        this.client = client;
        this.id = id;
        this.name = name;
        this.commands = new Collection();
        this.guarded = guarded;
    }

    /**
     * Enables or disables the group in a guild.
     * @param guild - Guild to enable/disable the group in.
     * @param enabled - Whether the group should be enabled or disabled.
     */
    async setEnabledIn(
        guild: GuildResolvable,
        enabled: boolean
    ): Promise<void> {
        if (typeof guild === "undefined")
            throw new TypeError("Guild must not be undefined.");
        if (typeof enabled === "undefined")
            throw new TypeError("Enabled can only be specified as a boolean.");
        if (this.guarded)
            throw new GuardedError(
                "This group is guarded and cannot be enabled or disabled."
            );
        if (!guild) {
            this._globalEnabled = enabled;
            this.client.emit("groupStatusChange", null, this, enabled);
            return;
        }

        guild = this.client.guilds.cache.resolve(guild);
        // Since this has been discontinued, we should
        // write this to a JSON file instead.
        await setGroupEnabled(this.id, guild.id, enabled);
    }

    /**
     * Checks if the group is enabled in a guild.
     * @param guild - Guild to check in.
     * @return Whether or not the group is enabled.
     */
    async isEnabledIn(guild: GuildResolvable): Promise<boolean> {
        if (this.guarded) return true;
        if (!guild) return this._globalEnabled;

        guild = this.client.guilds.resolve(guild);
        // Since this has been discontinued, we should
        // write this to a database file instead.
        return await isGroupEnabled(this.id, guild.id);
    }

    /** Reloads all of the group's commands. */
    reload(): void {
        for (const command of this.commands.values()) command.reload();
    }
}
