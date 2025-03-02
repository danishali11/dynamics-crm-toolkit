/**
 * Dynamics API Interface for Dynamics CRM SQL Query Extension
 * 
 * Handles communication with Dynamics Web API
 */

import { ParsedQuery } from './sql-parser';

export interface QueryResult {
  data: any[];
  totalCount?: number;
  executionTime: number;
}

export class DynamicsApi {
  private clientUrl: string | null = null;
  private apiVersion = '9.2';
  
  /**
   * Initialize the API with the client URL
   */
  public initialize(url: string): void {
    // Extract the base URL from the current Dynamics instance
    const urlObj = new URL(url);
    this.clientUrl = `${urlObj.protocol}//${urlObj.hostname}`;
  }
  
  /**
   * Execute a query against the Dynamics Web API
   */
  public async executeQuery(parsedQuery: ParsedQuery): Promise<QueryResult> {
    if (!this.clientUrl) {
      throw new Error('Dynamics API not initialized. Please navigate to a Dynamics CRM instance first.');
    }
    
    const startTime = performance.now();
    
    try {
      switch (parsedQuery.operation) {
        case 'SELECT':
          return {
            data: await this.executeRetrieve(parsedQuery),
            executionTime: performance.now() - startTime
          };
        case 'INSERT':
          return {
            data: [await this.executeCreate(parsedQuery)],
            executionTime: performance.now() - startTime
          };
        case 'UPDATE':
          return {
            data: [await this.executeUpdate(parsedQuery)],
            executionTime: performance.now() - startTime
          };
        case 'DELETE':
          return {
            data: [await this.executeDelete(parsedQuery)],
            executionTime: performance.now() - startTime
          };
        default:
          throw new Error(`Unsupported operation: ${parsedQuery.operation}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Dynamics API error: ${error.message}`);
      }
      throw new Error('Unknown Dynamics API error occurred');
    }
  }
  
  private async executeRetrieve(query: ParsedQuery): Promise<any[]> {
    const { entity, fields, filter, orderBy, limit } = query;
    
    // Build the OData URL
    let url = `${this.clientUrl}/api/data/v${this.apiVersion}/${entity}`;
    
    // Add query parameters
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
        .map(item => `${item.field} ${item.direction}`)
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
    
    // Execute the request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      },
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    return result.value || [];
  }
  
  private async executeCreate(query: ParsedQuery): Promise<any> {
    const { entity, values } = query;
    
    if (!values) {
      throw new Error('No values provided for INSERT operation');
    }
    
    // Build the OData URL
    const url = `${this.clientUrl}/api/data/v${this.apiVersion}/${entity}`;
    
    // Execute the request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      },
      body: JSON.stringify(values),
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
    }
    
    // For create operations, return the created entity ID
    const entityId = response.headers.get('OData-EntityId');
    return { id: entityId, ...values };
  }
  
  private async executeUpdate(query: ParsedQuery): Promise<any> {
    const { entity, values, filter } = query;
    
    if (!values) {
      throw new Error('No values provided for UPDATE operation');
    }
    
    if (!filter) {
      throw new Error('Filter (WHERE clause) is required for UPDATE operations');
    }
    
    // First, retrieve the records to update
    const recordsToUpdate = await this.executeRetrieve({
      operation: 'SELECT',
      entity,
      filter
    });
    
    if (recordsToUpdate.length === 0) {
      return { affectedRecords: 0 };
    }
    
    // Update each record
    const updatePromises = recordsToUpdate.map(async (record) => {
      const recordId = record[`${entity}id`];
      const url = `${this.clientUrl}/api/data/v${this.apiVersion}/${entity}(${recordId})`;
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        },
        body: JSON.stringify(values),
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }
      
      return true;
    });
    
    await Promise.all(updatePromises);
    return { affectedRecords: recordsToUpdate.length };
  }
  
  private async executeDelete(query: ParsedQuery): Promise<any> {
    const { entity, filter } = query;
    
    if (!filter) {
      throw new Error('Filter (WHERE clause) is required for DELETE operations');
    }
    
    // First, retrieve the records to delete
    const recordsToDelete = await this.executeRetrieve({
      operation: 'SELECT',
      entity,
      filter
    });
    
    if (recordsToDelete.length === 0) {
      return { affectedRecords: 0 };
    }
    
    // Delete each record
    const deletePromises = recordsToDelete.map(async (record) => {
      const recordId = record[`${entity}id`];
      const url = `${this.clientUrl}/api/data/v${this.apiVersion}/${entity}(${recordId})`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        },
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
      }
      
      return true;
    });
    
    await Promise.all(deletePromises);
    return { affectedRecords: recordsToDelete.length };
  }
}

export default new DynamicsApi(); 