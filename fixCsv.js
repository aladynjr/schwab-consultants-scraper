const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');

const inputFile = path.join(__dirname, 'results_details', 'all_consultants_details.csv');
const outputFile = path.join(__dirname, 'results_details', 'all_consultants_details_new.csv');
const results = [];
fs.createReadStream(inputFile)
  .pipe(csv())
  .on('data', (data) => results.push(data))
  .on('end', () => {
    const modifiedResults = results.map(row => {
      // Create the details_url at the beginning
      const newRow = {
        details_url: `https://www.schwab.com/app/branch-services/financial-consultant/${row.ID}`,
        ...row
      };

      if (newRow.BranchInformation) {
        // Remove "Branch details:" and any leading/trailing whitespace
        let processedInfo = newRow.BranchInformation.replace(/^Branch details:/, '').trim();
        
        // Function to add space before capitalized letters
        const addSpaceBeforeCapitals = (str) => {
          return str.replace(/([a-z0-9])([A-Z])/g, (match, p1, p2) => {
            // Don't add space if the current capital letter is preceded by another capital
            if (p1.match(/[A-Z]/)) {
              return match;
            }
            return `${p1} ${p2}`;
          });
        };

        // Process the string
        processedInfo = addSpaceBeforeCapitals(processedInfo);

        // Add space after "Suite" if it's followed by "#"
        processedInfo = processedInfo.replace(/Suite#/g, 'Suite #');

        // Add space before numbers if they're not preceded by a space or another number
        processedInfo = processedInfo.replace(/([^\s0-9])(\d)/g, '$1 $2');

        // Remove any double spaces that might have been introduced
        processedInfo = processedInfo.replace(/\s+/g, ' ').trim();

        // Handle the edge case: add space 14 characters from the end
        processedInfo = processedInfo.replace(/(.{14})$/, ' $1');

        newRow.BranchInformation = processedInfo;
      }

      return newRow;
    });

    const csvWriter = createCsvWriter({
      path: outputFile,
      header: Object.keys(modifiedResults[0]).map(id => ({id, title: id}))
    });

    csvWriter.writeRecords(modifiedResults)
      .then(() => console.log('The CSV file was written successfully'));
  });
