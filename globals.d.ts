declare namespace QualityOfLife {
    type UserCharacter = {
        name: string;
        avatar: string;
        is_user: boolean;
    };

    type ExtensionSettingsFeatures = {
        quickRegenerate: boolean;
        quickRegenerateAutoHide: boolean;
        playErrorSound: boolean;
        zoomCharacterAvatar: boolean;
        zoomedAvatarInLeftPanel: boolean;
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

    type HTMLTemplateGetOptions = {
        clone?: boolean;
    };

    type GetStatusMapOptions = {
        onlyEnabled?: boolean;
        onlyDetached?: boolean;
    }

    type GlobalInterfaceExtensions = {
        StatUsMaximus?: ExternalExtension<'StatUsMaximus'>;
    };

    type ExtensionKeys = keyof GlobalInterfaceExtensions;

    type ExternalExtension<Name extends ExtensionKeys = ExtensionKeys> = import('./src/classes/ExternalExtension.js').ExternalExtension<Name>;

    type GlobalInterface = {
        extensions: GlobalInterfaceExtensions,
        ext: <K extends ExtensionKeys> (key: K) => GlobalInterfaceExtensions[K];
        getStatusAvatarMap: (options?: GetStatusMapOptions) => Map<string, StatUsMaximus.Status>;
        log: (...args: any) => void;
        debug: (...args: any) => void;
        error: (...args: any) => void;
        extensionName: 'Quality of Life';
    };
};