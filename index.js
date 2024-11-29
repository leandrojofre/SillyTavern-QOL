//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import {extension_settings} from "../../../extensions.js";
//You'll likely need to import some other functions from the main script
import {eventSource, event_types, saveSettingsDebounced} from "../../../../script.js";


// Keep track of where your extension is located, name should match repo name
const extensionName = "SillyTavern-QOL";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
	enabled: true,
	debug: false
};

const log = (...msg) => {
	if (!extensionSettings.debug || !extensionSettings.enabled) return;
	console.log("[" + extensionName + "]", ...msg);
};

async function loadSettings() {
	extension_settings[extensionName] = extension_settings[extensionName] || {};
	if (Object.keys(extension_settings[extensionName]).length === 0) {
		Object.assign(extension_settings[extensionName], defaultSettings);
		await saveSettingsDebounced();
	}

	$("#qol-activate-extension").prop("checked", extensionSettings.enabled).trigger("input");
	$("#qol-activate-debug").prop("checked", extensionSettings.debug).trigger("input");
}

function enableExtension(event) {
	const value = Boolean($(event.target).prop("checked"));
	extensionSettings.enabled = value;
	
	log("enableExtension", value);
	saveSettingsDebounced();
}

function enableDebugMode(event) {
	const value = Boolean($(event.target).prop("checked"));
	extensionSettings.debug = value;

	log("enableDebugMode", extensionSettings.debug);
	saveSettingsDebounced();
}

/**
 * Makes a popup appear with setting's values.
 */
function displaySettings() {
	toastr.info(`The extension is ${extensionSettings.enabled ? "active" : "not active"}`);
	toastr.info(`Debug mode is ${extensionSettings.debug ? "active" : "not active"}`);
}

/**
 * Creates and insert any button provided by the extension.
 */
function loadQOLFeatures() {
	if (!extensionSettings.enabled) return;

	const $rightSendForm = document.getElementById("rightSendForm");
	const $send_but = document.getElementById("send_but");
	
	const $regenerate_but = document.createElement("div");
	$regenerate_but.id = "regenerate_but";
	$regenerate_but.title = "Retry last message";
	$regenerate_but.classList.add("fa-solid", "fa-repeat", "interactable");

	$rightSendForm.insertBefore($regenerate_but, $send_but);
	
	log("loadQOLFeatures()", "regenerate_but:", $regenerate_but);
}

/**
 * Hides the Continue button from the right side of the input area.
 * @param {Boolean} [hide=true] -Whether or not to hide the retry button.
 */
function hideRegenerateButton(hide = true) {
	if (!extensionSettings.enabled) return;

	const $regenerate_but = document.getElementById("regenerate_but");
	const display = hide ? "none" : "flex";

	if ($regenerate_but)
		$('#regenerate_but').css({ 'display': display });
	else	console.error("Element with ID 'regenerate_but' not found.");
}

eventSource.on(event_types.GENERATION_STARTED, async (...args) => {
	log("GENERATION_STARTED");
	hideRegenerateButton();
});

eventSource.on(event_types.GENERATION_ENDED, async (...args) => {
	log("GENERATION_ENDED");
	hideRegenerateButton(false);
});

function triggerOptionRegenerate() {
	if (!extensionSettings.enabled) return;
	
	const generationLocked = $('#send_but').css('display') !== 'flex';
	log("GENERATION_LOCKED", generationLocked)
	if (generationLocked) return;

	const $option_regenerate = document.getElementById("option_regenerate");
	$option_regenerate.click();
	hideRegenerateButton();
}

jQuery(async () => {
	const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

	$("#extensions_settings").append(settingsHtml);

	// Event Listeners for the extension HTML
	$("#qol-check-configuration").on("click", displaySettings);
	$("#qol-activate-extension").on("input", enableExtension);
	$("#qol-activate-debug").on("input", enableDebugMode);

	await loadSettings();
	
	// Add extension features
	loadQOLFeatures();

	// Custom Listeners
	$("#regenerate_but").on("click", triggerOptionRegenerate);
});
