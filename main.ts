import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface DailyNoteCreatorSettings {
}

const DEFAULT_SETTINGS: DailyNoteCreatorSettings = {
}

export default class DailyNoteCreator extends Plugin {
	settings: DailyNoteCreatorSettings;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Create settings tab
		this.addSettingTab(new DailyNoteCreatorSettingTab(this.app, this));
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
