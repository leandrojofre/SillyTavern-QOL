import { getUserAvatar } from '../../../personas.js';
import { formatCharacterAvatar, isGenerating } from '../../../../script.js';
import { group_activation_strategy } from '../../../group-chats.js';
import { copyText } from '../../../utils.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';

import { ExternalExtension } from './source/classes/ExternalExtension.js';
import { AIHorde } from './source/classes/AIHorde.js';
import * as eventSources from './source/js/eventSources.js';
import * as slashCommands from './source/js/slashCommands.js';

/** @typedef {QualityOfLife.ExtensionSettings} ExtensionSettings */
/** @typedef {QualityOfLife.HTMLTemplateGetOptions} HTMLTemplateGetOptions */
/** @typedef {QualityOfLife.UserCharacter} UserCharacter */

export {
    // Native
    extensionSettings,
    extensionNameFull,
    HTML_TEMPLATES,
    hideRegenerateButton,
    zoomCharacterAvatar,
    simpleUserInput,
    context,
    // ST Imports
    callGenericPopup,
    t,
    POPUP_TYPE,
    eventSource,
    eventTypes,
    lodash,
    yaml,
    saveSettingsDebounced,
    tags,
    commonEnumProviders,
    ARGUMENT_TYPE,
    SlashCommand,
    SlashCommandParser,
    SlashCommandArgument,
    SlashCommandNamedArgument,
};

// * MARK:Extension variables

const context = () => SillyTavern.getContext();

const {
    stopGeneration,
    getThumbnailUrl,
    isMobile,
    callGenericPopup,
    POPUP_TYPE,
    saveSettingsDebounced,
    extensionSettings: extension_settings,
    eventSource,
    eventTypes,
    chat,
    groups,
    groupId,
    characterId,
    characters,
    powerUserSettings,
    tags,
    SlashCommand,
    SlashCommandParser,
    SlashCommandArgument,
    SlashCommandNamedArgument,
    ARGUMENT_TYPE,
    t
} = context();

const {
    lodash,
    yaml,
} = SillyTavern.libs;

const extensionName = 'Quality of Life';
const extensionNameFull = 'SillyTavern-QOL';
const extensionFolderPath = `scripts/extensions/third-party/${extensionNameFull}`;

/** @type {ExtensionSettings} */
const extensionSettings = extension_settings[extensionNameFull];

/** @type {ExtensionSettings} */
const defaultSettings = {
    enabled: true,
    soundVolume: 1,
    features: {
        quickRegenerate: true,
        quickRegenerateAutoHide: false,
        playErrorSound: true,
        zoomCharacterAvatar: true,
        zoomedAvatarInLeftPanel: false,
        simpleUserInput: false,
        showActivatedWiEntries: true,
        collapseNewlines: false,
        preventPageNavigation: false,
        guessAvatarFromContent: false,
    },
    customSamplers: {},
    debug: false,
};

const rootCSSVars = {
    zoomedAvatarDisplay: '--qol-zoomed-avatar-container-display',
    zoomedAvatarDisplayST: '--qol-st-zoomed-avatar-container-display',
}

const originalConsoleLog = console.log;
const originalToastrError = toastr.error;

const audioGenerationError = new Audio();
audioGenerationError.src = `${extensionFolderPath}/assets/audio/error-sound.mp3`;

let preventNextAbortSound = false;

const HTML_TEMPLATES = {
	/**
     * @param {string} [fileName]
     * @param {HTMLTemplateGetOptions} [options]
     * @returns {Promise<JQuery<HTMLElement>>}
     */
    get: async function(fileName = 'settings', {clone = false} = {}) {
		const extensionFolderPath = HTML_TEMPLATES.extensionFolderPath;

		if (!HTML_TEMPLATES[fileName]) {
			try {
				await $.get(`${extensionFolderPath}/source/templates/${fileName}.html`)
					.done(function(response) {
						HTML_TEMPLATES[fileName] = $(response);
					})
			} catch (err) {
				const is404 = err?.status === 404;

				error('Template rendering error.', {err});

				if (is404 && !HTML_TEMPLATES.didFallbackFetch) {
					HTML_TEMPLATES.extensionFolderPath = `${HTML_TEMPLATES.extensionFolderPath}.git`;
					HTML_TEMPLATES.didFallbackFetch = true;

					error(`Failed to fetch ${fileName}.html, attempting fallback path...`, {err, HTML_TEMPLATES: structuredClone({
						extensionFolderPath: HTML_TEMPLATES.extensionFolderPath,
						didFallbackFetch: HTML_TEMPLATES.didFallbackFetch,
					})});

					return await HTML_TEMPLATES.get(fileName, {clone});
				}
			}
        }

        const $file = HTML_TEMPLATES[fileName];

        if (!$file) {
            toastr.warning(t`HTML template ${fileName} could not be loaded`, extensionName);
            return $();
        }

		return clone ? $file.clone() : $file;
    },
	didFallbackFetch: false,
	extensionFolderPath,
};

// * MARK:Debugs methods

function log(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.log(`[${extensionName}]`, ...mess);
}

function debug(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.debug(`[${extensionName}]`, ...mess);
}

function error(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.error(`[${extensionName}]`, ...mess);
}

// * MARK:Extension methods

/**
 * @param {keyof rootCSSVars} key
 * @param {string} [value]
 * @returns {void}
 */
function setRootCSSVariables(key, value = '') {
    if (!key) return;
    const variableName = rootCSSVars[key];
    document.documentElement.style.setProperty(variableName, value);
}

/**
 * Set user clipboard
 * @param {string} text
 * @returns {Promise<void>}
 */
async function setClipboard(text = '') {
    return await copyText(text);
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.allowMuted]
 * @returns {(Character|UserCharacter)[]}
 */
function getChatMembers({allowMuted = true} = {}) {
    const {characters, characterId, groupId, groups} = context();
    const group = groupId ? groups.find(g => g.id === groupId) : null;
    const disabled = group?.disabled_members || [];
    const statuses = QualityOfLife.getStatusAvatarMap({onlyEnabled: false}).values().map(s => ({
        ...s.getCharacter(),
        avatar: s.getThumbnail(),
    }));

    let members = group ? group.members.map(m => characters.find(c => c.avatar === m)) : [];

    if (!members.length && characterId) members.push(characters[characterId]);

    if (!allowMuted && disabled.length) return [
        ...members,
        ...statuses,
    ].filter(m => !disabled.some(d => d === m.avatar));

    return [...members, ...statuses];
}

/**
 * @param {string} search
 * @param {object} [options]
 * @param {boolean} [options.allowAvatar]
 * @param {(Character|UserCharacter)[]} [options.members]
 * @return {Character|UserCharacter}
 */
function findCharacter(search, {allowAvatar = true, members = []} = {}) {
    const {characters} = context();
    let character;

    if (!members.length)
        members = getChatMembers();

    search = String(search).trim();

    if (allowAvatar) character = members.find(m => m.avatar === search);
    if (allowAvatar && !character) character = characters.find(c => c.avatar === search);

    if (!character) character = members.find(m => m.name === search);
    if (!character) character = characters.find(c => c.name === search);

    return character;
}

/**
 * @param {ChatMessage} mess
 * @returns {Character|UserCharacter}
 */
function characterFromMessage(mess) {
    let char;

    if (mess.is_user) {
        char = Object.entries(powerUserSettings.personas)
            .map(([avatar, name]) => ({ name, avatar, is_user: true }))
            .find(p => p.name === mess.name);
    } else if (mess.force_avatar) {
        const url = new URL(mess.force_avatar, window.location.origin);
        const urlFile = url?.searchParams.get('file') ?? '';

        char = findCharacter(urlFile);
    }

    if (!char) char = findCharacter(mess.name);

    return char;
}

/**
 * @param {ChatMessage} mess
 */
function getCharacterThumbnailFromMess(mess) {
    const hasFallback = Boolean(mess?.force_avatar);
    let fallbackAvatar = '';
    let character;
    let avatar;
    let isUser;

    if (extensionSettings.features.guessAvatarFromContent && mess?.mes) {
        /** @type {{member: Character|UserCharacter; id: number;}} */
        let lastMember = {member: null, id: -1};
        const members = getChatMembers({allowMuted: false});

        for (const member of members) {
            const id = mess.mes.lastIndexOf(member.name);

            if (id > lastMember.id) lastMember = {id, member};
        }

        QualityOfLife.log({lastMember});

        if (lastMember.member) {
            character = lastMember.member;
            avatar = lastMember.member.avatar;
            isUser = false;
        }
    }

    if (!avatar && hasFallback) {
        const url = new URL(mess.force_avatar, window.location.origin);
        const urlType = url?.searchParams.get('type') ?? '';
        const urlFile = url?.searchParams.get('file') ?? '';

        isUser = urlType === 'persona';
        avatar = urlFile;
        fallbackAvatar = mess.force_avatar;
    }

    if (!avatar) {
        character = characterFromMessage(mess);
        avatar = character?.avatar || '';
        isUser = mess.is_user === true;
        fallbackAvatar = avatar ? getThumbnailUrl(isUser ? 'persona' : 'avatar', avatar) : '';
    }

    if (!avatar) return {
        char: null,
        avatar: '',
        fallbackAvatar: '',
    };

    if (!avatar.includes('/')) {
        avatar = isUser ? getUserAvatar(avatar) : formatCharacterAvatar(avatar);
    }

    return {
        char: character,
        avatar,
        fallbackAvatar
    };
}

/**
 * @param {string} var_name
 * @param {Object} [options]
 * @param {string} [options.def_value]
 * @returns {string}
 */
function getLocalStorageVar(var_name, { def_value = '' } = {}) {
    let value = localStorage.getItem(var_name);

    if (!value) {
        localStorage.setItem(var_name, def_value);
        value = def_value;
    }

    return value;
}

/**
 * Modifies a function to wrap it in a function that first executes a callback and THEN the original function.
 * @param {Function} [originalFunction] wrapMethod will not modify this method, it will only force it to execute extra code before its call.
 * @param {Function} [callback] Additional code to execute before the original method.
 * @returns Returns the original function, with the callback added.
 */
function wrapMethod(originalFunction, callback) {
    return function (...args) {
        callback(args);
        return originalFunction.apply(this, args);
    };
}

/**
 * @param {HTMLAudioElement} audio The audio will not play if it is already playing.
 */
function playAudio(audio) {
    if (audio.currentTime === 0 || audio.ended) {
        audio.currentTime = 0;
        audio.volume = extensionSettings.soundVolume;
        audio.play();
    }
}

/**
 * Hides the Continue button from the right side of the input area.
 * If the extension is disabled, 'hideRegenerateButton' will always hide the button.
 * @param {boolean} [hide=true] Whether or not to hide the retry button.
 */
function hideRegenerateButton(hide = true) {
    if (
        extensionSettings.enabled &&
        extensionSettings.features.quickRegenerateAutoHide
    )
        hide = false;

    if (
        !extensionSettings.enabled ||
        !extensionSettings.features.quickRegenerate ||
        hide
    )
        $('#regenerate_but').css({ 'display': 'none' });
    else $('#regenerate_but').css({ 'display': 'flex' });
}

/** If the chat is unlocked, 'regenerate' will be triggered. */
function triggerRegenerate() {
    if (!extensionSettings.enabled || !extensionSettings.features.quickRegenerate) return;
    if (isGenerating()) return log('GENERATION_LOCKED', 'isGenerating:', isGenerating());

    const $option_regenerate = document.getElementById('option_regenerate');
    $option_regenerate.click();
    hideRegenerateButton();
    log('triggerRegenerate()');
}

/** Zooms in on the avatar of the character who is speaking. */
function zoomCharacterAvatar() {
    if (!extensionSettings.enabled ||
        !extensionSettings.features.zoomCharacterAvatar ||
        !context().chatId
    ) return setRootCSSVariables('zoomedAvatarDisplay', 'none');

    if (!chat?.length) return setRootCSSVariables('zoomedAvatarDisplay', 'none');

    const lastMes = chat[chat.length - 1];
    const { char, avatar, fallbackAvatar } = getCharacterThumbnailFromMess(lastMes);

    if (!avatar) return setRootCSSVariables('zoomedAvatarDisplay', 'none');

    QualityOfLife.lastZoomedCharacter = char?.name || '';

    const localStorageVisibility = getLocalStorageVar('qol-zoomed-avatar-display', {
        def_value: extensionSettings.features.zoomCharacterAvatar ? 'flex' : 'none',
    });

    setRootCSSVariables('zoomedAvatarDisplay', localStorageVisibility);
    $('#qol-zoomed-avatar-image').data('fallback-img', fallbackAvatar);
    $('#qol-zoomed-avatar-image').prop('src', `${avatar}?cb=${Date.now()}`);
    $('#qol-zoomed-avatar-image').prop('alt', char?.name ?? '');
}

/** Automatically cancels the generation of a message after user input */
function simpleUserInput() {
    if (!extensionSettings.enabled ||
        !extensionSettings.features.simpleUserInput
    ) return;

    const group = groups.find((x) => x.id === context().groupId);

    if (
        isGenerating() &&
        group.activation_strategy === group_activation_strategy.MANUAL
    )
        return log('group_activation_strategy', group_activation_strategy.MANUAL);

    preventNextAbortSound = true;
    stopGeneration();
    log('simpleUserInput(): preventNextAbortSound ', preventNextAbortSound);
}

function enableBackProtection() {
    history.pushState({ guard: true }, '', location.href);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
}

function disableBackProtection() {
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('beforeunload', onBeforeUnload);
    history.replaceState(null, '', location.href);
}

function onPopState(e) {
    if (e.state && e.state.guard) {
        history.pushState({ guard: true }, '', location.href);
        disableBackProtection();
        history.back();
    }
}

function onBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '';
}

/** Creates and insert any button provided by the extension. */
async function loadQOLFeatures() {
    const { macros } = context();

    const $rightSendForm = document.getElementById('rightSendForm');
    const $send_but = document.getElementById('send_but');

    const $regenerate_but = document.createElement('div');
    $regenerate_but.id = 'regenerate_but';
    $regenerate_but.title = 'Retry last message';
    $regenerate_but.classList.add('fa-solid', 'fa-repeat', 'interactable');

    $rightSendForm.insertBefore($regenerate_but, $send_but);
    $('#regenerate_but').on('click', triggerRegenerate);

    hideRegenerateButton(!extensionSettings.features.quickRegenerate);

    // Auto zoom last message Avatar

    const zoomedAvatar = await HTML_TEMPLATES.get('zoomedAvatar');

    $('#sheld').append(zoomedAvatar);
    $('#qol-zoomed-avatar-refresh').on('click', zoomCharacterAvatar);

    $('#qol-zoomed-avatar-image').on('error', function () {
        log('Error - Avatar could not load, using thumbnail');

        const src = $(this).attr('src');
        const fallback = $(this).data('fallback-img');

        if (src === fallback) return log('Error - Thumbnail could not load');

        $(this).prop('src', fallback);
    });

    setRootCSSVariables('zoomedAvatarDisplay', getLocalStorageVar('qol-zoomed-avatar-display', {
        def_value: extensionSettings.features.zoomCharacterAvatar ? 'flex' : 'none',
    }));

    $('#qol-zoomed-avatar-close').on('click', function () {
        localStorage.setItem('qol-zoomed-avatar-display', 'none');
        setRootCSSVariables('zoomedAvatarDisplay', 'none');
    });

    $('#chat').on('click', '.mes .avatar', function () {
        if (!extensionSettings.enabled || !extensionSettings.features.zoomCharacterAvatar) return;
        localStorage.setItem('qol-zoomed-avatar-display', 'flex');
        setRootCSSVariables('zoomedAvatarDisplay', 'flex');
    });

    zoomCharacterAvatar();

    // Custom Request Samplers

    $(document).on('click', '#qol-custom-samplers-list .sampler-key', function (e) {
        const text = $(e.currentTarget)?.text() ?? '';

        setClipboard(text);
        toastr.info('Sampler key sent to the clipboard', extensionName);
    });

    // Show Request Information

    $(document).on('click', '#chat .mes_timer', function (e) {
        const tooltip = $(e.currentTarget).attr('title');

        if (tooltip) toastr.info(tooltip, extensionName, {toastClass: 'qol-tooltip-toast'});
    });

    macros.register('charLastZoomed', {
        category: macros.category.NAMES,
        description: 'Returns the name of the last character zoomed by Quality of Life.',
        returns: 'Character name',
        returnType: macros.valueType.STRING,
        handler() {
            return QualityOfLife.lastZoomedCharacter || '';
        },
    })
}

//  * MARK:Interface

/** @type {QualityOfLife.GlobalInterface} */
globalThis.QualityOfLife = {
    extensions: {},
    ext(key) {
        const exists = key in QualityOfLife.extensions;

        // @ts-ignore
        if (!exists) QualityOfLife.extensions[key] = new ExternalExtension(key);

        return QualityOfLife.extensions[key];
    },
    getStatusAvatarMap({onlyEnabled = true, onlyDetached = true} = {}) {
        const ext = QualityOfLife.ext('StatUsMaximus');

        if (!ext.enabled) return new Map();

        /** @type {Map<string, StatUsMaximus.Status>} */
        const avatarMap = new Map();
        const statuses = ext.call('getStatuses') || [];

        for (const s of statuses) {
            if (onlyEnabled && !s.enabled) continue;
            if (onlyDetached && !s.is_detached) continue;

            avatarMap.set(s.avatar, s);
        }

        return avatarMap;
    },
	log,
	debug,
	error,
    AIHorde: new AIHorde(),
    extensionName,
    lastZoomedCharacter: '',
};

// * MARK:Extension settings

const settingsCallbacks = {
    /** Enables/Disables the extension */
    enabled: () => {
        settingsCallbacks.quickRegenerate(!$('#qol-activate-extension').prop('checked'));
        settingsCallbacks.zoomCharacterAvatar(!$('#qol-activate-extension').prop('checked'));
    },

    /** Enables/Disables the quick regenerate button.
     * @param {boolean} [forceUnable=false] If true, forces features.quickRegenerate to be disabled.
     */
    quickRegenerate: function (forceUnable = false) {
        hideRegenerateButton(forceUnable || !extensionSettings.features.quickRegenerate);
    },

    /** Enable/Disable the message generation error sound. */
    playErrorSound: function () {
        if (
            !extensionSettings.enabled ||
            !extensionSettings.features.playErrorSound
        ) {
            toastr.error = originalToastrError;
            console.log = originalConsoleLog;
            return;
        }

        // @ts-ignore
        toastr.error = wrapMethod(toastr.error, (args) => playAudio(audioGenerationError));

        console.log = wrapMethod(console.log, (args) => {
            for (const arg of args) {
                if (!arg?.name?.includes('Error')) continue;
                if (arg.message?.includes('Request aborted') && preventNextAbortSound)
                    return preventNextAbortSound = false;
                if (
                    arg.message?.includes('Request aborted') ||
                    arg.message?.includes('Failed to get task status') ||
                    arg.message?.includes('Horde generation failed')
                )
                    playAudio(audioGenerationError);
            }
        });
    },

    /** Enables/Disables the zoom in avatar feature.
     * @param {boolean} [forceUnable=false] If true, forces features.zoomCharacterAvatar to be disabled.
     */
    zoomCharacterAvatar: function (forceUnable = false) {
        const enableFeature = !forceUnable && extensionSettings.features.zoomCharacterAvatar;

        setRootCSSVariables('zoomedAvatarDisplay', enableFeature ? 'flex' : 'none');
        setRootCSSVariables('zoomedAvatarDisplayST', enableFeature ? 'none' : 'flex');

        if (enableFeature) zoomCharacterAvatar();
    },

    zoomedAvatarInLeftPanel: async function () {
        const zoomedAvatar = await HTML_TEMPLATES.get('zoomedAvatar');
        const moveToLeftPanel = extensionSettings.features.zoomedAvatarInLeftPanel;

        if (moveToLeftPanel) $('#left-nav-panel .scrollableInner').prepend(zoomedAvatar.detach());
        else $('#sheld').append(zoomedAvatar.detach());
    },

    showActivatedWiEntries: function () {
        const state = extensionSettings.features.showActivatedWiEntries;

        if (!state) $('#qol-display-active-entries').remove();
    },

    preventPageNavigation: function () {
        extensionSettings.features.preventPageNavigation && isMobile() ?
            enableBackProtection() :
            disableBackProtection();
    },
};

/**
 * @param {JQuery|HTMLElement} element
 * @returns {{callback: Function; setting: string; isFeature: boolean}}
 */
function getSettingInputCallback(element) {
    const $target = $(element);
    const settingRaw = $target.attr(`qol-setting`);
    const setting = settingRaw.replace('features/', '');
    const isFeature = settingRaw.startsWith('features/');
    const callback = settingsCallbacks[setting];

    return {callback, setting, isFeature};
}

/** Changes a setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const $target = $(event.target);
    const {callback, setting, isFeature} = getSettingInputCallback($target);
    const value = Boolean($target.prop('checked'));

    if (isFeature) extensionSettings.features[setting] = value;
    else extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a string setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsTextButton(event) {
    const $target = $(event.target);
    const {callback, setting, isFeature} = getSettingInputCallback($target);
    const value = String($target.val());
    const pattern = String($target.attr('pattern') || '');

    if (pattern) {
        const regex = new RegExp(pattern);
        const isValid = regex.test(value);

        if (!isValid) return;
    }

    if (isFeature) extensionSettings.features[setting] = value;
    else extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a number setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsNumberButton(event) {
    const target = /** @type {HTMLSelectElement} */(event.target);
    const {callback, setting, isFeature} = getSettingInputCallback(target);

    const defValue = isFeature ? defaultSettings.features[setting] : defaultSettings[setting];
    const raw_value = isNaN(Number(target.value)) ? defValue : Number(target.value);
    const min = Number(target.getAttribute('min') || raw_value);
    const max = Number(target.getAttribute('max') || raw_value);

    const insideMinBoundary = min <= raw_value;
    const insideMaxBoundary = max >= raw_value;

    let value = raw_value;

    if (!insideMinBoundary) value = min;
    if (!insideMaxBoundary) value = max;

    if (isFeature) extensionSettings.features[setting] = value;
    else extensionSettings[setting] = value;

    if (callback) callback();

    $(target).val(value);
    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

async function loadSettingsMenu() {
    const settingsHtml = await HTML_TEMPLATES.get('settings');

    $('#extensions_settings').append(settingsHtml);

    // Event Listeners for the extension HTML
    $('#qol-check-configuration').on('click', displaySettings);

    $('#qol-activate-extension').on('input', settingsBooleanButton);
    $('#qol-simple-user-input').on('input', settingsBooleanButton);
    $('#qol-simple-collapse-newlines').on('input', settingsBooleanButton);
    $('#qol-show-activated-wi-entries').on('input', settingsBooleanButton);
    $('#qol-prevent-page-navigation').on('input', settingsBooleanButton);

    $('#qol-zoom-char-avatar').on('input', settingsBooleanButton);
    $('#qol-zoom-zoomed-avatar-in-left-panel').on('input', settingsBooleanButton);
    $('#qol-zoom-char-avatar-guess-avatar-from-content').on('input', settingsBooleanButton);

    $('#qol-quick-retry').on('input', settingsBooleanButton);
    $('#qol-quick-retry-autohide').on('input', settingsBooleanButton);

    $('#qol-sound-volume').on('mouseup', settingsNumberButton);
    $('#qol-activate-error-sound').on('input', settingsBooleanButton);

    $('#qol-activate-debug').on('input', settingsBooleanButton);

    log('loadHTMLSettings');

    $('#qol-activate-extension').prop('checked', extensionSettings.enabled).trigger('input');
    $('#qol-simple-user-input').prop('checked', extensionSettings.features.simpleUserInput).trigger('input');
    $('#qol-simple-collapse-newlines').prop('checked', extensionSettings.features.collapseNewlines).trigger('input');
    $('#qol-show-activated-wi-entries').prop('checked', extensionSettings.features.showActivatedWiEntries).trigger('input');
    $('#qol-prevent-page-navigation').prop('checked', extensionSettings.features.preventPageNavigation).trigger('input');

    $('#qol-zoom-char-avatar').prop('checked', extensionSettings.features.zoomCharacterAvatar).trigger('input');
    $('#qol-zoom-zoomed-avatar-in-left-panel').prop('checked', extensionSettings.features.zoomedAvatarInLeftPanel).trigger('input');
    $('#qol-zoom-char-avatar-guess-avatar-from-content').prop('checked', extensionSettings.features.guessAvatarFromContent).trigger('input');

    $('#qol-quick-retry').prop('checked', extensionSettings.features.quickRegenerate).trigger('input');
    $('#qol-quick-retry-autohide').prop('checked', extensionSettings.features.quickRegenerateAutoHide).trigger('input');

    $('#qol-sound-volume').prop('value', extensionSettings.soundVolume).trigger('mouseup');
    $('#qol-activate-error-sound').prop('checked', extensionSettings.features.playErrorSound).trigger('input');

    $('#qol-activate-debug').prop('checked', extensionSettings.debug).trigger('input');

    log('setSettings', extensionSettings);
}

/**    Logs setting's values. */
function displaySettings() {
    log(`The extension is ${extensionSettings.enabled ? 'active' : 'not active'}`);
    log(`Quick regenerate is ${extensionSettings.features.quickRegenerate ? 'active' : 'not active'}`);
    log(`Auto hide quick regenerate button is ${extensionSettings.features.quickRegenerateAutoHide ? 'active' : 'not active'}`);
    log(`Zoom char avatar is ${extensionSettings.features.zoomCharacterAvatar ? 'active' : 'not active'}`);
    log(`Simple user input is ${extensionSettings.features.simpleUserInput ? 'active' : 'not active'}`);
    log(`Collapse newlines is ${extensionSettings.features.collapseNewlines ? 'active' : 'not active'}`);
    log(`Show activated WI entries is ${extensionSettings.features.showActivatedWiEntries ? 'active' : 'not active'}`);
    log(`Extension volume is ${extensionSettings.soundVolume}`);
    log(`Play error sound is ${extensionSettings.features.playErrorSound ? 'active' : 'not active'}`);
    log(`Debug mode is ${extensionSettings.debug ? 'active' : 'not active'}`);
    log(extensionSettings);
}

// * MARK:Initialize Extension

eventSource.once(eventTypes.APP_INITIALIZED, async function () {
    if (!context().extensionSettings[extensionNameFull]) {
        context().extensionSettings[extensionNameFull] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (context().extensionSettings[extensionNameFull][key] === undefined) {
            context().extensionSettings[extensionNameFull][key] = defaultSettings[key];
        }
    }

    for (const key of Object.keys(defaultSettings.features)) {
        if (context().extensionSettings[extensionNameFull].features[key] === undefined) {
            context().extensionSettings[extensionNameFull].features[key] = defaultSettings.features[key];
        }
    }

    await loadQOLFeatures();
    await loadSettingsMenu();

    eventSources.init();
    slashCommands.init();
    slashCommands.updateCustomSamplersList();

    await QualityOfLife.AIHorde.init();
});
