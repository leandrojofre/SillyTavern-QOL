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
        guessAvatarFromContent: boolean;
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

    type ExternalExtension<Name extends keyof GlobalInterfaceExtensions = keyof GlobalInterfaceExtensions> = import('./source/classes/ExternalExtension.js').ExternalExtension<Name>;
    type AIHorde = import('./source/classes/AIHorde.js').AIHorde;

    type GlobalInterface = {
        extensions: GlobalInterfaceExtensions,
        ext: <K extends keyof GlobalInterfaceExtensions> (key: K) => GlobalInterfaceExtensions[K];
        getStatusAvatarMap: (options?: GetStatusMapOptions) => Map<string, StatUsMaximus.Status>;
        log: (...args: any) => void;
        debug: (...args: any) => void;
        error: (...args: any) => void;
        AIHorde: AIHorde;
        extensionName: 'Quality of Life';
        lastZoomedCharacter: string;
    };

    type HordeWorker = {
        requests_fulfilled: number;
        kudos_rewards: number;
        kudos_details: {
            generated: number;
            uptime: number;
        };
        performance: string;
        threads: number;
        uptime: number;
        maintenance_mode: boolean;
        info?: string;
        nsfw: boolean;
        trusted: boolean;
        flagged: boolean;
        owner?: string;
        uncompleted_jobs: number;
        models: string[];
        team: {
            name?: string;
            id?: string;
        };
        bridge_agent: string;
        max_length: number;
        max_context_length: number;
        type: 'text' | 'image' | 'interrogation';
        name: string;
        id: string;
        online: boolean;
    };
};