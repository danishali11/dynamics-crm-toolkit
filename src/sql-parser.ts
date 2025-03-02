/**
 * SQL Parser for Dynamics CRM SQL Query Extension
 * 
 * Parses SQL-like syntax into Dynamics Web API compatible queries
 */

interface ParsedQuery {
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  entity: string;
  fields?: string[];
  filter?: string;
  orderBy?: { field: string; direction: string }[];
  limit?: number;
  values?: Record<string, any>;
}

class SqlParser {
  /**
   * Parse a SQL-like query string into a structured query object
   */
  parse(sql: string): ParsedQuery {
    // Trim and ensure the query ends with a semicolon
    sql = sql.trim();
    if (!sql.endsWith(';')) {
      sql += ';';
    }
    
    // Determine the operation type
    if (sql.toUpperCase().startsWith('SELECT')) {
      return this.parseSelect(sql);
    } else if (sql.toUpperCase().startsWith('INSERT')) {
      return this.parseInsert(sql);
    } else if (sql.toUpperCase().startsWith('UPDATE')) {
      return this.parseUpdate(sql);
    } else if (sql.toUpperCase().startsWith('DELETE')) {
      return this.parseDelete(sql);
    } else {
      throw new Error('Unsupported SQL operation. Only SELECT, INSERT, UPDATE, and DELETE are supported.');
    }
  }
  
  /**
   * Parse a SELECT query
   */
  private parseSelect(sql: string): ParsedQuery {
    // Basic regex pattern for SELECT queries
    const pattern = /SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?;/i;
    const match = sql.match(pattern);
    
    if (!match) {
      throw new Error('Invalid SELECT query format');
    }
    
    const [, fieldsStr, entity, whereClause, orderByClause, limitStr] = match;
    
    // Parse fields
    const fields = fieldsStr.split(',').map(f => f.trim());
    
    // Create the base query object
    const query: ParsedQuery = {
      operation: 'SELECT',
      entity,
      fields
    };
    
    // Add WHERE clause if present
    if (whereClause) {
      query.filter = this.translateWhereClause(whereClause);
    }
    
    // Add ORDER BY if present
    if (orderByClause) {
      query.orderBy = this.parseOrderBy(orderByClause);
    }
    
    // Add LIMIT if present
    if (limitStr) {
      query.limit = parseInt(limitStr, 10);
    }
    
    return query;
  }
  
  /**
   * Parse an INSERT query
   */
  private parseInsert(sql: string): ParsedQuery {
    // Basic regex pattern for INSERT queries
    const pattern = /INSERT\s+INTO\s+(\w+)\s+\((.*?)\)\s+VALUES\s+\((.*?)\);/i;
    const match = sql.match(pattern);
    
    if (!match) {
      throw new Error('Invalid INSERT query format');
    }
    
    const [, entity, columnsStr, valuesStr] = match;
    
    // Parse columns and values
    const columns = columnsStr.split(',').map(c => c.trim());
    const values = valuesStr.split(',').map(v => {
      const trimmed = v.trim();
      // Handle string literals
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.substring(1, trimmed.length - 1);
      }
      // Handle numbers
      if (!isNaN(Number(trimmed))) {
        return Number(trimmed);
      }
      // Handle booleans
      if (trimmed.toLowerCase() === 'true') return true;
      if (trimmed.toLowerCase() === 'false') return false;
      // Handle null
      if (trimmed.toLowerCase() === 'null') return null;
      
      return trimmed;
    });
    
    // Create values object
    const valuesObj: Record<string, any> = {};
    columns.forEach((col, index) => {
      valuesObj[col] = values[index];
    });
    
    return {
      operation: 'INSERT',
      entity,
      values: valuesObj
    };
  }
  
  /**
   * Parse an UPDATE query
   */
  private parseUpdate(sql: string): ParsedQuery {
    // Basic regex pattern for UPDATE queries
    const pattern = /UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*?))?;/i;
    const match = sql.match(pattern);
    
    if (!match) {
      throw new Error('Invalid UPDATE query format');
    }
    
    const [, entity, setClause, whereClause] = match;
    
    // Parse SET clause
    const setValues: Record<string, any> = {};
    setClause.split(',').forEach(assignment => {
      const [column, valueStr] = assignment.split('=').map(part => part.trim());
      
      // Handle string literals
      if (valueStr.startsWith("'") && valueStr.endsWith("'")) {
        setValues[column] = valueStr.substring(1, valueStr.length - 1);
      } 
      // Handle numbers
      else if (!isNaN(Number(valueStr))) {
        setValues[column] = Number(valueStr);
      }
      // Handle booleans
      else if (valueStr.toLowerCase() === 'true') {
        setValues[column] = true;
      }
      else if (valueStr.toLowerCase() === 'false') {
        setValues[column] = false;
      }
      // Handle null
      else if (valueStr.toLowerCase() === 'null') {
        setValues[column] = null;
      }
      else {
        setValues[column] = valueStr;
      }
    });
    
    // Create the query object
    const query: ParsedQuery = {
      operation: 'UPDATE',
      entity,
      values: setValues
    };
    
    // Add WHERE clause if present
    if (whereClause) {
      query.filter = this.translateWhereClause(whereClause);
    }
    
    return query;
  }
  
  /**
   * Parse a DELETE query
   */
  private parseDelete(sql: string): ParsedQuery {
    // Basic regex pattern for DELETE queries
    const pattern = /DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?;/i;
    const match = sql.match(pattern);
    
    if (!match) {
      throw new Error('Invalid DELETE query format');
    }
    
    const [, entity, whereClause] = match;
    
    // Create the query object
    const query: ParsedQuery = {
      operation: 'DELETE',
      entity
    };
    
    // Add WHERE clause if present
    if (whereClause) {
      query.filter = this.translateWhereClause(whereClause);
    }
    
    return query;
  }
  
  /**
   * Translate SQL WHERE clause to OData filter
   */
  private translateWhereClause(whereClause: string): string {
    // Replace SQL operators with OData operators
    return whereClause
      .replace(/\s+AND\s+/gi, ' and ')
      .replace(/\s+OR\s+/gi, ' or ')
      .replace(/\s*=\s*/g, ' eq ')
      .replace(/\s*<>\s*/g, ' ne ')
      .replace(/\s*>\s*/g, ' gt ')
      .replace(/\s*<\s*/g, ' lt ')
      .replace(/\s*>=\s*/g, ' ge ')
      .replace(/\s*<=\s*/g, ' le ')
      .replace(/\s+LIKE\s+/gi, ' contains ')
      .replace(/\s+IS NULL\s*/gi, ' eq null')
      .replace(/\s+IS NOT NULL\s*/gi, ' ne null');
  }
  
  /**
   * Parse ORDER BY clause
   */
  private parseOrderBy(orderByClause: string): { field: string; direction: string }[] {
    return orderByClause.split(',').map(item => {
      const parts = item.trim().split(/\s+/);
      const field = parts[0];
      const direction = (parts[1] || 'ASC').toUpperCase() === 'DESC' ? 'desc' : 'asc';
      
      return { field, direction };
    });
  }
}

// Export a singleton instance
const sqlParser = new SqlParser();
export default sqlParser;
export type { ParsedQuery }; 