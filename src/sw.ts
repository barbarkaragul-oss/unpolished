/**
 * The service worker: the toolbar button opens the side panel; the right-click menu and the shortcut put the page
 * script into the current tab (activeTab: only that tab, only then) and open the panel next to the field. The page
 * script is registered for every site only when the user turns "everywhere" on and grants that permission.
 */
import { load } from './settings';

const EVERYWHERE = 'unpolished-everywhere';

async function syncEverywhere(): Promise<void> {
  const s = await load();
  const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [EVERYWHERE] });
  if (s.everywhere && granted && registered.length === 0) {
    await chrome.scripting.registerContentScripts([{ id: EVERYWHERE, matches: ['<all_urls>'], js: ['content.js'], runAt: 'document_idle', allFrames: false }]);
  } else if (!(s.everywhere && granted) && registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [EVERYWHERE] });
  }
}

async function openIn(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  await chrome.tabs.sendMessage(tabId, { type: 'unpolished:open' });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'unpolish', title: chrome.i18n.getMessage('menu') || 'Unpolish this', contexts: ['editable', 'selection'] });
  void syncEverywhere();
});
chrome.runtime.onStartup.addListener(() => { void syncEverywhere(); });
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'unpolish' && tab?.id !== undefined) void openIn(tab.id).catch(() => undefined);
});
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'unpolish' && tab?.id !== undefined) void openIn(tab.id).catch(() => undefined);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) void syncEverywhere();
});
chrome.permissions.onAdded.addListener(() => { void syncEverywhere(); });
chrome.permissions.onRemoved.addListener(() => { void syncEverywhere(); });
