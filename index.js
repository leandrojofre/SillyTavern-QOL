import {eventSource, event_types, saveSettingsDebounced} from "../../../../script.js";
import {extension_settings} from "../../../extensions.js";

// * Extension variables

const extensionName = "SillyTavern-QOL";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
	enabled: true,
	features: {
		quickRegenerate: true,
	},
	debug: false
};

const log = (...msg) => {
	if (!extensionSettings.debug) return;
	console.log("[" + extensionName + "]", ...msg);
};

// * Methods in charge of controlling the extension settings

async function loadSettings() {
	extension_settings[extensionName] = extension_settings[extensionName] || {};
	if (Object.keys(extension_settings[extensionName]).length === 0) {
		Object.assign(extension_settings[extensionName], defaultSettings);
		await saveSettingsDebounced();
	}

	if (Object.keys(extension_settings[extensionName]).length !== Object.keys(defaultSettings).length) {
		const extension_settings_old = {};
		Object.assign(extension_settings_old, extension_settings[extensionName])

		extension_settings[extensionName] = {};
		Object.assign(extension_settings[extensionName], defaultSettings, extension_settings_old);

		await saveSettingsDebounced();
	}

	$("#qol-activate-extension").prop("checked", extensionSettings.enabled).trigger("input");
	$("#qol-activate-quick-retry").prop("checked", extensionSettings.features.quickRegenerate).trigger("input");
	$("#qol-activate-debug").prop("checked", extensionSettings.debug).trigger("input");

	log("loadSettings", extensionSettings);
}

/**	Makes a popup appear with setting's values.
 */
function displaySettings() {
	toastr.info(`Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
	toastr.info(`Quick regenerate is ${extensionSettings.features.quickRegenerate ? "active" : "not active"}`);
	toastr.info(`The extension is ${extensionSettings.enabled ? "active" : "not active"}`);
}

const settingsCallbacks = {
	/**	Enables/Disables the extension */
	enabled: () => {
		settingsCallbacks.quickRegenerate(!$("#qol-activate-extension").prop("checked"));
	},
	
	/**	Enables/Disables the quick regenerate button
		@param {Boolean} [forceUnable=false]
		forceUnable:
		- If true, forces features.quickRegenerate to be disabled.
	*/
	quickRegenerate: (forceUnable = false) => {
		hideRegenerateButton(forceUnable || !$("#qol-activate-quick-retry").prop("checked"));
	},
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

// * Extension methods

/**	Hides the Continue button from the right side of the input area.
	If the extension is disabled, "hideRegenerateButton" will always hide the button.
	@param {Boolean} [hide=true]
	hide:
	- Whether or not to hide the retry button.
 */
function hideRegenerateButton(hide = true) {
	if (
		!extensionSettings.enabled ||
		!extensionSettings.features.quickRegenerate ||
		hide
	)
		$('#regenerate_but').css({ 'display': 'none' });
	else $('#regenerate_but').css({ 'display': 'flex' });
	
	log("hideRegenerateButton()", $('#send_but').css('display'));
}

function triggerOptionRegenerate() {
	if (!extensionSettings.enabled ||!extensionSettings.features.quickRegenerate) return;
	
	const generationLocked = $('#send_but').css('display') !== 'flex';
	log("GENERATION_LOCKED", generationLocked)
	if (generationLocked) return;

	const $option_regenerate = document.getElementById("option_regenerate");
	$option_regenerate.click();
	hideRegenerateButton();
}

/**	Creates and insert any button provided by the extension.
 */
function loadQOLFeatures() {
	const $rightSendForm = document.getElementById("rightSendForm");
	const $send_but = document.getElementById("send_but");
	
	const $regenerate_but = document.createElement("div");
	$regenerate_but.id = "regenerate_but";
	$regenerate_but.title = "Retry last message";
	$regenerate_but.classList.add("fa-solid", "fa-repeat", "interactable");

	$rightSendForm.insertBefore($regenerate_but, $send_but);
	
	log("loadQOLFeatures()", "quickRegenerate");
	hideRegenerateButton(!extensionSettings.features.quickRegenerate);
		
}

// * Emitters Listeners

eventSource.on(event_types.GENERATION_STARTED, async (...args) => {
	log("GENERATION_STARTED", args);
	hideRegenerateButton();
});

eventSource.on(event_types.GENERATION_ENDED, async (...args) => {
	log("GENERATION_ENDED", args);
	hideRegenerateButton(false);
});

// * Extension initializer

jQuery(async () => {
	const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

	$("#extensions_settings").append(settingsHtml);

	// Event Listeners for the extension HTML
	$("#qol-check-configuration").on("click", displaySettings);
	$("#qol-activate-extension").on("input", settingsBooleanButton);
	$("#qol-activate-quick-retry").on("input", settingsBooleanButton);
	$("#qol-activate-debug").on("input", settingsBooleanButton);

	await loadSettings();
	
	// Add extension features
	loadQOLFeatures();

	// Custom Listeners
	$("#regenerate_but").on("click", triggerOptionRegenerate);
});
