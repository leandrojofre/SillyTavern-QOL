import {
    // Native
    extensionSettings,
    HTML_TEMPLATES,
    extensionName,
    // ST Imports
    lodash,
    saveSettingsDebounced,
    tags,
    commonEnumProviders,
    ARGUMENT_TYPE,
    SlashCommand,
    SlashCommandParser,
    SlashCommandEnumValue,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from '../../index.js';

export {
    init,
    updateCustomSamplersList,
};

/**
 * @param {string} message
 * @returns {string}
 */
function slashCommandError(message = '') {
    toastr.error(message, extensionName);
    QualityOfLife.error('SlashCommandError:', message);
    return '';
}

async function updateCustomSamplersList() {
    const $samplerRowTemplate = await HTML_TEMPLATES.get('customSamplerRow', {clone: true});
    const $samplerList = $('#qol-custom-samplers-list');

    $samplerList.empty();

    for (const [key, value] of Object.entries(extensionSettings.customSamplers)) {
        const isNullish = lodash.isNull(value) || lodash.isUndefined(value);
        const hasEntries = (Array.isArray(value) || typeof value === 'object') && !isNullish;

        const $row = $samplerRowTemplate
            .clone()
            .find(hasEntries ? '.list-dictionary-row' : '.general-row');

        QualityOfLife.log('Check samplers display', { hasEntries, $samplerList, $samplerRowTemplate, $row });

        $row.find('.sampler-key').text(key);

        if (hasEntries) {
            const entries = Object.entries(value);

            for (const [index, entry] of entries) {
                const $prop = $row
                    .find('.prop-template')
                    .clone()
                    .toggleClass('d-none', false)
                    .toggleClass('prop-template', false);

                $prop.find('.prop-key').text(index);
                $prop.find('.prop-value').text(JSON.stringify(entry));

                $row.find('.sampler-value').append($prop);
            }
        } else {
            $row.find('.sampler-value').text(JSON.stringify(value));
        }

        $samplerList.append($row);
    }
}

/**
 * @param {Object} namedArgs
 * @param {string} unnamedArg
 * @returns {string}
 */
function addCustomSamplerCommand(namedArgs, unnamedArg = '') {
    const { key = '' } = namedArgs;

    if (unnamedArg === undefined || typeof unnamedArg !== 'string')
        return slashCommandError('Value is required.');

    let value;

    try {
        value = JSON.parse(unnamedArg);
    } catch (error) {
        return slashCommandError('Value must be JSON compatible.');
    }

    if (!key) return slashCommandError('Key is required.');

    try {
        JSON.stringify({ [String(key)]: value });
    } catch (e) {
        return slashCommandError('Key must be JSON compatible.');
    }

    QualityOfLife.log('Adding custom sampler:', { key, value });

    extensionSettings.customSamplers[String(key)] = value;
    updateCustomSamplersList();
    saveSettingsDebounced();

    return '';
}

/**
 * @param {Object} namedArgs
 * @param {string} unnamedArg
 * @returns {string}
 */
function getCustomSamplerCommand(namedArgs, unnamedArg = '') {
    const { key = '' } = namedArgs;

    if (!key) return slashCommandError('Key is required.');

    try {
        JSON.stringify({ [String(key)]: 'value' });
    } catch (e) {
        return slashCommandError('Key must be JSON compatible.');
    }

    const value = extensionSettings.customSamplers[String(key)];

    QualityOfLife.log('Getting custom sampler:', { key, value });

    try {
        return JSON.stringify(value === undefined ? null : value);
    } catch (error) {
        return slashCommandError('Unexpected error, the value couldn\'t be converted into a string.');
    }
}

/**
 * @param {Object} namedArgs
 * @param {string} unnamedArg
 * @returns {string}
 */
function delCustomSamplerCommand(namedArgs, unnamedArg = '') {
    const { key = '' } = namedArgs;

    if (!key) return slashCommandError('Key is required.');

    try {
        JSON.stringify({ [String(key)]: 'value' });
    } catch (e) {
        return slashCommandError('Key must be JSON compatible.');
    }

    const valueExists = extensionSettings.customSamplers[String(key)] !== undefined;

    if (valueExists) {
        delete extensionSettings.customSamplers[String(key)];
        updateCustomSamplersList();
        saveSettingsDebounced();
    }

    return '';
}

function flushCustomSamplersCommand() {
    extensionSettings.customSamplers = {};
    updateCustomSamplersList();
    saveSettingsDebounced();
    return '';
}

// MARK:init

function init() {
    const tagFilterBoxes = [{
        selector: '#unaddedCharList .rm_tag_filter',
        enum: new SlashCommandEnumValue('add-member-list', 'List for adding group members', 'enum')
    }, {
        selector: '#currentGroupMembers .rm_tag_filter',
        enum: new SlashCommandEnumValue('member-list', 'List for adding group members', 'enum')
    }, {
        selector: '#charListFixedTop .rm_tag_filter',
        enum: new SlashCommandEnumValue('character-list', 'List for adding group members', 'enum')
    }];

    const ENUMS_PROVIDER = {
        customSamplersSet: () => Object
            .keys(extensionSettings.customSamplers ?? {})
            .map(key => new SlashCommandEnumValue(key)),

        tagFilterBoxes: tagFilterBoxes.map(filter => filter.enum),
    };

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'qol-add-custom-sampler',
            callback: addCustomSamplerCommand,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'Key of the custom parameter to add to the generation request body. It must be JSON compatible.',
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: ENUMS_PROVIDER.customSamplersSet,
                    isRequired: true,
                }),
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Value of the custom sampler parameter. It must be JSON compatible.',
                    isRequired: true,
                    typeList: [
                        ARGUMENT_TYPE.STRING,
                        ARGUMENT_TYPE.NUMBER,
                        ARGUMENT_TYPE.BOOLEAN,
                        ARGUMENT_TYPE.LIST,
                        ARGUMENT_TYPE.DICTIONARY,
                        'null',
                    ],
                }),
            ],
            helpString: `
            <div>
                Adds a custom parameter to the body of your generation requests. WARNING: Make sure your provider/s support the custom parameters you are adding, or at least don't bounce requests with extra parameters, otherwise your generation requests may fail. If a sampler set with this command matches a sampler set by SillyTavern, it will replace it for that generation.
            </div>

            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/qol-add-custom-sampler key="bad_words" ["User:"]</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-add-custom-sampler key="guided_regex" /[A-z0-9 _]/</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-add-custom-sampler key="model" My_Custom_Model_Name</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'qol-get-custom-sampler',
            callback: getCustomSamplerCommand,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'Key of the custom parameter to add to the generation request body. It must be JSON compatible.',
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: ENUMS_PROVIDER.customSamplersSet,
                    isRequired: true,
                }),
            ],
            returns: 'Value of the sampler',
            helpString: `
            <div>
                Fetches the value of a custom parameter set with <code>/qol-add-custom-sampler</code>. It returns <code>null</code> if the sampler doesn't exist.
            </div>

            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/qol-get-custom-sampler key="bad_words"</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-get-custom-sampler key="guided_regex"</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-get-custom-sampler key="model"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'qol-del-custom-sampler',
            callback: delCustomSamplerCommand,
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'Key of the custom parameter to delete. It must be JSON compatible.',
                    typeList: [ARGUMENT_TYPE.STRING],
                    enumProvider: ENUMS_PROVIDER.customSamplersSet,
                    isRequired: true,
                }),
            ],
            returns: 'Value of the sampler',
            helpString: `
            <div>
                Deletes a custom parameter set with <code>/qol-add-custom-sampler</code>.
            </div>

            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/qol-del-custom-sampler key="bad_words"</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-del-custom-sampler key="guided_regex"</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-del-custom-sampler key="model"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'qol-flush-custom-samplers',
            callback: flushCustomSamplersCommand,
            helpString: `
            <div>
                Deletes all custom request parameters set with <code>/qol-add-custom-sampler</code>.
            </div>

            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/qol-flush-custom-samplers</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'qol-set-tag-filter',
            callback: function(args, tag) {
                const { filter = 'add-member-list' } = args;
                const tagObj = tags.find(t => t.id === tag) ?? tags.find(t => t.name === tag);

                if (!tagObj?.id) return '';

                const filterBoxFind = tagFilterBoxes.find(filterBox => filterBox.enum.value === filter)?.selector;
                const filterSelector = filterBoxFind ?? tagFilterBoxes[0].selector;
                const tagSelector = `${filterSelector} #${tagObj.id}`;

                $(tagSelector)
                    .attr('data-toggle-state', 'UNDEFINED')
                    .trigger('click');

                return tagObj.id;
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'filter',
                    description: 'The target box to apply the filter - <code>add-member-list</code> by default',
                    enumList: ENUMS_PROVIDER.tagFilterBoxes,
                })
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Name (or ID) of the tag to apply for the selected tag filter.',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: commonEnumProviders.tags(),
                }),
            ],
            returns: 'void',
            helpString: `
            <div>
                Adds a tag for the selected list filter. By default, the list to add group members on groups is targeted.
            </div>

            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/qol-set-tag-filter Hunter</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-set-tag-filter filter=character-list Hunter</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'qol-flush-tag-filter',
            callback: function (args) {
                const { filter = 'add-member-list' } = args;

                const filterBoxFind = tagFilterBoxes.find(filterBox => filterBox.enum.value === filter)?.selector;
                const filterSelector = filterBoxFind ?? tagFilterBoxes[0].selector;

                $(`${filterSelector} .tag.clearAllFilters`).trigger('click');
                return '';
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'filter',
                    description: 'The target box to apply the filter - <code>add-member-list</code> by default',
                    enumList: ENUMS_PROVIDER.tagFilterBoxes,
                })
            ],
            helpString: `
            <div>
                Clears all tag filters for the selected list. By default, the list to add group members on groups is targeted.
            </div>

            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/qol-flush-tag-filter</code></pre>
                    </li>
                    <li>
                        <pre><code>/qol-flush-tag-filter filter=character-list Hunter</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );
}