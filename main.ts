import { App, Modal, moment, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { appHasDailyNotesPluginLoaded, getDailyNoteSettings, getAllDailyNotes, getDailyNote, createDailyNote } from "obsidian-daily-notes-interface";

interface DailyNoteCreatorSettings {
	autoCreate: boolean;
	autoCreateLimit: number;
}

const DEFAULT_SETTINGS: DailyNoteCreatorSettings = {
	autoCreate: true,
	autoCreateLimit: 1,
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
		currentDate.add(1, `day`);
	}
	return missingDates;
}

// Create daily notes
async function createDailyNotes(dates: moment.Moment[]) {
	await Promise.all(dates.map(async date => {
		await createDailyNote(date);
	}));
	if (dates.length > 0) {
		new Notice(`Created ${dates.length} daily note` + (dates.length == 1 ? `` : `s`));
	}
}

// Modal dialog for creating missing daily notes
class DailyNoteCreatorModal extends Modal {
	dailyNotes: Record<string, TFile>;
	startDate: moment.Moment;
	endDate: moment.Moment;
	missingDates: moment.Moment[];
	onConfirm: (() => void) | undefined;

	constructor(app: App, dailyNotes: Record<string, TFile>, startDate: moment.Moment, endDate: moment.Moment, onConfirm?: (() => void) | undefined) {
		super(app);
		this.dailyNotes = dailyNotes;
		this.startDate = startDate;
		this.endDate = endDate;
		this.missingDates = [];
		this.onConfirm = onConfirm;
	}

	onOpen() {
		let {titleEl, contentEl} = this;
		titleEl.setText('Create missing daily notes');

		// Create input fields for start and end date
		let startDateInput = new Setting(contentEl)
			.setName('Start date')
		startDateInput.controlEl.createEl('input', {
			attr: { type: 'date' },
			value: this.startDate.format('YYYY-MM-DD')
		}).addEventListener('change', (event) => {
			this.startDate = moment((event.target as HTMLInputElement).value);
			update();
		});
		let endDateInput = new Setting(contentEl)
			.setName('End date')
		endDateInput.controlEl.createEl('input', {
			attr: { type: 'date' },
			value: this.endDate.format('YYYY-MM-DD')
		}).addEventListener('change', (event) => {
			this.endDate = moment((event.target as HTMLInputElement).value);
			update();
		});
		
		// Create confirmation buttons
		let confirmation = new Setting(contentEl)
			.addButton(confirm => confirm
				.setButtonText(`Confirm`)
				.setCta()
				.onClick(async () => {
					this.close();
					await createDailyNotes(this.missingDates);
					this.onConfirm && this.onConfirm();
				}))
			.addButton(cancel => cancel
				.setButtonText(`Cancel`)
				.onClick(() => {
					this.close();
				}));

		// Find missing dates and update labels
		let update = () => {
			let { format } = getDailyNoteSettings();
			const startDateValid = this.startDate.isValid() && this.startDate.year().toString().length === 4;
			const endDateValid = this.endDate.isValid() && this.endDate.year().toString().length === 4;
			startDateInput.setDesc(startDateValid ? this.startDate.format(format) : `Invalid date`);
			endDateInput.setDesc(endDateValid ? this.endDate.format(format) : `Invalid date`);
			if (startDateValid && endDateValid) {
				this.missingDates = findMissingDates(this.dailyNotes, this.startDate, this.endDate);
			} else {
				this.missingDates = [];
			}
			confirmation.setName(`Create ${this.missingDates.length} missing daily note` + (this.missingDates.length == 1 ? `?` : `s?`));
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
		
		// Create missing daily notes on startup
		if (this.settings.autoCreate) {
			this.app.workspace.onLayoutReady(async () => {
				const dailyNotes = await getAllDailyNotes();
				const { last } = getFirstAndLastDates(dailyNotes);
				const today = moment();
				const missing = findMissingDates(dailyNotes, last, today);
				if (missing.length <= this.settings.autoCreateLimit) {
					await createDailyNotes(missing);
				} else {
					new DailyNoteCreatorModal(this.app, dailyNotes, last, today).open();
				}
			});
		}
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

		// Find missing notes since first daily note
		const dailyNotes = getAllDailyNotes();
		const { first, last } = getFirstAndLastDates(dailyNotes);
		const missing = findMissingDates(dailyNotes, first, moment());
		const n = missing.length;

		// Create backfill button
		let { format } = getDailyNoteSettings();
		new Setting(containerEl)
			.setName(n.toString() + ` missing daily note` + (n == 1 ? `` : `s`))
			.setDesc(`Since first daily (` + (first ? first.format(format) : `never`) + `)`)
			.addButton(toggle => toggle
				.setButtonText(`Create missing daily notes...`)
				.setCta()
				.onClick(() => {
					new DailyNoteCreatorModal(this.app, dailyNotes, first, moment(), () => {
						this.display();
					}).open();
				})
			);

		// Create auto-create toggle
		new Setting(containerEl)
			.setName(`Auto-create missed daily notes when starting Obsidian`)
			.setDesc(`Since last daily (` + (last ? last.format(format) : `never`) + `)`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCreate)
				.onChange(async () => {
					this.plugin.settings.autoCreate = !this.plugin.settings.autoCreate;
					await this.plugin.saveSettings();
					this.display();
				})
			);
		// Create auto-create limit slider
		if (this.plugin.settings.autoCreate) {
			let limit = new Setting(containerEl)
				.setName(`Auto-create limit: ` + this.plugin.settings.autoCreateLimit)
				.setDesc(`Maximum number of files to create without asking for confirmation.`)
				.addSlider(slider => slider
					.setValue(this.plugin.settings.autoCreateLimit)
					.setLimits(0, 10, 1)
					.onChange(async (value) => {
						this.plugin.settings.autoCreateLimit = value;
						await this.plugin.saveSettings();
						limit.setName(`Auto-create limit: ` + this.plugin.settings.autoCreateLimit)
					})
				);
		}
	}
}
