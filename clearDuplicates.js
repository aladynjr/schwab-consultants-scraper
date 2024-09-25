const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'results_list', 'all_consultants_list.json');
const outputFile = path.join(__dirname, 'results_list', 'all_consultants_list_removed_duplicates.json');

// Read the JSON file
fs.readFile(inputFile, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading file:', err);
        return;
    }

    // Parse the JSON data
    const consultants = JSON.parse(data);

    // Log the count before removing duplicates
    console.log('Number of consultants before removing duplicates:', consultants.length);

    // Remove duplicates based on the 'id' field
    const uniqueConsultants = Array.from(
        new Map(consultants.map(item => [item.id, item])).values()
    );

    // Log the count after removing duplicates
    console.log('Number of consultants after removing duplicates:', uniqueConsultants.length);

    // Write the unique consultants to a new file
    fs.writeFile(outputFile, JSON.stringify(uniqueConsultants, null, 2), (err) => {
        if (err) {
            console.error('Error writing file:', err);
            return;
        }
        console.log('File saved successfully:', outputFile);
    });
});
