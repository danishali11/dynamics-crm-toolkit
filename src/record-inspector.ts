/**
 * Record Inspector script for Dynamics CRM Toolkit
 */

import dynamicsApi from './dynamics-api';
import resultsHandler from './results-handler';

interface FieldInfo {
  displayName: string;
  schemaName: string;
  value: any;
  type: string;
}

class RecordInspectorController {
  private entityNameElement!: HTMLElement;
  private recordIdElement!: HTMLElement;
  private statusMessage!: HTMLElement;
  private fieldFilterInput!: HTMLInputElement;
  private showNullCheckbox!: HTMLInputElement;
  private showSystemCheckbox!: HTMLInputElement;
  private fieldsBody!: HTMLElement;
  private exportButton!: HTMLButtonElement;
  private backButton!: HTMLButtonElement;
  
  private entityName = '';
  private recordId = '';
  private allFields: FieldInfo[] = [];
  
  constructor() {
    this.initElements();
    this.initEventListeners();
    this.loadRecordInfo();
  }
  
  private initElements(): void {
    this.entityNameElement = document.getElementById('entity-name') as HTMLElement;
    this.recordIdElement = document.getElementById('record-id') as HTMLElement;
    this.statusMessage = document.getElementById('status-message') as HTMLElement;
    this.fieldFilterInput = document.getElementById('field-filter') as HTMLInputElement;
    this.showNullCheckbox = document.getElementById('show-null') as HTMLInputElement;
    this.showSystemCheckbox = document.getElementById('show-system') as HTMLInputElement;
    this.fieldsBody = document.getElementById('fields-body') as HTMLElement;
    this.exportButton = document.getElementById('export-btn') as HTMLButtonElement;
    this.backButton = document.getElementById('back-btn') as HTMLButtonElement;
  }
  
  private initEventListeners(): void {
    this.fieldFilterInput.addEventListener('input', () => this.filterFields());
    this.showNullCheckbox.addEventListener('change', () => this.filterFields());
    this.showSystemCheckbox.addEventListener('change', () => this.filterFields());
    this.exportButton.addEventListener('click', () => this.exportFields());
    this.backButton.addEventListener('click', () => window.close());
  }
  
  private loadRecordInfo(): void {
    chrome.storage.local.get(['currentRecord'], (result) => {
      if (result.currentRecord) {
        const { entityName, recordId } = result.currentRecord;
        
        console.log('Loaded record info from storage:', { entityName, recordId });
        
        this.entityName = entityName;
        this.recordId = recordId;
        
        // Update UI
        this.entityNameElement.textContent = `Entity: ${entityName}`;
        this.recordIdElement.textContent = `ID: ${recordId}`;
        
        // Load record data
        this.loadRecordData();
      } else {
        this.showStatus('No record information found. Please open this page from a Dynamics record.', 'error');
      }
    });
  }
  
  private async loadRecordData(): Promise<void> {
    try {
      this.showStatus('Loading record data...', 'normal');
      
      // Get all record data
      const record = await this.fetchRecordData();
      
      if (!record) {
        throw new Error('Record not found');
      }
      
      // Process fields
      this.allFields = this.processFields(record);
      
      // Display fields
      this.displayFields(this.allFields);
      
      this.showStatus(`Loaded ${this.allFields.length} fields`, 'success');
    } catch (error) {
      if (error instanceof Error) {
        this.showStatus(`Error: ${error.message}`, 'error');
      } else {
        this.showStatus('An unknown error occurred', 'error');
      }
    }
  }
  
  private async fetchRecordData(): Promise<any> {
    return new Promise((resolve, reject) => {
      // First try to use the active tab to fetch data
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { 
              action: 'fetchRecordData',
              entityName: this.entityName,
              recordId: this.recordId
            },
            (response) => {
              // If there's an error communicating with the tab
              if (chrome.runtime.lastError) {
                console.error('Tab communication error:', chrome.runtime.lastError);
                // Fall back to direct API call
                this.fetchRecordDataDirect()
                  .then(resolve)
                  .catch(reject);
                return;
              }
              
              if (response?.error) {
                reject(new Error(response.error));
              } else if (response?.record) {
                resolve(response.record);
              } else {
                reject(new Error('Invalid response from content script'));
              }
            }
          );
        } else {
          // No active tab, use direct method
          this.fetchRecordDataDirect()
            .then(resolve)
            .catch(reject);
        }
      });
    });
  }
  
  // Direct API call as fallback
  private async fetchRecordDataDirect(): Promise<any> {
    try {
      // Get the organization URL from storage
      const storage = await chrome.storage.local.get(['orgUrl']);
      let orgUrl = storage.orgUrl || '';
      
      if (!orgUrl) {
        throw new Error('Organization URL not found. Please navigate to Dynamics CRM first.');
      }
      
      // Extract just the base URL (domain) from the stored URL
      try {
        const urlObj = new URL(orgUrl);
        orgUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      } catch (e) {
        console.error('Error parsing URL:', e);
      }
      
      this.showStatus('Fetching record data directly...', 'normal');
      
      // Convert entity name to plural form for Web API
      const pluralEntityName = this.getPluralEntityName(this.entityName);
      
      // Format the record ID properly - remove curly braces if present
      const formattedRecordId = this.recordId.replace(/[{}]/g, '');
      
      // Use the Web API directly with credentials - without $select=*
      const url = `${orgUrl}/api/data/v9.2/${pluralEntityName}(${formattedRecordId})`;
      console.log('API URL:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        },
        credentials: 'include' // This is key - include credentials
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Direct fetch error:', error);
      throw error;
    }
  }
  
  // Helper method to convert entity name to plural form
  private getPluralEntityName(entityName: string): string {
    // Common Dynamics entity pluralization rules
    const commonEntities: Record<string, string> = {
      'account': 'accounts',
      'contact': 'contacts',
      'lead': 'leads',
      'opportunity': 'opportunities',
      'systemuser': 'systemusers',
      'team': 'teams',
      'businessunit': 'businessunits',
      'incident': 'incidents',
      'annotation': 'annotations',
      'email': 'emails',
      'task': 'tasks',
      'appointment': 'appointments',
      'activitypointer': 'activitypointers',
      'phonecall': 'phonecalls',
      'letter': 'letters',
      'fax': 'faxes',
      'recurringappointmentmaster': 'recurringappointmentmasters',
      'socialactivity': 'socialactivities',
      'workflow': 'workflows',
      'processsession': 'processsessions',
      'queue': 'queues',
      'queueitem': 'queueitems'
    };
    
    // Check if it's a common entity
    if (commonEntities[entityName.toLowerCase()]) {
      return commonEntities[entityName.toLowerCase()];
    }
    
    // Basic pluralization rule (add 's')
    return entityName + 's';
  }
  
  private processFields(record: any): FieldInfo[] {
    const fields: FieldInfo[] = [];
    
    for (const key in record) {
      // Skip internal properties
      if (key.startsWith('@')) continue;
      
      const value = record[key];
      
      fields.push({
        displayName: this.formatDisplayName(key),
        schemaName: key,
        value: value,
        type: this.getFieldType(value)
      });
    }
    
    // Sort by display name
    return fields.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  
  private formatDisplayName(schemaName: string): string {
    // Convert camelCase or snake_case to Title Case with spaces
    return schemaName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
  
  private getFieldType(value: any): string {
    if (value === null || value === undefined) return 'Null';
    if (typeof value === 'string') return 'String';
    if (typeof value === 'number') return 'Number';
    if (typeof value === 'boolean') return 'Boolean';
    if (value instanceof Date) return 'DateTime';
    if (typeof value === 'object') return 'Object';
    
    return 'Unknown';
  }
  
  private displayFields(fields: FieldInfo[]): void {
    this.fieldsBody.innerHTML = '';
    
    if (fields.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No fields found';
      td.style.textAlign = 'center';
      td.style.padding = '20px';
      tr.appendChild(td);
      this.fieldsBody.appendChild(tr);
      return;
    }
    
    fields.forEach(field => {
      const tr = document.createElement('tr');
      
      // Display Name
      const tdName = document.createElement('td');
      tdName.textContent = field.displayName;
      tr.appendChild(tdName);
      
      // Schema Name
      const tdSchema = document.createElement('td');
      tdSchema.textContent = field.schemaName;
      tr.appendChild(tdSchema);
      
      // Value
      const tdValue = document.createElement('td');
      if (field.value === null || field.value === undefined) {
        tdValue.textContent = 'null';
        tdValue.classList.add('null-value');
      } else if (typeof field.value === 'object') {
        tdValue.textContent = JSON.stringify(field.value);
      } else {
        tdValue.textContent = String(field.value);
      }
      tr.appendChild(tdValue);
      
      // Type
      const tdType = document.createElement('td');
      tdType.textContent = field.type;
      tr.appendChild(tdType);
      
      this.fieldsBody.appendChild(tr);
    });
  }
  
  private filterFields(): void {
    const filterText = this.fieldFilterInput.value.toLowerCase();
    const showNull = this.showNullCheckbox.checked;
    const showSystem = this.showSystemCheckbox.checked;
    
    const filteredFields = this.allFields.filter(field => {
      // Filter by text
      const matchesFilter = 
        field.displayName.toLowerCase().includes(filterText) ||
        field.schemaName.toLowerCase().includes(filterText);
      
      if (!matchesFilter) return false;
      
      // Filter null values
      if (!showNull && (field.value === null || field.value === undefined)) {
        return false;
      }
      
      // Filter system fields (starting with underscore or containing certain patterns)
      if (!showSystem && (
        field.schemaName.startsWith('_') || 
        field.schemaName.endsWith('_base') ||
        field.schemaName.includes('versionnumber')
      )) {
        return false;
      }
      
      return true;
    });
    
    this.displayFields(filteredFields);
  }
  
  private exportFields(): void {
    // Get visible fields
    const visibleFields = Array.from(this.fieldsBody.querySelectorAll('tr')).map(row => {
      const cells = row.querySelectorAll('td');
      return {
        displayName: cells[0].textContent || '',
        schemaName: cells[1].textContent || '',
        value: cells[2].textContent || '',
        type: cells[3].textContent || ''
      };
    });
    
    // Create CSV content
    let csv = 'Display Name,Schema Name,Value,Type\n';
    
    visibleFields.forEach(field => {
      const escapedValue = field.value.replace(/"/g, '""');
      csv += `"${field.displayName}","${field.schemaName}","${escapedValue}","${field.type}"\n`;
    });
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${this.entityName}_${this.recordId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  private showStatus(message: string, type: 'normal' | 'error' | 'success'): void {
    this.statusMessage.textContent = message;
    this.statusMessage.className = type;
  }
}

// Initialize the record inspector controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new RecordInspectorController();
}); 