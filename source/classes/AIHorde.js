import {
    HTML_TEMPLATES,
    POPUP_TYPE,
    callGenericPopup,
    t,
} from '../../index.js';

/** @typedef {QualityOfLife.HordeWorker} HordeWorker */

const API_BASE = 'https://aihorde.net/api/v2';

const endpoints = {
    workers: `${API_BASE}/workers`,
}

export class AIHorde {
    constructor() {}

    async init() {
        const aiHorde = this;

        $('#horde_refresh').after(
            await HTML_TEMPLATES.get('showHordeWorkersBtn')
        );

        $('#kobold_horde_block').on('click', '#qol-show-horde-workers', async function (e) {
            toastr.info(t`Fetching Horde workers...`, QualityOfLife.extensionName);

            const workers = await aiHorde.workers();
            const $workerList = $(`
                <div class="qol-extension-window" style="margin-bottom: 10px">
                    <div class="mb-10px fw-bold">AI Horde Workers</div>
                    <div class="flex-container flex-column scroll workers-list"></div>
                </div>
            `);

            if (!workers.length) return toastr.info(
                t`There are no Horde Workers available`,
                QualityOfLife.extensionName
            );

            for (const worker of workers) {
                if (!worker.models.length) continue;

                const $worker = $(`
                    <div class="flex-container">
                        <div class="flex-container flex-column g-0 p-5px flex-1 bg-ui-darker">
                            <div class="flex-container">
                                <small>${worker.name}</small>
                                <small class="text-quote-color">${worker.trusted ? 'Trusted' : 'Not Trusted'}</small>
                            </div>

                            <div class="flex-container flex-column worker-models">
                                <span>${worker.models.join('</span><span>')}</span>
                            </div>
                        </div>

                        <div class="flex-container flex-column g-0 p-5px bg-ui-darker">
                            <small class="text-quote-color">Response: ${worker.max_length}</small>
                            <small class="text-quote-color">Context: ${worker.max_context_length}</small>
                        </div>
                    </div>
                `);

                $workerList.find('.workers-list').append($worker);
            };

            await callGenericPopup($workerList, POPUP_TYPE.DISPLAY, null, {
                wide: true,
                leftAlign: true,
            });
        });
    }

    /**
     * @returns {Promise<HordeWorker[]>}
     */
    async workers() {
        let response = [];

        await $.ajax({
            url: endpoints.workers,
            data: {
                type: 'text',
            },
            success(requestResponse) {
                response = requestResponse;
            },
            error(error) {
                const { responseJSON: data } = error;

                QualityOfLife.error({error, data});
            },
        });

        QualityOfLife.log(response);

        return response;
    }
}