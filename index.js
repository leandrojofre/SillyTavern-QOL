import { getUserAvatar } from "../../../personas.js";
import { formatCharacterAvatar, isGenerating } from "../../../../script.js";
import { group_activation_strategy } from '../../../group-chats.js';

/** @type {Function} */
toastr.error

/** @type {Function} */
toastr.warning

/** @type {Function} */
toastr.success

/** @type {Function} */
toastr.info

// declare type
/**
 * @typedef {object} WIEntry
 * @property {number} uid
 * @property {string} world
 * @property {string} comment
 * @property {string} content
 * @property {string} outletName
 * @property {number} displayIndex
 * @property {boolean} vectorized
 * @property {boolean} constant
 *
 * @typedef {object} ScannedWIEntries
 * @property {object} [activated]
 * @property {Map} [activated.entries]
 * @property {object} [new]
 * @property {Array<WIEntry>} [new.successful]
 */

// * MARK:Extension variables

const context = () => SillyTavern.getContext();
const {
    saveSettingsDebounced,
	extensionSettings: extension_settings,
	stopGeneration,
	eventSource,
	eventTypes,
	getThumbnailUrl,
	chat,
	groups,
	groupId,
	characterId,
	characters,
	powerUserSettings,
    t
} = context();

const {
	lodash
} = SillyTavern.libs;

const extensionName = "SillyTavern-QOL";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
	enabled: true,
	soundVolume: 1,
	features: {
		quickRegenerate: true,
		quickRegenerateAutoHide: false,
		playErrorSound: true,
		zoomCharacterAvatar: true,
		simpleUserInput: false,
		showActivatedWiEntries: true,
	},
	debug: false
};
const originalConsoleLog = console.log;
const originalToastrError = toastr.error;
const audioGenerationError = new Audio();
audioGenerationError.src = `${extensionFolderPath}/assets/audio/error-sound.mp3`;

let preventNextAbortSound = false;

const HTML_TEMPLATES = {
	/** @returns {Promise<JQuery<HTMLElement>>} */
    get: async function(fileName = "settings") {
		const file = HTML_TEMPLATES[fileName] ?? await $.get(`${extensionFolderPath}/html/templates/${fileName}.html`);

		if (!HTML_TEMPLATES[fileName]) HTML_TEMPLATES[fileName] = file;

		return $(file);
    }
};

// * MARK:Debugs methods

const log = (...msg) => {
	if (!extensionSettings.debug) return;
	console.log("[" + extensionName + "]", ...msg);
};

// * MARK:Extension settings

async function loadHTMLSettings() {
	const settingsHtml = await HTML_TEMPLATES.get("settings");

	$("#extensions_settings").append(settingsHtml);

	// Event Listeners for the extension HTML
	$("#qol-check-configuration").on("click", displaySettings);

	$("#qol-activate-extension").on("input", settingsBooleanButton);
	$("#qol-activate-zoom-char-avatar").on("input", settingsBooleanButton);
	$("#qol-activate-simple-user-input").on("input", settingsBooleanButton);
	$("#qol-show-activated-wi-entries").on("input", settingsBooleanButton);

	$("#qol-activate-quick-retry").on("input", settingsBooleanButton);
	$("#qol-activate-quick-retry-autohide").on("input", settingsBooleanButton);

	$("#qol-sound-volume").on("mouseup", settingsNumberButton);
	$("#qol-activate-error-sound").on("input", settingsBooleanButton);

	$("#qol-activate-debug").on("input", settingsBooleanButton);

	log("loadHTMLSettings");
}

function setSettings() {
	$("#qol-activate-extension").prop("checked", extensionSettings.enabled).trigger("input");
	$("#qol-activate-zoom-char-avatar").prop("checked", extensionSettings.features.zoomCharacterAvatar).trigger("input");
	$("#qol-activate-simple-user-input").prop("checked", extensionSettings.features.simpleUserInput).trigger("input");
	$("#qol-show-activated-wi-entries").prop("checked", extensionSettings.features.showActivatedWiEntries).trigger("input");

	$("#qol-activate-quick-retry").prop("checked", extensionSettings.features.quickRegenerate).trigger("input");
	$("#qol-activate-quick-retry-autohide").prop("checked", extensionSettings.features.quickRegenerateAutoHide).trigger("input");

	$("#qol-sound-volume").prop("value", extensionSettings.soundVolume).trigger("mouseup");
	$("#qol-activate-error-sound").prop("checked", extensionSettings.features.playErrorSound).trigger("input");

	$("#qol-activate-debug").prop("checked", extensionSettings.debug).trigger("input");

	log("setSettings", extensionSettings);
}

/**	Logs setting's values. */
function displaySettings() {
	log(`The extension is ${extensionSettings.enabled ? "active" : "not active"}`);
	log(`Quick regenerate is ${extensionSettings.features.quickRegenerate ? "active" : "not active"}`);
	log(`Auto hide quick regenerate button is ${extensionSettings.features.quickRegenerateAutoHide ? "active" : "not active"}`);
	log(`Zoom char avatar is ${extensionSettings.features.zoomCharacterAvatar ? "active" : "not active"}`);
	log(`Simple user input is ${extensionSettings.features.simpleUserInput ? "active" : "not active"}`);
	log(`Show activated WI entries is ${extensionSettings.features.showActivatedWiEntries ? "active" : "not active"}`);
	log(`Extension volume is ${extensionSettings.soundVolume}`);
	log(`Play error sound is ${extensionSettings.features.playErrorSound ? "active" : "not active"}`);
	log(`Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
	log(extensionSettings);
}

const settingsCallbacks = {
	/**	Enables/Disables the extension */
	enabled: () => {
		settingsCallbacks.quickRegenerate(!$("#qol-activate-extension").prop("checked"));
		settingsCallbacks.zoomCharacterAvatar(!$("#qol-activate-extension").prop("checked"));
	},

	/**	Enables/Disables the quick regenerate button.
		@param {Boolean} [forceUnable=false]
		forceUnable:
		- If true, forces features.quickRegenerate to be disabled.
	*/
	quickRegenerate: function (forceUnable = false) {
		hideRegenerateButton(forceUnable || !extensionSettings.features.quickRegenerate);
	},

	/**	Enable/Disable the message generation error sound. */
	playErrorSound: function () {
		if (
			!extensionSettings.enabled ||
			!extensionSettings.features.playErrorSound
		) {
			toastr.error = originalToastrError;
			console.log = originalConsoleLog;
			return;
		}

		toastr.error = wrapMethod(toastr.error, (args) =>
			playAudio(audioGenerationError)
		);

		console.log = wrapMethod(console.log, (args) => {
			for (const arg of args) {
				if (!arg?.name?.includes("Error")) continue;
				if (arg.message?.includes("Request aborted") && preventNextAbortSound)
					return preventNextAbortSound = false;
				if (
					arg.message?.includes("Request aborted") ||
					arg.message?.includes("Failed to get task status") ||
					arg.message?.includes("Horde generation failed")
				)
					playAudio(audioGenerationError);
			}
		});
	},

	/**	Enables/Disables the zoom in avatar feature.
		@param {Boolean} [forceUnable=false]
		forceUnable:
		- If true, forces features.quickRegenerate to be disabled.
	*/
	zoomCharacterAvatar: function (forceUnable = false) {
		const enableFeature = !forceUnable && extensionSettings.features.zoomCharacterAvatar;

		setRootCSSVariables('--qol-zoomed-avatar-container-display', enableFeature ? 'flex' : 'none');
		setRootCSSVariables('--qol-st-zoomed-avatar-container-display', enableFeature ? 'none' : 'flex');

		if (enableFeature) zoomCharacterAvatar();
	},

	showActivatedWiEntries: function () {
		const state = extensionSettings.features.showActivatedWiEntries;

		if (!state) $('#qol-display-active-entries').remove();
	}
}

function settingsBooleanButton(event) {
	const target = event.target;
	const value = Boolean($(target).prop("checked"));
	const setting = target.getAttribute("qol-setting");
	const callback = settingsCallbacks[setting.replace("features/", "")];

	if (setting.includes("features/"))
		extensionSettings.features[setting.replace("features/", "")] = value;
	else extensionSettings[setting] = value;

	if (callback) callback();

	log("toggleSetting " + setting, value);
	saveSettingsDebounced();
}

function settingsNumberButton(event) {
	const target = event.target;
	const value = Number($(target).prop("value"));
	const setting = target.getAttribute("qol-setting");
	const callback = settingsCallbacks[setting.replace("features/", "")];

	if (setting.includes("features/"))
		extensionSettings.features[setting.replace("features/", "")] = value;
	else extensionSettings[setting] = value;

	if (callback) callback();

	log("toggleSetting " + setting, value);
	saveSettingsDebounced();
}

// * MARK:Extension methods

function setRootCSSVariables(key = '', value = '') {
	if (!key) return;
	document.documentElement.style.setProperty(key, value);
}

/**
 * @param {object} mess
 * @returns {boolean|object}
 */
function characterFromMessage(mess) {
	let char = {};

	if (mess.is_user)
		char = Object.entries(powerUserSettings.personas)
			.map(([k, v]) => ({name: v, avatar: k}))
			.find(p => p.name === mess.name);
	else if (groupId === null && characterId !== undefined)
		char = characters[characterId];
	else
		char = characters.find(c => c.name === mess.name);

	return char;
}

function getCharacterThumbnailFromMess(mess) {
	const character = characterFromMessage(mess) ?? {};
	let fallbackAvatar = '';
	let avatar;
	let isUser;

	if (!mess?.force_avatar) {
		avatar = character.avatar;
		isUser = mess.is_user === true;
		fallbackAvatar = getThumbnailUrl(isUser ? 'persona' : 'avatar', avatar);
	} else {
		const url = new URL(mess.force_avatar, window.location.origin);
		const urlType = url?.searchParams.get('type') ?? '';
		const urlFile = url?.searchParams.get('file') ?? '';

		isUser = urlType === 'persona';
		avatar = urlFile;
		fallbackAvatar = mess.force_avatar;
	}

	avatar = isUser ? getUserAvatar(avatar) : formatCharacterAvatar(avatar);

	return {char: character, avatar, fallbackAvatar};
}

function getLocalStorageVar(var_name, {def_value = ''}) {
	let localStorageVisibility = localStorage.getItem(var_name);

	if (!localStorageVisibility)
		localStorage.setItem(var_name, def_value);

	localStorageVisibility = localStorage.getItem(var_name);

	return localStorageVisibility;
}

/**	Modifies a function to wrap it in a function that first executes a callback and THEN the original function.
	@param {Function} [originalFunction]
	originalFunction:
	- wrapMethod will not modify this method, it will only force it to execute extra code before its call.
	@param {Function} [callback]
	callback:
	- Additional code to execute before the original method.
	@returns Returns the original function, with the callback added.
*/
function wrapMethod(originalFunction, callback) {
	return function (...args) {
		callback(args);
		originalFunction.apply(this, args);
	};
}

/**
	@param {HTMLAudioElement} audio
	audio:
	- The audio will not play if it is already playing.
*/
function playAudio(audio) {
	if (audio.currentTime === 0 || audio.ended) {
		audio.currentTime = 0;
		audio.volume = extensionSettings.soundVolume;
		audio.play();
	}
}

/**	Hides the Continue button from the right side of the input area.
	If the extension is disabled, "hideRegenerateButton" will always hide the button.
	@param {Boolean} [hide=true]
	hide:
	- Whether or not to hide the retry button.
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

	log("hideRegenerateButton()", $('#regenerate_but').css('display'));
}

/** If the chat is unlocked, "regenerate" will be triggered. */
function triggerRegenerate() {
	if (!extensionSettings.enabled || !extensionSettings.features.quickRegenerate) return;
	if (isGenerating()) return log("GENERATION_LOCKED", "isGenerating:", isGenerating());

	const $option_regenerate = document.getElementById("option_regenerate");
	$option_regenerate.click();
	hideRegenerateButton();
	log("triggerRegenerate()");
}

/**	Zooms in on the avatar of the character who is speaking. */
function zoomCharacterAvatar() {
	if (!extensionSettings.enabled ||
		!extensionSettings.features.zoomCharacterAvatar ||
		!context().chatId
	) return setRootCSSVariables('--qol-zoomed-avatar-container-display', 'none');

	if (!chat?.length) return setRootCSSVariables('--qol-zoomed-avatar-container-display', 'none');

	const lastMes = chat[chat.length - 1];
	const {char, avatar, fallbackAvatar} = getCharacterThumbnailFromMess(lastMes);

	if (!avatar) return setRootCSSVariables('--qol-zoomed-avatar-container-display', 'none');

	const localStorageVisibility = getLocalStorageVar('qol-zoomed-avatar-display', {
		def_value: extensionSettings.features.zoomCharacterAvatar ? 'flex' : 'none'
	});

	setRootCSSVariables('--qol-zoomed-avatar-container-display', localStorageVisibility);
	$('#qol-zoomed-avatar-image').data('fallback-img', fallbackAvatar);
	$('#qol-zoomed-avatar-image').prop('src', `${avatar}?cb=${Date.now()}`);
	$('#qol-zoomed-avatar-image').prop('alt', char?.name ?? "");

	log("zoomCharacterAvatar()");
}

/** Automatically cancels the generation of a message after user input */
async function simpleUserInput() {
	if (!extensionSettings.enabled ||
		!extensionSettings.features.simpleUserInput
	) return;

	const group = groups.find((x) => x.id === context().groupId);

	if (
		isGenerating() &&
		group.activation_strategy === group_activation_strategy.MANUAL
	)
		return log("group_activation_strategy", group_activation_strategy.MANUAL);

	preventNextAbortSound = true;
	await stopGeneration();
	log("simpleUserInput(): preventNextAbortSound ", preventNextAbortSound);
}

/**	Creates and insert any button provided by the extension. */
async function loadQOLFeatures() {
    // Quick Regenerate
	const $rightSendForm = document.getElementById("rightSendForm");
	const $send_but = document.getElementById("send_but");

	const $regenerate_but = document.createElement("div");
	$regenerate_but.id = "regenerate_but";
	$regenerate_but.title = "Retry last message";
	$regenerate_but.classList.add("fa-solid", "fa-repeat", "interactable");

	$rightSendForm.insertBefore($regenerate_but, $send_but);
	$("#regenerate_but").on("click", triggerRegenerate);

	log("loadQOLFeatures()", "quickRegenerate");
	hideRegenerateButton(!extensionSettings.features.quickRegenerate);

    // Auto zoom last message Avatar
	log("loadQOLFeatures()", "zoomCharacterAvatar");
	const zoomedAvatar = await HTML_TEMPLATES.get('zoomedAvatar');

	$('#sheld').append(zoomedAvatar);
	$('#qol-zoomed-avatar-refresh').on('click', zoomCharacterAvatar);

	$('#qol-zoomed-avatar-image').on('error', function() {
		log('Error - Avatar could not load, using thumbnail');

		const src = $(this).attr('src');
		const fallback = $(this).data('fallback-img');

		if (src === fallback) return log('Error - Thumbnail could not load');

		$(this).prop('src', fallback);
	});

	setRootCSSVariables('--qol-zoomed-avatar-container-display', getLocalStorageVar('qol-zoomed-avatar-display', {
		def_value: extensionSettings.features.zoomCharacterAvatar ? 'flex' : 'none'
	}));

	$('#qol-zoomed-avatar-close').on('click', function () {
		localStorage.setItem('qol-zoomed-avatar-display', 'none');
		setRootCSSVariables('--qol-zoomed-avatar-container-display', 'none');
	});

	$('#chat').on('click', '.mes .avatar', function () {
		if (!extensionSettings.enabled || !extensionSettings.features.zoomCharacterAvatar) return;
		localStorage.setItem('qol-zoomed-avatar-display', 'flex');
		setRootCSSVariables('--qol-zoomed-avatar-container-display', 'flex');
	});

	zoomCharacterAvatar();
}

// * MARK:Emitter Listeners

/** @type {Array<WIEntry>} */
let activatedWiEntries = [];

eventSource.on(eventTypes.CHAT_CHANGED, function (args) {
	log(eventTypes.CHAT_CHANGED, args);
	hideRegenerateButton(false);
	zoomCharacterAvatar();
});

eventSource.on(eventTypes.GENERATION_STARTED, function (args) {
	log(eventTypes.GENERATION_STARTED, args);
	hideRegenerateButton();

	activatedWiEntries = [];
});

eventSource.on(eventTypes.USER_MESSAGE_RENDERED, async function (args) {
	log(eventTypes.USER_MESSAGE_RENDERED, args);
	hideRegenerateButton(false);
	zoomCharacterAvatar();
	await simpleUserInput();
});

eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, function (args) {
	log(eventTypes.CHARACTER_MESSAGE_RENDERED, args);
	hideRegenerateButton(false);
	zoomCharacterAvatar();
});

eventSource.on(eventTypes.MESSAGE_SWIPED, function (args) {
	log(eventTypes.MESSAGE_SWIPED, args);
	hideRegenerateButton(false);
});

eventSource.on(eventTypes.MESSAGE_DELETED, function (args) {
	log(eventTypes.MESSAGE_DELETED, args);
	zoomCharacterAvatar();
});

eventSource.on(eventTypes.GENERATION_STOPPED, function (args) {
	log(eventTypes.GENERATION_STOPPED, args);
	hideRegenerateButton(false);
});

eventSource.on(eventTypes.GENERATION_ENDED, function (args) {
	log(eventTypes.GENERATION_ENDED, args);
	hideRegenerateButton(false);
});

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

eventSource.on(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, async function (args) {
	log(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, args);

	if (!extensionSettings.enabled || !extensionSettings.features.showActivatedWiEntries) return;

	const loreEntriesList = (await HTML_TEMPLATES.get("activatedLoreEntries")).clone();
	const loreEntryGroupTemplate = $(loreEntriesList).find('.qol-activated-entry.template');
	const loreEntryItemTemplate = $(loreEntriesList).find('.qol-activated-entry-item.template');

	$('#qol-display-active-entries').remove();

	/**
	 * @typedef {JQuery<HTMLElement>} EntryGroup
	 */

	/** @type {object} */
	const entriesGroupedByWorld = {};

	activatedWiEntries.sort((a, b) => {
		const worldCompare = a.world.localeCompare(b.world);
		if (worldCompare !== 0) return worldCompare;
		const ai = (a.displayIndex ?? 0);
		const bi = (b.displayIndex ?? 0);
		return ai - bi;
	});

	for (const entry of activatedWiEntries) {
		const worldID = entry.world.toLowerCase().replaceAll(/\s+/g, "_");

		/** @type {EntryGroup} */
		let entryGroup = entriesGroupedByWorld[worldID] ?? false;

		if (!entryGroup) {
			entriesGroupedByWorld[worldID] = loreEntryGroupTemplate.clone().toggleClass('d-none', false).toggleClass('template', false);
			entriesGroupedByWorld[worldID].find('.qol-activated-entry-world-name').html(lodash.escape(entry.world));

			entryGroup = entriesGroupedByWorld[worldID];
		}

		const entryItem = loreEntryItemTemplate.clone().toggleClass('d-none', false).toggleClass('template', false);

		entryItem.find('.qol-activated-entry-icon').text(lodash.escape(getEntryIcon(entry)));
		entryItem.find('.qol-activated-entry-comment').html(lodash.escape(entry.comment));
		entryItem.find('.qol-activated-entry-comment').prop('title', entry.comment);

		entryGroup.find('.qol-activated-entry-world-entries').append(entryItem);
	}

	/** @type {Array<EntryGroup>} */
	const entryGroups = Object.values(entriesGroupedByWorld);

	for (const entryGroup of entryGroups)
		loreEntriesList.find('#qol-activated-lore-entries-list').append(entryGroup);

	loreEntriesList.find('.qol-activated-entry-item').last().toggleClass('separator-bottom-thin', false);

	$('#ai_response_configuration').before(loreEntriesList);
});

eventSource.on(eventTypes.WORLDINFO_SCAN_DONE, function (/** @type {ScannedWIEntries} */ args) {
	log(eventTypes.WORLDINFO_SCAN_DONE, args);

	if (!extensionSettings.enabled || !extensionSettings.features.showActivatedWiEntries) return;
	if (args?.new?.successful) activatedWiEntries.push(...args.new.successful);
});

// * MARK:Initialize Extension

$(async function () {
	if (!context().extensionSettings[extensionName]) {
	    context().extensionSettings[extensionName] = structuredClone(defaultSettings);
	}

	for (const key of Object.keys(defaultSettings)) {
	    if (context().extensionSettings[extensionName][key] === undefined) {
		   context().extensionSettings[extensionName][key] = defaultSettings[key];
	    }
	}

	for (const key of Object.keys(defaultSettings.features)) {
	    if (context().extensionSettings[extensionName].features[key] === undefined) {
		   context().extensionSettings[extensionName].features[key] = defaultSettings.features[key];
	    }
	}

	await loadHTMLSettings();
	setSettings();
	await loadQOLFeatures();
});