
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const HttpsProxyAgent = require('https-proxy-agent');
const clc = require('cli-color');
const pLimit = require('p-limit');

const proxyHost = process.env.PROXY_HOST || 'shared-datacenter.geonode.com';
const proxyPort = Math.floor(Math.random() * 11 + 9000).toString();
const proxyUser = process.env.PROXY_USER || 'geonode_9JCPZiW1CD';
const proxyPass = process.env.PROXY_PASS || 'e6c374e4-13ed-4f4a-9ed1-8f31e7920485';

const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;

const axiosInstance = axios.create({
    proxy: false,
  // httpsAgent: new HttpsProxyAgent(proxyUrl)
});

const resultsDir = path.join(__dirname, 'results_details');

async function retryRequest(config, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axiosInstance.request(config);
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Attempt ${i + 1} failed. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        }
    }
}

async function scrapeConsultantDetails(id) {
    console.log(clc.blue(`Scraping details for consultant ID: ${id}`));
    let config = {
        method: 'get',
        url: `https://www.schwab.com/app/branch-services/financial-consultant/${id}`,
        headers: { 
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7', 
            'accept-language': 'en-US,en;q=0.9,be;q=0.8,ar;q=0.7', 
            'cache-control': 'no-cache', 
            'dnt': '1', 
            'upgrade-insecure-requests': '1', 
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 
        }
    };

    try {
        const response = await retryRequest(config);
        const $ = cheerio.load(response.data);
        
        const financialCredentials = $('#_Financial_credentials > div > div > div > div > ul').children().map((i, el) => $(el).text()).get();
        
        const experienceText = $('#_Experience > div > div > div > div').text();
        const experienceYears = experienceText.match(/(\d+) years of professional experience/)?.[1];
        const experienceList = $('#_Experience > div > div > div > div ul').children().map((i, el) => $(el).text()).get();

        const education = $('#_Education > div > div > div > div > ul').children().map((i, el) => $(el).text()).get();

        const branchDetails = $('#_Branch_information-body > div > div').text().trim().split('\n').map(line => line.trim());
        const branchHref = $('#_Branch_information').attr('href');

        return {
            financialCredentials,
            experience: {
                years: experienceYears,
                positions: experienceList
            },
            education,
            branchInformation: {
                details: branchDetails,
                mapLink: branchHref
            }
        };
    } catch (error) {
        console.error(clc.red(`Error scraping details for consultant ${id}:`), error);
        throw error;
    }
}


function prepareConsultantData(consultant) {
    return {
        ID: consultant.id,
        Name: consultant.name,
        Title: consultant.title,
        Designation: consultant.designation,
        Locations: consultant.locations.map(loc => 
            Object.values(loc).filter(Boolean).join(' ')
        ).join('; '),
        PhoneNumbers: consultant.phoneNumbers.join('; '),
        FinancialCredentials: consultant.scrapedDetails?.financialCredentials?.join('; ') || '',
        ExperienceYears: consultant.scrapedDetails?.experience?.years || '',
        ExperiencePositions: consultant.scrapedDetails?.experience?.positions?.join('; ') || '',
        Education: consultant.scrapedDetails?.education?.join('; ') || '',
        BranchInformation: consultant.scrapedDetails?.branchInformation?.details?.join(' ') || '',
        BranchMapLink: consultant.scrapedDetails?.branchInformation?.mapLink || ''
    };
}

async function saveToFile(data, filename, format = 'json') {
    await fs.mkdir(resultsDir, { recursive: true });
    const filePath = path.join(resultsDir, filename);

    if (format === 'json') {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } else if (format === 'csv') {
        const csvWriter = createCsvWriter({
            path: filePath,
            header: Object.keys(data[0]).map(id => ({id, title: id}))
        });
        await csvWriter.writeRecords(data);
    }
    console.log(`${format.toUpperCase()} file has been saved to: ${filePath}`);
}

async function scrapeAllConsultantsDetails(consultantData) {
    const results = [];
    const totalConsultants = consultantData.length;
    const limit = pLimit(20); // Limit to 5 concurrent requests
    let completedCount = 0;
    let startTime = Date.now();

    const formatTime = (timeInSeconds) => {
        const hours = Math.floor(timeInSeconds / 3600);
        const minutes = Math.floor((timeInSeconds % 3600) / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        
        let timeString = '';
        if (hours > 0) timeString += `${hours}h `;
        if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
        timeString += `${seconds}s`;
        
        return timeString.trim();
    };

    const updateProgress = () => {
        completedCount++;
        const percentage = (completedCount / totalConsultants * 100).toFixed(2);
        const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
        const estimatedTotalTime = (elapsedTime / completedCount) * totalConsultants;
        const estimatedTimeLeft = Math.max(0, estimatedTotalTime - elapsedTime);

        process.stdout.write(
            clc.cyan(`\rProgress: ${percentage}% (${completedCount}/${totalConsultants})`) +
            clc.yellow(` Estimated time left: ${formatTime(estimatedTimeLeft)}`)
        );
    };

    const scrapePromises = consultantData.map(consultant => 
        limit(async () => {
            try {
                const details = await scrapeConsultantDetails(consultant.id);
                const combinedData = {
                    ...consultant,
                    scrapedDetails: details
                };
                results.push(combinedData);
                
                await saveToFile([combinedData], `${consultant.id}.json`);
                await saveToFile([prepareConsultantData(combinedData)], `${consultant.id}.csv`, 'csv');
                
                updateProgress();
                console.log(clc.green(`\n  ✓ Saved details for ${consultant.name}`));
            } catch (error) {
                console.error(clc.red(`\n  ✗ Error scraping details for ${consultant.name} (ID: ${consultant.id}):`, error.message));
                results.push({
                    ...consultant,
                    scrapedDetails: null,
                    error: error.message
                });
                updateProgress();
            }
        })
    );

    await Promise.all(scrapePromises);
    console.log('\n'); // New line after progress bar
    return results;
}




async function saveConsolidatedFiles(results) {
    const preparedResults = results.map(prepareConsultantData);
    await saveToFile(results, 'all_consultants_details.json');
    await saveToFile(preparedResults, 'all_consultants_details.csv', 'csv');
}
async function loadConsultantData() {
    const dataPath = path.join(__dirname, 'results_list', 'all_consultants_list_unique.json');
    try {
        const rawData = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error('Error loading consultant data:', error);
        throw error;
    }
}

async function scrapeConsultantsDetails() {
    try {
        console.log(clc.cyan('Starting consultant details scraper...'));
        const startTime = Date.now();

        const consultantData = await loadConsultantData();
        console.log(clc.yellow(`Loaded ${consultantData.length} consultants from file.`));

        const allDetails = await scrapeAllConsultantsDetails(consultantData);
        await saveConsolidatedFiles(allDetails);

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        console.log(clc.green.bold(`\nScraping completed successfully!`));
        console.log(clc.cyan(`Total consultants processed: ${allDetails.length}`));
        console.log(clc.cyan(`Time taken: ${duration.toFixed(2)} seconds`));
    } catch (error) {
        console.error(clc.red('Error in main function:'), error);
    }

}


scrapeConsultantsDetails();