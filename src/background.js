/**
 * Background script for Dynamics CRM SQL Query Extension
 * 
 * Handles extension initialization and communication between components
 */

// Listen for tab updates to detect when user navigates to a Dynamics CRM instance
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if the URL is a Dynamics CRM instance
    if (tab.url.match(/dynamics\.com/) || tab.url.match(/crm\.dynamics\.com/)) {
      // Inject the content script if not already injected
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not yet injected, inject it
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          });
        }
      });
    }
  }
});

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open onboarding page or show welcome notification
    chrome.tabs.create({
      url: 'https://github.com/yourusername/dynamics-crm-sql-query-extension/wiki/getting-started'
    });
  }
}); 