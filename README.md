# Schwab Consultant Scraper 🕵️‍♂️

This project consists of two Node.js scripts that scrape financial consultant information from the Charles Schwab website. The scraper collects both list data and detailed information for each consultant.

<img src="images/website.png" alt="Charles Schwab Website Screenshot" width="600">


## Features

- Scrapes consultant list data including name, title, designation, locations, and phone numbers
- Scrapes detailed information for each consultant including financial credentials, experience, education, and branch information
- Handles pagination and retries failed requests
- Saves data in both JSON and CSV formats
- Implements concurrent scraping with rate limiting
- Provides progress updates and estimated time remaining

## Data Scraped

This scraper collects comprehensive information about financial consultants, including:

- Consultant ID
- Name
- Title
- Designation
- Locations
- Phone Numbers
- Financial Credentials
- Years of Experience
- Past Positions
- Education
- Branch Information
- Branch Map Link

## View Scraped Data 📊

If you want to see an example of the data outputted by this scraper without running it yourself, you can view a sample in this Google Sheets document:

[**View Schwab Consultant Scraped Data Sample**](https://docs.google.com/spreadsheets/d/1ppm5BN0FlrA-6e8P86MK-Aj0dJOR2pS15ncQSw1EAEU/edit?gid=0#gid=0)

This document provides a clear representation of the data fields and format of the information collected by the scraper.

## Prerequisites

- Node.js (version 12 or higher recommended)
- npm (Node Package Manager)

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/your-username/schwab-consultant-scraper.git
   cd schwab-consultant-scraper
   ```

2. Install the required dependencies:
   ```
   npm install
   ```

## Usage

1. Run the list scraper:
   ```
   node scrape_list.js
   ```
   This will create a `results_list` directory with JSON and CSV files for each page of results, as well as a combined file of all unique consultants.

2. Run the details scraper:
   ```
   node scrape_details.js
   ```
   This will create a `results_details` directory with individual JSON and CSV files for each consultant, as well as combined files with all consultant details.

## Configuration

- Proxy settings can be configured using environment variables:
  - `PROXY_HOST`
  - `PROXY_USER`
  - `PROXY_PASS`

- The number of concurrent requests can be adjusted by modifying the `pLimit` value in `scrape_details.js`.

## Output

- `results_list`: Contains JSON and CSV files for each page of the consultant list, and a combined file of all unique consultants.
- `results_details`: Contains individual JSON and CSV files for each consultant's details, and combined files with all consultant details.

## Customization

As this project was developed for a specific client, you may need to customize it for your own use case. Areas that might require modification include:

- The URL and structure of the target website
- The specific data fields being scraped
- The format of the output files
- Rate limiting and request patterns to comply with the website's terms of service

Please review and test the code thoroughly before using it for your own purposes.

## Notes

- This scraper is designed for educational purposes and should be used responsibly and in accordance with the website's terms of service.
- Be mindful of rate limiting and consider adding delays between requests to avoid overloading the server.
- Always ensure you have the right to scrape the target website and that you're complying with all relevant laws and regulations.

## License

[MIT License](LICENSE)