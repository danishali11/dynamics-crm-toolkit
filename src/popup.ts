/**
 * Popup script for Dynamics CRM Toolkit
 */

import sqlParser from './sql-parser';
import dynamicsApi from './dynamics-api';
import resultsHandler from './results-handler';

class PopupController {
  private sqlQueryTextarea!: HTMLTextAreaElement;
  private executeButton!: HTMLButtonElement;
  private clearButton!: HTMLButtonElement;
  private openQueryToolButton!: HTMLButtonElement;
  private viewAllFieldsButton!: HTMLButtonElement;
  private statusMessage!: HTMLElement;
  private settingsButton!: HTMLButtonElement;
  
  private isOnRecordForm = false;
  private currentEntityName = '';
  private currentRecordId = '';
  
  constructor() {
    this.initElements();
    this.initEventListeners();
    this.checkCurrentPage();
    
    // Test SQL parser
    try {
      const testQuery = "SELECT name, accountid FROM account LIMIT 10";
      const parsed = sqlParser.parse(testQuery);
      console.log('SQL Parser test:', { testQuery, parsed });
    } catch (error) {
      console.error('SQL Parser test failed:', error);
    }
  }
  
  private initElements(): void {
    this.sqlQueryTextarea = document.getElementById('sql-query') as HTMLTextAreaElement;
    this.executeButton = document.getElementById('execute-btn') as HTMLButtonElement;
    this.clearButton = document.getElementById('clear-btn') as HTMLButtonElement;
    this.openQueryToolButton = document.getElementById('open-query-tool') as HTMLButtonElement;
    this.viewAllFieldsButton = document.getElementById('view-all-fields') as HTMLButtonElement;
    this.statusMessage = document.getElementById('status-message') as HTMLElement;
    this.settingsButton = document.getElementById('settings-btn') as HTMLButtonElement;
  }
  
  private initEventListeners(): void {
    this.executeButton.addEventListener('click', () => this.executeQuickQuery());
    this.clearButton.addEventListener('click', () => this.clearQuery());
    this.openQueryToolButton.addEventListener('click', () => this.openQueryTool());
    this.viewAllFieldsButton.addEventListener('click', () => this.openRecordInspector());
    this.settingsButton.addEventListener('click', () => this.openSettings());
    
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'dynamicsDetected') {
        this.onDynamicsDetected(message.url);
      } else if (message.action === 'recordFormDetected') {
        this.onRecordFormDetected(message.entityName, message.recordId);
      }
    });
  }
  
  private checkCurrentPage(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'checkCurrentPage' },
          (response) => {
            // Ignore errors from tabs where content script isn't loaded
            if (chrome.runtime.lastError) {
              console.log('Error checking current page:', chrome.runtime.lastError.message);
              return;
            }
            
            console.log('Current page check response:', response);
            
            if (response?.isDynamicsCrm) {
              this.onDynamicsDetected(tabs[0].url || '');
              
              if (response.isRecordForm) {
                this.onRecordFormDetected(response.entityName, response.recordId);
              }
            }
          }
        );
      }
    });
  }
  
  private async executeQuickQuery(): Promise<void> {
    const query = this.sqlQueryTextarea.value.trim();
    
    if (!query) {
      this.showStatus('Please enter a SQL query', 'error');
      return;
    }
    
    this.showStatus('Executing query...', 'normal');
    this.executeButton.disabled = true;
    
    try {
      console.log('Parsing query:', query);
      // Parse the SQL query
      const parsedQuery = sqlParser.parse(query);
      console.log('Parsed query:', parsedQuery);
      
      // Store the query in local storage for the query tool
      await chrome.storage.local.set({
        pendingQuery: {
          query,
          executing: true,
          parsedQuery // Store the parsed query too
        }
      });
      
      // Open the query tool page which will execute the query
      chrome.tabs.create({ url: 'query-tool.html' });
      
    } catch (error) {
      console.error('Error executing query:', error);
      if (error instanceof Error) {
        this.showStatus(`Error: ${error.message}`, 'error');
      } else {
        this.showStatus('An unknown error occurred', 'error');
      }
      this.executeButton.disabled = false;
    }
  }
  
  private clearQuery(): void {
    this.sqlQueryTextarea.value = '';
    this.showStatus('Ready', 'normal');
  }
  
  private openQueryTool(): void {
    chrome.tabs.create({ url: 'query-tool.html' });
  }
  
  private openQueryToolWithResults(query: string, results: any): void {
    // Store the query and results in local storage
    chrome.storage.local.set({
      pendingQuery: {
        query,
        results
      }
    }, () => {
      // Open the query tool page
      chrome.tabs.create({ url: 'query-tool.html' });
    });
  }
  
  private openRecordInspector(): void {
    // Store the current record info in local storage
    chrome.storage.local.set({
      currentRecord: {
        entityName: this.currentEntityName,
        recordId: this.currentRecordId
      }
    }, () => {
      // Open the record inspector page
      chrome.tabs.create({ url: 'record-inspector.html' });
    });
  }
  
  private openSettings(): void {
    // To be implemented in future versions
    this.showStatus('Settings will be available in a future version', 'normal');
  }
  
  private showStatus(message: string, type: 'normal' | 'error' | 'success'): void {
    this.statusMessage.textContent = message;
    this.statusMessage.className = type;
  }
  
  private onDynamicsDetected(url: string): void {
    // Extract just the base URL (domain) from the current URL
    let orgUrl = url;
    try {
      const urlObj = new URL(url);
      orgUrl = `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (e) {
      console.error('Error parsing URL:', e);
    }
    
    // Initialize the Dynamics API with the current URL
    dynamicsApi.initialize(orgUrl);
    
    // Store the organization URL for later use
    chrome.storage.local.set({ orgUrl });
    
    this.showStatus('Connected to Dynamics CRM', 'success');
  }
  
  private onRecordFormDetected(entityName: string, recordId: string): void {
    this.isOnRecordForm = true;
    this.currentEntityName = entityName;
    
    // Clean up the record ID - remove any curly braces
    this.currentRecordId = recordId.replace(/[{}]/g, '');
    
    console.log('Record form detected:', { 
      entityName: this.currentEntityName, 
      recordId: this.currentRecordId 
    });
    
    // Enable the View All Fields button
    this.viewAllFieldsButton.disabled = false;
  }
}

// Initialize the popup controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
}); 