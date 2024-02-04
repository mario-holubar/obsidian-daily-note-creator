import { App, Modal, moment, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { appHasDailyNotesPluginLoaded, getDailyNoteSettings, getAllDailyNotes, getDailyNote, createDailyNote } from "obsidian-daily-notes-interface";

interface DailyNoteCreatorSettings {
}

const DEFAULT_SETTINGS: DailyNoteCreatorSettings = {
}

// Find the date of the first and last daily notes that exist in the vault
function getFirstAndLastDates(dailyNotes: Record<string, TFile>) {
	const sortedDailyNotes = Object.entries(dailyNotes).sort();

	// Fall back to today's date if there are no daily notes
	if (sortedDailyNotes.length === 0) {
		return { first: moment(), last: moment() };
	}

	let { format } = getDailyNoteSettings();
	const [, firstNote] = sortedDailyNotes[0];
	const [, lastNote] = sortedDailyNotes[sortedDailyNotes.length - 1];
	const firstDate = moment(firstNote.basename, format);
	const lastDate = moment(lastNote.basename, format);

	return { first: firstDate, last: lastDate };
}

// Find all dates for which daily notes are missing between start and end date
function findMissingDates(dailyNotes: Record<string, TFile>, start: moment.Moment, end: moment.Moment) {
	let missingDates = [];
	let currentDate = start.clone();
	while (currentDate.isSameOrBefore(end)) {
		if (!getDailyNote(currentDate, dailyNotes)) {
			missingDates.push(currentDate.clone());
		}
		currentDate.add(1, "day");
	}
	return missingDates;
}

// Create daily notes
async function createDailyNotes(dates: moment.Moment[]) {
	await Promise.all(dates.map(async date => {
		await createDailyNote(date);
	}));
	if (dates.length > 0) {
		new Notice(`Created ${dates.length} daily notes`);
	}
}

// Modal dialog for creating missing daily notes
class DailyNoteCreatorModal extends Modal {
	dailyNotes: Record<string, TFile>;
	startDate: moment.Moment;
	endDate: moment.Moment;
	missingDates: moment.Moment[];

	constructor(app: App, dailyNotes: Record<string, TFile>, startDate: moment.Moment, endDate: moment.Moment) {
		super(app);
		this.dailyNotes = dailyNotes;
		this.startDate = startDate;
		this.endDate = endDate;
		this.missingDates = [];
	}

	onOpen() {
		let {titleEl, contentEl} = this;
		titleEl.setText('Create missing daily notes');
		
		// Create input fields for start and end date
		let startDateInput = new Setting(contentEl)
			.setName('Start date')
			.setDesc('The first date for which to create a daily note')
		startDateInput.controlEl.createEl('input', { attr: { type: 'date' }, value: this.startDate.format('YYYY-MM-DD') }).addEventListener('change', (event) => {
			const startDate = moment((event.target as HTMLInputElement).value);
			if (startDate.isValid()) {
				this.startDate = startDate;
				update();
			}
		});
		let endDateInput = new Setting(contentEl)
			.setName('End date')
			.setDesc('The last date for which to create a daily note');
		endDateInput.controlEl.createEl('input', { attr: { type: 'date' }, value: this.endDate.format('YYYY-MM-DD') }).addEventListener('change', (event) => {
			const endDate = moment((event.target as HTMLInputElement).value);
			if (endDate.isValid()) {
				this.endDate = endDate;
				update();
			}
		});
		
		// Create confirmation buttons
		let confirmation = new Setting(contentEl)
			.addButton(confirm => confirm
				.setButtonText(`Confirm`)
				.setCta()
				.onClick(() => {
					this.close();
					createDailyNotes(this.missingDates);
				}))
			.addButton(cancel => cancel
				.setButtonText(`Cancel`)
				.onClick(() => {
					this.close();
				}));

		let update = () => {
			this.missingDates = findMissingDates(this.dailyNotes, this.startDate, this.endDate);
			confirmation.setName(`Create ${this.missingDates.length} missing daily notes?`);
		}

		update();
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();
	}
}

export default class DailyNoteCreator extends Plugin {
	settings: DailyNoteCreatorSettings;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Create settings tab
		this.addSettingTab(new DailyNoteCreatorSettingTab(this.app, this));
		
		// Create command to open the modal dialog
		this.addCommand({
			id: 'create-missing-daily-notes',
			name: 'Create missing daily notes',
			callback: () => {
				const dailyNotes = getAllDailyNotes();
				const { last } = getFirstAndLastDates(dailyNotes);
				new DailyNoteCreatorModal(this.app, dailyNotes, last, moment()).open();
			}
		});
		
		this.app.workspace.onLayoutReady(async () => {
			const dailyNotes = await getAllDailyNotes();
			const { first, last } = getFirstAndLastDates(dailyNotes);
			const today = moment();
			const missing = findMissingDates(dailyNotes, first, today);
			await createDailyNotes(missing);
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class DailyNoteCreatorSettingTab extends PluginSettingTab {
	plugin: DailyNoteCreator;

	constructor(app: App, plugin: DailyNoteCreator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
	}
}
