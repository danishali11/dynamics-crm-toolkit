/**
 * Results Handler for Dynamics CRM SQL Query Extension
 * 
 * Formats and processes query results
 */

import { QueryResult } from './dynamics-api';

export interface FormattedResult {
  columns: string[];
  rows: any[][];
  totalCount: number;
  executionTime: number;
}

export class ResultsHandler {
  /**
   * Format query results for display
   */
  public formatResults(queryResult: QueryResult): FormattedResult {
    const { data, executionTime } = queryResult;
    
    if (!data || data.length === 0) {
      return {
        columns: [],
        rows: [],
        totalCount: 0,
        executionTime
      };
    }
    
    // Extract column names from the first result
    const columns = Object.keys(data[0]);
    
    // Convert data to rows
    const rows = data.map(item => columns.map(col => item[col]));
    
    return {
      columns,
      rows,
      totalCount: data.length,
      executionTime
    };
  }
  
  /**
   * Export results to CSV format
   */
  public exportToCsv(formattedResult: FormattedResult): string {
    const { columns, rows } = formattedResult;
    
    if (columns.length === 0) {
      return '';
    }
    
    // Create CSV header
    let csv = columns.join(',') + '\n';
    
    // Add rows
    rows.forEach(row => {
      const csvRow = row.map(cell => {
        // Handle null values
        if (cell === null || cell === undefined) {
          return '';
        }
        
        // Convert to string and escape quotes
        const cellStr = String(cell).replace(/"/g, '""');
        
        // Wrap in quotes if contains comma, newline, or quotes
        if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
          return `"${cellStr}"`;
        }
        
        return cellStr;
      }).join(',');
      
      csv += csvRow + '\n';
    });
    
    return csv;
  }
  
  /**
   * Download CSV file
   */
  public downloadCsv(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  /**
   * Sort results by column
   */
  public sortResults(formattedResult: FormattedResult, columnIndex: number, ascending: boolean): FormattedResult {
    const { columns, rows, totalCount, executionTime } = formattedResult;
    
    if (columns.length === 0 || rows.length === 0) {
      return formattedResult;
    }
    
    // Sort rows
    const sortedRows = [...rows].sort((a, b) => {
      const valueA = a[columnIndex];
      const valueB = b[columnIndex];
      
      // Handle null values
      if (valueA === null && valueB === null) return 0;
      if (valueA === null) return ascending ? -1 : 1;
      if (valueB === null) return ascending ? 1 : -1;
      
      // Compare based on data type
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return ascending ? valueA - valueB : valueB - valueA;
      }
      
      // Default string comparison
      const strA = String(valueA).toLowerCase();
      const strB = String(valueB).toLowerCase();
      
      return ascending ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
    
    return {
      columns,
      rows: sortedRows,
      totalCount,
      executionTime
    };
  }
}

export default new ResultsHandler(); 