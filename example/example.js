// Reference: https://github.com/stephenberry/beve

const fs = require('fs');

const beve = require('../javascript/beve.js');

// Function to read the .beve file into a buffer
function loadFileToBuffer(filename) {
    if (!filename) {
        throw new Error('No filename provided.');
    }

    const buffer = fs.readFileSync(filename);
    return new Uint8Array(buffer);
}

try {
    const filename = './example.beve';
    const buffer = loadFileToBuffer(filename);
    const data = beve.read_beve(buffer);
    console.log(data);
    //console.log(JSON.stringify(data));
    //write_beve(data, '../example/examplejs.beve');
} catch (error) {
    console.error('Error reading .beve file:', error);
}