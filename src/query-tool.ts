/**
 * Query Tool script for Dynamics CRM Toolkit
 */

import sqlParser from './sql-parser';
import dynamicsApi from './dynamics-api';
import resultsHandler from './results-handler';
import { FormattedResult } from './results-handler';

class QueryToolController {
  private sqlQueryTextarea!: HTMLTextAreaElement;
  private executeButton!: HTMLButtonElement;
  private clearButton!: HTMLButtonElement;
  private exportButton!: HTMLButtonElement;
  private statusMessage!: HTMLElement;
  private executionTime!: HTMLElement;
  private recordCount!: HTMLElement;
  private resultsSection!: HTMLElement;
  private resultsHeader!: HTMLElement;
  private resultsBody!: HTMLElement;
  private prevPageButton!: HTMLButtonElement;
  private nextPageButton!: HTMLButtonElement;
  private pageInfo!: HTMLElement;
  private backButton!: HTMLButtonElement;
  
  private currentResult: FormattedResult | null = null;
  private currentPage = 1;
  private pageSize = 50;
  private sortColumn = 0;
  private sortAscending = true;
  
  constructor() {
    this.initElements();
    this.initEventListeners();
    this.loadSavedQuery();
    this.checkPendingQuery();
  }
  
  private initElements(): void {
    this.sqlQueryTextarea = document.getElementById('sql-query') as HTMLTextAreaElement;
    this.executeButton = document.getElementById('execute-btn') as HTMLButtonElement;
    this.clearButton = document.getElementById('clear-btn') as HTMLButtonElement;
    this.exportButton = document.getElementById('export-btn') as HTMLButtonElement;
    this.statusMessage = document.getElementById('status-message') as HTMLElement;
    this.executionTime = document.getElementById('execution-time') as HTMLElement;
    this.recordCount = document.getElementById('record-count') as HTMLElement;
    this.resultsSection = document.getElementById('results-section') as HTMLElement;
    this.resultsHeader = document.getElementById('results-header') as HTMLElement;
    this.resultsBody = document.getElementById('results-body') as HTMLElement;
    this.prevPageButton = document.getElementById('prev-page') as HTMLButtonElement;
    this.nextPageButton = document.getElementById('next-page') as HTMLButtonElement;
    this.pageInfo = document.getElementById('page-info') as HTMLElement;
    this.backButton = document.getElementById('back-btn') as HTMLButtonElement;
  }
  
  private initEventListeners(): void {
    this.executeButton.addEventListener('click', () => this.executeQuery());
    this.clearButton.addEventListener('click', () => this.clearQuery());
    this.exportButton.addEventListener('click', () => this.exportResults());
    this.backButton.addEventListener('click', () => window.close());
    
    this.prevPageButton.addEventListener('click', () => this.goToPreviousPage());
    this.nextPageButton.addEventListener('click', () => this.goToNextPage());
    
    // Save query as user types
    this.sqlQueryTextarea.addEventListener('input', () => {
      this.saveQuery();
    });
  }
  
  private checkPendingQuery(): void {
    chrome.storage.local.get(['pendingQuery'], (result) => {
      if (result.pendingQuery) {
        const { query, results, executing } = result.pendingQuery;
        
        // Set the query in the textarea
        this.sqlQueryTextarea.value = query;
        
        if (results) {
          // Process the results
          this.processQueryResults(results);
        } else if (executing) {
          // Execute the query
          this.executeQuery();
        }
        
        // Clear the pending query
        chrome.storage.local.remove('pendingQuery');
      }
    });
  }
  
  private async executeQuery(): Promise<void> {
    const query = this.sqlQueryTextarea.value.trim();
    
    if (!query) {
      this.showStatus('Please enter a SQL query', 'error');
      return;
    }
    
    this.showStatus('Executing query...', 'normal');
    this.executeButton.disabled = true;
    
    try {
      // Parse the SQL query
      const parsedQuery = sqlParser.parse(query);
      
      // Get the organization URL
      const orgStorage = await chrome.storage.local.get(['orgUrl']);
      let orgUrl = orgStorage.orgUrl || '';
      
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
      
      // Build the URL for the query
      const url = this.buildQueryUrl(orgUrl, parsedQuery);
      console.log('API URL:', url);
      
      // Determine HTTP method based on operation
      let method = 'GET';
      let body = null;
      
      switch (parsedQuery.operation) {
        case 'SELECT':
          method = 'GET';
          break;
        case 'INSERT':
          method = 'POST';
          body = JSON.stringify(parsedQuery.values);
          break;
        case 'UPDATE':
          method = 'PATCH';
          body = JSON.stringify(parsedQuery.values);
          break;
        case 'DELETE':
          method = 'DELETE';
          break;
      }
      
      // Execute the query directly
      const startTime = performance.now();
      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body,
        credentials: 'include' // Include credentials
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }
      
      // Handle different response types based on operation
      let data;
      if (method === 'GET') {
        data = await response.json();
        this.processQueryResults(data.value || []);
        this.recordCount.textContent = `Records: ${data.value?.length || 0}`;
      } else {
        // For non-GET operations, show success message
        this.recordCount.textContent = 'Operation completed successfully';
        
        // For DELETE and UPDATE, show affected records
        if (method === 'DELETE' || method === 'PATCH') {
          this.processQueryResults([{ result: 'Operation completed successfully' }]);
        } else if (method === 'POST') {
          // For INSERT, try to get the created entity ID
          const entityId = response.headers.get('OData-EntityId');
          this.processQueryResults([{ 
            result: 'Record created successfully', 
            entityId: entityId || 'ID not available'
          }]);
        }
      }
      
      const endTime = performance.now();
      
      // Update execution info
      this.executionTime.textContent = `Execution time: ${(endTime - startTime).toFixed(2)}ms`;
      
      this.showStatus('Query executed successfully', 'success');
    } catch (error) {
      console.error('Error executing query:', error);
      if (error instanceof Error) {
        this.showStatus(`Error: ${error.message}`, 'error');
      } else {
        this.showStatus('An unknown error occurred', 'error');
      }
    } finally {
      this.executeButton.disabled = false;
    }
  }
  
  private buildQueryUrl(orgUrl: string, parsedQuery: any): string {
    const { entity, fields, filter, orderBy, limit, values } = parsedQuery;
    
    // Build the OData URL - use entity name as provided by user
    let url = `${orgUrl}/api/data/v9.2/${entity}`;
    
    // For UPDATE operations, we need to handle them differently
    if (parsedQuery.operation === 'UPDATE' && filter) {
      // For UPDATE, we need to first retrieve the record ID using the filter
      // This is a simplification - in a real app, you'd need to handle this more robustly
      // For now, we'll assume the filter is in the format "fieldname eq 'value'"
      // and we'll extract the ID from there if possible
      
      // Check if the filter is directly specifying an ID
      const idMatch = filter.match(/(\w+id)\s+eq\s+'([^']+)'/i);
      if (idMatch) {
        const [_, idField, idValue] = idMatch;
        // Format the ID properly - remove curly braces if present
        const formattedId = idValue.replace(/[{}]/g, '');
        // For UPDATE, we need to specify the ID in the URL
        return `${url}(${formattedId})`;
      }
      
      // If we can't extract an ID, we'll use the filter as is
      // This might not work for all cases but is a reasonable fallback
      url += `?$filter=${filter}`;
      return url;
    }
    
    // For DELETE operations that need a specific record
    if (parsedQuery.operation === 'DELETE' && filter) {
      // Similar logic as UPDATE
      const idMatch = filter.match(/(\w+id)\s+eq\s+'([^']+)'/i);
      if (idMatch) {
        const [_, idField, idValue] = idMatch;
        const formattedId = idValue.replace(/[{}]/g, '');
        return `${url}(${formattedId})`;
      }
      
      url += `?$filter=${filter}`;
      return url;
    }
    
    // Add query parameters for SELECT operations
    if (parsedQuery.operation === 'SELECT') {
      const params = new URLSearchParams();
      
      // Select fields
      if (fields && fields.length > 0) {
        params.append('$select', fields.join(','));
      }
      
      // Filter
      if (filter) {
        params.append('$filter', filter);
      }
      
      // Order by
      if (orderBy && orderBy.length > 0) {
        const orderByStr = orderBy
          .map((item: { field: string; direction: string }) => `${item.field} ${item.direction}`)
          .join(',');
        params.append('$orderby', orderByStr);
      }
      
      // Top (limit)
      if (limit) {
        params.append('$top', limit.toString());
      }
      
      // Append parameters to URL
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    
    return url;
  }
  
  private clearQuery(): void {
    this.sqlQueryTextarea.value = '';
    this.showStatus('Ready', 'normal');
  }
  
  private exportResults(): void {
    // Implementation of exportResults method
  }
  
  private processQueryResults(results: any[]): void {
    if (!results || results.length === 0) {
      this.showStatus('No results found', 'normal');
      return;
    }
    
    // Make results section visible
    this.resultsSection.classList.remove('hidden');
    
    // Get column names from the first result
    const columns = Object.keys(results[0]);
    
    // Create header row
    this.resultsHeader.innerHTML = '';
    const headerRow = document.createElement('tr');
    
    columns.forEach(column => {
      const th = document.createElement('th');
      th.textContent = column;
      th.addEventListener('click', () => this.sortResults(column));
      headerRow.appendChild(th);
    });
    
    this.resultsHeader.appendChild(headerRow);
    
    // Store the formatted result
    this.currentResult = {
      columns,
      rows: results.map(item => columns.map(col => item[col])),
      totalCount: results.length,
      executionTime: 0
    };
    
    // Create result rows (paginated) - moved after setting currentResult
    this.displayResultPage();
  }
  
  private displayResultPage(): void {
    if (!this.currentResult) return;
    
    const { columns, rows } = this.currentResult;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, rows.length);
    
    this.resultsBody.innerHTML = '';
    
    for (let i = startIndex; i < endIndex; i++) {
      const row = rows[i];
      const tr = document.createElement('tr');
      
      row.forEach(cell => {
        const td = document.createElement('td');
        
        if (cell === null || cell === undefined) {
          td.textContent = 'null';
          td.classList.add('null-value');
        } else if (typeof cell === 'object') {
          td.textContent = JSON.stringify(cell);
        } else {
          td.textContent = String(cell);
        }
        
        tr.appendChild(td);
      });
      
      this.resultsBody.appendChild(tr);
    }
    
    // Update pagination
    this.updatePagination();
  }
  
  private updatePagination(): void {
    if (!this.currentResult) return;
    
    const totalPages = Math.ceil(this.currentResult.totalCount / this.pageSize);
    this.pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
    
    this.prevPageButton.disabled = this.currentPage <= 1;
    this.nextPageButton.disabled = this.currentPage >= totalPages;
  }
  
  private goToPreviousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.displayResultPage();
    }
  }
  
  private goToNextPage(): void {
    if (this.currentResult) {
      const totalPages = Math.ceil(this.currentResult.totalCount / this.pageSize);
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.displayResultPage();
      }
    }
  }
  
  private sortResults(column: string): void {
    if (!this.currentResult) return;
    
    const columnIndex = this.currentResult.columns.indexOf(column);
    if (columnIndex === -1) return;
    
    // Toggle sort direction if clicking the same column
    if (this.sortColumn === columnIndex) {
      this.sortAscending = !this.sortAscending;
    } else {
      this.sortColumn = columnIndex;
      this.sortAscending = true;
    }
    
    // Sort the rows
    this.currentResult.rows.sort((a, b) => {
      const valueA = a[columnIndex];
      const valueB = b[columnIndex];
      
      // Handle null values
      if (valueA === null && valueB === null) return 0;
      if (valueA === null) return this.sortAscending ? -1 : 1;
      if (valueB === null) return this.sortAscending ? 1 : -1;
      
      // Compare based on data type
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return this.sortAscending ? valueA - valueB : valueB - valueA;
      }
      
      // Default string comparison
      const strA = String(valueA).toLowerCase();
      const strB = String(valueB).toLowerCase();
      
      return this.sortAscending ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
    
    // Reset to first page and display results
    this.currentPage = 1;
    this.displayResultPage();
  }
  
  private showStatus(message: string, type: 'normal' | 'error' | 'success'): void {
    this.statusMessage.textContent = message;
    this.statusMessage.className = type;
  }
  
  private saveQuery(): void {
    // Implementation of saveQuery method
  }
  
  private loadSavedQuery(): void {
    // Implementation of loadSavedQuery method
  }
}

// Initialize the query tool controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new QueryToolController();
}); 