const expect = require('chai').expect;
const parse = require('../parser').parse;

const expectedOutput = {}

describe('parse()', function () {
    it('should return array of results', async function () {
        
        var pathToTestFiles = "./test/testdata";

        var arrayOfResults = await parse(pathToTestFiles, {})

        console.log(arrayOfResults)

        expect(arrayOfResults).to.be.equal(expectedOutput)
    });
});