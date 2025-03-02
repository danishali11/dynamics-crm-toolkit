# Dynamics CRM SQL Query Extension

A browser extension that allows users to query Microsoft Dynamics CRM/Dataverse using SQL-like syntax directly from their browser.

## Features

- **SQL Query Interface**: Write SQL-like queries to retrieve data from Dynamics CRM
- **Record Inspector**: View all fields for any record in your Dynamics CRM instance
- **Export Functionality**: Export query results to CSV
- **Intuitive UI**: Clean, minimal interface for easy use

## Installation

### Chrome/Edge
1. Download or clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions` or `edge://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist` folder from this repository

## Usage

### SQL Query Tool
- Navigate to your Dynamics CRM instance
- Click the extension icon
- Enter a SQL-like query in the text area
- Click "Execute" to run the query

Example queries:

### Record Inspector
- Navigate to a record in Dynamics CRM
- Click the extension icon
- Click "View All Fields" to see all fields for the current record

## Development

### Prerequisites
- Node.js and npm

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Build the extension: `npm run build`
4. For development with auto-rebuild: `npm run dev`

## Security
- The extension uses your existing Dynamics CRM authentication
- No credentials are stored by the extension
- All queries are executed in the context of your current user permissions

## License
MIT License - See LICENSE file for details

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.