const WORDS = {
    pt: {
        wait: 'Aguardando o apresentador abrir a coleta…', retry: 'Atualizar', choose: 'Escolha uma alternativa:', write: 'Escreva sua resposta:',
        send: 'Enviar', done: 'Resposta registrada. Obrigado!', already: 'Você já respondeu a esta pergunta.', closed: 'A coleta está encerrada.',
        notFound: 'Sala não encontrada. Escaneie o QR Code novamente.', empty: 'Escreva uma resposta antes de enviar.', network: 'Não foi possível conectar. Tente novamente.',
    },
    en: {
        wait: 'Waiting for the presenter to open responses…', retry: 'Refresh', choose: 'Choose an option:', write: 'Write your answer:',
        send: 'Send', done: 'Answer recorded. Thank you!', already: 'You have already answered this question.', closed: 'Responses are closed.',
        notFound: 'Room not found. Scan the QR code again.', empty: 'Write an answer before sending.', network: 'Could not connect. Please try again.',
    },
    es: {
        wait: 'Esperando a que el presentador abra las respuestas…', retry: 'Actualizar', choose: 'Elige una opción:', write: 'Escribe tu respuesta:',
        send: 'Enviar', done: 'Respuesta registrada. ¡Gracias!', already: 'Ya respondiste esta pregunta.', closed: 'Las respuestas están cerradas.',
        notFound: 'Sala no encontrada. Escanea el código QR de nuevo.', empty: 'Escribe una respuesta antes de enviar.', network: 'No se pudo conectar. Inténtalo de nuevo.',
    },
};
const API_URL = 'r.php';
const PARTICIPANT_KEY = 'edukors-poll-participant';
const POLL_INTERVAL = 3000;
const LETTERS = 'ABCDE';

class StudentRoom {
    #words = WORDS.en;
    #room = '';
    #participant = '';
    #timer = 0;
    #isBusy = false;

    init() {
        const language = (navigator.language || 'en').slice(0, 2).toLowerCase();
        this.#words = WORDS[language] || WORDS.en;
        document.documentElement.lang = WORDS[language] ? language : 'en';
        this.#room = (new URLSearchParams(location.search).get('room') || '').trim().toUpperCase();
        this.#participant = this.#loadParticipant();
    }

    mount() {
        this.#text('r-wait-text', this.#words.wait);
        this.#text('r-wait-retry', this.#words.retry);
        this.#text('r-quiz-hint', this.#words.choose);
        this.#text('r-text-hint', this.#words.write);
        this.#text('r-text-send', this.#words.send);
        this.#text('r-done-text', this.#words.done);
        this.bind();
        this.load();
    }

    bind() {
        document.getElementById('r-wait-retry').addEventListener('click', () => this.load());
        document.getElementById('r-text').addEventListener('submit', event => {
            event.preventDefault();
            const text = document.getElementById('r-text-input').value.trim();
            if (text === '') {
                this.#error(this.#words.empty);
                return;
            }
            this.#respond(text);
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !document.getElementById('r-wait').hidden) this.load();
        });
    }

    async load() {
        clearTimeout(this.#timer);
        if (!/^[A-Z0-9]{6}$/.test(this.#room)) {
            this.#show('');
            this.#error(this.#words.notFound);
            return;
        }
        try {
            const { status, type, meta } = await this.#call({ proc: 'status', room: this.#room });
            this.#error('');
            this.render(status, type, meta);
        } catch (error) {
            this.#show('r-wait');
            this.#error(this.#message(error));
            if (error.message !== 'room_not_found') this.#timer = setTimeout(() => this.load(), POLL_INTERVAL * 2);
        }
    }

    render(status, type, meta) {
        if (status !== 1) {
            this.#show('r-wait');
            this.#timer = setTimeout(() => this.load(), POLL_INTERVAL);
            return;
        }
        if (type === 'quiz') {
            const buttons = [...LETTERS.slice(0, meta)].map((letter, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'r-option';
                button.textContent = letter;
                button.addEventListener('click', () => this.#respond(index));
                return button;
            });
            document.getElementById('r-options').replaceChildren(...buttons);
            this.#show('r-quiz');
            return;
        }
        this.#show('r-text');
    }

    async #respond(response) {
        if (this.#isBusy) return;
        this.#setBusy(true);
        try {
            await this.#call({ proc: 'respond', room: this.#room, participant: this.#participant, response });
            this.#error('');
            this.#show('r-done');
        } catch (error) {
            this.#error(this.#message(error));
            if (error.message === 'already_responded') this.#show('r-done');
            if (error.message === 'closed') this.load();
        } finally {
            this.#setBusy(false);
        }
    }

    async #call(body) {
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json.error) throw new Error(json.error || 'network');
        return json.data;
    }

    #message(error) {
        const messages = { room_not_found: this.#words.notFound, already_responded: this.#words.already, closed: this.#words.closed };
        return messages[error.message] || this.#words.network;
    }

    #loadParticipant() {
        const random = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[byte % 62]).join('');
        try {
            const stored = localStorage.getItem(PARTICIPANT_KEY);
            if (stored && /^[A-Za-z0-9]{16}$/.test(stored)) return stored;
            const created = random();
            localStorage.setItem(PARTICIPANT_KEY, created);
            return created;
        } catch {
            return random();
        }
    }

    #show(id) {
        ['r-wait', 'r-quiz', 'r-text', 'r-done'].forEach(panel => {
            document.getElementById(panel).hidden = panel !== id;
        });
    }

    #setBusy(isBusy) {
        this.#isBusy = isBusy;
        document.querySelectorAll('.r-option, #r-text-send').forEach(button => {
            button.disabled = isBusy;
        });
    }

    #text(id, value) {
        document.getElementById(id).textContent = value;
    }

    #error(message) {
        this.#text('r-error', message);
    }
}

const room = new StudentRoom();
room.init();
room.mount();
