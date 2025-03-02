/**
 * Content script for Dynamics CRM SQL Query Extension
 * 
 * Runs in the context of the Dynamics CRM page and interacts with the Dynamics Web API
 */

// Check if we're on a Dynamics CRM page
function isDynamicsCrmPage() {
  return window.location.hostname.includes('dynamics.com') || 
         window.location.hostname.includes('crm.dynamics.com');
}

// Get the client URL for the current Dynamics instance
function getClientUrl() {
  return window.location.origin;
}

// Execute a query against the Dynamics Web API - more robust
async function executeQuery(parsedQuery) {
  try {
    console.log('Executing query:', parsedQuery);
    
    if (parsedQuery.operation !== 'SELECT') {
      throw new Error('Only SELECT operations are currently supported');
    }
    
    console.log('Building URL for query');
    const url = buildRetrieveUrl(parsedQuery);
    console.log('Query URL:', url);
    
    console.log('Retrieving records...');
    const records = await retrieveRecords(url);
    console.log('Retrieved records:', records);
    
    return records;
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  }
}

// Build the URL for a retrieve operation
function buildRetrieveUrl(query) {
  const { entity, fields, filter, orderBy, limit } = query;
  
  // Build the OData URL
  let url = `${getClientUrl()}/api/data/v9.2/${entity}`;
  
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
  
  return url;
}

// Retrieve records from Dynamics Web API
async function retrieveRecords(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
  }
  
  const result = await response.json();
  return result.value || [];
}

// Check if we're on a record form - more robust detection
function isRecordForm() {
  // Try multiple detection methods
  const methods = [
    // Method 1: Check for form data attributes
    () => document.querySelector('form[data-id]') !== null,
    
    // Method 2: Check for div with data-etn attribute
    () => document.querySelector('div[data-etn]') !== null,
    
    // Method 3: Check for form elements with specific Dynamics classes
    () => document.querySelector('.form-section, .form-cell, .form-control') !== null,
    
    // Method 4: Check URL for form indicators
    () => window.location.href.includes('pagetype=entityrecord'),
    
    // Method 5: Check for Xrm form object in global scope
    () => typeof window.Xrm !== 'undefined' && window.Xrm.Page && window.Xrm.Page.data
  ];
  
  // Try each method
  for (const method of methods) {
    try {
      if (method()) {
        console.log('Form detected using method:', method.toString());
        return true;
      }
    } catch (e) {
      console.error('Error in form detection method:', e);
    }
  }
  
  return false;
}

// Get current record information
function getCurrentRecordInfo() {
  try {
    // Try to get record info from Xrm context
    if (window.Xrm && window.Xrm.Page && window.Xrm.Page.data && window.Xrm.Page.data.entity) {
      const entityName = Xrm.Page.data.entity.getEntityName();
      let recordId = Xrm.Page.data.entity.getId();
      
      // Remove curly braces if present
      recordId = recordId.replace(/[{}]/g, '');
      
      return { entityName, recordId };
    }
    
    // Fallback: Try to extract from URL
    const url = window.location.href;
    
    // More precise URL parsing for Dynamics CRM
    // Look specifically for the id parameter, not just any parameter
    const entityMatch = url.match(/[?&]etn=([^&]+)/);
    const idMatch = url.match(/[?&]id=([^&]+)/);
    
    if (entityMatch && idMatch) {
      const entityName = decodeURIComponent(entityMatch[1]);
      let recordId = decodeURIComponent(idMatch[1]);
      
      // Remove curly braces if present
      recordId = recordId.replace(/[{}]/g, '');
      
      return { entityName, recordId };
    }
    
    return { entityName: '', recordId: '' };
  } catch (error) {
    console.error('Error getting record info:', error);
    return { entityName: '', recordId: '' };
  }
}

// Initialize the content script
function initialize() {
  if (isDynamicsCrmPage()) {
    console.log('Dynamics CRM Toolkit: Content script initialized');
    
    // Notify the popup that we're on a Dynamics CRM page
    chrome.runtime.sendMessage({
      action: 'dynamicsDetected',
      url: window.location.href
    });
    
    // Check if we're on a record form
    if (isRecordForm()) {
      const { entityName, recordId } = getCurrentRecordInfo();
      
      if (entityName && recordId) {
        chrome.runtime.sendMessage({
          action: 'recordFormDetected',
          entityName,
          recordId
        });
      }
    }
  }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Respond to ping to indicate content script is loaded
  if (message.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }
  
  // Execute a query
  if (message.action === 'executeQuery') {
    console.log('Executing query:', message.parsedQuery);
    
    executeQuery(message.parsedQuery)
      .then(result => {
        console.log('Query result:', result);
        sendResponse({ result });
      })
      .catch(error => {
        console.error('Query error:', error);
        sendResponse({ error: error.message });
      });
    
    return true; // Indicate async response
  }
  
  // Check current page
  if (message.action === 'checkCurrentPage') {
    const isDynamicsCrm = isDynamicsCrmPage();
    let isRecordFormPage = false;
    let entityName = '';
    let recordId = '';
    
    if (isDynamicsCrm) {
      isRecordFormPage = isRecordForm();
      console.log('Is record form page:', isRecordFormPage);
      
      if (isRecordFormPage) {
        const recordInfo = getCurrentRecordInfo();
        entityName = recordInfo.entityName;
        recordId = recordInfo.recordId;
        console.log('Record info:', { entityName, recordId });
      }
    }
    
    const response = {
      isDynamicsCrm,
      isRecordForm: isRecordFormPage,
      entityName,
      recordId
    };
    
    console.log('Sending response to checkCurrentPage:', response);
    sendResponse(response);
    
    return true;
  }
  
  // Fetch record data
  if (message.action === 'fetchRecordData') {
    const { entityName, recordId } = message;
    
    fetchRecordData(entityName, recordId)
      .then(record => {
        sendResponse({ record });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    
    return true; // Indicate async response
  }
});

// Add this function to content.js
async function fetchRecordData(entityName, recordId) {
  try {
    const url = `${getClientUrl()}/api/data/v9.2/${entityName}(${recordId})?$select=*`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching record data:', error);
    throw error;
  }
}

// Initialize the content script
initialize(); 