import { PermissionFlagsBits } from "discord.js";
import { QuickDB, SqliteDriver } from "quick.db";

const sqlDriver = new SqliteDriver("./commando.sqlite");
const db = new QuickDB({
    driver: sqlDriver,
});

// This returns Object.prototype in order to return a valid object
// without creating a new one each time this is called just to discard it the moment after.
const isConstructorProxyHandler = {
    construct() {
        return Object.prototype;
    },
};

export function escapeRegex(str: string): string {
    return str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

export function disambiguation<T extends { [key: string]: any }>(
    items: T[],
    label: string,
    property: "name" | `${string}` = "name"
): string {
    const itemList = items
        .map(
            (item) =>
                `"${(property ? item[property] : item).replace(/ /g, "\xa0")}"`
        )
        .join(",   ");
    return `Multiple ${label} found, please be more specific: ${itemList}`;
}

export function isConstructor<T>(
    func: Function,
    _class: { new (): T }
): boolean {
    try {
        // eslint-disable-next-line no-new
        new (new Proxy(func, isConstructorProxyHandler) as new () => unknown)();

        if (!_class) return true;
        return func.prototype instanceof _class;
    } catch (err) {
        return false;
    }
}

type PaginatedResult<T> = {
    items: T[];
    page: number;
    pageLength: number;
    maxPage: number;
};
export function paginate<T>(
    items: T[],
    page: number = 1,
    pageLength: number = 10
): PaginatedResult<T> {
    const maxPage = Math.ceil(items.length / pageLength);
    if (page < 1) page = 1;
    if (page > maxPage) page = maxPage;

    const startIndex = (page - 1) * pageLength;
    return {
        items:
            items.length > pageLength
                ? items.slice(startIndex, startIndex + pageLength)
                : items,
        page,
        pageLength,
        maxPage,
    };
}

export const permissions = PermissionFlagsBits;

export function toTitleCase(str: string): string {
    // Finds a lowercase letter followed by an uppercase letter
    // and inserts a space between them
    return str.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export async function isGroupEnabled(
    groupId: string,
    guildId?: string
): Promise<boolean> {
    const hasEnabled = await db.has(
        `guilds.${guildId}.groups.${groupId}.enabled`
    );

    return hasEnabled
        ? ((await db.get<boolean>(
              `guilds.${guildId}.groups.${groupId}.enabled`
          )) as boolean)
        : true;
}

export async function setGroupEnabled(
    groupId: string,
    guildId: string,
    enabled: boolean
): Promise<void> {
    await db.set(`guilds.${guildId}.groups.${groupId}.enabled`, enabled);
}