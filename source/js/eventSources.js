import {
    // Native
    extensionSettings,
    hideRegenerateButton,
    zoomCharacterAvatar,
    simpleUserInput,
    context,
    HTML_TEMPLATES,
    // ST Imports
    eventSource,
    eventTypes,
    lodash,
    yaml,
} from '../../index.js';

export {
    init,
};

/** @typedef {QualityOfLife.WIEntry} WIEntry */
/** @typedef {QualityOfLife.ScannedWIEntries} ScannedWIEntries */

/** @type {Array<WIEntry>} */
let activatedWiEntries = [];

/**
 * @param {WIEntry} entry
 * @returns {string}
 */
function getEntryIcon(entry) {
    let icon = '🟢';

    if (entry.constant) icon = '🔵';
    if (entry.vectorized) icon = '🔗';

    return icon;
}

function init() {
    eventSource.on(eventTypes.CHAT_CHANGED, function (args) {
        QualityOfLife.log(eventTypes.CHAT_CHANGED, args);
        hideRegenerateButton(false);
        zoomCharacterAvatar();
    });

    eventSource.on(eventTypes.GENERATION_STARTED, function (args) {
        QualityOfLife.log(eventTypes.GENERATION_STARTED, args);
        hideRegenerateButton();

        activatedWiEntries = [];
    });

    eventSource.on(eventTypes.USER_MESSAGE_RENDERED, function (args) {
        QualityOfLife.log(eventTypes.USER_MESSAGE_RENDERED, args);
        hideRegenerateButton(false);
        zoomCharacterAvatar();
        simpleUserInput();
    });

    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, function (args) {
        QualityOfLife.log(eventTypes.CHARACTER_MESSAGE_RENDERED, args);
        hideRegenerateButton(false);
        zoomCharacterAvatar();
    });

    eventSource.on(eventTypes.MESSAGE_SWIPED, function (args) {
        QualityOfLife.log(eventTypes.MESSAGE_SWIPED, args);
        hideRegenerateButton(false);
    });

    eventSource.on(eventTypes.MESSAGE_DELETED, function (args) {
        QualityOfLife.log(eventTypes.MESSAGE_DELETED, args);
        zoomCharacterAvatar();
    });

    eventSource.on(eventTypes.GENERATION_STOPPED, function (args) {
        QualityOfLife.log(eventTypes.GENERATION_STOPPED, args);
        hideRegenerateButton(false);
    });

    eventSource.on(eventTypes.GENERATION_ENDED, function (args) {
        QualityOfLife.log(eventTypes.GENERATION_ENDED, args);
        hideRegenerateButton(false);
    });

    eventSource.on(eventTypes.MESSAGE_EDITED, function () {
        QualityOfLife.log(eventTypes.MESSAGE_EDITED);
        zoomCharacterAvatar();
    });

    eventSource.makeFirst(eventTypes.GENERATE_AFTER_DATA, function (arg) {
        if (!extensionSettings.enabled) return;

        QualityOfLife.log(eventTypes.GENERATE_AFTER_DATA, arg);

        const doCollapseNewlines = context().powerUserSettings.collapse_newlines && extensionSettings.features.collapseNewlines;
        const doAddCustomSamplers = extensionSettings.customSamplers && Object.keys(extensionSettings.customSamplers).length > 0;

        if (doCollapseNewlines) {
            if (Array.isArray(arg.prompt)) {
                for (const item of arg.prompt) {
                    if (typeof item.content !== 'string') continue;

                    item.content = item.content.replaceAll(/\n+/g, '\n');
                }
            } else if (typeof arg.prompt === 'string') {
                arg.prompt = arg.prompt.replaceAll(/\n+/g, '\n');
            }
        }

        if (doAddCustomSamplers) {
            for (const [key, value] of Object.entries(extensionSettings.customSamplers)) {
                arg[key] = value;
            }
        }
    });

    eventSource.makeFirst(eventTypes.CHAT_COMPLETION_SETTINGS_READY, function (arg) {
        if (!extensionSettings.enabled) return;

        QualityOfLife.log(eventTypes.CHAT_COMPLETION_SETTINGS_READY, arg);

        const doAddCustomSamplers = extensionSettings.customSamplers && Object.keys(extensionSettings.customSamplers).length > 0;

        if (doAddCustomSamplers) {
            const cleanSamplers = lodash.cloneDeep(extensionSettings.customSamplers);
            const otherSamplers = {};

            for (const key of Object.keys(arg ?? {})) {
                if (cleanSamplers[key] !== undefined)
                    otherSamplers[key] = structuredClone(cleanSamplers[key]);

                delete cleanSamplers[key];
            }

            QualityOfLife.log('Custom OAI compatible samplers OBJ', { otherSamplers, cleanSamplers });

            Object.assign(arg, otherSamplers);

            if (Object.keys(cleanSamplers).length) {
                const customSamplers = yaml.parse(arg?.custom_include_body || '{}');
                const mergedCustomSamplers = Object.assign({}, customSamplers, cleanSamplers);
                const yamlCustomSamplers = yaml.stringify(mergedCustomSamplers);

                QualityOfLife.log('Custom OAI compatible samplers YAML', { customSamplers, cleanSamplers, mergedCustomSamplers, yamlCustomSamplers });

                arg.custom_include_body = yamlCustomSamplers;
            }
        }
    });

    eventSource.on(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, async function (args) {
        QualityOfLife.log(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, args);

        if (!extensionSettings.enabled || !extensionSettings.features.showActivatedWiEntries) return;

        const loreEntriesList = await HTML_TEMPLATES.get('activatedLoreEntries', {clone: true});
        const loreEntryGroupTemplate = $(loreEntriesList).find('.qol-activated-world.template');
        const loreEntryItemTemplate = $(loreEntriesList).find('.qol-activated-entry.template');
        const currentList = $('#qol-activated-worlds-list');

        if (currentList.length) currentList.empty();

        /**
         * @typedef {JQuery<HTMLElement>} EntryGroup
         */

        /** @type {Object} */
        const entriesGroupedByWorld = {};

        activatedWiEntries.sort((a, b) => {
            const worldCompare = a.world.localeCompare(b.world);
            if (worldCompare !== 0) return worldCompare;
            const ai = (a.displayIndex ?? 0);
            const bi = (b.displayIndex ?? 0);
            return ai - bi;
        });

        for (const entry of activatedWiEntries) {
            const worldID = entry.world.toLowerCase().replace(/\s+/g, '_');

            /** @type {EntryGroup} */
            let entryGroup = entriesGroupedByWorld[worldID] ?? false;

            if (!entryGroup) {
                entriesGroupedByWorld[worldID] = loreEntryGroupTemplate.clone().toggleClass('d-none', false).toggleClass('template', false);
                entriesGroupedByWorld[worldID].find('.qol-activated-world-name').html(lodash.escape(entry.world));

                entryGroup = entriesGroupedByWorld[worldID];
            }

            const entryItem = loreEntryItemTemplate.clone().toggleClass('d-none', false).toggleClass('template', false);

            entryItem.find('.qol-activated-entry-icon').text(lodash.escape(getEntryIcon(entry)));
            entryItem.find('.qol-activated-entry-comment').html(lodash.escape(entry.comment));
            entryItem.find('.qol-activated-entry-comment').prop('title', entry.comment);

            entryGroup.find('.qol-activated-world-entries').append(entryItem);
        }

        /** @type {Array<EntryGroup>} */
        const entryGroups = Object.values(entriesGroupedByWorld);

        for (const entryGroup of entryGroups)
            loreEntriesList.find('#qol-activated-worlds-list').append(entryGroup);

        loreEntriesList.find('.qol-activated-entry').last().toggleClass('separator-bottom', false);

        if (currentList.length) {
            const newList = loreEntriesList
                .find('#qol-activated-worlds-list')
                .children();

                currentList.append(newList);
        } else {
            $('#ai_response_configuration').before(loreEntriesList);
        }
    });

    eventSource.on(eventTypes.WORLDINFO_SCAN_DONE, function (/** @type {ScannedWIEntries} */ args) {
        QualityOfLife.log(eventTypes.WORLDINFO_SCAN_DONE, args);

        if (!extensionSettings.enabled || !extensionSettings.features.showActivatedWiEntries) return;
        if (args?.new?.successful) activatedWiEntries.push(...args.new.successful);
    });
}