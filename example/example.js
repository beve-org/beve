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
    var data = beve.read_beve(buffer);
    /*delete data['fixed_object'];
    delete data['fixed_name_object'];
    delete data['another_object']['string'];
    delete data['another_object']['another_string'];
    delete data['another_object']['boolean'];*/
    console.log(data);
    console.log('--------------');
    console.log('              ');
    //console.log(JSON.stringify(data));
    //write_beve(data, '../example/examplejs.beve');
    const binary = beve.write_beve(data);
    data = beve.read_beve(binary);
    console.log(data);
} catch (error) {
    console.error('Error:', error);
}