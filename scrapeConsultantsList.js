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

async function fetchPageWithRetry(searchString, pageNumber, pageSize = 300, maxRetries = 3) {
    const resultMax = pageNumber * pageSize;
    const data = `searchString=${searchString}&pageSize=${pageSize}&resultMax=${resultMax}`;
    console.log(clc.blue(`Fetching page ${pageNumber} for letter '${searchString}'...`));
    
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

async function scrapeConsultantsForLetter(letter) {
    let allConsultants = [];
    let pageNumber = 1;

    while (true) {
        try {
            const html = await fetchPageWithRetry(letter, pageNumber);
            const consultants = parseHtml(html);
            
            if (consultants.length === 0) {
                console.log(clc.yellow(`No more consultants found for letter '${letter}' on page ${pageNumber}. Moving to next letter.`));
                break;
            }
            
            allConsultants = allConsultants.concat(consultants);
            console.log(clc.cyan(`Letter '${letter}', Page ${pageNumber}: Found ${consultants.length} consultants. Total for letter: ${allConsultants.length}`));
            
            await saveToFile(consultants, `consultants_${letter}_page_${pageNumber}.json`);
            await saveToFile(prepareConsultantData(consultants), `consultants_${letter}_page_${pageNumber}.csv`, 'csv');
            
            pageNumber++;
        } catch (error) {
            console.error(clc.red(`Error processing page ${pageNumber} for letter '${letter}':`), error);
            break;
        }
    }

    return allConsultants;
}

async function scrapeConsultantsList() {
    console.log(clc.magenta(`Starting scraper for all alphabets...`));
    
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let allConsultants = [];

    try {
        const startTime = Date.now();

        for (const letter of alphabet) {
            console.log(clc.green.bold(`\nStarting scrape for letter '${letter}'`));
            const consultantsForLetter = await scrapeConsultantsForLetter(letter);
            allConsultants = allConsultants.concat(consultantsForLetter);
            console.log(clc.green(`Finished scraping for letter '${letter}'. Total consultants: ${consultantsForLetter.length}`));
        }

        const endTime = Date.now();
        
        if (allConsultants.length > 0) {
            await saveToFile(allConsultants, 'all_consultants_list.json');
            await saveToFile(prepareConsultantData(allConsultants), 'all_consultants_list.csv', 'csv');
            
            console.log(clc.green.bold(`\nScraping completed successfully!`));
            console.log(clc.cyan(`Total consultants scraped: ${allConsultants.length}`));
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