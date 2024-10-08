const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const clc = require('cli-color');

const resultsDir = path.join(__dirname, 'results_list');
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir);
}

async function fetchPageWithRetry(pageNumber, pageSize = 100, maxRetries = 3) {
    const resultMax = pageNumber === 1 ? 0 : (pageNumber - 1) * pageSize;
    const data = `searchString=&pageSize=${pageSize}&resultMax=${resultMax}`;
    console.log(clc.blue(`Fetching page ${pageNumber}...`));
    console.log(data)
    const config = {
        method: 'post',
        url: 'https://client.schwab.com/public/consultant/searchByName/',
        headers: { 
            'accept': '*/*', 
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 
            'origin': 'https://client.schwab.com', 
            'referer': 'https://client.schwab.com/public/consultant/find', 
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 
            'x-requested-with': 'XMLHttpRequest', 
        },
        data: data,
    };
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.request(config);
            const responseSizeKB = JSON.stringify(response.data).length / 1024;
            console.log(clc.magenta(`Response size: ${responseSizeKB.toFixed(2)} KB`));
            return response.data;
        } catch (error) {
            console.error(clc.yellow(`Attempt ${attempt} failed for page ${pageNumber}:`, error.message));
            if (attempt === maxRetries) {
                throw new Error(`Failed to fetch page ${pageNumber} after ${maxRetries} attempts`);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}
const logMemoryUsage = () => {
    const used = process.memoryUsage();
    console.log(clc.cyan('Memory usage:'));
    for (let key in used) {
        console.log(clc.cyan(`  ${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`));
    }
};

// Set up interval to log memory usage every 10 seconds
const memoryLoggingInterval = setInterval(logMemoryUsage, 10000);

// Make sure to clear the interval when the script is done
process.on('exit', () => {
    clearInterval(memoryLoggingInterval);
});

function parseConsultant($, element) {
    const consultant = {
        id: '',
        name: '',
        title: '',
        designation: '',
        locations: [],
        phoneNumbers: []
    };

    const nameElement = $(element).find('#fcDisplayName');
    consultant.name = nameElement.text().trim();
    const href = nameElement.attr('href');
    consultant.id = href ? href.match(/'([^']+)'/)[1] : '';

    consultant.title = $(element).find('#fcJobTitle').text().trim();
    consultant.designation = $(element).find('#fcDesignation').text().trim();

    $(element).find('.mapSpan').each((i, loc) => {
        const fullAddress = $(loc).text().trim().replace(/\s+/g, ' ');
        const [branch, ...rest] = fullAddress.split('.');
        const addressParts = rest.join('.').trim().split(/,\s*/);
        
        let address, city, state, zip;
        if (addressParts.length >= 3) {
            address = addressParts[0];
            city = addressParts[1];
            [state, zip] = addressParts[2].split(/\s+/);
        } else if (addressParts.length === 2) {
            address = addressParts[0];
            [city, state, zip] = addressParts[1].split(/\s+/);
        } else {
            [address, city, state, zip] = addressParts[0].split(/\s+/);
        }

        consultant.locations.push({ 
            branch: branch.trim(), 
            address: address?.trim(), 
            city: city?.trim(), 
            state: state?.trim(), 
            zip: zip?.trim() 
        });
    });

    $(element).find('.telSpan').each((i, phone) => {
        consultant.phoneNumbers.push($(phone).text().trim());
    });

    return consultant;
}

function parseHtml(html) {
    const $ = cheerio.load(html);
    const consultants = [];
    $('#fcSearchResult').each((index, element) => {
        consultants.push(parseConsultant($, element));
    });
    return consultants;
}

function prepareConsultantData(consultants) {
    return consultants.map(consultant => ({
        ID: consultant.id,
        Name: consultant.name,
        Title: consultant.title,
        Designation: consultant.designation,
        Locations: consultant.locations.map(loc => 
            Object.values(loc).filter(Boolean).join(' ')
        ).join('; '),
        PhoneNumbers: consultant.phoneNumbers.join('; ')
    }));
}

async function saveToFile(data, filename, format = 'json') {
    const filePath = path.join(resultsDir, filename);
    if (format === 'json') {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } else if (format === 'csv') {
        const csvWriter = createCsvWriter({
            path: filePath,
            header: Object.keys(data[0]).map(id => ({id, title: id}))
        });
        await csvWriter.writeRecords(data);
    }
    console.log(clc.green(`${format.toUpperCase()} file has been saved to: ${filePath}`));
}



function removeDuplicates(consultants) {
    const uniqueConsultants = new Map();
    for (const consultant of consultants) {
        if (!uniqueConsultants.has(consultant.id)) {
            uniqueConsultants.set(consultant.id, consultant);
        }
    }
    return Array.from(uniqueConsultants.values());
}

async function scrapeConsultantsList() {
    console.log(clc.magenta(`Starting scraper for all consultants...`));
    
    let allConsultants = [];
    let pageNumber = 1;

    try {
        const startTime = Date.now();

        while (true) {
            console.log(clc.green.bold(`\nFetching page ${pageNumber}`));
            const html = await fetchPageWithRetry(pageNumber);
            const consultants = parseHtml(html);
            
            if (consultants.length === 0) {
                console.log(clc.yellow(`No more consultants found on page ${pageNumber}. Finishing scrape.`));
                break;
            }
            
            allConsultants = allConsultants.concat(consultants);
            console.log(clc.cyan(`Page ${pageNumber}: Found ${consultants.length} consultants. Total: ${allConsultants.length}`));
            
            await saveToFile(consultants, `consultants_page_${pageNumber}.json`);
            await saveToFile(prepareConsultantData(consultants), `consultants_page_${pageNumber}.csv`, 'csv');
            
            pageNumber++;
        }

        const endTime = Date.now();
        
        if (allConsultants.length > 0) {
            console.log(clc.yellow(`Removing duplicates...`));
            const uniqueConsultants = removeDuplicates(allConsultants);
            console.log(clc.yellow(`Duplicates removed. Unique consultants: ${uniqueConsultants.length}`));

            await saveToFile(uniqueConsultants, 'all_consultants_list_unique.json');
            await saveToFile(prepareConsultantData(uniqueConsultants), 'all_consultants_list_unique.csv', 'csv');
            
            console.log(clc.green.bold(`\nScraping completed successfully!`));
            console.log(clc.cyan(`Total unique consultants scraped: ${uniqueConsultants.length}`));
            console.log(clc.cyan(`Time taken: ${((endTime - startTime) / 1000).toFixed(2)} seconds`));
        } else {
            console.log(clc.yellow(`No consultants were scraped. Please check if the website structure has changed or if there are any access issues.`));
        }
    } catch (error) {
        console.error(clc.red('An error occurred:'), error);
    }
}


// Usage: node script.js
scrapeConsultantsList();