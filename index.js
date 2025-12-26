import { isGenerating } from "../../../../script.js";
import { group_activation_strategy, groups } from '../../../group-chats.js';

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
    t
} = context();

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
		simpleUserInput: false
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
	quickRegenerate: (forceUnable = false) => {
		hideRegenerateButton(forceUnable || !extensionSettings.features.quickRegenerate);
	},

	/**	Enable/Disable the message generation error sound. */
	playErrorSound: () => {
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
	zoomCharacterAvatar: (forceUnable = false) => {
		if (!forceUnable && extensionSettings.features.zoomCharacterAvatar)
			zoomCharacterAvatar();
		else $("#closeZoom")["0"].click();
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
	if (isGenerating()) return log("GENERATION_LOCKED", "is_send_press:", isGenerating());

	const $option_regenerate = document.getElementById("option_regenerate");
	$option_regenerate.click();
	hideRegenerateButton();
	log("triggerRegenerate()");
}

/**	Zooms in on the avatar of the character who is speaking. */
function zoomCharacterAvatar() {
	if (!extensionSettings.enabled ||
		!extensionSettings.features.zoomCharacterAvatar
	) return;

	const lastMes = $('#chat .mes').last()[0];
	const zoomedAvatar = $('div.zoomed_avatar.draggable').last()[0];
	const closeZoomButton = $("#closeZoom")[0];
	const expressionImg = /** @type {HTMLImageElement} */ ($("#expression-image")[0]);

	if (expressionImg && !expressionImg.classList.contains("default") && expressionImg.src.match(/(http:\/\/127.0.0.(1|0):)\d+(\/.+)/gi)) {
		closeZoomButton.click();
		return log("CHARACTER EXPRESSION ACTIVE");
	}

	if (!lastMes) return log("CHAT EMPTY");

	if (	zoomedAvatar &&
		((
			lastMes.getAttribute("ch_name").replace(/(%20|-|\d|\W|\s)+/gi, "").toLowerCase() ===
			zoomedAvatar.getAttribute("forchar").replace(/(%20|-|\d|\W|\s)+/gi, "").toLowerCase()
		) || (
			lastMes.getAttribute("ch_name") === "SillyTavern System" &&
			zoomedAvatar.getAttribute("forchar") === "img/five"
		) || (
			lastMes.getAttribute("is_user") === "true" &&
			zoomedAvatar.getAttribute("forchar").toLowerCase().includes("user")
		))
	)
		return log("CHARACTER ALREADY ZOOMED");

	/** @type {HTMLElement} */(lastMes.querySelector('.avatar')).click();

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
		return log("group_activation_strategy.MANUAL");

	preventNextAbortSound = true;
	await stopGeneration();
	log("simpleUserInput(): preventNextAbortSound ", preventNextAbortSound);
}

/**	Creates and insert any button provided by the extension. */
function loadQOLFeatures() {
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
	zoomCharacterAvatar();

	userAvatarBlockObserver.observe(document.getElementById("user_avatar_block"), {
		subtree: true,
		attributeFilter: ["class"],
	});
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

eventSource.on(eventTypes.MESSAGE_UPDATED, function (args) {
	log(eventTypes.MESSAGE_UPDATED, args);
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
	log(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, args)

	// display activated wi entries
	const loreEntriesList = (await HTML_TEMPLATES.get("activatedLoreEntries")).clone();
	const loreEntryGroupTemplate = $(loreEntriesList).find('.qol-activated-entry.template');
	const loreEntryItemTemplate = $(loreEntriesList).find('.qol-activated-entry-item.template');

	$('#qol-display-active-entries').remove();

	// group entries by world (clean name to minus snake case)
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
			entriesGroupedByWorld[worldID] = loreEntryGroupTemplate.clone().toggleClass('d-none', false);
			entriesGroupedByWorld[worldID].find('.qol-activated-entry-world-name').html(_.escape(entry.world));

			entryGroup = entriesGroupedByWorld[worldID];
		}

		const entryItem = loreEntryItemTemplate.clone().toggleClass('d-none', false);

		entryItem.find('.qol-activated-entry-icon').text(_.escape(getEntryIcon(entry)));
		entryItem.find('.qol-activated-entry-comment').html(_.escape(entry.comment));

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

	if (args?.new?.successful) activatedWiEntries.push(...args.new.successful);
});

// * MARK:Observers

const userAvatarBlockObserver = new MutationObserver((mutations) =>{
	// [mutation.type, mutation.target, mutation.attributeName]
	for (const mutation of mutations)
		if (/** @type {HTMLElement} */(mutation.target).classList.contains("selected")) zoomCharacterAvatar();
});

// * MARK:Initialize Extension

(async function initExtension() {

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
	loadQOLFeatures();
})();
