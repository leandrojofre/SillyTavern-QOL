import {eventSource, event_types, is_send_press, saveSettingsDebounced, stopGeneration} from "../../../../script.js";
import {extension_settings} from "../../../extensions.js";
import {group_activation_strategy, groups, is_group_generating, selected_group} from '../../../group-chats.js';

// * Extension variables

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
const context = SillyTavern.getContext();
audioGenerationError.src = `${extensionFolderPath}/assets/audio/error-sound.mp3`;

let preventNextAbortSound = false;

// * Debugs methods

const log = (...msg) => {
	if (!extensionSettings.debug) return;
	console.log("[" + extensionName + "]", ...msg);
};

// * Methods in charge of controlling the extension settings

async function loadHTMLSettings() {
	const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
	
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

// * Extension methods

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
	@param {Audio} [audio]
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
	if (is_send_press) return log("GENERATION_LOCKED", "is_send_press:", is_send_press);

	const $option_regenerate = document.getElementById("option_regenerate");
	$option_regenerate.click();
	hideRegenerateButton();
	log("triggerRegenerate()");
}

/**	Zooms in on the avatar of the character who is speaking. */
function zoomCharacterAvatar() {
	if (	!extensionSettings.enabled ||
		!extensionSettings.features.zoomCharacterAvatar
	) return;

	const lastMes = $('#chat .mes').last()[0];
	const zoomedAvatar = $('div.zoomed_avatar.draggable').last()[0];
	const closeZoomButton = $("#closeZoom")[0];
	const expressionImg = $("#expression-image")[0];
	
	if (	expressionImg &&
		!expressionImg.classList.contains("default") &&
		expressionImg.src.match(/(http:\/\/127.0.0.(1|0):)\d+(\/.+)/gi)
	) {
		closeZoomButton.click();
		return log("CHARACTER EXPRESSION ACTIVE");
	}

	if (!lastMes)
		return log("CHAT EMPTY");

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
	
	lastMes.querySelector('.avatar').click();
	
	log("zoomCharacterAvatar()");
}

/** Automatically cancels the generation of a message after user input */
async function simpleUserInput() {
	if (	!extensionSettings.enabled ||
		!extensionSettings.features.simpleUserInput
	) return;

	const group = groups.find((x) => x.id === selected_group);

	if (
		is_group_generating &&
		group.activation_strategy === group_activation_strategy.MANUAL
	)
		return log("group_activation_strategy.MANUAL");
		
	preventNextAbortSound = true;
	await stopGeneration();
	log("simpleUserInput()");
}

/**	Creates and insert any button provided by the extension. */
function loadQOLFeatures() {
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
	
	log("loadQOLFeatures()", "zoomCharacterAvatar");
	zoomCharacterAvatar();

	userAvatarBlockObserver.observe(document.getElementById("user_avatar_block"), {
		subtree: true,
		attributeFilter: ["class"],
	});
}

// * Emitter Listeners

eventSource.on(event_types.CHAT_CHANGED, async (...args) => {
	log("CHAT_CHANGED", args);
	hideRegenerateButton(false);
	zoomCharacterAvatar();
});

eventSource.on(event_types.GENERATION_STARTED, async (...args) => {
	log("GENERATION_STARTED", args);
	hideRegenerateButton();
});

eventSource.on(event_types.USER_MESSAGE_RENDERED, async (...args) => {
	log("USER_MESSAGE_RENDERED", args);
	hideRegenerateButton(false);
	zoomCharacterAvatar();
	await simpleUserInput();
});

eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (...args) => {
	log("CHARACTER_MESSAGE_RENDERED", args);
	hideRegenerateButton(false);
	zoomCharacterAvatar();
});

eventSource.on(event_types.MESSAGE_UPDATED, async (...args) => {
	log("MESSAGE_UPDATED", args);
	zoomCharacterAvatar();
});

eventSource.on(event_types.MESSAGE_SWIPED, async (...args) => {
	log("MESSAGE_SWIPED", args);
	hideRegenerateButton(false);
});

eventSource.on(event_types.MESSAGE_DELETED, async (...args) => {
	log("MESSAGE_DELETED", args);
	zoomCharacterAvatar();
});

eventSource.on(event_types.GENERATION_STOPPED, async (...args) => {
	log("GENERATION_STOPPED", args);
	hideRegenerateButton(false);
});

eventSource.on(event_types.GENERATION_ENDED, async (...args) => {
	log("GENERATION_ENDED", args);
	hideRegenerateButton(false);
});

// * Observers

const userAvatarBlockObserver = new MutationObserver((mutations) =>{
	// [mutation.type, mutation.target, mutation.attributeName]
	for (const mutation of mutations)
		if (mutation.target.classList.contains("selected")) zoomCharacterAvatar();
});

// * Initialize Extension

(async function initExtension() {

	if (!context.extensionSettings[extensionName]) {
	    context.extensionSettings[extensionName] = structuredClone(defaultSettings);
	}
 
	for (const key of Object.keys(defaultSettings)) {
	    if (context.extensionSettings[extensionName][key] === undefined) {
		   context.extensionSettings[extensionName][key] = defaultSettings[key];
	    }
	}
 
	for (const key of Object.keys(defaultSettings.features)) {
	    if (context.extensionSettings[extensionName].features[key] === undefined) {
		   context.extensionSettings[extensionName].features[key] = defaultSettings.features[key];
	    }
	}

	await loadHTMLSettings();
	setSettings();
	loadQOLFeatures();

})();
