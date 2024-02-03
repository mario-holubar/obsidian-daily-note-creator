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

export default class DailyNoteCreator extends Plugin {
	settings: DailyNoteCreatorSettings;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Create settings tab
		this.addSettingTab(new DailyNoteCreatorSettingTab(this.app, this));
		
		this.app.workspace.onLayoutReady(async () => {
			const dailyNotes = await getAllDailyNotes();
			const { first, last } = getFirstAndLastDates(dailyNotes);
			const missing = findMissingDates(dailyNotes, first, last);
			console.log(missing);
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
