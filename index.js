// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import {extension_settings} from "../../../extensions.js";
//You'll likely need to import some other functions from the main script
import {eventSource, event_types, saveSettingsDebounced} from "../../../../script.js";


// Keep track of where your extension is located, name should match repo name
const extensionName = "SillyTavern-Optimizations";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const extensionSettings = extension_settings[extensionName];
const defaultSettings = {
	enabled: true,
	debug: false
};

const log = (...msg) => {
	if (!extensionSettings.debug) return;
	console.log("[" + extensionName + "]", ...msg);
};

// Loads the extension settings if they exist, otherwise initializes them to the defaults.
async function loadSettings() {
	//Create the settings if they don't exist
	extension_settings[extensionName] = extension_settings[extensionName] || {};
	if (Object.keys(extension_settings[extensionName]).length === 0) {
		Object.assign(extension_settings[extensionName], defaultSettings);
		saveSettingsDebounced();
	}

	// Updating settings in the UI
	$("#activate-extension").prop("checked", extensionSettings.enabled).trigger("input");
	$("#activate-debug").prop("checked", extensionSettings.debug).trigger("input");
}

function chatChanged(...args) {
	if (args[0] == undefined) return log("CHAT UNDEFINED");

	log("CHAT_CHANGED", args);
}

function enableExtension() {
	if (extensionSettings.enabled) {
		eventSource.on(event_types.CHAT_CHANGED, chatChanged);
	} else {
		eventSource.removeListener(event_types.CHAT_CHANGED, chatChanged);
	}
}

// This function is called when the extension settings are changed in the UI
async function enableExtensionInput(event) {
	const value = Boolean($(event.target).prop("checked"));
	extensionSettings.enabled = value;
	
	log("enableExtension", extensionSettings.enabled);
	await saveSettingsDebounced();
	enableExtension();
}

function enableDebugMode(event) {
	const value = Boolean($(event.target).prop("checked"));
	extensionSettings.debug = value;

	log("enableDebugMode", extensionSettings.debug);
	saveSettingsDebounced();
}

// This function is called when the button is clicked
function displaySettings() {
	// You can do whatever you want here
	// Let's make a popup appear with the checked setting
	toastr.info(`The extension is ${extensionSettings.enabled ? "active" : "not active"}`);
	toastr.info(`Debug mode is ${extensionSettings.enabled ? "active" : "not active"}`);
}

// This function is called when the extension is loaded
jQuery(async () => {
	// This is an example of loading HTML from a file
	const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);

	// Append settingsHtml to extensions_settings
	// extension_settings and extensions_settings2 are the left and right columns of the settings menu
	// Left should be extensions that deal with system functions and right should be visual/UI related
	$("#extensions_settings").append(settingsHtml);

	// These are examples of listening for events
	$("#my_button").on("click", displaySettings);
	$("#activate-extension").on("input", enableExtensionInput);
	$("#activate-debug").on("input", enableDebugMode);

	// Load settings when starting things up (if you have any)
	loadSettings();
});
