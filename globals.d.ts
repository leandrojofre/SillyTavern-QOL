declare namespace QualityOfLife {
    type ExtensionSettingsFeatures = {
        quickRegenerate: boolean;
        quickRegenerateAutoHide: boolean;
        playErrorSound: boolean;
        zoomCharacterAvatar: boolean;
        simpleUserInput: boolean;
        showActivatedWiEntries: boolean;
        collapseNewlines: boolean;
        preventPageNavigation: boolean;
    };

    type ExtensionSettings = {
        enabled: boolean;
        soundVolume: number;
        features: ExtensionSettingsFeatures;
        customSamplers: Record<string, any>;
        debug: boolean;
    };

    type WIEntry = {
        uid: number;
        world: string;
        comment: string;
        content: string;
        outletName: string;
        displayIndex: number;
        vectorized: boolean;
        constant: boolean;
    };

    type ScannedWIEntries = {
        activated?: {
            entries: Map<string, Record<string, any>>;
        };
        new?: {
            successful: WIEntry[];
        };
    };
};