# SillyTavern-QOL

The idea of ​​this extension is to add small changes to facilitate the experience of using SillyTavern, either from quick access buttons in convenient areas, displaying useful information that is usually hidden/hard to access; etc.
- SillyTavern `+=1.15.0` required

## Features

For now, the added features are the following:
- A quick access button to retry the last message, the same button that is usually accessed from the drop-down menu of the message input area. ![Captura de pantalla 2024-11-29 015518](https://github.com/user-attachments/assets/c71b42e1-cff7-491c-870e-c092d36015ac)
- When generating a message returns an error, a sound will be played to inform you in case you have ST in the background.
- Allow the talking character's avatar to always have zoom applied, automatically changing the avatar when another character or the user speaks.
- Automatically cancel the generation of a message after a user input. For people, like me, who always edit or hit continue message to their own message and are tired of clicking cancel themselves.
- Show lorebook entries activated in the last generation in the left side panel.
- Allow to set custom parameters for your text generation requests via slash commands.
  - `/qol-add-custom-sampler key="{sampler-key}" {value}`
  - `/qol-get-custom-sampler key="{sampler-key}"`
  - `/qol-del-custom-sampler key="{sampler-key}"`
  - `/qol-flush-custom-samplers`

If you have any suggestions, do not hesitate to leave them. If you want to contribute, do not hesitate to fork the repository.

## Installation

Paste this link into the `Install extension` button from the `Extensions` panel:

```https://github.com/leandrojofre/SillyTavern-QOL.git```

## Usage

From the extension configuration menu, you can enable/disable each feature of the extension.

<img width="75%" src="assets/image/screenshot-extension-menu.png)"/>

## Support and Contributions

- @city-unit - Creator of the [template](https://github.com/city-unit/st-extension-example) used by this repo.
